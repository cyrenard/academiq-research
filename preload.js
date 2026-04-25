const { contextBridge, ipcRenderer } = require('electron');

try {
  if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
    window.addEventListener('error', (event) => {
      try {
        ipcRenderer.send('renderer:probeError', {
          type: 'error',
          message: event && event.message ? String(event.message) : '',
          filename: event && event.filename ? String(event.filename) : '',
          lineno: event && Number.isFinite(Number(event.lineno)) ? Number(event.lineno) : 0,
          colno: event && Number.isFinite(Number(event.colno)) ? Number(event.colno) : 0,
          stack: event && event.error && event.error.stack ? String(event.error.stack) : ''
        });
      } catch (_e) {}
    });
    window.addEventListener('unhandledrejection', (event) => {
      try {
        const reason = event ? event.reason : null;
        ipcRenderer.send('renderer:probeError', {
          type: 'unhandledrejection',
          message: reason && reason.message ? String(reason.message) : String(reason || ''),
          filename: '',
          lineno: 0,
          colno: 0,
          stack: reason && reason.stack ? String(reason.stack) : ''
        });
      } catch (_e) {}
    });
  }
} catch (_e) {}

function toUint8Array(value) {
  if (value == null) return null;
  if (typeof Uint8Array !== 'undefined' && value instanceof Uint8Array) return value;
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset || 0, value.byteLength || 0);
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value.map((item) => Number(item) & 255));
  }
  if (value && typeof value === 'object') {
    if (Array.isArray(value.data)) {
      return Uint8Array.from(value.data.map((item) => Number(item) & 255));
    }
    const keys = Object.keys(value)
      .filter((key) => /^\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b));
    if (keys.length) {
      return Uint8Array.from(keys.map((key) => Number(value[key]) & 255));
    }
  }
  return null;
}

function toArrayBuffer(value) {
  const bytes = toUint8Array(value);
  if (!bytes) return null;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function normalizeResultBuffer(result) {
  if (!result || typeof result !== 'object') return result;
  if (!('buffer' in result)) return result;
  const normalized = toArrayBuffer(result.buffer);
  if (!normalized) return result;
  return Object.assign({}, result, { buffer: normalized });
}

function normalizeDialogFiles(result) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.files)) return result;
  return Object.assign({}, result, {
    files: result.files.map((file) => {
      if (!file || typeof file !== 'object') return file;
      const normalized = toArrayBuffer(file.buffer);
      if (!normalized) return file;
      return Object.assign({}, file, { buffer: normalized });
    })
  });
}

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

function pickWsContext(ws) {
  if (!ws || typeof ws !== 'object') return null;
  const id = asString(ws.id, 128).trim();
  if (!id) return null;
  return { id, name: asString(ws.name, 256) };
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
  if (Array.isArray(src.expectedAuthors)) out.expectedAuthors = src.expectedAuthors.map(item => asString(item, 256)).filter(Boolean).slice(0, 8);
  if (src.expectedYear != null) out.expectedYear = asString(src.expectedYear, 32);
  if (src.requireDoiEvidence != null) out.requireDoiEvidence = !!src.requireDoiEvidence;
  const wsCtx = pickWsContext(src.ws);
  if (wsCtx) out.ws = wsCtx;
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
  if (src.allowAnyHost != null) {
    out.allowAnyHost = !!src.allowAnyHost;
  }
  return out;
}

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

function listen(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const wrapped = (_event, payload) => {
    try { callback(payload); } catch (_e) {}
  };
  ipcRenderer.on(channel, wrapped);
  return () => {
    try { ipcRenderer.removeListener(channel, wrapped); } catch (_e) {}
  };
}

