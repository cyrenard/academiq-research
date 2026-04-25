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
  assert.equal(hydrated.docs[0].citationStyle, 'apa7');
  assert.equal(hydrated.docs[0].trackChangesEnabled, false);
  assert.deepEqual(hydrated.docs[0].bibliographyExtraRefIds, []);
  assert.equal(hydrated.showPageNumbers, false);
  assert.deepEqual(hydrated.customLabels, []);
});

test('hydrate preserves doc citation style when present', () => {
  const hydrated = stateSchema.hydrate(
    {
      wss: [{ id: 'ws1', name: 'WS', docId: 'doc1', lib: [] }],
      docs: [{ id: 'doc1', name: 'Belge', content: '<p>x</p>', citationStyle: 'mla' }],
      cur: 'ws1'
    },
    { sanitize }
  );
  assert.equal(hydrated.docs[0].citationStyle, 'mla');
});

test('hydrate preserves doc track changes mode when present', () => {
  const hydrated = stateSchema.hydrate(
    {
      wss: [{ id: 'ws1', name: 'WS', docId: 'doc1', lib: [] }],
      docs: [{ id: 'doc1', name: 'Belge', content: '<p>x</p>', trackChangesEnabled: true }],
      cur: 'ws1'
    },
    { sanitize }
  );
  assert.equal(hydrated.docs[0].trackChangesEnabled, true);
});

test('hydrate preserves external bibliography reference ids', () => {
  const hydrated = stateSchema.hydrate(
    {
      wss: [{ id: 'ws1', name: 'WS', docId: 'doc1', lib: [] }],
      docs: [{ id: 'doc1', name: 'Belge', content: '<p>x</p>', bibliographyExtraRefIds: [' r1 ', '', 'r2'] }],
      cur: 'ws1'
    },
    { sanitize }
  );

  assert.deepEqual(hydrated.docs[0].bibliographyExtraRefIds, ['r1', 'r2']);
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
              year: 2024,
              referenceType: 'book',
              publisher: ' Academic Press '
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
  assert.equal(ref.referenceType, 'book');
  assert.equal(ref.publisher, 'Academic Press');
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

test('hydrate falls back to article for unsupported reference type', () => {
  const hydrated = stateSchema.hydrate(
    {
      wss: [
        {
          id: 'ws11',
          name: 'Web',
          lib: [
            {
              id: 'ref11',
              title: 'Site entry',
              referenceType: 'blog-post',
              websiteName: 'Example Site'
            }
          ]
        }
      ]
    },
    { sanitize }
  );
  const ref = hydrated.wss[0].lib[0];
  assert.equal(ref.referenceType, 'article');
  assert.equal(ref.websiteName, 'Example Site');
});

test('hydrate normalizes legacy notes to current notebook mapping', () => {
  const hydrated = stateSchema.hydrate(
    {
      notebooks: [{ id: 'nb-a', name: 'A' }],
      curNb: 'nb-a',
      notes: [
        { id: 'n1', notebookId: 'nb-a', txt: 'legacy note' },
        { id: 'n2', nbId: 'missing-notebook', txt: 'orphan note' },
        { id: 'n3', txt: 'no notebook id' },
        { id: 'n4', nb: 'missing-notebook', txt: 'legacy nb alias' }
      ]
    },
    { sanitize }
  );

  assert.equal(hydrated.notes.length, 4);
  assert.equal(hydrated.notes[0].nbId, 'nb-a');
  assert.equal(hydrated.notes[1].nbId, 'nb-a');
  assert.equal(hydrated.notes[2].nbId, 'nb-a');
  assert.equal(hydrated.notes[3].nbId, 'nb-a');
  assert.equal(hydrated.notes[0].txt, 'legacy note');
  assert.equal(hydrated.notes[0].noteType, 'summary');
  assert.equal(hydrated.notes[0].inserted, false);
});

test('hydrate normalizes workspace collections and reference collection ids', () => {
  const hydrated = stateSchema.hydrate(
    {
      wss: [
        {
          id: 'ws1',
          name: 'WS',
          collections: [{ id: ' c1 ', name: ' Kuramlar ' }],
          lib: [{ id: 'r1', title: 'Paper', authors: ['Doe'], collectionIds: [' c1 ', '', null] }]
        }
      ],
      docs: [{ id: 'doc1', name: 'Belge 1', content: '<p>x</p>' }]
    },
    { sanitize }
  );

  assert.equal(hydrated.wss[0].collections.length, 1);
  assert.equal(hydrated.wss[0].collections[0].id, 'c1');
  assert.equal(hydrated.wss[0].collections[0].name, 'Kuramlar');
  assert.deepEqual(hydrated.wss[0].lib[0].collectionIds, ['c1']);
});

test('hydrate scopes literature matrix rows to workspace references and preserves cell source metadata', () => {
  const hydrated = stateSchema.hydrate(
    {
      wss: [
        { id: 'ws1', name: 'WS1', lib: [{ id: 'r1', title: 'A', authors: ['Doe'] }] },
        { id: 'ws2', name: 'WS2', lib: [{ id: 'r2', title: 'B', authors: ['Doe'] }] }
      ],
      literatureMatrix: {
        ws1: {
          rows: [
            {
              id: 'mx1',
              referenceId: 'r1',
              cells: { findings: { text: 'ok', noteIds: ['n1'], source: { page: '12', snippet: 'x' } } }
            },
            {
              id: 'mx-x',
              referenceId: 'r2',
              cells: { findings: { text: 'should be removed', noteIds: [] } }
            }
          ]
        }
      }
    },
    { sanitize }
  );

  const ws1Rows = hydrated.literatureMatrix.ws1.rows;
  assert.equal(ws1Rows.length, 1);
  assert.equal(ws1Rows[0].referenceId, 'r1');
  assert.equal(ws1Rows[0].cells.findings.source.page, '12');
  assert.equal(ws1Rows[0].cells.findings.source.snippet, 'x');
});
