// "Nouvelle version disponible": download the DMG with progress, then open it.
import { api } from '../api.js';
import { esc } from '../lib/html.js';
import { ICON } from '../lib/icons.js';
import * as storage from '../lib/storage.js';
import { closeModal, isModalOpen, openModal } from './modal.js';

const FIRST_CHECK_DELAY = 4000;
const CHECK_EVERY = 6 * 3600 * 1000;
const MAX_NOTES = 1500;

const mb = (n) => (n / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo';

export function updateModal(u) {
  const notes = u.notes.trim();
  openModal(`<div class="modal update">
    <h2>SimpleClient ${esc(u.version)} est disponible</h2>
    <p class="update-sub">Version installée : ${esc(u.current)}${u.publishedAt ? ` · publiée le ${new Date(u.publishedAt).toLocaleDateString('fr-FR')}` : ''}</p>
    ${notes ? `<pre class="update-notes">${esc(notes.length > MAX_NOTES ? notes.slice(0, MAX_NOTES) + '…' : notes)}</pre>` : ''}
    <div class="update-progress hidden"><div class="bar"><span></span></div><span class="pct"></span></div>
    <div class="modal-foot">
      <button class="btn" data-a="skip">Ignorer cette version</button><span class="msg"></span>
      <button class="btn" data-a="later">Plus tard</button>
      <button class="btn primary" data-a="download">${ICON.download}${u.downloadable ? `Télécharger${u.size ? ` (${mb(u.size)})` : ''}` : 'Voir la release'}</button>
    </div></div>`, (el) => {
    const msg = el.querySelector('.msg'), btn = el.querySelector('[data-a=download]');
    const progress = el.querySelector('.update-progress');
    let file = null;
    el.querySelector('[data-a=later]').onclick = closeModal;
    el.querySelector('[data-a=skip]').onclick = () => { storage.save('update.skip', u.version); closeModal(); };
    btn.onclick = async () => {
      if (!u.downloadable) { api.openReleasePage(); return closeModal(); }
      if (file) { await api.installUpdate().catch((e) => (msg.textContent = e.message)); return; }
      btn.disabled = true; msg.className = 'msg'; msg.textContent = '';
      progress.classList.remove('hidden');
      const off = api.onUpdateProgress(({ received, total }) => {
        const pct = total ? Math.round((received / total) * 100) : 0;
        progress.querySelector('.bar span').style.width = pct + '%';
        progress.querySelector('.pct').textContent = total ? `${pct} % · ${mb(received)} / ${mb(total)}` : mb(received);
      });
      try {
        file = await api.downloadUpdate();
        progress.querySelector('.pct').textContent = `Enregistré : ${file.split('/').slice(-2).join('/')}`;
        progress.querySelector('.pct').title = file;
        el.querySelector('[data-a=skip]').remove();
        btn.innerHTML = 'Ouvrir l’installeur';
        el.querySelector('.update-sub').textContent = 'Glisse SimpleClient dans Applications pour remplacer l’ancienne version, puis relance l’app.';
      } catch (e) {
        msg.className = 'msg bad'; msg.textContent = e.message; msg.title = e.message;
        progress.classList.add('hidden');
      } finally { off(); btn.disabled = false; }
    };
    btn.focus();
  });
}

async function check() {
  try {
    const u = await api.checkUpdate();
    if (!u || storage.load('update.skip') === u.version) return;
    if (isModalOpen()) return setTimeout(check, 60 * 1000); // don't interrupt a form
    updateModal(u);
  } catch { /* offline or rate-limited: try again later */ }
}

export function scheduleUpdateChecks() {
  setTimeout(check, FIRST_CHECK_DELAY);
  setInterval(check, CHECK_EVERY);
}
