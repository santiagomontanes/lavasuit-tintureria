const fallback = 'http://localhost:3000';

const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const base = (raw && raw.length > 0 ? raw : fallback).replace(/\/$/, '');

export const ENV = {
  API_URL:    `${base}/api`,
  SOCKET_URL: base
};

console.log('[ENV desktop] VITE_API_URL =', raw ?? '(no definida, usando fallback)');
console.log('[ENV desktop] API_URL    =', ENV.API_URL);
console.log('[ENV desktop] SOCKET_URL =', ENV.SOCKET_URL);
