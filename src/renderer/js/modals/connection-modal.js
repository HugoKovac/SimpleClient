// Create / edit / delete a saved connection.
import { COLORS, TYPES } from '../config.js';
import { api } from '../api.js';
import { esc } from '../lib/html.js';
import { S, activeTab, resetLive, saveSession } from '../state.js';
import { forgetMeta } from '../meta.js';
import { connect, loadConns } from '../connections.js';
import { activate, renderTabs, renderView } from '../tabs.js';
import { closeModal, openModal } from './modal.js';

const INPUT_STYLE = 'height:30px;border:1px solid var(--line-strong);border-radius:6px;background:var(--bg);padding:0 9px;outline:0';
const fileName = (f) => f.split(/[\\/]/).pop();

export function connModal(existing) {
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
      <div class="field full lite"><span>Fichier</span><div class="file-row"><input type="text" name="file" value="${esc(c.file || '')}" placeholder="/chemin/vers/base.sqlite" spellcheck="false" style="${INPUT_STYLE}">
        <button class="btn" data-a="pick">Ouvrir…</button><button class="btn" data-a="create">Créer…</button></div></div>
    </div>
    <div class="modal-foot">${existing ? '<button class="btn danger" data-a="delete">Supprimer</button>' : ''}<span class="msg"></span>
      <button class="btn" data-a="test">Tester</button><button class="btn" data-a="cancel">Annuler</button><button class="btn primary" data-a="save">Enregistrer</button></div></div>`, (el) => {
    const inp = (n) => el.querySelector(`[name=${n}]`);
    const msg = el.querySelector('.msg');
    const say = (cls, text) => { msg.className = `msg ${cls}`; msg.textContent = text; msg.title = text; };
    const sync = () => {
      const sqlite = c.type === 'sqlite';
      el.querySelectorAll('.srv').forEach((x) => x.classList.toggle('hidden', sqlite));
      el.querySelector('.lite').classList.toggle('hidden', !sqlite);
      if (!sqlite) { inp('port').placeholder = TYPES[c.type].port; inp('user').placeholder = TYPES[c.type].user; }
    };
    sync();
    el.querySelectorAll('[data-type]').forEach((b) => (b.onclick = () => { c.type = b.dataset.type; el.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('on', x === b)); sync(); }));
    el.querySelectorAll('[data-color]').forEach((b) => (b.onclick = () => { c.color = b.dataset.color; el.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b)); }));
    const read = () => {
      const v = { ...c };
      ['name', 'host', 'port', 'user', 'password', 'database', 'file'].forEach((k) => (v[k] = inp(k).value.trim()));
      v.ssl = inp('ssl').checked;
      if (v.type !== 'sqlite') { v.port = v.port || String(TYPES[v.type].port); v.user = v.user || TYPES[v.type].user; v.host = v.host || 'localhost'; }
      if (!v.name) v.name = v.type === 'sqlite' ? (fileName(v.file) || 'SQLite') : `${v.host}${v.database ? '/' + v.database : ''}`;
      return v;
    };
    const pick = async (mode) => { const f = await api.pickSqlite(mode); if (f) { inp('file').value = f; if (!inp('name').value) inp('name').value = fileName(f); } };
    el.querySelector('[data-a=pick]').onclick = () => pick('open');
    el.querySelector('[data-a=create]').onclick = () => pick('create');
    el.querySelector('[data-a=cancel]').onclick = closeModal;
    el.querySelector('[data-a=test]').onclick = async () => {
      say('', 'Test…');
      try { await api.testConnection(read()); say('ok', 'Connexion réussie'); } catch (e) { say('bad', e.message); }
    };
    el.querySelector('[data-a=save]').onclick = async () => {
      const v = read();
      if (v.type === 'sqlite' && !v.file) return say('bad', 'Choisis un fichier');
      const saved = await api.saveConnection(v);
      closeModal();
      resetLive(saved.id);
      S.tabs.filter((t) => t.connId === saved.id).forEach((t) => { t.el = null; t.loaded = false; });
      forgetMeta(saved.id);
      await loadConns();
      if (S.active) activate(S.active); else { renderTabs(); renderView(); } // rebuilds and reloads the active tab
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
