#!/usr/bin/env node
/**
 * LavaSuit — Bootstrap del backend.
 *
 * Automatiza la instalación en el PC del cliente:
 *   1. Valida entorno (Node, npm, sistema)
 *   2. Detecta MySQL escuchando en :3306
 *   3. Lee / crea backend/.env con credenciales seguras
 *   4. Conecta como root MySQL y crea base + usuario si faltan
 *   5. Genera Prisma client + sincroniza schema con db push
 *   6. Crea usuario ADMIN con password que escribe el técnico
 *   7. Abre firewall puerto 3000 (Windows)
 *   8. Configura PM2 como servicio Windows
 *   9. Valida /health
 *
 * Idempotente y no destructivo: no borra datos, no aplica seed demo.
 * Flags: --skip-firewall  --skip-pm2  --skip-admin  --yes
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');

const BACKEND_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.join(BACKEND_DIR, '.env');
const PRISMA_CLI = 'prisma@5.22.0';
const DEFAULT_PORT = 3000;

const args = new Set(process.argv.slice(2));
const SKIP_FIREWALL = args.has('--skip-firewall');
const SKIP_PM2 = args.has('--skip-pm2');
const SKIP_ADMIN = args.has('--skip-admin');
const AUTO_YES = args.has('--yes') || args.has('-y');
const NON_INTERACTIVE = args.has('--non-interactive');
const IS_WIN = process.platform === 'win32';

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m',
};
const log = {
  step: (n, total, title) => console.log(`\n${c.bold}${c.cyan}[${n}/${total}] ${title}${c.reset}`),
  ok: (msg) => console.log(`   ${c.green}✓${c.reset} ${msg}`),
  warn: (msg) => console.log(`   ${c.yellow}!${c.reset} ${msg}`),
  err: (msg) => console.log(`   ${c.red}✗${c.reset} ${msg}`),
  info: (msg) => console.log(`   ${c.dim}${msg}${c.reset}`),
  banner: (msg) => console.log(`\n${c.bold}${c.blue}${'─'.repeat(60)}\n${msg}\n${'─'.repeat(60)}${c.reset}`),
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(question, { hidden = false, defaultValue } = {}) {
  return new Promise((resolve) => {
    const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
    if (!hidden) {
      rl.question(prompt, (answer) => resolve(answer.trim() || defaultValue || ''));
      return;
    }
    process.stdout.write(prompt);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.setRawMode) stdin.setRawMode(true);
    let buf = '';
    const onData = (ch) => {
      const s = ch.toString('utf8');
      if (s === '\n' || s === '\r') {
        if (stdin.setRawMode) stdin.setRawMode(wasRaw || false);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(buf);
      } else if (s === '\u0003') {
        if (stdin.setRawMode) stdin.setRawMode(wasRaw || false);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        process.exit(130);
      } else if (s === '\b' || s === '\x7f') {
        if (buf.length > 0) { buf = buf.slice(0, -1); process.stdout.write('\b \b'); }
      } else {
        buf += s; process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}
async function askYesNo(question, defaultYes = true) {
  if (AUTO_YES) return true;
  const ans = await ask(`${question} (${defaultYes ? 'S/n' : 's/N'})`);
  if (!ans) return defaultYes;
  return /^(s|si|y|yes)$/i.test(ans);
}

// Modo --non-interactive: lee de env vars, falla si falta required.
async function envOrAsk(envKey, question, options = {}) {
  if (NON_INTERACTIVE) {
    const v = process.env[envKey];
    if (v !== undefined && v !== '') return v;
    if (options.defaultValue !== undefined) return options.defaultValue;
    throw new Error(`[non-interactive] Falta variable de entorno ${envKey} (pregunta: "${question}")`);
  }
  return ask(question, options);
}
async function envOrAskYesNo(envKey, question, defaultYes = true) {
  if (NON_INTERACTIVE) {
    const v = process.env[envKey];
    if (v === undefined || v === '') return defaultYes;
    return /^(1|true|yes|si|s|y)$/i.test(v);
  }
  return askYesNo(question, defaultYes);
}

function parseEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return null;
  const raw = fs.readFileSync(ENV_PATH, 'utf-8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
function writeEnvFile(values) {
  const order = [
    'DATABASE_URL', 'JWT_SECRET', 'JWT_EXPIRES_IN',
    'PORT', 'HOST', 'NODE_ENV', 'CORS_ORIGIN',
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
    'LAVASUIT_PRODUCT_TYPE', 'LICENSE_GRACE_DAYS',
  ];
  const lines = order
    .filter((k) => values[k] !== undefined && values[k] !== '')
    .map((k) => {
      const v = values[k];
      const needsQuotes = /[\s#"']/.test(v);
      return `${k}=${needsQuotes ? `"${v.replace(/"/g, '\\"')}"` : v}`;
    });
  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf-8');
}
function parseDbUrl(url) {
  const m = url.match(/^mysql:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)\/([^?]+)/);
  if (!m) throw new Error(`DATABASE_URL inválida: ${url}`);
  return { user: decodeURIComponent(m[1]), password: decodeURIComponent(m[2]), host: m[3], port: Number(m[4]), database: m[5] };
}
function buildDbUrl({ user, password, host, port, database }) {
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

function which(cmd) {
  try {
    const out = execSync(IS_WIN ? `where ${cmd}` : `which ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return out.split(/\r?\n/)[0] || null;
  } catch { return null; }
}
function isAdmin() {
  if (!IS_WIN) return process.getuid && process.getuid() === 0;
  try { execSync('net session', { stdio: 'ignore' }); return true; } catch { return false; }
}

function runLive(cmd, args = [], { cwd = BACKEND_DIR, env = process.env, timeoutMs = 60000, ignoreExit = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env,
      shell: IS_WIN,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      const message = `timeout despues de ${Math.round(timeoutMs / 1000)}s`;
      log.err(`${cmd} ${args.join(' ')}: ${message}`);
      try {
        if (IS_WIN && child.pid) execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
        else child.kill('SIGKILL');
      } catch (_) {
        try { child.kill('SIGKILL'); } catch (__) {}
      }
      finish({ ok: false, timedOut: true, code: null, stdout, stderr, error: message });
    }, timeoutMs);

    child.stdout?.on('data', (d) => {
      const text = d.toString('utf-8');
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr?.on('data', (d) => {
      const text = d.toString('utf-8');
      stderr += text;
      process.stderr.write(text);
    });
    child.on('error', (error) => finish({ ok: false, code: -1, stdout, stderr, error: error.message }));
    child.on('close', (code) => finish({ ok: code === 0 || ignoreExit, code, stdout, stderr }));
  });
}

async function mustRunLive(cmd, args = [], opts = {}) {
  const result = await runLive(cmd, args, opts);
  if (!result.ok) {
    const suffix = result.timedOut ? ` (timeout ${Math.round((opts.timeoutMs || 60000) / 1000)}s)` : ` (exit ${result.code})`;
    throw new Error(`${cmd} ${args.join(' ')} fallo${suffix}`);
  }
  return result;
}

async function pm2Version() {
  if (!which('pm2')) return null;
  const result = await runLive('pm2', ['-v'], { cwd: BACKEND_DIR, timeoutMs: 10000 });
  return result.ok ? result.stdout.trim().split(/\s+/).pop() || 'detectado' : null;
}

async function step1_environment() {
  log.step(1, 9, 'Validando entorno');
  log.ok(`Node ${process.version}`);
  log.ok(`npm ${execSync('npm --version').toString().trim()}`);
  log.ok(`Sistema: ${os.platform()} ${os.release()}`);
  if (IS_WIN) {
    const admin = isAdmin();
    if (admin) log.ok('Permisos administrador: SÍ');
    else log.warn('Permisos administrador: NO (firewall y PM2 startup pueden fallar)');
  }
}

async function step2_detectMysql({ host, port }) {
  log.step(2, 9, 'Detectando MySQL');
  const net = require('net');
  await new Promise((resolve, reject) => {
    const s = net.createConnection({ host, port, timeout: 3000 }, () => { s.end(); resolve(); });
    s.on('error', reject);
    s.on('timeout', () => { s.destroy(); reject(new Error(`timeout conectando a ${host}:${port}`)); });
  });
  log.ok(`Puerto ${port} accesible en ${host}`);
  if (IS_WIN) {
    try {
      const out = execSync('powershell -NoProfile -Command "Get-Service MySQL80 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Status"', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (out === 'Running') log.ok('Servicio MySQL80: Running');
      else if (out) log.warn(`Servicio MySQL80: ${out}`);
    } catch { /* nombre del servicio puede variar */ }
  }
}

