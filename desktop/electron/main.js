const { app, BrowserWindow, ipcMain } = require('electron');
const path     = require('path');
const Database = require('better-sqlite3');
const { setupUpdater } = require('./updater');
const configStore = require('./config-store');
const backendInstaller = require('./backend-installer');

const isDev = process.env.NODE_ENV === 'development';
let db, mainWindow;

function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'lavasuit.db');
  db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS clientes (
      id TEXT PRIMARY KEY, nombre TEXT NOT NULL, telefono TEXT,
      email TEXT, direccion TEXT, sincronizado INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS servicios (
      id TEXT PRIMARY KEY, nombre TEXT NOT NULL,
      precio REAL NOT NULL, unidad TEXT DEFAULT 'prenda', activo INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS pedidos (
      id TEXT PRIMARY KEY, numero INTEGER, clienteId TEXT,
      clienteNombre TEXT, estado TEXT DEFAULT 'RECIBIDO',
      total REAL DEFAULT 0, notas TEXT, createdAt TEXT, sincronizado INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS pedido_items (
      id TEXT PRIMARY KEY, pedidoId TEXT, servicioId TEXT,
      servicioNombre TEXT, cantidad INTEGER, precio REAL, subtotal REAL
    );
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY, tabla TEXT NOT NULL,
      accion TEXT NOT NULL, datos TEXT NOT NULL, createdAt TEXT NOT NULL
    );
  `);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    autoHideMenuBar: true,
    title: 'LavaSuit'
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/renderer/index.html'));
  }
}

app.whenReady().then(() => {
  initDatabase();
  createWindow();
  setupUpdater({ mainWindow, ipcMain, app });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('db:query', (_, sql, params = []) => db.prepare(sql).all(params));
ipcMain.handle('db:run',   (_, sql, params = []) => db.prepare(sql).run(params));
ipcMain.handle('db:get',   (_, sql, params = []) => db.prepare(sql).get(params));

// ─── Configuración runtime del backend (apiHost/apiPort/apiProtocol) ───
// El renderer lee la config sincrónicamente al arrancar (config:get-sync)
// para que ENV.API_URL apunte al backend correcto sin necesidad de
// recompilar el .exe por cliente.
ipcMain.on('config:get-sync', (event) => {
  event.returnValue = configStore.read();
});
ipcMain.handle('config:get', () => configStore.read());
ipcMain.handle('config:set', (_, next) => configStore.write(next || {}));
ipcMain.handle('config:test', async (_, url) => {
  if (typeof url !== 'string' || !url) {
    return { ok: false, mensaje: 'URL vacía' };
  }
  const target = url.replace(/\/$/, '') + '/health';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(target, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, status: res.status, mensaje: `HTTP ${res.status}` };
    let data = null;
    try { data = await res.json(); } catch (_) {}
    return { ok: true, status: res.status, data };
  } catch (e) {
    const msg = e && e.name === 'AbortError' ? 'Timeout 5s' : (e && e.message) || String(e);
    return { ok: false, mensaje: msg };
  }
});

ipcMain.handle('server-installer:detect', async () => backendInstaller.detectAll());

ipcMain.handle('server-installer:elevate', async () => backendInstaller.relaunchAsAdmin());

ipcMain.handle('server-installer:copy', async (event) => {
  try {
    const result = backendInstaller.copyBackend((line) => {
      event.sender.send('server-installer:log', { stream: 'system', level: 'info', line });
    });
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

let preparingServer = false;
ipcMain.handle('server-installer:prepare', async (event, params = {}) => {
  if (preparingServer) return { ok: false, error: 'prepare-already-running' };
  preparingServer = true;
  try {
    const result = await backendInstaller.prepareServer(params || {}, (payload) => {
      event.sender.send('server-installer:log', payload);
    });
    event.sender.send('server-installer:done', result);
    return result;
  } finally {
    preparingServer = false;
  }
});
