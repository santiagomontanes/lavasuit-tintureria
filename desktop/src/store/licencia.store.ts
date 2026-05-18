import { create } from 'zustand';
import api from '../services/api';

const STORAGE_KEY  = 'lavasuit.licencia.v1';
const DEVICE_KEY   = 'lavasuit.deviceId.v1';
const APP_VERSION  = '1.0.0';
const GRACE_DEFAULT_MS = 7 * 24 * 60 * 60 * 1000;

export interface ResumenLicencia {
  license_key:    string;
  status:         string;
  plan:           string;
  product_type:   string;
  business_type?: string | null;
  business_name?: string | null;
  expires_at?:    string | null;
  max_machines?:  number | null;
  device_id?:     string | null;
  activation_id?: string | null;
  last_seen?:     string | null;
  first_seen?:    string | null;
  grace_days?:    number;
}

interface LicenciaPersistida {
  resumen:          ResumenLicencia;
  activado_at:      string;
  ultima_verif_at:  string;
}

interface State {
  cargando:        boolean;
  activada:        boolean;
  resumen:         ResumenLicencia | null;
  ultimaVerifAt:   string | null;
  error:           string | null;
  deviceId:        string;
  cargar:          () => void;
  activar:         (licenseKey: string) => Promise<void>;
  verificarSilencioso: () => Promise<void>;
  desactivarLocal: () => void;
}

const uuid = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'dxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};

const getOrCreateDeviceId = (): string => {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `desktop-${uuid()}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
};

const leerLocal = (): LicenciaPersistida | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const guardarLocal = (data: LicenciaPersistida) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

const dentroDeGracia = (lic: LicenciaPersistida): boolean => {
  const diasGracia = lic.resumen.grace_days ?? 7;
  const limite = new Date(lic.ultima_verif_at).getTime() + diasGracia * 24 * 60 * 60 * 1000;
  return Date.now() <= limite;
};

export const useLicenciaStore = create<State>((set, get) => ({
  cargando:        true,
  activada:        false,
  resumen:         null,
  ultimaVerifAt:   null,
  error:           null,
  deviceId:        getOrCreateDeviceId(),

  cargar: () => {
    const local = leerLocal();
    if (local && dentroDeGracia(local)) {
      set({
        cargando:      false,
        activada:      true,
        resumen:       local.resumen,
        ultimaVerifAt: local.ultima_verif_at,
        error:         null
      });
      // Verificar en background sin bloquear
      void get().verificarSilencioso();
    } else {
      set({
        cargando:      false,
        activada:      false,
        resumen:       local?.resumen ?? null,
        ultimaVerifAt: local?.ultima_verif_at ?? null,
        error:         local
          ? 'La licencia debe revalidarse contra el servidor (grace expirado).'
          : null
      });
    }
  },

  activar: async (licenseKey: string) => {
    const clave = licenseKey.trim().toUpperCase();
    if (!clave) throw new Error('Ingresa la clave de licencia');
    set({ cargando: true, error: null });
    try {
      const { data } = await api.post('/licencias/activar', {
        license_key: clave,
        device_id:   get().deviceId,
        platform:    'desktop',
        app_version: APP_VERSION
      });
      const ahora = new Date().toISOString();
      const persistida: LicenciaPersistida = {
        resumen:         data,
        activado_at:     ahora,
        ultima_verif_at: ahora
      };
      guardarLocal(persistida);
      set({
        cargando:      false,
        activada:      true,
        resumen:       data,
        ultimaVerifAt: ahora,
        error:         null
      });
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'No se pudo activar';
      set({ cargando: false, error: msg });
      throw new Error(msg);
    }
  },

  verificarSilencioso: async () => {
    const r = get().resumen;
    if (!r?.license_key) return;
    try {
      const { data } = await api.post('/licencias/verificar', {
        license_key: r.license_key,
        device_id:   get().deviceId
      });
      const ahora = new Date().toISOString();
      guardarLocal({
        resumen:         data,
        activado_at:     leerLocal()?.activado_at ?? ahora,
        ultima_verif_at: ahora
      });
      set({ resumen: data, ultimaVerifAt: ahora, error: null });
    } catch (e: any) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.error || e?.message;
      // 403: licencia inválida/vencida/dispositivo revocado → desactivar local
      if (status === 403 || status === 404) {
        localStorage.removeItem(STORAGE_KEY);
        set({ activada: false, error: msg, ultimaVerifAt: null });
      } else {
        // Network / 5xx → mantener activada, solo registrar
        console.warn('[licencia.store] verificar silencioso falló (transient):', msg);
      }
    }
  },

  desactivarLocal: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ activada: false, resumen: null, ultimaVerifAt: null, error: null });
  }
}));

/* Exportado para usar en logout o testing manual. */
export const GRACE_MS_DEFAULT = GRACE_DEFAULT_MS;
