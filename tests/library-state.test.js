const test = require('node:test');
const assert = require('node:assert/strict');

const libraryState = require('../src/library-state.js');

test('filterLibraryItems filters by query', () => {
  const items = [
    { title: 'Machine Learning', authors: ['Doe'], year: '2024', journal: 'AI' },
    { title: 'Sociology', authors: ['Smith'], year: '2020', journal: 'Social' }
  ];

  const result = libraryState.filterLibraryItems(items, 'machine', null);

  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Machine Learning');
});

test('filterLibraryItems filters by label', () => {
  const items = [
    { title: 'A', labels: [{ name: 'Önemli' }] },
    { title: 'B', labels: [{ name: 'Teori' }] }
  ];

  const result = libraryState.filterLibraryItems(items, '', 'Teori');

  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'B');
});

test('filterLibraryItems filters by collection membership', () => {
  const items = [
    { id: 'r1', title: 'A', collectionIds: ['col-a'] },
    { id: 'r2', title: 'B', collectionIds: ['col-b'] },
    { id: 'r3', title: 'C', collectionIds: [] }
  ];

  const result = libraryState.filterLibraryItems(items, '', '', { collectionFilter: 'col-b' });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'r2');
});

test('buildLibraryRenderWindow caps large lists and exposes next window', () => {
  const items = Array.from({ length: 600 }, (_, index) => ({ id: 'r' + index }));

  const first = libraryState.buildLibraryRenderWindow(items, { limit: 120, defaultLimit: 120 });
  assert.equal(first.total, 600);
  assert.equal(first.rendered, 120);
  assert.equal(first.hasMore, true);
  assert.equal(first.nextLimit, 240);
  assert.equal(first.items.length, 120);

  const all = libraryState.buildLibraryRenderWindow(items, { limit: 1000, defaultLimit: 120 });
  assert.equal(all.rendered, 600);
  assert.equal(all.hasMore, false);
});

test('buildLibraryRenderWindow can render full filtered result set in one pass', () => {
  const items = Array.from({ length: 430 }, (_, index) => ({ id: 'r' + index }));
  const result = libraryState.buildLibraryRenderWindow(items, {
    limit: 80,
    defaultLimit: 80,
    forceFullRender: true
  });

  assert.equal(result.rendered, 430);
  assert.equal(result.hasMore, false);
  assert.equal(result.nextLimit, 430);
});