async function step3_loadOrBuildEnv() {
  log.step(3, 9, 'Configurando .env del backend');
  let env = parseEnvFile();
  const exists = !!env;
  if (exists) {
    log.ok(`Encontrado: ${ENV_PATH}`);
    const useExisting = await envOrAskYesNo('BOOTSTRAP_USE_EXISTING_ENV', 'Usar valores existentes', true);
    if (useExisting && env.DATABASE_URL && env.JWT_SECRET) return env;
    log.info('Se regenerarán los valores...');
  } else {
    log.info(`No existe ${ENV_PATH}. Se creará.`);
  }
  env = env || {};
  const dbDefault = env.DATABASE_URL ? parseDbUrl(env.DATABASE_URL) : { user: 'lavasuit_user', password: '', host: '127.0.0.1', port: 3306, database: 'lavasuit_db' };
  const host = await envOrAsk('BOOTSTRAP_DB_HOST', 'Host MySQL', { defaultValue: dbDefault.host });
  const port = Number(await envOrAsk('BOOTSTRAP_DB_PORT', 'Puerto MySQL', { defaultValue: String(dbDefault.port) }));
  const database = await envOrAsk('BOOTSTRAP_DB_NAME', 'Nombre de la base', { defaultValue: dbDefault.database });
  const user = await envOrAsk('BOOTSTRAP_DB_USER', 'Usuario de aplicación', { defaultValue: dbDefault.user });
  let password = dbDefault.password || process.env.BOOTSTRAP_DB_PASS || '';
  if (!password) {
    password = await envOrAsk('BOOTSTRAP_DB_PASS', 'Password para el usuario de aplicación (ENTER para generar)', { hidden: true, defaultValue: '' });
    if (!password) {
      password = crypto.randomBytes(16).toString('base64url');
      log.info(`Password generada: ${password}`);
    }
  }
  const jwtSecret = env.JWT_SECRET || crypto.randomBytes(48).toString('hex');
  const supabaseUrl = env.SUPABASE_URL || await envOrAsk('BOOTSTRAP_SUPABASE_URL', 'SUPABASE_URL', { defaultValue: 'https://awutehzbhhklcgodmluq.supabase.co' });
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || await envOrAsk('BOOTSTRAP_SUPABASE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', { hidden: true });
  const next = {
    DATABASE_URL: buildDbUrl({ user, password, host, port, database }),
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: env.JWT_EXPIRES_IN || '7d',
    PORT: env.PORT || String(DEFAULT_PORT),
    HOST: env.HOST || '0.0.0.0',
    NODE_ENV: env.NODE_ENV || 'production',
    CORS_ORIGIN: env.CORS_ORIGIN || '*',
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: supabaseKey,
    LAVASUIT_PRODUCT_TYPE: env.LAVASUIT_PRODUCT_TYPE || 'LAUNDRY',
    LICENSE_GRACE_DAYS: env.LICENSE_GRACE_DAYS || '7',
  };
  writeEnvFile(next);
  log.ok(`.env escrito (${Object.keys(next).length} variables)`);
  return next;
}

