'use strict';
/* Tablette — renderer. Vanilla JS, no build step. */

// `api` is exposed on window by the preload script.
const PLATFORM = new URLSearchParams(location.search).get('platform') || 'darwin';
const MAC = PLATFORM === 'darwin';
const PAGE = 100;
const MAX_QUERY_ROWS = 2000;
const COLORS = ['', '#0f766e', '#2563eb', '#ca8a04', '#c2410c', '#be185d', '#7c3aed'];
const TYPES = { postgres: { label: 'PostgreSQL', port: 5432, user: 'postgres' }, mysql: { label: 'MySQL', port: 3306, user: 'root' }, sqlite: { label: 'SQLite' } };

document.body.classList.toggle('mac', MAC);
document.querySelectorAll('kbd.mod').forEach((k) => (k.textContent = (MAC ? '⌘' : 'Ctrl ') + k.textContent));

// ---------------------------------------------------------------- helpers
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = (n) => Number(n).toLocaleString('fr-FR');
const uid = () => Math.random().toString(36).slice(2, 10);
const ICON = {
  table: '<svg viewBox="0 0 16 16"><rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M6.5 6.5V13"/></svg>',
  view: '<svg viewBox="0 0 16 16"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="2"/></svg>',
  db: '<svg viewBox="0 0 16 16"><ellipse cx="8" cy="4" rx="5" ry="2"/><path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 16 16"><path d="m6 3.5 4.5 4.5L6 12.5"/></svg>',
  query: '<svg viewBox="0 0 16 16"><path d="m4 5 3 3-3 3M8.5 11.5h4"/></svg>',
  edit: '<svg viewBox="0 0 16 16"><path d="M10.5 3 13 5.5 6 12.5H3.5V10Z"/></svg>',
  power: '<svg viewBox="0 0 16 16"><path d="M8 2.5V8M4.6 4.6a4.8 4.8 0 1 0 6.8 0"/></svg>',
  plus: '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>',
  x: '<svg viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8"/></svg>',
  refresh: '<svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5"/></svg>',
  left: '<svg viewBox="0 0 16 16"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg>',
  right: '<svg viewBox="0 0 16 16"><path d="m6 3.5 4.5 4.5L6 12.5"/></svg>',
  play: '<svg viewBox="0 0 16 16"><path d="M5 3.5v9l7-4.5Z"/></svg>',
  conn: '<svg viewBox="0 0 16 16"><path d="M6 10 10 6M7 4.5l1.3-1.3a2.6 2.6 0 0 1 3.7 3.7L10.7 8.2M9 11.5l-1.3 1.3a2.6 2.6 0 0 1-3.7-3.7L5.3 7.8"/></svg>',
  columns: '<svg viewBox="0 0 16 16"><rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M6.2 3v10M9.8 3v10"/></svg>',
  external: '<svg viewBox="0 0 16 16"><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"/></svg>',
  copy: '<svg viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>',
  expand: '<svg viewBox="0 0 16 16"><path d="m4.5 6 3.5-3.5L11.5 6M4.5 10l3.5 3.5 3.5-3.5"/></svg>',
  collapse: '<svg viewBox="0 0 16 16"><path d="M4.5 2.5 8 6l3.5-3.5M4.5 13.5 8 10l3.5 3.5"/></svg>',
  key: '<svg viewBox="0 0 16 16"><circle cx="5.5" cy="10.5" r="2.5"/><path d="m7.3 8.7 5.2-5.2M11 5l1.5 1.5"/></svg>',
};

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

function store(key, val) {
  try { if (val === undefined) return JSON.parse(localStorage.getItem('tablette.' + key)); localStorage.setItem('tablette.' + key, JSON.stringify(val)); }
  catch { return null; }
}

// ---------------------------------------------------------------- state
const S = {
  conns: [],          // saved connection configs (no passwords)
  live: {},           // id -> { status: off|connecting|open|err, error, open, dbs: [{ name, tables, loading, open }] }
  tabs: [],
  active: null,
  recent: store('recent') || [], // [{connId, db, table}]
};
const connById = (id) => S.conns.find((c) => c.id === id);
const live = (id) => (S.live[id] ||= { status: 'off', open: false, dbs: [] });
const activeTab = () => S.tabs.find((t) => t.id === S.active);

function saveSession() {
  store('session', {
    open: Object.keys(S.live).filter((id) => S.live[id].status === 'open'),
    tabs: S.tabs.map((t) => ({ kind: t.kind, connId: t.connId, db: t.db, table: t.table, sql: t.kind === 'query' ? t.textarea?.value ?? t.sql : undefined })),
    active: S.tabs.findIndex((t) => t.id === S.active),
  });
}

// ---------------------------------------------------------------- connections
async function loadConns() {
  S.conns = await api.listConnections();
  renderTree();
}

async function connect(id, { expand = true } = {}) {
  const L = live(id);
  if (L.status === 'open' || L.status === 'connecting') { if (expand) { L.open = true; renderTree(); } return L.ready; }
  L.status = 'connecting'; L.error = null; L.open = expand || L.open;
  renderTree();
  L.ready = (async () => {
    try {
      const dbs = await api.openConnection(id);
      const c = connById(id);
      L.dbs = dbs.map((name) => ({ name, tables: null, loading: false, open: false }));
      L.status = 'open';
      const first = L.dbs.find((d) => d.name === c.database) || L.dbs[0];
      if (first) { first.open = true; await loadTables(id, first.name); }
      renderTree(); saveSession();
      indexAll(id); // background: fill ⌘K with every table of every database
    } catch (e) {
      L.status = 'err'; L.error = e.message; renderTree();
      toast(`${connById(id)?.name || 'Connexion'} : ${e.message}`);
      throw e;
    }
  })();
  return L.ready.catch(() => {});
}

async function disconnect(id) {
  await api.closeConnection(id);
  S.live[id] = { status: 'off', open: false, dbs: [] };
  renderTree(); saveSession();
}

async function loadTables(id, db, force) {
  const d = live(id).dbs.find((x) => x.name === db);
  if (!d || (d.tables && !force) || d.loading) return;
  d.loading = true; renderTree();
  try { d.tables = await api.tables(id, db); }
  catch (e) { d.tables = []; d.error = e.message; }
  d.loading = false; renderTree(); paletteRefresh();
}

async function indexAll(id) {
  const queue = live(id).dbs.filter((d) => !d.tables).slice(0, 60);
  const worker = async () => { while (queue.length) { const d = queue.shift(); await loadTables(id, d.name).catch(() => {}); } };
  await Promise.all([worker(), worker(), worker()]);
}

