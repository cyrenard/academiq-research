// @ts-nocheck

function getInvoke() {
  const injected = typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.core
    ? window.__TAURI__.core.invoke
    : null;
  if (typeof injected === 'function') return injected;
  const internal = typeof window !== 'undefined' && window.__TAURI_INTERNALS__
    ? window.__TAURI_INTERNALS__.invoke
    : null;
  if (typeof internal === 'function') return internal;
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

function invokeCommand(command, args) {
  return getInvoke()(command, args || {});
}

function base64ToArrayBuffer(base64) {
  const binary = window.atob(String(base64 || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function wordToHtmlViaMammoth(filePath) {
  const payload = await invokeCommand('word_to_html', { filePath: asString(filePath, 4096) });
  if (!payload || payload.ok !== true || !payload.base64) return payload;
  const mammoth = typeof window !== 'undefined' ? window.mammoth : null;
  if (!mammoth || typeof mammoth.convertToHtml !== 'function') {
    return {
      ok: false,
      error: 'mammoth_browser_unavailable',
      filePath: payload.filePath || filePath
    };
  }
  const result = await mammoth.convertToHtml({ arrayBuffer: base64ToArrayBuffer(payload.base64) });
  return {
    ok: true,
    html: result && typeof result.value === 'string' ? result.value : '',
    messages: result && Array.isArray(result.messages) ? result.messages : [],
    filePath: payload.filePath || filePath
  };
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

try {
  if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
    const nativeConfirm = typeof window.confirm === 'function' ? window.confirm.bind(window) : null;
    if (nativeConfirm && !window.__AQ_TAURI_CONFIRM_GUARD__) {
      Object.defineProperty(window, '__AQ_TAURI_CONFIRM_GUARD__', { value: true, configurable: true });
      window.confirm = function confirmGuard(message) {
        try {
          const result = nativeConfirm(message);
          return typeof result === 'boolean' ? result : false;
        } catch (_e) {
          return false;
        }
      };
    }
    window.addEventListener('error', (event) => {
      invokeCommand('renderer_probe_error', {
        payload: {
          type: 'error',
          message: event && event.message ? String(event.message) : '',
          filename: event && event.filename ? String(event.filename) : '',
          lineno: event && Number.isFinite(Number(event.lineno)) ? Number(event.lineno) : 0,
          colno: event && Number.isFinite(Number(event.colno)) ? Number(event.colno) : 0,
          stack: event && event.error && event.error.stack ? String(event.error.stack) : ''
        }
      });
    });
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event ? event.reason : null;
      invokeCommand('renderer_probe_error', {
        payload: {
          type: 'unhandledrejection',
          message: reason && reason.message ? String(reason.message) : String(reason || ''),
          filename: '',
          lineno: 0,
          colno: 0,
          stack: reason && reason.stack ? String(reason.stack) : ''
        }
      });
    });
  }
} catch (_e) {}

const electronAPI = {
  loadData: () => invokeCommand('data_load'),
  saveData: (json) => invokeCommand('data_save', { json: typeof json === 'string' ? json : JSON.stringify(json || {}) }),
  saveEditorDraft: (json) => invokeCommand('data_save_draft', { json: typeof json === 'string' ? json : JSON.stringify(json || {}) }),

  savePDF: (refId, buf, ws) => invokeCommand('pdf_save', { refId: asRefId(refId), buffer: buf, ws: pickWsContext(ws) }),
  loadPDF: (refId, ws) => invokeCommand('pdf_load', { refId: asRefId(refId), ws: pickWsContext(ws) }),
  pdfExists: (refId, ws) => invokeCommand('pdf_exists', { refId: asRefId(refId), ws: pickWsContext(ws) }),
  deletePDF: (refId, ws) => invokeCommand('pdf_delete', { refId: asRefId(refId), ws: pickWsContext(ws) }),
  showPdfInExplorer: (refId, ws) => invokeCommand('pdf_show_in_explorer', { refId: asRefId(refId), ws: pickWsContext(ws) }),
  deleteWorkspacePdfFolder: (ws) => invokeCommand('pdf_delete_workspace_folder', { ws: pickWsContext(ws) }),
  downloadPDFfromURL: (url, refId, options) => invokeCommand('pdf_download', { url: asURL(url), refId: asRefId(refId), options: pickObject(options) }),
  openExternalUrl: (url) => invokeCommand('app_open_external_url', { url: asURL(url) }),
  netFetchJSON: (url, options) => invokeCommand('net_fetch_json', { url: asURL(url), options: pickObject(options) }),
  netFetchText: (url, options) => invokeCommand('net_fetch_text', { url: asURL(url), options: pickObject(options) }),
  pdfSyncAll: () => invokeCommand('pdf_sync_all'),

  openPDFDialog: () => invokeCommand('dialog_open_pdf'),
  wordToHtml: (filePath) => wordToHtmlViaMammoth(filePath),
  exportPDF: (options) => invokeCommand('export_pdf', { options: pickObject(options) }),
  exportAnnotatedPdfNative: (options) => invokeCommand('pdf_export_annotated', { options: pickObject(options) }),
  exportDOCX: (options) => invokeCommand('export_docx', { options: pickObject(options) }),

  getSyncSettings: () => invokeCommand('sync_get_settings'),
  setSyncDir: () => invokeCommand('sync_set_sync_dir'),
  clearSyncDir: () => invokeCommand('sync_clear_sync_dir'),
  createBackup: () => invokeCommand('backup_create'),
  restoreBackup: () => invokeCommand('backup_restore'),
  getLocalMatrixAssistantStatus: (settings) => invokeCommand('local_matrix_assistant_get_status', { settings: pickObject(settings) }),
  rankLocalMatrixCandidates: (payload) => invokeCommand('local_matrix_assistant_rank_candidates', { payload: pickObject(payload) }),
  composeLocalMatrixCells: (payload) => invokeCommand('local_matrix_assistant_compose_cells', { payload: pickObject(payload) }),
  getAppInfo: () => invokeCommand('app_get_info'),
  getDocumentHistory: (docId, limit) => invokeCommand('doc_history_get', { docId: asString(docId, 320), limit: Number.isFinite(Number(limit)) ? Number(limit) : 20 }),
  restoreDocumentHistorySnapshot: (docId, snapshotId) => invokeCommand('doc_history_restore', { docId: asString(docId, 320), snapshotId: asString(snapshotId, 128) }),

  getBrowserCaptureStatus: () => invokeCommand('browser_capture_get_status'),
  prepareBrowserCaptureSetup: () => invokeCommand('browser_capture_prepare_setup'),
  runBrowserCaptureAction: (action) => invokeCommand('browser_capture_run_action', { action: asString(action, 64) }),
  testBrowserCaptureConnection: () => invokeCommand('browser_capture_test_connection'),
  lookupBrowserCaptureTarget: (payload) => invokeCommand('browser_capture_lookup', { payload: pickObject(payload) }),
  openBrowserCaptureInstallDir: () => invokeCommand('browser_capture_open_install_dir'),
  openBrowserCaptureGuide: () => invokeCommand('browser_capture_open_guide'),
  updateBrowserCapturePrefs: (prefs) => invokeCommand('browser_capture_update_prefs', { prefs: pickObject(prefs) }),
  createBrowserCaptureWorkspace: (name) => invokeCommand('browser_capture_create_workspace', { name: asString(name, 256) }),
  browserCaptureRendererReady: () => invokeCommand('browser_capture_renderer_ready'),
  ackBrowserCapturePayload: (queueId) => invokeCommand('browser_capture_ack_payload', { queueId: asString(queueId, 128) }),
  onBrowserCaptureIncoming: (callback) => listen('browserCapture:incoming', callback),
  onBrowserCaptureWorkspaceCreated: (callback) => listen('browserCapture:workspaceCreated', callback),
  onBrowserCaptureStateChanged: (callback) => listen('browserCapture:stateChanged', callback),

  checkUpdate: () => invokeCommand('update_check'),
  downloadUpdate: (url) => invokeCommand('update_download', { url: asURL(url) }),
  setUpdateUrl: (url) => invokeCommand('update_set_url', { url: asURL(url) }),
  restartApp: () => invokeCommand('update_restart'),
  minimizeWindow: () => invokeCommand('window_minimize'),
  toggleMaximizeWindow: () => invokeCommand('window_toggle_maximize'),
  closeWindow: () => invokeCommand('window_close')
};

const ocrAPI = {
  recognize: (payload) => invokeCommand('ocr_recognize', { payload: pickObject(payload) })
};

electronAPI.db = {
  librarySearch: (query) => invokeCommand('library_search', { query: asString(query, 1024) }),
  libraryGet: (id) => invokeCommand('library_get', { id: asString(id, 320) }),
  integrityCheck: () => invokeCommand('db_integrity_check'),
  rollbackToLegacyJson: () => invokeCommand('db_rollback_to_legacy_json')
};

electronAPI.pdf = {
  extractMetadata: (refId, ws) => invokeCommand('pdf_extract_metadata', { refId: asRefId(refId), ws: pickWsContext(ws) }),
  applyAnnotations: (refId, ws, annotations) => invokeCommand('pdf_apply_annotations', { refId: asRefId(refId), ws: pickWsContext(ws), annotations: Array.isArray(annotations) ? annotations : [] }),
  readAnnotations: (refId, ws) => invokeCommand('pdf_read_annotations', { refId: asRefId(refId), ws: pickWsContext(ws) }),
  renderPage: (refId, ws, page, dpi) => invokeCommand('pdf_render_page', { refId: asRefId(refId), ws: pickWsContext(ws), page: Number(page) || 1, dpi: Number(dpi) || 150 }),
  extractText: (refId, ws, page) => invokeCommand('pdf_extract_text', { refId: asRefId(refId), ws: pickWsContext(ws), page: Number(page) || 1 }),
  getOutline: (refId, ws) => invokeCommand('pdf_get_outline', { refId: asRefId(refId), ws: pickWsContext(ws) }),
  ingest: (filePath) => invokeCommand('library_ingest_pdf', { filePath: asString(filePath, 4096) })
};

electronAPI.spell = {
  check: (text, lang = 'tr') => invokeCommand('spell_check', { text: asString(text, 500000), lang: asString(lang, 16) || 'tr' }),
  suggest: (word, lang = 'tr') => invokeCommand('spell_suggest', { word: asString(word, 256), lang: asString(lang, 16) || 'tr' }),
  addUserWord: (word, lang = 'tr') => invokeCommand('spell_add_user_word', { word: asString(word, 256), lang: asString(lang, 16) || 'tr' }),
  getUserDictionary: (lang = 'tr') => invokeCommand('spell_get_user_dictionary', { lang: asString(lang, 16) || 'tr' })
};

if (typeof window !== 'undefined') {
  window.electronAPI = Object.freeze(electronAPI);
  window.ocrAPI = Object.freeze(ocrAPI);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { electronAPI, ocrAPI };
}
