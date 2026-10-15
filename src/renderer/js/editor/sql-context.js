// Lightweight SQL analysis for autocomplete. Pure: no DOM, importable from Node tests.
// Not a parser: it tokenizes, finds the statement under the cursor, the tables it
// references (with aliases) and what kind of name is being typed.

const WORD = /[A-Za-z_][\w$]*/y;
const NUMBER = /\d[\w.]*/y;

/**
 * @typedef {{ type: 'word'|'ident'|'string'|'comment'|'number'|'punct', value: string, start: number, end: number, open?: boolean }} Token
 * `ident` is a quoted identifier, its value unquoted. `open` marks an unterminated string/comment/ident.
 */

/** @returns {Token[]} */
export function tokenize(sql) {
  const out = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    if (/\s/.test(ch)) { i++; continue; }
    const start = i;
    if (ch === '-' && sql[i + 1] === '-') {
      const e = sql.indexOf('\n', i);
      i = e < 0 ? n : e;
      out.push({ type: 'comment', value: sql.slice(start, i), start, end: i, open: e < 0 });
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      const e = sql.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
      out.push({ type: 'comment', value: sql.slice(start, i), start, end: i, open: e < 0 });
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      i++;
      let closed = false;
      while (i < n) {
        if (sql[i] === ch) {
          if (sql[i + 1] === ch) { i += 2; continue; } // doubled quote = escaped
          i++; closed = true; break;
        }
        if (ch === "'" && sql[i] === '\\') i++; // MySQL backslash escapes
        i++;
      }
      const raw = sql.slice(start + 1, closed ? i - 1 : i);
      if (ch === "'") out.push({ type: 'string', value: raw, start, end: i, open: !closed });
      else out.push({ type: 'ident', value: raw.split(ch + ch).join(ch), start, end: i, open: !closed });
      continue;
    }
    WORD.lastIndex = i;
    let m = WORD.exec(sql);
    if (m) { i += m[0].length; out.push({ type: 'word', value: m[0], start, end: i }); continue; }
    NUMBER.lastIndex = i;
    m = NUMBER.exec(sql);
    if (m) { i += m[0].length; out.push({ type: 'number', value: m[0], start, end: i }); continue; }
    i++;
    out.push({ type: 'punct', value: ch, start, end: i });
  }
  return out;
}

const isName = (t) => t && (t.type === 'word' || t.type === 'ident');
const kw = (t, ...words) => t && t.type === 'word' && words.includes(t.value.toLowerCase());

/** Words that end a table reference: they can't be an alias. */
const NOT_ALIAS = new Set([
  'where', 'join', 'inner', 'left', 'right', 'full', 'outer', 'cross', 'natural', 'lateral', 'on', 'using',
  'group', 'order', 'limit', 'offset', 'having', 'union', 'intersect', 'except', 'window', 'set', 'values',
  'select', 'returning', 'fetch', 'for', 'and', 'or', 'as', 'default', 'from', 'into', 'straight_join',
]);
const TABLE_KEYWORDS = ['from', 'join', 'into', 'update', 'table', 'straight_join'];

/** Tokens of the statement containing `pos` (statements are split on `;`). */
export function statementTokens(tokens, pos) {
  let from = 0, to = tokens.length;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'punct' || t.value !== ';') continue;
    if (t.end <= pos) from = i + 1;
    else { to = i; break; }
  }
  return tokens.slice(from, to);
}

/** Reads `a.b.c` starting at tokens[i]. @returns {{ name: string, next: number } | null} */
function readQualified(tokens, i) {
  if (!isName(tokens[i])) return null;
  const parts = [tokens[i].value];
  let j = i + 1;
  while (tokens[j]?.value === '.' && isName(tokens[j + 1])) { parts.push(tokens[j + 1].value); j += 2; }
  return { name: parts.join('.'), next: j };
}

/**
 * Tables referenced by a statement: `from a x, b as y join c on …`, `update t`, `insert into t`.
 * @returns {{ table: string, alias: string | null }[]}
 */
