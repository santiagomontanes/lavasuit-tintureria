/**
 * Discovery service:
 *   - Anuncia el backend en la LAN vía mDNS (_lavasuit._tcp.local.)
 *   - Calcula la IPv4 local más probable (la primera no-loopback no-virtual)
 *   - Mantiene un instanceId estable por proceso (para que el mobile detecte
 *     si el servidor cambió y descarte caché incompatible)
 *
 * La librería bonjour-service es pure-JS (sin compilación nativa) y funciona
 * en Windows/macOS/Linux. Si no está instalada, el mDNS se desactiva en
 * silencio y queda sólo el endpoint /discovery por HTTP.
 */
const os     = require('os');
const crypto = require('crypto');

const INSTANCE_ID = crypto.randomUUID();
const SERVICE_NAME = process.env.DISCOVERY_NAME || `LavaSuit (${os.hostname()})`;
const SERVICE_TYPE = 'lavasuit';

/** Devuelve la primera IPv4 LAN razonable (no loopback, no virtual). */
function getPrimaryLanIp() {
  const ifaces  = os.networkInterfaces();
  const priorityRx = /^(Wi-?Fi|Ethernet|en|wlan|eth)/i;
  const blockedRx  = /(VirtualBox|VMware|Hyper-V|Loopback|vEthernet|TAP|TUN)/i;

  const candidates = [];
  for (const [name, addrs] of Object.entries(ifaces ?? {})) {
    if (!addrs) continue;
    if (blockedRx.test(name)) continue;
    for (const a of addrs) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const score =
        (priorityRx.test(name) ? 100 : 0) +
        (a.address.startsWith('192.168.') ? 50 :
         a.address.startsWith('10.')       ? 30 :
         a.address.startsWith('172.')      ? 20 : 0);
      candidates.push({ name, address: a.address, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address ?? '127.0.0.1';
}

function discoveryPayload({ port }) {
  return {
    app:        'lavasuit',
    name:       SERVICE_NAME,
    version:    require('../../package.json').version,
    instanceId: INSTANCE_ID,
    ip:         getPrimaryLanIp(),
    port:       Number(port),
    apiBase:    `/api`,
    healthPath: `/health`,
    time:       new Date().toISOString()
  };
}

/** Arranca el anuncio mDNS. Idempotente y resistente a falta del paquete. */
function startMdnsAdvertiser({ port }) {
  let Bonjour;
  try {
    Bonjour = require('bonjour-service').Bonjour;
  } catch (e) {
    console.warn('[discovery] bonjour-service no instalado; mDNS desactivado.');
    console.warn('[discovery]   npm i bonjour-service   para habilitarlo.');
    return { stop: () => {} };
  }

  const bonjour = new Bonjour();
  const ad = bonjour.publish({
    name: SERVICE_NAME,
    type: SERVICE_TYPE,
    port: Number(port),
    host: undefined, // bonjour-service usa el hostname por defecto
    txt: {
      app:        'lavasuit',
      version:    require('../../package.json').version,
      instanceId: INSTANCE_ID,
      ip:         getPrimaryLanIp(),
      apiBase:    '/api'
    }
  });

  ad.on('up',    () => console.log(`[discovery] mDNS: _${SERVICE_TYPE}._tcp anunciado como "${SERVICE_NAME}" en ${getPrimaryLanIp()}:${port}`));
  ad.on('error', (e) => console.warn('[discovery] mDNS error:', e?.message ?? e));

  return {
    stop: () => {
      try { ad.stop(() => bonjour.destroy()); } catch {}
    }
  };
}

module.exports = {
  INSTANCE_ID,
  SERVICE_NAME,
  SERVICE_TYPE,
  getPrimaryLanIp,
  discoveryPayload,
  startMdnsAdvertiser
};
