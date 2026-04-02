const test = require('node:test');
const assert = require('node:assert/strict');

const stateSchema = require('../src/state-schema.js');

function sanitize(html) {
  return String(html || '').trim() || '<p></p>';
}

test('serialize strips pdfData and stamps schema version', () => {
  const state = {
    wss: [
      {
        id: 'ws1',
        name: 'Workspace',
        lib: [
          {
            id: 'ref1',
            title: 'Paper',
            authors: ['Doe, Jane'],
            pdfData: 'binary'
          }
        ]
      }
    ],
    cur: 'ws1',
    notebooks: [{ id: 'nb1', name: 'General' }],
    curNb: 'nb1',
    notes: [],
    doc: '<p>Hello</p>',
    cm: 'inline',
    docs: [{ id: 'doc1', name: 'Belge 1', content: '<p>Hello</p>' }],
    curDoc: 'doc1',
    showPageNumbers: true,
    customLabels: []
  };

  const out = stateSchema.serialize(state, { sanitize });

  assert.equal(out.schemaVersion, stateSchema.version);
  assert.equal(out.wss[0].lib[0].pdfData, undefined);
  assert.equal(out.doc, '<p>Hello</p>');
  assert.equal(out.showPageNumbers, true);
});

test('hydrate fills defaults for missing structures', () => {
  const hydrated = stateSchema.hydrate(
    {
      wss: [{}],
      docs: [{}]
    },
    { sanitize }
  );

  assert.equal(hydrated.wss.length, 1);
  assert.equal(hydrated.wss[0].id, 'ws1');
  assert.equal(hydrated.notebooks[0].id, 'nb1');
  assert.equal(hydrated.cur, 'ws1');
  assert.equal(hydrated.curNb, 'nb1');
  assert.equal(hydrated.docs[0].id, 'doc1');
  assert.equal(hydrated.docs[0].content, '<p></p>');
  assert.equal(hydrated.showPageNumbers, false);
  assert.deepEqual(hydrated.customLabels, []);
});

test('hydrate normalizes reference fields into stable shapes', () => {
  const hydrated = stateSchema.hydrate(
    {
      wss: [
        {
          id: 'ws9',
          name: 'Literature',
          lib: [
            {
              id: 'ref9',
              title: 42,
              authors: 'Doe, Jane',
              labels: null,
              year: 2024
            }
          ]
        }
      ]
    },
    { sanitize }
  );

  const ref = hydrated.wss[0].lib[0];
  assert.equal(ref.id, 'ref9');
  assert.equal(ref.title, '42');
  assert.deepEqual(ref.authors, ['Doe, Jane']);
  assert.deepEqual(ref.labels, []);
  assert.equal(ref.year, '2024');
});

test('hydrate normalizes noisy DOI variants into canonical DOI', () => {
  const hydrated = stateSchema.hydrate(
    {
      wss: [
        {
          id: 'ws10',
          name: 'Bib',
          lib: [
            {
              id: 'ref10',
              title: 'Sample',
              authors: ['Doe, Jane'],
              doi: 'https://doi.org/10.3389/FPSYG.2019.01267/BIBTEX',
              year: '2019/03/20'
            }
          ]
        }
      ]
    },
    { sanitize }
  );

  const ref = hydrated.wss[0].lib[0];
  assert.equal(ref.doi, '10.3389/fpsyg.2019.01267');
  assert.equal(ref.year, '2019');
});
