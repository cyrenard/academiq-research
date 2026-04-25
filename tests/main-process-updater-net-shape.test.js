const test = require('node:test');
const assert = require('node:assert/strict');

const net = require('../src/main-process-net.js');

test('main-process-net exports expected functions', () => {
  assert.equal(typeof net.followRedirects, 'function');
  assert.equal(typeof net.fetchJSON, 'function');
  assert.equal(typeof net.postFormJSON, 'function');
});
