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

test('handleEditorShortcut Ctrl+Enter inserts page break', () => {
  const calls = [];
  const handled = shortcuts.handleEditorShortcut({ ctrlKey:true, key:'Enter' }, {
    execCommand(cmd){ calls.push(cmd); }
  });
  assert.equal(handled, true);
  assert.deepEqual(calls, ['insertPageBreak']);
});

test('handleEditorShortcut routes undo and redo actions explicitly', () => {
  const calls = [];
  const handledUndo = shortcuts.handleEditorShortcut({ ctrlKey:true, key:'z', shiftKey:false }, {
    undo(){ calls.push('undo'); }
  });
  const handledRedoY = shortcuts.handleEditorShortcut({ ctrlKey:true, key:'y', shiftKey:false }, {
    redo(){ calls.push('redo-y'); }
  });
  const handledRedoShiftZ = shortcuts.handleEditorShortcut({ ctrlKey:true, key:'z', shiftKey:true }, {
    redo(){ calls.push('redo-shift-z'); }
  });
  assert.equal(handledUndo, true);
  assert.equal(handledRedoY, true);
  assert.equal(handledRedoShiftZ, true);
  assert.deepEqual(calls, ['undo', 'redo-y', 'redo-shift-z']);
});

test('handleEditorShortcut does not hijack normal writing keys', () => {
  const dangerousKeys = ['Enter', 'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight'];

  for (const key of dangerousKeys) {
    const handled = shortcuts.handleEditorShortcut({ key }, {
      execCommand(){ throw new Error(`${key} should not run editor command without modifier`); },
      undo(){ throw new Error(`${key} should not undo without modifier`); },
      redo(){ throw new Error(`${key} should not redo without modifier`); }
    });
    assert.equal(handled, false, `${key} should stay native during normal writing`);
  }
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
    inList:true,
    indent(){ calls.push('indent'); }
  });
  const outdentHandled = shortcuts.handleEditorTabShortcut({ key:'Tab', shiftKey:true }, {
    editorFocused:true,
    inList:true,
    outdent(){ calls.push('outdent'); }
  });
  assert.equal(indentHandled, true);
  assert.equal(outdentHandled, true);
  assert.deepEqual(calls, ['indent', 'outdent']);
});

test('handleEditorTabShortcut ignores tab outside list context', () => {
  const handled = shortcuts.handleEditorTabShortcut({ key:'Tab', shiftKey:false }, {
    editorFocused:true,
    inList:false,
    indent(){ throw new Error('should not indent'); }
  });
  assert.equal(handled, false);
});

test('handleEditorTabShortcut ignores modified tabs so browser/editor can own them', () => {
  const combos = [
    { key:'Tab', ctrlKey:true, shiftKey:false },
    { key:'Tab', metaKey:true, shiftKey:false },
    { key:'Tab', altKey:true, shiftKey:false }
  ];

  for (const event of combos) {
    const handled = shortcuts.handleEditorTabShortcut(event, {
      editorFocused:true,
      inList:true,
      indent(){ throw new Error('modified Tab should not indent list'); },
      outdent(){ throw new Error('modified Tab should not outdent list'); }
    });
    assert.equal(handled, false);
  }
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

test('handleGlobalShortcut toggles track changes with Ctrl+Shift+E', () => {
  const calls = [];
  const handled = shortcuts.handleGlobalShortcut({ ctrlKey:true, key:'E', shiftKey:true }, {
    toggleTrackChanges(){ calls.push('track-toggle'); }
  });
  assert.equal(handled, true);
  assert.deepEqual(calls, ['track-toggle']);
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

test('handleDocumentShortcut leaves native editing keys alone while editor is focused', () => {
  const handledEnter = shortcuts.handleDocumentShortcut({ key:'Enter' }, {
    editorFocused:true,
    inInput:false,
    execCommand(){ throw new Error('plain Enter should stay native'); }
  });
  const handledBackspace = shortcuts.handleDocumentShortcut({ key:'Backspace' }, {
    editorFocused:true,
    inInput:false,
    execCommand(){ throw new Error('plain Backspace should stay native'); }
  });

  assert.equal(handledEnter, false);
  assert.equal(handledBackspace, false);
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
    inList: false,
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