export function tableRefs(tokens) {
  const refs = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!kw(tokens[i], ...TABLE_KEYWORDS)) continue;
    const list = kw(tokens[i], 'from'); // only FROM takes comma separated tables
    let j = i + 1;
    for (;;) {
      if (kw(tokens[j], 'only', 'lateral')) j++;
      const q = readQualified(tokens, j);
      if (!q || NOT_ALIAS.has(q.name.toLowerCase())) break;
      j = q.next;
      let alias = null;
      if (kw(tokens[j], 'as')) j++;
      if (isName(tokens[j]) && !(tokens[j].type === 'word' && NOT_ALIAS.has(tokens[j].value.toLowerCase()))) { alias = tokens[j].value; j++; }
      refs.push({ table: q.name, alias });
      if (!list || tokens[j]?.value !== ',') break;
      j++;
    }
    i = j - 1;
  }
  return refs;
}

/**
 * What is being typed at `pos`.
 * @returns {null | {
 *   prefix: string, start: number, end: number,   // replace sql.slice(start, end) by the completion
 *   qualifier: string | null,                       // `u` in `u.na|`, `public` in `public.us|`
 *   mode: 'table' | 'column' | 'member' | 'alias',
 *   quoted: boolean,                                // typing inside "…" or `…`
 *   refs: { table: string, alias: string | null }[],
 * }} null when completion makes no sense (inside a string or a comment)
 */
export function completionContext(sql, pos) {
  const tokens = tokenize(sql);
  const inside = tokens.find((t) => t.start < pos && (pos < t.end || (t.open && pos === t.end)));
  if (inside && (inside.type === 'string' || inside.type === 'comment')) return null;

  let start = pos, quoted = false;
  if (inside && inside.type === 'ident') { start = inside.start + 1; quoted = true; }
  else { while (start > 0 && /[\w$]/.test(sql[start - 1])) start--; }
  let end = pos;
  if (quoted) end = inside.open ? pos : inside.end - 1;
  else while (end < sql.length && /[\w$]/.test(sql[end])) end++;
  const prefix = sql.slice(start, pos);
  if (!quoted && /^\d/.test(prefix)) return null;

  const before = tokens.filter((t) => t.end <= (quoted ? start - 1 : start));
  const stmt = statementTokens(tokens, pos);
  const refs = tableRefs(stmt);

  // qualifier: `name.` (possibly `schema.table.`) right before the prefix
  let qualifier = null;
  let k = before.length - 1;
  if (before[k]?.value === '.' && before[k].end === (quoted ? start - 1 : start)) {
    const parts = [];
    while (before[k]?.value === '.' && isName(before[k - 1]) && before[k - 1].end === before[k].start) {
      parts.unshift(before[k - 1].value); k -= 2;
    }
    if (parts.length) qualifier = parts.join('.');
  }
  if (qualifier) return { prefix, start, end, qualifier, mode: 'member', quoted, refs };

  const prev = before[k];
  let mode = 'column';
  if (kw(prev, ...TABLE_KEYWORDS) || kw(prev, 'only')) mode = 'table';
  else if (prev?.value === ',' && lastClause(before) === 'from') mode = 'table';
  else if (isName(prev) && !kw(prev, 'select', 'where', 'and', 'or', 'on', 'by', 'not', 'set', 'distinct', 'having', 'when', 'then', 'else', 'case')) {
    // `from users u|` or `select id na|`: an alias, a keyword is the most likely thing typed
    const clause = lastClause(before);
    if (clause === 'from' || clause === 'join' || isName(before[k - 1]) || before[k - 1]?.value === ')') mode = 'alias';
  }
  return { prefix, start, end, qualifier: null, mode, quoted, refs };
}

/** Last clause keyword before the cursor, at parenthesis depth 0. */
function lastClause(before) {
  let depth = 0;
  for (let i = before.length - 1; i >= 0; i--) {
    const t = before[i];
    if (t.value === ')') depth++;
    else if (t.value === '(') { if (depth === 0) return '('; depth--; }
    else if (depth === 0 && kw(t, 'select', 'from', 'join', 'where', 'on', 'group', 'order', 'having', 'set', 'values', 'limit', 'into', 'update', 'returning')) return t.value.toLowerCase();
  }
  return null;
}
