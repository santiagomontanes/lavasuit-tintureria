const { app, BrowserWindow, ipcMain } = require('electron');
const path     = require('path');
const Database = require('better-sqlite3');

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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('db:query', (_, sql, params = []) => db.prepare(sql).all(params));
ipcMain.handle('db:run',   (_, sql, params = []) => db.prepare(sql).run(params));
ipcMain.handle('db:get',   (_, sql, params = []) => db.prepare(sql).get(params));
