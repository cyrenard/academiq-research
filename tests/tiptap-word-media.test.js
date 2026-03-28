const test = require('node:test');
const assert = require('node:assert/strict');

const media = require('../src/tiptap-word-media.js');

test('tiptap word media exports init and clearSelection', () => {
  assert.equal(typeof media.init, 'function');
  assert.equal(typeof media.clearSelection, 'function');
});
