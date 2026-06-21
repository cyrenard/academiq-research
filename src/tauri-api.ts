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
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    const binary = window.atob(String(base64 || ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(String(base64 || ''), 'base64');
    const ab = new ArrayBuffer(buf.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < buf.length; ++i) {
      view[i] = buf[i];
    }
    return ab;
  }
  return new ArrayBuffer(0);
}

function anyToBase64(buf) {
  if (typeof buf === 'string') return buf;
  if (!buf) return '';
  let uint8;
  if (buf instanceof Uint8Array) {
    uint8 = buf;
  } else if (buf instanceof ArrayBuffer) {
    uint8 = new Uint8Array(buf);
  } else if (Array.isArray(buf)) {
    uint8 = new Uint8Array(buf);
  } else if (buf.buffer && buf.buffer instanceof ArrayBuffer) {
    uint8 = new Uint8Array(buf.buffer);
  } else {
    return buf;
  }
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    const chunks = [];
    const chunkSize = 0xffff;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      chunks.push(String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize)));
    }
    return window.btoa(chunks.join(''));
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(uint8).toString('base64');
  }
  return '';
}

function wordImportMammothOptions() {
  const mammoth = typeof window !== 'undefined' ? window.mammoth : null;
  const options = {
    styleMap: [
      "p[style-name='Title'] => h1:fresh",
      "p[style-name='Subtitle'] => h2:fresh",
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
      "p[style-name='Heading 4'] => h4:fresh",
      "p[style-name='Heading 5'] => h5:fresh",
      "p[style-name='Başlık 1'] => h1:fresh",
      "p[style-name='Başlık 2'] => h2:fresh",
      "p[style-name='Başlık 3'] => h3:fresh",
      "p[style-name='Başlık 4'] => h4:fresh",
      "p[style-name='Başlık 5'] => h5:fresh",
      "p[style-name='Baslik 1'] => h1:fresh",
      "p[style-name='Baslik 2'] => h2:fresh",
      "p[style-name='Baslik 3'] => h3:fresh",
      "p[style-name='Baslik 4'] => h4:fresh",
      "p[style-name='Baslik 5'] => h5:fresh"
    ],
    includeDefaultStyleMap: true
  };

  if (mammoth && mammoth.images && typeof mammoth.images.imgElement === 'function') {
    options.convertImage = mammoth.images.imgElement(function(image) {
      return image.read("base64").then(function(imageBuffer) {
        return {
          src: "data:" + image.contentType + ";base64," + imageBuffer
        };
      });
    });
  }

  return options;
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
  const result = await mammoth.convertToHtml(
    { arrayBuffer: base64ToArrayBuffer(payload.base64) },
    wordImportMammothOptions()
  );
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
  return { id, name: asString(ws.name, 256), title: asString(ws.title, 512) };
}

function pickObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer || 0);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return window.btoa(binary);
}