// ---------------------------------------------------------------- sidebar tree
function renderTree() {
  const el = $('#tree');
  const top = el.scrollTop;
  if (!S.conns.length) {
    el.innerHTML = `<div class="tree-empty">Aucune connexion.<br><button data-act="new-conn">Ajouter une connexion</button></div>`;
    return;
  }
  const at = activeTab();
  let h = '';
  for (const c of S.conns) {
    const L = live(c.id);
    const cls = L.status === 'open' ? '' : L.status === 'err' ? 'err' : 'off';
    h += `<div class="node conn ${cls} ${L.open ? 'open' : ''}" data-act="toggle-conn" data-conn="${c.id}" title="${esc(L.error || TYPES[c.type].label)}">
      ${ICON.chev}<span class="dot" style="${c.color ? `background:${c.color}` : ''}"></span><span class="label">${esc(c.name)}</span>
      ${L.status === 'connecting' ? '<span class="spinner"></span>' : ''}
      <span class="hover-actions">
        <button class="icon-btn" data-act="new-query" data-conn="${c.id}" title="Nouvelle requête">${ICON.query}</button>
        <button class="icon-btn" data-act="edit-conn" data-conn="${c.id}" title="Modifier">${ICON.edit}</button>
        ${L.status === 'open' ? `<button class="icon-btn" data-act="disconnect" data-conn="${c.id}" title="Déconnecter">${ICON.power}</button>` : ''}
      </span></div>`;
    if (!L.open || L.status !== 'open') continue;
    const single = L.dbs.length === 1;
    for (const d of L.dbs) {
      if (!single) {
        h += `<div class="node db ${d.open ? 'open' : ''}" data-act="toggle-db" data-conn="${c.id}" data-db="${esc(d.name)}">
          ${ICON.chev}${ICON.db}<span class="label">${esc(d.name)}</span>
          ${d.loading ? '<span class="spinner"></span>' : d.tables ? `<span class="meta">${d.tables.length}</span>` : ''}</div>`;
      }
      if (!single && !d.open) continue;
      if (d.tables && !d.tables.length) h += `<div class="node muted" style="${single ? 'padding-left:20px' : ''}">${d.error ? esc(d.error) : 'Aucune table'}</div>`;
      for (const t of d.tables || []) {
        const on = at && at.kind === 'table' && at.connId === c.id && at.db === d.name && at.table === t.name;
        h += `<div class="node tbl ${on ? 'active' : ''}" style="${single ? 'padding-left:20px' : ''}" data-act="open-table" data-conn="${c.id}" data-db="${esc(d.name)}" data-table="${esc(t.name)}">
          ${t.kind === 'view' ? ICON.view : ICON.table}<span class="label">${esc(t.name)}</span></div>`;
      }
    }
  }
  el.innerHTML = h;
  el.scrollTop = top;
}

$('#sidebar').addEventListener('click', (e) => {
  const n = e.target.closest('[data-act]');
  if (!n) return;
  e.stopPropagation();
  const { act, conn, db, table } = n.dataset;
  if (act === 'new-conn') return connModal();
  if (act === 'edit-conn') return connModal(connById(conn));
  if (act === 'disconnect') return disconnect(conn);
  if (act === 'new-query') return openQuery(conn);
  if (act === 'toggle-conn') {
    const L = live(conn);
    if (L.status === 'open') { L.open = !L.open; renderTree(); } else connect(conn);
  }
  if (act === 'toggle-db') {
    const d = live(conn).dbs.find((x) => x.name === db);
    d.open = !d.open; renderTree();
    if (d.open) loadTables(conn, db);
  }
  if (act === 'open-table') openTable(conn, db, table);
});
$('#btn-new-conn').onclick = () => connModal();
$('#btn-palette').onclick = () => openPalette();

// ---------------------------------------------------------------- tabs
function openTable(connId, db, table, { where } = {}) {
  let t = S.tabs.find((x) => x.kind === 'table' && x.connId === connId && x.db === db && x.table === table);
  if (!t) {
    t = { id: uid(), kind: 'table', connId, db, table, mode: 'data', page: 0, orderBy: null, dir: 'asc', where: where || '' };
    S.tabs.push(t);
  } else if (where !== undefined && t.where !== where) {
    t.where = where; t.page = 0;
    if (t.filterInput) t.filterInput.value = where;
    if (t.loaded) loadTable(t);
  }
  S.recent = [{ connId, db, table }, ...S.recent.filter((r) => !(r.connId === connId && r.db === db && r.table === table))].slice(0, 8);
  store('recent', S.recent);
  activate(t.id);
}

function openQuery(connId, db, sql = '') {
  if (!connId) {
    const at = activeTab();
    connId = at?.connId || Object.keys(S.live).find((id) => S.live[id].status === 'open') || S.conns[0]?.id;
    db = db || at?.db;
  }
  if (!connId) return connModal();
  const L = live(connId);
  if (L.status !== 'open') connect(connId, { expand: false });
  db = db || connById(connId).database || L.dbs[0]?.name || '';
  const n = S.tabs.filter((x) => x.kind === 'query').length + 1;
  const t = { id: uid(), kind: 'query', connId, db, sql, title: `Requête ${n}` };
  S.tabs.push(t);
  activate(t.id);
  setTimeout(() => t.textarea?.focus(), 0);
}

function closeTab(id) {
  const i = S.tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  S.tabs.splice(i, 1);
  if (S.active === id) S.active = (S.tabs[i] || S.tabs[i - 1])?.id || null;
  renderTabs(); renderView(); renderTree(); saveSession();
}

