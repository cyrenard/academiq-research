const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Data sync
  loadData:       ()          => ipcRenderer.invoke('data:load'),
  saveData:       (json)      => ipcRenderer.invoke('data:save', json),

  // PDF file management
  savePDF:        (refId, buf)=> ipcRenderer.invoke('pdf:save', refId, buf),
  loadPDF:        (refId)     => ipcRenderer.invoke('pdf:load', refId),
  pdfExists:      (refId)     => ipcRenderer.invoke('pdf:exists', refId),
  deletePDF:      (refId)     => ipcRenderer.invoke('pdf:delete', refId),

  // PDF download (CORS-free, Node.js redirect following)
  downloadPDFfromURL: (url, refId, options) => ipcRenderer.invoke('pdf:download', url, refId, options || {}),

  // PDF sync
  pdfSyncAll:     ()         => ipcRenderer.invoke('pdf:syncAll'),

  // File dialogs
  openPDFDialog:  ()          => ipcRenderer.invoke('dialog:openPDF'),
  wordToHtml:     (filePath)  => ipcRenderer.invoke('word:toHtml', filePath),
  exportPDF:      (options)   => ipcRenderer.invoke('export:pdf', options || {}),

  // Sync settings
  getSyncSettings: ()         => ipcRenderer.invoke('sync:getSettings'),
  setSyncDir:      ()         => ipcRenderer.invoke('sync:setSyncDir'),
  clearSyncDir:    ()         => ipcRenderer.invoke('sync:clearSyncDir'),

  // App info
  getAppInfo:      ()         => ipcRenderer.invoke('app:getInfo'),

  // Auto-update
  checkUpdate:     ()         => ipcRenderer.invoke('update:check'),
  downloadUpdate:  (url)      => ipcRenderer.invoke('update:download', url),
  setUpdateUrl:    (url)      => ipcRenderer.invoke('update:setUrl', url),
  restartApp:      ()         => ipcRenderer.invoke('update:restart'),
});
