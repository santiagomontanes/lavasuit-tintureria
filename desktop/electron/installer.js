/**
 * Wizard de instalación del backend LavaSuit.
 *
 * Responsabilidades:
 *   - Detectar prerequisitos (Node, npm, MySQL, admin, backend ya instalado)
 *   - Copiar el backend empaquetado (resources/backend) a C:\LavaSuit\backend
 *     preservando .env, node_modules, backups y logs si ya existen.
 *   - Ejecutar npm install + bootstrap (modo no-interactivo) en el target,
 *     emitiendo cada línea de stdout/stderr al renderer.
 *   - Configurar firewall puerto 3000.
 *   - Relanzar la app como administrador si hace falta.
 *
 * No bloquea el event loop: todos los procesos hijos usan spawn streaming.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, execSync } = require('child_process');
const { app } = require('electron');

const IS_WIN = process.platform === 'win32';
const BACKEND_TARGET = IS_WIN ? 'C:\\LavaSuit\\backend' : path.join(app.getPath('home'), 'LavaSuit', 'backend');
const BACKEND_TARGET_ROOT = path.dirname(BACKEND_TARGET);

// Carpetas/archivos que NUNCA se sobrescriben si ya existen en el target.
const PRESERVE_NAMES = new Set(['.env', 'node_modules', 'backups', 'logs']);
const PRESERVE_RELATIVE = new Set([
  path.join('public', 'uploads').toLowerCase(),
]);
const MYSQL_SERVICE_NAME = 'MySQL80';
const SERVICE_STATES = new Set(['RUNNING', 'STOPPED', 'START_PENDING', 'STOP_PENDING', 'PAUSED']);

function bundledBackendPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'backend');
  return path.resolve(__dirname, '..', '..', 'backend');
}

function isAdmin() {
  if (!IS_WIN) return process.getuid && process.getuid() === 0;
  try { execSync('net session', { stdio: 'ignore' }); return true; } catch { return false; }
}

function which(cmd) {
  try {
    const out = execSync(IS_WIN ? `where ${cmd}` : `which ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return out.split(/\r?\n/)[0] || null;
  } catch { return null; }
}

function detectNode() {
  try {
    const v = execSync('node --version', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return { installed: true, version: v, path: which('node') };
  } catch { return { installed: false }; }
}
function detectNpm() {
  try {
    const v = execSync('npm --version', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return { installed: true, version: v };
  } catch { return { installed: false }; }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function probeMysqlTcp(host = '127.0.0.1', port = 3306, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const s = net.createConnection({ host, port });
    let settled = false;
    const done = (running) => { if (settled) return; settled = true; try { s.destroy(); } catch (_) {} resolve(running); };
    s.setTimeout(timeoutMs);
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
    s.once('timeout', () => done(false));
  });
}

function stripAnsi(raw) {
  return String(raw || '').replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

function parseScQuery(raw) {
  const text = stripAnsi(raw);
  if (/FAILED\s+1060|does not exist|no existe/i.test(text)) return 'NOT_FOUND';
  const state = text.match(/(?:^|[\r\n])\s*(?:STATE|ESTADO)\s*:\s*\d+\s+([A-Z_]+)/i);
  if (state) {
    const parsed = state[1].toUpperCase();
    if (SERVICE_STATES.has(parsed)) return parsed;
  }
  const numericState = text.match(/\b(?:1\s+(STOPPED)|2\s+(START_PENDING)|3\s+(STOP_PENDING)|4\s+(RUNNING)|7\s+(PAUSED))\b/i);
  if (numericState) return numericState.slice(1).find(Boolean).toUpperCase();
  return 'UNKNOWN';
}

function queryMysqlService() {
  if (!IS_WIN) return { exists: false, status: 'UNSUPPORTED', raw: '' };
  try {
    const out = execSync(`sc query ${MYSQL_SERVICE_NAME}`, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    const status = parseScQuery(out);
    return { exists: status !== 'NOT_FOUND', status, raw: out };
  } catch (e) {
    const raw = `${e.stdout ? e.stdout.toString() : ''}${e.stderr ? e.stderr.toString() : ''}`;
    const status = parseScQuery(raw);
    return { exists: status !== 'NOT_FOUND', status, raw };
  }
}

async function runCommand(cmd, args, opts = {}) {
  const timeoutMs = opts.timeoutMs || 60000;
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { shell: IS_WIN, windowsHide: true, cwd: opts.cwd, env: opts.env || process.env });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch (_) {}
      resolve({ ok: false, timedOut: true, code: null, stdout, stderr });
    }, timeoutMs);
    child.stdout?.on('data', (d) => { stdout += d.toString('utf-8'); });
    child.stderr?.on('data', (d) => { stderr += d.toString('utf-8'); });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, code: -1, error: error.message, stdout, stderr });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

async function waitForMysqlStatus(expected, timeoutMs, onStatus) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    const svc = queryMysqlService();
    if (svc.status !== last) {
      last = svc.status;
      onStatus && onStatus(svc);
    }
    if (!svc.exists) return svc;
    if (svc.status === expected) return svc;
    await sleep(1000);
  }
  return queryMysqlService();
}

async function startMysqlService(onLog) {
  onLog && onLog(`Iniciando servicio ${MYSQL_SERVICE_NAME}...`);
  const started = await runCommand('net', ['start', MYSQL_SERVICE_NAME], { timeoutMs: 60000 });
  if (!started.ok && !/already been started|ya se ha iniciado/i.test(`${started.stdout}\n${started.stderr}`)) {
    onLog && onLog(`net start ${MYSQL_SERVICE_NAME} devolvió exit ${started.code ?? 'timeout'}`);
  }
  return waitForMysqlStatus('RUNNING', 60000, (svc) => onLog && onLog(`Estado MySQL: ${svc.status}`));
}

async function recoverMysqlService(stuckStatus, onLog) {
  onLog && onLog(`MySQL está colgado en ${stuckStatus}. Intentando recuperación...`);
  await runCommand('taskkill', ['/F', '/IM', 'mysqld.exe'], { timeoutMs: 15000 });
  await sleep(3000);
  return startMysqlService(onLog);
}

async function ensureMysqlReady({ host = '127.0.0.1', port = 3306 } = {}, onLog) {
  if (!IS_WIN) {
    const tcp = await probeMysqlTcp(host, port, 3000);
    return tcp ? { ok: true, status: 'RUNNING' } : { ok: false, error: `MySQL no responde en ${host}:${port}` };
  }

  let svc = queryMysqlService();
  onLog && onLog(`raw sc query output:\n${stripAnsi(svc.raw || '').trim() || '(empty)'}`);
  onLog && onLog(`parsed state: ${svc.status}`);
  onLog && onLog(`Estado MySQL: ${svc.status}`);
  if (!svc.exists) {
    return { ok: false, error: 'MySQL no está instalado. Instala MySQL 8.0 Community Server y vuelve a intentar.' };
  }

  if (svc.status === 'UNKNOWN' && await probeMysqlTcp(host, port, 3000)) {
    onLog && onLog(`Warning: no se pudo parsear sc query, pero el puerto ${port} responde. Continuando.`);
    return { ok: true, status: 'RUNNING', warning: 'sc-query-unknown-port-open' };
  }

  if (svc.status === 'STOPPED') {
    svc = await startMysqlService(onLog);
  } else if (svc.status === 'START_PENDING' || svc.status === 'STOP_PENDING') {
    const pending = await waitForMysqlStatus('RUNNING', 15000, (next) => onLog && onLog(`Estado MySQL: ${next.status}`));
    if (pending.status === 'RUNNING') svc = pending;
    else svc = await recoverMysqlService(svc.status, onLog);
  } else if (svc.status === 'PAUSED') {
    return { ok: false, error: `MySQL está en estado PAUSED. Revisa el servicio ${MYSQL_SERVICE_NAME}.` };
  }

  if (svc.status !== 'RUNNING') {
    return { ok: false, error: 'No se pudo iniciar MySQL. Reinicia el computador o revisa el servicio MySQL80.' };
  }

  const tcpStart = Date.now();
  while (Date.now() - tcpStart < 60000) {
    if (await probeMysqlTcp(host, port, 1500)) {
      onLog && onLog(`MySQL listo: servicio RUNNING y puerto ${port} responde`);
      return { ok: true, status: 'RUNNING' };
    }
    onLog && onLog(`Esperando puerto MySQL ${port}...`);
    await sleep(1000);
  }

  return { ok: false, error: `MySQL80 está RUNNING pero el puerto ${port} no responde. No se ejecutará Prisma.` };
}

async function detectMysql() {
  const running = await probeMysqlTcp();
  let serviceStatus = null;
  let serviceExists = null;
  if (IS_WIN) {
    const svc = queryMysqlService();
    serviceStatus = svc.status;
    serviceExists = svc.exists;
  }
  return { running, port: 3306, serviceStatus, serviceExists, serviceName: MYSQL_SERVICE_NAME };
}

function detectBackendInstalled() {
  const serverJs = path.join(BACKEND_TARGET, 'server.js');
  return {
    installed: fs.existsSync(serverJs),
    target: BACKEND_TARGET,
    hasEnv: fs.existsSync(path.join(BACKEND_TARGET, '.env')),
    hasNodeModules: fs.existsSync(path.join(BACKEND_TARGET, 'node_modules')),
  };
}

function detectBundle() {
  const p = bundledBackendPath();
  const ok = fs.existsSync(path.join(p, 'server.js'));
  return { available: ok, path: p };
}

function detectPm2Process() {
  if (!which('pm2')) return { registered: false, online: false };
  try {
    const raw = execSync('pm2 jlist', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const list = JSON.parse(raw || '[]');
    const proc = list.find((p) => p && p.name === 'lavasuit-backend');
    return {
      registered: !!proc,
      online: proc?.pm2_env?.status === 'online',
      status: proc?.pm2_env?.status || null,
      pid: proc?.pid || null,
    };
  } catch (e) {
    return { registered: false, online: false, error: e.message };
  }
}

function detectFirewallRule(port = 3000) {
  if (!IS_WIN) return { configured: false, reason: 'no-windows' };
  const ruleName = `LavaSuit Backend ${port}`;
  try {
    const out = execSync(`netsh advfirewall firewall show rule name="${ruleName}"`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return { configured: /Enabled:\s+Yes/i.test(out) || /Habilitado:\s+S/i.test(out), ruleName };
  } catch (_) {
    return { configured: false, ruleName };
  }
}

async function detectAll() {
  const health = await probeHealth('http://127.0.0.1:3000/health', 2500);
  const ip = lanIp();
  const lanHealth = ip ? await probeHealth(`http://${ip}:3000/health`, 2500) : { ok: false, mensaje: 'sin IP LAN' };
  return {
    platform: process.platform,
    isAdmin: isAdmin(),
    appPackaged: app.isPackaged,
    node: detectNode(),
    npm: detectNpm(),
    mysql: await detectMysql(),
    backend: detectBackendInstalled(),
    bundle: detectBundle(),
    pm2: { installed: !!which('pm2'), path: which('pm2'), process: detectPm2Process() },
    firewall: detectFirewallRule(3000),
    health: { localhost: health, lan: lanHealth, lanIp: ip },
  };
}

function shouldPreserve(relativePath, name, exists) {
  if (!exists) return false;
  if (PRESERVE_NAMES.has(name)) return true;
  return PRESERVE_RELATIVE.has(relativePath.toLowerCase());
}

function copyRecursive(src, dst, relativeBase, onLog, counters) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const rel = path.join(relativeBase, entry.name);
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (shouldPreserve(rel, entry.name, fs.existsSync(dstPath))) {
      onLog && onLog(`  preservado (no se toca): ${rel}`);
      counters.skipped++;
      continue;
    }
    if (entry.isDirectory()) {
      copyRecursive(srcPath, dstPath, rel, onLog, counters);
    } else {
      fs.mkdirSync(path.dirname(dstPath), { recursive: true });
      fs.copyFileSync(srcPath, dstPath);
      counters.copied++;
    }
  }
}

/** Copia el backend bundle → C:\LavaSuit\backend.
 *  Preserva .env, node_modules, backups, logs y public/uploads si ya existen.
 *  Sobrescribe el resto del código fuente sin borrar datos del cliente. */
