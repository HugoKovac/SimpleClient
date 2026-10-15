// Renderer entry point (ES module, no build step).
import { MAC, MOD } from './config.js';
import { S, connById, loadSession } from './state.js';
import { connect, loadConns } from './connections.js';
import { initSidebar } from './sidebar.js';
import { activate, initTabs, newQueryTab, newTableTab, renderTabs, renderView } from './tabs.js';
import { initPalette } from './palette/palette.js';
import { initShortcuts } from './shortcuts.js';
import { connModal } from './modals/connection-modal.js';
import { scheduleUpdateChecks } from './modals/update-modal.js';

document.body.classList.toggle('mac', MAC);
document.querySelectorAll('kbd.mod').forEach((k) => (k.textContent = MOD + k.textContent));

initSidebar();
initTabs();
initPalette();
initShortcuts();

/** Restores open connections and tabs from the last session. */
async function boot() {
  await loadConns();
  renderTabs(); renderView();
  scheduleUpdateChecks();
  const sess = loadSession();
  if (!sess) { if (!S.conns.length) connModal(); return; }
  (sess.open || []).filter(connById).forEach((id) => connect(id));
  for (const t of sess.tabs || []) {
    if (!connById(t.connId)) continue;
    S.tabs.push(t.kind === 'table' ? newTableTab(t.connId, t.db, t.table) : newQueryTab(t.connId, t.db, t.sql || ''));
  }
  const act = S.tabs[sess.active] || S.tabs[0];
  if (act) activate(act.id); // other restored table tabs load when first shown
}

boot();
