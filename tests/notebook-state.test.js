const test = require('node:test');
const assert = require('node:assert/strict');

const notebookState = require('../src/notebook-state.js');

test('ensureNotebooks backfills default notebook and current selection', function(){
  const next = notebookState.ensureNotebooks([], null);
  assert.equal(next.notebooks.length, 1);
  assert.equal(next.notebooks[0].name, 'Genel Notlar');
  assert.equal(next.currentNotebookId, 'nb1');
});

test('addNotebook appends and selects new notebook', function(){
  const next = notebookState.addNotebook({
    notebooks: [{ id:'nb1', name:'Genel' }],
    currentNotebookId: 'nb1'
  }, {
    id: 'nb2',
    name: '  Literatür  '
  });

  assert.equal(next.notebooks.length, 2);
  assert.equal(next.notebooks[1].name, 'Literatür');
  assert.equal(next.currentNotebookId, 'nb2');
});

test('deleteNotebook falls back to first remaining notebook', function(){
  const next = notebookState.deleteNotebook({
    notebooks: [{ id:'nb1', name:'A' }, { id:'nb2', name:'B' }],
    currentNotebookId: 'nb2'
  }, 'nb2');

  assert.equal(next.notebooks.length, 1);
  assert.equal(next.currentNotebookId, 'nb1');
});

test('renameNotebook updates only target notebook', function(){
  const next = notebookState.renameNotebook({
    notebooks: [{ id:'nb1', name:'A' }, { id:'nb2', name:'B' }],
    currentNotebookId: 'nb1'
  }, 'nb2', '  Yeni Ad  ');

  assert.equal(next.notebooks[1].name, 'Yeni Ad');
  assert.equal(next.notebooks[0].name, 'A');
});

test('buildNotebookViewModel marks active and deletable notebooks', function(){
  const view = notebookState.buildNotebookViewModel({
    notebooks: [{ id:'nb1', name:'A' }, { id:'nb2', name:'B' }],
    currentNotebookId: 'nb2'
  });

  assert.deepEqual(view, [
    { id:'nb1', name:'A', active:false, deletable:true },
    { id:'nb2', name:'B', active:true, deletable:true }
  ]);
});