async function buildPdfBase64FromHtml(html, options) {
  const html2pdf = typeof window !== 'undefined' ? window.html2pdf : null;
  if (!html2pdf || typeof html2pdf !== 'function') {
    throw new Error('PDF oluşturucu yüklenmedi');
  }
  const sourceHtml = String(html || '').trim();
  if (!sourceHtml) throw new Error('PDF içeriği boş');
  const wrapper = document.createElement('div');
  wrapper.innerHTML = sourceHtml;
  const exportRoot = wrapper.querySelector && wrapper.querySelector('.aq-export-root');
  const source = exportRoot || wrapper;
  source.style.background = '#ffffff';
  source.style.color = '#000000';
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;color:#000;z-index:-1;';
  host.appendChild(source);
  document.body.appendChild(host);
  try {
    const basePdfOptions = window.AQTipTapWordIO && typeof window.AQTipTapWordIO.buildPDFExportOptions === 'function'
      ? window.AQTipTapWordIO.buildPDFExportOptions()
      : {
          margin: options && options.marginMode === 'none' ? [0, 0, 0, 0] : [0, 0, 0, 0],
          filename: asString(options && options.defaultPath, 512) || 'academiq-document.pdf',
          image: { type: 'jpeg', quality: 0.99 },
          html2canvas: { scale: 3, useCORS: true, backgroundColor: '#ffffff', letterRendering: true, scrollX: 0, scrollY: 0 },
          jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'], avoid: ['blockquote', 'table', 'tr', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', '.toc-container'] }
        };
    const estimatedPixels = Math.max(1, source.scrollHeight || host.scrollHeight || 1200) * Math.max(1, source.scrollWidth || host.scrollWidth || 794);
    const adaptiveScale = estimatedPixels > 2400000 ? 1.25 : estimatedPixels > 1200000 ? 1.6 : 2;
    const pdfOptions = {
      ...basePdfOptions,
      html2canvas: {
        ...(basePdfOptions && basePdfOptions.html2canvas ? basePdfOptions.html2canvas : {}),
        scale: Math.min(Number(basePdfOptions && basePdfOptions.html2canvas && basePdfOptions.html2canvas.scale) || adaptiveScale, adaptiveScale),
        backgroundColor: '#ffffff',
        letterRendering: false,
        useCORS: true,
        scrollX: 0,
        scrollY: 0
      }
    };
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    const worker = html2pdf().set(pdfOptions).from(source).toPdf();
    const blob = await worker.outputPdf('blob');
    return arrayBufferToBase64(await blob.arrayBuffer());
  } finally {
    try { host.remove(); } catch (_e) {}
  }
}

function listen(_channel, _callback) {
  const eventApi = typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.event
    ? window.__TAURI__.event
    : null;
  if (eventApi && typeof eventApi.listen === 'function') {
    return eventApi.listen(_channel, (event) => {
      try {
        _callback(event && typeof event === 'object' && 'payload' in event ? event.payload : event);
      } catch (_e) {}
    });
  }
  return function unsubscribe() {};
}