function activate(id) {
  S.active = id;
  renderTabs(); renderView(); renderTree(); saveSession();
  const at = activeTab();
  if (at?.kind === 'table' && !at.loaded) { at.loaded = true; loadTable(at); }
  const tab = $(`.tab[data-id="${id}"]`); tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function tabTitle(t) { return t.kind === 'table' ? t.table : t.title; }

function renderTabs() {
  const bar = $('#tabbar');
  bar.innerHTML = S.tabs.map((t) => {
    const c = connById(t.connId);
    return `<div class="tab ${t.id === S.active ? 'active' : ''}" data-id="${t.id}" title="${esc(`${c?.name} · ${t.db}`)}">
      ${c?.color ? `<span class="bar" style="background:${c.color}"></span>` : ''}
      ${t.kind === 'table' ? ICON.table : ICON.query}<span class="t">${esc(tabTitle(t))}</span>
      <span class="sub">${esc(t.db || '')}</span>
      <button class="x" data-close="${t.id}">${ICON.x}</button></div>`;
  }).join('') + `<button class="tab-add" id="tab-add" title="Nouvelle requête">${ICON.plus}</button>`;
}
$('#tabbar').addEventListener('click', (e) => {
  const x = e.target.closest('[data-close]');
  if (x) return closeTab(x.dataset.close);
  if (e.target.closest('#tab-add')) return openQuery();
  const t = e.target.closest('.tab');
  if (t) activate(t.dataset.id);
});
$('#tabbar').addEventListener('auxclick', (e) => { const t = e.target.closest('.tab'); if (t && e.button === 1) closeTab(t.dataset.id); });

function renderView() {
  const v = $('#view');
  const t = activeTab();
  v.replaceChildren();
  if (!t) {
    const k = (s) => `<kbd>${MAC ? '⌘' : 'Ctrl'}</kbd><kbd>${s}</kbd>`;
    v.innerHTML = `<div class="empty"><div class="inner">
      <div class="row"><span>Aller à une table</span><span>${k('K')}</span></div>
      <div class="row"><span>Nouvelle requête</span><span>${k('T')}</span></div>
      <div class="row"><span>Nouvelle connexion</span><span>${k('N')}</span></div>
      <div class="row"><span>Fermer l'onglet</span><span>${k('W')}</span></div></div></div>`;
    return;
  }
  if (!t.el) t.el = t.kind === 'table' ? buildTableView(t) : buildQueryView(t);
  v.append(t.el);
}

// ---------------------------------------------------------------- grid
function cellHtml(v) {
  if (v === null || v === undefined) return { cls: 'null', html: 'NULL' };
  if (typeof v === 'number') return { cls: 'num', html: String(v) };
  if (typeof v === 'boolean') return { cls: 'num', html: String(v) };
  const s = String(v);
  if (/^-?\d+(\.\d+)?$/.test(s) && s.length < 30) return { cls: 'num', html: s };
  return { cls: '', html: esc(s.length > 300 ? s.slice(0, 300) + '…' : s.replace(/\n/g, '↵ ')) };
}

/** Renders a result grid into `wrap`. opts: { offset, types, sort: {col, dir}, onSort } */
function renderGrid(wrap, columns, rows, opts = {}) {
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
  if (opts.onSort) wrap.querySelectorAll('th[data-col]').forEach((th) => th.onclick = () => opts.onSort(columns[th.dataset.col]));
}

function looksJson(v) {
  if (typeof v !== 'string' || v.length < 2) return false;
  const a = v[0], b = v[v.length - 1];
  return (a === '{' && b === '}') || (a === '[' && b === ']');
}

function gridSelect(wrap, td) {
  wrap.querySelector('td.sel')?.classList.remove('sel');
  if (!td) { wrap._sel = null; return; }
  td.classList.add('sel');
  wrap._sel = { r: +td.dataset.r, c: +td.dataset.c };
  const wr = wrap.getBoundingClientRect(), tr = td.getBoundingClientRect();
  const stickyW = wrap.querySelector('td.rn')?.offsetWidth || 0;
  if (tr.top < wr.top + 27) wrap.scrollTop -= wr.top + 27 - tr.top;
  if (tr.bottom > wr.bottom - 10) wrap.scrollTop += tr.bottom - wr.bottom + 10;
  if (tr.left < wr.left + stickyW) wrap.scrollLeft -= wr.left + stickyW - tr.left;
  if (tr.right > wr.right - 10) wrap.scrollLeft += tr.right - wr.right + 10;
}
function cellValue(wrap) {
  const s = wrap._sel; if (!s) return undefined;
  return wrap._data.rows[s.r][s.c];
}
function attachGridEvents(wrap) {
  wrap.tabIndex = 0;
  wrap.addEventListener('mousedown', (e) => { const td = e.target.closest('td[data-r]'); if (td) gridSelect(wrap, td); });
  // single click on a foreign key or JSON cell → side panel
  wrap.addEventListener('click', (e) => {
    const td = e.target.closest('td.fk, td.json'); if (!td || String(getSelection())) return;
    wrap._onCell?.(+td.dataset.c, wrap._data.rows[+td.dataset.r][+td.dataset.c], td.classList.contains('fk') ? 'fk' : 'json');
  });
  wrap.addEventListener('dblclick', (e) => {
    const td = e.target.closest('td[data-r]'); if (!td || td.matches('.fk, .json')) return;
    const { columns } = wrap._data;
    cellModal(columns[+td.dataset.c], cellValue(wrap));
  });
  wrap.addEventListener('keydown', (e) => {
    const s = wrap._sel; if (!s) return;
    const mod = MAC ? e.metaKey : e.ctrlKey;
    if (mod && e.key === 'c' && !String(getSelection())) {
      const v = cellValue(wrap); navigator.clipboard.writeText(v === null ? 'NULL' : String(v)); toast('Copié'); e.preventDefault(); return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const td = wrap.querySelector('td.sel');
      if (td?.matches('.fk, .json') && wrap._onCell) return wrap._onCell(s.c, cellValue(wrap), td.classList.contains('fk') ? 'fk' : 'json');
      return cellModal(wrap._data.columns[s.c], cellValue(wrap));
    }
    if (e.key === 'Escape' && wrap._onEscape) { wrap._onEscape(); return; }
    const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const td = wrap.querySelector(`td[data-r="${s.r + d[0]}"][data-c="${s.c + d[1]}"]`);
    if (td) gridSelect(wrap, td);
  });
}

// ---------------------------------------------------------------- table tab
function buildTableView(t) {
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0';
  el.innerHTML = `
    <div class="toolbar">
      <div class="seg"><button data-mode="data" class="on">Données</button><button data-mode="structure">Structure</button></div>
      <label class="filter"><span>WHERE</span><input placeholder="ex. id > 10 and status = 'active'" spellcheck="false"></label>
      <button class="icon-btn" data-act="refresh" title="Rafraîchir (${MAC ? '⌘' : 'Ctrl+'}R)">${ICON.refresh}</button>
      <div class="pager"><span class="range"></span>
        <button class="icon-btn" data-act="prev">${ICON.left}</button><button class="icon-btn" data-act="next">${ICON.right}</button></div>
      <button class="btn" data-act="sql" title="Ouvrir dans une requête">${ICON.query}SQL</button>
    </div>
    <div class="body"><div class="grid-wrap"></div>${PANEL_HTML}</div>
    <div class="statusbar"><span class="st"></span><span class="sp"></span><span class="where"></span></div>`;
  t.grid = $('.grid-wrap', el);
  setupPanel(t, el);
  t.grid._onCell = (ci, value, kind) => {
    const col = t.grid._data.columns[ci];
    if (kind === 'fk') {
      const fk = t.meta?.fks.get(col);
      if (fk) panelShow(t, { kind: 'fk', connId: t.connId, db: fk.db, table: fk.table, col: fk.refColumn, value, from: col });
    } else panelShow(t, { kind: 'json', col, value });
  };
  t.filterInput = $('.filter input', el);
  attachGridEvents(t.grid);
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
      const c = connById(t.connId);
      const q = c.type === 'mysql' ? `\`${t.table}\`` : t.table.split('.').map((p) => `"${p}"`).join('.');
      openQuery(t.connId, t.db, `select *\nfrom ${q}${t.where ? `\nwhere ${t.where}` : ''}\nlimit 100;`);
    }
  });
  return el;
}

