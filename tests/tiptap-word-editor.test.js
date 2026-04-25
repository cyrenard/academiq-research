const test = require('node:test');
const assert = require('node:assert/strict');

const wordEditor = require('../src/tiptap-word-editor.js');

test('tiptap word editor exports createEditor and createExtensions', () => {
  assert.equal(typeof wordEditor.createEditor, 'function');
  assert.equal(typeof wordEditor.createExtensions, 'function');
  assert.equal(typeof wordEditor.createListStyleExtension, 'function');
  assert.equal(typeof wordEditor.normalizeListStyleType, 'function');
  assert.equal(typeof wordEditor.isTrackChangesActive, 'function');
  assert.equal(typeof wordEditor.resolveTrackChangeAuthor, 'function');
  assert.equal(typeof wordEditor.createTrackMarkAttrs, 'function');
  assert.equal(typeof wordEditor.resolveTrackDeleteRange, 'function');
  assert.equal(typeof wordEditor.applyTrackedInsert, 'function');
  assert.equal(typeof wordEditor.applyTrackedDelete, 'function');
  assert.equal(typeof wordEditor.resolvePastedPlainText, 'function');
  assert.equal(typeof wordEditor.applyTrackedPaste, 'function');
});

test('track change helpers derive enablement and build attrs safely', () => {
  assert.equal(wordEditor.isTrackChangesActive({ isTrackChangesEnabled(){ return true; } }), true);
  assert.equal(wordEditor.isTrackChangesActive({ isTrackChangesEnabled(){ return false; } }), false);
  assert.equal(wordEditor.resolveTrackChangeAuthor({ getTrackChangeAuthor(){ return 'tester'; } }), 'tester');
  const attrs = wordEditor.createTrackMarkAttrs({ getTrackChangeAuthor(){ return 'tester'; } });
  assert.equal(attrs['data-track-author'], 'tester');
  assert.ok(Number(attrs['data-track-ts']) > 0);
});

test('resolveTrackDeleteRange handles selection, backspace and delete paths', () => {
  const stateWithSelection = {
    selection: { from:3, to:7 },
    doc: { content:{ size:12 } }
  };
  assert.deepEqual(wordEditor.resolveTrackDeleteRange(stateWithSelection, 'Backspace'), { from:3, to:7 });

  const stateCollapsed = {
    selection: { from:5, to:5 },
    doc: { content:{ size:12 } }
  };
  assert.deepEqual(wordEditor.resolveTrackDeleteRange(stateCollapsed, 'Backspace'), { from:4, to:5 });
  assert.deepEqual(wordEditor.resolveTrackDeleteRange(stateCollapsed, 'Delete'), { from:5, to:6 });
});

test('applyTrackedInsert and applyTrackedDelete dispatch marked transactions', () => {
  const insertType = { create(attrs){ return { type:'insert', attrs }; } };
  const deleteType = { create(attrs){ return { type:'delete', attrs }; } };
  const ops = [];
  const tr = {
    insertText(text, from, to){ ops.push(['insertText', text, from, to]); return this; },
    addMark(from, to, mark){ ops.push(['addMark', from, to, mark.type]); return this; },
    setSelection(){ ops.push(['setSelection']); return this; },
    scrollIntoView(){ ops.push(['scrollIntoView']); return this; },
    doc: { resolve(){ return {}; } }
  };
  const view = {
    state: {
      schema: { marks: { trackInsert:insertType, trackDelete:deleteType } },
      tr,
      selection: {
        from:4,
        to:4,
        constructor: { near(){ return {}; } }
      },
      doc: {
        textBetween(){ return 'x'; },
        nodesBetween(_from, _to, cb){
          cb({ isText:true, marks:[], nodeSize:1 }, 3);
        },
        content:{ size:12 }
      }
    },
    dispatch(){ ops.push(['dispatch']); }
  };

  assert.equal(wordEditor.applyTrackedInsert(view, 4, 4, 'a', { getTrackChangeAuthor(){ return 'qa'; } }), true);
  assert.equal(wordEditor.applyTrackedDelete(view, 'Backspace', { getTrackChangeAuthor(){ return 'qa'; } }), true);
  assert.deepEqual(ops.map((item) => item[0]), [
    'insertText', 'addMark', 'scrollIntoView', 'dispatch',
    'addMark', 'setSelection', 'scrollIntoView', 'dispatch'
  ]);
});

