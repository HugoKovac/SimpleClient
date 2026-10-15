// Result grid: rendering, cell selection, keyboard navigation.
//
// Views plug into a grid element through optional callbacks:
//   wrap._onSelect(r, c, kind)  selection moved (mouse or arrows)
//   wrap._onOpen(r, c, kind)    click / ↵ on a foreign key or JSON cell
//   wrap._onEscape()
// where kind is 'fk' | 'json' | 'value'.
import { modKey } from './config.js';
import { toast } from './lib/dom.js';
import { esc } from './lib/html.js';
import { cellHtml, looksJson } from './lib/format.js';
import { cellModal } from './modals/cell-modal.js';

const HEADER_H = 27;

/** Renders a result grid into `wrap`. opts: { offset, types, sort: {col, dir}, onSort, fkCols, jsonCols, empty } */
export function renderGrid(wrap, columns, rows, opts = {}) {
  wrap._data = { columns, rows };
  wrap._sel = null;
  if (!columns.length) { wrap.innerHTML = `<div class="grid-msg">${opts.empty || 'Aucun résultat'}</div>`; return; }
  const types = opts.types || {};
  const fk = opts.fkCols || new Set(), js = opts.jsonCols || new Set();
  let h = '<table class="grid"><thead><tr><th class="rn"></th>';
  columns.forEach((c, i) => {
    const s = opts.sort && opts.sort.col === c ? `<span class="arrow">${opts.sort.dir === 'desc' ? '↓' : '↑'}</span>` : '';
    h += `<th class="${opts.onSort ? 'sortable' : ''}" data-col="${i}"><span class="h">${esc(c)}${types[c] ? `<span class="ty">${esc(types[c])}</span>` : ''}${s}</span></th>`;
  });
  h += '</tr></thead><tbody>';
  const off = opts.offset || 0;
  rows.forEach((r, ri) => {
    h += `<tr><td class="rn">${off + ri + 1}</td>`;
    for (let ci = 0; ci < columns.length; ci++) {
      const v = r[ci], c = cellHtml(v);
      let cls = c.cls;
      if (v !== null && v !== undefined) {
        if (fk.has(ci)) cls += ' fk';
        else if (js.has(ci) || looksJson(v)) cls += ' json';
      }
      h += `<td class="${cls}" data-r="${ri}" data-c="${ci}">${c.html}</td>`;
    }
    h += '</tr>';
  });
  h += '</tbody></table>';
  if (!rows.length) h += `<div class="grid-msg">${opts.empty || 'Aucune ligne'}</div>`;
  wrap.innerHTML = h;
  if (opts.onSort) wrap.querySelectorAll('th[data-col]').forEach((th) => (th.onclick = () => opts.onSort(columns[th.dataset.col])));
}

const cellKind = (td) => (td.classList.contains('fk') ? 'fk' : td.classList.contains('json') ? 'json' : 'value');

function scrollIntoGrid(wrap, td) {
  const wr = wrap.getBoundingClientRect(), tr = td.getBoundingClientRect();
  const stickyW = wrap.querySelector('td.rn')?.offsetWidth || 0;
  if (tr.top < wr.top + HEADER_H) wrap.scrollTop -= wr.top + HEADER_H - tr.top;
  if (tr.bottom > wr.bottom - 10) wrap.scrollTop += tr.bottom - wr.bottom + 10;
  if (tr.left < wr.left + stickyW) wrap.scrollLeft -= wr.left + stickyW - tr.left;
  if (tr.right > wr.right - 10) wrap.scrollLeft += tr.right - wr.right + 10;
}

function select(wrap, td) {
  wrap.querySelector('td.sel')?.classList.remove('sel');
  if (!td) { wrap._sel = null; return; }
  td.classList.add('sel');
  const r = +td.dataset.r, c = +td.dataset.c;
  const changed = !wrap._sel || wrap._sel.r !== r || wrap._sel.c !== c;
  wrap._sel = { r, c };
  scrollIntoGrid(wrap, td);
  if (changed) wrap._onSelect?.(r, c, cellKind(td));
}

const valueAt = (wrap, r, c) => wrap._data.rows[r][c];

export function selectedValue(wrap) {
  const s = wrap._sel;
  return s ? valueAt(wrap, s.r, s.c) : undefined;
}

export function attachGridEvents(wrap) {
  wrap.tabIndex = 0;
  wrap.addEventListener('mousedown', (e) => { const td = e.target.closest('td[data-r]'); if (td) select(wrap, td); });
  // single click on a foreign key or JSON cell → side panel
  wrap.addEventListener('click', (e) => {
    const td = e.target.closest('td.fk, td.json'); if (!td || String(getSelection())) return;
    wrap._onOpen?.(+td.dataset.r, +td.dataset.c, cellKind(td));
  });
  wrap.addEventListener('dblclick', (e) => {
    const td = e.target.closest('td[data-r]'); if (!td || td.matches('.fk, .json')) return;
    cellModal(wrap._data.columns[+td.dataset.c], selectedValue(wrap));
  });
  wrap.addEventListener('keydown', (e) => {
    const s = wrap._sel; if (!s) return;
    if (modKey(e) && e.key === 'c' && !String(getSelection())) {
      const v = selectedValue(wrap);
      navigator.clipboard.writeText(v === null ? 'NULL' : String(v)); toast('Copié'); e.preventDefault(); return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const td = wrap.querySelector('td.sel');
      const kind = td ? cellKind(td) : 'value';
      if (kind !== 'value' && wrap._onOpen) return wrap._onOpen(s.r, s.c, kind);
      return cellModal(wrap._data.columns[s.c], selectedValue(wrap));
    }
    if (e.key === 'Escape' && wrap._onEscape) { wrap._onEscape(); return; }
    const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const td = wrap.querySelector(`td[data-r="${s.r + d[0]}"][data-c="${s.c + d[1]}"]`);
    if (td) select(wrap, td);
  });
}
