'use strict';
const { BrowserWindow, nativeTheme } = require('electron');
const path = require('path');

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
  return win;
}

module.exports = { createWindow };
