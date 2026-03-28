const test = require('node:test');
const assert = require('node:assert/strict');

const events = require('../src/tiptap-word-events.js');

test('tiptap word events exports init and watchSurface', () => {
  assert.equal(typeof events.init, 'function');
  assert.equal(typeof events.watchSurface, 'function');
  assert.equal(typeof events.applySurfaceAttributes, 'function');
  assert.equal(typeof events.buildContextMenuModel, 'function');
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

test('applySurfaceAttributes adds grammarly-related attributes', () => {
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
    assert.equal(attrs['data-gramm'], 'true');
    assert.equal(attrs['data-gramm_editor'], 'true');
    assert.equal(attrs['data-enable-grammarly'], 'true');
    assert.equal(attrs['data-grammarly-part'], 'true');
  } finally {
    delete global.document;
  }
});
