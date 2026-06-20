const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const legacyHtmlPath = path.join(__dirname, '..', 'legacy', 'academiq-research.html');

test('canonical editor runtime modules load from src/ as the single source of truth', () => {
  const html = fs.readFileSync(legacyHtmlPath, 'utf8');
  [
    'tiptap-word-document.js',
    'tiptap-word-paste.js',
    'tiptap-word-io.js',
    'tiptap-word-layout.js',
    'editor-runtime.js'
  ].forEach((moduleName) => {
    const tag = `<script src="./src/${moduleName}"></script>`;
    const firstIdx = html.indexOf(tag);
    const lastIdx = html.lastIndexOf(tag);
    assert.notEqual(firstIdx, -1, moduleName + ' src/ script tag missing');
    assert.equal(firstIdx, lastIdx, moduleName + ' must be loaded via a single script tag (no inline duplicate)');
  });
});

test('plain citation linking runtime is loaded in legacy and Tauri entries', () => {
  const legacyHtml = fs.readFileSync(legacyHtmlPath, 'utf8');
  const tauriHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(legacyHtml, /<script src="\.\/src\/plain-citation-linking\.js"><\/script>/);
  assert.match(tauriHtml, /<script src="\/src\/plain-citation-linking\.js"><\/script>/);
  assert.ok(
    legacyHtml.indexOf('./src/tiptap-word-citation.js') < legacyHtml.indexOf('./src/plain-citation-linking.js'),
    'legacy plain citation linking should load after citation runtime helpers'
  );
  assert.ok(
    tauriHtml.indexOf('/src/tiptap-word-citation.js') < tauriHtml.indexOf('/src/plain-citation-linking.js'),
    'Tauri plain citation linking should load after citation runtime helpers'
  );
});

test('startup retries TipTap init until canonical init module is available', () => {
  const html = fs.readFileSync(legacyHtmlPath, 'utf8');
  const legacy = fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy-runtime.js'), 'utf8');
  [html, legacy].forEach((source) => {
    assert.match(source, /__aqTipTapInitRetryTimer/);
    assert.match(source, /retryCount<20/);
    assert.ok(
      source.indexOf('__aqTipTapInitRetryTimer') < source.indexOf("console.warn('TipTap word init module missing')"),
      'missing init module should only warn after retry budget is exhausted'
    );
  });
});

test('AQ Engine browser modules are loaded only once', () => {
  const html = fs.readFileSync(legacyHtmlPath, 'utf8');
  [
    'engine',
    'document',
    'selection',
    'input',
    'tiptap-adapter',
    'compat-shim'
  ].forEach((moduleName) => {
    const pattern = new RegExp(`(?:\\.\\/)?experiments/aq-engine/${moduleName}\\.js`, 'g');
    const matches = html.match(pattern) || [];
    assert.equal(matches.length, 1, `${moduleName}.js should not be loaded more than once`);
  });
});

test('embedded citation runtime does not keep stale popup item insertion handlers', () => {
  const html = fs.readFileSync(legacyHtmlPath, 'utf8');
  const marker = 'window.AQCitationRuntime = runtime.publicApi;';
  const markerIndex = html.indexOf(marker);
  assert.notEqual(markerIndex, -1, 'embedded citation runtime marker missing');
  const scriptStart = html.lastIndexOf('<script>', markerIndex);
  const scriptEnd = html.indexOf('</script>', markerIndex);
  const runtime = html.slice(scriptStart, scriptEnd);
  assert.match(runtime, /window\.addEventListener\(type, stopCitationPopupPointerEvent, true\)/);
  assert.doesNotMatch(runtime, /div\.addEventListener\('pointerdown'[\s\S]{0,260}runtime\.insertSelection\(ref\.id\)/);
  assert.doesNotMatch(runtime, /div\.addEventListener\('click'[\s\S]{0,260}runtime\.insertSelection\(ref\.id\)/);
});