async function loadTable(t) {
  if (!t.el) t.el = buildTableView(t);
  const st = $('.st', t.el), range = $('.range', t.el);
  const prev = $('[data-act=prev]', t.el), next = $('[data-act=next]', t.el);
  const pagerOn = t.mode === 'data';
  $('.pager', t.el).style.visibility = pagerOn ? '' : 'hidden';
  $('.filter', t.el).style.visibility = pagerOn ? '' : 'hidden';
  st.innerHTML = '<span class="spinner" style="display:inline-block;vertical-align:-1px"></span>';
  const seq = (t.seq = (t.seq || 0) + 1);
  try {
    if (!t.cols) {
      t.meta = await getMeta(t.connId, t.db, t.table, true);
      t.cols = t.meta.cols;
    }
    if (seq !== t.seq) return;
    if (t.mode === 'structure') {
      const rows = t.cols.map((c) => {
        const fk = t.meta?.fks.get(c.name);
        return [c.name, c.type, c.nullable ? 'oui' : 'non', c.default ?? null, [c.pk ? 'PK' : '', fk ? `→ ${fk.table}.${fk.refColumn}` : ''].filter(Boolean).join(' ')];
      });
      renderGrid(t.grid, ['colonne', 'type', 'null', 'défaut', 'clé'], rows, { jsonCols: new Set([-1]) });
      st.textContent = `${t.cols.length} colonnes`;
      return;
    }
    const { data, ms } = await api.browse(t.connId, t.db, t.table, { limit: PAGE, offset: t.page * PAGE, orderBy: t.orderBy, dir: t.dir, where: t.where });
    if (seq !== t.seq) return;
    t.total = data.total;
    const types = Object.fromEntries(t.cols.map((c) => [c.name, shortType(c.type)]));
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
    st.innerHTML = `<span class="bad">Erreur</span>`;
    range.textContent = '';
  }
}
const shortType = (s) => String(s || '').replace('character varying', 'varchar').replace('timestamp without time zone', 'timestamp').replace('timestamp with time zone', 'timestamptz').replace('double precision', 'float8');

// ---------------------------------------------------------------- query tab
function buildQueryView(t) {
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0';
  el.innerHTML = `
    <div class="toolbar">
      <span class="conn-name" style="color:var(--ink-2);display:flex;align-items:center;gap:6px"></span>
      <select class="db-select" style="height:26px;border:1px solid var(--line-strong);border-radius:6px;background:var(--bg);padding:0 6px;max-width:220px"></select>
      <span style="flex:1"></span>
      <button class="btn primary" data-act="run">${ICON.play}Exécuter <kbd>${MAC ? '⌘' : 'Ctrl'}↵</kbd></button>
    </div>
    <div class="split">
      <div class="editor"><textarea spellcheck="false" placeholder="select * from …"></textarea></div>
      <div class="gutter"></div>
      <div class="results"><div class="body"><div class="grid-wrap"><div class="grid-msg">${MAC ? '⌘' : 'Ctrl'}↵ pour exécuter · la sélection seule si du texte est sélectionné</div></div>${PANEL_HTML}</div>
        <div class="statusbar"><span class="st"></span><span class="sp"></span></div></div>
    </div>`;
  const ta = (t.textarea = $('textarea', el));
  ta.value = t.sql || '';
  t.grid = $('.grid-wrap', el);
  attachGridEvents(t.grid);
  setupPanel(t, el);
  t.grid._onCell = (ci, value) => panelShow(t, { kind: 'json', col: t.grid._data.columns[ci], value });
  const c = connById(t.connId);
  $('.conn-name', el).innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${c.color || 'var(--ink-3)'}"></span>${esc(c.name)}`;
  const sel = $('.db-select', el);
  const fillDbs = () => {
    const dbs = live(t.connId).dbs.map((d) => d.name);
    if (!t.db && dbs.length) { t.db = dbs[0]; renderTabs(); }
    if (t.db && !dbs.includes(t.db)) dbs.unshift(t.db);
    sel.innerHTML = dbs.map((d) => `<option ${d === t.db ? 'selected' : ''}>${esc(d)}</option>`).join('');
    sel.style.display = dbs.length > 1 ? '' : 'none';
  };
  fillDbs();
  live(t.connId).ready?.then(fillDbs);
  sel.onchange = () => { t.db = sel.value; renderTabs(); saveSession(); };
  ta.addEventListener('keydown', (e) => {
    const mod = MAC ? e.metaKey : e.ctrlKey;
    if (mod && e.key === 'Enter') { e.preventDefault(); runQuery(t); }
    if (e.key === 'Tab' && !mod) {
      e.preventDefault();
      const { selectionStart: a, selectionEnd: b } = ta;
      ta.setRangeText('  ', a, b, 'end');
    }
  });
  let saveT; ta.addEventListener('input', () => { clearTimeout(saveT); saveT = setTimeout(saveSession, 500); });
  $('[data-act=run]', el).onclick = () => runQuery(t);
  // resizable editor
  const split = $('.split', el);
  $('.gutter', el).addEventListener('mousedown', (e) => {
    const r = split.getBoundingClientRect();
    const move = (ev) => split.style.setProperty('--editor-h', Math.min(r.height - 80, Math.max(60, ev.clientY - r.top)) + 'px');
    const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); };
    addEventListener('mousemove', move); addEventListener('mouseup', up); e.preventDefault();
  });
  return el;
}

