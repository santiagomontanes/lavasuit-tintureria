require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const buildApp = require('./src/app');

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET no está definido en .env');
  process.exit(1);
}

const corsOriginRaw = (process.env.CORS_ORIGIN ?? '*').trim();
const corsOrigin = corsOriginRaw === '*'
  ? true
  : corsOriginRaw.split(',').map((s) => s.trim()).filter(Boolean);

const app    = buildApp();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }
});

require('./src/lib/io').setIo(io);
require('./src/sockets/sync.socket')(io);

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const { startMdnsAdvertiser, getPrimaryLanIp, INSTANCE_ID } = require('./src/lib/discovery');
let mdns = { stop: () => {} };

server.listen(PORT, HOST, () => {
  const lanIp = getPrimaryLanIp();
  console.log(`LavaSuit Backend en puerto ${PORT}`);
  console.log(`Escuchando en:  http://${HOST}:${PORT}  (accesible desde la red local)`);
  console.log(`IP LAN sugerida: http://${lanIp}:${PORT}/discovery`);
  console.log(`InstanceId:      ${INSTANCE_ID}`);
  console.log(`Base de datos:   MySQL`);
  console.log(`CORS origin:     ${corsOriginRaw}`);

  if (process.env.DISCOVERY_DISABLED !== '1') {
    mdns = startMdnsAdvertiser({ port: PORT });
  } else {
    console.log('[discovery] mDNS desactivado por DISCOVERY_DISABLED=1');
  }

  // #Rutas M2M: migrar asignaciones únicas legacy a la tabla intermedia (idempotente).
  require('./src/lib/rutasBackfill').backfillRutasDesdeAsignado().catch(() => {});
});

const prisma = require('./src/lib/prisma');

const shutdown = async (signal) => {
  console.log(`\n[shutdown] ${signal} recibido, cerrando…`);
  try { mdns.stop(); } catch {}
  try { await prisma.$disconnect(); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
