const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  dbQuery: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
  dbRun:   (sql, params) => ipcRenderer.invoke('db:run',   sql, params),
  dbGet:   (sql, params) => ipcRenderer.invoke('db:get',   sql, params)
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