async function runQuery(t) {
  const ta = t.textarea;
  const sql = (ta.selectionStart !== ta.selectionEnd ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : ta.value).trim();
  if (!sql) return;
  const st = $('.st', t.el);
  st.innerHTML = '<span class="spinner" style="display:inline-block;vertical-align:-1px"></span> Exécution…';
  const seq = (t.seq = (t.seq || 0) + 1);
  try {
    await live(t.connId).ready;
    const { data, ms } = await api.query(t.connId, t.db, sql);
    if (seq !== t.seq) return;
    const rows = data.rows.slice(0, MAX_QUERY_ROWS);
    if (data.columns.length) {
      renderGrid(t.grid, data.columns, rows);
      st.innerHTML = `<span class="ok">●</span> ${fmtN(data.rows.length)} lignes${data.rows.length > MAX_QUERY_ROWS ? ` (${fmtN(MAX_QUERY_ROWS)} affichées)` : ''} · ${ms} ms`;
    } else {
      t.grid.innerHTML = `<div class="grid-msg">${esc(data.command || 'OK')}${data.affected != null ? ` — ${fmtN(data.affected)} ligne(s) affectée(s)` : ''}</div>`;
      st.innerHTML = `<span class="ok">●</span> OK · ${ms} ms`;
    }
    if (/\b(create|drop|alter|rename)\b/i.test(sql)) {
      loadTables(t.connId, t.db, true);
      S.tabs.filter((x) => x.kind === 'table' && x.connId === t.connId).forEach((x) => (x.cols = null));
      Object.keys(S.meta).forEach((k) => k.startsWith(t.connId + '|') && delete S.meta[k]);
    }
  } catch (e) {
    if (seq !== t.seq) return;
    t.grid.innerHTML = `<div class="grid-msg err">${esc(e.message)}</div>`;
    st.innerHTML = `<span class="bad">●</span> Erreur${e.ms != null ? ` · ${e.ms} ms` : ''}`;
  }
}


// ---------------------------------------------------------------- table metadata (columns + foreign keys)
S.meta = {};
async function getMeta(connId, db, table, force) {
  const k = `${connId}|${db}|${table}`;
  if (!S.meta[k] || force) {
    S.meta[k] = (async () => {
      const [cols, fks] = await Promise.all([
        api.columns(connId, db, table).catch(() => []),
        api.foreignKeys(connId, db, table).catch(() => []),
      ]);
      return { cols, fks: new Map(fks.map((f) => [f.column, f])) };
    })();
  }
  return S.meta[k];
}

function sqlLiteral(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v))) return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}
function quoteIdent(connId, name) {
  return connById(connId)?.type === 'mysql' ? '`' + name.replace(/`/g, '``') + '`' : '"' + name.replace(/"/g, '""') + '"';
}

// ---------------------------------------------------------------- JSON tree
function parseJson(v) {
  if (v !== null && typeof v === 'object') return { ok: true, val: v };
  try { return { ok: true, val: JSON.parse(v) }; } catch { return { ok: false }; }
}
function jsonTree(val, key, depth = 0) {
  const k = key === undefined ? '' : `<span class="jk">${esc(key)}</span><span class="jp">: </span>`;
  if (val === null) return `<div class="jl">${k}<span class="jnull">null</span></div>`;
  if (Array.isArray(val) || typeof val === 'object') {
    const arr = Array.isArray(val);
    const entries = arr ? val.map((x, i) => [i, x]) : Object.entries(val);
    const meta = `<span class="jm">${arr ? `[${entries.length}]` : `{${entries.length}}`}</span>`;
    if (!entries.length) return `<div class="jl">${k}<span class="jm">${arr ? '[]' : '{}'}</span></div>`;
    const kids = entries.slice(0, 1000).map(([kk, vv]) => jsonTree(vv, kk, depth + 1)).join('') +
      (entries.length > 1000 ? `<div class="jl jm">… ${fmtN(entries.length - 1000)} de plus</div>` : '');
    return `<details class="jn" ${depth < 3 ? 'open' : ''}><summary>${k}${meta}</summary><div class="jc">${kids}</div></details>`;
  }
  if (typeof val === 'string') {
    // JSON encoded inside a string: show it parsed as well
    if (looksJson(val)) { const p = parseJson(val); if (p.ok) return jsonTree(p.val, key, depth); }
    return `<div class="jl">${k}<span class="jstr">"${esc(val)}"</span></div>`;
  }
  return `<div class="jl">${k}<span class="${typeof val === 'number' ? 'jnum' : 'jbool'}">${esc(String(val))}</span></div>`;
}

// ---------------------------------------------------------------- side panel
const PANEL_HTML = `<aside class="panel hidden"><div class="panel-resize"></div>
  <div class="panel-head"><button class="icon-btn" data-p="back" title="Retour">${ICON.left}</button>
    <div class="panel-title"><div class="pt"></div><div class="ps"></div></div>
    <span class="panel-actions"></span>
    <button class="icon-btn" data-p="close" title="Fermer (esc)">${ICON.x}</button></div>
  <div class="panel-fields hidden"></div>
  <div class="panel-body"></div></aside>`;

