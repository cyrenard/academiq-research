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

test('parseCSLJSON parses zotero-like csl json and preserves metadata', () => {
  const text = JSON.stringify([
    {
      id: 'item-1',
      type: 'article-journal',
      title: 'CSL Paper',
      author: [
        { family: 'Doe', given: 'Jane' },
        { family: 'Smith', given: 'John' }
      ],
      issued: { 'date-parts': [[2024, 5, 12]] },
      'container-title': 'Journal of CSL',
      volume: '10',
      issue: '2',
      page: '20-29',
      DOI: 'https://doi.org/10.5000/CSL.1',
      URL: 'https://example.org/csl',
      abstract: 'Abstract text',
      note: 'Note text',
      tags: [{ tag: 'method' }, { tag: 'review' }],
      attachments: [{ title: 'PDF', path: '/tmp/paper.pdf' }]
    }
  ]);
  const list = parser.parseCSLJSON(text, { createId: () => 'ref3', workspaceId: 'ws3' });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'ref3');
  assert.equal(list[0].wsId, 'ws3');
  assert.deepEqual(list[0].authors, ['Doe, Jane', 'Smith, John']);
  assert.equal(list[0].year, '2024');
  assert.equal(list[0].journal, 'Journal of CSL');
  assert.equal(list[0].doi, '10.5000/csl.1');
  assert.deepEqual(list[0].labels, ['method', 'review']);
  assert.equal(list[0].abstract, 'Abstract text');
  assert.equal(list[0].pdfPath, '/tmp/paper.pdf');
});
