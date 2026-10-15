// Fuzzy subsequence matching, shared by ⌘K and the SQL autocomplete. Pure.

/**
 * Scores how well `q` (lowercase) matches `s` as a subsequence.
 * Consecutive characters, word starts and prefixes score higher.
 * @returns {{ score: number, idx: number[] } | null} null when `q` is not a subsequence of `s`
 */
export function fuzzy(q, s) {
  const l = s.toLowerCase();
  let qi = 0, score = 0, last = -2;
  const idx = [];
  for (let i = 0; i < l.length && qi < q.length; i++) {
    if (l[i] !== q[qi]) continue;
    if (last >= 0 && i - last > 1) score -= Math.min(3, (i - last - 1) * 0.5); // gaps cost
    idx.push(i);
    score += last === i - 1 ? 4 : 1;
    if (i === 0 || /[\s._\-/]/.test(l[i - 1])) score += 3;
    last = i; qi++;
  }
  if (qi < q.length) return null;
  if (l === q) score += 30; else if (l.startsWith(q)) score += 12;
  return { score: score - l.length * 0.05, idx };
}