function setupPanel(t, el) {
  const p = (t.panel = $('.panel', el));
  t.pstack = [];
  const w = store('panelWidth'); if (w) p.style.width = w + 'px';
  p.addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    const a = b.dataset.p;
    const cur = t.pstack[t.pstack.length - 1];
    if (a === 'close') panelClose(t);
    if (a === 'back') { t.pstack.pop(); panelRender(t); }
    if (a === 'fields') { t.showFields = !t.showFields; panelRender(t); }
    if (a === 'open' && cur) openTable(cur.connId, cur.db, cur.table, { where: `${quoteIdent(cur.connId, cur.col)} = ${sqlLiteral(cur.value)}` });
    if (a === 'copy' && cur) {
      const pj = parseJson(cur.value);
      navigator.clipboard.writeText(pj.ok ? JSON.stringify(pj.val, null, 2) : String(cur.value)); toast('Copié');
    }
    if (a === 'expand') p.querySelectorAll('.panel-body details').forEach((d) => (d.open = true));
    if (a === 'collapse') p.querySelectorAll('.panel-body details').forEach((d, i) => (d.open = i === 0));
    if (a === 'link') panelShow(t, JSON.parse(b.dataset.e), { push: true });
    if (a === 'json') { const cur2 = t.pstack[t.pstack.length - 1]; const f = cur2.fields[+b.dataset.i]; panelShow(t, { kind: 'json', col: f.name, value: f.value }, { push: true }); }
    if (a === 'all' || a === 'none') {
      const hidden = a === 'all' ? [] : cur.columns.slice();
      store(fieldsKey(cur), hidden); panelRender(t);
    }
  });
  p.addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-col]'); if (!cb) return;
    const cur = t.pstack[t.pstack.length - 1];
    const hidden = new Set(store(fieldsKey(cur)) || []);
    cb.checked ? hidden.delete(cb.dataset.col) : hidden.add(cb.dataset.col);
    store(fieldsKey(cur), [...hidden]);
    panelRenderBody(t);
  });
  $('.panel-resize', p).addEventListener('mousedown', (e) => {
    const x0 = e.clientX, w0 = p.offsetWidth;
    const move = (ev) => { p.style.width = Math.max(260, Math.min(900, w0 + x0 - ev.clientX)) + 'px'; };
    const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); store('panelWidth', p.offsetWidth); };
    addEventListener('mousemove', move); addEventListener('mouseup', up); e.preventDefault();
  });
  t.grid._onEscape = () => panelClose(t);
}
const fieldsKey = (e) => `fields.${e.connId}|${e.db}|${e.table}`;

function panelShow(t, entry, { push = false } = {}) {
  if (push) t.pstack.push(entry); else t.pstack = [entry];
  t.panel.classList.remove('hidden');
  panelRender(t);
}
function panelClose(t) {
  t.pstack = []; t.panel.classList.add('hidden'); t.grid.focus();
}

async function panelRender(t) {
  const p = t.panel, cur = t.pstack[t.pstack.length - 1];
  if (!cur) return panelClose(t);
  $('[data-p=back]', p).style.display = t.pstack.length > 1 ? '' : 'none';
  const fieldsBox = $('.panel-fields', p), body = $('.panel-body', p), actions = $('.panel-actions', p);
  if (cur.kind === 'json') {
    $('.pt', p).textContent = cur.col;
    $('.ps', p).textContent = 'JSON';
    actions.innerHTML = `<button class="icon-btn" data-p="expand" title="Tout déplier">${ICON.expand}</button><button class="icon-btn" data-p="collapse" title="Tout replier">${ICON.collapse}</button><button class="icon-btn" data-p="copy" title="Copier le JSON indenté">${ICON.copy}</button>`;
    fieldsBox.classList.add('hidden');
    const pj = parseJson(cur.value);
    body.innerHTML = pj.ok ? `<div class="jtree">${jsonTree(pj.val)}</div>` : `<div class="panel-msg err">JSON invalide</div><pre class="raw">${esc(cur.value)}</pre>`;
    return;
  }
  // foreign key preview
  $('.pt', p).textContent = cur.table;
  $('.ps', p).textContent = `${cur.col} = ${cur.value}`;
  actions.innerHTML = `<button class="icon-btn ${t.showFields ? 'on' : ''}" data-p="fields" title="Champs à afficher">${ICON.columns}</button><button class="icon-btn" data-p="open" title="Ouvrir dans un onglet">${ICON.external}</button>`;
  if (!cur.loaded) {
    body.innerHTML = '<div class="panel-msg"><span class="spinner" style="display:inline-block"></span></div>';
    fieldsBox.classList.add('hidden');
    try {
      const [meta, res] = await Promise.all([getMeta(cur.connId, cur.db, cur.table), api.lookup(cur.connId, cur.db, cur.table, cur.col, cur.value)]);
      cur.meta = meta; cur.columns = res.columns; cur.row = res.row; cur.loaded = true;
    } catch (e) { cur.error = e.message; cur.loaded = true; }
    if (t.pstack[t.pstack.length - 1] !== cur) return; // navigated away meanwhile
  }
  if (cur.error) { body.innerHTML = `<div class="panel-msg err">${esc(cur.error)}</div>`; return; }
  if (t.showFields) {
    const hidden = new Set(store(fieldsKey(cur)) || []);
    fieldsBox.innerHTML = `<div class="pf-head"><span>Champs affichés</span><button data-p="all">Tous</button><button data-p="none">Aucun</button></div>` +
      cur.columns.map((c) => `<label class="pf"><input type="checkbox" data-col="${esc(c)}" ${hidden.has(c) ? '' : 'checked'}><span>${esc(c)}</span></label>`).join('');
    fieldsBox.classList.remove('hidden');
  } else fieldsBox.classList.add('hidden');
  panelRenderBody(t);
}

function panelRenderBody(t) {
  const cur = t.pstack[t.pstack.length - 1], body = $('.panel-body', t.panel);
  if (!cur || cur.kind !== 'fk' || !cur.loaded || cur.error) return;
  if (!cur.row) { body.innerHTML = `<div class="panel-msg">Aucune ligne où ${esc(cur.col)} = ${esc(String(cur.value))}</div>`; return; }
  const hidden = new Set(store(fieldsKey(cur)) || []);
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
  const n = cur.columns.length - cur.columns.filter((c) => hidden.has(c)).length;
  body.innerHTML = items || '<div class="panel-msg">Aucun champ sélectionné</div>';
  if (n < cur.columns.length) body.insertAdjacentHTML('beforeend', `<div class="panel-msg sm">${cur.columns.length - n} champ(s) masqué(s)</div>`);
}

// ---------------------------------------------------------------- ⌘K palette
const P = { items: [], sel: 0 };
const SYSTEM_DBS = new Set(['information_schema', 'performance_schema', 'mysql', 'sys']);

function fuzzy(q, s) {
  const l = s.toLowerCase();
  let qi = 0, score = 0, last = -2;
  const idx = [];
  for (let i = 0; i < l.length && qi < q.length; i++) {
    if (l[i] !== q[qi]) continue;
    if (last >= 0 && i - last > 1) score -= Math.min(3, (i - last - 1) * 0.5); // gaps cost
    idx.push(i);
    score += last === i - 1 ? 4 : 1;
    if (i === 0 || /[\s._\-/]/.test(l[i - 1])) score += 3;
    last = i; qi++;
  }
  if (qi < q.length) return null;
  if (l === q) score += 30; else if (l.startsWith(q)) score += 12;
  return { score: score - l.length * 0.05, idx };
}
function hl(s, idx) {
  if (!idx || !idx.length) return esc(s);
  const set = new Set(idx);
  return [...s].map((ch, i) => (set.has(i) ? `<b>${esc(ch)}</b>` : esc(ch))).join('');
}

