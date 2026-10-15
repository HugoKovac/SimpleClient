const { app, BrowserWindow, ipcMain, dialog, safeStorage, nativeTheme, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { makeDriver } = require('./drivers');

const storeFile = () => path.join(app.getPath('userData'), 'connections.json');
const drivers = new Map(); // connection id -> driver

// ---------------------------------------------------------------- saved connections
function enc(s) {
  if (!s) return '';
  if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(s).toString('base64');
  return 'raw:' + Buffer.from(s).toString('base64');
}
function dec(s) {
  if (!s) return '';
  try {
    if (s.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(s.slice(4), 'base64'));
    if (s.startsWith('raw:')) return Buffer.from(s.slice(4), 'base64').toString();
  } catch { /* fallthrough */ }
  return '';
}
function loadConnections() {
  try { return JSON.parse(fs.readFileSync(storeFile(), 'utf8')); } catch { return []; }
}
function saveConnections(list) {
  fs.mkdirSync(path.dirname(storeFile()), { recursive: true });
  fs.writeFileSync(storeFile(), JSON.stringify(list, null, 2));
}
const publicConn = ({ password, ...c }) => ({ ...c, hasPassword: !!password });
const fullConn = (c) => ({ ...c, password: dec(c.password) });

// ---------------------------------------------------------------- IPC
function handle(name, fn) {
  ipcMain.handle(name, async (_e, ...args) => {
    const t0 = Date.now();
    try { return { ok: true, data: await fn(...args), ms: Date.now() - t0 }; }
    catch (err) { return { ok: false, error: err && err.message ? err.message : String(err), ms: Date.now() - t0 }; }
  });
}

// Cache the connecting promise so parallel calls share one driver.
function driverFor(id) {
  if (drivers.has(id)) return drivers.get(id);
  const p = (async () => {
    const c = loadConnections().find((x) => x.id === id);
    if (!c) throw new Error('Connexion introuvable');
    const d = makeDriver(fullConn(c));
    await d.test();
    return d;
  })();
  drivers.set(id, p);
  p.catch(() => { if (drivers.get(id) === p) drivers.delete(id); });
  return p;
}
async function dropDriver(id) {
  const p = drivers.get(id);
  drivers.delete(id);
  if (p) { try { await (await p).close(); } catch { /* ignore */ } }
}

handle('conn:list', () => loadConnections().map(publicConn));
handle('conn:save', (c) => {
  const list = loadConnections();
  const i = list.findIndex((x) => x.id === c.id);
  const prev = i >= 0 ? list[i] : null;
  const rec = {
    id: c.id || crypto.randomUUID(), name: c.name, type: c.type, color: c.color || '',
    host: c.host || '', port: c.port || '', user: c.user || '', database: c.database || '',
    ssl: !!c.ssl, file: c.file || '',
    // empty password on edit = keep the stored one
    password: c.password ? enc(c.password) : (prev ? prev.password : ''),
  };
  if (i >= 0) list[i] = rec; else list.push(rec);
  saveConnections(list);
  dropDriver(rec.id);
  return publicConn(rec);
});
handle('conn:delete', (id) => {
  saveConnections(loadConnections().filter((x) => x.id !== id));
  dropDriver(id);
});
handle('conn:test', async (c) => {
  let cfg = c;
  if (!c.password && c.id) {
    const prev = loadConnections().find((x) => x.id === c.id);
    if (prev) cfg = { ...c, password: dec(prev.password) };
  }
  const d = makeDriver(cfg);
  try { await d.test(); } finally { await d.close(); }
});
handle('conn:open', async (id) => { const d = await driverFor(id); return d.listDatabases(); });
handle('conn:close', (id) => dropDriver(id));
handle('db:tables', async (id, db) => (await driverFor(id)).listTables(db));
handle('db:columns', async (id, db, t) => (await driverFor(id)).columns(db, t));
handle('db:fks', async (id, db, t) => (await driverFor(id)).foreignKeys(db, t));
handle('db:lookup', async (id, db, t, col, v) => (await driverFor(id)).lookup(db, t, col, v));
handle('db:browse', async (id, db, t, o) => (await driverFor(id)).browse(db, t, o));
handle('db:query', async (id, db, sql) => (await driverFor(id)).query(db, sql));
handle('dialog:sqlite', async (mode) => {
  const win = BrowserWindow.getFocusedWindow();
  const filters = [{ name: 'SQLite', extensions: ['sqlite', 'sqlite3', 'db', 'db3'] }, { name: 'Tous', extensions: ['*'] }];
  if (mode === 'create') {
    const r = await dialog.showSaveDialog(win, { filters, defaultPath: 'nouvelle.sqlite' });
    return r.canceled ? null : r.filePath;
  }
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
  return r.canceled ? null : r.filePaths[0];
});

// ---------------------------------------------------------------- window
function createWindow() {
  const mac = process.platform === 'darwin';
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 760, minHeight: 480,
    title: 'SimpleClient',
    titleBarStyle: mac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#161616' : '#fbfbfa',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), { query: { platform: process.platform } });
}

app.whenReady().then(() => {
  // Keep standard Edit menu (copy/paste) but let the renderer own ⌘K, ⌘T, ⌘W…
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    { label: 'Affichage', submenu: [{ role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu', submenu: [{ role: 'minimize' }, { role: 'zoom' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { for (const id of [...drivers.keys()]) dropDriver(id); });
