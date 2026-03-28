const test = require('node:test');
const assert = require('node:assert/strict');

const init = require('../src/tiptap-word-init.js');

test('tiptap word init exports init', () => {
  assert.equal(typeof init.init, 'function');
});
