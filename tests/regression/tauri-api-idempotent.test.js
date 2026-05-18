const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..', '..');
const source = fs.readFileSync(path.join(rootDir, 'src', 'tauri-api.ts'), 'utf8');

function createWindowMock() {
  const store = new Map();
  return {
    __TAURI__: { core: { invoke: () => Promise.resolve({ ok: true }) } },
    __TAURI_INTERNALS__: {},
    addEventListener() {},
    atob(value) {
      return Buffer.from(String(value), 'base64').toString('binary');
    },
    localStorage: {
      setItem(key, value) {
        store.set(key, value);
      },
      getItem(key) {
        return store.get(key) || null;
      }
    }
  };
}

test('tauri-api installs frozen globals idempotently across duplicate evaluation', () => {
  const execute = new Function('window', 'module', source);
  const windowMock = createWindowMock();
  const firstModule = { exports: {} };
  const secondModule = { exports: {} };

  execute(windowMock, firstModule);
  assert.equal(typeof windowMock.electronAPI.downloadPDFfromURL, 'function');
  assert.equal(typeof windowMock.ocrAPI.recognize, 'function');
  assert.equal(Object.isFrozen(windowMock.electronAPI), true);
  assert.equal(Object.isFrozen(windowMock.ocrAPI), true);

  execute(windowMock, secondModule);
  assert.equal(typeof windowMock.electronAPI.downloadPDFfromURL, 'function');
  assert.equal(typeof windowMock.electronAPI.db.forceRemigrateHistory, 'function');
  assert.equal(Object.isFrozen(windowMock.electronAPI), true);
  assert.ok(Object.keys(windowMock.electronAPI).length >= 45);
});

test('tauri-api uses defineProperty instead of direct readonly global assignment', () => {
  assert.match(source, /function installWindowAPI/);
  assert.match(source, /Object\.defineProperty\(window, name/);
  assert.doesNotMatch(source, /window\.electronAPI\s*=/);
  assert.doesNotMatch(source, /window\.ocrAPI\s*=/);
});
