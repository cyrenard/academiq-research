const test = require('node:test');
const assert = require('node:assert/strict');

const dup = require('../src/duplicate-detection.js');

test('detectDuplicateGroups groups exact DOI matches', () => {
  const refs = [
    { id: 'r1', title: 'A paper', authors: ['Doe, Jane'], year: '2020', doi: '10.1000/ABC.1' },
    { id: 'r2', title: 'Another title', authors: ['Smith, John'], year: '2021', doi: 'https://doi.org/10.1000/abc.1' },
    { id: 'r3', title: 'Different', authors: ['Alpha, A'], year: '2018', doi: '10.1000/xyz.9' }
  ];
  const groups = dup.detectDuplicateGroups(refs);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].ids.slice().sort(), ['r1', 'r2']);
  assert.ok(groups[0].reasons.includes('doi_exact'));
});

test('detectDuplicateGroups matches first-author+year+similar title', () => {
  const refs = [
    { id: 'r1', title: 'How to improve writing quality in students', authors: ['Doe, Jane'], year: '2020' },
    { id: 'r2', title: 'How to improve student writing quality', authors: ['Doe, Jane'], year: '2020' },
    { id: 'r3', title: 'Completely unrelated document', authors: ['Doe, Jane'], year: '2020' }
  ];
  const groups = dup.detectDuplicateGroups(refs);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].ids.slice().sort(), ['r1', 'r2']);
  assert.ok(groups[0].reasons.includes('author_year_similar_title'));
});

test('mergeRecords keeps richer metadata and unions arrays', () => {
  const primary = {
    id: 'r1',
    title: 'Paper',
    authors: ['Doe, Jane'],
    labels: ['Method'],
    doi: '',
    journal: '',
    pdfData: ''
  };
  const secondary = {
    id: 'r2',
    title: 'Paper',
    authors: ['Doe, Jane', 'Smith, John'],
    labels: ['Method', 'Theory'],
    doi: '10.1000/test.1',
    journal: 'Test Journal',
    pdfData: 'blob'
  };
  const merged = dup.mergeRecords(primary, secondary);
  assert.equal(merged, primary);
  assert.deepEqual(merged.authors, ['Doe, Jane', 'Smith, John']);
  assert.deepEqual(merged.labels, ['Method', 'Theory']);
  assert.equal(merged.doi, '10.1000/test.1');
  assert.equal(merged.journal, 'Test Journal');
  assert.equal(merged.pdfData, 'blob');
});
