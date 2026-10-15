// Pure HTML helpers (no DOM access): safe to import from Node tests.
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** Escapes `s`, wrapping the characters at positions `idx` in <b>. */
export function highlight(s, idx) {
  if (!idx || !idx.length) return esc(s);
  const set = new Set(idx);
  return [...s].map((ch, i) => (set.has(i) ? `<b>${esc(ch)}</b>` : esc(ch))).join('');
}