async function step4_createDbAndUser(env) {
  log.step(4, 9, 'Verificando base de datos y usuario MySQL');
  const target = parseDbUrl(env.DATABASE_URL);
  const mysql = require('mysql2/promise');
  let usableWithAppUser = false;
  try {
    const conn = await mysql.createConnection({ host: target.host, port: target.port, user: target.user, password: target.password, database: target.database });
    await conn.query('SELECT 1');
    await conn.end();
    log.ok(`Usuario "${target.user}" ya conecta a "${target.database}". No se requiere intervención de root.`);
    usableWithAppUser = true;
  } catch (e) {
    log.info(`No se pudo conectar con ${target.user}@${target.host}: ${e.code || e.message}`);
  }
  if (usableWithAppUser) return;

  log.info('Se necesitará la password de root MySQL para crear DB/usuario.');
  const rootUser = await envOrAsk('BOOTSTRAP_MYSQL_ROOT_USER', 'Usuario root MySQL', { defaultValue: 'root' });
  const rootPass = await envOrAsk('BOOTSTRAP_MYSQL_ROOT_PASS', 'Password root MySQL', { hidden: true });
  const adminConn = await mysql.createConnection({ host: target.host, port: target.port, user: rootUser, password: rootPass, multipleStatements: true });
  log.ok(`Conectado como ${rootUser}`);

  const [dbs] = await adminConn.query('SHOW DATABASES LIKE ?', [target.database]);
  if (dbs.length === 0) {
    await adminConn.query(`CREATE DATABASE \`${target.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    log.ok(`Base "${target.database}" creada`);
  } else {
    log.ok(`Base "${target.database}" ya existe (no se modifica)`);
  }

  const [users] = await adminConn.query("SELECT User FROM mysql.user WHERE User = ? AND Host IN ('localhost','%')", [target.user]);
  if (users.length === 0) {
    await adminConn.query(`CREATE USER ?@'localhost' IDENTIFIED BY ?`, [target.user, target.password]);
    log.ok(`Usuario "${target.user}"@"localhost" creado`);
  } else {
    log.ok(`Usuario "${target.user}" ya existe (no se modifica password)`);
  }
  await adminConn.query(`GRANT ALL PRIVILEGES ON \`${target.database}\`.* TO ?@'localhost'`, [target.user]);
  await adminConn.query('FLUSH PRIVILEGES');
  log.ok('Permisos otorgados');
  await adminConn.end();

  const verify = await mysql.createConnection({ host: target.host, port: target.port, user: target.user, password: target.password, database: target.database });
  await verify.query('SELECT 1');
  await verify.end();
  log.ok(`Validación: ${target.user} conecta correctamente a ${target.database}`);
}

function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (IS_WIN) {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch (_) {
    // El proceso puede haber terminado justo antes del timeout.
  }
}

function safeRmDir(dir, description) {
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  log.ok(`${description} eliminado`);
  return true;
}

function stopPm2BackendForPrisma() {
  if (!which('pm2')) {
    log.info('PM2 no detectado; no hay backend PM2 que detener.');
    return;
  }
  try {
    const raw = execSync('pm2 jlist', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const list = JSON.parse(raw || '[]');
    const proc = list.find((p) => p && p.name === 'lavasuit-backend');
    if (!proc) {
      log.info('PM2 detectado, pero lavasuit-backend no esta registrado.');
      return;
    }
    execSync('pm2 stop lavasuit-backend', { stdio: 'inherit' });
    log.ok('PM2 lavasuit-backend detenido');
  } catch (e) {
    log.warn(`No se pudo detener PM2 lavasuit-backend: ${e.message}`);
  }
}

function killRelatedNodeProcessesForPrisma() {
  if (!IS_WIN) return;
  const backendNeedle = BACKEND_DIR.toLowerCase().replace(/'/g, "''");
  const ps = [
    `$current = ${process.pid}`,
    'Get-CimInstance Win32_Process',
    "Where-Object { $_.Name -eq 'node.exe' }",
    `Where-Object { $_.ProcessId -ne $current -and $_.CommandLine -and $_.CommandLine.ToLower().Contains('${backendNeedle}') }`,
    'Select-Object -ExpandProperty ProcessId',
  ].join('; ').replace(/; Where-Object/g, ' | Where-Object').replace('; Select-Object', ' | Select-Object');
  let pids = [];
  try {
    const out = execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    pids = out.split(/\r?\n/).map((s) => Number(s.trim())).filter(Boolean);
  } catch (_) {
    pids = [];
  }
  if (pids.length === 0) {
    log.info('No se encontraron node.exe relacionados al backend para cerrar.');
    return;
  }
  for (const pid of pids) killProcessTree(pid);
  log.ok(`node.exe relacionados al backend cerrados: ${pids.join(', ')}`);
}

function canNpmInstallRestorePrismaClient() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(BACKEND_DIR, 'package.json'), 'utf-8'));
    return !!(pkg.dependencies && pkg.dependencies['@prisma/client']);
  } catch (_) {
    return false;
  }
}

