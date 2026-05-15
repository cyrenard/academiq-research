const test = require('node:test');
const assert = require('node:assert/strict');
const { createLocalMatrixAssistantService, sanitizeCandidate } = require('../src/main-process-local-matrix-assistant.js');

test('main local matrix assistant rejects unsupported columns and oversized payloads', () => {
  assert.equal(sanitizeCandidate({ columnKey: 'authorYear', text: 'x' }), null);
  const candidate = sanitizeCandidate({
    columnKey: 'sample',
    text: 'x'.repeat(2600),
    source: { snippet: 'y'.repeat(2600), page: '12' },
    reasons: Array.from({ length: 30 }, (_, index) => `reason-${index}`)
  });
  assert.equal(candidate.text.length, 2000);
  assert.equal(candidate.source.snippet.length, 2000);
  assert.equal(candidate.reasons.length, 12);
});

test('main local matrix assistant ranks candidates only when enabled', () => {
  const service = createLocalMatrixAssistantService();
  const disabled = service.rankCandidates({
    settings: { enabled: false },
    candidates: [{ columnKey: 'sample', text: 'The sample consisted of 412 undergraduate students.', confidence: 0.7 }]
  });
  assert.equal(disabled.skipped, true);

  const enabled = service.rankCandidates({
    settings: { enabled: true },
    reference: { id: 'r1', title: 'Paper' },
    candidates: [{ columnKey: 'sample', text: 'The sample consisted of 412 undergraduate students.', confidence: 0.7 }]
  });
  assert.equal(enabled.ok, true);
  assert.equal(enabled.candidates.length, 1);
  assert.ok(enabled.candidates[0].confidence > 0.7);
  assert.equal(enabled.status.localOnly, true);
});

test('main local matrix assistant composes cells only when compose is enabled', () => {
  const service = createLocalMatrixAssistantService();
  const disabled = service.composeCells({
    settings: { enabled: true, composeCells: false },
    candidates: [{ columnKey: 'method', text: 'The study used a cross-sectional survey design.', confidence: 0.86 }]
  });
  assert.equal(disabled.skipped, true);
  assert.equal(disabled.reason, 'compose-disabled');

  const enabled = service.composeCells({
    settings: { enabled: true, composeCells: true },
    reference: { id: 'r1', title: 'Paper' },
    candidates: [{ columnKey: 'method', text: 'Method: The study used a cross-sectional survey design.', confidence: 0.86 }]
  });
  assert.equal(enabled.ok, true);
  assert.equal(enabled.candidates.length, 1);
  assert.equal(enabled.candidates[0].columnKey, 'method');
  assert.equal(enabled.candidates[0].source.extractionType, 'local-assistant-compose');
});
