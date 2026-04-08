const test = require('node:test');
const assert = require('node:assert/strict');

const rec = require('../src/reference-recommendation.js');

const refs = [
  { id: 'r1', title: 'Machine learning methods for education', authors: ['Doe, Jane'], labels: ['methodology'] },
  { id: 'r2', title: 'Qualitative interview findings in education', authors: ['Smith, John'], labels: ['finding'] },
  { id: 'r3', title: 'Sports psychology in elite athletes', authors: ['Miller, Ann'], labels: ['theory'] }
];

test('rankForCitationContext prioritizes query/context overlap', () => {
  const ranked = rec.rankForCitationContext(refs, {
    query: 'education methods',
    contextText: 'This section explains the methodology of education studies'
  });
  assert.equal(ranked[0].ref.id, 'r1');
  assert.ok(ranked[0].score >= ranked[1].score);
});

test('relatedPapers returns neighbors by title/author/tag overlap', () => {
  const related = rec.relatedPapers(refs[0], refs, { notes: [] });
  assert.ok(Array.isArray(related));
  assert.equal(related[0].ref.id, 'r2');
  assert.ok(related[0].score > 0);
});
