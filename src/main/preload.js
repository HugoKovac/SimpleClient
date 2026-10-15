const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => async (...args) => {
  const r = await ipcRenderer.invoke(ch, ...args);
  if (!r.ok) { const e = new Error(r.error); e.ms = r.ms; throw e; }
  return { data: r.data, ms: r.ms };
};
const data = (ch) => async (...args) => (await call(ch)(...args)).data;

contextBridge.exposeInMainWorld('api', {
  listConnections: data('conn:list'),
  saveConnection: data('conn:save'),
  deleteConnection: data('conn:delete'),
  testConnection: data('conn:test'),
  openConnection: data('conn:open'),
  closeConnection: data('conn:close'),
  tables: data('db:tables'),
  columns: data('db:columns'),
  foreignKeys: data('db:fks'),
  lookup: data('db:lookup'),
  browse: call('db:browse'),
  query: call('db:query'),
  pickSqlite: data('dialog:sqlite'),
});