test('applyTrackedDelete marks remaining unmarked text when selection is partially tracked', () => {
  const deleteType = { create(attrs){ return { type:'delete', attrs }; } };
  const ops = [];
  const tr = {
    addMark(from, to, mark){ ops.push(['addMark', from, to, mark.type]); return this; },
    setSelection(){ ops.push(['setSelection']); return this; },
    scrollIntoView(){ ops.push(['scrollIntoView']); return this; },
    doc: { resolve(){ return {}; } }
  };
  const view = {
    state: {
      schema: { marks: { trackDelete:deleteType } },
      tr,
      selection: {
        from:3,
        to:7,
        constructor: { near(){ return {}; } }
      },
      doc: {
        textBetween(){ return 'test'; },
        nodesBetween(_from, _to, cb){
          cb({ isText:true, marks:[{ type:deleteType }], nodeSize:2 }, 3);
          cb({ isText:true, marks:[], nodeSize:2 }, 5);
        },
        content:{ size:16 }
      }
    },
    dispatch(){ ops.push(['dispatch']); }
  };

  assert.equal(wordEditor.applyTrackedDelete(view, 'Delete', { getTrackChangeAuthor(){ return 'qa'; } }), true);
  assert.deepEqual(ops.map((item) => item[0]), ['addMark', 'setSelection', 'scrollIntoView', 'dispatch']);
});

test('applyTrackedDelete is a no-op when selected text is already fully tracked delete', () => {
  const deleteType = { create(attrs){ return { type:'delete', attrs }; } };
  const ops = [];
  const tr = {
    addMark(from, to, mark){ ops.push(['addMark', from, to, mark.type]); return this; },
    setSelection(){ ops.push(['setSelection']); return this; },
    scrollIntoView(){ ops.push(['scrollIntoView']); return this; },
    doc: { resolve(){ return {}; } }
  };
  const view = {
    state: {
      schema: { marks: { trackDelete:deleteType } },
      tr,
      selection: {
        from:3,
        to:7,
        constructor: { near(){ return {}; } }
      },
      doc: {
        textBetween(){ return 'test'; },
        nodesBetween(_from, _to, cb){
          cb({ isText:true, marks:[{ type:deleteType }], nodeSize:2 }, 3);
          cb({ isText:true, marks:[{ type:deleteType }], nodeSize:2 }, 5);
        },
        content:{ size:16 }
      }
    },
    dispatch(){ ops.push(['dispatch']); }
  };

  assert.equal(wordEditor.applyTrackedDelete(view, 'Delete', { getTrackChangeAuthor(){ return 'qa'; } }), true);
  assert.deepEqual(ops, []);
});

test('resolvePastedPlainText prefers plain text and normalizes whitespace', () => {
  const value = wordEditor.resolvePastedPlainText('Satir 1\r\nSatir 2', '<p>Ignore</p>');
  assert.equal(value, 'Satir 1\nSatir 2');
});

test('resolvePastedPlainText can fall back to html content', () => {
  const value = wordEditor.resolvePastedPlainText('', '<p>A</p><p>B</p>');
  assert.match(value, /A/);
  assert.match(value, /B/);
});

