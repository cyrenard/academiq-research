const test = require('node:test');
const assert = require('node:assert/strict');

const matrix = require('../src/literature-matrix-state.js');

function createState(){
  return { literatureMatrix: {} };
}

test('ensureRowForReference creates a single row per reference in workspace', function(){
  const state = createState();

  const first = matrix.ensureRowForReference(state, 'ws1', { id: 'r1' });
  const second = matrix.ensureRowForReference(state, 'ws1', { id: 'r1' });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(matrix.getRows(state, 'ws1').length, 1);
  assert.equal(first.row.referenceId, 'r1');
  assert.equal(second.row.referenceId, 'r1');
});

test('inferColumnFromNoteType maps research note types to matrix columns', function(){
  assert.equal(matrix.inferColumnFromNoteType('summary'), 'purpose');
  assert.equal(matrix.inferColumnFromNoteType('methodology'), 'method');
  assert.equal(matrix.inferColumnFromNoteType('finding'), 'findings');
  assert.equal(matrix.inferColumnFromNoteType('limitation'), 'limitations');
  assert.equal(matrix.inferColumnFromNoteType('personal_insight'), 'myNotes');
  assert.equal(matrix.inferColumnFromNoteType('unknown-type'), 'myNotes');
});

test('appendNoteToCell stores linked note ids and appends note text', function(){
  const state = createState();
  const row = matrix.ensureRowForReference(state, 'ws1', { id: 'r1' }).row;

  matrix.appendNoteToCell(state, 'ws1', row.id, 'findings', 'n1', 'Ilk bulgu', {
    sourcePage: '12',
    sourceSnippet: 'Ilk bulgu'
  });
  matrix.appendNoteToCell(state, 'ws1', row.id, 'findings', 'n1', 'Ikinci bulgu');

  const found = matrix.findRowById(state, 'ws1', row.id);
  assert.ok(found);
  assert.deepEqual(found.cells.findings.noteIds, ['n1']);
  assert.equal(found.cells.findings.text, 'Ilk bulgu\nIkinci bulgu');
  assert.equal(found.cells.findings.source.page, '12');
  assert.equal(found.cells.findings.source.snippet, 'Ilk bulgu');
});

test('setSelectedCell and getCellLinkedNoteIds resolve selected context', function(){
  const state = createState();
  const row = matrix.ensureRowForReference(state, 'ws1', { id: 'r1' }).row;
  matrix.appendNoteToCell(state, 'ws1', row.id, 'method', 'n44', 'Yontem notu');
  matrix.setSelectedCell(state, 'ws1', row.id, 'method');

  const selected = matrix.getSelectedCell(state, 'ws1');
  assert.deepEqual(selected, { rowId: row.id, columnKey: 'method' });
  assert.deepEqual(matrix.getCellLinkedNoteIds(state, 'ws1', row.id, 'method'), ['n44']);
});

test('inferAutoCellsFromReference extracts academic fields from abstract patterns', function(){
  const ref = {
    id: 'r5',
    abstract: [
      'This study aims to evaluate digital literacy in university students.',
      'Using a qualitative approach, semi-structured interviews were conducted.',
      'The sample consisted of 42 undergraduate students.',
      'Results showed that reflective practice improved outcomes.',
      'One limitation is the single-site design and future research should replicate findings.'
    ].join(' ')
  };
  const auto = matrix.inferAutoCellsFromReference(ref, { notes: [] });
  assert.match(auto.purpose || '', /study aims to/i);
  assert.match(auto.method || '', /qualitative approach|semi-structured interviews/i);
  assert.match(auto.sample || '', /sample consisted of|undergraduate students/i);
  assert.match(auto.findings || '', /results showed that/i);
  assert.match(auto.limitations || '', /one limitation|future research should/i);
});

