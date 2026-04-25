const test = require('node:test');
const assert = require('node:assert/strict');

const metadataHealth = require('../src/metadata-health.js');

test('sortRows prioritizes requested metadata health status', () => {
  const rows = [
    { ref: { title: 'Bravo' }, report: { status: 'complete', issues: [] } },
    { ref: { title: 'Alpha' }, report: { status: 'incomplete', issues: [{ code: 'missing_year' }, { code: 'missing_authors' }] } },
    { ref: { title: 'Charlie' }, report: { status: 'suspicious', issues: [{ code: 'malformed_doi' }] } }
  ];

  const incompleteFirst = metadataHealth.sortRows(rows, 'incomplete');
  assert.deepEqual(incompleteFirst.map((row) => row.ref.title), ['Alpha', 'Charlie', 'Bravo']);

  const suspiciousFirst = metadataHealth.sortRows(rows, 'suspicious');
  assert.deepEqual(suspiciousFirst.map((row) => row.ref.title), ['Charlie', 'Alpha', 'Bravo']);

  const completeFirst = metadataHealth.sortRows(rows, 'complete');
  assert.deepEqual(completeFirst.map((row) => row.ref.title), ['Bravo', 'Alpha', 'Charlie']);
});

test('sortRows keeps same-status items ordered by issue count then title', () => {
  const rows = [
    { ref: { title: 'Zeta' }, report: { status: 'incomplete', issues: [{ code: 'missing_title' }] } },
    { ref: { title: 'Alpha' }, report: { status: 'incomplete', issues: [{ code: 'missing_title' }] } },
    { ref: { title: 'Beta' }, report: { status: 'incomplete', issues: [{ code: 'missing_title' }, { code: 'missing_year' }] } }
  ];

  const sorted = metadataHealth.sortRows(rows, 'incomplete');
  assert.deepEqual(sorted.map((row) => row.ref.title), ['Beta', 'Alpha', 'Zeta']);
});

