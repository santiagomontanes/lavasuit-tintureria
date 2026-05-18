const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  dbQuery: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
  dbRun:   (sql, params) => ipcRenderer.invoke('db:run',   sql, params),
  dbGet:   (sql, params) => ipcRenderer.invoke('db:get',   sql, params)
});
