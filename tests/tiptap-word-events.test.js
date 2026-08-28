const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const events = require('../src/tiptap-word-events.js');

function withNavigatorPlatform(platform, callback) {
  const previous = Object.getOwnPropertyDescriptor(global, 'navigator');
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: { platform, userAgent: platform }
  });
  try {
    return callback();
  } finally {
    if (previous) Object.defineProperty(global, 'navigator', previous);
    else delete global.navigator;
  }
}

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

test('Linux applySurfaceAttributes disables native writing-assist rewrites', () => {
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
    const ok = withNavigatorPlatform('Linux x86_64', () => events.applySurfaceAttributes(node));
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

test('Windows applySurfaceAttributes preserves beta 9 writing and input ownership', () => {
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
  try {
    const ok = withNavigatorPlatform('Win32', () => events.applySurfaceAttributes(node));
    assert.equal(ok, true);
    assert.equal(attrs.spellcheck, 'true');
    assert.equal(attrs.autocorrect, 'on');
    assert.equal(attrs.autocomplete, 'on');
    assert.equal(attrs.autocapitalize, 'sentences');
    assert.equal(attrs['data-gramm'], 'true');
    assert.equal(attrs['data-gramm_editor'], 'true');
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

test('AQ Engine capture input selects Windows beta 9 or Linux safe writing attributes', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'input.js'), 'utf8');
  assert.match(source, /function isWindowsRuntime\(\)/);
  assert.match(source, /windowsInputMode \? 'on' : 'off'/);
  assert.match(source, /windowsInputMode \? 'true' : 'false'/);
  assert.match(source, /windowsInputMode \? 'sentences' : 'off'/);
  assert.match(source, /assistBridge\.setAttribute\('autocorrect', windowsInputMode \? 'on' : 'off'\)/);
});

test('AQ Engine table cell editor participates in backspace guard', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'compat-shim.js'), 'utf8');
  assert.match(source, /ta\.className = 'aq-engine-table-cell-editor'/);
  assert.match(source, /ta\.setAttribute\('data-aq-table-cell', 'true'\)/);
  assert.match(source, /ta\.setAttribute\('autocorrect', 'off'\)/);
  assert.match(source, /ta\.setAttribute\('spellcheck', 'false'\)/);
});