function isPrismaClientCorrupt(clientDir) {
  if (!fs.existsSync(clientDir)) return false;
  return ['package.json', 'index.js'].some((name) => !fs.existsSync(path.join(clientDir, name)));
}

function runNpmInstallForPrismaRestore(timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    log.info('Restaurando @prisma/client con npm install...');
    const child = spawn('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: BACKEND_DIR, shell: IS_WIN, windowsHide: true });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      killProcessTree(child.pid);
      reject(new Error(`npm install se colgo restaurando @prisma/client (${Math.round(timeoutMs / 1000)}s)`));
    }, timeoutMs);
    child.stdout?.on('data', (d) => process.stdout.write(d.toString('utf-8')));
    child.stderr?.on('data', (d) => process.stderr.write(d.toString('utf-8')));
    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`npm install no pudo iniciar: ${e.message}`));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`npm install fallo restaurando @prisma/client (exit ${code})`));
    });
  });
}

async function preparePrismaGenerateArtifacts() {
  log.info('Preparando archivos Prisma antes de generate...');
  stopPm2BackendForPrisma();
  killRelatedNodeProcessesForPrisma();

  safeRmDir(path.join(BACKEND_DIR, 'node_modules', '.prisma'), 'node_modules/.prisma');

  const clientDir = path.join(BACKEND_DIR, 'node_modules', '@prisma', 'client');
  if (!fs.existsSync(clientDir)) return;
  if (!isPrismaClientCorrupt(clientDir)) {
    log.info('node_modules/@prisma/client existe y no parece corrupto; se conserva.');
    return;
  }
  if (!canNpmInstallRestorePrismaClient()) {
    log.warn('node_modules/@prisma/client parece corrupto, pero package.json no permite restaurarlo con npm install. Se conserva.');
    return;
  }
  safeRmDir(clientDir, 'node_modules/@prisma/client corrupto');
  await runNpmInstallForPrismaRestore();
}

