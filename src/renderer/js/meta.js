// Table metadata (columns + foreign keys), cached per connection/db/table.
import { api } from './api.js';
import { S } from './state.js';

export function getMeta(connId, db, table, force) {
  const k = `${connId}|${db}|${table}`;
  if (!S.meta[k] || force) {
    S.meta[k] = (async () => {
      const [cols, fks] = await Promise.all([
        api.columns(connId, db, table).catch(() => []),
        api.foreignKeys(connId, db, table).catch(() => []),
      ]);
      return { cols, fks: new Map(fks.map((f) => [f.column, f])) };
    })();
  }
  return S.meta[k];
}

/** Drops cached metadata of a connection (after DDL or an edit of the connection). */
export function forgetMeta(connId) {
  Object.keys(S.meta).forEach((k) => k.startsWith(connId + '|') && delete S.meta[k]);
  S.tabs.filter((x) => x.kind === 'table' && x.connId === connId).forEach((x) => (x.cols = null));
}