function paletteSource() {
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

function paletteFilter() {
  const raw = $('#palette-input').value.trim().toLowerCase();
  const src = paletteSource();
  let out = [];
  if (!raw) {
    const rec = S.recent.map((r) => src.find((i) => i.kind === 'table' && i.run && i.label === r.table && i.sub.includes(connById(r.connId)?.name || '\0'))).filter(Boolean);
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
  paletteRender();
}

function paletteRender() {
  const list = $('#palette-list');
  if (!P.items.length) {
    const anyOpen = Object.values(S.live).some((l) => l.status === 'open');
    list.innerHTML = `<div class="p-empty">${anyOpen ? 'Aucun résultat' : 'Aucune connexion ouverte — choisis « Se connecter à … »'}</div>`;
    return;
  }
  let h = '', g = null;
  P.items.forEach((i, n) => {
    if (i.group && i.group !== g) { g = i.group; h += `<div class="p-group">${g}</div>`; }
    h += `<div class="p-item ${n === P.sel ? 'on' : ''}" data-n="${n}">${i.icon}<span class="t">${hl(i.label, i.idx)}</span><span class="s">${esc(i.sub || '')}${i.dot || ''}</span></div>`;
  });
  list.innerHTML = h;
  list.querySelector('.p-item.on')?.scrollIntoView({ block: 'nearest' });
}
function paletteRefresh() { if (!$('#palette').classList.contains('hidden')) { const s = P.sel; paletteFilter(); P.sel = Math.min(s, P.items.length - 1); paletteRender(); } }

function openPalette() {
  $('#palette').classList.remove('hidden');
  const inp = $('#palette-input');
  inp.value = ''; inp.focus();
  paletteFilter();
}
function closePalette() { $('#palette').classList.add('hidden'); }
function paletteRun(n) {
  const i = P.items[n]; if (!i) return;
  closePalette(); i.run();
}
$('#palette-input').addEventListener('input', paletteFilter);
$('#palette-input').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) { P.sel = Math.min(P.items.length - 1, P.sel + 1); paletteRender(); e.preventDefault(); }
  else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) { P.sel = Math.max(0, P.sel - 1); paletteRender(); e.preventDefault(); }
  else if (e.key === 'Enter') { paletteRun(P.sel); e.preventDefault(); }
  else if (e.key === 'Escape') closePalette();
});
$('#palette-list').addEventListener('mousemove', (e) => { const it = e.target.closest('.p-item'); if (it && +it.dataset.n !== P.sel) { P.sel = +it.dataset.n; paletteRender(); } });
$('#palette-list').addEventListener('click', (e) => { const it = e.target.closest('.p-item'); if (it) paletteRun(+it.dataset.n); });
$('#palette').addEventListener('mousedown', (e) => { if (e.target.id === 'palette') closePalette(); });

// ---------------------------------------------------------------- modals
function openModal(html, onMount) {
  const m = $('#modal');
  m.innerHTML = html; m.classList.remove('hidden');
  m.onmousedown = (e) => { if (e.target === m) closeModal(); };
  onMount?.(m.firstElementChild);
}
function closeModal() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }

