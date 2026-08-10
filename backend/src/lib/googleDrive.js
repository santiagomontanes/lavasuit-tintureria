/* Copias de seguridad en Google Drive.
 *
 * Port EXACTO del servicio del proyecto de referencia
 * (lavanderiasoftware/src/main/services/backup-service.ts): mismas constantes,
 * mismos nombres de tabla, mismo flujo OAuth, mismos estados y mensajes.
 *
 * Única diferencia estructural: allí el servicio vivía en el proceso principal
 * de Electron (que era el dueño de la base). Aquí la base la tiene el backend,
 * así que el servicio vive en el backend y el escritorio solo abre la URL de
 * autorización que se le devuelve. El servidor de callback sigue escuchando en
 * 127.0.0.1:3017, así que la autorización debe hacerse desde el mismo equipo
 * donde corre el backend (que es el caso en una instalación de LavaSuit).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { exec, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { google } = require('googleapis');
const prisma = require('./prisma');

const execAsync = promisify(exec);

const GOOGLE_REDIRECT_URI = 'http://127.0.0.1:3017/oauth2callback';
const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/drive.file'];

/** ¿El error es de credenciales caducadas/revocadas? */
const isAuthError = (error) => {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid_grant') || msg.includes('token has been expired') || msg.includes('token_expired')) return true;
  const status = error?.status ?? error?.code ?? error?.response?.status;
  if (status === 401 || status === '401') return true;
  if (error?.response?.data?.error === 'invalid_grant') return true;
  return false;
};

/* Parsea DATABASE_URL (mysql://user:pass@host:port/db). */
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

const primeraRutaExistente = (rutas) => rutas.find((r) => r && fs.existsSync(r)) ?? null;

class BackupDriveService {
  async resolveCommand(command) {
    const lookupCommand = process.platform === 'win32' ? `where ${command}` : `command -v ${command}`;
    try {
      const { stdout } = await execAsync(lookupCommand);
      return stdout.split(/\r?\n/g).map((l) => l.trim()).find(Boolean) ?? null;
    } catch {
      return null;
    }
  }

  /** google-oauth.json: credenciales OAuth de escritorio. */
  getGoogleCredentialsPath() {
    const targetPath = primeraRutaExistente([
      process.env.GOOGLE_OAUTH_JSON,
      path.join(process.cwd(), 'resources', 'runtime', 'google-oauth.json'),
      path.join(process.cwd(), 'google-oauth.json'),
      path.join(__dirname, '..', '..', 'google-oauth.json')
    ]);
    if (targetPath) return targetPath;
    throw new Error(
      'No existe google-oauth.json. Debe estar en la raíz del backend, en resources/runtime/google-oauth.json o en la ruta de GOOGLE_OAUTH_JSON.'
    );
  }

  getOAuthClient() {
    const credentialsPath = this.getGoogleCredentialsPath();
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
    const installed = credentials.installed || credentials.web;

    if (!installed?.client_id || !installed?.client_secret) {
      throw new Error('El archivo google-oauth.json no es válido.');
    }

    return new google.auth.OAuth2(installed.client_id, installed.client_secret, GOOGLE_REDIRECT_URI);
  }

  async getMysqldumpPath() {
    const bundledPath = primeraRutaExistente([
      path.join(process.cwd(), 'resources', 'bin', 'mysqldump.exe'),
      path.join(process.cwd(), 'resources', 'bin', 'mysqldump')
    ]);
    if (bundledPath) return bundledPath;

    const systemPath = await this.resolveCommand('mysqldump');
    if (systemPath) return systemPath;

    throw new Error(
      'No se encontró mysqldump. En Windows puedes empaquetarlo en resources/bin/mysqldump.exe o tenerlo disponible en PATH.'
    );
  }

  /* ── Tokens ─────────────────────────────────────────────────────────────── */

  async getTokenRow(userId) {
    return prisma.googleDriveToken.findFirst({
      where:   { usuarioId: userId ?? null },
      orderBy: { id: 'desc' }
    });
  }

