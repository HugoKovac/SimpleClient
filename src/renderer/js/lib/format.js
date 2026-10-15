// Pure value formatting helpers (no DOM access).
import { esc } from './html.js';

export const fmtN = (n) => Number(n).toLocaleString('fr-FR');
export const uid = () => Math.random().toString(36).slice(2, 10);

export const shortType = (s) => String(s || '')
  .replace('character varying', 'varchar')
  .replace('timestamp without time zone', 'timestamp')
  .replace('timestamp with time zone', 'timestamptz')
  .replace('double precision', 'float8');

const NUMERIC = /^-?\d+(\.\d+)?$/;

/** Class and escaped HTML of a grid cell. */
export function cellHtml(v) {
  if (v === null || v === undefined) return { cls: 'null', html: 'NULL' };
  if (typeof v === 'number' || typeof v === 'boolean') return { cls: 'num', html: String(v) };
  const s = String(v);
  if (NUMERIC.test(s) && s.length < 30) return { cls: 'num', html: s };
  return { cls: '', html: esc(s.length > 300 ? s.slice(0, 300) + '…' : s.replace(/\n/g, '↵ ')) };
}

export function looksJson(v) {
  if (typeof v !== 'string' || v.length < 2) return false;
  const a = v[0], b = v[v.length - 1];
  return (a === '{' && b === '}') || (a === '[' && b === ']');
}

export function parseJson(v) {
  if (v !== null && typeof v === 'object') return { ok: true, val: v };
  try { return { ok: true, val: JSON.parse(v) }; } catch { return { ok: false }; }
}

export function sqlLiteral(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || (typeof v === 'string' && NUMERIC.test(v))) return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Quotes an identifier for the given connection type (backticks for MySQL). */
export function quoteIdent(type, name) {
  return type === 'mysql' ? '`' + name.replace(/`/g, '``') + '`' : '"' + name.replace(/"/g, '""') + '"';
}
