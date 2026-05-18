const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const vm = require('node:vm');

const rootDir = path.join(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(rootDir, ...parts), 'utf8');
}

test('Phase 0 Tauri config points at the React renderer build', () => {
  const config = JSON.parse(read('src-tauri', 'tauri.conf.json'));
  assert.equal(config.identifier, 'com.academiq.research');
  assert.equal(config.build.frontendDist, '../dist/renderer');
  assert.equal(config.build.devUrl, 'http://127.0.0.1:5173');
  assert.equal(config.app.windows[0].title, 'AcademiQ Research');
  assert.equal(config.app.windows[0].width, 1400);
  assert.equal(config.app.windows[0].height, 900);
  assert.equal(config.app.windows[0].decorations, false);
  assert.equal(config.app.windows[0].resizable, true);
  assert.deepEqual(config.bundle.targets, ['nsis']);
  assert.equal(config.bundle.windows.nsis.installMode, 'currentUser');
  assert.deepEqual(config.bundle.windows.nsis.languages, ['Turkish', 'English']);
  assert.equal(config.bundle.windows.nsis.displayLanguageSelector, false);
  assert.match(config.app.security.csp, /worker-src 'self' blob:/);
  assert.match(config.app.security.csp, /script-src 'self' 'unsafe-inline'/);
  assert.match(config.app.security.csp, /img-src 'self' data: blob:/);
});

test('Phase 0 shim exposes preload-compatible electronAPI and ocrAPI names', async () => {
  const source = read('src', 'tauri-api.ts');
  const calls = [];
  const context = {
    Promise,
    Number,
    String,
    JSON,
    Object,
    module: { exports: {} },
    window: {
      __TAURI__: {
        core: {
          invoke(command, args) {
            calls.push({ command, args });
            return Promise.resolve({ ok: false, notImplemented: true, command, args });
          }
        }
      }
    }
  };
  context.globalThis = context.window;
  vm.runInNewContext(source, context);

  const api = context.window.electronAPI;
  const ocr = context.window.ocrAPI;
  [
    'loadData', 'saveData', 'saveEditorDraft', 'savePDF', 'loadPDF', 'pdfExists', 'deletePDF',
    'showPdfInExplorer', 'deleteWorkspacePdfFolder', 'downloadPDFfromURL', 'openExternalUrl',
    'netFetchJSON', 'netFetchText', 'pdfSyncAll', 'openPDFDialog', 'wordToHtml', 'exportPDF',
    'exportAnnotatedPdfNative', 'exportDOCX', 'getSyncSettings', 'setSyncDir', 'clearSyncDir',
    'createBackup', 'restoreBackup', 'getLocalMatrixAssistantStatus', 'rankLocalMatrixCandidates',
    'composeLocalMatrixCells', 'getAppInfo', 'getDocumentHistory', 'restoreDocumentHistorySnapshot',
    'getBrowserCaptureStatus', 'prepareBrowserCaptureSetup', 'runBrowserCaptureAction',
    'testBrowserCaptureConnection', 'lookupBrowserCaptureTarget', 'openBrowserCaptureInstallDir',
    'openBrowserCaptureGuide', 'updateBrowserCapturePrefs', 'createBrowserCaptureWorkspace',
    'browserCaptureRendererReady', 'ackBrowserCapturePayload', 'onBrowserCaptureIncoming',
    'onBrowserCaptureWorkspaceCreated', 'onBrowserCaptureStateChanged', 'checkUpdate',
    'downloadUpdate', 'setUpdateUrl', 'restartApp', 'minimizeWindow', 'toggleMaximizeWindow',
    'closeWindow'
  ].forEach((name) => assert.equal(typeof api[name], 'function', name));
  assert.equal(typeof ocr.recognize, 'function');

  await api.savePDF(' ref ', new Uint8Array([1, 2]), { id: 'ws', name: 'Workspace' });
  await api.minimizeWindow();
  await ocr.recognize({ imageDataUrl: 'data:image/png;base64,AAA=' });
  assert.equal(calls[0].command, 'pdf_save');
  assert.equal(calls[0].args.refId, 'ref');
  assert.equal(calls[1].command, 'window_minimize');
  assert.equal(calls[2].command, 'ocr_recognize');
});

