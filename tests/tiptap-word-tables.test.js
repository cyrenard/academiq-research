const test = require('node:test');
const assert = require('node:assert/strict');

const tables = require('../src/tiptap-word-tables.js');

test('tiptap word tables exports init and hideButton', () => {
  assert.equal(typeof tables.init, 'function');
  assert.equal(typeof tables.hideButton, 'function');
});
