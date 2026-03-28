const test = require('node:test');
const assert = require('node:assert/strict');

const wordEditor = require('../src/tiptap-word-editor.js');

test('tiptap word editor exports createEditor and createExtensions', () => {
  assert.equal(typeof wordEditor.createEditor, 'function');
  assert.equal(typeof wordEditor.createExtensions, 'function');
});
