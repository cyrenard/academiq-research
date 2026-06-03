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
  const window = {
    __TAURI__: {
      core: {
        invoke(command, args) {
          calls.push({ command, args: args || {} });
          return Promise.resolve({ ok: true, sampled: true, command, args: args || {} });
        }
      }
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
  return { api: window.electronAPI, calls };
}

test('Tauri IPC Sample Suite — Data Store IPC Invocations', async () => {
  const { api, calls } = loadTauriApi();
  
  await api.loadData();
  assert.equal(calls.at(-1).command, 'data_load');
  
  await api.saveData({ test: true }, 'user_action');
  assert.equal(calls.at(-1).command, 'data_save');
  assert.equal(JSON.parse(calls.at(-1).args.json).test, true);
  assert.equal(calls.at(-1).args.source, 'user_action');
});

test('Tauri IPC Sample Suite — PDF Storage IPC Invocations', async () => {
  const { api, calls } = loadTauriApi();
  
  await api.pdfExists('ref-123', { id: 'ws-456' });
  assert.equal(calls.at(-1).command, 'pdf_exists');
  assert.equal(calls.at(-1).args.refId, 'ref-123');
  assert.equal(calls.at(-1).args.ws.id, 'ws-456');
  
  await api.loadPDF('ref-123', { id: 'ws-456' });
  assert.equal(calls.at(-1).command, 'pdf_load');
});

test('Tauri IPC Sample Suite — Network & Fetch IPC Invocations', async () => {
  const { api, calls } = loadTauriApi();
  
  await api.netFetchJSON('https://example.com/api', { method: 'GET' });
  assert.equal(calls.at(-1).command, 'net_fetch_json');
  assert.equal(calls.at(-1).args.url, 'https://example.com/api');
  
  await api.openExternalUrl('https://example.com');
  assert.equal(calls.at(-1).command, 'app_open_external_url');
  assert.equal(calls.at(-1).args.url, 'https://example.com');
});

test('Tauri IPC Sample Suite — Spellcheck IPC Invocations', async () => {
  const { api, calls } = loadTauriApi();
  
  await api.spell.check('hello', 'en');
  assert.equal(calls.at(-1).command, 'spell_check');
  assert.equal(calls.at(-1).args.text, 'hello');
  assert.equal(calls.at(-1).args.lang, 'en');
  
  await api.spell.suggest('hllo', 'en');
  assert.equal(calls.at(-1).command, 'spell_suggest');
  assert.equal(calls.at(-1).args.word, 'hllo');
});

test('Tauri IPC Sample Suite — File System IPC Invocations', async () => {
  const { api, calls } = loadTauriApi();
  
  await api.fs.readFileText('/path/to/file.txt');
  assert.equal(calls.at(-1).command, 'read_file_text');
  assert.equal(calls.at(-1).args.path, '/path/to/file.txt');
  
  await api.fs.readFileBase64('/path/to/image.png');
  assert.equal(calls.at(-1).command, 'read_file_base64');
  assert.equal(calls.at(-1).args.path, '/path/to/image.png');
});
