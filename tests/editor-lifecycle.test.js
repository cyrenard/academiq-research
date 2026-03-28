const test = require('node:test');
const assert = require('node:assert/strict');

function loadLifecycle(){
  const path = require.resolve('../src/editor-lifecycle.js');
  delete require.cache[path];
  return require(path);
}

test('editor lifecycle exports init helpers', () => {
  const lifecycle = loadLifecycle();
  assert.equal(typeof lifecycle.init, 'function');
  assert.equal(typeof lifecycle.initTipTap, 'function');
  assert.equal(typeof lifecycle.ensureInitialized, 'function');
  assert.equal(typeof lifecycle.loadCurrentDocument, 'function');
  assert.equal(typeof lifecycle.bootstrap, 'function');
});

test('initTipTap uses provided init function and tracks state', () => {
  global.editor = null;
  const lifecycle = loadLifecycle();
  const editorInstance = { id:'editor' };
  const editorRef = global;
  const result = lifecycle.initTipTap({
    initFn(){
      editorRef.editor = editorInstance;
    }
  });
  assert.equal(result, editorInstance);
  assert.equal(lifecycle.getState().ready, true);
  assert.equal(lifecycle.getState().mode, 'tiptap');
  delete global.editor;
});

test('bootstrap initializes editor and schedules current document load', async () => {
  global.editor = null;
  const lifecycle = loadLifecycle();
  const calls = [];
  const editorRef = global;
  const result = lifecycle.bootstrap({
    initFn(){
      editorRef.editor = { id:'editor' };
      calls.push(['init']);
    },
    delay: 1,
    getHTML(){
      calls.push(['getHTML']);
      return '<p>doc</p>';
    },
    applyDocument(html){
      calls.push(['apply', html]);
    }
  });
  assert.deepEqual(result, { id:'editor' });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(calls, [
    ['init'],
    ['getHTML'],
    ['apply', '<p>doc</p>']
  ]);
  delete global.editor;
});