test('applyTrackedPaste marks replacement as track change when mode is enabled', () => {
  const insertType = { create(attrs){ return { type:'insert', attrs }; } };
  const deleteType = { create(attrs){ return { type:'delete', attrs }; } };
  const ops = [];
  let prevented = false;
  const tr = {
    addMark(from, to, mark){ ops.push(['addMark', from, to, mark.type]); return this; },
    insertText(text, from){ ops.push(['insertText', text, from]); return this; },
    setSelection(){ ops.push(['setSelection']); return this; },
    scrollIntoView(){ ops.push(['scrollIntoView']); return this; },
    doc: { resolve(){ return {}; } }
  };
  const view = {
    state: {
      schema: { marks: { trackInsert:insertType, trackDelete:deleteType } },
      tr,
      selection: { from:2, to:4, constructor:{ near(){ return {}; } } },
      doc: {
        nodesBetween(_from, _to, cb){
          cb({ isText:true, marks:[], nodeSize:2 }, 2);
        }
      }
    },
    dispatch(){ ops.push(['dispatch']); }
  };
  const event = {
    clipboardData: {
      getData(type){
        if(type === 'text/plain') return 'YENI';
        if(type === 'text/html') return '<p>YENI</p>';
        return '';
      }
    },
    preventDefault(){ prevented = true; }
  };

  const handled = wordEditor.applyTrackedPaste(view, event, {
    isTrackChangesEnabled(){ return true; },
    getTrackChangeAuthor(){ return 'qa'; }
  });
  assert.equal(handled, true);
  assert.equal(prevented, true);
  assert.deepEqual(ops.map((item) => item[0]), [
    'addMark', 'insertText', 'addMark', 'setSelection', 'scrollIntoView', 'dispatch'
  ]);
});

test('applyTrackedPaste is ignored when track mode is disabled', () => {
  const handled = wordEditor.applyTrackedPaste({}, {
    clipboardData:{ getData(){ return 'x'; } },
    preventDefault(){}
  }, {
    isTrackChangesEnabled(){ return false; }
  });
  assert.equal(handled, false);
});

test('applyTrackedInsert keeps replaced text as delete-marked and inserts new text as insert-marked', () => {
  const insertType = { create(attrs){ return { type:'insert', attrs }; } };
  const deleteType = { create(attrs){ return { type:'delete', attrs }; } };
  const ops = [];
  const tr = {
    insertText(text, from){ ops.push(['insertText', text, from]); return this; },
    addMark(from, to, mark){ ops.push(['addMark', from, to, mark.type]); return this; },
    setSelection(){ ops.push(['setSelection']); return this; },
    scrollIntoView(){ ops.push(['scrollIntoView']); return this; },
    doc: { resolve(){ return {}; } }
  };
  const view = {
    state: {
      schema: { marks: { trackInsert:insertType, trackDelete:deleteType } },
      tr,
      selection: {
        from:2,
        to:5,
        constructor: { near(){ return {}; } }
      },
      doc: {
        nodesBetween(_from, _to, cb){
          cb({ isText:true, marks:[], nodeSize:3 }, 2);
        }
      }
    },
    dispatch(){ ops.push(['dispatch']); }
  };

  assert.equal(
    wordEditor.applyTrackedInsert(view, 2, 5, 'new', { getTrackChangeAuthor(){ return 'qa'; } }),
    true
  );
  assert.deepEqual(ops.map((item) => item[0]), [
    'addMark',
    'insertText',
    'addMark',
    'setSelection',
    'scrollIntoView',
    'dispatch'
  ]);
  assert.deepEqual(ops[0], ['addMark', 2, 5, 'delete']);
  assert.deepEqual(ops[1], ['insertText', 'new', 5]);
});

test('normalizeListStyleType keeps safe defaults for old documents', () => {
  assert.equal(wordEditor.normalizeListStyleType('bulletList', ''), null);
  assert.equal(wordEditor.normalizeListStyleType('bulletList', 'disc'), 'disc');
  assert.equal(wordEditor.normalizeListStyleType('bulletList', 'bogus'), null);
  assert.equal(wordEditor.normalizeListStyleType('orderedList', ''), null);
  assert.equal(wordEditor.normalizeListStyleType('orderedList', 'lower-alpha'), 'lower-alpha');
  assert.equal(wordEditor.normalizeListStyleType('orderedList', 'bogus'), null);
});

