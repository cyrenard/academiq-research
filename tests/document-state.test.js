const test = require('node:test');
const assert = require('node:assert/strict');

const documentState = require('../src/document-state.js');

test('sanitizeDocHTML removes editor-only artifacts', () => {
  const dirty = [
    '<div class="page-break">x</div>',
    '<div class="page-break-overlay">y</div>',
    '<div class="page-number">1</div>',
    '<hr class="pg-spacer">',
    '<mark class="find-hl">Text</mark>',
    '<button class="toc-delete">sil</button>',
    '<div class="img-toolbar">toolbar</div>',
    '<div class="img-resize-handle"></div>',
    '<p></p>'
  ].join('');

  const clean = documentState.sanitizeDocHTML(dirty);

  assert.equal(clean, 'Text<p></p>');
});

test('sanitizeDocHTML returns blank paragraph for empty input', () => {
  assert.equal(documentState.sanitizeDocHTML(''), '<p></p>');
  assert.equal(documentState.sanitizeDocHTML(null), '<p></p>');
});

test('commitActiveDoc updates current document content and state doc', () => {
  const state = {
    doc: '',
    curDoc: 'doc2',
    docs: [
      { id: 'doc1', name: 'Belge 1', content: '<p>old-1</p>' },
      { id: 'doc2', name: 'Belge 2', content: '<p>old-2</p>' }
    ]
  };

  const committed = documentState.commitActiveDoc(
    state,
    '<div class="page-number">2</div><p>New</p>'
  );

  assert.equal(committed, '<p>New</p>');
  assert.equal(state.doc, '<p>New</p>');
  assert.equal(state.docs[0].content, '<p>old-1</p>');
  assert.equal(state.docs[1].content, '<p>New</p>');
});