function copyBackend(onLog) {
  const log = (msg) => onLog && onLog(msg);
  const bundle = detectBundle();
  if (!bundle.available) throw new Error(`Backend empaquetado no encontrado en ${bundle.path}`);

  fs.mkdirSync(BACKEND_TARGET, { recursive: true });
  log(`Origen:  ${bundle.path}`);
  log(`Destino: ${BACKEND_TARGET}`);

  const counters = { copied: 0, skipped: 0 };
  copyRecursive(bundle.path, BACKEND_TARGET, '', log, counters);
  log(`✓ Copia completada (${counters.copied} archivos, ${counters.skipped} preservados)`);
  return { copied: counters.copied, skipped: counters.skipped, target: BACKEND_TARGET };
}

/** Ejecuta un proceso emitiendo cada línea de stdout/stderr a onLine.
 *  Resuelve con { ok, code }. */
function runStreaming(cmd, args, opts, onLine) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      ...opts,
      shell: IS_WIN, // permite resolver gradlew, npm, etc.
      windowsHide: true,
    });
    let stdoutBuf = '';
    let stderrBuf = '';
    const flush = (which, buf) => {
      const lines = buf.split(/\r?\n/);
      const tail = lines.pop() || '';
      for (const line of lines) if (onLine) onLine({ stream: which, line });
      return tail;
    };
    child.stdout?.on('data', (d) => { stdoutBuf = flush('stdout', stdoutBuf + d.toString('utf-8')); });
    child.stderr?.on('data', (d) => { stderrBuf = flush('stderr', stderrBuf + d.toString('utf-8')); });
    child.on('error', (err) => {
      if (onLine) onLine({ stream: 'stderr', line: `ERROR spawn: ${err.message}` });
      resolve({ ok: false, code: -1, error: err.message });
    });
    child.on('close', (code) => {
      if (stdoutBuf && onLine) onLine({ stream: 'stdout', line: stdoutBuf });
      if (stderrBuf && onLine) onLine({ stream: 'stderr', line: stderrBuf });
      resolve({ ok: code === 0, code });
    });
  });
}

