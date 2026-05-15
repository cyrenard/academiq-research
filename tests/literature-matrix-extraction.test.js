const test = require('node:test');
const assert = require('node:assert/strict');

const extraction = require('../src/literature-matrix-extraction.js');
const matrix = require('../src/literature-matrix-state.js');

function best(text, columnKey) {
  const candidates = extraction.extractCandidates(text);
  return candidates.find((candidate) => candidate.columnKey === columnKey);
}

test('extracts high confidence English sample sentence', function() {
  const candidate = best('Participants\nThe sample consisted of 412 undergraduate students.', 'sample');
  assert.equal(candidate.columnKey, 'sample');
  assert.ok(candidate.confidence >= 0.8);
  assert.ok(candidate.reasons.includes('contains_numeric_n'));
});

test('extracts Turkish sample sentence', function() {
  const candidate = best('Örneklem\nAraştırmanın çalışma grubunu 24 üniversite öğrencisi oluşturmaktadır.', 'sample');
  assert.equal(candidate.columnKey, 'sample');
  assert.ok(candidate.confidence >= 0.5);
});

test('extracts Turkish method sentence', function() {
  const candidate = best('Yöntem\nAraştırma ilişkisel tarama modelinde yürütülmüştür.', 'method');
  assert.equal(candidate.columnKey, 'method');
  assert.ok(candidate.confidence >= 0.5);
});

test('extracts findings with statistical cue', function() {
  const candidate = best('Results\nResults showed that AI use significantly predicted metacognitive awareness.', 'findings');
  assert.equal(candidate.columnKey, 'findings');
  assert.ok(candidate.confidence >= 0.5);
  assert.ok(candidate.reasons.includes('statistical_evidence'));
});

test('extracts limitations candidate', function() {
  const candidate = best('Limitations\nThis study is limited by its cross-sectional design and self-report measures.', 'limitations');
  assert.equal(candidate.columnKey, 'limitations');
  assert.ok(candidate.confidence >= 0.5);
});

test('ignores text after references heading', function() {
  const candidates = extraction.extractCandidates([
    'Introduction',
    'This study examines reading behavior.',
    'References',
    'Method. The sample consisted of 999 students.'
  ].join('\n'));
  assert.ok(!candidates.some((candidate) => candidate.text.includes('999 students')));
});

test('penalizes false purpose phrase', function() {
  const candidate = best('Method\nFor the purpose of analysis, missing values were removed.', 'purpose');
  assert.ok(!candidate || candidate.confidence < 0.5);
});

test('appendTextToCell stores PDF selection source and appends text', function() {
  const state = { literatureMatrix: { workspaces: {} } };
  const ref = { id: 'r1', title: 'Study', authors: ['Ada Lovelace'], year: '2024' };
  const ensured = matrix.ensureRowForReference(state, 'ws1', ref, { uid: () => 'row1' });
  matrix.appendTextToCell(state, 'ws1', ensured.row.id, 'sample', 'The sample consisted of 412 students.', {
    source: {
      page: '5',
      snippet: 'The sample consisted of 412 students.',
      extractionType: 'pdf-selection-context-menu',
      confidence: 1,
      updatedAt: 123
    },
    status: 'user_confirmed'
  });
  const cell = state.literatureMatrix.ws1.rows[0].cells.sample;
  assert.equal(cell.text, 'The sample consisted of 412 students.');
  assert.equal(cell.status, 'user_confirmed');
  assert.equal(cell.source.page, '5');
  assert.equal(cell.sources.length, 1);
});
