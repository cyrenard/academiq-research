const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('canonical editor runtime modules load after stale embedded copies', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'academiq-research.html'), 'utf8');
  [
    ['AQTipTapWordDocument = factory', 'tiptap-word-document.js'],
    ['AQTipTapWordPaste = factory', 'tiptap-word-paste.js'],
    ['AQTipTapWordIO = factory', 'tiptap-word-io.js'],
    ['AQTipTapWordLayout = factory', 'tiptap-word-layout.js'],
    ['AQEditorRuntime = factory', 'editor-runtime.js']
  ].forEach(([embeddedMarker, moduleName]) => {
    const embeddedIndex = html.indexOf(embeddedMarker);
    const overrideIndex = html.lastIndexOf(embeddedMarker);
    assert.notEqual(embeddedIndex, -1, embeddedMarker + ' embedded marker missing');
    assert.notEqual(overrideIndex, embeddedIndex, moduleName + ' override missing');
    assert.ok(
      overrideIndex > embeddedIndex,
      moduleName + ' must load after the embedded copy so packaged builds use the current module'
    );
  });
});

test('startup retries TipTap init until canonical init module is available', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'academiq-research.html'), 'utf8');
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
