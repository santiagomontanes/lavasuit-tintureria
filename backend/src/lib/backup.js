/* Módulo de respaldo de LavaSuit (manual y automático).
 *
 * Estrategia:
 *  1) Intenta `mysqldump` (respaldo .sql completo y restaurable directamente).
 *  2) Si mysqldump no está disponible, genera un respaldo JSON estructurado de
 *     todas las entidades vía Prisma (restauración asistida).
 *  3) Comprime a .zip si `archiver` está disponible.
 *
 * Seguridad:
 *  - La contraseña de MySQL se pasa por la variable de entorno MYSQL_PWD, NUNCA
 *    como argumento de línea de comandos (no queda en el process list).
 *  - El respaldo JSON OMITE los hashes de contraseña (Usuario.password y
 *    ConfiguracionEmpresa.configPasswordHash) — no se exporta material sensible.
 *  - No se borra ningún backup antiguo automáticamente.
 *
 * Carpeta destino: env BACKUP_DIR o `<cwd>/backups`.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const prisma = require('./prisma');

const BACKUP_DIR = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.join(process.cwd(), 'backups');

const MANIFEST = () => path.join(BACKUP_DIR, '_manifest.json');

const asegurarCarpeta = () => { fs.mkdirSync(BACKUP_DIR, { recursive: true }); };

/* Marca de tiempo local: YYYY-MM-DD_HH-mm-ss */
const timestamp = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_` +
         `${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
};

/* Parsea DATABASE_URL (mysql://user:pass@host:port/db) sin exponer la clave. */
const datosConexion = () => {
  const u = new URL(process.env.DATABASE_URL);
  return {
    host:     u.hostname,
    port:     u.port || '3306',
    user:     decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, '')
  };
};

const leerManifest = () => {
  try { return JSON.parse(fs.readFileSync(MANIFEST(), 'utf8')); }
  catch { return []; }
};
const escribirManifest = (lista) => {
  fs.writeFileSync(MANIFEST(), JSON.stringify(lista, null, 2), 'utf8');
};

/* mysqldump → archivo .sql. Resuelve true si funcionó, lanza si no está. */
const intentarMysqldump = (sqlPath) => new Promise((resolve, reject) => {
  const c = datosConexion();
  const args = [
    '-h', c.host, '-P', String(c.port), '-u', c.user,
    '--no-tablespaces', '--single-transaction', '--skip-lock-tables',
    '--routines', '--events', c.database
  ];
  const env = { ...process.env, MYSQL_PWD: c.password };
  let dump;
  try {
    dump = spawn('mysqldump', args, { env, windowsHide: true });
  } catch (e) { reject(e); return; }

  const out = fs.createWriteStream(sqlPath);
  let stderr = '';
  dump.on('error', (e) => { out.destroy(); reject(e); });          // ENOENT si no existe
  dump.stderr.on('data', (d) => { stderr += d.toString(); });
  dump.stdout.pipe(out);
  out.on('error', reject);
  dump.on('close', (code) => {
    out.end();
    if (code === 0) resolve(true);
    else reject(new Error(`mysqldump salió con código ${code}: ${stderr.slice(0, 500)}`));
  });
});

/* Respaldo JSON estructurado de TODAS las entidades (fallback). */
const generarJson = async (jsonPath) => {
  const [
    usuarios, clientes, servicios, marcas, colores, pedidos, pedidoItems, pagos,
    garantias, gastos, cajaCierres, cajaSesiones, sesionesTrabajo,
    consolidaciones, estadoHistorial, edicionHistorial, evidenciasEntrega,
    configuracion, configAuditoria
  ] = await Promise.all([
    prisma.usuario.findMany(),
    prisma.cliente.findMany(),
    prisma.servicio.findMany(),
    prisma.marca.findMany(),
    prisma.color.findMany(),
    prisma.pedido.findMany(),
    prisma.pedidoItem.findMany(),
    prisma.pago.findMany(),
    prisma.garantia.findMany(),
    prisma.gasto.findMany(),
    prisma.cajaCierre.findMany(),
    prisma.cajaSesion.findMany(),
    prisma.sesionTrabajo.findMany(),
    prisma.consolidacionDeuda.findMany(),
    prisma.pedidoEstadoHistorial.findMany(),
    prisma.pedidoEdicionHistorial.findMany(),
    prisma.evidenciaEntrega.findMany(),
    prisma.configuracionEmpresa.findMany(),
    prisma.configuracionAuditoria.findMany()
  ]);

  // Quitar material sensible (hashes de contraseña).
  const usuariosSeguros = usuarios.map(({ password, ...resto }) => ({ ...resto, password: '***OMITIDO***' }));
  const configSegura = configuracion.map(({ configPasswordHash, ...resto }) => ({ ...resto, configPasswordHash: configPasswordHash ? '***OMITIDO***' : null }));

  const data = {
    _meta: {
      formato: 'json',
      version: 1,
      generadoEn: new Date().toISOString(),
      nota: 'Respaldo estructurado por entidades. Las contraseñas (hashes) se omiten por seguridad.'
    },
    usuarios: usuariosSeguros,
    clientes, servicios, marcas, colores,
    pedidos, pedidoItems, pagos, garantias, gastos,
    cajaCierres, cajaSesiones, sesionesTrabajo,
    consolidacionesDeuda: consolidaciones,
    pedidoEstadoHistorial: estadoHistorial,
    pedidoEdicionHistorial: edicionHistorial,
    evidenciasEntrega,
    configuracionEmpresa: configSegura,
    configuracionAuditoria: configAuditoria
  };

  // Decimales de Prisma serializan como string; BigInt no se usa aquí.
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
};

