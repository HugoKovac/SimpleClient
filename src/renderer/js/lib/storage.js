// Namespaced JSON localStorage. Never throws: storage may be unavailable or full.
const PREFIX = 'simpleclient.';

export function load(key) {
  try { return JSON.parse(localStorage.getItem(PREFIX + key)); } catch { return null; }
}

export function save(key, val) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(val)); } catch { /* ignore */ }
}
