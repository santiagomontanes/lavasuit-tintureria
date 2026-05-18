/// <reference types="vite/client" />

export type UpdaterEvent =
  | { tipo: 'checking' }
  | { tipo: 'available'; version: string; releaseDate?: string }
  | { tipo: 'not-available'; version: string }
  | { tipo: 'error'; message: string }
  | { tipo: 'progress'; percent: number; bytesPerSecond?: number; transferred?: number; total?: number }
  | { tipo: 'downloaded'; version: string };

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
  }
}
