const test = require('node:test');
const assert = require('node:assert/strict');

const styles = require('../src/citation-styles.js');

const sample = {
  id: 'r1',
  authors: ['Doe, Jane', 'Smith, John'],
  year: '2024',
  title: 'Testing citation style adapters',
  journal: 'Journal of Tests',
  volume: '12',
  issue: '2',
  fp: '10',
  lp: '20',
  doi: '10.1000/test.1'
};

test('normalizeStyleId maps aliases and defaults to apa7', () => {
  assert.equal(styles.normalizeStyleId('APA'), 'apa7');
  assert.equal(styles.normalizeStyleId('chicago'), 'chicago-author-date');
  assert.equal(styles.normalizeStyleId('unknown'), 'apa7');
});

test('formatInlineCitation supports key style variants', () => {
  assert.equal(styles.formatInlineCitation(sample, { style: 'apa7' }), '(Doe & Smith, 2024)');
  assert.equal(styles.formatInlineCitation(sample, { style: 'harvard' }), '(Doe and Smith, 2024)');
  assert.equal(styles.formatInlineCitation(sample, { style: 'chicago-author-date' }), '(Doe and Smith 2024)');
  assert.equal(styles.formatInlineCitation(sample, { style: 'mla' }), '(Doe and Smith)');
  assert.equal(styles.formatInlineCitation(sample, { style: 'ieee', index: 4 }), '[4]');
});

test('formatInlineCitation uses Turkish "vd." label for 3+ authors', () => {
  const manyAuthors = {
    id: 'r2',
    authors: ['Doe, Jane', 'Smith, John', 'Brown, Alex'],
    year: '2024'
  };
  assert.equal(styles.formatInlineCitation(manyAuthors, { style: 'apa7' }), '(Doe vd., 2024)');
  assert.equal(styles.formatInlineCitation(manyAuthors, { style: 'harvard' }), '(Doe vd., 2024)');
  assert.equal(styles.formatInlineCitation(manyAuthors, { style: 'chicago-author-date' }), '(Doe vd. 2024)');
});

test('formatReference returns style-specific bibliography output', () => {
  assert.match(styles.formatReference(sample, { style: 'apa7' }), /https:\/\/doi\.org\/10\.1000\/test\.1/);
  assert.match(styles.formatReference(sample, { style: 'mla' }), /vol\. 12/);
  assert.match(styles.formatReference(sample, { style: 'chicago-author-date' }), /2024\./);
  assert.match(styles.formatReference(sample, { style: 'ieee', index: 2 }), /^\[2\]/);
  assert.match(styles.formatReference(sample, { style: 'harvard' }), /\(2024\)/);
});