test('inferAutoCellsFromReference captures structured abstract sections', function(){
  const ref = {
    id: 'r6',
    abstract: [
      'Purpose: To evaluate academic procrastination among first-year students.',
      'Methods: We used a mixed-methods design with semi-structured interviews.',
      'Sample: N = 128 undergraduate students.',
      'Results: Findings indicated that self-regulation predicted performance.',
      'Limitations: This study is limited by single-university sampling.'
    ].join(' ')
  };
  const auto = matrix.inferAutoCellsFromReference(ref, { notes: [] });
  assert.match(auto.purpose || '', /evaluate academic procrastination/i);
  assert.match(auto.method || '', /mixed-methods|semi-structured interviews/i);
  assert.match(auto.sample || '', /\bN\s*=\s*128\b/i);
  assert.match(auto.findings || '', /findings indicated/i);
  assert.match(auto.limitations || '', /limited by single-university sampling/i);
});

test('inferAutoCellsFromReference supports non-exact cue variants', function(){
  const ref = {
    id: 'r9',
    abstract: [
      'We aimed to examine digital distraction during online classes.',
      'A randomized controlled trial was conducted in two departments.',
      'Participants were 84 students recruited from compulsory courses.',
      'Our findings suggest that notification blocking improved concentration.'
    ].join(' ')
  };
  const auto = matrix.inferAutoCellsFromReference(ref, { notes: [] });
  assert.match(auto.purpose || '', /aimed to examine/i);
  assert.match(auto.method || '', /randomized controlled trial/i);
  assert.match(auto.sample || '', /84 students/i);
  assert.match(auto.findings || '', /findings suggest/i);
});

test('inferAutoCellsFromReference uses keyword scoring for weaker phrasing', function(){
  const ref = {
    id: 'r10',
    abstract: [
      'The research question focused on the relationship between digital fatigue and productivity.',
      'A longitudinal survey with regression analysis was conducted.',
      'Participants included 246 healthcare workers.',
      'Statistically significant improvements were observed after intervention.',
      'Generalizability is constrained by single-center sampling and future research is needed.'
    ].join(' ')
  };
  const auto = matrix.inferAutoCellsFromReference(ref, { notes: [] });
  assert.match(auto.purpose || '', /relationship between digital fatigue/i);
  assert.match(auto.method || '', /longitudinal survey|regression analysis/i);
  assert.match(auto.sample || '', /246 healthcare workers/i);
  assert.match(auto.findings || '', /statistically significant improvements/i);
  assert.match(auto.limitations || '', /constrained by single-center/i);
});

test('applyAutoCellsToRow fills only empty cells by default', function(){
  const state = createState();
  const row = matrix.ensureRowForReference(state, 'ws1', { id: 'r7' }).row;
  matrix.setCellText(state, 'ws1', row.id, 'purpose', 'Manuel purpose');
  matrix.applyAutoCellsToRow(state, 'ws1', row.id, {
    purpose: 'Auto purpose',
    findings: 'Auto findings'
  }, { overwrite: false });
  const found = matrix.findRowById(state, 'ws1', row.id);
  assert.equal(found.cells.purpose.text, 'Manuel purpose');
  assert.equal(found.cells.findings.text, 'Auto findings');
});

test('removeRow deletes row and clears selected cell if it belongs to removed row', function(){
  const state = createState();
  const row = matrix.ensureRowForReference(state, 'ws1', { id: 'r8' }).row;
  matrix.setSelectedCell(state, 'ws1', row.id, 'method');
  const removed = matrix.removeRow(state, 'ws1', row.id);
  assert.equal(removed, true);
  assert.equal(matrix.getRows(state, 'ws1').length, 0);
  assert.equal(matrix.getSelectedCell(state, 'ws1'), null);
});

test('dismissReference marks ref as dismissed and ensureRowForReference undismisses it', function(){
  const state = createState();
  const row = matrix.ensureRowForReference(state, 'ws1', { id: 'r11' }).row;
  assert.ok(row && row.id);
  const dismissed = matrix.dismissReference(state, 'ws1', 'r11');
  assert.equal(dismissed, true);
  assert.equal(matrix.isReferenceDismissed(state, 'ws1', 'r11'), true);
  const ensured = matrix.ensureRowForReference(state, 'ws1', { id: 'r11' });
  assert.equal(ensured.created, false);
  assert.equal(matrix.isReferenceDismissed(state, 'ws1', 'r11'), false);
});
