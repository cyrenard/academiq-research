const test = require('node:test');
const assert = require('node:assert/strict');

const mh = require('../src/metadata-health.js');

test('analyzeReference reports incomplete on missing required fields', () => {
  const report = mh.analyzeReference({
    id: 'r1',
    title: '',
    authors: [],
    year: '',
    journal: ''
  });
  assert.equal(report.status, 'incomplete');
  assert.ok(report.issues.some((item) => item.code === 'missing_title'));
  assert.ok(report.issues.some((item) => item.code === 'missing_authors'));
  assert.ok(report.issues.some((item) => item.code === 'missing_year'));
});

test('analyzeReference reports suspicious for malformed DOI/pages', () => {
  const report = mh.analyzeReference({
    id: 'r2',
    title: 'Paper',
    authors: ['Doe, Jane'],
    year: '2022',
    journal: 'Journal',
    doi: 'doi:wrong-value',
    fp: '20',
    lp: '1'
  });
  assert.equal(report.status, 'suspicious');
  assert.ok(report.issues.some((item) => item.code === 'malformed_doi'));
  assert.ok(report.issues.some((item) => item.code === 'malformed_pages'));
});

test('analyzeReference includes PDF verification issues when match is weak', () => {
  const report = mh.analyzeReference({
    id: 'r3',
    title: 'Paper',
    authors: ['Doe, Jane'],
    year: '2022',
    journal: 'Journal',
    pdfVerification: {
      status: 'suspicious',
      summary: 'PDF eşleşmesi şüpheli'
    }
  });

  assert.equal(report.status, 'suspicious');
  assert.ok(report.issues.some((item) => item.code === 'suspicious_pdf_match'));
});

test('applyConservativeRepairs normalizes author/year/doi/page values', () => {
  const result = mh.applyConservativeRepairs({
    title: 'ALL CAPS TITLE',
    authors: ['DOE, JANE', 'Doe, Jane'],
    year: '2021/03/09',
    doi: 'https://doi.org/10.1234/ABC.9/BIBTEX',
    fp: ' 12 ',
    lp: '  16 '
  });
  assert.equal(result.ref.title, 'All caps title');
  assert.deepEqual(result.ref.authors, ['Doe, Jane']);
  assert.equal(result.ref.year, '2021');
  assert.equal(result.ref.doi, '10.1234/abc.9');
  assert.equal(result.ref.fp, '12');
  assert.equal(result.ref.lp, '16');
});