class PrismaCommandError extends Error {
  constructor(message, output = '') {
    super(message);
    this.output = output;
  }
}

function isPrismaLockError(error) {
  const text = `${error && error.message ? error.message : ''}\n${error && error.output ? error.output : ''}`;
  return /\bEPERM\b|permission denied|access is denied|acceso denegado|being used by another process|used by another process|no puede obtener acceso|lock(ed)?\b/i.test(text);
}

function runPrisma(cmd, timeoutMs) {
  return new Promise((resolve, reject) => {
    const args = ['--yes', PRISMA_CLI, ...cmd.split(' ')];
    log.info(`npx --yes ${PRISMA_CLI} ${cmd}`);
    const child = spawn('npx', args, { cwd: BACKEND_DIR, shell: IS_WIN, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    child.stdout?.on('data', (d) => {
      const s = d.toString('utf-8');
      stdout += s;
      process.stdout.write(s);
    });
    child.stderr?.on('data', (d) => {
      const s = d.toString('utf-8');
      stderr += s;
      process.stderr.write(s);
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      killProcessTree(child.pid);
      reject(new PrismaCommandError(`prisma ${cmd} se colgo y fue detenido por timeout (${Math.round(timeoutMs / 1000)}s)`, `${stdout}\n${stderr}`));
    }, timeoutMs);

    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new PrismaCommandError(`prisma ${cmd} no pudo iniciar: ${e.message}`, `${stdout}\n${stderr}`));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new PrismaCommandError(`prisma ${cmd} fallo (exit ${code})`, `${stdout}\n${stderr}`));
    });
  });
}

