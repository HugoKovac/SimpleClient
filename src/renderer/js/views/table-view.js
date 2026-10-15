// Table tab: paged data (sortable, WHERE filter) or structure.
import { MOD, PAGE } from '../config.js';
import { api } from '../api.js';
import { $, spinner } from '../lib/dom.js';
import { esc } from '../lib/html.js';
import { fmtN, quoteIdent, shortType } from '../lib/format.js';
import { ICON } from '../lib/icons.js';
import { connById } from '../state.js';
import { getMeta } from '../meta.js';
import { attachGridEvents, renderGrid } from '../grid.js';
import { PANEL_HTML, setupPanel } from '../panel/panel.js';
import { openQuery } from '../tabs.js';

export function buildTableView(t) {
  const el = document.createElement('div');
  el.className = 'view';
  el.innerHTML = `
    <div class="toolbar">
      <div class="seg"><button data-mode="data" class="on">Données</button><button data-mode="structure">Structure</button></div>
      <label class="filter"><span>WHERE</span><input placeholder="ex. id > 10 and status = 'active'" spellcheck="false"></label>
      <button class="icon-btn" data-act="refresh" title="Rafraîchir (${MOD}R)">${ICON.refresh}</button>
      <div class="pager"><span class="range"></span>
        <button class="icon-btn" data-act="prev">${ICON.left}</button><button class="icon-btn" data-act="next">${ICON.right}</button></div>
      <button class="btn" data-act="sql" title="Ouvrir dans une requête">${ICON.query}SQL</button>
    </div>
    <div class="body"><div class="grid-wrap"></div>${PANEL_HTML}</div>
    <div class="statusbar"><span class="st"></span><span class="sp"></span><span class="where"></span></div>`;
  t.grid = $('.grid-wrap', el);
  attachGridEvents(t.grid);
  t.cellEntry = (r, c, kind) => {
    const { columns, rows } = t.grid._data;
    const col = columns[c], value = rows[r][c];
    const fk = kind === 'fk' && t.meta?.fks.get(col);
    if (fk) return { kind: 'fk', connId: t.connId, db: fk.db, table: fk.table, col: fk.refColumn, value, from: col };
    if (kind === 'json') return { kind: 'json', col, value };
    return { kind: 'value', col, value, type: t.mode === 'data' ? t.types?.[col] : undefined };
  };
  setupPanel(t, el);

  t.filterInput = $('.filter input', el);
  t.filterInput.value = t.where || ''; // e.g. opened from the side panel with a filter
  t.filterInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { t.where = t.filterInput.value.trim(); t.page = 0; loadTable(t); }
    if (e.key === 'Escape') { t.filterInput.value = ''; if (t.where) { t.where = ''; t.page = 0; loadTable(t); } t.filterInput.blur(); }
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.mode) { t.mode = b.dataset.mode; el.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b)); loadTable(t); }
    if (b.dataset.act === 'refresh') loadTable(t);
    if (b.dataset.act === 'prev' && t.page > 0) { t.page--; loadTable(t); }
    if (b.dataset.act === 'next' && (t.page + 1) * PAGE < t.total) { t.page++; loadTable(t); }
    if (b.dataset.act === 'sql') {
      const type = connById(t.connId).type;
      const q = type === 'mysql' ? quoteIdent(type, t.table) : t.table.split('.').map((p) => quoteIdent(type, p)).join('.');
      openQuery(t.connId, t.db, `select *\nfrom ${q}${t.where ? `\nwhere ${t.where}` : ''}\nlimit 100;`);
    }
  });
  return el;
}

function structureRows(t) {
  return t.cols.map((c) => {
    const fk = t.meta?.fks.get(c.name);
    return [c.name, c.type, c.nullable ? 'oui' : 'non', c.default ?? null, [c.pk ? 'PK' : '', fk ? `→ ${fk.table}.${fk.refColumn}` : ''].filter(Boolean).join(' ')];
  });
}

export async function loadTable(t) {
  if (!t.el) t.el = buildTableView(t);
  const st = $('.st', t.el), range = $('.range', t.el);
  const prev = $('[data-act=prev]', t.el), next = $('[data-act=next]', t.el);
  const dataMode = t.mode === 'data';
  $('.pager', t.el).style.visibility = dataMode ? '' : 'hidden';
  $('.filter', t.el).style.visibility = dataMode ? '' : 'hidden';
  st.innerHTML = spinner();
  const seq = (t.seq = (t.seq || 0) + 1);
  try {
    if (!t.cols) {
      t.meta = await getMeta(t.connId, t.db, t.table, true);
      t.cols = t.meta.cols;
    }
    if (seq !== t.seq) return;
    if (!dataMode) {
      renderGrid(t.grid, ['colonne', 'type', 'null', 'défaut', 'clé'], structureRows(t), { jsonCols: new Set([-1]) });
      st.textContent = `${t.cols.length} colonnes`;
      return;
    }
    const { data, ms } = await api.browse(t.connId, t.db, t.table, { limit: PAGE, offset: t.page * PAGE, orderBy: t.orderBy, dir: t.dir, where: t.where });
    if (seq !== t.seq) return;
    t.total = data.total;
    const types = (t.types = Object.fromEntries(t.cols.map((c) => [c.name, shortType(c.type)])));
    const fkCols = new Set(), jsonCols = new Set();
    data.columns.forEach((c, i) => {
      if (t.meta?.fks.has(c)) fkCols.add(i);
      if (/json/i.test(types[c] || '')) jsonCols.add(i);
    });
    renderGrid(t.grid, data.columns, data.rows, {
      offset: t.page * PAGE, types, sort: { col: t.orderBy, dir: t.dir }, fkCols, jsonCols,
      onSort: (col) => {
        if (t.orderBy !== col) { t.orderBy = col; t.dir = 'asc'; } else if (t.dir === 'asc') t.dir = 'desc'; else t.orderBy = null;
        t.page = 0; loadTable(t);
      },
    });
    const from = data.total ? t.page * PAGE + 1 : 0, to = t.page * PAGE + data.rows.length;
    range.textContent = `${fmtN(from)}–${fmtN(to)} sur ${fmtN(data.total)}`;
    prev.disabled = t.page === 0; next.disabled = to >= data.total;
    st.innerHTML = `${fmtN(data.total)} lignes · ${ms} ms`;
    $('.where', t.el).textContent = t.where ? `where ${t.where}` : '';
  } catch (e) {
    if (seq !== t.seq) return;
    t.grid.innerHTML = `<div class="grid-msg err">${esc(e.message)}</div>`;
    st.innerHTML = '<span class="bad">Erreur</span>';
    range.textContent = '';
  }
}
