/**
 * Actualización AUTOMÁTICA del backend tras actualizar el Desktop.
 *
 * electron-updater actualiza el .exe del Desktop y, al reabrirse, esta rutina:
 *   1. Compara la versión del Desktop con un marcador guardado junto al backend
 *      instalado (C:\LavaSuit\backend\.lavasuit-desktop-version).
 *   2. Si difieren y el backend YA está instalado, copia el backend nuevo
 *      empaquetado (preservando .env, node_modules, backups, logs y uploads) y
 *      ejecuta scripts/update-backend.ps1 (db push aditivo + generate con
 *      recuperación de lock + PM2 restart + autostart + /health).
 *   3. Al terminar OK, escribe el marcador con la versión actual.
 *
 * No bloquea el arranque ni la ventana. Nunca lanza: cualquier error se loguea.
 * En la PRIMERA instalación (sin backend aún) NO hace nada: de eso se encarga el
 * asistente de instalación (server-installer:prepare).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const log = require('electron-log');
const installer = require('./installer');

const IS_WIN = process.platform === 'win32';
const MARKER = '.lavasuit-desktop-version';

function markerPath() {
  return path.join(installer.BACKEND_TARGET, MARKER);
}

function readMarker() {
  try { return fs.readFileSync(markerPath(), 'utf-8').trim(); } catch { return null; }
}

function writeMarker(version) {
  try { fs.writeFileSync(markerPath(), String(version), 'utf-8'); } catch (e) {
    log.warn('[backend-updater] no se pudo escribir marcador:', e.message);
  }
}

/** Corre update-backend.ps1 (vía .bat) sin bloquear; resuelve con el exit code. */
function runUpdateScript() {
  return new Promise((resolve) => {
    const bat = path.join(installer.BACKEND_TARGET, 'scripts', 'update-backend.bat');
    const ps1 = path.join(installer.BACKEND_TARGET, 'scripts', 'update-backend.ps1');
    let cmd, args;
    if (IS_WIN && fs.existsSync(bat)) {
      cmd = 'cmd.exe';
      args = ['/c', bat, '-BackendDir', installer.BACKEND_TARGET];
    } else if (IS_WIN) {
      cmd = 'powershell';
      args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-BackendDir', installer.BACKEND_TARGET];
    } else {
      log.warn('[backend-updater] actualización automática solo soportada en Windows');
      resolve(0);
      return;
    }
    log.info('[backend-updater] ejecutando actualizador:', cmd, args.join(' '));
    const child = spawn(cmd, args, { windowsHide: true });
    child.stdout?.on('data', (d) => log.info('[update-backend]', d.toString('utf-8').trimEnd()));
    child.stderr?.on('data', (d) => log.warn('[update-backend]', d.toString('utf-8').trimEnd()));
    child.on('error', (e) => { log.error('[backend-updater] no se pudo lanzar el script:', e.message); resolve(-1); });
    child.on('close', (code) => { log.info('[backend-updater] script terminó con exit', code); resolve(code); });
  });
}

/**
 * Punto de entrada. Llamar tras app.whenReady (no await: corre en background).
 * @param {{ app: import('electron').App, onLog?: (msg:string)=>void }} ctx
 */
async function autoUpdateBackendIfNeeded({ app, onLog } = {}) {
  const say = (m) => { log.info('[backend-updater]', m); onLog && onLog(m); };
  try {
    if (!IS_WIN) { say('no-Windows: omitido'); return { ran: false, reason: 'no-windows' }; }

    const installed = installer.detectBackendInstalled();
    if (!installed.installed) {
      say('backend no instalado todavía: lo maneja el asistente de instalación');
      return { ran: false, reason: 'not-installed' };
    }

    const current = app.getVersion();
    const marker = readMarker();
    if (marker === current) {
      say(`backend ya sincronizado con Desktop v${current}`);
      return { ran: false, reason: 'up-to-date' };
    }

    say(`Desktop v${current} != backend marcado "${marker ?? '(ninguno)'}" → actualizando backend...`);

    // 1) Copiar backend nuevo (preserva .env/node_modules/backups/logs/uploads).
    try {
      const r = installer.copyBackend((line) => log.info('[backend-updater][copy]', line));
      say(`copia backend: ${r.copied} archivos, ${r.skipped} preservados`);
    } catch (e) {
      log.error('[backend-updater] copyBackend falló:', e.message);
      return { ran: false, reason: 'copy-failed', error: e.message };
    }

    // 2) Ejecutar el actualizador (db push + generate + PM2 + health).
    const code = await runUpdateScript();
    if (code === 0) {
      writeMarker(current);
      say(`backend actualizado a v${current} (OK)`);
      return { ran: true, ok: true };
    }
    say(`el actualizador terminó con código ${code}; revisa C:\\LavaSuit\\logs. El marcador NO se actualiza para reintentar al próximo arranque.`);
    return { ran: true, ok: false, code };
  } catch (e) {
    log.error('[backend-updater] excepción no controlada:', e && e.message);
    return { ran: false, reason: 'exception', error: e && e.message };
  }
}

module.exports = { autoUpdateBackendIfNeeded, markerPath };
