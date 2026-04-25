const test = require('node:test');
const assert = require('node:assert/strict');

const events = require('../src/tiptap-word-events.js');

test('tiptap word events exports init and watchSurface', () => {
  assert.equal(typeof events.init, 'function');
  assert.equal(typeof events.watchSurface, 'function');
  assert.equal(typeof events.applySurfaceAttributes, 'function');
  assert.equal(typeof events.buildContextMenuModel, 'function');
  assert.equal(typeof events.fetchGrammarSuggestions, 'function');
});

test('buildContextMenuModel includes formatting actions only when there is a selection', () => {
  const withSelection = events.buildContextMenuModel(true);
  const withoutSelection = events.buildContextMenuModel(false);

  assert.ok(withSelection.some(item => item.action === 'cut'));
  assert.ok(withSelection.some(item => item.action === 'bold'));
  assert.ok(withSelection.some(item => item.action === 'selectAll'));

  assert.ok(!withoutSelection.some(item => item.action === 'cut'));
  assert.ok(!withoutSelection.some(item => item.action === 'bold'));
  assert.ok(withoutSelection.some(item => item.action === 'paste'));
  assert.ok(withoutSelection.some(item => item.action === 'selectAll'));
});

test('buildContextMenuModel injects grammar suggestions before edit actions', () => {
  const model = events.buildContextMenuModel(true, {
    grammarSuggestions: [
      { kind: 'action', action: 'replaceSelection', replacement: 'dogru', label: 'Duzelt: dogru' }
    ],
    grammarChecked: true
  });
  assert.equal(model[0].action, 'replaceSelection');
  assert.equal(model[0].replacement, 'dogru');
  const cutIndex = model.findIndex(item => item.action === 'cut');
  assert.ok(cutIndex > 0);
});

test('buildContextMenuModel shows no-suggestion hint when grammar check is empty', () => {
  const model = events.buildContextMenuModel(true, {
    grammarSuggestions: [],
    grammarChecked: true
  });
  assert.equal(model[0].kind, 'hint');
  assert.equal(model[0].disabled, true);
});

test('applySurfaceAttributes sets spellcheck (no Grammarly attributes)', () => {
  const attrs = {};
  const node = {
    nodeType: 1,
    setAttribute: function(key, value){ attrs[key] = value; }
  };
  global.document = {
    body: node,
    getElementById: function(){ return null; },
    querySelector: function(){ return null; }
  };
  try{
    const ok = events.applySurfaceAttributes(node);
    assert.equal(ok, true);
    assert.equal(attrs.spellcheck, 'true');
    assert.equal(attrs['data-gramm'], undefined);
    assert.equal(attrs['data-gramm_editor'], undefined);
    assert.equal(attrs['data-enable-grammarly'], undefined);
    assert.equal(attrs['data-grammarly-part'], undefined);
    assert.equal(attrs['data-grammarly-integration'], undefined);
  } finally {
    delete global.document;
  }
});
