// ⌘K "Aller à…": every table of every open connection, plus actions and open tabs.
import { SYSTEM_DBS, TYPES } from '../config.js';
import { $ } from '../lib/dom.js';
import { esc, highlight } from '../lib/html.js';
import { ICON } from '../lib/icons.js';
import { S, connById, live } from '../state.js';
import { connect, loadTables } from '../connections.js';
import { renderTree } from '../sidebar.js';
import { activate, openQuery, openTable, tabTitle } from '../tabs.js';
import { connModal } from '../modals/connection-modal.js';
import { fuzzy } from './fuzzy.js';

const P = { items: [], sel: 0 };

function source() {
  const items = [];
  for (const c of S.conns) {
    const L = live(c.id);
    const dot = `<span class="dot" style="background:${c.color || 'var(--ink-3)'}"></span>`;
    for (const d of L.dbs) {
      const sys = SYSTEM_DBS.has(d.name);
      for (const t of d.tables || []) {
        items.push({ kind: 'table', sys, icon: t.kind === 'view' ? ICON.view : ICON.table, label: t.name, sub: L.dbs.length > 1 ? `${c.name} · ${d.name}` : c.name, dot, run: () => openTable(c.id, d.name, t.name) });
      }
      if (L.dbs.length > 1) items.push({ kind: 'db', icon: ICON.db, label: d.name, sub: `${c.name} · base`, dot, run: () => { L.open = true; d.open = true; renderTree(); loadTables(c.id, d.name); openQuery(c.id, d.name); } });
    }
    if (L.status === 'open') items.push({ kind: 'action', icon: ICON.query, label: `Nouvelle requête — ${c.name}`, sub: '', dot, run: () => openQuery(c.id) });
    else items.push({ kind: 'action', icon: ICON.conn, label: `Se connecter à ${c.name}`, sub: TYPES[c.type].label, dot, run: () => connect(c.id) });
  }
  items.push({ kind: 'action', icon: ICON.plus, label: 'Nouvelle connexion', sub: '', run: () => connModal() });
  for (const t of S.tabs) items.push({ kind: 'tab', icon: t.kind === 'table' ? ICON.table : ICON.query, label: tabTitle(t), sub: 'onglet ouvert', run: () => activate(t.id) });
  return items;
}

function filter() {
  const raw = $('#palette-input').value.trim().toLowerCase();
  const src = source();
  let out = [];
  if (!raw) {
    const rec = S.recent.map((r) => src.find((i) => i.kind === 'table' && i.label === r.table && i.sub.includes(connById(r.connId)?.name || '\0'))).filter(Boolean);
    const recSet = new Set(rec);
    out = [
      ...rec.map((i) => ({ ...i, group: 'Récents' })),
      ...src.filter((i) => i.kind === 'action').map((i) => ({ ...i, group: 'Actions' })),
      ...src.filter((i) => i.kind === 'table' && !i.sys && !recSet.has(i)).slice(0, 40).map((i) => ({ ...i, group: 'Tables' })),
    ];
  } else {
    const tokens = raw.split(/\s+/);
    for (const i of src) {
      if (i.kind === 'tab') continue;
      const whole = fuzzy(raw.replace(/\s+/g, ''), i.label);
      if (whole) { out.push({ ...i, score: whole.score + (i.kind === 'table' ? 2 : 0), idx: whole.idx }); continue; }
      // "conn table" or "db table": every token must match the label or the context
      let sc = 0, idx = null, ok = true;
      for (const tk of tokens) {
        const a = fuzzy(tk, i.label), b = fuzzy(tk, i.sub || '');
        if (!a && !b) { ok = false; break; }
        if (a && (!b || a.score >= b.score)) { sc += a.score; idx = a.idx; } else sc += b.score * 0.6;
      }
      if (ok) out.push({ ...i, score: sc - 5, idx });
    }
    out.forEach((i) => { if (i.sys) i.score -= 25; }); // system catalogs last
    out.sort((a, b) => b.score - a.score);
    out = out.slice(0, 80);
  }
  P.items = out;
  P.sel = 0;
  render();
}

function render() {
  const list = $('#palette-list');
  if (!P.items.length) {
    const anyOpen = Object.values(S.live).some((l) => l.status === 'open');
    list.innerHTML = `<div class="p-empty">${anyOpen ? 'Aucun résultat' : 'Aucune connexion ouverte — choisis « Se connecter à … »'}</div>`;
    return;
  }
  let h = '', g = null;
  P.items.forEach((i, n) => {
    if (i.group && i.group !== g) { g = i.group; h += `<div class="p-group">${g}</div>`; }
    h += `<div class="p-item ${n === P.sel ? 'on' : ''}" data-n="${n}">${i.icon}<span class="t">${highlight(i.label, i.idx)}</span><span class="s">${esc(i.sub || '')}${i.dot || ''}</span></div>`;
  });
  list.innerHTML = h;
  list.querySelector('.p-item.on')?.scrollIntoView({ block: 'nearest' });
}

export const isPaletteOpen = () => !$('#palette').classList.contains('hidden');

/** Re-filters an open palette after the table index changed, keeping the selection. */
export function paletteRefresh() {
  if (!isPaletteOpen()) return;
  const s = P.sel; filter(); P.sel = Math.min(s, P.items.length - 1); render();
}

export function openPalette() {
  $('#palette').classList.remove('hidden');
  const inp = $('#palette-input');
  inp.value = ''; inp.focus();
  filter();
}
export function closePalette() { $('#palette').classList.add('hidden'); }
export const togglePalette = () => (isPaletteOpen() ? closePalette() : openPalette());

function run(n) {
  const i = P.items[n]; if (!i) return;
  closePalette(); i.run();
}

export function initPalette() {
  const input = $('#palette-input'), list = $('#palette-list');
  input.addEventListener('input', filter);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) { P.sel = Math.min(P.items.length - 1, P.sel + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) { P.sel = Math.max(0, P.sel - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter') { run(P.sel); e.preventDefault(); }
    else if (e.key === 'Escape') closePalette();
  });
  list.addEventListener('mousemove', (e) => { const it = e.target.closest('.p-item'); if (it && +it.dataset.n !== P.sel) { P.sel = +it.dataset.n; render(); } });
  list.addEventListener('click', (e) => { const it = e.target.closest('.p-item'); if (it) run(+it.dataset.n); });
  $('#palette').addEventListener('mousedown', (e) => { if (e.target.id === 'palette') closePalette(); });
}
