/* Configuración de URL del backend.
 *
 * Orden de resolución (primero que aplique gana):
 *   1. configAPI.getSync()       — config runtime guardada en %APPDATA%\LavaSuit\config.json
 *                                  (escrita desde la pantalla "Configurar servidor")
 *   2. import.meta.env.VITE_API_URL — fijada al build time (modo web o dev)
 *   3. http://localhost:3000     — fallback final
 *
 * La config runtime tiene prioridad para que un mismo .exe pueda apuntar a
 * cualquier IP del backend sin recompilar. Al guardar cambios, la app hace
 * window.location.reload() y este módulo se re-evalúa.
 */

const FALLBACK = 'http://localhost:3000';

function fromConfigAPI(): string | null {
  if (typeof window === 'undefined' || !window.configAPI) return null;
  try {
    const c = window.configAPI.getSync();
    if (!c) return null;
    if (!c.apiHost || !c.apiPort || !c.apiProtocol) return null;
    return `${c.apiProtocol}://${c.apiHost}:${c.apiPort}`;
  } catch (e) {
    console.warn('[ENV desktop] configAPI.getSync falló:', e);
    return null;
  }
}

function fromViteEnv(): string | null {
  try {
    const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
    if (raw && raw.length > 0) return raw.replace(/\/$/, '');
  } catch (_) {}
  return null;
}

const source =
  fromConfigAPI() ? 'configAPI' :
  fromViteEnv()   ? 'VITE_API_URL' :
  'fallback';

const base = fromConfigAPI() ?? fromViteEnv() ?? FALLBACK;

export const ENV = {
  API_URL:    `${base}/api`,
  SOCKET_URL: base,
};

console.log(`[ENV desktop] source = ${source}`);
console.log(`[ENV desktop] base   = ${base}`);
console.log(`[ENV desktop] API    = ${ENV.API_URL}`);
