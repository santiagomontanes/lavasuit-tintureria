const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path     = require('path');
const fs       = require('fs');
const Database = require('better-sqlite3');
const { setupUpdater } = require('./updater');
const { autoUpdateBackendIfNeeded } = require('./backend-updater');
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

  // Tras actualizar el Desktop (electron-updater), sincronizar el backend
  // instalado: db push aditivo + generate + PM2 restart + autostart + /health.
  // No bloquea la UI; solo corre si el backend ya está instalado en este PC.
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdateBackendIfNeeded({ app }).catch((e) =>
        console.warn('[backend-updater] fallo no controlado:', e?.message)
      );
    }, 6000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('db:query', (_, sql, params = []) => db.prepare(sql).all(params));
ipcMain.handle('db:run',   (_, sql, params = []) => db.prepare(sql).run(params));
ipcMain.handle('db:get',   (_, sql, params = []) => db.prepare(sql).get(params));

/* Borra la copia LOCAL de datos operativos de este escritorio tras un
 * "Restablecer operación". Conserva los catálogos (clientes y servicios) igual
 * que el servidor. La cola local se vacía también: si sobreviviera, volvería a
 * subir lo que se acaba de borrar. */
ipcMain.handle('db:reset-operacion', () => {
  const operativas = ['pedido_items', 'pedidos', 'sync_queue'];
  const borradas = {};
  for (const t of operativas) {
    try {
      const antes = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()?.n ?? 0;
      db.prepare(`DELETE FROM ${t}`).run();
      borradas[t] = antes;
    } catch (e) {
      console.warn('[db:reset-operacion]', t, e?.message);
    }
  }
  console.log('[db:reset-operacion] copia local del escritorio borrada', borradas);
  return { ok: true, borradas };
});

// Abrir una carpeta del sistema (p.ej. la carpeta de backups del servidor, si
// el backend corre en esta misma máquina). Devuelve '' si tuvo éxito.
ipcMain.handle('shell:open-path', async (_, ruta) => {
  try {
    if (!ruta || typeof ruta !== 'string') return 'Ruta inválida';
    return await shell.openPath(ruta); // '' = ok; string = mensaje de error
  } catch (e) {
    return e?.message || 'No se pudo abrir la carpeta';
  }
});

/* Guardar una exportación en disco eligiendo la ubicación.
 * Devuelve la ruta final para que la UI pueda mostrarla. */
ipcMain.handle('export:guardar-archivo', async (_, { nombreSugerido, datos, filtros } = {}) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Guardar exportación',
      defaultPath: path.join(app.getPath('documents'), nombreSugerido || 'export.xlsx'),
      filters: Array.isArray(filtros) && filtros.length > 0
        ? filtros
        : [{ name: 'Libro de Excel', extensions: ['xlsx'] }]
    });
    if (canceled || !filePath) return { ok: false, cancelado: true };

    await fs.promises.writeFile(filePath, Buffer.from(datos ?? []));
    return { ok: true, ruta: filePath };
  } catch (e) {
    return { ok: false, error: e?.message || 'No se pudo guardar el archivo' };
  }
});

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
