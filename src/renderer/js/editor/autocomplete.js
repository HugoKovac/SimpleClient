// Completion popup for SQL fields (query <textarea>, WHERE <input>): columns of the tables
// in the statement, `alias.` members, table names after FROM/JOIN, and keywords.
//
// Opens while typing a name (or after `.`), or on Ctrl+Space.
// ↑↓ choose, ↵/⇥ insert, esc close.
import { highlight, esc } from '../lib/html.js';
import { ICON } from '../lib/icons.js';
import { caretCoords } from './caret.js';
import { completionContext } from './sql-context.js';
import { suggest, tablesNeeded } from './suggest.js';

const KIND_ICON = { column: ICON.column, table: ICON.table, alias: ICON.table, keyword: ICON.query };
const TRIGGER = /[\w$."`]$/;

/**
 * Attach before the field's own keydown listeners: while open, it takes ↵ / ⇥ / esc.
 * @param {HTMLTextAreaElement | HTMLInputElement} ta
 * @param {{ dialect(): string, tables(): { name: string, kind?: string }[], columns(table: string): Promise<object[]> }} provider
 * @param {{ prefix?: () => string }} [opts] SQL that logically precedes the field's text
 */
export function attachAutocomplete(ta, provider, { prefix } = {}) {
  const box = document.createElement('div');
  box.className = 'ac hidden';
  ta.after(box);
  let items = [], sel = 0, typed = '', seq = 0, inserting = false, navigated = false;

  const isOpen = () => !box.classList.contains('hidden');
  const close = () => { seq++; box.classList.add('hidden'); items = []; };
  const contextAt = (pos) => completionContext(ta.value, pos, { prefix: prefix?.() });

  async function update(manual) {
    const pos = ta.selectionStart;
    if (pos !== ta.selectionEnd) return close();
    const ctx = contextAt(pos);
    if (!ctx || (!manual && !ctx.prefix && ctx.mode !== 'member')) return close();
    const my = ++seq;
    const tables = provider.tables();
    const needed = tablesNeeded(ctx, tables);
    const cols = await Promise.all(needed.map((t) => provider.columns(t).catch(() => [])));
    if (my !== seq) return; // typed again meanwhile
    const columns = new Map(needed.map((t, i) => [t, cols[i] || []]));
    const next = suggest(ctx, { dialect: provider.dialect(), tables, columns });
    typed = ta.value.slice(ctx.start, ctx.end);
    // nothing to offer, or the only option is what's already written
    if (!next.length || (next.length === 1 && next[0].insert === typed)) return close();
    items = next; sel = 0; navigated = false;
    render(ctx);
  }

  function render(ctx) {
    box.innerHTML = items.map((it, i) => `<div class="ac-item ${i === sel ? 'on' : ''}" data-i="${i}">
      <span class="ac-k ac-${it.kind}">${KIND_ICON[it.kind]}</span><span class="ac-l">${highlight(it.label, it.idx)}</span><span class="ac-d">${esc(it.detail)}</span></div>`).join('');
    box.classList.remove('hidden');
    const c = caretCoords(ta, ctx.start);
    const left = Math.max(0, Math.min(ta.offsetLeft + c.left - 26, ta.offsetLeft + ta.clientWidth - box.offsetWidth));
    let top = ta.offsetTop + c.top + c.height + 2;
    // not enough room below the caret inside the window: open above
    const below = window.innerHeight - (ta.getBoundingClientRect().top + c.top + c.height);
    if (below < box.offsetHeight + 8 && c.top > box.offsetHeight) top = ta.offsetTop + c.top - box.offsetHeight - 2;
    box.style.left = left + 'px';
    box.style.top = top + 'px';
  }

  function move(d) {
    sel = (sel + d + items.length) % items.length;
    navigated = true;
    box.querySelectorAll('.ac-item').forEach((el, i) => el.classList.toggle('on', i === sel));
    box.querySelector('.ac-item.on')?.scrollIntoView({ block: 'nearest' });
  }

  function accept(i) {
    const it = items[i];
    const ctx = contextAt(ta.selectionStart);
    close();
    if (!it || !ctx) return;
    inserting = true;
    ta.focus();
    ta.setSelectionRange(ctx.start, ctx.end);
    // execCommand keeps the native undo stack (⌘Z), unlike setRangeText
    if (!document.execCommand('insertText', false, it.insert)) ta.setRangeText(it.insert, ctx.start, ctx.end, 'end');
    inserting = false;
  }

  ta.addEventListener('keydown', (e) => {
    if (e.ctrlKey && (e.code === 'Space' || e.key === ' ')) { e.preventDefault(); update(true); return; }
    if (!isOpen()) return;
    const plain = !e.metaKey && !e.ctrlKey && !e.altKey;
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (e.key === 'ArrowDown' && plain) return stop(), move(1);
    if (e.key === 'ArrowUp' && plain) return stop(), move(-1);
    if (e.key === 'Escape') return stop(), close();
    if ((e.key === 'Tab' && plain && !e.shiftKey) || (e.key === 'Enter' && plain)) {
      // ↵ on a word that is already complete means "new line", not "insert the same thing"
      if (e.key === 'Enter' && !navigated && items[sel]?.insert === typed) return close();
      return stop(), accept(sel);
    }
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key) || !plain) close();
  });
  ta.addEventListener('input', (e) => {
    if (inserting) return;
    const typing = e.inputType?.startsWith('insert') && e.data && TRIGGER.test(e.data);
    if (typing || (isOpen() && e.inputType?.startsWith('delete'))) update(false);
    else close();
  });
  ta.addEventListener('blur', close);
  ta.addEventListener('mousedown', close);
  ta.addEventListener('scroll', () => isOpen() && close());
  box.addEventListener('mousedown', (e) => e.preventDefault()); // keep the focus in the editor
  box.addEventListener('mousemove', (e) => {
    const it = e.target.closest('.ac-item');
    if (it && +it.dataset.i !== sel) { sel = +it.dataset.i; box.querySelectorAll('.ac-item').forEach((el, i) => el.classList.toggle('on', i === sel)); }
  });
  box.addEventListener('click', (e) => { const it = e.target.closest('.ac-item'); if (it) accept(+it.dataset.i); });

  return { close, isOpen, update };
}
