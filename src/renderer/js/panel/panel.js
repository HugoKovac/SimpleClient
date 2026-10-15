// Right side panel of a table/query tab. Shows, for the selected cell:
//   fk    the referenced row (its own foreign keys are links, ← goes back)
//   json  the parsed JSON as a collapsible tree
//   value the full plain value
// Once open, it follows the grid selection (mouse or arrow keys).
import { api } from '../api.js';
import { $, spinner, toast } from '../lib/dom.js';
import { esc } from '../lib/html.js';
import { looksJson, parseJson, quoteIdent, shortType, sqlLiteral } from '../lib/format.js';
import { ICON } from '../lib/icons.js';
import * as storage from '../lib/storage.js';
import { connById } from '../state.js';
import { getMeta } from '../meta.js';
import { openTable } from '../tabs.js';
import { jsonTree } from './json-tree.js';

/** Wait before a foreign key lookup, so holding an arrow key doesn't fire one query per row. */
const FK_LOOKUP_DELAY = 90;

export const PANEL_HTML = `<aside class="panel hidden"><div class="panel-resize"></div>
  <div class="panel-head"><button class="icon-btn" data-p="back" title="Retour">${ICON.left}</button>
    <div class="panel-title"><div class="pt"></div><div class="ps"></div></div>
    <span class="panel-actions"></span>
    <button class="icon-btn" data-p="close" title="Fermer (esc)">${ICON.x}</button></div>
  <div class="panel-fields hidden"></div>
  <div class="panel-body"></div></aside>`;

const top = (t) => t.pstack[t.pstack.length - 1];
const fieldsKey = (e) => `fields.${e.connId}|${e.db}|${e.table}`;
const entryKey = (e) => JSON.stringify([e.kind, e.connId, e.db, e.table, e.col, e.value]);
const copyText = (v) => { const pj = looksJson(v) ? parseJson(v) : { ok: false }; return pj.ok ? JSON.stringify(pj.val, null, 2) : v === null ? 'NULL' : String(v); };

export const isPanelOpen = (t) => !!t.panel && !t.panel.classList.contains('hidden');

/** Wires the panel found in `el` to tab `t`. The view must define `t.cellEntry(r, c, kind)`. */
export function setupPanel(t, el) {
  const p = (t.panel = $('.panel', el));
  t.pstack = [];
  const w = storage.load('panelWidth'); if (w) p.style.width = w + 'px';
  p.addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    const a = b.dataset.p;
    const cur = top(t);
    if (a === 'close') panelClose(t);
    if (a === 'back') { t.pstack.pop(); panelRender(t); }
    if (a === 'fields') { t.showFields = !t.showFields; panelRender(t); }
    if (a === 'open' && cur) openTable(cur.connId, cur.db, cur.table, { where: `${quoteIdent(connById(cur.connId)?.type, cur.col)} = ${sqlLiteral(cur.value)}` });
    if (a === 'copy' && cur) { navigator.clipboard.writeText(copyText(cur.value)); toast('Copié'); }
    if (a === 'expand') p.querySelectorAll('.panel-body details').forEach((d) => (d.open = true));
    if (a === 'collapse') p.querySelectorAll('.panel-body details').forEach((d, i) => (d.open = i === 0));
    if (a === 'link') panelShow(t, JSON.parse(b.dataset.e), { push: true });
    if (a === 'json') { const f = cur.fields[+b.dataset.i]; panelShow(t, { kind: 'json', col: f.name, value: f.value }, { push: true }); }
    if (a === 'all' || a === 'none') { storage.save(fieldsKey(cur), a === 'all' ? [] : cur.columns.slice()); panelRender(t); }
  });
  p.addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-col]'); if (!cb) return;
    const cur = top(t);
    const hidden = new Set(storage.load(fieldsKey(cur)) || []);
    if (cb.checked) hidden.delete(cb.dataset.col); else hidden.add(cb.dataset.col);
    storage.save(fieldsKey(cur), [...hidden]);
    renderFkBody(t);
  });
  $('.panel-resize', p).addEventListener('mousedown', (e) => {
    const x0 = e.clientX, w0 = p.offsetWidth;
    const move = (ev) => { p.style.width = Math.max(260, Math.min(900, w0 + x0 - ev.clientX)) + 'px'; };
    const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); storage.save('panelWidth', p.offsetWidth); };
    addEventListener('mousemove', move); addEventListener('mouseup', up); e.preventDefault();
  });
  t.grid._onOpen = (r, c, kind) => panelShow(t, t.cellEntry(r, c, kind));
  t.grid._onSelect = (r, c, kind) => { if (isPanelOpen(t)) panelShow(t, t.cellEntry(r, c, kind)); };
  t.grid._onEscape = () => panelClose(t);
}

/** Shows `entry`, replacing the stack (or pushing onto it). Showing the current entry again is a no-op. */
export function panelShow(t, entry, { push = false } = {}) {
  if (!entry) return;
  entry.key = entryKey(entry);
  if (!push && isPanelOpen(t) && top(t)?.key === entry.key) return;
  if (push) t.pstack.push(entry); else t.pstack = [entry];
  t.panel.classList.remove('hidden');
  panelRender(t);
}

export function panelClose(t) {
  t.pstack = []; t.panel.classList.add('hidden'); t.grid.focus();
}

