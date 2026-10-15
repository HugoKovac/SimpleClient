'use strict';
// Main process entry: wires the connection store, the driver registry, IPC and the window.
const { app, BrowserWindow, net, shell } = require('electron');
const path = require('path');
const cipher = require('./connections/cipher');
const { createConnectionStore } = require('./connections/store');
const { DriverRegistry } = require('./connections/registry');
const { makeDriver } = require('./drivers');
const { registerIpc } = require('./ipc');
const { createUpdater, repoSlug } = require('./updates');
const pkg = require('../../package.json');
const { installMenu } = require('./menu');
const { createWindow } = require('./window');

const store = createConnectionStore({ file: path.join(app.getPath('userData'), 'connections.json'), cipher });
const registry = new DriverRegistry((id) => store.resolve(id), makeDriver);

const updater = createUpdater({
  repo: repoSlug(pkg),
  currentVersion: app.getVersion(),
  arch: process.arch,
  platform: process.platform,
  // only packaged builds check, unless forced (to try it with `npm start`)
  enabled: app.isPackaged || !!process.env.SIMPLECLIENT_CHECK_UPDATES,
  fetch: (url, opts) => net.fetch(url, opts),
  downloadsDir: () => app.getPath('downloads'),
  openPath: (p) => shell.openPath(p),
  openExternal: (url) => shell.openExternal(url),
});

registerIpc({ store, registry, updater });

app.whenReady().then(() => {
  installMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { registry.dropAll(); });