async function openFirewall(onLog) {
  if (!IS_WIN) return { ok: false, reason: 'no-windows' };
  if (!isAdmin()) return { ok: false, reason: 'no-admin' };
  const port = 3000;
  const ruleName = `LavaSuit Backend ${port}`;
  const current = detectFirewallRule(port);
  if (current.configured) {
    onLog && onLog('EXISTS');
    return { ok: true, alreadyExists: true };
  }
  const r = await runStreaming(
    'netsh',
    ['advfirewall', 'firewall', 'add', 'rule', `name=${ruleName}`, 'dir=in', 'action=allow', 'protocol=TCP', `localport=${port}`],
    {},
    ({ line }) => onLog && onLog(line)
  );
  return { ok: r.ok, code: r.code };
}

async function probeHealth(url = 'http://127.0.0.1:3000/health', timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) {
        let data = null;
        try { data = await res.json(); } catch (_) {}
        return { ok: true, status: res.status, data };
      }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { ok: false, mensaje: `timeout ${timeoutMs}ms` };
}

function lanIp() {
  const os = require('os');
  const ifs = os.networkInterfaces();
  for (const list of Object.values(ifs)) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return null;
}

async function relaunchAsAdmin() {
  if (!IS_WIN) return { ok: false, reason: 'no-windows' };
  if (isAdmin()) return { ok: true, alreadyAdmin: true };
  const exePath = process.execPath;
  // En dev exePath = electron.exe; en producción = el .exe instalado.
  try {
    execSync(`powershell -NoProfile -Command "Start-Process '${exePath.replace(/'/g, "''")}' -Verb RunAs"`, { stdio: 'ignore' });
    app.quit();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Flujo end-to-end: copia + npm install + bootstrap non-interactive + firewall + health.
 *  Llama onLog({ stream, line, level }) con cada paso. Resuelve con { ok }. */
async function prepareServer(params, onLog) {
  const log = (line, level = 'info', stream = 'system') => onLog && onLog({ stream, line, level });
  const step = (n, total, title) => log(`▶ [${n}/${total}] ${title}`, 'step');

  try {
    step(1, 7, 'Verificando permisos de administrador');
    if (!isAdmin()) {
      log('Esta operación requiere admin. Llamar installer:elevate primero.', 'error');
      return { ok: false, error: 'no-admin' };
    }
    log('✓ Admin: SÍ', 'ok');

    step(2, 7, `Copiando backend a ${BACKEND_TARGET}`);
    copyBackend((m) => log(m));

    step(3, 7, 'Ejecutando npm install (puede tardar 2-5 min)');
    const npmInstall = await runStreaming(
      'npm', ['install', '--omit=dev', '--no-audit', '--no-fund'],
      { cwd: BACKEND_TARGET, env: { ...process.env, ADBLOCK: '1', DISABLE_OPENCOLLECTIVE: '1' } },
      ({ line }) => log(line)
    );
    if (!npmInstall.ok) {
      log(`✗ npm install falló (exit ${npmInstall.code})`, 'error');
      return { ok: false, error: 'npm-install', code: npmInstall.code };
    }
    log('✓ npm install completado', 'ok');

    step(4, 7, 'Verificando servicio MySQL antes de Prisma');
    const mysqlReady = await ensureMysqlReady(
      { host: params.dbHost || '127.0.0.1', port: Number(params.dbPort || 3306) },
      (line) => log(line)
    );
    if (!mysqlReady.ok) {
      log(mysqlReady.error, 'error');
      return { ok: false, error: mysqlReady.error };
    }

    step(5, 7, 'Ejecutando bootstrap no-interactivo del backend');
    const bootArgs = ['scripts/bootstrap.js', '--non-interactive'];
    if (params.skipFirewall) bootArgs.push('--skip-firewall');
    if (params.skipPm2) bootArgs.push('--skip-pm2');
    const bootEnv = {
      ...process.env,
      BOOTSTRAP_USE_EXISTING_ENV: '1', // si .env existe, preferirlo (no destructivo)
      BOOTSTRAP_DB_HOST: params.dbHost || '127.0.0.1',
      BOOTSTRAP_DB_PORT: String(params.dbPort || 3306),
      BOOTSTRAP_DB_NAME: params.dbName || 'lavasuit_db',
      BOOTSTRAP_DB_USER: params.dbUser || 'lavasuit_user',
      BOOTSTRAP_DB_PASS: params.dbPass || '',
      BOOTSTRAP_MYSQL_ROOT_USER: params.mysqlRootUser || 'root',
      BOOTSTRAP_MYSQL_ROOT_PASS: params.mysqlRootPass || '',
      BOOTSTRAP_ADMIN_EMAIL: params.adminEmail || '',
      BOOTSTRAP_ADMIN_NAME: params.adminName || 'Administrador',
      BOOTSTRAP_ADMIN_PASSWORD: params.adminPassword || '',
      BOOTSTRAP_SUPABASE_URL: params.supabaseUrl || 'https://awutehzbhhklcgodmluq.supabase.co',
      BOOTSTRAP_SUPABASE_KEY: params.supabaseKey || '',
      BOOTSTRAP_INSTALL_PM2: params.skipPm2 ? '0' : '1',
    };
    const boot = await runStreaming('node', bootArgs, { cwd: BACKEND_TARGET, env: bootEnv }, ({ line }) => log(line));
    if (!boot.ok) {
      log(`✗ bootstrap falló (exit ${boot.code})`, 'error');
      return { ok: false, error: 'bootstrap', code: boot.code };
    }
    log('✓ Bootstrap completado', 'ok');

    step(6, 7, 'Configurando firewall puerto 3000');
    if (!params.skipFirewall) {
      const fw = await openFirewall((line) => log(line));
      if (fw.ok) log('✓ Regla de firewall aplicada', 'ok');
      else log(`! Firewall no aplicado: ${fw.reason || `exit ${fw.code}`}`, 'warn');
    } else {
      log('saltado por configuración', 'warn');
    }

    step(7, 7, 'Validando /health del backend');
    const h = await probeHealth();
    if (!h.ok) {
      log(`✗ /health no respondió: ${h.mensaje}`, 'error');
      return { ok: false, error: 'health', detail: h.mensaje };
    }
    log(`✓ /health 200: ${JSON.stringify(h.data)}`, 'ok');

    // Guardar config desktop para apuntar a localhost
    try {
      const configStore = require('./config-store');
      configStore.write({ apiHost: 'localhost', apiPort: 3000, apiProtocol: 'http' });
      log('✓ Desktop config: apiHost=localhost:3000', 'ok');
    } catch (e) {
      log(`! No se pudo guardar config desktop: ${e.message}`, 'warn');
    }

    log('═══ INSTALACIÓN COMPLETADA ═══', 'ok');
    return { ok: true };
  } catch (e) {
    log(`✗ EXCEPTION: ${e.message}`, 'error');
    return { ok: false, error: e.message };
  }
}

module.exports = {
  BACKEND_TARGET,
  parseScQuery,
  bundledBackendPath,
  isAdmin,
  detectAll,
  detectNode,
  detectMysql,
  queryMysqlService,
  ensureMysqlReady,
  detectBackendInstalled,
  detectBundle,
  detectFirewallRule,
  detectPm2Process,
  copyBackend,
  runStreaming,
  openFirewall,
  probeHealth,
  lanIp,
  relaunchAsAdmin,
  prepareServer,
};
