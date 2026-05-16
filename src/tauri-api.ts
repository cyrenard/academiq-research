// @ts-nocheck

function getInvoke() {
  const injected = typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.core
    ? window.__TAURI__.core.invoke
    : null;
  if (typeof injected === 'function') return injected;
  return function missingTauriInvoke(command, args) {
    return Promise.resolve({
      ok: false,
      notImplemented: true,
      missingTauriRuntime: true,
      command,
      args: args || {}
    });
  };
}

function invokeNotImplemented(name, args) {
  return getInvoke()('not_implemented', { name, args: args || {} });
}

function asString(value, maxLen) {
  const text = value == null ? '' : String(value);
  return maxLen && text.length > maxLen ? text.slice(0, maxLen) : text;
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

function pickObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function listen(_channel, _callback) {
  return function unsubscribe() {};
}

const electronAPI = {
  loadData: () => invokeNotImplemented('data:load'),
  saveData: (json) => invokeNotImplemented('data:save', { json: typeof json === 'string' ? json : JSON.stringify(json || {}) }),
  saveEditorDraft: (json) => invokeNotImplemented('data:saveDraft', { json: typeof json === 'string' ? json : JSON.stringify(json || {}) }),

  savePDF: (refId, buf, ws) => invokeNotImplemented('pdf:save', { refId: asRefId(refId), buf, ws: pickWsContext(ws) }),
  loadPDF: (refId, ws) => invokeNotImplemented('pdf:load', { refId: asRefId(refId), ws: pickWsContext(ws) }),
  pdfExists: (refId, ws) => invokeNotImplemented('pdf:exists', { refId: asRefId(refId), ws: pickWsContext(ws) }),
  deletePDF: (refId, ws) => invokeNotImplemented('pdf:delete', { refId: asRefId(refId), ws: pickWsContext(ws) }),
  showPdfInExplorer: (refId, ws) => invokeNotImplemented('pdf:showInExplorer', { refId: asRefId(refId), ws: pickWsContext(ws) }),
  deleteWorkspacePdfFolder: (ws) => invokeNotImplemented('pdf:deleteWorkspaceFolder', { ws: pickWsContext(ws) }),
  downloadPDFfromURL: (url, refId, options) => invokeNotImplemented('pdf:download', { url: asURL(url), refId: asRefId(refId), options: pickObject(options) }),
  openExternalUrl: (url) => invokeNotImplemented('app:openExternalUrl', { url: asURL(url) }),
  netFetchJSON: (url, options) => invokeNotImplemented('net:fetch-json', { url: asURL(url), options: pickObject(options) }),
  netFetchText: (url, options) => invokeNotImplemented('net:fetch-text', { url: asURL(url), options: pickObject(options) }),
  pdfSyncAll: () => invokeNotImplemented('pdf:syncAll'),

  openPDFDialog: () => invokeNotImplemented('dialog:openPDF'),
  wordToHtml: (filePath) => invokeNotImplemented('word:toHtml', { filePath: asString(filePath, 4096) }),
  exportPDF: (options) => invokeNotImplemented('export:pdf', { options: pickObject(options) }),
  exportAnnotatedPdfNative: (options) => invokeNotImplemented('pdf:exportAnnotated', { options: pickObject(options) }),
  exportDOCX: (options) => invokeNotImplemented('export:docx', { options: pickObject(options) }),

  getSyncSettings: () => invokeNotImplemented('sync:getSettings'),
  setSyncDir: () => invokeNotImplemented('sync:setSyncDir'),
  clearSyncDir: () => invokeNotImplemented('sync:clearSyncDir'),
  createBackup: () => invokeNotImplemented('backup:create'),
  restoreBackup: () => invokeNotImplemented('backup:restore'),
  getLocalMatrixAssistantStatus: (settings) => invokeNotImplemented('localMatrixAssistant:getStatus', { settings: pickObject(settings) }),
  rankLocalMatrixCandidates: (payload) => invokeNotImplemented('localMatrixAssistant:rankCandidates', { payload: pickObject(payload) }),
  composeLocalMatrixCells: (payload) => invokeNotImplemented('localMatrixAssistant:composeCells', { payload: pickObject(payload) }),
  getAppInfo: () => invokeNotImplemented('app:getInfo'),
  getDocumentHistory: (docId, limit) => invokeNotImplemented('docHistory:get', { docId: asString(docId, 320), limit: Number.isFinite(Number(limit)) ? Number(limit) : 20 }),
  restoreDocumentHistorySnapshot: (docId, snapshotId) => invokeNotImplemented('docHistory:restore', { docId: asString(docId, 320), snapshotId: asString(snapshotId, 128) }),

  getBrowserCaptureStatus: () => invokeNotImplemented('browserCapture:getStatus'),
  prepareBrowserCaptureSetup: () => invokeNotImplemented('browserCapture:prepareSetup'),
  runBrowserCaptureAction: (action) => invokeNotImplemented('browserCapture:runAction', { action: asString(action, 64) }),
  testBrowserCaptureConnection: () => invokeNotImplemented('browserCapture:testConnection'),
  lookupBrowserCaptureTarget: (payload) => invokeNotImplemented('browserCapture:lookup', { payload: pickObject(payload) }),
  openBrowserCaptureInstallDir: () => invokeNotImplemented('browserCapture:openInstallDir'),
  openBrowserCaptureGuide: () => invokeNotImplemented('browserCapture:openGuide'),
  updateBrowserCapturePrefs: (prefs) => invokeNotImplemented('browserCapture:updatePrefs', { prefs: pickObject(prefs) }),
  createBrowserCaptureWorkspace: (name) => invokeNotImplemented('browserCapture:createWorkspace', { name: asString(name, 256) }),
  browserCaptureRendererReady: () => invokeNotImplemented('browserCapture:rendererReady'),
  ackBrowserCapturePayload: (queueId) => invokeNotImplemented('browserCapture:ackPayload', { queueId: asString(queueId, 128) }),
  onBrowserCaptureIncoming: (callback) => listen('browserCapture:incoming', callback),
  onBrowserCaptureWorkspaceCreated: (callback) => listen('browserCapture:workspaceCreated', callback),
  onBrowserCaptureStateChanged: (callback) => listen('browserCapture:stateChanged', callback),

  checkUpdate: () => invokeNotImplemented('update:check'),
  downloadUpdate: (url) => invokeNotImplemented('update:download', { url: asURL(url) }),
  setUpdateUrl: (url) => invokeNotImplemented('update:setUrl', { url: asURL(url) }),
  restartApp: () => invokeNotImplemented('update:restart'),
  minimizeWindow: () => invokeNotImplemented('window:minimize'),
  toggleMaximizeWindow: () => invokeNotImplemented('window:toggleMaximize'),
  closeWindow: () => invokeNotImplemented('window:close')
};

const ocrAPI = {
  recognize: (payload) => invokeNotImplemented('ocr:recognize', { payload: pickObject(payload) })
};

if (typeof window !== 'undefined') {
  window.electronAPI = Object.freeze(electronAPI);
  window.ocrAPI = Object.freeze(ocrAPI);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { electronAPI, ocrAPI };
}
