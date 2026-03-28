const test = require('node:test');
const assert = require('node:assert/strict');

const surface = require('../src/tiptap-word-surface.js');

test('tiptap word surface exports access helpers', () => {
  assert.equal(typeof surface.getHost, 'function');
  assert.equal(typeof surface.getEditorDom, 'function');
  assert.equal(typeof surface.focus, 'function');
  assert.equal(typeof surface.getText, 'function');
});
