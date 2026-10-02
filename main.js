const { app, BrowserWindow, Tray, Menu, ipcMain, screen, globalShortcut, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const WIDTH = 440;
let win, tray, state;

const dataFile = () => path.join(app.getPath('userData'), 'notes.json');

const seed = () => ({
  edge: 'right',
  notes: [{
    id: 'welcome', title: 'Today', color: 0,
    items: [
      { id: 'a1', text: 'Click a tab to open a note', done: true },
      { id: 'a2', text: 'Enter adds a line, Ctrl+Enter ticks it', done: false },
      { id: 'a3', text: 'Esc or click away tucks it back in', done: false },
    ],
  }],
});

function load() {
  try {
    const s = JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
    state = { edge: s.edge === 'left' ? 'left' : 'right', notes: Array.isArray(s.notes) ? s.notes : [] };
  } catch {
    state = seed();
  }
}

function save() {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    const tmp = dataFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, dataFile());
  } catch (err) {
    console.error('save failed', err);
  }
}

function place() {
  const wa = screen.getPrimaryDisplay().workArea;
  win.setBounds({
    x: state.edge === 'left' ? wa.x : wa.x + wa.width - WIDTH,
    y: wa.y,
    width: WIDTH,
    height: wa.height,
  });
}

function setEdge(side) {
  state.edge = side;
  save();
  place();
  win.webContents.send('edge', side);
}

function toRenderer(channel) {
  win.focus();
  win.webContents.send(channel);
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: 'New note   Ctrl+Alt+N', click: () => toRenderer('new-note') },
    { type: 'separator' },
    { label: 'Dock on the left', type: 'radio', checked: state.edge === 'left', click: () => setEdge('left') },
    { label: 'Dock on the right', type: 'radio', checked: state.edge === 'right', click: () => setEdge('right') },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: 'separator' },
    { label: 'Quit Edge Notes', click: () => app.quit() },
  ]);
}

function createWindow() {
  win = new BrowserWindow({
    width: WIDTH, height: 600, show: false,
    frame: false, transparent: true, backgroundColor: '#00000000',
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, hasShadow: false, type: 'toolbar',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { place(); win.showInactive(); });
  win.on('blur', () => win.webContents.send('blur'));
  screen.on('display-metrics-changed', place);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('Edge Notes');
  tray.on('click', () => win.webContents.send('peek'));
  tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));
}

// Tell the renderer when the cursor leaves the strip, because click-through
// windows do not always deliver a mouseleave.
function watchCursor() {
  let inside = false;
  setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const now = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
    if (inside && !now) win.webContents.send('left');
    inside = now;
  }, 120);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => win && win.webContents.send('peek'));

  app.whenReady().then(() => {
    app.setAppUserModelId('dev.edgenotes.app');
    load();

    ipcMain.handle('load', () => state);
    ipcMain.on('save', (_e, notes) => { if (Array.isArray(notes)) { state.notes = notes; save(); } });
    ipcMain.on('ignore', (_e, v) => win.setIgnoreMouseEvents(v, v ? { forward: true } : undefined));
    ipcMain.on('focus', () => win.focus());
    // Toggling focusable hands keyboard focus back to the app underneath.
    ipcMain.on('release', () => { win.setFocusable(false); win.setFocusable(true); });
    ipcMain.on('menu', () => buildMenu().popup({ window: win }));

    createWindow();
    createTray();
    watchCursor();
    globalShortcut.register('Control+Alt+N', () => toRenderer('new-note'));
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => {});
}