test('list style attrs parse and render explicit styles only', () => {
  assert.equal(wordEditor.parseListStyleTypeFromElement('orderedList', {
    getAttribute(name){
      if(name === 'data-list-style') return '';
      if(name === 'type') return 'a';
      return '';
    },
    style:{ listStyleType:'' }
  }), 'lower-alpha');

  assert.deepEqual(
    wordEditor.renderListStyleTypeAttrs('bulletList', 'circle'),
    { 'data-list-style':'circle', style:'list-style-type:circle' }
  );
  assert.deepEqual(
    wordEditor.renderListStyleTypeAttrs('orderedList', 'lower-roman'),
    { 'data-list-style':'lower-roman', style:'list-style-type:lower-roman', type:'i' }
  );
  assert.deepEqual(wordEditor.renderListStyleTypeAttrs('orderedList', ''), {});
});

test('list style round-trips preserve bullet and ordered variants', () => {
  const bulletStyles = ['disc','circle','square'];
  bulletStyles.forEach((style) => {
    const rendered = wordEditor.renderListStyleTypeAttrs('bulletList', style);
    assert.equal(rendered['data-list-style'], style);
    const parsed = wordEditor.parseListStyleTypeFromElement('bulletList', {
      getAttribute(name){ return name === 'data-list-style' ? style : ''; },
      style:{ listStyleType:'' }
    });
    assert.equal(parsed, style);
  });

  const orderedStyles = ['decimal','lower-alpha','lower-roman','upper-alpha','upper-roman'];
  const typeMap = { 'decimal':null, 'lower-alpha':'a', 'lower-roman':'i', 'upper-alpha':'A', 'upper-roman':'I' };
  orderedStyles.forEach((style) => {
    const rendered = wordEditor.renderListStyleTypeAttrs('orderedList', style);
    assert.equal(rendered['data-list-style'], style);
    if(typeMap[style]) assert.equal(rendered.type, typeMap[style]);
    const parsed = wordEditor.parseListStyleTypeFromElement('orderedList', {
      getAttribute(name){ return name === 'data-list-style' ? style : ''; },
      style:{ listStyleType:'' }
    });
    assert.equal(parsed, style);
  });
});

test('parseListStyleTypeFromElement falls back to inline list-style-type', () => {
  const el = {
    getAttribute(name){ return name === 'data-list-style' ? '' : ''; },
    style:{ listStyleType:'upper-roman' }
  };
  assert.equal(wordEditor.parseListStyleTypeFromElement('orderedList', el), 'upper-roman');
});

// ---------------------------------------------------------------------------
// Phase 3: list keymap behaviors — Enter, Tab, Shift+Tab, Backspace.
// These tests verify that handleWordListEnter/Tab/Backspace route through
// existing TipTap list commands without inventing a parallel command path.
// ---------------------------------------------------------------------------

function makeListEditor(opts){
  opts = opts || {};
  const inList = opts.inList !== false;
  const empty = !!opts.empty;
  const parentOffset = opts.parentOffset == null ? 0 : opts.parentOffset;
  const results = opts.results || {};
  const calls = [];
  const listItemNode = inList ? { type:{ name:'listItem' }, textContent: empty ? '' : 'hello' } : null;
  const listNode = inList ? { type:{ name:'bulletList' } } : null;
  const docNode = { type:{ name:'doc' } };
  const nodesByDepth = inList ? [docNode, listNode, listItemNode] : [docNode];
  const depth = nodesByDepth.length - 1;

  function chain(){
    const proxy = {
      focus(){ calls.push(['chain.focus']); return proxy; },
      liftListItem(arg){ calls.push(['chain.liftListItem', arg]); return proxy; },
      sinkListItem(arg){ calls.push(['chain.sinkListItem', arg]); return proxy; },
      splitListItem(arg){ calls.push(['chain.splitListItem', arg]); return proxy; },
      clearNodes(){ calls.push(['chain.clearNodes']); return proxy; },
      run(){ calls.push(['chain.run']); return results.chainRun !== false; }
    };
    return proxy;
  }

  const editor = {
    isActive(name){
      calls.push(['isActive', name]);
      return inList && (name === 'bulletList' || name === 'listItem');
    },
    state:{
      selection:{
        from:1,
        to:1,
        $from:{
          depth,
          parentOffset,
          node(d){ return nodesByDepth[d] || null; }
        }
      }
    },
    commands:{
      liftListItem(arg){ calls.push(['commands.liftListItem', arg]); return !!results.liftListItem; },
      sinkListItem(arg){ calls.push(['commands.sinkListItem', arg]); return !!results.sinkListItem; },
      splitListItem(arg){ calls.push(['commands.splitListItem', arg]); return !!results.splitListItem; },
      clearNodes(){ calls.push(['commands.clearNodes']); return !!results.clearNodes; }
    },
    chain
  };
  return { editor, calls };
}

