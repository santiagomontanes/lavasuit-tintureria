/// <reference types="vite/client" />

export type UpdaterEvent =
  | { tipo: 'checking' }
  | { tipo: 'available'; version: string; releaseDate?: string }
  | { tipo: 'not-available'; version: string }
  | { tipo: 'error'; message: string }
  | { tipo: 'progress'; percent: number; bytesPerSecond?: number; transferred?: number; total?: number }
  | { tipo: 'downloaded'; version: string };

export type ServerInstallerLog = {
  stream?: 'stdout' | 'stderr' | 'system' | string;
  level?: 'info' | 'step' | 'ok' | 'warn' | 'error' | string;
  line: string;
};

export type ServerInstallerDetect = {
  platform: string;
  isAdmin: boolean;
  appPackaged: boolean;
  node: { installed: boolean; version?: string; path?: string };
  npm: { installed: boolean; version?: string };
  mysql: { running: boolean; port: number; serviceStatus?: string | null; serviceExists?: boolean | null; serviceName?: string };
  backend: { installed: boolean; target: string; hasEnv: boolean; hasNodeModules: boolean };
  bundle: { available: boolean; path: string };
  pm2: {
    installed: boolean;
    path?: string | null;
    process?: { registered: boolean; online: boolean; status?: string | null; pid?: number | null; error?: string };
  };
  firewall?: { configured: boolean; ruleName?: string; reason?: string };
  health?: {
    localhost?: { ok: boolean; status?: number; mensaje?: string; data?: unknown };
    lan?: { ok: boolean; status?: number; mensaje?: string; data?: unknown };
    lanIp?: string | null;
  };
};

declare global {
  interface Window {
    electronAPI?: {
      dbQuery: (sql: string, params?: any[]) => Promise<any>;
      dbRun:   (sql: string, params?: any[]) => Promise<any>;
      dbGet:   (sql: string, params?: any[]) => Promise<any>;
    };
    updaterAPI?: {
      getVersion: () => Promise<string>;
      check:      () => Promise<{
        ok: boolean;
        updateAvailable?: boolean;
        currentVersion?: string;
        latestVersion?: string | null;
        releaseDate?: string | null;
        motivo?: string;
        mensaje?: string;
      }>;
      download: () => Promise<{ ok: boolean; mensaje?: string }>;
      install:  () => Promise<{ ok: boolean }>;
      onEvent:  (handler: (ev: UpdaterEvent) => void) => () => void;
    };
    configAPI?: {
      getSync: () => { apiHost: string; apiPort: number; apiProtocol: 'http' | 'https' };
      get:     () => Promise<{ apiHost: string; apiPort: number; apiProtocol: 'http' | 'https' }>;
      set:     (cfg: { apiHost: string; apiPort: number; apiProtocol: 'http' | 'https' }) => Promise<{ apiHost: string; apiPort: number; apiProtocol: 'http' | 'https' }>;
      test:    (url: string) => Promise<{ ok: boolean; status?: number; mensaje?: string; data?: unknown }>;
      reload:  () => void;
    };
    serverInstallerAPI?: {
      detect:  () => Promise<ServerInstallerDetect>;
      elevate: () => Promise<{ ok: boolean; alreadyAdmin?: boolean; reason?: string; error?: string }>;
      copy:    () => Promise<{ ok: boolean; copied?: number; skipped?: number; target?: string; error?: string }>;
      prepare: (params: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; code?: number; detail?: string }>;
      onLog:   (handler: (payload: ServerInstallerLog) => void) => () => void;
      onDone:  (handler: (payload: { ok: boolean; error?: string }) => void) => () => void;
    };
  }
}
