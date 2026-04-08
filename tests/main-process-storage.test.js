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
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF', 'ascii');
  const buf = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength);

  storage.savePDF('ref1', buf);
  const loaded = storage.loadPDF('ref1');

  assert.equal(loaded.ok, true);
  assert.ok(Buffer.from(loaded.buffer).length > 20);
  assert.equal(storage.pdfExists('ref1'), true);
});

test('storage service rejects zero-byte cached pdf files on load', () => {
  const appDir = makeTempDir();
  const storage = createStorageService({ appDir });
  const pdfDir = path.join(appDir, 'pdfs');
  fs.mkdirSync(pdfDir, { recursive: true });
  fs.writeFileSync(path.join(pdfDir, 'ref-empty.pdf'), Buffer.alloc(0));

  const loaded = storage.loadPDF('ref-empty');

  assert.equal(loaded.ok, false);
  assert.equal(loaded.error, 'invalid pdf cache');
});