async function panelRender(t) {
  const p = t.panel, cur = top(t);
  if (!cur) return panelClose(t);
  $('[data-p=back]', p).style.display = t.pstack.length > 1 ? '' : 'none';
  const fieldsBox = $('.panel-fields', p), body = $('.panel-body', p), actions = $('.panel-actions', p);
  const copyBtn = `<button class="icon-btn" data-p="copy" title="Copier">${ICON.copy}</button>`;
  if (cur.kind !== 'fk') fieldsBox.classList.add('hidden');

  if (cur.kind === 'json') {
    $('.pt', p).textContent = cur.col;
    $('.ps', p).textContent = 'JSON';
    actions.innerHTML = `<button class="icon-btn" data-p="expand" title="Tout déplier">${ICON.expand}</button><button class="icon-btn" data-p="collapse" title="Tout replier">${ICON.collapse}</button>${copyBtn}`;
    const pj = parseJson(cur.value);
    body.innerHTML = pj.ok ? `<div class="jtree">${jsonTree(pj.val)}</div>` : `<div class="panel-msg err">JSON invalide</div><pre class="raw">${esc(cur.value)}</pre>`;
    return;
  }

  if (cur.kind === 'value') {
    $('.pt', p).textContent = cur.col;
    $('.ps', p).textContent = cur.type || 'valeur';
    actions.innerHTML = copyBtn;
    body.innerHTML = cur.value === null || cur.value === undefined
      ? '<div class="pfield"><div class="pv"><span class="null">NULL</span></div></div>'
      : `<div class="pfield"><div class="pv">${esc(String(cur.value))}</div></div>`;
    return;
  }

  // foreign key preview
  $('.pt', p).textContent = cur.table;
  $('.ps', p).textContent = `${cur.col} = ${cur.value}`;
  actions.innerHTML = `<button class="icon-btn ${t.showFields ? 'on' : ''}" data-p="fields" title="Champs à afficher">${ICON.columns}</button><button class="icon-btn" data-p="open" title="Ouvrir dans un onglet">${ICON.external}</button>`;
  if (!cur.loaded) {
    body.innerHTML = `<div class="panel-msg">${spinner('display:inline-block')}</div>`;
    fieldsBox.classList.add('hidden');
    await new Promise((r) => setTimeout(r, FK_LOOKUP_DELAY));
    if (top(t) !== cur) return; // moved on meanwhile
    try {
      const [meta, res] = await Promise.all([getMeta(cur.connId, cur.db, cur.table), api.lookup(cur.connId, cur.db, cur.table, cur.col, cur.value)]);
      cur.meta = meta; cur.columns = res.columns; cur.row = res.row;
    } catch (e) { cur.error = e.message; }
    cur.loaded = true;
    if (top(t) !== cur) return;
  }
  if (cur.error) { body.innerHTML = `<div class="panel-msg err">${esc(cur.error)}</div>`; return; }
  if (t.showFields) {
    const hidden = new Set(storage.load(fieldsKey(cur)) || []);
    fieldsBox.innerHTML = '<div class="pf-head"><span>Champs affichés</span><button data-p="all">Tous</button><button data-p="none">Aucun</button></div>' +
      cur.columns.map((c) => `<label class="pf"><input type="checkbox" data-col="${esc(c)}" ${hidden.has(c) ? '' : 'checked'}><span>${esc(c)}</span></label>`).join('');
    fieldsBox.classList.remove('hidden');
  } else fieldsBox.classList.add('hidden');
  renderFkBody(t);
}

function renderFkBody(t) {
  const cur = top(t), body = $('.panel-body', t.panel);
  if (!cur || cur.kind !== 'fk' || !cur.loaded || cur.error) return;
  if (!cur.row) { body.innerHTML = `<div class="panel-msg">Aucune ligne où ${esc(cur.col)} = ${esc(String(cur.value))}</div>`; return; }
  const hidden = new Set(storage.load(fieldsKey(cur)) || []);
  const types = Object.fromEntries((cur.meta?.cols || []).map((c) => [c.name, shortType(c.type)]));
  cur.fields = cur.columns.map((name, i) => ({ name, value: cur.row[i] }));
  const items = cur.fields.map((f, i) => {
    if (hidden.has(f.name)) return '';
    const fk = cur.meta?.fks.get(f.name);
    let v;
    if (f.value === null || f.value === undefined) v = '<span class="null">NULL</span>';
    else if (fk) v = `<button class="plink" data-p="link" data-e="${esc(JSON.stringify({ kind: 'fk', connId: cur.connId, db: fk.db, table: fk.table, col: fk.refColumn, value: f.value }))}">${esc(String(f.value))}<span class="to">→ ${esc(fk.table)}</span></button>`;
    else if (/json/i.test(types[f.name] || '') || looksJson(f.value)) {
      const pj = parseJson(f.value);
      v = pj.ok ? `<div class="jtree small">${jsonTree(pj.val, undefined, 1)}</div><button class="plink sm" data-p="json" data-i="${i}">ouvrir le JSON</button>` : esc(String(f.value));
    } else v = `<span class="pv-text">${esc(String(f.value))}</span>`;
    return `<div class="pfield"><div class="pk">${esc(f.name)}<span class="ty">${esc(types[f.name] || '')}</span></div><div class="pv">${v}</div></div>`;
  }).join('');
  const nHidden = cur.columns.filter((c) => hidden.has(c)).length;
  body.innerHTML = items || '<div class="panel-msg">Aucun champ sélectionné</div>';
  if (nHidden) body.insertAdjacentHTML('beforeend', `<div class="panel-msg sm">${nHidden} champ(s) masqué(s)</div>`);
}
