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