  async tryRefreshToken(oAuth2Client, userId) {
    try {
      const { credentials } = await oAuth2Client.refreshAccessToken();
      oAuth2Client.setCredentials(credentials);

      const updates = {
        accessToken: credentials.access_token ?? null,
        expiryDate:  credentials.expiry_date ? BigInt(credentials.expiry_date) : null
      };
      if (credentials.refresh_token) updates.refreshToken = credentials.refresh_token;

      await prisma.googleDriveToken.updateMany({ where: { usuarioId: userId ?? null }, data: updates });
      return true;
    } catch {
      return false;
    }
  }

  async clearAllTokens() {
    await prisma.googleDriveToken.deleteMany();
  }

  /** Ejecuta la operación y, si el token caducó, lo refresca y reintenta UNA vez. */
  async withTokenRetry(userId, operation, onProgress) {
    const auth = await this.getAuthorizedClient(userId);
    try {
      return await operation(auth);
    } catch (firstError) {
      if (!isAuthError(firstError)) throw firstError;

      onProgress?.('refreshing');

      const refreshed = await this.tryRefreshToken(auth, userId);
      if (!refreshed) {
        await this.clearAllTokens();
        throw new Error(
          'REAUTH_REQUIRED: Tu conexión con Google Drive expiró. Por favor haz clic en "Conectar Google Drive" para reconectar.'
        );
      }
      return await operation(auth);
    }
  }

  async getAuthorizedClient(userId) {
    const token = await this.getTokenRow(userId);
    if (!token?.refreshToken && !token?.accessToken) {
      throw new Error('Primero debes conectar Google Drive.');
    }

    const oAuth2Client = this.getOAuthClient();
    oAuth2Client.setCredentials({
      access_token:  token.accessToken ?? undefined,
      refresh_token: token.refreshToken ?? undefined,
      scope:         token.scope ?? undefined,
      token_type:    token.tokenType ?? undefined,
      expiry_date:   token.expiryDate != null ? Number(token.expiryDate) : undefined
    });
    return oAuth2Client;
  }

