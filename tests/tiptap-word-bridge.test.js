const test = require('node:test');
const assert = require('node:assert/strict');

const bridge = require('../src/tiptap-word-bridge.js');

test('tiptap word bridge exports bridge helpers', () => {
  assert.equal(typeof bridge.getCurrentEditorHTML, 'function');
  assert.equal(typeof bridge.setCurrentEditorHTML, 'function');
  assert.equal(typeof bridge.runEditorMutationEffects, 'function');
  assert.equal(typeof bridge.applyCurrentEditorHTML, 'function');
  assert.equal(typeof bridge.ensureEditableRoot, 'function');
});

test('getCurrentEditorHTML and setCurrentEditorHTML use content bridge when available', () => {
  const calls = [];
  const html = bridge.getCurrentEditorHTML({
    contentApi: {
      getEditorHTML(opts) {
        calls.push(['get', !!opts.documentApi, !!opts.editor, !!opts.shell, !!opts.host]);
        return '<p>bridge</p>';
      }
    },
    documentApi: {},
    editor: {},
    shell: {},
    host: {}
  });

  const ok = bridge.setCurrentEditorHTML({
    contentApi: {
      setEditorHTML(opts) {
        calls.push(['set', opts.html]);
        return true;
      }
    },
    html: '<p>x</p>'
  });

  assert.equal(html, '<p>bridge</p>');
  assert.equal(ok, true);
  assert.deepEqual(calls, [
    ['get', true, true, true, true],
    ['set', '<p>x</p>']
  ]);
});

test('runEditorMutationEffects falls back to local callbacks when no api exists', () => {
  const calls = [];
  const ok = bridge.runEditorMutationEffects({
    target: 'pm-root',
    normalizeCitationSpans(target) { calls.push(['normalize', target]); },
    updatePageHeight() { calls.push(['layout']); },
    syncStatus() { calls.push(['status']); },
    save() { calls.push(['save']); },
    syncTOCNow() { calls.push(['toc']); },
    syncRefsNow() { calls.push(['refs']); },
    refreshTriggerNow() { calls.push(['trigger']); },
    syncChrome: true,
    syncTOC: true,
    syncRefs: true,
    refreshTrigger: true
  });

  assert.equal(ok, true);
  assert.deepEqual(calls, [
    ['normalize', 'pm-root'],
    ['layout'],
    ['status'],
    ['save'],
    ['toc'],
    ['refs'],
    ['trigger']
  ]);
});

test('applyCurrentEditorHTML delegates to content apply api when available', () => {
  const calls = [];
  const ok = bridge.applyCurrentEditorHTML({
    contentApi: {
      applyEditorHTML(opts) {
        calls.push(['apply', opts.html, !!opts.documentApi, !!opts.editor, !!opts.shell, !!opts.host]);
      }
    },
    documentApi: {},
    editor: {},
    shell: {},
    host: {},
    html: '<p>body</p>'
  });

  assert.equal(ok, true);
  assert.deepEqual(calls, [
    ['apply', '<p>body</p>', true, true, true, true]
  ]);
});

test('ensureEditableRoot delegates to document api when available', () => {
  const calls = [];
  const ok = bridge.ensureEditableRoot({
    documentApi: {
      ensureEditableContent(opts) {
        calls.push(['ensure', !!opts.editor, typeof opts.sanitizeHTML]);
        return true;
      }
    },
    editor: {},
    sanitizeHTML(value) { return value; }
  });

  assert.equal(ok, true);
  assert.deepEqual(calls, [['ensure', true, 'function']]);
});
