// Query tab: SQL editor (with autocomplete) above a result grid.
import { MAX_QUERY_ROWS, MOD, modKey } from '../config.js';
import { api } from '../api.js';
import { $, spinner } from '../lib/dom.js';
import { esc } from '../lib/html.js';
import { fmtN } from '../lib/format.js';
import { ICON } from '../lib/icons.js';
import { connById, live, saveSession } from '../state.js';
import { forgetMeta } from '../meta.js';
import { loadTables } from '../connections.js';
import { attachGridEvents, renderGrid } from '../grid.js';
import { PANEL_HTML, setupPanel } from '../panel/panel.js';
import { renderTabs } from '../tabs.js';
import { attachAutocomplete } from '../editor/autocomplete.js';
import { schemaProvider } from '../editor/schema-provider.js';

const DDL = /\b(create|drop|alter|rename)\b/i;

export function buildQueryView(t) {
  const el = document.createElement('div');
  el.className = 'view';
  el.innerHTML = `
    <div class="toolbar">
      <span class="conn-name"></span>
      <select class="db-select"></select>
      <span class="sp"></span>
      <button class="btn primary" data-act="run">${ICON.play}Exécuter <kbd>${MOD.replace('+', '')}↵</kbd></button>
    </div>
    <div class="split">
      <div class="editor"><textarea spellcheck="false" placeholder="select * from …"></textarea></div>
      <div class="gutter"></div>
      <div class="results"><div class="body"><div class="grid-wrap"><div class="grid-msg">${MOD.replace('+', '')}↵ pour exécuter · la sélection seule si du texte est sélectionné · Ctrl+Espace pour compléter</div></div>${PANEL_HTML}</div>
        <div class="statusbar"><span class="st"></span><span class="sp"></span></div></div>
    </div>`;
  const ta = (t.textarea = $('textarea', el));
  ta.value = t.sql || '';
  t.grid = $('.grid-wrap', el);
  attachGridEvents(t.grid);
  t.cellEntry = (r, c, kind) => {
    const { columns, rows } = t.grid._data;
    return { kind: kind === 'json' ? 'json' : 'value', col: columns[c], value: rows[r][c] };
  };
  setupPanel(t, el);

  const c = connById(t.connId);
  $('.conn-name', el).innerHTML = `<span class="conn-dot" style="background:${c.color || 'var(--ink-3)'}"></span>${esc(c.name)}`;
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

  // registered before the editor's own keys so it can take ↵ / ⇥ while open
  attachAutocomplete(ta, schemaProvider(t.connId, () => t.db));
  ta.addEventListener('keydown', (e) => {
    if (modKey(e) && e.key === 'Enter') { e.preventDefault(); runQuery(t); }
    if (e.key === 'Tab' && !modKey(e)) {
      e.preventDefault();
      ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
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

export async function runQuery(t) {
  const ta = t.textarea;
  const sql = (ta.selectionStart !== ta.selectionEnd ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : ta.value).trim();
  if (!sql) return;
  const st = $('.st', t.el);
  st.innerHTML = `${spinner()} Exécution…`;
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
    if (DDL.test(sql)) {
      loadTables(t.connId, t.db, true);
      forgetMeta(t.connId);
    }
  } catch (e) {
    if (seq !== t.seq) return;
    t.grid.innerHTML = `<div class="grid-msg err">${esc(e.message)}</div>`;
    st.innerHTML = `<span class="bad">●</span> Erreur${e.ms != null ? ` · ${e.ms} ms` : ''}`;
  }
}
