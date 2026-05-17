const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rootDir = path.join(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(rootDir, ...parts), 'utf8');
}

function loadTauriApi() {
  const calls = [];
  const listeners = {};
  const window = {
    __TAURI__: {
      core: {
        invoke(command, args) {
          calls.push({ command, args: args || {} });
          if (/^(export_|pdf_export_annotated)/.test(command)) {
            return Promise.resolve({ ok: false, error: 'not_implemented_phase_5' });
          }
          if (/^browser_capture_/.test(command)) {
            return Promise.resolve({ ok: false, error: 'not_implemented_phase_6' });
          }
          if (command === 'ocr_recognize') {
            return Promise.resolve({ ok: false, code: 'OCR_NOT_IMPLEMENTED_PHASE_4' });
          }
          return Promise.resolve({ ok: true, command, args: args || {} });
        }
      }
    },
    addEventListener(type, callback) {
      listeners[type] = callback;
    }
  };
  const context = {
    Promise,
    Number,
    String,
    JSON,
    Object,
    Uint8Array,
    ArrayBuffer,
    module: { exports: {} },
    window
  };
  context.globalThis = window;
  vm.runInNewContext(read('src', 'tauri-api.ts'), context);
  return { api: window.electronAPI, ocr: window.ocrAPI, calls, listeners };
}

const parityCases = [
  ['loadData', 'data_load', []],
  ['saveData', 'data_save', [{ documents: [] }]],
  ['saveEditorDraft', 'data_save_draft', [{ html: '<p>x</p>' }]],
  ['savePDF', 'pdf_save', ['ref-1', [37, 80, 68, 70], { id: 'ws-1', name: 'Workspace' }]],
  ['loadPDF', 'pdf_load', ['ref-1', { id: 'ws-1' }]],
  ['pdfExists', 'pdf_exists', ['ref-1', { id: 'ws-1' }]],
  ['deletePDF', 'pdf_delete', ['ref-1', { id: 'ws-1' }]],
  ['showPdfInExplorer', 'pdf_show_in_explorer', ['ref-1', { id: 'ws-1' }]],
  ['deleteWorkspacePdfFolder', 'pdf_delete_workspace_folder', [{ id: 'ws-1' }]],
  ['downloadPDFfromURL', 'pdf_download', ['https://example.com/a.pdf', 'ref-1', { ws: { id: 'ws-1' } }]],
  ['openExternalUrl', 'app_open_external_url', ['https://example.com']],
  ['netFetchJSON', 'net_fetch_json', ['https://api.crossref.org/works/10.5555/12345678', { timeoutMs: 2500, allowAnyHost: true }]],
  ['netFetchText', 'net_fetch_text', ['https://example.com', { timeoutMs: 2500, allowAnyHost: true }]],
  ['pdfSyncAll', 'pdf_sync_all', []],
  ['openPDFDialog', 'dialog_open_pdf', []],
  ['wordToHtml', 'word_to_html', ['C:/tmp/a.docx']],
  ['exportPDF', 'export_pdf', [{ defaultPath: 'a.pdf' }], 'not_implemented_phase_5'],
  ['exportAnnotatedPdfNative', 'pdf_export_annotated', [{ pdfBase64: 'JVBERi0=' }], 'not_implemented_phase_5'],
  ['exportDOCX', 'export_docx', [{ defaultPath: 'a.docx' }], 'not_implemented_phase_5'],
  ['getSyncSettings', 'sync_get_settings', []],
  ['setSyncDir', 'sync_set_sync_dir', []],
  ['clearSyncDir', 'sync_clear_sync_dir', []],
  ['createBackup', 'backup_create', []],
  ['restoreBackup', 'backup_restore', []],
  ['getLocalMatrixAssistantStatus', 'local_matrix_assistant_get_status', [{ provider: 'local' }]],
  ['rankLocalMatrixCandidates', 'local_matrix_assistant_rank_candidates', [{ candidates: [] }]],
  ['composeLocalMatrixCells', 'local_matrix_assistant_compose_cells', [{ rows: [] }]],
  ['getAppInfo', 'app_get_info', []],
  ['getDocumentHistory', 'doc_history_get', ['doc-1', 3]],
  ['restoreDocumentHistorySnapshot', 'doc_history_restore', ['doc-1', 'snap-1']],
  ['getBrowserCaptureStatus', 'browser_capture_get_status', [], 'not_implemented_phase_6'],
  ['prepareBrowserCaptureSetup', 'browser_capture_prepare_setup', [], 'not_implemented_phase_6'],
  ['runBrowserCaptureAction', 'browser_capture_run_action', ['install'], 'not_implemented_phase_6'],
  ['testBrowserCaptureConnection', 'browser_capture_test_connection', [], 'not_implemented_phase_6'],
  ['lookupBrowserCaptureTarget', 'browser_capture_lookup', [{ url: 'https://example.com' }], 'not_implemented_phase_6'],
  ['openBrowserCaptureInstallDir', 'browser_capture_open_install_dir', [], 'not_implemented_phase_6'],
  ['openBrowserCaptureGuide', 'browser_capture_open_guide', [], 'not_implemented_phase_6'],
  ['updateBrowserCapturePrefs', 'browser_capture_update_prefs', [{ autoAttachPdfUrl: true }], 'not_implemented_phase_6'],
  ['createBrowserCaptureWorkspace', 'browser_capture_create_workspace', ['Workspace'], 'not_implemented_phase_6'],
  ['browserCaptureRendererReady', 'browser_capture_renderer_ready', [], 'not_implemented_phase_6'],
  ['ackBrowserCapturePayload', 'browser_capture_ack_payload', ['queue-1'], 'not_implemented_phase_6'],
  ['checkUpdate', 'update_check', []],
  ['downloadUpdate', 'update_download', ['https://github.com/cyrenard/academiq-research/releases/download/v1/file.exe']],
  ['setUpdateUrl', 'update_set_url', ['https://api.github.com/repos/cyrenard/academiq-research/releases/latest']],
  ['restartApp', 'update_restart', []],
  ['minimizeWindow', 'window_minimize', []],
  ['toggleMaximizeWindow', 'window_toggle_maximize', []],
  ['closeWindow', 'window_close', []]
];