test('handleWordListEnter returns false outside list context', () => {
  const { editor, calls } = makeListEditor({ inList:false });
  assert.equal(wordEditor.handleWordListEnter(editor), false);
  // No list commands invoked when not in a list.
  assert.equal(calls.some(c => String(c[0]).indexOf('ListItem') >= 0 || String(c[0]).indexOf('listItem') >= 0), false);
});

test('handleWordListEnter splits a non-empty list item via existing command', () => {
  const { editor, calls } = makeListEditor({ inList:true, empty:false, results:{ splitListItem:true } });
  assert.equal(wordEditor.handleWordListEnter(editor), true);
  assert.deepEqual(calls.find(c => c[0] === 'commands.splitListItem'), ['commands.splitListItem', 'listItem']);
  // Must not lift or clear when the item still has content.
  assert.equal(calls.some(c => c[0] === 'commands.liftListItem'), false);
});

test('handleWordListEnter lifts an empty list item instead of inserting a new one', () => {
  const { editor, calls } = makeListEditor({ inList:true, empty:true, results:{ liftListItem:true } });
  assert.equal(wordEditor.handleWordListEnter(editor), true);
  assert.deepEqual(calls.find(c => c[0] === 'commands.liftListItem'), ['commands.liftListItem', 'listItem']);
  // Empty item must never reach splitListItem — that would keep the user trapped in the list.
  assert.equal(calls.some(c => c[0] === 'commands.splitListItem'), false);
});

test('handleWordListTab sinks the current item when Tab is pressed forward', () => {
  const { editor, calls } = makeListEditor({ inList:true, empty:false, results:{ sinkListItem:true } });
  assert.equal(wordEditor.handleWordListTab(editor, false), true);
  assert.deepEqual(calls.find(c => c[0] === 'commands.sinkListItem'), ['commands.sinkListItem', 'listItem']);
  assert.equal(calls.some(c => c[0] === 'commands.liftListItem'), false);
});

test('handleWordListTab lifts the current item when Shift+Tab is pressed', () => {
  const { editor, calls } = makeListEditor({ inList:true, empty:false, results:{ liftListItem:true } });
  assert.equal(wordEditor.handleWordListTab(editor, true), true);
  assert.deepEqual(calls.find(c => c[0] === 'commands.liftListItem'), ['commands.liftListItem', 'listItem']);
  assert.equal(calls.some(c => c[0] === 'commands.sinkListItem'), false);
});

test('handleWordListTab refuses to act outside list context', () => {
  const { editor, calls } = makeListEditor({ inList:false });
  assert.equal(wordEditor.handleWordListTab(editor, false), false);
  assert.equal(wordEditor.handleWordListTab(editor, true), false);
  assert.equal(calls.some(c => c[0] === 'commands.sinkListItem' || c[0] === 'commands.liftListItem'), false);
});