/* Comprime un archivo con gzip (zlib nativo de Node, sin dependencias externas).
 * Produce `<src>.gz`, restaurable con `gunzip` / 7-Zip. Devuelve la ruta del
 * .gz o null si no se pudo comprimir. */
const comprimir = async (srcPath) => {
  const gzPath = `${srcPath}.gz`;
  try {
    await pipeline(
      fs.createReadStream(srcPath),
      zlib.createGzip({ level: 9 }),
      fs.createWriteStream(gzPath)
    );
    return gzPath;
  } catch (e) {
    console.warn('[backup] no se pudo comprimir (gzip):', e.message);
    try { if (fs.existsSync(gzPath)) fs.unlinkSync(gzPath); } catch {}
    return null;
  }
};

/* Genera un backup completo. Devuelve metadatos del archivo creado. */
const generarBackup = async ({ usuarioId = null, usuarioNombre = null, motivo = 'manual' } = {}) => {
  asegurarCarpeta();
  const ts = timestamp();
  const baseName = `lavasuit_backup_${ts}`;
  const sqlPath = path.join(BACKUP_DIR, `${baseName}.sql`);
  const jsonPath = path.join(BACKUP_DIR, `${baseName}.json`);

  let formato;
  let rutaCruda;
  try {
    await intentarMysqldump(sqlPath);
    formato = 'sql';
    rutaCruda = sqlPath;
  } catch (e) {
    // mysqldump ausente o falló → fallback JSON.
    console.warn('[backup] mysqldump no disponible, usando JSON:', e.message);
    try { if (fs.existsSync(sqlPath)) fs.unlinkSync(sqlPath); } catch {}
    await generarJson(jsonPath);
    formato = 'json';
    rutaCruda = jsonPath;
  }

  // Comprimir si se puede; si el zip se crea, el artefacto final es el zip.
  let rutaFinal = rutaCruda;
  let comprimido = false;
  const zip = await comprimir(rutaCruda);
  if (zip) {
    try { fs.unlinkSync(rutaCruda); } catch {}
    rutaFinal = zip;
    comprimido = true;
  }

  // Resolver nombre de usuario si solo tenemos id.
  let nombre = usuarioNombre;
  if (!nombre && usuarioId) {
    try {
      const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { nombre: true } });
      nombre = u?.nombre ?? null;
    } catch {}
  }

  const stat = fs.statSync(rutaFinal);
  const entrada = {
    archivo:    path.basename(rutaFinal),
    ruta:       rutaFinal,
    formato,                       // 'sql' | 'json'
    comprimido,                    // bool
    tamanoBytes: stat.size,
    usuarioId,
    usuarioNombre: nombre,
    motivo,                        // 'manual' | 'cierre-dia-automatico'
    createdAt:  new Date().toISOString()
  };

  const manifest = leerManifest();
  manifest.unshift(entrada);
  escribirManifest(manifest);

  console.log('[backup] generado', { archivo: entrada.archivo, formato, comprimido, motivo });
  return entrada;
};

/* Lista backups del manifest que aún existen en disco (tamaño actualizado). */
const listarBackups = () => {
  asegurarCarpeta();
  const manifest = leerManifest();
  const backups = manifest
    .filter((b) => fs.existsSync(b.ruta))
    .map((b) => {
      let tamanoBytes = b.tamanoBytes;
      try { tamanoBytes = fs.statSync(b.ruta).size; } catch {}
      return { ...b, tamanoBytes };
    });
  return { carpeta: BACKUP_DIR, backups };
};

module.exports = { generarBackup, listarBackups, BACKUP_DIR };
