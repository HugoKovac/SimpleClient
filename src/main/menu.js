'use strict';
const { Menu } = require('electron');

// Keep the standard Edit menu (copy/paste) but let the renderer own ⌘K, ⌘T, ⌘W…
function installMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    {
      label: 'Affichage',
      submenu: [
        { role: 'toggleDevTools' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu', submenu: [{ role: 'minimize' }, { role: 'zoom' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { installMenu };