test('handleWordListBackspace lifts only at the start of an empty list item', () => {
  const empty = makeListEditor({ inList:true, empty:true, parentOffset:0, results:{ liftListItem:true } });
  assert.equal(wordEditor.handleWordListBackspace(empty.editor), true);
  assert.ok(empty.calls.some(c => c[0] === 'commands.liftListItem'));

  const nonEmpty = makeListEditor({ inList:true, empty:false, parentOffset:0 });
  assert.equal(wordEditor.handleWordListBackspace(nonEmpty.editor), false);
  assert.equal(nonEmpty.calls.some(c => c[0] === 'commands.liftListItem'), false);

  const midCursor = makeListEditor({ inList:true, empty:true, parentOffset:3 });
  assert.equal(wordEditor.handleWordListBackspace(midCursor.editor), false);
  assert.equal(midCursor.calls.some(c => c[0] === 'commands.liftListItem'), false);

  const outside = makeListEditor({ inList:false });
  assert.equal(wordEditor.handleWordListBackspace(outside.editor), false);
});

test('isListContextActive honors editor.isActive signals', () => {
  const { editor } = makeListEditor({ inList:true });
  assert.equal(wordEditor.isListContextActive(editor), true);
  const { editor:outside } = makeListEditor({ inList:false });
  assert.equal(wordEditor.isListContextActive(outside), false);
});

test('isCurrentListItemEmpty reports empty list items only when text is blank', () => {
  const { editor:empty } = makeListEditor({ inList:true, empty:true });
  assert.equal(wordEditor.isCurrentListItemEmpty(empty), true);
  const { editor:full } = makeListEditor({ inList:true, empty:false });
  assert.equal(wordEditor.isCurrentListItemEmpty(full), false);
  const { editor:outside } = makeListEditor({ inList:false });
  assert.equal(wordEditor.isCurrentListItemEmpty(outside), false);
});

// ---------------------------------------------------------------------------
// Phase 3: old document compatibility.
// Documents authored before list-style metadata existed must still open safely
// and not gain fabricated style attributes on load.
// ---------------------------------------------------------------------------

test('parseListStyleTypeFromElement returns null when old <ul>/<ol> has no metadata', () => {
  const bareUl = {
    getAttribute(name){ return name === 'data-list-style' ? '' : ''; },
    style:{ listStyleType:'' }
  };
  assert.equal(wordEditor.parseListStyleTypeFromElement('bulletList', bareUl), null);

  const bareOl = {
    getAttribute(name){ return name === 'data-list-style' ? null : null; },
    style:{ listStyleType:'' }
  };
  assert.equal(wordEditor.parseListStyleTypeFromElement('orderedList', bareOl), null);
});

test('renderListStyleTypeAttrs emits no attributes for missing or unknown styles', () => {
  // Empty, null, undefined, and unknown values should all collapse to an empty
  // attribute bag so we never write fabricated style metadata onto DOM nodes
  // that originated from old documents.
  assert.deepEqual(wordEditor.renderListStyleTypeAttrs('bulletList', ''), {});
  assert.deepEqual(wordEditor.renderListStyleTypeAttrs('bulletList', null), {});
  assert.deepEqual(wordEditor.renderListStyleTypeAttrs('bulletList', undefined), {});
  assert.deepEqual(wordEditor.renderListStyleTypeAttrs('bulletList', 'bogus'), {});
  assert.deepEqual(wordEditor.renderListStyleTypeAttrs('orderedList', 'lowerroman'), {});
  // Unknown list type: also safe no-op (no accidental data-list-style stamps).
  assert.deepEqual(wordEditor.renderListStyleTypeAttrs('mysteryList', 'disc'), {});
});

test('parseListStyleTypeFromElement rejects unknown list-style-type values on old docs', () => {
  // Inline style that looks almost-right but is not in the allowed bullet set
  // must be ignored rather than smuggled through as a made-up style.
  const el = {
    getAttribute(name){ return name === 'data-list-style' ? '' : ''; },
    style:{ listStyleType:'hebrew' }
  };
  assert.equal(wordEditor.parseListStyleTypeFromElement('bulletList', el), null);
});
