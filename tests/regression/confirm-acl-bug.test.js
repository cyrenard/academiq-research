const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rootDir = path.join(__dirname, '..', '..');

function loadShim() {
  const window = {
    confirmCalls: [],
    promptCalls: [],
    confirm(message) {
      window.confirmCalls.push(message);
      return Promise.reject(new Error('Command plugin:dialog|confirm not allowed by ACL'));
    },
    prompt(message, defaultValue) {
      window.promptCalls.push({ message, defaultValue });
      return defaultValue;
    },
    __TAURI__: {
      core: {
        invoke() {
          return Promise.resolve({ ok: true });
        }
      }
    },
    addEventListener(type, callback) {
      window.listeners[type] = callback;
    }
  };
  window.listeners = {};
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
  vm.runInNewContext(fs.readFileSync(path.join(rootDir, 'src', 'tauri-api.ts'), 'utf8'), context);
  return { window };
}

test('dialog ACL permissions include defensive ask/message/open/save grants', () => {
  const capability = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'src-tauri', 'capabilities', 'default.json'), 'utf8')
  );
  for (const permission of [
    'dialog:allow-ask',
    'dialog:allow-confirm',
    'dialog:allow-message',
    'dialog:allow-open',
    'dialog:allow-save'
  ]) {
    assert.ok(capability.permissions.includes(permission), permission);
  }
});

test('window.confirm no longer leaves plugin dialog ACL rejection visible', async () => {
  const { window } = loadShim();
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  const result = window.confirm('Kayıt silinsin mi?');
  assert.equal(result, true);
  assert.equal(window.confirmCalls.length, 1);
  assert.equal(window.promptCalls.length, 1);
  assert.match(window.promptCalls[0].message, /Kayıt silinsin mi/);
  await new Promise((resolve) => setImmediate(resolve));
  process.off('unhandledRejection', onUnhandled);
  assert.equal(unhandled.length, 0);
});