const electronAPI = {
  // Data sync
  loadData:       ()          => invoke('data:load'),
  saveData:       (json)      => invoke('data:save', typeof json === 'string' ? json : JSON.stringify(json || {})),
  saveEditorDraft:(json)      => invoke('data:saveDraft', typeof json === 'string' ? json : JSON.stringify(json || {})),

  // PDF file management (ws optional: {id, name} — routes into workspace-scoped folder)
  savePDF:        (refId, buf, ws)=> invoke('pdf:save', asRefId(refId), buf, pickWsContext(ws)),
  loadPDF:        (refId, ws)     => invoke('pdf:load', asRefId(refId), pickWsContext(ws)).then(normalizeResultBuffer),
  pdfExists:      (refId, ws)     => invoke('pdf:exists', asRefId(refId), pickWsContext(ws)),
  deletePDF:      (refId, ws)     => invoke('pdf:delete', asRefId(refId), pickWsContext(ws)),
  showPdfInExplorer: (refId, ws)  => invoke('pdf:showInExplorer', asRefId(refId), pickWsContext(ws)),
  deleteWorkspacePdfFolder: (ws)  => invoke('pdf:deleteWorkspaceFolder', pickWsContext(ws)),

  // PDF download (CORS-free, Node.js redirect following)
  downloadPDFfromURL: (url, refId, options) => invoke('pdf:download', asURL(url), asRefId(refId), pickDownloadOptions(options)),
  netFetchJSON:      (url, options) => invoke('net:fetch-json', asURL(url), pickNetFetchOptions(options)),
  netFetchText:      (url, options) => invoke('net:fetch-text', asURL(url), pickNetFetchOptions(options)),

  // PDF sync
  pdfSyncAll:     ()         => invoke('pdf:syncAll'),

  // File dialogs
  openPDFDialog:  ()          => invoke('dialog:openPDF').then(normalizeDialogFiles),
  wordToHtml:     (filePath)  => invoke('word:toHtml', asString(filePath, 4096)),
  exportPDF:      (options)   => invoke('export:pdf', options && typeof options === 'object' ? options : {}),
  exportAnnotatedPdfNative: (options) => invoke('pdf:exportAnnotated', options && typeof options === 'object' ? options : {}),
  exportDOCX:     (options)   => invoke('export:docx', options && typeof options === 'object' ? options : {}),

  // Sync settings
  getSyncSettings: ()         => invoke('sync:getSettings'),
  setSyncDir:      ()         => invoke('sync:setSyncDir'),
  clearSyncDir:    ()         => invoke('sync:clearSyncDir'),

  // App info
  getAppInfo:      ()         => invoke('app:getInfo'),
  getDocumentHistory: (docId, limit) => invoke('docHistory:get', asString(docId, 320), Number.isFinite(Number(limit)) ? Number(limit) : 20),
  restoreDocumentHistorySnapshot: (docId, snapshotId) => invoke('docHistory:restore', asString(docId, 320), asString(snapshotId, 128)),

  // Browser capture
  getBrowserCaptureStatus: () => invoke('browserCapture:getStatus'),
  prepareBrowserCaptureSetup: () => invoke('browserCapture:prepareSetup'),
  runBrowserCaptureAction: (action) => invoke('browserCapture:runAction', asString(action, 64)),
  testBrowserCaptureConnection: () => invoke('browserCapture:testConnection'),
  lookupBrowserCaptureTarget: (payload) => invoke('browserCapture:lookup', payload && typeof payload === 'object' ? payload : {}),
  openBrowserCaptureInstallDir: () => invoke('browserCapture:openInstallDir'),
  openBrowserCaptureGuide: () => invoke('browserCapture:openGuide'),
  updateBrowserCapturePrefs: (prefs) => invoke('browserCapture:updatePrefs', prefs && typeof prefs === 'object' ? prefs : {}),
  createBrowserCaptureWorkspace: (name) => invoke('browserCapture:createWorkspace', asString(name, 256)),
  browserCaptureRendererReady: () => invoke('browserCapture:rendererReady'),
  ackBrowserCapturePayload: (queueId) => invoke('browserCapture:ackPayload', asString(queueId, 128)),
  onBrowserCaptureIncoming: (callback) => listen('browserCapture:incoming', callback),
  onBrowserCaptureWorkspaceCreated: (callback) => listen('browserCapture:workspaceCreated', callback),
  onBrowserCaptureStateChanged: (callback) => listen('browserCapture:stateChanged', callback),

  // Auto-update
  checkUpdate:     ()         => invoke('update:check'),
  downloadUpdate:  (url)      => invoke('update:download', asURL(url)),
  setUpdateUrl:    (url)      => invoke('update:setUrl', asURL(url)),
  restartApp:      ()         => invoke('update:restart'),
};

contextBridge.exposeInMainWorld('electronAPI', Object.freeze(electronAPI));

// ── Local OCR bridge (Tesseract.js, on-device) ────────────────────────────
// Replaces the previous AI-powered OCR. No network, no API keys.
const ocrAPI = {
  recognize: (payload) => invoke('ocr:recognize', payload && typeof payload === 'object' ? payload : {})
};

contextBridge.exposeInMainWorld('ocrAPI', Object.freeze(ocrAPI));
