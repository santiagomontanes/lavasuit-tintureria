/* Auto-update integration con electron-updater + GitHub Releases.
 *
 * No bloquea el arranque: el chequeo automático corre 3 segundos después de
 * estar el window listo. La descarga puede dispararse manualmente desde el
 * renderer vía IPC 'updater:check'.
 *
 * Importante: no rompe el backend local ni los datos. El instalador NSIS
 * está configurado con deleteAppDataOnUninstall=false, así que `lavasuit.db`
 * y configuración del usuario sobreviven a una actualización. */

const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false;          // pedir confirmación al usuario
autoUpdater.autoInstallOnAppQuit = true;

let mainWindowRef = null;

const enviar = (canal, payload) => {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(canal, payload);
  }
};

/* GitHub `/releases/latest` solo devuelve releases de PRODUCCIÓN (no prereleases
 * ni drafts). Si el repo aún no tiene una release estable (p. ej. solo hay una
 * prerelease de prueba, o ninguna), electron-updater lanza un error tipo
 * "Unable to find latest version on GitHub / please ensure a production release
 * exists" (a veces con HttpError 404/406). NO es un fallo real: simplemente no
 * hay actualización estable disponible. Lo tratamos como "sin actualización"
 * para no asustar al usuario ni a los clientes. */
const esSinReleaseProduccion = (err) => {
  const msg = `${err?.message ?? err ?? ''}`;
  return /unable to find latest version|please ensure a production release|cannot parse releases feed|releases\/latest/i.test(msg)
    || /HttpError:\s*4(0[46])/i.test(msg)   // 404 (no latest) o 406 del feed
    || err?.statusCode === 404 || err?.statusCode === 406;
};

const registrarListeners = () => {
  autoUpdater.on('checking-for-update', () => {
    enviar('updater:event', { tipo: 'checking' });
  });
  autoUpdater.on('update-available', (info) => {
    enviar('updater:event', { tipo: 'available', version: info.version, releaseDate: info.releaseDate });
  });
  autoUpdater.on('update-not-available', (info) => {
    enviar('updater:event', { tipo: 'not-available', version: info.version });
  });
  autoUpdater.on('error', (err) => {
    // "Sin release de producción" no es un error para el usuario: es que no hay
    // versión estable publicada todavía (solo prerelease/ninguna).
    if (esSinReleaseProduccion(err)) {
      log.info('[updater] sin release de producción todavía; se ignora (no hay actualización estable).');
      enviar('updater:event', { tipo: 'not-available', motivo: 'sin-release-produccion' });
      return;
    }
    enviar('updater:event', { tipo: 'error', message: err?.message ?? String(err) });
  });
  autoUpdater.on('download-progress', (progress) => {
    enviar('updater:event', {
      tipo: 'progress',
      percent: Math.round(progress.percent ?? 0),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    enviar('updater:event', { tipo: 'downloaded', version: info.version });
  });
};

const setupUpdater = ({ mainWindow, ipcMain, app }) => {
  mainWindowRef = mainWindow;
  registrarListeners();

  // Chequeo en background al arrancar (excepto en dev).
  if (!app.isPackaged) {
    log.info('[updater] dev mode: chequeo automático deshabilitado');
  } else {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((e) => log.warn('[updater] check inicial falló', e?.message));
    }, 3000);
  }

  ipcMain.handle('updater:get-version', () => app.getVersion());

  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) {
      return { ok: false, motivo: 'dev', mensaje: 'En modo desarrollo no hay actualizaciones.' };
    }
    try {
      const res = await autoUpdater.checkForUpdates();
      return {
        ok: true,
        updateAvailable: !!res?.updateInfo && res.updateInfo.version !== app.getVersion(),
        currentVersion: app.getVersion(),
        latestVersion:  res?.updateInfo?.version ?? null,
        releaseDate:    res?.updateInfo?.releaseDate ?? null
      };
    } catch (e) {
      // Sin release estable publicada → no es error, es "estás al día".
      if (esSinReleaseProduccion(e)) {
        return {
          ok: true,
          updateAvailable: false,
          currentVersion: app.getVersion(),
          latestVersion: app.getVersion(),
          motivo: 'sin-release-produccion',
          mensaje: 'No hay una versión más reciente publicada.'
        };
      }
      return { ok: false, motivo: 'error', mensaje: e?.message ?? String(e) };
    }
  });

  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (e) {
      return { ok: false, mensaje: e?.message ?? String(e) };
    }
  });

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  });
};

module.exports = { setupUpdater };
