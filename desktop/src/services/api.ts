import axios from 'axios';
import { ENV } from '../config/env';

type Listener = () => void;
const unauthorizedListeners: Listener[] = [];

export const onUnauthorized = (l: Listener) => {
  unauthorizedListeners.push(l);
  return () => {
    const i = unauthorizedListeners.indexOf(l);
    if (i >= 0) unauthorizedListeners.splice(i, 1);
  };
};

const api = axios.create({
  baseURL: ENV.API_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' }
});

export const backendBaseUrl = ENV.API_URL.replace(/\/api\/?$/, '');

export const resolveBackendUrl = (url?: string | null) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (
        parsed.pathname.startsWith('/uploads/') &&
        ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
      ) {
        return `${backendBaseUrl}${parsed.pathname}`;
      }
    } catch {}
    return url;
  }
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${backendBaseUrl}${path}`;
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      unauthorizedListeners.forEach((l) => {
        try { l(); } catch {}
      });
    }
    return Promise.reject(error);
  }
);

export default api;
