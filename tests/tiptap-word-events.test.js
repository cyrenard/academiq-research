const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

test('applySurfaceAttributes disables native writing-assist rewrites', () => {
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
    assert.equal(attrs.spellcheck, 'false');
    assert.equal(attrs.autocorrect, 'off');
    assert.equal(attrs.autocomplete, 'off');
    assert.equal(attrs.autocapitalize, 'off');
    assert.equal(attrs['data-gramm'], 'false');
    assert.equal(attrs['data-gramm_editor'], 'false');
  } finally {
    delete global.document;
  }
});

test('table backspace guard is exported and installed once', () => {
  const listeners = [];
  global.window = {};
  global.document = {
    addEventListener: function(type, handler, capture){
      listeners.push({ type, handler, capture });
    }
  };
  try{
    assert.equal(typeof events.bindTableBackspaceGuard, 'function');
    events.bindTableBackspaceGuard();
    events.bindTableBackspaceGuard();
    assert.equal(global.window.__aqTableBackspaceGuardV1, true);
    assert.equal(listeners.length, 2);
    assert.deepEqual(listeners.map((item) => item.type), ['keydown', 'beforeinput']);
    assert.ok(listeners.every((item) => item.capture === true));
  } finally {
    delete global.window;
    delete global.document;
  }
});

test('AQ Engine capture input disables native autocorrect rewrites at source', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'input.js'), 'utf8');
  assert.match(source, /ta\.setAttribute\('autocorrect',\s+'off'\)/);
  assert.match(source, /ta\.setAttribute\('spellcheck',\s+'false'\)/);
  assert.match(source, /ta\.setAttribute\('data-gramm',\s+'false'\)/);
  assert.match(source, /assistBridge\.setAttribute\('autocorrect',\s+'off'\)/);
  assert.doesNotMatch(source, /ta\.setAttribute\('autocorrect',\s+'on'\)/);
});

test('AQ Engine table cell editor participates in backspace guard', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'compat-shim.js'), 'utf8');
  assert.match(source, /ta\.className = 'aq-engine-table-cell-editor'/);
  assert.match(source, /ta\.setAttribute\('data-aq-table-cell', 'true'\)/);
  assert.match(source, /ta\.setAttribute\('autocorrect', 'off'\)/);
  assert.match(source, /ta\.setAttribute\('spellcheck', 'false'\)/);
});
