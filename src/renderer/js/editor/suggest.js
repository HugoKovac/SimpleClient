// Turns a completion context (sql-context.js) and the known schema into ranked suggestions. Pure.
import { fuzzy } from '../palette/fuzzy.js';
import { quoteIdent, shortType } from '../lib/format.js';

export const KEYWORDS = [
  'select', 'from', 'where', 'and', 'or', 'not', 'in', 'is', 'null', 'like', 'ilike', 'between', 'exists',
  'join', 'left join', 'inner join', 'on', 'as', 'group by', 'order by', 'having', 'limit', 'offset',
  'asc', 'desc', 'distinct', 'count', 'case', 'when', 'then', 'else', 'end', 'union', 'insert into',
  'values', 'update', 'set', 'delete from', 'returning', 'with', 'true', 'false',
];

/** Words that must be quoted to be used as identifiers. */
const RESERVED = new Set(['user', 'order', 'group', 'table', 'select', 'from', 'where', 'limit', 'offset', 'desc', 'asc', 'end', 'default', 'check', 'column', 'key', 'index', 'to', 'by', 'in', 'is', 'on', 'or', 'and', 'not', 'as', 'all', 'case', 'when', 'then', 'else']);

/** Identifier as it must be written in SQL for this dialect (quoted only when needed). */
export function sqlName(name, dialect) {
  const plain = dialect === 'postgres' ? /^[a-z_][a-z0-9_$]*$/ : /^[A-Za-z_][A-Za-z0-9_$]*$/;
  return plain.test(name) && !RESERVED.has(name.toLowerCase()) ? name : quoteIdent(dialect, name);
}

const lastPart = (name) => name.slice(name.lastIndexOf('.') + 1);

/**
 * Finds the schema table a SQL reference points to: exact name, case-insensitive,
 * `public.x` → `x` (Postgres display names), or by last segment.
 */
export function resolveTable(ref, tables) {
  const names = tables.map((t) => t.name);
  const l = ref.toLowerCase();
  return names.find((n) => n === ref)
    ?? names.find((n) => n.toLowerCase() === l)
    ?? names.find((n) => n.toLowerCase() === l.replace(/^public\./, ''))
    ?? names.find((n) => lastPart(n).toLowerCase() === lastPart(l))
    ?? null;
}

/**
 * Tables whose columns are needed to complete `ctx`.
 * @param {ReturnType<import('./sql-context.js').completionContext>} ctx
 * @param {{ name: string }[]} tables
 * @returns {string[]} schema table names
 */
export function tablesNeeded(ctx, tables) {
  if (!ctx) return [];
  if (ctx.mode === 'member') {
    const t = memberTable(ctx, tables);
    return t ? [t] : [];
  }
  if (ctx.mode !== 'column') return [];
  return [...new Set(ctx.refs.map((r) => resolveTable(r.table, tables)).filter(Boolean))];
}

function memberTable(ctx, tables) {
  const q = ctx.qualifier.toLowerCase();
  const ref = ctx.refs.find((r) => r.alias?.toLowerCase() === q) ?? ctx.refs.find((r) => !r.alias && lastPart(r.table).toLowerCase() === lastPart(q));
  return resolveTable(ref ? ref.table : ctx.qualifier, tables);
}

/**
 * @param {ReturnType<import('./sql-context.js').completionContext>} ctx
 * @param {{ dialect: string, tables: { name: string, kind?: string }[], columns: Map<string, { name: string, type?: string, pk?: boolean }[]> }} schema
 * @param {{ limit?: number }} [opts]
 * @returns {{ label: string, insert: string, detail: string, kind: 'column'|'table'|'alias'|'keyword', score: number, idx: number[] }[]}
 */
export function suggest(ctx, schema, { limit = 50 } = {}) {
  if (!ctx) return [];
  const { dialect, tables, columns } = schema;
  const items = [];
  const add = (label, insert, detail, kind, bonus = 0) => items.push({ label, insert, detail, kind, bonus });
  const name = (n) => (ctx.quoted ? n : sqlName(n, dialect));
  const addColumns = (table, detail) => {
    for (const c of columns.get(table) || []) {
      const type = shortType(c.type);
      add(c.name, name(c.name), detail ? `${type} · ${detail}` : type, 'column', 10);
    }
  };
  const addTables = (list, label = (t) => t.name) => {
    for (const t of list) add(label(t), label(t).split('.').map(name).join('.'), t.kind === 'view' ? 'vue' : 'table', 'table', 5);
  };

  if (ctx.mode === 'member') {
    const t = memberTable(ctx, tables);
    if (t) addColumns(t, '');
    else {
      // `schema.` → tables of that schema
      const pre = ctx.qualifier.toLowerCase() + '.';
      addTables(tables.filter((x) => x.name.toLowerCase().startsWith(pre)), (x) => x.name.slice(pre.length));
    }
  } else if (ctx.mode === 'table') {
    addTables(tables);
  } else if (ctx.mode === 'column') {
    const resolved = [...new Set(ctx.refs.map((r) => resolveTable(r.table, tables)).filter(Boolean))];
    for (const t of resolved) addColumns(t, resolved.length > 1 ? t : '');
    for (const r of ctx.refs) if (r.alias) add(r.alias, r.alias, r.table, 'alias', 2);
    if (!resolved.length) addTables(tables);
  }
  if (!ctx.quoted && (ctx.mode === 'column' || ctx.mode === 'alias') && ctx.prefix) {
    const upper = ctx.prefix === ctx.prefix.toUpperCase() && /[a-z]/i.test(ctx.prefix);
    for (const k of KEYWORDS) add(upper ? k.toUpperCase() : k, upper ? k.toUpperCase() : k, '', 'keyword', 0);
  }

  const q = ctx.prefix.toLowerCase();
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const dedupe = `${it.kind}|${it.label}|${it.detail}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    if (!q) { out.push({ ...it, score: it.bonus, idx: [] }); continue; }
    const m = fuzzy(q, it.label);
    if (!m) continue;
    // prefix matches first, then by kind, then fuzzy quality
    const prefix = it.label.toLowerCase().startsWith(q) ? 100 : 0;
    out.push({ ...it, score: prefix + it.bonus + m.score, idx: m.idx });
  }
  // without a prefix, keep the natural order (column ordinal position)
  out.sort((a, b) => b.score - a.score || (q ? a.label.localeCompare(b.label) : 0));
  return out.slice(0, limit).map(({ bonus: _bonus, ...it }) => it);
}
