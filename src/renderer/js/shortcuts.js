// Global keyboard shortcuts (the menu leaves ⌘K, ⌘T, ⌘W… to the renderer).
import { modKey } from './config.js';
import { S, activeTab } from './state.js';
import { activate, closeTab, cycleTab, openQuery } from './tabs.js';
import { loadTable } from './views/table-view.js';
import { runQuery } from './views/query-view.js';
import { isPanelOpen, panelClose } from './panel/panel.js';
import { closePalette, isPaletteOpen, togglePalette } from './palette/palette.js';
import { closeModal, isModalOpen } from './modals/modal.js';
import { connModal } from './modals/connection-modal.js';

export function initShortcuts() {
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isModalOpen()) return closeModal();
      if (isPaletteOpen()) return closePalette();
      const t = activeTab();
      if (t && isPanelOpen(t) && !e.target.closest('input, textarea')) return panelClose(t);
    }
    if (!modKey(e)) return;
    const k = e.key.toLowerCase();
    const go = (fn) => { e.preventDefault(); fn(); };
    if (k === 'k' || k === 'p') return go(togglePalette);
    if (isModalOpen()) return;
    if (k === 't') return go(() => openQuery());
    if (k === 'n') return go(() => connModal());
    if (k === 'w') return go(() => S.active && closeTab(S.active));
    if (k === 'r') return go(() => { const t = activeTab(); if (t?.kind === 'table') loadTable(t); else if (t) runQuery(t); });
    if (k === 'f') { const t = activeTab(); if (t?.kind === 'table') return go(() => { t.filterInput.focus(); t.filterInput.select(); }); }
    if (/^[1-9]$/.test(e.key)) return go(() => { const t = e.key === '9' ? S.tabs[S.tabs.length - 1] : S.tabs[+e.key - 1]; if (t) activate(t.id); });
    if (e.shiftKey && (e.key === '[' || e.key === ']' || e.code === 'BracketLeft' || e.code === 'BracketRight')) return go(() => cycleTab(e.code === 'BracketLeft' ? -1 : 1));
  });
}
