const test = require('node:test');
const assert = require('node:assert/strict');

const webRelated = require('../src/web-related-papers.js');

test('normalizeWebResult normalizes DOI and core metadata', () => {
  const row = webRelated.normalizeWebResult({
    title: '  Sample Paper Title  ',
    authors: ['Doe, Jane', 'Smith, John'],
    year: '2021-05-01',
    doi: 'https://doi.org/10.1000/ABC.123',
    journal: 'Journal of Testing',
    url: 'https://example.org/paper',
    abstract: 'Example abstract'
  }, { provider: 'openalex', providerLabel: 'OpenAlex' });

  assert.equal(row.title, 'Sample Paper Title');
  assert.equal(row.year, '2021');
  assert.equal(row.doi, '10.1000/abc.123');
  assert.equal(row.provider, 'openalex');
  assert.equal(row.providerLabel, 'OpenAlex');
});

test('decideAddToActiveWorkspace prefers already-in-active workspace match', () => {
  const candidate = { title: 'Paper A', doi: '10.1/abc', authors: ['Doe, Jane'], year: '2020' };
  const wss = [
    { id: 'ws1', lib: [{ id: 'r1', title: 'Paper A', doi: '10.1/abc', authors: ['Doe, Jane'], year: '2020' }] },
    { id: 'ws2', lib: [] }
  ];
  const decision = webRelated.decideAddToActiveWorkspace(wss, 'ws1', candidate);
  assert.equal(decision.action, 'already_in_workspace');
  assert.equal(decision.existingRef.id, 'r1');
});

test('decideAddToActiveWorkspace can attach existing from another workspace', () => {
  const candidate = { title: 'Paper B', doi: '10.2/xyz', authors: ['Miller, Ann'], year: '2022' };
  const wss = [
    { id: 'ws1', lib: [] },
    { id: 'ws2', lib: [{ id: 'r2', title: 'Paper B', doi: '10.2/xyz', authors: ['Miller, Ann'], year: '2022' }] }
  ];
  const decision = webRelated.decideAddToActiveWorkspace(wss, 'ws1', candidate);
  assert.equal(decision.action, 'attach_existing');
  assert.equal(decision.existingRef.id, 'r2');
  assert.equal(decision.sourceWorkspaceId, 'ws2');
});

test('createCache stores values and clear removes cache entries', () => {
  const cache = webRelated.createCache(30);
  cache.set('k1', { value: 123 });
  assert.deepEqual(cache.get('k1'), { value: 123 });
  cache.clear();
  assert.equal(cache.get('k1'), null);
});
