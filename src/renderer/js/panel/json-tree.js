// Collapsible JSON tree as HTML (<details> elements, no script needed).
import { esc } from '../lib/html.js';
import { fmtN, looksJson, parseJson } from '../lib/format.js';

const MAX_CHILDREN = 1000;

export function jsonTree(val, key, depth = 0) {
  const k = key === undefined ? '' : `<span class="jk">${esc(key)}</span><span class="jp">: </span>`;
  if (val === null) return `<div class="jl">${k}<span class="jnull">null</span></div>`;
  if (typeof val === 'object') {
    const arr = Array.isArray(val);
    const entries = arr ? val.map((x, i) => [i, x]) : Object.entries(val);
    if (!entries.length) return `<div class="jl">${k}<span class="jm">${arr ? '[]' : '{}'}</span></div>`;
    const meta = `<span class="jm">${arr ? `[${entries.length}]` : `{${entries.length}}`}</span>`;
    const kids = entries.slice(0, MAX_CHILDREN).map(([kk, vv]) => jsonTree(vv, kk, depth + 1)).join('') +
      (entries.length > MAX_CHILDREN ? `<div class="jl jm">… ${fmtN(entries.length - MAX_CHILDREN)} de plus</div>` : '');
    return `<details class="jn" ${depth < 3 ? 'open' : ''}><summary>${k}${meta}</summary><div class="jc">${kids}</div></details>`;
  }
  if (typeof val === 'string') {
    // JSON encoded inside a string: show it parsed as well
    if (looksJson(val)) { const p = parseJson(val); if (p.ok) return jsonTree(p.val, key, depth); }
    return `<div class="jl">${k}<span class="jstr">"${esc(val)}"</span></div>`;
  }
  return `<div class="jl">${k}<span class="${typeof val === 'number' ? 'jnum' : 'jbool'}">${esc(String(val))}</span></div>`;
}