try {
  if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
    const nativeConfirm = typeof window.confirm === 'function' ? window.confirm.bind(window) : null;
    const nativePrompt = typeof window.prompt === 'function' ? window.prompt.bind(window) : null;
    if (nativeConfirm && !window.__AQ_TAURI_CONFIRM_GUARD__) {
      Object.defineProperty(window, '__AQ_TAURI_CONFIRM_GUARD__', { value: true, configurable: true });
      window.confirm = function confirmGuard(message) {
        const fallbackConfirm = () => {
          if (!nativePrompt) return false;
          const text = typeof message === 'string' ? message : String(message ?? '');
          return nativePrompt(`${text}\n\nDevam etmek icin EVET yazin.`, 'EVET') === 'EVET';
        };
        try {
          const result = nativeConfirm(message);
          if (result && typeof result === 'object' && typeof result.catch === 'function') {
            result.catch(() => {});
            return fallbackConfirm();
          }
          return typeof result === 'boolean' ? result : fallbackConfirm();
        } catch (_e) {
          return fallbackConfirm();
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
  saveData: (json, source) => invokeCommand('data_save', { json: typeof json === 'string' ? json : JSON.stringify(json || {}), source }),
  saveEditorDraft: (json) => invokeCommand('data_save_draft', { json: typeof json === 'string' ? json : JSON.stringify(json || {}) }),

  savePDF: (refId, buf, ws) => invokeCommand('pdf_save', { refId: asRefId(refId), buffer: anyToBase64(buf), ws: pickWsContext(ws) }),
  loadPDF: async (refId, ws) => {
    const result = await invokeCommand('pdf_load', { refId: asRefId(refId), ws: pickWsContext(ws) });
    if (result && typeof result === 'object' && result.ok && result.data) {
      if (result.isBase64 || typeof result.data === 'string') {
        const decoded = base64ToArrayBuffer(result.data);
        return { ...result, buffer: decoded };
      }
      if (!result.buffer) {
        return { ...result, buffer: result.data };
      }
    }
    return result;
  },
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
  openWordDialog: () => invokeCommand('dialog_open_word'),
  openBibliographyDialog: () => invokeCommand('dialog_open_bibliography'),
  wordToHtml: (filePath) => wordToHtmlViaMammoth(filePath),
  exportPDF: async (options) => {
    const payload = pickObject(options);
    if (typeof payload.exportHTML === 'string' && !payload.pdfBase64 && !payload.layoutJson && !payload.layout_json) {
      try {
        const pdfBase64 = await buildPdfBase64FromHtml(payload.exportHTML, payload);
        return invokeCommand('export_pdf', {
          options: { ...payload, exportHTML: undefined, pdfBase64 }
        });
      } catch (error) {
        return {
          ok: false,
          error: error && error.message ? String(error.message) : String(error || 'PDF oluşturulamadı'),
          stage: 'browser_pdf_render'
        };
      }
    }
    return invokeCommand('export_pdf', {
      layoutJson: typeof payload.layoutJson === 'string' ? payload.layoutJson : undefined,
      options: payload
    });
  },
  exportAnnotatedPdfNative: (options) => invokeCommand('pdf_export_annotated', { options: pickObject(options) }),
  exportDOCX: (options) => invokeCommand('export_docx', { options: pickObject(options) }),

  getSyncSettings: () => invokeCommand('sync_get_settings'),
  setSyncDir: () => invokeCommand('sync_set_sync_dir'),
  clearSyncDir: () => invokeCommand('sync_clear_sync_dir'),
  createBackup: () => invokeCommand('backup_create'),
  createBackupAuto: () => invokeCommand('backup_create_auto'),
  restoreBackup: () => invokeCommand('backup_restore'),
  getLocalMatrixAssistantStatus: (settings) => invokeCommand('local_matrix_assistant_get_status', { settings: pickObject(settings) }),
  rankLocalMatrixCandidates: (payload) => invokeCommand('local_matrix_assistant_rank_candidates', { payload: pickObject(payload) }),
  composeLocalMatrixCells: (payload) => invokeCommand('local_matrix_assistant_compose_cells', { payload: pickObject(payload) }),
  getAppInfo: () => invokeCommand('app_get_info'),
  getDocumentHistory: (docId, limit) => invokeCommand('doc_history_get', { docId: asString(docId, 320), limit: Number.isFinite(Number(limit)) ? Number(limit) : 20 }),
  restoreDocumentHistorySnapshot: (docId, snapshotId) => invokeCommand('doc_history_restore', { docId: asString(docId, 320), snapshotId: asString(snapshotId, 128) }),

  getBrowserCaptureStatus: () => invokeCommand('browser_capture_get_status'),
  prepareBrowserCaptureSetup: (browserFamily) => invokeCommand('browser_capture_prepare_setup', { browserFamily: asString(browserFamily, 32) || undefined }),
  runBrowserCaptureAction: (action, browserFamily) => invokeCommand('browser_capture_run_action', { action: asString(action, 64), browserFamily: asString(browserFamily, 32) || undefined }),
  testBrowserCaptureConnection: () => invokeCommand('browser_capture_test_connection'),
  lookupBrowserCaptureTarget: (payload) => invokeCommand('browser_capture_lookup', { payload: pickObject(payload) }),
  openBrowserCaptureInstallDir: (browserFamily) => invokeCommand('browser_capture_open_install_dir', { browserFamily: asString(browserFamily, 32) || undefined }),
  openBrowserCaptureGuide: (browserFamily) => invokeCommand('browser_capture_open_guide', { browserFamily: asString(browserFamily, 32) || undefined }),
  updateBrowserCapturePrefs: (prefs) => invokeCommand('browser_capture_update_prefs', { prefs: pickObject(prefs) }),
  createBrowserCaptureWorkspace: (name) => invokeCommand('browser_capture_create_workspace', { name: asString(name, 256) }),
  browserCaptureRendererReady: () => invokeCommand('browser_capture_renderer_ready'),
  ackBrowserCapturePayload: (queueId) => invokeCommand('browser_capture_ack_payload', { queueId: asString(queueId, 128) }),
  onBrowserCaptureEvent: (callback) => listen('browser_capture:event', callback),
  onBrowserCaptureIncoming: (callback) => listen('browserCapture:incoming', callback),
  onBrowserCaptureWorkspaceCreated: (callback) => listen('browserCapture:workspaceCreated', callback),
  onBrowserCaptureStateChanged: (callback) => listen('browserCapture:stateChanged', callback),

  checkUpdate: () => invokeCommand('update_check'),
  downloadUpdate: (url) => invokeCommand('update_download', { url: asURL(url) }),
  setUpdateUrl: (url) => invokeCommand('update_set_url', { url: asURL(url) }),
  restartApp: () => invokeCommand('update_restart'),
  minimizeWindow: () => invokeCommand('window_minimize'),
  startWindowDrag: () => invokeCommand('window_start_dragging'),
  toggleMaximizeWindow: () => invokeCommand('window_toggle_maximize'),
  closeWindow: () => invokeCommand('window_close')
};

const ocrAPI = {
  recognize: (payload) => invokeCommand('ocr_recognize', { payload: pickObject(payload) })
};

function installWindowAPI(name, api) {
  if (typeof window === 'undefined') return api;
  const frozen = Object.freeze(api);
  try {
    const current = window[name];
    if (current && typeof current === 'object') {
      const merged = Object.freeze(Object.assign({}, frozen, current));
      Object.defineProperty(window, name, {
        value: merged,
        writable: false,
        configurable: true,
        enumerable: true
      });
      return merged;
    }
    Object.defineProperty(window, name, {
      value: frozen,
      writable: false,
      configurable: true,
      enumerable: true
    });
    return frozen;
  } catch (error) {
    try {
      const current = window[name];
      if (current && typeof current === 'object') return current;
    } catch (_e) {}
    try {
      window.localStorage?.setItem?.(`aq.${name}.installError`, String(error && error.message ? error.message : error));
    } catch (_e) {}
    return frozen;
  }
}

electronAPI.db = {
  librarySearch: (query) => invokeCommand('library_search', { query: asString(query, 1024) }),
  libraryGet: (id) => invokeCommand('library_get', { id: asString(id, 320) }),
  integrityCheck: () => invokeCommand('db_integrity_check'),
  forceRemigrateHistory: () => invokeCommand('db_force_remigrate_history'),
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
  check: (text, lang = 'tr', wsId = '') => invokeCommand('spell_check', { text: asString(text, 500000), lang: asString(lang, 16) || 'tr', wsId: asString(wsId, 160) }),
  suggest: (word, lang = 'tr', wsId = '') => invokeCommand('spell_suggest', { word: asString(word, 256), lang: asString(lang, 16) || 'tr', wsId: asString(wsId, 160) }),
  addUserWord: (word, lang = 'tr', wsId = '') => invokeCommand('spell_add_user_word', { word: asString(word, 256), lang: asString(lang, 16) || 'tr', wsId: asString(wsId, 160) }),
  getUserDictionary: (lang = 'tr', wsId = '') => invokeCommand('spell_get_user_dictionary', { lang: asString(lang, 16) || 'tr', wsId: asString(wsId, 160) })
};

electronAPI.export = {
  pdf: (layoutJson, options = {}) => invokeCommand('export_pdf', {
    layoutJson: typeof layoutJson === 'string' ? layoutJson : JSON.stringify(layoutJson || {}),
    options: pickObject(options)
  })
};

electronAPI.fs = {
  readFileText: (path) => invokeCommand('read_file_text', { path: asString(path, 4096) }),
  readFileBase64: (path) => invokeCommand('read_file_base64', { path: asString(path, 4096) })
};

if (typeof window !== 'undefined') {
  installWindowAPI('electronAPI', electronAPI);
  installWindowAPI('ocrAPI', ocrAPI);
  try {
    Object.defineProperty(window, '__AQ_TAURI_API_READY__', {
      value: true,
      writable: false,
      configurable: true
    });
  } catch (_e) {}
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { electronAPI, ocrAPI };
}