  /**
   * Genera la URL de autorización y levanta el servidor de callback en
   * 127.0.0.1:3017. Devuelve la URL para que el escritorio la abra; la promesa
   * `esperaTokens` se resuelve cuando el usuario autoriza.
   */
  async iniciarConexion(userId) {
    const oAuth2Client = this.getOAuthClient();

    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_SCOPES
    });

    const esperaTokens = new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        try {
          const reqUrl = new URL(req.url || '', GOOGLE_REDIRECT_URI);

          if (reqUrl.pathname !== '/oauth2callback') {
            res.statusCode = 404;
            res.end('Ruta no encontrada');
            return;
          }

          const code = reqUrl.searchParams.get('code');
          if (!code) {
            res.statusCode = 400;
            res.end('No se recibió código de autorización.');
            return;
          }

          const tokenResponse = await oAuth2Client.getToken(code);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end('<h2>Google Drive conectado correctamente. Puedes cerrar esta ventana.</h2>');

          server.close();
          resolve(tokenResponse.tokens);
        } catch (error) {
          server.close();
          reject(error);
        }
      });

      // Si nadie autoriza, no dejar el puerto ocupado para siempre.
      const timeout = setTimeout(() => {
        server.close();
        reject(new Error('Se agotó el tiempo de espera de la autorización de Google.'));
      }, 5 * 60 * 1000);

      server.on('close', () => clearTimeout(timeout));
      server.on('error', reject);
      server.listen(3017, '127.0.0.1');
    });

    return { authUrl, esperaTokens };
  }

  /** Guarda los tokens recibidos tras autorizar. */
  async guardarTokens(tokens, userId) {
    const datos = {
      accessToken:  tokens.access_token ?? null,
      refreshToken: tokens.refresh_token ?? null,
      scope:        tokens.scope ?? null,
      tokenType:    tokens.token_type ?? null,
      expiryDate:   tokens.expiry_date ? BigInt(tokens.expiry_date) : null
    };

    const existing = await prisma.googleDriveToken.findFirst({
      where: { usuarioId: userId ?? null }, select: { id: true }
    });

    if (existing) {
      await prisma.googleDriveToken.update({ where: { id: existing.id }, data: datos });
    } else {
      await prisma.googleDriveToken.create({ data: { usuarioId: userId ?? null, ...datos } });
    }

    return { success: true, message: 'Google Drive conectado correctamente.' };
  }

  async estado(userId) {
    const token = await this.getTokenRow(userId);
    let credencialesOk = true;
    let motivo = null;
    try { this.getGoogleCredentialsPath(); } catch (e) { credencialesOk = false; motivo = e.message; }
    return {
      conectado: !!(token?.refreshToken || token?.accessToken),
      credencialesOk,
      motivo,
      conectadoEn: token?.createdAt ?? null
    };
  }

  /* ── Backup ─────────────────────────────────────────────────────────────── */

  async createSqlBackup() {
    const config = datosConexion();
    if (!config?.database) throw new Error('La base de datos no está configurada.');

    const mysqldumpPath = await this.getMysqldumpPath();

    const now = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_` +
                  `${p(now.getHours())}-${p(now.getMinutes())}-${p(now.getSeconds())}`;

    const fileName = `backup_${config.database}_${stamp}.sql`;
    const filePath = path.join(os.tmpdir(), fileName);

    await new Promise((resolve, reject) => {
      const dumpProcess = spawn(
        mysqldumpPath,
        [
          '-h', config.host,
          '-P', String(config.port),
          '-u', config.user,
          '--no-tablespaces', '--single-transaction', '--skip-lock-tables',
          '--routines', '--events',
          config.database
        ],
        // La contraseña va por variable de entorno: no aparece en la línea de
        // comandos ni en el listado de procesos.
        { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MYSQL_PWD: config.password }, windowsHide: true }
      );

      const output = fs.createWriteStream(filePath);
      let stderr = '';

      dumpProcess.stdout.pipe(output);
      dumpProcess.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      dumpProcess.on('error', (error) => { output.destroy(); reject(error); });
      dumpProcess.on('close', (code) => {
        output.end();
        if (code === 0) { resolve(); return; }
        reject(new Error(stderr.trim() || 'No se pudo ejecutar mysqldump.'));
      });
    });

    if (!fs.existsSync(filePath)) throw new Error('No se pudo generar el archivo de backup.');

    return { fileName, filePath };
  }

  async uploadBackupToDrive(userId, onProgress) {
    const { fileName, filePath } = await this.createSqlBackup();

    const createdBackup = await prisma.backupDrive.create({
      data: { fileName, status: 'UPLOADING', message: 'Subiendo backup a Google Drive' }
    });

    try {
      const response = await this.withTokenRetry(
        userId,
        async (auth) => {
          const drive = google.drive({ version: 'v3', auth });
          return drive.files.create({
            requestBody: { name: fileName },
            media: { mimeType: 'application/sql', body: fs.createReadStream(filePath) },
            fields: 'id,name'
          });
        },
        onProgress
      );

      await prisma.backupDrive.update({
        where: { id: createdBackup.id },
        data: {
          driveFileId: response.data.id ?? null,
          status: 'DONE',
          message: 'Backup subido correctamente'
        }
      });

      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      return {
        success: true,
        fileName,
        driveFileId: response.data.id ?? null,
        message: 'Backup subido correctamente a Google Drive.'
      };
    } catch (error) {
      const displayMessage = error instanceof Error
        ? error.message.replace(/^REAUTH_REQUIRED:\s*/, '')
        : 'Error subiendo backup';

      await prisma.backupDrive.update({
        where: { id: createdBackup.id },
        data: { status: 'ERROR', message: displayMessage }
      });

      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      throw error;
    }
  }

  async listBackups() {
    const rows = await prisma.backupDrive.findMany({ orderBy: { id: 'desc' }, take: 100 });
    return rows.map((row) => ({
      id: row.id,
      file_name: row.fileName,
      drive_file_id: row.driveFileId,
      status: row.status,
      message: row.message,
      created_at: new Date(row.createdAt).toISOString()
    }));
  }
}

module.exports = {
  backupDriveService: new BackupDriveService(),
  GOOGLE_REDIRECT_URI,
  GOOGLE_SCOPES
};
