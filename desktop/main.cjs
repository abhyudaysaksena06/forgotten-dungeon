// The Forgotten Dungeon as a desktop app: the game server runs inside the app (no network, no
// lag from a remote host) and a window opens onto it, GPU-accelerated. Saves go to the user's
// app-data folder; the server code stays as plain files next to the app, so participants can open
// and fix the broken runes, then restart the app.
const { app, BrowserWindow, Menu, shell } = require('electron');
const net = require('node:net');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Use the dedicated GPU on laptops that have two, and never fall back to software rendering lists.
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-gpu-rasterization');
// Windows: draw through Direct3D 11 (the fastest, most reliable path for WebGL there).
if (process.platform === 'win32') app.commandLine.appendSwitch('use-angle', 'd3d11');

const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

async function start() {
  const port = await freePort();
  const root = path.join(__dirname, 'game');
  process.env.PORT = String(port);
  process.env.CLIENT_ORIGIN = `http://localhost:${port}`;
  process.env.QUEST_SAVES = path.join(app.getPath('userData'), 'saves');
  await import(pathToFileURL(path.join(root, 'server', 'src', 'index.js')).href);

  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    backgroundColor: '#161922',
    title: 'The Forgotten Dungeon',
    autoHideMenuBar: true,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false },
  });
  win.maximize();
  // F11 full screen, F12 developer tools (for the rune hunters).
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') win.setFullScreen(!win.isFullScreen());
    if (input.key === 'F12') win.webContents.toggleDevTools();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  const url = `http://localhost:${port}/`;
  for (let i = 0; i < 50; i++) {
    try {
      await win.loadURL(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

app.whenReady().then(start);
app.on('window-all-closed', () => app.quit());
