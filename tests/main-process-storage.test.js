const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createStorageService } = require('../src/main-process-storage.js');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'academiq-storage-'));
}

test('storage service resolves local paths by default', () => {
  const appDir = makeTempDir();
  const storage = createStorageService({ appDir });

  assert.equal(storage.getSyncDataPath(), path.join(appDir, 'academiq-data.json'));
  assert.equal(storage.getSyncPDFDir(), path.join(appDir, 'pdfs'));
});

test('storage service persists data and reloads it', () => {
  const appDir = makeTempDir();
  const storage = createStorageService({ appDir });

  storage.saveData('{"ok":true}');
  const loaded = storage.loadData();

  assert.equal(loaded.ok, true);
  assert.equal(loaded.data, '{"ok":true}');
});

test('storage service updates sync paths after sync dir selection', () => {
  const appDir = makeTempDir();
  const syncRoot = makeTempDir();
  const storage = createStorageService({ appDir });

  storage.setSyncDir(syncRoot);

  assert.equal(storage.getSyncDataPath(), path.join(syncRoot, 'AcademiQ', 'academiq-data.json'));
  assert.equal(storage.getSyncPDFDir(), path.join(syncRoot, 'AcademiQ', 'pdfs'));
});

test('storage service saves and loads pdf buffers', () => {
  const appDir = makeTempDir();
  const storage = createStorageService({ appDir });
  const buf = Uint8Array.from([1, 2, 3, 4]).buffer;

  storage.savePDF('ref1', buf);
  const loaded = storage.loadPDF('ref1');

  assert.equal(loaded.ok, true);
  assert.equal(Buffer.from(loaded.buffer).length, 4);
  assert.equal(storage.pdfExists('ref1'), true);
});
