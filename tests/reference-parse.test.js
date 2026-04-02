const test = require('node:test');
const assert = require('node:assert/strict');

const parser = require('../src/reference-parse.js');

test('normalizeDoi canonicalizes DOI variants', () => {
  assert.equal(parser.normalizeDoi('https://doi.org/10.3389/FPSYG.2019.01267/BIBTEX'), '10.3389/fpsyg.2019.01267');
  assert.equal(parser.normalizeDoi('doi:10.1501/sporm_0000000377'), '10.1501/sporm_0000000377');
  assert.equal(parser.normalizeDoi('not-a-doi'), '');
});

test('parseBibTeX parses core fields and normalizes doi/year', () => {
  const text = [
    '@article{sample,',
    '  title={A Study on Testing},',
    '  author={Doe, Jane and Smith, John},',
    '  year={2019/03/10},',
    '  journal={Test Journal},',
    '  volume={12},',
    '  number={2},',
    '  pages={10--19},',
    '  doi={https://doi.org/10.3389/FPSYG.2019.01267/BIBTEX},',
    '  url={https://example.org/paper}',
    '}'
  ].join('\n');
  const list = parser.parseBibTeX(text, { createId: () => 'ref1', workspaceId: 'ws1' });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'ref1');
  assert.equal(list[0].wsId, 'ws1');
  assert.deepEqual(list[0].authors, ['Doe, Jane', 'Smith, John']);
  assert.equal(list[0].year, '2019');
  assert.equal(list[0].fp, '10');
  assert.equal(list[0].lp, '19');
  assert.equal(list[0].doi, '10.3389/fpsyg.2019.01267');
});

test('parseRIS parses core fields and normalizes doi/year', () => {
  const text = [
    'TY  - JOUR',
    'TI  - RIS Entry',
    'AU  - Doe, Jane',
    'AU  - Smith, John',
    'PY  - 2020/05/11',
    'JO  - Journal Name',
    'VL  - 4',
    'IS  - 1',
    'SP  - 1',
    'EP  - 12',
    'DO  - doi:10.1234/ABC.2020.001',
    'UR  - https://example.org/ris',
    'ER  -'
  ].join('\n');
  const list = parser.parseRIS(text, { createId: () => 'ref2', workspaceId: 'ws2' });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'ref2');
  assert.equal(list[0].wsId, 'ws2');
  assert.deepEqual(list[0].authors, ['Doe, Jane', 'Smith, John']);
  assert.equal(list[0].year, '2020');
  assert.equal(list[0].doi, '10.1234/abc.2020.001');
});

