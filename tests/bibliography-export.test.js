const test = require('node:test');
const assert = require('node:assert/strict');

const exportApi = require('../src/bibliography-export.js');

test('bibliography-export normalizes style aliases safely', () => {
  assert.equal(exportApi.normalizeStyleId('apa7'), 'apa7');
  assert.equal(exportApi.normalizeStyleId('CHICAGO'), 'chicago-author-date');
  assert.equal(exportApi.normalizeStyleId('vancouver'), 'ieee');
  assert.equal(exportApi.normalizeStyleId('unknown-style'), 'apa7');
});

test('bibliography-export builds CSL-JSON records from mixed references', () => {
  const items = exportApi.buildCslJsonItems([
    {
      id: 'a1',
      referenceType: 'article',
      title: 'People are not becoming AIholic',
      authors: ['Ciudad-Fernandez, V.', 'Billieux, J.'],
      year: '2025',
      journal: 'Addictive Behaviors',
      volume: '166',
      fp: '108325',
      doi: 'https://doi.org/10.1016/J.ADDBEH.2025.108325'
    },
    {
      id: 'b1',
      referenceType: 'book',
      title: 'Artificial intelligence: A modern approach',
      authors: ['Russell, S.', 'Norvig, P.'],
      year: '2021',
      publisher: 'Pearson'
    }
  ]);

  assert.equal(items.length, 2);
  assert.equal(items[0].type, 'article-journal');
  assert.equal(items[0].DOI, '10.1016/J.ADDBEH.2025.108325');
  assert.deepEqual(items[0].issued, { 'date-parts': [[2025]] });
  assert.equal(items[1].type, 'book');
  assert.equal(items[1].publisher, 'Pearson');
});

test('bibliography-export builds plain bibliography text with style-aware formatter', () => {
  const refs = [
    { id: '2', title: 'B title', authors: ['Bravo, B.'], year: '2021' },
    { id: '1', title: 'A title', authors: ['Alpha, A.'], year: '2020' }
  ];
  const text = exportApi.buildPlainBibliographyText(refs, {
    style: 'ieee',
    citationStyles: {
      sortReferences(list){
        return list.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
      },
      formatReference(ref, options){
        return '[' + options.index + '] ' + ref.title;
      }
    }
  });

  assert.equal(text, '[1] A title\n[2] B title');
});
