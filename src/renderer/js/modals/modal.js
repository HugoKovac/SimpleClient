// The single modal slot (#modal). One modal at a time.
import { $ } from '../lib/dom.js';

export function openModal(html, onMount) {
  const m = $('#modal');
  m.innerHTML = html; m.classList.remove('hidden');
  m.onmousedown = (e) => { if (e.target === m) closeModal(); };
  onMount?.(m.firstElementChild);
}

export function closeModal() { const m = $('#modal'); m.classList.add('hidden'); m.innerHTML = ''; }

export const isModalOpen = () => !$('#modal').classList.contains('hidden');
