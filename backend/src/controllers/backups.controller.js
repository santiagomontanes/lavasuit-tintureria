const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');
const { generarBackup, listarBackups } = require('../lib/backup');
const { backupDriveService } = require('../lib/googleDrive');

/* POST /api/backups/generar — solo ADMIN. Genera un respaldo manual. */
exports.generar = asyncHandler(async (req, res) => {
  try {
    const entrada = await generarBackup({
      usuarioId:     req.user?.id ?? null,
      usuarioNombre: req.user?.nombre ?? null,
      motivo:        'manual'
    });
    res.status(201).json(entrada);
  } catch (e) {
    console.error('[backups.generar] error:', e);
    throw new HttpError(500, `No se pudo generar el backup: ${e.message}`);
  }
});

/* GET /api/backups — solo ADMIN. Lista backups existentes + carpeta destino. */
exports.listar = asyncHandler(async (_req, res) => {
  res.json(listarBackups());
});

/* ── Google Drive ────────────────────────────────────────────────────────────
 * Mismo sistema que el proyecto de referencia: OAuth de escritorio, mysqldump a
 * un archivo temporal y subida a Drive, con registro de estado en la tabla
 * `backups` (CREATED | UPLOADING | DONE | ERROR).
 * ───────────────────────────────────────────────────────────────────────────*/

/* GET /api/backups/drive/estado — ¿hay credenciales y conexión? */
exports.driveEstado = asyncHandler(async (req, res) => {
  res.json(await backupDriveService.estado(req.user?.id ?? null));
});

/* POST /api/backups/drive/conectar — inicia el flujo OAuth.
 *
 * Devuelve de inmediato la URL de autorización para que el escritorio la abra
 * en el navegador. El servidor de callback (127.0.0.1:3017) queda escuchando y
 * guarda los tokens en segundo plano cuando el usuario autoriza. */
exports.driveConectar = asyncHandler(async (req, res) => {
  const userId = req.user?.id ?? null;

  let authUrl, esperaTokens;
  try {
    ({ authUrl, esperaTokens } = await backupDriveService.iniciarConexion(userId));
  } catch (e) {
    throw new HttpError(400, e.message);
  }

  esperaTokens
    .then(async (tokens) => {
      await backupDriveService.guardarTokens(tokens, userId);
      console.log('[backups.drive] Google Drive conectado', { usuarioId: userId });
    })
    .catch((e) => console.warn('[backups.drive] autorización no completada:', e?.message ?? e));

  res.json({
    ok: true,
    authUrl,
    mensaje: 'Abre el enlace y autoriza el acceso a Google Drive. La ventana se cierra sola al terminar.'
  });
});

/* POST /api/backups/drive/subir — genera el .sql y lo sube a Drive. */
exports.driveSubir = asyncHandler(async (req, res) => {
  try {
    const data = await backupDriveService.uploadBackupToDrive(req.user?.id ?? null);
    res.status(201).json(data);
  } catch (e) {
    const requiereReauth = /REAUTH_REQUIRED/.test(e?.message ?? '');
    throw new HttpError(requiereReauth ? 401 : 500, String(e.message).replace(/^REAUTH_REQUIRED:\s*/, ''));
  }
});

/* GET /api/backups/drive — historial de subidas. */
exports.driveListar = asyncHandler(async (_req, res) => {
  res.json(await backupDriveService.listBackups());
});
