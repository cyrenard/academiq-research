const test = require('node:test');
const assert = require('node:assert/strict');

const syncState = require('../src/sync-state.js');

test('buildPersistedState delegates to serializer', () => {
  const state = { value: 1 };
  const payload = syncState.buildPersistedState(state, {
    serialize(input) {
      return { wrapped: input.value + 1 };
    }
  });

  assert.deepEqual(payload, { wrapped: 2 });
});

test('buildPDFCacheMap collects pdfData by reference id', () => {
  const map = syncState.buildPDFCacheMap([
    { lib: [{ id: 'a', pdfData: 'A' }, { id: 'b' }] },
    { lib: [{ id: 'c', pdfData: 'C' }] }
  ]);

  assert.deepEqual(map, { a: 'A', c: 'C' });
});

test('applyPDFCacheMap hydrates matching references only', () => {
  const workspaces = [
    { lib: [{ id: 'a' }, { id: 'b', pdfData: 'old' }] }
  ];

  syncState.applyPDFCacheMap(workspaces, { a: 'new-a' });

  assert.equal(workspaces[0].lib[0].pdfData, 'new-a');
  assert.equal(workspaces[0].lib[1].pdfData, 'old');
});
