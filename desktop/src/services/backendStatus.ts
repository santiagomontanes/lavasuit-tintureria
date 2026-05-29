/* Health-check periódico contra el backend HTTP.
 *
 * Complementa ConnectionStatus (que mide socket.io). Esto mide si el
 * backend responde a GET /health, lo cual permite detectar:
 *   - backend caído / firewall bloqueando
 *   - apiHost mal configurado en config.json
 *   - cliente en otra red
 *
 * Se usa como gate al arrancar la app: si está offline, App.tsx muestra
 * ConfigurarServidor antes que licencia o login.
 */
import { ENV } from '../config/env';

export type BackendStatus = 'checking' | 'online' | 'offline';

type Listener = (status: BackendStatus) => void;

let current: BackendStatus = 'checking';
let lastCheckedAt: number = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners: Listener[] = [];

const POLL_MS = 30_000;
const TIMEOUT_MS = 4_000;

async function probe(): Promise<BackendStatus> {
  const url = `${ENV.SOCKET_URL}/health`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    return res.ok ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}

function setStatus(next: BackendStatus) {
  if (next === current) return;
  current = next;
  listeners.forEach((l) => { try { l(current); } catch (e) { console.warn('backendStatus listener error', e); } });
}

export async function refreshBackendStatus(): Promise<BackendStatus> {
  const r = await probe();
  lastCheckedAt = Date.now();
  setStatus(r);
  return r;
}

export function startBackendPolling() {
  if (timer) return;
  refreshBackendStatus();
  timer = setInterval(refreshBackendStatus, POLL_MS);
}

export function stopBackendPolling() {
  if (timer) { clearInterval(timer); timer = null; }
}

export function getBackendStatus(): BackendStatus { return current; }
export function getLastCheckedAt(): number { return lastCheckedAt; }

export function onBackendStatusChange(l: Listener): () => void {
  listeners.push(l);
  l(current);
  return () => {
    const i = listeners.indexOf(l);
    if (i >= 0) listeners.splice(i, 1);
  };
}
