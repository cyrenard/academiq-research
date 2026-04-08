const test = require('node:test');
const assert = require('node:assert/strict');

const binaryPayload = require('../src/binary-payload.js');

test('toArrayBuffer converts Buffer-like object payloads', () => {
  const out = binaryPayload.toArrayBuffer({ type: 'Buffer', data: [37, 80, 68, 70, 45] });
  const view = new Uint8Array(out);
  assert.equal(view[0], 37);
  assert.equal(view[1], 80);
  assert.equal(view[2], 68);
  assert.equal(view[3], 70);
});

test('normalizeResultBuffer rewrites numeric-key objects into ArrayBuffer', () => {
  const result = binaryPayload.normalizeResultBuffer({
    ok: true,
    buffer: { 0: 37, 1: 80, 2: 68, 3: 70, 4: 45 }
  });
  assert.equal(result.ok, true);
  assert.equal(result.buffer instanceof ArrayBuffer, true);
  assert.equal(new Uint8Array(result.buffer)[0], 37);
});