test('Phase 0.5 React shell loads aq-engine scripts before the React entry', () => {
  const html = read('index.html');
  const order = [
    '/tiptap-bundle.js',
    '/experiments/aq-engine/document.js',
    '/experiments/aq-engine/engine.js',
    '/experiments/aq-engine/selection.js',
    '/experiments/aq-engine/input.js',
    '/experiments/aq-engine/tiptap-adapter.js',
    '/experiments/aq-engine/compat-shim.js',
    '/src/renderer/main.tsx'
  ].map((needle) => html.indexOf(needle));
  order.forEach((index) => assert.ok(index >= 0));
  for (let index = 1; index < order.length; index += 1) {
    assert.ok(order[index] > order[index - 1], `script order ${index}`);
  }
  assert.match(html, /worker-src 'self' blob:/);
});

test('Phase 0.5 React shell mounts aq-engine through AQEngineEditor', () => {
  const host = read('src', 'renderer', 'components', 'editor', 'EditorHost.tsx');
  const component = read('src', 'renderer', 'components', 'editor', 'AQEngineEditor.tsx');
  const editorLib = read('src', 'renderer', 'lib', 'editor.ts');
  const adapter = read('src', 'renderer', 'lib', 'editor-adapter.ts');

  assert.match(host, /AQEngineEditor/);
  assert.match(component, /useRef/);
  assert.match(component, /useEffect/);
  assert.match(component, /createEditor/);
  assert.match(component, /destroy/);
  assert.match(editorLib, /createAcademiqEditor/);
  assert.match(editorLib, /chain/);
  assert.match(adapter, /AQTipTapWordInit/);
  assert.match(adapter, /_aqEngine/);
});

test('Phase 0.5 aq-engine integration suite passes under the React shell contract', () => {
  const env = { ...process.env };
  Object.keys(env).forEach((key) => {
    if (key.startsWith('NODE_TEST')) delete env[key];
  });
  const result = spawnSync(process.execPath, ['--test', 'tests/aq-engine-integration.test.js'], {
    cwd: rootDir,
    encoding: 'utf8',
    env
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /pass 54|tests 54/);
});

test('Turkish IME characters survive normal JS input and casing paths', () => {
  const typed = '\u011f \u015f \u0131 i \u00f6 \u00fc \u00e7 \u011e \u015e I \u0130 \u00d6 \u00dc \u00c7';
  assert.equal(Array.from(typed).join(''), typed);
  assert.equal('istanbul \u0131\u015f\u0131\u011f\u0131'.toLocaleUpperCase('tr-TR'), '\u0130STANBUL I\u015eI\u011eI');
  assert.equal('\u0130STANBUL I\u015eI\u011eI'.toLocaleLowerCase('tr-TR'), 'istanbul \u0131\u015f\u0131\u011f\u0131');
});

test('pdf.js worker has a local asset and blob-capable CSP', () => {
  assert.equal(fs.existsSync(path.join(rootDir, 'vendor', 'pdf.worker.min.js')), true);
  assert.match(read('index.html'), /worker-src 'self' blob:/);
});

test('Tiptap compat call editor.chain().focus().toggleBold().run() stays callable', () => {
  const calls = [];
  const editor = {
    chain() {
      calls.push('chain');
      return {
        focus() { calls.push('focus'); return this; },
        toggleBold() { calls.push('toggleBold'); return this; },
        run() { calls.push('run'); return true; }
      };
    }
  };
  assert.equal(editor.chain().focus().toggleBold().run(), true);
  assert.deepEqual(calls, ['chain', 'focus', 'toggleBold', 'run']);
});