async function step5_prisma() {
  log.step(5, 9, 'Aplicando schema Prisma');
  log.info('Generando cliente Prisma...');
  try {
    await preparePrismaGenerateArtifacts();
    await runPrisma('generate', 240000);
  } catch (e) {
    if (isPrismaLockError(e)) {
      throw new Error('Cierra LavaSuit/backend o reinicia el PC y vuelve a preparar servidor.');
    }
    throw e;
  }
  log.ok('Cliente Prisma generado');
  log.info('Sincronizando schema con db push...');
  await runPrisma('db push', 180000);
  log.ok('Schema sincronizado con db push');
}

async function step6_admin(env) {
  log.step(6, 9, 'Verificando usuario administrador');
  if (SKIP_ADMIN) { log.warn('Saltado por flag --skip-admin'); return; }
  delete require.cache[require.resolve('@prisma/client')];
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const adminCount = await prisma.usuario.count({ where: { rol: 'ADMIN' } });
    if (adminCount > 0) {
      log.ok(`Ya existen ${adminCount} usuario(s) ADMIN. No se crea otro.`);
      return;
    }
    log.info('No hay usuarios ADMIN. Creando uno...');
    const email = await envOrAsk('BOOTSTRAP_ADMIN_EMAIL', 'Email del admin', { defaultValue: 'admin@lavasuit.com' });
    const nombre = await envOrAsk('BOOTSTRAP_ADMIN_NAME', 'Nombre del admin', { defaultValue: 'Administrador' });
    let password;
    if (NON_INTERACTIVE) {
      password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
      if (password.length < 8) throw new Error('[non-interactive] BOOTSTRAP_ADMIN_PASSWORD requerido (mín 8 caracteres)');
    } else {
      while (true) {
        password = await ask('Password (mín 8 caracteres)', { hidden: true });
        if (password.length < 8) { log.err('Password muy corta'); continue; }
        const confirm = await ask('Confirmar password', { hidden: true });
        if (confirm !== password) { log.err('No coinciden'); continue; }
        break;
      }
    }
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password, 10);
    await prisma.usuario.create({ data: { nombre, email, password: hash, rol: 'ADMIN' } });
    log.ok(`Admin creado: ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function step7_firewall(env) {
  log.step(7, 9, 'Configurando firewall');
  if (SKIP_FIREWALL) { log.warn('Saltado por flag --skip-firewall'); return; }
  if (!IS_WIN) { log.warn('Sistema no Windows; salteando.'); return; }
  if (!isAdmin()) { log.warn('Sin permisos admin; salteando firewall. Re-ejecutar como administrador para aplicar.'); return; }
  const port = env.PORT || DEFAULT_PORT;
  const ruleName = `LavaSuit Backend ${port}`;
  try {
    const check = execSync(`powershell -NoProfile -Command "Get-NetFirewallRule -DisplayName '${ruleName}' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty DisplayName"`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (check === ruleName) { log.ok(`Regla "${ruleName}" ya existe`); return; }
  } catch { /* no existe */ }
  execSync(`powershell -NoProfile -Command "New-NetFirewallRule -DisplayName '${ruleName}' -Direction Inbound -Protocol TCP -LocalPort ${port} -Action Allow -Profile Private,Domain | Out-Null"`, { stdio: 'inherit' });
  log.ok(`Regla "${ruleName}" creada (Private + Domain)`);
}

async function step8_pm2() {
  log.step(8, 9, 'Configurando PM2');
  if (SKIP_PM2) { log.warn('Saltado por flag --skip-pm2'); return; }
  if (!IS_WIN) { log.warn('Sistema no Windows; salteando PM2 startup.'); }
  const detectedPm2Version = await pm2Version();
  if (!detectedPm2Version) {
    const installPm2 = await envOrAskYesNo('BOOTSTRAP_INSTALL_PM2', 'PM2 no detectado. ¿Instalar globalmente?', true);
    if (!installPm2) { log.warn('Saltado por el usuario'); return; }
    log.info('npm install -g pm2 pm2-windows-startup ...');
    const install = await runLive('npm', ['install', '-g', 'pm2', 'pm2-windows-startup'], { cwd: BACKEND_DIR, timeoutMs: 180000 });
    if (!install.ok) {
      throw new Error('No se pudo instalar PM2 autom\u00e1ticamente. Ejecuta manualmente npm install -g pm2 pm2-windows-startup');
    }
    log.ok('PM2 instalado');
  } else {
    log.ok(`PM2 ya instalado (${detectedPm2Version})`);
  }
  log.info('pm2 delete lavasuit-backend ...');
  const deleted = await runLive('pm2', ['delete', 'lavasuit-backend'], { cwd: BACKEND_DIR, timeoutMs: 60000, ignoreExit: true });
  if (deleted.code === 0) log.ok('Proceso PM2 anterior eliminado');
  else log.warn('No habia proceso PM2 previo o no se pudo eliminar; se continua');

  log.info('pm2 start server.js --name lavasuit-backend -f ...');
  await mustRunLive('pm2', ['start', 'server.js', '--name', 'lavasuit-backend', '-f'], { cwd: BACKEND_DIR, timeoutMs: 60000 });
  log.ok('Proceso lavasuit-backend arrancado con force');

  log.info('pm2 save ...');
  await mustRunLive('pm2', ['save'], { cwd: BACKEND_DIR, timeoutMs: 60000 });
  log.ok('pm2 save aplicado');
  if (IS_WIN && isAdmin()) {
    log.info('pm2-startup install ...');
    const startup = await runLive('pm2-startup', ['install'], { cwd: BACKEND_DIR, timeoutMs: 60000 });
    const startupOutput = `${startup.stdout}\n${startup.stderr}`;
    if (startup.ok || /already|existe|existente|registry|registro|updated|actualizado/i.test(startupOutput)) {
      log.ok('PM2 startup ya configurado o actualizado');
    } else {
      log.warn(`pm2-startup install fallo (exit ${startup.code}). Re-ejecutar manualmente: pm2-startup install`);
    }
  } else if (IS_WIN) {
    log.warn('Sin permisos admin; pm2-startup install no aplicado. Re-ejecutar bootstrap.js como admin para activarlo.');
  }
}

async function step9_health(env) {
  log.step(9, 9, 'Validando /health');
  const port = env.PORT || DEFAULT_PORT;
  const url = `http://127.0.0.1:${port}/health`;
  log.info(`GET ${url} (esperando arranque hasta 15s)...`);
  const start = Date.now();
  while (Date.now() - start < 15000) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        log.ok(`Respuesta ${res.status}: ${JSON.stringify(data)}`);
        return;
      }
    } catch { /* sigue esperando */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`/health no respondió en 15s. Revisar pm2 logs lavasuit-backend.`);
}

