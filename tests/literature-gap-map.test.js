const test = require('node:test');
const assert = require('node:assert/strict');

const gapMap = require('../src/literature-gap-map.js');

function row(id, year, cells) {
  return {
    id,
    referenceId: id,
    authorYear: `Author ${year}`,
    cells: Object.fromEntries(Object.entries(cells).map(([key, text]) => [key, { text }]))
  };
}

test('builds method by sample heatmap and methodological gap', function() {
  const rows = [];
  for (let index = 0; index < 8; index += 1) {
    rows.push(row(`r${index}`, 2020 + index, {
      method: 'A cross-sectional quantitative survey design was used with regression analysis.',
      sample: 'The sample consisted of undergraduate students.',
      findings: 'Results showed a positive relationship.',
      limitations: 'The study is limited by cross-sectional design and self-report measures.'
    }));
  }
  const result = gapMap.buildGapMap(rows);
  assert.equal(result.overview.totalStudies, 8);
  assert.equal(result.overview.mostCommonMethod, 'quantitative');
  assert.ok(result.heatmaps.methodBySample.some((item) => item.x === 'quantitative' && item.y === 'undergraduate students'));
  assert.ok(result.gapCandidates.some((item) => item.type === 'methodological_gap'));
  assert.ok(result.heatmaps.limitationFrequency.some((item) => item.tag === 'cross-sectional' && item.count === 8));
});

test('detects nonsignificant finding direction and qualitative design', function() {
  const result = gapMap.buildGapMap([
    row('r1', 2025, {
      method: 'The study used a phenomenological qualitative approach and thematic analysis.',
      sample: 'Participants were teachers.',
      findings: 'No significant relationship was found.',
      limitations: 'Small sample size was a limitation.'
    })
  ]);
  assert.equal(result.tags[0].methodType, 'qualitative');
  assert.equal(result.tags[0].design, 'phenomenology');
  assert.equal(result.tags[0].findingDirection, 'nonsignificant');
  assert.ok(result.tags[0].limitationTags.includes('small sample'));
});
