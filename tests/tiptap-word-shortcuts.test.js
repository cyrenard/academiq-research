const test = require('node:test');
const assert = require('node:assert/strict');

const shortcuts = require('../src/tiptap-word-shortcuts.js');

test('tiptap word shortcuts exports helpers', () => {
  assert.equal(typeof shortcuts.isEditorFocused, 'function');
  assert.equal(typeof shortcuts.handleEditorShortcut, 'function');
  assert.equal(typeof shortcuts.handleEditorTabShortcut, 'function');
  assert.equal(typeof shortcuts.handleGlobalShortcut, 'function');
  assert.equal(typeof shortcuts.handlePdfShortcut, 'function');
  assert.equal(typeof shortcuts.handleDocumentShortcut, 'function');
  assert.equal(typeof shortcuts.resolveDocumentShortcutState, 'function');
  assert.equal(typeof shortcuts.handleAppDocumentShortcut, 'function');
});

test('handleEditorShortcut routes heading and save actions', () => {
  const calls = [];
  const handledHeading = shortcuts.handleEditorShortcut({ ctrlKey:true, key:'1' }, {
    execCommand(cmd, val){ calls.push([cmd, val]); }
  });
  const handledSave = shortcuts.handleEditorShortcut({ ctrlKey:true, key:'s', shiftKey:false }, {
    save(){ calls.push(['save']); }
  });
  assert.equal(handledHeading, true);
  assert.equal(handledSave, true);
  assert.deepEqual(calls, [['formatBlock', 'h1'], ['save']]);
});

test('isEditorFocused checks host containment', () => {
  const host = {
    contains(node){ return node === child; }
  };
  const child = {};
  assert.equal(shortcuts.isEditorFocused(host, host), true);
  assert.equal(shortcuts.isEditorFocused(host, child), true);
  assert.equal(shortcuts.isEditorFocused(host, {}), false);
});

test('handleEditorTabShortcut routes indent and outdent', () => {
  const calls = [];
  const indentHandled = shortcuts.handleEditorTabShortcut({ key:'Tab', shiftKey:false }, {
    editorFocused:true,
    indent(){ calls.push('indent'); }
  });
  const outdentHandled = shortcuts.handleEditorTabShortcut({ key:'Tab', shiftKey:true }, {
    editorFocused:true,
    outdent(){ calls.push('outdent'); }
  });
  assert.equal(indentHandled, true);
  assert.equal(outdentHandled, true);
  assert.deepEqual(calls, ['indent', 'outdent']);
});

test('handleGlobalShortcut routes find and zoom reset', () => {
  const calls = [];
  const handledFind = shortcuts.handleGlobalShortcut({ ctrlKey:true, key:'h', shiftKey:false }, {
    toggleFindBar(){ calls.push('find'); }
  });
  const handledZoomReset = shortcuts.handleGlobalShortcut({ ctrlKey:true, key:'0' }, {
    pdfOpen:false,
    resetEditorZoom(){ calls.push('reset'); }
  });
  assert.equal(handledFind, true);
  assert.equal(handledZoomReset, true);
  assert.deepEqual(calls, ['find', 'reset']);
});

test('handleGlobalShortcut routes zen toggle and escape exit', () => {
  const calls = [];
  const handledToggle = shortcuts.handleGlobalShortcut({ key:'F10' }, {
    toggleZenMode(){ calls.push('toggle'); }
  });
  const handledEscape = shortcuts.handleGlobalShortcut({ key:'Escape' }, {
    zenActive:true,
    toggleZenMode(){ calls.push('escape'); }
  });
  assert.equal(handledToggle, true);
  assert.equal(handledEscape, true);
  assert.deepEqual(calls, ['toggle', 'escape']);
});

test('handlePdfShortcut routes search and page navigation', () => {
  const calls = [];
  const handledSearch = shortcuts.handlePdfShortcut({ ctrlKey:true, key:'f' }, {
    pdfOpen:true,
    focusPdfSearch(){ calls.push('search'); }
  });
  const handledPageNext = shortcuts.handlePdfShortcut({ key:'PageDown' }, {
    pdfOpen:true,
    nextPdfPage(){ calls.push('next'); }
  });
  assert.equal(handledSearch, true);
  assert.equal(handledPageNext, true);
  assert.deepEqual(calls, ['search', 'next']);
});

test('handleDocumentShortcut orchestrates editor and pdf flows', () => {
  const calls = [];
  const handledEditor = shortcuts.handleDocumentShortcut({ ctrlKey:true, key:'s', shiftKey:false }, {
    editorFocused:true,
    save(){ calls.push('save'); }
  });
  const handledPdf = shortcuts.handleDocumentShortcut({ key:'PageUp' }, {
    pdfOpen:true,
    prevPdfPage(){ calls.push('prev'); }
  });
  const handledInput = shortcuts.handleDocumentShortcut({ key:'x' }, {
    inInput:true
  });
  assert.equal(handledEditor, true);
  assert.equal(handledPdf, true);
  assert.equal(handledInput, true);
  assert.deepEqual(calls, ['save', 'prev']);
});

test('resolveDocumentShortcutState derives input, pdf and zen flags from DOM state', () => {
  const host = { contains(node){ return node === active; } };
  const active = {};
  const state = shortcuts.resolveDocumentShortcutState({
    target: { tagName:'INPUT' }
  }, {
    host,
    activeElement: active,
    pdfPanel: {
      classList: { contains(name){ return name === 'open'; } }
    },
    getZenActive(){ return true; }
  });
  assert.deepEqual(state, {
    pdfOpen: true,
    inInput: true,
    editorFocused: true,
    zenActive: true
  });
});

test('handleAppDocumentShortcut resolves state then routes shortcut', () => {
  const calls = [];
  const handled = shortcuts.handleAppDocumentShortcut({ ctrlKey:true, key:'s', shiftKey:false }, {
    host: { contains(){ return true; } },
    activeElement: {},
    actions: {
      save(){ calls.push('save'); }
    }
  });
  assert.equal(handled, true);
  assert.deepEqual(calls, ['save']);
});
