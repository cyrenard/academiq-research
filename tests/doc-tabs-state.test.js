const test = require('node:test');
const assert = require('node:assert/strict');

const docTabsState = require('../src/doc-tabs-state.js');

function sanitize(html) {
  return String(html || '').trim() || '<p></p>';
}

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
