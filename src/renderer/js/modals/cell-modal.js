// Full value of a cell (JSON pretty-printed).
import { toast } from '../lib/dom.js';
import { esc } from '../lib/html.js';
import { fmtN } from '../lib/format.js';
import { closeModal, openModal } from './modal.js';

export function cellModal(col, v) {
  let text = v === null || v === undefined ? 'NULL' : String(v);
  try { if (/^[[{]/.test(text)) text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* not json */ }
  openModal(`<div class="modal cell-view"><h2>${esc(col)}</h2><pre>${esc(text)}</pre>
    <div class="modal-foot"><span class="msg">${fmtN(text.length)} caractères</span><button class="btn" data-a="copy">Copier</button><button class="btn primary" data-a="close">Fermer</button></div></div>`, (el) => {
    el.querySelector('[data-a=copy]').onclick = () => { navigator.clipboard.writeText(text); toast('Copié'); };
    el.querySelector('[data-a=close]').onclick = closeModal;
    el.querySelector('[data-a=close]').focus();
  });
}