test('Tauri shim preserves preload electronAPI and ocrAPI invoke parity', async () => {
  const { api, ocr, calls } = loadTauriApi();
  for (const [apiName, command, args, expectedStub] of parityCases) {
    assert.equal(typeof api[apiName], 'function', apiName);
    const result = await api[apiName](...args);
    const call = calls.at(-1);
    assert.equal(call.command, command, apiName);
    if (expectedStub) assert.equal(result.error, expectedStub, apiName);
  }

  assert.equal(typeof ocr.recognize, 'function');
  const ocrResult = await ocr.recognize({ imageDataUrl: 'data:image/png;base64,AAA=' });
  assert.equal(calls.at(-1).command, 'ocr_recognize');
  assert.equal(ocrResult.code, 'OCR_NOT_IMPLEMENTED_PHASE_4');

  assert.equal(typeof api.db.librarySearch, 'function');
  await api.db.librarySearch('Türkçe');
  assert.equal(calls.at(-1).command, 'library_search');
  await api.db.libraryGet('ref-1');
  assert.equal(calls.at(-1).command, 'library_get');
  await api.db.integrityCheck();
  assert.equal(calls.at(-1).command, 'db_integrity_check');
  await api.db.rollbackToLegacyJson();
  assert.equal(calls.at(-1).command, 'db_rollback_to_legacy_json');

  assert.equal(typeof api.pdf.extractMetadata, 'function');
  await api.pdf.extractMetadata('ref-1', { id: 'ws-1' });
  assert.equal(calls.at(-1).command, 'pdf_extract_metadata');
  await api.pdf.applyAnnotations('ref-1', { id: 'ws-1' }, [{ kind: 'highlight', page: 1, rect: [1, 2, 3, 4] }]);
  assert.equal(calls.at(-1).command, 'pdf_apply_annotations');
  await api.pdf.readAnnotations('ref-1', { id: 'ws-1' });
  assert.equal(calls.at(-1).command, 'pdf_read_annotations');
  await api.pdf.renderPage('ref-1', { id: 'ws-1' }, 1, 150);
  assert.equal(calls.at(-1).command, 'pdf_render_page');
  await api.pdf.extractText('ref-1', { id: 'ws-1' }, 1);
  assert.equal(calls.at(-1).command, 'pdf_extract_text');
  await api.pdf.getOutline('ref-1', { id: 'ws-1' });
  assert.equal(calls.at(-1).command, 'pdf_get_outline');
  await api.pdf.ingest('C:/tmp/a.pdf');
  assert.equal(calls.at(-1).command, 'library_ingest_pdf');

  assert.equal(typeof api.spell.check, 'function');
  await api.spell.check('kitap', 'tr');
  assert.equal(calls.at(-1).command, 'spell_check');
  await api.spell.suggest('kıtap', 'tr');
  assert.equal(calls.at(-1).command, 'spell_suggest');
  await api.spell.addUserWord('academiq', 'tr');
  assert.equal(calls.at(-1).command, 'spell_add_user_word');
  await api.spell.getUserDictionary('tr');
  assert.equal(calls.at(-1).command, 'spell_get_user_dictionary');
});

test('event-style renderer probe bridge maps to a Tauri command', () => {
  const { calls, listeners } = loadTauriApi();
  listeners.error({ message: 'boom', filename: 'app.js', lineno: 1, colno: 2, error: { stack: 'stack' } });
  assert.equal(calls.at(-1).command, 'renderer_probe_error');
  assert.equal(calls.at(-1).args.payload.type, 'error');
});

test('Rust command modules register every preload invoke target', () => {
  const lib = read('src-tauri', 'src', 'lib.rs');
  for (const [, command] of parityCases) {
    assert.match(lib, new RegExp(`commands::.*::${command}`), command);
  }
  assert.match(lib, /commands::ocr::ocr_recognize/);
  assert.match(lib, /commands::app::renderer_probe_error/);
  assert.match(lib, /commands::data::library_search/);
  assert.match(lib, /commands::data::library_get/);
  assert.match(lib, /commands::data::db_integrity_check/);
  assert.match(lib, /commands::data::db_rollback_to_legacy_json/);
  for (const command of [
    'pdf_extract_metadata',
    'pdf_apply_annotations',
    'pdf_read_annotations',
    'pdf_render_page',
    'pdf_extract_text',
    'pdf_get_outline',
    'library_ingest_pdf'
  ]) {
    assert.match(lib, new RegExp(`commands::pdf::${command}`), command);
  }
  for (const command of [
    'spell_check',
    'spell_suggest',
    'spell_add_user_word',
    'spell_get_user_dictionary'
  ]) {
    assert.match(lib, new RegExp(`commands::spell::${command}`), command);
  }
});

test('Phase-deferred handlers return explicit controlled stub messages', () => {
  const exportSource = read('src-tauri', 'src', 'commands', 'export.rs');
  const browserSource = read('src-tauri', 'src', 'commands', 'browser_capture.rs');
  const ocrSource = read('src-tauri', 'src', 'commands', 'ocr.rs');
  assert.match(exportSource, /not_implemented_phase_5/);
  assert.match(browserSource, /not_implemented_phase_6/);
  assert.match(ocrSource, /not_implemented_phase_4/);
});
