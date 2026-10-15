'use strict';
// IPC surface used by the preload bridge. Every handler answers
// { ok, data, ms } or { ok: false, error, ms } so errors cross the bridge as plain data.
const { ipcMain, dialog, BrowserWindow } = require('electron');
const { makeDriver } = require('./drivers');

async function envelope(fn) {
  const t0 = Date.now();
  try { return { ok: true, data: await fn(), ms: Date.now() - t0 }; }
  catch (err) { return { ok: false, error: err && err.message ? err.message : String(err), ms: Date.now() - t0 }; }
}
const handle = (name, fn) => ipcMain.handle(name, (_e, ...args) => envelope(() => fn(...args)));
/** Same, but `fn` also gets the calling webContents (to push events back to it). */
const handleWithSender = (name, fn) => ipcMain.handle(name, (e, ...args) => envelope(() => fn(e.sender, ...args)));

const SQLITE_FILTERS = [{ name: 'SQLite', extensions: ['sqlite', 'sqlite3', 'db', 'db3'] }, { name: 'Tous', extensions: ['*'] }];

async function pickSqlite(mode) {
  const win = BrowserWindow.getFocusedWindow();
  if (mode === 'create') {
    const r = await dialog.showSaveDialog(win, { filters: SQLITE_FILTERS, defaultPath: 'nouvelle.sqlite' });
    return r.canceled ? null : r.filePath;
  }
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: SQLITE_FILTERS });
  return r.canceled ? null : r.filePaths[0];
}

/**
 * @param {{ store: ReturnType<typeof import('./connections/store').createConnectionStore>,
 *           registry: import('./connections/registry').DriverRegistry,
 *           updater: ReturnType<typeof import('./updates').createUpdater> }} deps
 */
function registerIpc({ store, registry, updater }) {
  const driver = (id) => registry.get(id);

  handle('conn:list', () => store.list());
  handle('conn:save', (c) => {
    const saved = store.upsert(c);
    registry.drop(saved.id);
    return saved;
  });
  handle('conn:delete', (id) => { store.remove(id); registry.drop(id); });
  handle('conn:test', async (c) => {
    const d = makeDriver(store.forTest(c));
    try { await d.test(); } finally { await d.close(); }
  });
  handle('conn:open', async (id) => (await driver(id)).listDatabases());
  handle('conn:close', (id) => registry.drop(id));

  handle('db:tables', async (id, db) => (await driver(id)).listTables(db));
  handle('db:columns', async (id, db, t) => (await driver(id)).columns(db, t));
  handle('db:fks', async (id, db, t) => (await driver(id)).foreignKeys(db, t));
  handle('db:lookup', async (id, db, t, col, v) => (await driver(id)).lookup(db, t, col, v));
  handle('db:browse', async (id, db, t, o) => (await driver(id)).browse(db, t, o));
  handle('db:query', async (id, db, sql) => (await driver(id)).query(db, sql));

  handle('dialog:sqlite', pickSqlite);

  handle('update:check', () => updater.check());
  handleWithSender('update:download', (sender) => updater.download((p) => { if (!sender.isDestroyed()) sender.send('update:progress', p); }));
  handle('update:install', () => updater.install());
  handle('update:page', () => updater.openPage());
}

module.exports = { registerIpc };
