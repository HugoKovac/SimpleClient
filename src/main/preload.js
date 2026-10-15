// Sandboxed preload: exposes a promise API over IPC as `window.api`.
// Handlers answer { ok, data, ms } | { ok: false, error, ms } (see ipc.js).
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
  checkUpdate: data('update:check'),
  downloadUpdate: data('update:download'),
  installUpdate: data('update:install'),
  openReleasePage: data('update:page'),
  /** @returns {() => void} unsubscribe */
  onUpdateProgress: (fn) => {
    const listener = (_e, p) => fn(p);
    ipcRenderer.on('update:progress', listener);
    return () => ipcRenderer.removeListener('update:progress', listener);
  },
});
