// Pixel position of a character in a <textarea> or <input>, via a hidden mirror element.

const COPIED = [
  'boxSizing', 'width', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontStyle', 'fontVariant', 'fontWeight',
  'fontStretch', 'fontSize', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent',
  'letterSpacing', 'wordSpacing', 'tabSize',
];

let mirror;

/** @returns {{ top: number, left: number, height: number }} relative to the textarea's border box, scroll applied */
export function caretCoords(ta, pos) {
  if (!mirror) {
    mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    document.body.append(mirror);
  }
  const cs = getComputedStyle(ta);
  const st = mirror.style;
  for (const p of COPIED) st[p] = cs[p];
  st.position = 'absolute'; st.visibility = 'hidden'; st.top = '0'; st.left = '-9999px';
  const single = ta.tagName === 'INPUT'; // one line, scrolls horizontally
  st.whiteSpace = single ? 'pre' : 'pre-wrap'; st.overflowWrap = 'break-word'; st.overflow = 'hidden';
  if (single) st.width = 'auto';
  mirror.textContent = ta.value.slice(0, pos);
  const marker = document.createElement('span');
  marker.textContent = ta.value.slice(pos) || '.';
  mirror.append(marker);
  if (single) return { top: 0, left: marker.offsetLeft - ta.scrollLeft, height: ta.offsetHeight };
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
  return { top: marker.offsetTop - ta.scrollTop, left: marker.offsetLeft - ta.scrollLeft, height: lh };
}
