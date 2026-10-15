// Left tree: connections > databases > tables.
import { TYPES } from './config.js';
import { $ } from './lib/dom.js';
import { esc } from './lib/html.js';
import { ICON } from './lib/icons.js';
import { S, activeTab, connById, live } from './state.js';
import { connect, disconnect, loadTables } from './connections.js';
import { openQuery, openTable } from './tabs.js';
import { connModal } from './modals/connection-modal.js';
import { openPalette } from './palette/palette.js';

export function renderTree() {
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
    const indent = single ? 'padding-left:20px' : '';
    for (const d of L.dbs) {
      if (!single) {
        h += `<div class="node db ${d.open ? 'open' : ''}" data-act="toggle-db" data-conn="${c.id}" data-db="${esc(d.name)}">
          ${ICON.chev}${ICON.db}<span class="label">${esc(d.name)}</span>
          ${d.loading ? '<span class="spinner"></span>' : d.tables ? `<span class="meta">${d.tables.length}</span>` : ''}</div>`;
      }
      if (!single && !d.open) continue;
      if (d.tables && !d.tables.length) h += `<div class="node muted" style="${indent}">${d.error ? esc(d.error) : 'Aucune table'}</div>`;
      for (const t of d.tables || []) {
        const on = at && at.kind === 'table' && at.connId === c.id && at.db === d.name && at.table === t.name;
        h += `<div class="node tbl ${on ? 'active' : ''}" style="${indent}" data-act="open-table" data-conn="${c.id}" data-db="${esc(d.name)}" data-table="${esc(t.name)}">
          ${t.kind === 'view' ? ICON.view : ICON.table}<span class="label">${esc(t.name)}</span></div>`;
      }
    }
  }
  el.innerHTML = h;
  el.scrollTop = top;
}

export function initSidebar() {
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
}
