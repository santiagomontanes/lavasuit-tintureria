const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  dbQuery: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
  dbRun:   (sql, params) => ipcRenderer.invoke('db:run',   sql, params),
  dbGet:   (sql, params) => ipcRenderer.invoke('db:get',   sql, params),
  // Borra la copia local del escritorio tras restablecer la operación.
  dbResetOperacion: () => ipcRenderer.invoke('db:reset-operacion')
});

contextBridge.exposeInMainWorld('shellAPI', {
  openPath: (ruta) => ipcRenderer.invoke('shell:open-path', ruta)
});

/* Guardado de exportaciones (Excel). `datos` viaja como array de bytes porque
 * los ArrayBuffer no cruzan el puente de contexto de forma fiable. */
contextBridge.exposeInMainWorld('exportAPI', {
  guardarArchivo: (nombreSugerido, datos, filtros) =>
    ipcRenderer.invoke('export:guardar-archivo', { nombreSugerido, datos, filtros })
});

contextBridge.exposeInMainWorld('configAPI', {
  getSync: () => ipcRenderer.sendSync('config:get-sync'),
  get:     () => ipcRenderer.invoke('config:get'),
  set:     (cfg) => ipcRenderer.invoke('config:set', cfg),
  test:    (url) => ipcRenderer.invoke('config:test', url),
  reload:  () => { window.location.reload(); }
});

contextBridge.exposeInMainWorld('updaterAPI', {
  getVersion:    () => ipcRenderer.invoke('updater:get-version'),
  check:         () => ipcRenderer.invoke('updater:check'),
  download:      () => ipcRenderer.invoke('updater:download'),
  install:       () => ipcRenderer.invoke('updater:install'),
  onEvent:       (handler) => {
    const wrapped = (_event, payload) => { try { handler(payload); } catch (e) { console.warn('updater event handler error', e); } };
    ipcRenderer.on('updater:event', wrapped);
    return () => ipcRenderer.removeListener('updater:event', wrapped);
  }
});

contextBridge.exposeInMainWorld('serverInstallerAPI', {
  detect:  () => ipcRenderer.invoke('server-installer:detect'),
  elevate: () => ipcRenderer.invoke('server-installer:elevate'),
  copy:    () => ipcRenderer.invoke('server-installer:copy'),
  prepare: (params) => ipcRenderer.invoke('server-installer:prepare', params || {}),
  onLog:   (handler) => {
    const wrapped = (_event, payload) => { try { handler(payload); } catch (e) { console.warn('installer log handler error', e); } };
    ipcRenderer.on('server-installer:log', wrapped);
    return () => ipcRenderer.removeListener('server-installer:log', wrapped);
  },
  onDone:  (handler) => {
    const wrapped = (_event, payload) => { try { handler(payload); } catch (e) { console.warn('installer done handler error', e); } };
    ipcRenderer.on('server-installer:done', wrapped);
    return () => ipcRenderer.removeListener('server-installer:done', wrapped);
  }
});
