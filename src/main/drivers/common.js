'use strict';
// Helpers shared by every driver: value serialization and browse clauses.

function serialize(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isNaN(v) ? String(v) : v.toISOString();
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) {
    const b = Buffer.from(v);
    return `\\x${b.subarray(0, 64).toString('hex')}${b.length > 64 ? '…' : ''}`;
  }
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

const serializeRows = (rows) => rows.map((r) => r.map(serialize));

const orderClause = (q, o) => (o.orderBy ? ` order by ${q(o.orderBy)} ${o.dir === 'desc' ? 'desc' : 'asc'}` : '');
const whereClause = (o) => (o.where ? ` where ${o.where}` : '');

module.exports = { serialize, serializeRows, orderClause, whereClause };
