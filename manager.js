// Notes Manager: the only place a note record can be permanently deleted.
// Owns its own BrowserWindow (singleton) and IPC surface; note lifecycle
// actions (show/hide/delete/rename) are injected so this module never
// touches the store directly — main.js stays the single source of truth.
const path = require('path');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { registerShortcuts } = require('./shortcuts');

const MAX_TITLE_LENGTH = 80;

function sanitizeTitle(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH);
}

function createManagerModule({ store, actions }) {
  let win = null;

  function notifyChanged() {
    if (win && !win.isDestroyed()) {
      win.webContents.send('manager:notesChanged', store.all());
    }
  }

  function openManagerWindow() {
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
      return;
    }
    win = new BrowserWindow({
      width: 420,
      height: 580,
      minWidth: 340,
      minHeight: 360,
      title: 'Notes Manager',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'manager-preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    win.setMenuBarVisibility(false);
    registerShortcuts(win, {
      newNote: actions.createNote,
      toggleHideAll: actions.toggleHideAll,
      toggleGhostAll: actions.toggleGhostAll,
      openManager: openManagerWindow
    });
    win.loadFile('manager.html');
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => {
      win = null;
    });
  }

  ipcMain.handle('manager:list', () => store.all());
  ipcMain.handle('manager:version', () => app.getVersion());

  ipcMain.on('manager:new', () => actions.createNote());

  ipcMain.on('manager:open', (e, id) => {
    if (typeof id !== 'string') return;
    actions.showNote(id);
  });

  ipcMain.on('manager:hide', (e, id) => {
    if (typeof id !== 'string') return;
    actions.hideNote(id);
  });

  ipcMain.on('manager:rename', (e, payload) => {
    if (!payload || typeof payload.id !== 'string') return;
    actions.renameNote(payload.id, sanitizeTitle(payload.title));
  });

  ipcMain.on('manager:delete', async (e, id) => {
    if (typeof id !== 'string') return;
    const record = store.get(id);
    if (!record) return;
    const targetWindow = BrowserWindow.fromWebContents(e.sender) || undefined;
    const { response } = await dialog.showMessageBox(targetWindow, {
      type: 'warning',
      buttons: ['Cancel', 'Delete'],
      defaultId: 0,
      cancelId: 0,
      title: 'Delete note',
      message: 'Delete this note permanently?',
      detail: 'This cannot be undone. The note will be removed from this device.'
    });
    if (response === 1) actions.deleteNoteRecord(id);
  });

  return { openManagerWindow, notifyChanged };
}

module.exports = { createManagerModule };
