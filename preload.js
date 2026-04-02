const { contextBridge, ipcRenderer } = require('electron');

function asString(value, maxLen) {
  if (value == null) return '';
  const text = String(value);
  if (maxLen && text.length > maxLen) return text.slice(0, maxLen);
  return text;
}

function asRefId(value) {
  return asString(value, 320).trim();
}

function asURL(value) {
  return asString(value, 4096).trim();
}

function pickDownloadOptions(options) {
  const src = options && typeof options === 'object' ? options : {};
  const out = {};
  if (src.timeoutMs != null && Number.isFinite(Number(src.timeoutMs))) {
    out.timeoutMs = Number(src.timeoutMs);
  }
  if (src.maxBytes != null && Number.isFinite(Number(src.maxBytes))) {
    out.maxBytes = Number(src.maxBytes);
  }
  if (src.expectedDoi != null) out.expectedDoi = asString(src.expectedDoi, 256);
  if (src.expectedTitle != null) out.expectedTitle = asString(src.expectedTitle, 1024);
  if (src.requireDoiEvidence != null) out.requireDoiEvidence = !!src.requireDoiEvidence;
  return out;
}

function pickNetFetchOptions(options) {
  const src = options && typeof options === 'object' ? options : {};
  const out = {};
  if (src.timeoutMs != null && Number.isFinite(Number(src.timeoutMs))) {
    out.timeoutMs = Number(src.timeoutMs);
  }
  if (src.maxBytes != null && Number.isFinite(Number(src.maxBytes))) {
    out.maxBytes = Number(src.maxBytes);
  }
  return out;
}

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

const electronAPI = {
  // Data sync
  loadData:       ()          => invoke('data:load'),
  saveData:       (json)      => invoke('data:save', typeof json === 'string' ? json : JSON.stringify(json || {})),

  // PDF file management
  savePDF:        (refId, buf)=> invoke('pdf:save', asRefId(refId), buf),
  loadPDF:        (refId)     => invoke('pdf:load', asRefId(refId)),
  pdfExists:      (refId)     => invoke('pdf:exists', asRefId(refId)),
  deletePDF:      (refId)     => invoke('pdf:delete', asRefId(refId)),

  // PDF download (CORS-free, Node.js redirect following)
  downloadPDFfromURL: (url, refId, options) => invoke('pdf:download', asURL(url), asRefId(refId), pickDownloadOptions(options)),
  netFetchJSON:      (url, options) => invoke('net:fetch-json', asURL(url), pickNetFetchOptions(options)),
  netFetchText:      (url, options) => invoke('net:fetch-text', asURL(url), pickNetFetchOptions(options)),

  // PDF sync
  pdfSyncAll:     ()         => invoke('pdf:syncAll'),

  // File dialogs
  openPDFDialog:  ()          => invoke('dialog:openPDF'),
  wordToHtml:     (filePath)  => invoke('word:toHtml', asString(filePath, 4096)),
  exportPDF:      (options)   => invoke('export:pdf', options && typeof options === 'object' ? options : {}),

  // Sync settings
  getSyncSettings: ()         => invoke('sync:getSettings'),
  setSyncDir:      ()         => invoke('sync:setSyncDir'),
  clearSyncDir:    ()         => invoke('sync:clearSyncDir'),

  // App info
  getAppInfo:      ()         => invoke('app:getInfo'),

  // Auto-update
  checkUpdate:     ()         => invoke('update:check'),
  downloadUpdate:  (url)      => invoke('update:download', asURL(url)),
  setUpdateUrl:    (url)      => invoke('update:setUrl', asURL(url)),
  restartApp:      ()         => invoke('update:restart'),
};

contextBridge.exposeInMainWorld('electronAPI', Object.freeze(electronAPI));
