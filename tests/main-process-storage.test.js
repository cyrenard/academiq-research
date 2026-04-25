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

test('storage service keeps recovery snapshot and can restore when main data is corrupted', () => {
  const appDir = makeTempDir();
  const storage = createStorageService({ appDir });
  const mainPath = storage.getSyncDataPath();
  const recoveryPath = mainPath + '.recovery.json';

  storage.saveData('{"ok":true,"title":"Recovered"}');
  fs.writeFileSync(mainPath, '{"broken"', 'utf8');

  const loaded = storage.loadData();

  assert.equal(fs.existsSync(recoveryPath), true);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.recoveredFromRecovery, true);
  assert.equal(loaded.data, '{"ok":true,"title":"Recovered"}');
});

test('loadData surfaces recovery metadata and last-saved timestamp', () => {
  const appDir = makeTempDir();
  const storage = createStorageService({ appDir });
  const before = Date.now();
  storage.saveData('{"ok":true}');
  const loaded = storage.loadData();
  assert.ok(loaded.recoveryMeta, 'recoveryMeta should be present');
  assert.equal(loaded.recoveryMeta.source, 'autosave');
  assert.ok(loaded.recoveryMeta.updatedAt >= before);
  assert.ok(loaded.lastSavedAt >= before);
});

test('storage service reports unclean shutdown from session state', () => {
  const appDir = makeTempDir();
  const storage = createStorageService({ appDir });

  storage.saveSessionState({ cleanExit: false, previousCleanExit: false });
  storage.markSessionOpen({ appVersion: '1.1.1' });
  storage.saveData('{"ok":true}');

  const loadedBeforeClose = storage.loadData();
  assert.equal(loadedBeforeClose.uncleanShutdown, true);

  storage.markSessionClosed({ appVersion: '1.1.1' });
  const loadedAfterClose = storage.loadData();
  assert.equal(loadedAfterClose.uncleanShutdown, false);
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

test('storage service records document history snapshots from saved state', () => {
  const appDir = makeTempDir();
  const storage = createStorageService({ appDir });
  const payload = {
    wss: [{ id: 'ws1', name: 'Workspace', docId: 'doc1', lib: [] }],
    cur: 'ws1',
    docs: [{ id: 'doc1', name: 'Belge 1', content: '<p>Ilk surum metni.</p>' }],
    curDoc: 'doc1',
    doc: '<p>Ilk surum metni.</p>'
  };

  storage.saveData(JSON.stringify(payload));
  const history = storage.getDocumentHistory('doc1', 10);

  assert.equal(history.ok, true);
  assert.equal(history.snapshots.length, 1);
  assert.equal(history.snapshots[0].docName, 'Belge 1');
  assert.match(history.snapshots[0].excerpt, /Ilk surum metni/);
  assert.equal(fs.existsSync(storage.getDocumentHistoryPath()), true);
});

test('storage service can restore a saved document history snapshot', () => {
  const appDir = makeTempDir();
  const storage = createStorageService({ appDir });
  const first = {
    wss: [{ id: 'ws1', name: 'Workspace', docId: 'doc1', lib: [] }],
    cur: 'ws1',
    docs: [{ id: 'doc1', name: 'Belge 1', content: '<p>Ilk surum.</p>' }],
    curDoc: 'doc1',
    doc: '<p>Ilk surum.</p>'
  };
  storage.saveData(JSON.stringify(first));
  const firstSnapshot = storage.getDocumentHistory('doc1', 10).snapshots[0];

  const second = {
    wss: [{ id: 'ws1', name: 'Workspace', docId: 'doc1', lib: [] }],
    cur: 'ws1',
    docs: [{ id: 'doc1', name: 'Belge 1', content: '<p>Ikinci surum ve daha uzun belge metni burada.</p>' }],
    curDoc: 'doc1',
    doc: '<p>Ikinci surum ve daha uzun belge metni burada.</p>'
  };
  storage.saveData(JSON.stringify(second), { forceDocIds: ['doc1'] });

  const restoreResult = storage.restoreDocumentHistorySnapshot('doc1', firstSnapshot.id);
  const loaded = JSON.parse(storage.loadData().data);
  const restoredDoc = loaded.docs.find((doc) => doc.id === 'doc1');

  assert.equal(restoreResult.ok, true);
  assert.equal(restoredDoc.content, '<p>Ilk surum.</p>');
});

test('storage service recovers newer editor draft after unclean shutdown', () => {
  const appDir = makeTempDir();
  const storage = createStorageService({ appDir });
  const saved = {
    wss: [{ id: 'ws1', name: 'Workspace', docId: 'doc1', lib: [] }],
    cur: 'ws1',
    docs: [{ id: 'doc1', name: 'Belge 1', content: '<p>Saved version.</p>' }],
    curDoc: 'doc1',
    doc: '<p>Saved version.</p>'
  };
  const draft = {
    wss: [{ id: 'ws1', name: 'Workspace', docId: 'doc1', lib: [] }],
    cur: 'ws1',
    docs: [{ id: 'doc1', name: 'Belge 1', content: '<p>Draft version after crash.</p>' }],
    curDoc: 'doc1',
    doc: '<p>Draft version after crash.</p>'
  };

  storage.saveData(JSON.stringify(saved));
  storage.saveSessionState({ previousCleanExit: false, cleanExit: false, lastSavedAt: Date.now() - 5000 });
  storage.saveEditorDraft(JSON.stringify(draft));

  const loaded = storage.loadData();
  const parsed = JSON.parse(loaded.data);
  assert.equal(loaded.recoveredFromDraft, true);
  assert.equal(parsed.doc, '<p>Draft version after crash.</p>');
});

test('storage service ignores editor draft after clean shutdown', () => {
  const appDir = makeTempDir();
  const storage = createStorageService({ appDir });
  storage.saveData(JSON.stringify({ ok: true, doc: '<p>Saved.</p>' }));
  storage.saveSessionState({ previousCleanExit: true, cleanExit: true, lastSavedAt: Date.now() - 5000 });
  storage.saveEditorDraft(JSON.stringify({ ok: true, doc: '<p>Draft should be ignored.</p>' }));
  storage.markSessionClosed({ appVersion: '1.1.1' });

  const loaded = storage.loadData();
  const parsed = JSON.parse(loaded.data);
  assert.equal(loaded.recoveredFromDraft, false);
  assert.equal(parsed.doc, '<p>Saved.</p>');
});

test('storage service exposes editor draft health in app info', () => {
  const appDir = makeTempDir();
  const storage = createStorageService({ appDir });
  storage.saveData(JSON.stringify({ ok: true, doc: '<p>Saved.</p>' }));
  storage.saveSessionState({ previousCleanExit: false, cleanExit: false, lastSavedAt: Date.now() - 5000 });
  storage.saveEditorDraft(JSON.stringify({ ok: true, doc: '<p>Draft.</p>' }));

  const info = storage.getAppInfo('1.1.1');

  assert.equal(info.editorDraft.exists, true);
  assert.equal(info.editorDraft.valid, true);
  assert.equal(info.editorDraft.isNewerThanLastSave, true);
  assert.equal(info.editorDraft.recoverableAfterUncleanShutdown, true);
  assert.ok(info.editorDraft.sizeBytes > 0);
});

test('storage service reports invalid editor draft without crashing app info', () => {
  const appDir = makeTempDir();
  const storage = createStorageService({ appDir });
  const draftPath = path.join(appDir, 'editor-draft.json');
  fs.writeFileSync(draftPath, '{"broken"', 'utf8');

  const summary = storage.getEditorDraftSummary();
  const info = storage.getAppInfo('1.1.1');

  assert.equal(summary.exists, true);
  assert.equal(summary.valid, false);
  assert.equal(summary.isNewerThanLastSave, false);
  assert.equal(info.editorDraft.valid, false);
  assert.match(summary.invalidReason, /Draft dosyasi/);
});
