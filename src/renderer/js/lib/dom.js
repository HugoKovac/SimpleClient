export const $ = (s, el = document) => el.querySelector(s);

let toastTimer;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

export const spinner = (style = 'display:inline-block;vertical-align:-1px') => `<span class="spinner" style="${style}"></span>`;
