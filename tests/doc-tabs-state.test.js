const test = require('node:test');
const assert = require('node:assert/strict');

const docTabsState = require('../src/doc-tabs-state.js');

function sanitize(html) {
  return String(html || '').trim() || '<p></p>';
}

test('createDocState appends a new blank document and selects it', () => {
  const state = {
    docs: [{ id: 'doc1', name: 'Belge 1', content: '<p>Old</p>' }],
    curDoc: 'doc1',
    doc: '<p>Old</p>'
  };

  const created = docTabsState.createDocState(state, 'Yeni Belge', {
    uid: () => 'doc2',
    sanitize
  });

  assert.equal(created.id, 'doc2');
  assert.equal(state.docs.length, 2);
  assert.equal(state.curDoc, 'doc2');
  assert.equal(state.doc, '<p></p>');
});

test('switchDocState selects and normalizes target doc', () => {
  const state = {
    docs: [
      { id: 'doc1', name: 'A', content: '<p>One</p>' },
      { id: 'doc2', name: 'B', content: '' }
    ],
    curDoc: 'doc1',
    doc: '<p>One</p>'
  };

  const switched = docTabsState.switchDocState(state, 'doc2', { sanitize });

  assert.equal(switched.id, 'doc2');
  assert.equal(state.curDoc, 'doc2');
  assert.equal(state.doc, '<p></p>');
  assert.equal(state.docs[1].content, '<p></p>');
});

test('deleteDocState removes doc and falls back to first remaining current doc', () => {
  const state = {
    docs: [
      { id: 'doc1', name: 'A', content: '<p>One</p>' },
      { id: 'doc2', name: 'B', content: '<p>Two</p>' }
    ],
    curDoc: 'doc2',
    doc: '<p>Two</p>'
  };

  const current = docTabsState.deleteDocState(state, 'doc2', { sanitize });

  assert.equal(state.docs.length, 1);
  assert.equal(state.curDoc, 'doc1');
  assert.equal(state.doc, '<p>One</p>');
  assert.equal(current.id, 'doc1');
});

test('ensureWorkspaceDocsState assigns one document per workspace and current doc follows workspace', () => {
  const state = {
    wss: [
      { id: 'ws1', name: 'Alan 1', lib: [] },
      { id: 'ws2', name: 'Alan 2', lib: [] }
    ],
    cur: 'ws2',
    docs: [{ id: 'docA', name: 'Eski', content: '<p>A</p>' }],
    doc: '<p>Legacy</p>'
  };

  docTabsState.ensureWorkspaceDocsState(state, {
    uid: (() => {
      const ids = ['doc1', 'doc2'];
      return () => ids.shift();
    })(),
    sanitize
  });

  assert.equal(state.wss[0].docId, 'doc1');
  assert.equal(state.wss[1].docId, 'doc2');
  assert.equal(state.docs.length, 2);
  assert.equal(state.docs[0].name, 'Alan 1');
  assert.equal(state.docs[1].name, 'Alan 2');
  assert.equal(state.curDoc, 'doc2');
  assert.equal(state.doc, '<p></p>');
});

test('addWorkspaceWithDocState creates a workspace-owned document and selects it', () => {
  const state = {
    wss: [{ id: 'ws1', name: 'Alan 1', lib: [], docId: 'doc1' }],
    docs: [{ id: 'doc1', name: 'Alan 1', content: '<p>A</p>' }],
    cur: 'ws1',
    curDoc: 'doc1',
    doc: '<p>A</p>'
  };

  const result = docTabsState.addWorkspaceWithDocState(state, {
    id: 'ws2',
    name: 'Alan 2',
    lib: []
  }, {
    uid: (() => {
      const ids = ['doc2'];
      return () => ids.shift();
    })(),
    sanitize
  });

  assert.equal(result.workspace.id, 'ws2');
  assert.equal(result.workspace.docId, 'doc2');
  assert.equal(result.doc.name, 'Alan 2');
  assert.equal(state.cur, 'ws2');
  assert.equal(state.curDoc, 'doc2');
  assert.equal(state.doc, '<p></p>');
});

test('deleteWorkspaceWithDocState removes linked document and falls back to remaining workspace', () => {
  const state = {
    wss: [
      { id: 'ws1', name: 'Alan 1', lib: [], docId: 'doc1' },
      { id: 'ws2', name: 'Alan 2', lib: [], docId: 'doc2' }
    ],
    docs: [
      { id: 'doc1', name: 'Alan 1', content: '<p>One</p>' },
      { id: 'doc2', name: 'Alan 2', content: '<p>Two</p>' }
    ],
    cur: 'ws2',
    curDoc: 'doc2',
    doc: '<p>Two</p>'
  };

  const current = docTabsState.deleteWorkspaceWithDocState(state, 'ws2', { sanitize });

  assert.equal(state.wss.length, 1);
  assert.equal(state.docs.length, 1);
  assert.equal(state.wss[0].id, 'ws1');
  assert.equal(state.docs[0].id, 'doc1');
  assert.equal(state.cur, 'ws1');
  assert.equal(state.curDoc, 'doc1');
  assert.equal(state.doc, '<p>One</p>');
  assert.equal(current.doc.id, 'doc1');
});

test('switchWorkspaceState keeps toc and bibliography scoped to each workspace document', () => {
  const state = {
    wss: [
      { id: 'ws1', name: 'Alan 1', lib: [], docId: 'doc1' },
      { id: 'ws2', name: 'Alan 2', lib: [], docId: 'doc2' }
    ],
    docs: [
      { id: 'doc1', name: 'Alan 1', content: '<p>A</p>', tocHTML: '<div>toc-a</div>', bibliographyHTML: '<p>b-a</p>', bibliographyManual: false },
      { id: 'doc2', name: 'Alan 2', content: '<p>B</p>', tocHTML: '<div>toc-b</div>', bibliographyHTML: '<p>b-b</p>', bibliographyManual: true }
    ],
    cur: 'ws1',
    curDoc: 'doc1',
    doc: '<p>A</p>'
  };

  const switched = docTabsState.switchWorkspaceState(state, 'ws2', { sanitize });

  assert.equal(switched.workspace.id, 'ws2');
  assert.equal(switched.doc.id, 'doc2');
  assert.equal(switched.doc.tocHTML, '<div>toc-b</div>');
  assert.equal(switched.doc.bibliographyHTML, '<p>b-b</p>');
  assert.equal(state.docs.find(d => d.id === 'doc1').tocHTML, '<div>toc-a</div>');
  assert.equal(state.docs.find(d => d.id === 'doc1').bibliographyHTML, '<p>b-a</p>');
});
