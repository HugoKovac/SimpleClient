// What the autocomplete knows about a database: dialect, tables, columns (cached metadata).
import { connById, live } from '../state.js';
import { getMeta } from '../meta.js';
import { loadTables } from '../connections.js';

/**
 * @param {string} connId
 * @param {() => string} getDb current database (it can change in a query tab)
 */
export function schemaProvider(connId, getDb) {
  return {
    dialect: () => connById(connId)?.type,
    tables: () => {
      const db = getDb();
      const d = live(connId).dbs.find((x) => x.name === db);
      if (d && !d.tables) loadTables(connId, db);
      return d?.tables || [];
    },
    columns: async (table) => (await getMeta(connId, getDb(), table)).cols,
  };
}