function cellModal(col, v) {
  let text = v === null || v === undefined ? 'NULL' : String(v);
  try { if (/^[[{]/.test(text)) text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* not json */ }
  openModal(`<div class="modal cell-view"><h2>${esc(col)}</h2><pre>${esc(text)}</pre>
    <div class="modal-foot"><span class="msg">${fmtN(text.length)} caractères</span><button class="btn" data-a="copy">Copier</button><button class="btn primary" data-a="close">Fermer</button></div></div>`, (el) => {
    el.querySelector('[data-a=copy]').onclick = () => { navigator.clipboard.writeText(text); toast('Copié'); };
    el.querySelector('[data-a=close]').onclick = closeModal;
    el.querySelector('[data-a=close]').focus();
  });
}

function connModal(existing) {
  const c = existing ? { ...existing } : { type: 'postgres', name: '', host: 'localhost', port: '', user: '', database: '', ssl: false, file: '', color: '' };
  const field = (k, label, type = 'text', ph = '', cls = '') => `<label class="field ${cls}" data-f="${k}"><span>${label}</span><input type="${type}" name="${k}" placeholder="${esc(ph)}" value="${esc(c[k] ?? '')}" spellcheck="false"></label>`;
  openModal(`<div class="modal"><h2>${existing ? 'Modifier la connexion' : 'Nouvelle connexion'}</h2>
    <div class="form">
      <div class="field full"><div class="types">${Object.entries(TYPES).map(([k, v]) => `<button data-type="${k}" class="${c.type === k ? 'on' : ''}">${v.label}</button>`).join('')}</div></div>
      ${field('name', 'Nom', 'text', 'Prod, local…')}
      <div class="field"><span>Couleur</span><div class="colors">${COLORS.map((col) => `<button data-color="${col}" class="${(c.color || '') === col ? 'on' : ''}" style="background:${col || 'var(--ink-3)'}"></button>`).join('')}</div></div>
      ${field('host', 'Hôte', 'text', 'localhost', 'srv')}
      ${field('port', 'Port', 'number', '', 'srv')}
      ${field('user', 'Utilisateur', 'text', '', 'srv')}
      ${field('password', 'Mot de passe', 'password', existing?.hasPassword ? '•••••• (inchangé)' : '', 'srv')}
      ${field('database', 'Base par défaut', 'text', 'optionnel', 'srv')}
      <label class="field check srv"><input type="checkbox" name="ssl" ${c.ssl ? 'checked' : ''}><span>SSL</span></label>
      <div class="field full lite"><span>Fichier</span><div class="file-row"><input type="text" name="file" value="${esc(c.file || '')}" placeholder="/chemin/vers/base.sqlite" spellcheck="false" style="height:30px;border:1px solid var(--line-strong);border-radius:6px;background:var(--bg);padding:0 9px;outline:0">
        <button class="btn" data-a="pick">Ouvrir…</button><button class="btn" data-a="create">Créer…</button></div></div>
    </div>
    <div class="modal-foot">${existing ? '<button class="btn danger" data-a="delete">Supprimer</button>' : ''}<span class="msg"></span>
      <button class="btn" data-a="test">Tester</button><button class="btn" data-a="cancel">Annuler</button><button class="btn primary" data-a="save">Enregistrer</button></div></div>`, (el) => {
    const inp = (n) => el.querySelector(`[name=${n}]`);
    const msg = el.querySelector('.msg');
    const sync = () => {
      const sqlite = c.type === 'sqlite';
      el.querySelectorAll('.srv').forEach((x) => x.classList.toggle('hidden', sqlite));
      el.querySelector('.lite').classList.toggle('hidden', !sqlite);
      if (!sqlite) { inp('port').placeholder = TYPES[c.type].port; inp('user').placeholder = TYPES[c.type].user; }
    };
    sync();
    el.querySelectorAll('[data-type]').forEach((b) => b.onclick = () => { c.type = b.dataset.type; el.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('on', x === b)); sync(); });
    el.querySelectorAll('[data-color]').forEach((b) => b.onclick = () => { c.color = b.dataset.color; el.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b)); });
    const read = () => {
      const v = { ...c };
      ['name', 'host', 'port', 'user', 'password', 'database', 'file'].forEach((k) => (v[k] = inp(k).value.trim()));
      v.ssl = inp('ssl').checked;
      if (v.type !== 'sqlite') { v.port = v.port || String(TYPES[v.type].port); v.user = v.user || TYPES[v.type].user; v.host = v.host || 'localhost'; }
      if (!v.name) v.name = v.type === 'sqlite' ? (v.file.split(/[\\/]/).pop() || 'SQLite') : `${v.host}${v.database ? '/' + v.database : ''}`;
      return v;
    };
    const pick = async (mode) => { const f = await api.pickSqlite(mode); if (f) { inp('file').value = f; if (!inp('name').value) inp('name').value = f.split(/[\\/]/).pop(); } };
    el.querySelector('[data-a=pick]').onclick = () => pick('open');
    el.querySelector('[data-a=create]').onclick = () => pick('create');
    el.querySelector('[data-a=cancel]').onclick = closeModal;
    el.querySelector('[data-a=test]').onclick = async () => {
      msg.className = 'msg'; msg.textContent = 'Test…';
      try { await api.testConnection(read()); msg.className = 'msg ok'; msg.textContent = 'Connexion réussie'; }
      catch (e) { msg.className = 'msg bad'; msg.textContent = e.message; msg.title = e.message; }
    };
    el.querySelector('[data-a=save]').onclick = async () => {
      const v = read();
      if (v.type === 'sqlite' && !v.file) { msg.className = 'msg bad'; msg.textContent = 'Choisis un fichier'; return; }
      const saved = await api.saveConnection(v);
      closeModal();
      S.live[saved.id] = { status: 'off', open: false, dbs: [] };
      S.tabs.filter((t) => t.connId === saved.id).forEach((t) => { t.el = null; t.cols = null; t.loaded = false; });
      Object.keys(S.meta).forEach((k) => k.startsWith(saved.id + '|') && delete S.meta[k]);
      await loadConns(); renderTabs(); renderView();
      connect(saved.id);
    };
    el.querySelector('[data-a=delete]')?.addEventListener('click', async () => {
      if (!confirm(`Supprimer la connexion « ${existing.name} » ?`)) return;
      await api.deleteConnection(existing.id);
      delete S.live[existing.id];
      S.tabs = S.tabs.filter((t) => t.connId !== existing.id);
      if (!activeTab()) S.active = S.tabs[0]?.id || null;
      closeModal(); await loadConns(); renderTabs(); renderView(); saveSession();
    });
    inp(existing ? 'name' : (c.type === 'sqlite' ? 'file' : 'host')).focus();
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') el.querySelector('[data-a=save]').click(); });
  });
}

// ---------------------------------------------------------------- global shortcuts
addEventListener('keydown', (e) => {
  const mod = MAC ? e.metaKey : e.ctrlKey;
  if (e.key === 'Escape') {
    if (!$('#modal').classList.contains('hidden')) return closeModal();
    if (!$('#palette').classList.contains('hidden')) return closePalette();
    const t = activeTab();
    if (t?.panel && !t.panel.classList.contains('hidden') && !e.target.closest('input, textarea')) return panelClose(t);
  }
  if (!mod) return;
  const k = e.key.toLowerCase();
  const go = (fn) => { e.preventDefault(); fn(); };
  if (k === 'k' || k === 'p') return go(() => ($('#palette').classList.contains('hidden') ? openPalette() : closePalette()));
  if (!$('#modal').classList.contains('hidden')) return;
  if (k === 't') return go(() => openQuery());
  if (k === 'n') return go(() => connModal());
  if (k === 'w') return go(() => S.active && closeTab(S.active));
  if (k === 'r') return go(() => { const t = activeTab(); if (t?.kind === 'table') loadTable(t); else if (t) runQuery(t); });
  if (k === 'f') { const t = activeTab(); if (t?.kind === 'table') return go(() => { t.filterInput.focus(); t.filterInput.select(); }); }
  if (/^[1-9]$/.test(e.key)) return go(() => { const t = e.key === '9' ? S.tabs[S.tabs.length - 1] : S.tabs[+e.key - 1]; if (t) activate(t.id); });
  if (e.shiftKey && (e.key === '[' || e.key === ']' || e.code === 'BracketLeft' || e.code === 'BracketRight')) {
    return go(() => {
      const i = S.tabs.findIndex((t) => t.id === S.active); if (i < 0) return;
      const d = e.code === 'BracketLeft' ? -1 : 1;
      activate(S.tabs[(i + d + S.tabs.length) % S.tabs.length].id);
    });
  }
});

// ---------------------------------------------------------------- boot
(async function boot() {
  await loadConns();
  const sess = store('session');
  renderTabs(); renderView();
  if (!sess) { if (!S.conns.length) connModal(); return; }
  const ids = (sess.open || []).filter(connById);
  ids.forEach((id) => connect(id));
  for (const t of sess.tabs || []) {
    if (!connById(t.connId)) continue;
    if (t.kind === 'table') S.tabs.push({ id: uid(), kind: 'table', connId: t.connId, db: t.db, table: t.table, mode: 'data', page: 0, orderBy: null, dir: 'asc', where: '' });
    else S.tabs.push({ id: uid(), kind: 'query', connId: t.connId, db: t.db, sql: t.sql || '', title: `Requête ${S.tabs.filter((x) => x.kind === 'query').length + 1}` });
  }
  const act = S.tabs[sess.active] || S.tabs[0];
  if (act) activate(act.id); // other restored table tabs load when first shown
})();
