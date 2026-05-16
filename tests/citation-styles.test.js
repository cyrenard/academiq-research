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

test('formatInlineCitation uses surnames for APA7 author names', () => {
  assert.equal(styles.formatInlineCitation({
    id: 'r-full-name',
    authors: ['Elfrid Krossbakken'],
    year: '2018'
  }, { style: 'apa7' }), '(Krossbakken, 2018)');
  assert.equal(styles.formatInlineCitation({
    id: 'r-inverted-name',
    authors: ['Krossbakken, Elfrid'],
    year: '2018'
  }, { style: 'apa7' }), '(Krossbakken, 2018)');
  assert.equal(styles.formatInlineCitation({
    id: 'r-many-full-names',
    authors: ['Elfrid Krossbakken', 'Stale Pallesen', 'Rune Aune Mentzoni'],
    year: '2018'
  }, { style: 'apa7' }), '(Krossbakken vd., 2018)');
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
  assert.match(styles.formatReference(sample, { style: 'apa7' }), /^Doe, J\., & Smith, J\. \(2024\)\./);
  assert.match(styles.formatReference(sample, { style: 'apa7' }), /<i>Journal of Tests, 12<\/i>\(2\), 10-20\./);
  assert.match(styles.formatReference(sample, { style: 'mla' }), /vol\. 12/);
  assert.match(styles.formatReference(sample, { style: 'chicago-author-date' }), /2024\./);
  assert.match(styles.formatReference(sample, { style: 'ieee', index: 2 }), /^\[2\]/);
  assert.match(styles.formatReference(sample, { style: 'harvard' }), /\(2024\)/);
});

test('APA7 formats book references with publisher and edition', () => {
  const book = {
    referenceType: 'book',
    authors: ['Steele, Elizabeth A.'],
    year: '2022',
    title: 'Responsive consultation in early childhood',
    publisher: 'Academic Press',
    edition: '2'
  };
  const out = styles.formatReference(book, { style: 'apa7' });
  assert.match(out, /Steele, E\./);
  assert.match(out, /<i>Responsive consultation in early childhood<\/i>\./);
  assert.match(out, /\(2nd ed\.\)\./);
  assert.match(out, /Academic Press\./);
});

test('APA7 normalizes book title, edition, and publisher metadata', () => {
  const book = {
    referenceType: 'book',
    authors: ['SMITH, JOHN', 'FLOWERS, PAUL'],
    year: '2022',
    title: 'INTERPRETATIVE PHENOMENOLOGICAL ANALYSIS: THEORY, METHOD AND RESEARCH',
    publisher: 'SAGE PUBLICATIONS',
    edition: '3rd edition'
  };
  const out = styles.formatReference(book, { style: 'apa7' });
  assert.match(out, /^Smith, J\., & Flowers, P\. \(2022\)\./);
  assert.match(out, /<i>Interpretative phenomenological analysis: Theory, method and research<\/i>\./);
  assert.match(out, /\(3rd ed\.\)\./);
  assert.match(out, /Sage Publications\./);
});

test('APA7 formats numeric book editions as ordinals', () => {
  const base = {
    referenceType: 'book',
    authors: ['Doe, Jane'],
    year: '2020',
    title: 'Book title',
    publisher: 'Pearson'
  };
  const cases = [
    ['1', '1st'],
    ['2', '2nd'],
    ['3', '3rd'],
    ['4', '4th'],
    ['11', '11th'],
    ['12', '12th'],
    ['13', '13th'],
    ['21', '21st']
  ];
  cases.forEach(([edition, expected]) => {
    const out = styles.formatReference({ ...base, edition }, { style: 'apa7' });
    assert.match(out, new RegExp('\\(' + expected + ' ed\\.\\)\\.'));
  });
});

test('APA7 formats website references with site and retrieved date', () => {
  const website = {
    referenceType: 'website',
    authors: [],
    title: 'Guidelines for student papers',
    websiteName: 'APA Style',
    publishedDate: '2024-10-05',
    accessedDate: '2026-04-11',
    url: 'https://apastyle.apa.org/'
  };
  const out = styles.formatReference(website, { style: 'apa7' });
  assert.match(out, /\(October 5, 2024\)\./);
  assert.match(out, /<i>Guidelines for student papers<\/i>\./);
  assert.match(out, /APA Style\./);
  assert.match(out, /Retrieved April 11, 2026, from https:\/\/apastyle\.apa\.org\//);
});

test('APA7 normalizes shouting metadata in bibliography output', () => {
  const ref = {
    referenceType: 'article',
    authors: ['ZHOU, TAO', 'ZHANG, CHUNLEI'],
    year: '2024',
    title: 'THE IMPACT OF ARTIFICIAL INTELLIGENCE ADOPTION ON ORGANIZATIONAL DECISION-MAKING: AN EMPIRICAL STUDY',
    journal: 'TECHNOLOGY IN SOCIETY',
    volume: '74',
    doi: '10.1016/j.techsoc.2024.102653'
  };
  const out = styles.formatReference(ref, { style: 'apa7' });
  assert.match(out, /^Zhou, T\., & Zhang, C\. \(2024\)\./);
  assert.match(out, /The impact of artificial intelligence adoption on organizational decision-making: An empirical study\./);
  assert.match(out, /<i>Technology in Society, 74<\/i>/);
});

test('APA7 keeps protected acronyms while sentence-casing titles', () => {
  const ref = {
    authors: ['Smith, Jane'],
    year: '2025',
    title: 'COVID-19 AND AI USE IN APA STYLE WORKFLOWS',
    journal: 'JOURNAL OF PDF STUDIES',
    doi: '10.1000/example'
  };
  const out = styles.formatReference(ref, { style: 'apa7' });
  assert.match(out, /COVID-19 and AI use in APA style workflows\./);
  assert.match(out, /<i>Journal of PDF Studies<\/i>/);
});
