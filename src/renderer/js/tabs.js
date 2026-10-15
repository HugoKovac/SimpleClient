// Tab bar and the view of the active tab.
import { MOD } from './config.js';
import { $ } from './lib/dom.js';
import { esc } from './lib/html.js';
import { uid } from './lib/format.js';
import { ICON } from './lib/icons.js';
import { S, activeTab, addRecent, connById, live, openConnIds, saveSession } from './state.js';
import { connect } from './connections.js';
import { renderTree } from './sidebar.js';
import { buildTableView, loadTable } from './views/table-view.js';
import { buildQueryView } from './views/query-view.js';
import { connModal } from './modals/connection-modal.js';

export const newTableTab = (connId, db, table, where = '') =>
  ({ id: uid(), kind: 'table', connId, db, table, mode: 'data', page: 0, orderBy: null, dir: 'asc', where });
export const newQueryTab = (connId, db, sql = '') =>
  ({ id: uid(), kind: 'query', connId, db, sql, title: `Requête ${S.tabs.filter((x) => x.kind === 'query').length + 1}` });

export function openTable(connId, db, table, { where } = {}) {
  let t = S.tabs.find((x) => x.kind === 'table' && x.connId === connId && x.db === db && x.table === table);
  if (!t) {
    t = newTableTab(connId, db, table, where);
    S.tabs.push(t);
  } else if (where !== undefined && t.where !== where) {
    t.where = where; t.page = 0;
    if (t.filterInput) t.filterInput.value = where;
    if (t.loaded) loadTable(t);
  }
  addRecent(connId, db, table);
  activate(t.id);
}

export function openQuery(connId, db, sql = '') {
  if (!connId) {
    const at = activeTab();
    connId = at?.connId || openConnIds()[0] || S.conns[0]?.id;
    db = db || at?.db;
  }
  if (!connId) return connModal();
  const L = live(connId);
  if (L.status !== 'open') connect(connId, { expand: false });
  db = db || connById(connId).database || L.dbs[0]?.name || '';
  const t = newQueryTab(connId, db, sql);
  S.tabs.push(t);
  activate(t.id);
  setTimeout(() => t.textarea?.focus(), 0);
}

export function closeTab(id) {
  const i = S.tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  S.tabs.splice(i, 1);
  if (S.active === id) S.active = (S.tabs[i] || S.tabs[i - 1])?.id || null;
  renderTabs(); renderView(); renderTree(); saveSession();
}

export function activate(id) {
  S.active = id;
  renderTabs(); renderView(); renderTree(); saveSession();
  const at = activeTab();
  if (at?.kind === 'table' && !at.loaded) { at.loaded = true; loadTable(at); }
  $(`.tab[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** Activates the tab `d` positions away from the active one (wraps around). */
export function cycleTab(d) {
  const i = S.tabs.findIndex((t) => t.id === S.active);
  if (i >= 0) activate(S.tabs[(i + d + S.tabs.length) % S.tabs.length].id);
}

export const tabTitle = (t) => (t.kind === 'table' ? t.table : t.title);

export function renderTabs() {
  $('#tabbar').innerHTML = S.tabs.map((t) => {
    const c = connById(t.connId);
    return `<div class="tab ${t.id === S.active ? 'active' : ''}" data-id="${t.id}" title="${esc(`${c?.name} · ${t.db}`)}">
      ${c?.color ? `<span class="bar" style="background:${c.color}"></span>` : ''}
      ${t.kind === 'table' ? ICON.table : ICON.query}<span class="t">${esc(tabTitle(t))}</span>
      <span class="sub">${esc(t.db || '')}</span>
      <button class="x" data-close="${t.id}">${ICON.x}</button></div>`;
  }).join('') + `<button class="tab-add" id="tab-add" title="Nouvelle requête">${ICON.plus}</button>`;
}

export function renderView() {
  const v = $('#view');
  const t = activeTab();
  v.replaceChildren();
  if (!t) {
    const k = (s) => `<kbd>${MOD.replace('+', '')}</kbd><kbd>${s}</kbd>`;
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

export function initTabs() {
  const bar = $('#tabbar');
  bar.addEventListener('click', (e) => {
    const x = e.target.closest('[data-close]');
    if (x) return closeTab(x.dataset.close);
    if (e.target.closest('#tab-add')) return openQuery();
    const t = e.target.closest('.tab');
    if (t) activate(t.dataset.id);
  });
  bar.addEventListener('auxclick', (e) => { const t = e.target.closest('.tab'); if (t && e.button === 1) closeTab(t.dataset.id); });
}