function lanIp() {
  const ifs = os.networkInterfaces();
  for (const list of Object.values(ifs)) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return null;
}

(async () => {
  log.banner(`${c.bold}LavaSuit · Bootstrap del backend${c.reset}\nDirectorio: ${BACKEND_DIR}`);
  const t0 = Date.now();
  try {
    await step1_environment();
    const env = await step3_loadOrBuildEnv();
    const target = parseDbUrl(env.DATABASE_URL);
    await step2_detectMysql({ host: target.host, port: target.port });
    await step4_createDbAndUser(env);
    await step5_prisma();
    await step6_admin(env);
    await step7_firewall(env);
    await step8_pm2();
    await step9_health(env);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    const ip = lanIp() || '(no detectada)';
    log.banner(
      `${c.green}${c.bold}✓ Bootstrap completado en ${dt}s${c.reset}\n` +
      `\n  Backend:    http://localhost:${env.PORT || DEFAULT_PORT}` +
      `\n  IP LAN:     http://${ip}:${env.PORT || DEFAULT_PORT}` +
      `\n  Logs:       pm2 logs lavasuit-backend` +
      `\n  Estado:     pm2 status` +
      `\n\n  Siguiente: configurar IP fija LAN y entregar APK/Desktop al cliente.`
    );
    process.exit(0);
  } catch (e) {
    log.err(`${c.bold}FALLÓ:${c.reset} ${e.message}`);
    if (e.stack && process.env.DEBUG) console.error(e.stack);
    process.exit(1);
  } finally {
    rl.close();
  }
})();
