const test = require('node:test');
const assert = require('node:assert/strict');
const assistant = require('../src/literature-matrix-local-assistant.js');

test('local matrix assistant is inert when disabled', function(){
  const candidates = [
    { columnKey: 'sample', text: 'The sample consisted of 412 undergraduate students.', score: 12, confidence: 0.75, reasons: [] }
  ];
  const ranked = assistant.rankCandidates(candidates, {}, { enabled: false });
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].confidence, 0.75);
  assert.equal(ranked[0].assistant, null);
});

test('local matrix assistant boosts strong sample evidence without external provider', function(){
  const candidates = [
    { columnKey: 'sample', text: 'The sample consisted of 412 undergraduate students.', score: 8, confidence: 0.72, reasons: [] }
  ];
  const ranked = assistant.rankCandidates(candidates, {}, { enabled: true });
  assert.equal(ranked.length, 1);
  assert.ok(ranked[0].confidence > 0.72);
  assert.equal(ranked[0].assistant.localOnly, true);
  assert.equal(ranked[0].assistant.provider, 'rule-guard');
});

test('local matrix assistant penalizes reference-like lines', function(){
  const candidates = [
    { columnKey: 'purpose', text: 'Smith, J. (2024). The purpose of the study was discussed. https://doi.org/10.1/test', score: 10, confidence: 0.8, reasons: [] }
  ];
  const ranked = assistant.rankCandidates(candidates, {}, { enabled: true, minConfidence: 0 });
  assert.equal(ranked.length, 1);
  assert.ok(ranked[0].confidence < 0.8);
  assert.ok(ranked[0].reasons.includes('assistant:reference-like-penalty'));
});

test('local matrix assistant status is local-only and matrix-scoped', function(){
  const status = assistant.getStatus({ enabled: true });
  assert.equal(status.localOnly, true);
  assert.equal(status.mode, 'literature-matrix-only');
  assert.equal(status.writesManuscriptText, false);
});

test('local matrix assistant composes matrix cell text when explicitly enabled', function(){
  const composed = assistant.composeCells([
    {
      columnKey: 'sample',
      text: 'Sample: The sample consisted of 412 undergraduate students recruited from three universities.',
      score: 12,
      confidence: 0.86,
      source: { page: '4', section: 'Participants', snippet: 'The sample consisted of 412 undergraduate students.' },
      reasons: ['section:participants']
    }
  ], {}, { enabled: true, composeCells: true });
  assert.equal(composed.length, 1);
  assert.equal(composed[0].columnKey, 'sample');
  assert.match(composed[0].text, /412 undergraduate students/);
  assert.equal(composed[0].source.extractionType, 'local-assistant-compose');
  assert.equal(composed[0].assistant.provider, 'local-composer');
});
