const assert = require('node:assert/strict');
const test = require('node:test');

const commands = require('../src/tiptap-word-commands.js');

test('tiptap word commands exports core builders and helpers', () => {
  assert.equal(typeof commands.buildAbstractHTML, 'function');
  assert.equal(typeof commands.buildBlockquoteHTML, 'function');
  assert.equal(typeof commands.buildFigureHTML, 'function');
  assert.equal(typeof commands.buildTableHTML, 'function');
  assert.equal(typeof commands.PARAGRAPH_STYLES, 'object');
  assert.equal(typeof commands.applyParagraphStyle, 'function');
  assert.equal(typeof commands.getActiveParagraphStyle, 'function');
  assert.equal(typeof commands.syncCommandUI, 'function');
  assert.equal(typeof commands.execCommand, 'function');
  assert.equal(typeof commands.execEditorCommand, 'function');
  assert.equal(typeof commands.runEditorCommand, 'function');
  assert.equal(typeof commands.applyCommand, 'function');
  assert.equal(typeof commands.execFontSize, 'function');
  assert.equal(typeof commands.applyFontSize, 'function');
  assert.equal(typeof commands.applyFontSizeDom, 'function');
  assert.equal(typeof commands.runFontSize, 'function');
  assert.equal(typeof commands.transformText, 'function');
  assert.equal(typeof commands.execTextTransform, 'function');
  assert.equal(typeof commands.execTextTransformWithEffects, 'function');
  assert.equal(typeof commands.runTextTransform, 'function');
  assert.equal(typeof commands.execLineSpacing, 'function');
  assert.equal(typeof commands.execLineSpacingWithEffects, 'function');
  assert.equal(typeof commands.runLineSpacing, 'function');
  assert.equal(typeof commands.applyLineSpacing, 'function');
  assert.equal(typeof commands.ensureTrackChangesState, 'function');
  assert.equal(typeof commands.isTrackChangesEnabled, 'function');
  assert.equal(typeof commands.setTrackChangesEnabled, 'function');
  assert.equal(typeof commands.collectMarkRanges, 'function');
  assert.equal(typeof commands.acceptTrackChanges, 'function');
  assert.equal(typeof commands.rejectTrackChanges, 'function');
  assert.equal(typeof commands.summarizeTrackChanges, 'function');
  assert.equal(typeof commands.collectTrackChangeRanges, 'function');
  assert.equal(typeof commands.focusTrackChange, 'function');
  assert.equal(typeof commands.acceptCurrentTrackChange, 'function');
  assert.equal(typeof commands.rejectCurrentTrackChange, 'function');
});

test('track changes state toggles safely and can be controlled without editor', () => {
  const initial = commands.setTrackChangesEnabled(false, { source:'test' });
  assert.equal(initial, false);
  assert.equal(commands.isTrackChangesEnabled(), false);

  assert.equal(commands.applyCommand(null, 'toggleTrackChanges', true), true);
  assert.equal(commands.isTrackChangesEnabled(), true);

  const toggled = commands.setTrackChangesEnabled(null, { source:'test' });
  assert.equal(toggled, false);
  assert.equal(commands.isTrackChangesEnabled(), false);
});

test('collectMarkRanges merges contiguous marked text runs', () => {
  const insertType = { name:'trackInsert' };
  const ranges = commands.collectMarkRanges({
    schema: { marks: { trackInsert:insertType } },
    doc: {
      content: { size:9 },
      nodesBetween(_from, _to, cb){
        cb({ isText:true, nodeSize:2, marks:[{ type:insertType }] }, 1);
        cb({ isText:true, nodeSize:2, marks:[{ type:insertType }] }, 3);
        cb({ isText:true, nodeSize:1, marks:[] }, 5);
        cb({ isText:true, nodeSize:2, marks:[{ type:insertType }] }, 6);
      }
    }
  }, 'trackInsert');

  assert.deepEqual(ranges, [{ from:1, to:5 }, { from:6, to:8 }]);
});

test('accept/reject tracked changes mutate marks and text in the expected order', () => {
  const insertType = { name:'trackInsert' };
  const deleteType = { name:'trackDelete' };

  function makeEditor(){
    const ops = [];
    const tr = {
      steps: [],
      mapping: { map(value){ return value; } },
      delete(from, to){ ops.push(['delete', from, to]); this.steps.push(['delete', from, to]); return this; },
      removeMark(from, to, type){ ops.push(['removeMark', from, to, type.name]); this.steps.push(['removeMark', from, to, type.name]); return this; },
      scrollIntoView(){ ops.push(['scrollIntoView']); return this; }
    };
    const editor = {
      chain(){ return { focus(){ return this; } }; },
      state: {
        schema: { marks: { trackInsert:insertType, trackDelete:deleteType } },
        selection: { from:1, to:1 },
        doc: {
          content: { size:8 },
          nodesBetween(_from, _to, cb){
            cb({ isText:true, nodeSize:2, marks:[{ type:deleteType }] }, 0);
            cb({ isText:true, nodeSize:2, marks:[{ type:insertType }] }, 3);
          }
        },
        tr
      },
      view: {
        dispatch(){ ops.push(['dispatch']); }
      }
    };
    return { editor, ops };
  }

  const accepted = makeEditor();
  assert.equal(commands.applyCommand(accepted.editor, 'acceptTrackChanges'), true);
  assert.deepEqual(accepted.ops, [
    ['delete', 0, 2],
    ['removeMark', 3, 5, 'trackInsert'],
    ['removeMark', 0, 2, 'trackDelete'],
    ['scrollIntoView'],
    ['dispatch']
  ]);

  const rejected = makeEditor();
  assert.equal(commands.applyCommand(rejected.editor, 'rejectTrackChanges'), true);
  assert.deepEqual(rejected.ops, [
    ['delete', 3, 5],
    ['removeMark', 0, 2, 'trackDelete'],
    ['removeMark', 3, 5, 'trackInsert'],
    ['scrollIntoView'],
    ['dispatch']
  ]);
});

test('summarizeTrackChanges reports suggestion counts and char spans', () => {
  const insertType = { name:'trackInsert' };
  const deleteType = { name:'trackDelete' };
  const summary = commands.summarizeTrackChanges({
    state: {
      schema: { marks: { trackInsert:insertType, trackDelete:deleteType } },
      doc: {
        content: { size:12 },
        nodesBetween(_from, _to, cb){
          cb({ isText:true, nodeSize:3, marks:[{ type:insertType }] }, 1);  // 1..4
          cb({ isText:true, nodeSize:2, marks:[{ type:deleteType }] }, 6);  // 6..8
          cb({ isText:true, nodeSize:1, marks:[{ type:insertType }] }, 10); // 10..11
        }
      }
    }
  });
  assert.deepEqual(summary, {
    insertCount: 2,
    deleteCount: 1,
    total: 3,
    insertChars: 4,
    deleteChars: 2
  });
});

test('focusTrackChange navigates suggestions and wraps safely', () => {
  const insertType = { name:'trackInsert' };
  const deleteType = { name:'trackDelete' };
  const calls = [];
  const editor = {
    state: {
      selection: { from:4, to:4 },
      schema: { marks: { trackInsert:insertType, trackDelete:deleteType } },
      doc: {
        content: { size:20 },
        nodesBetween(_from, _to, cb){
          cb({ isText:true, nodeSize:2, marks:[{ type:insertType }] }, 2);  // 2..4
          cb({ isText:true, nodeSize:2, marks:[{ type:deleteType }] }, 8);  // 8..10
        }
      }
    },
    chain(){
      return {
        focus(){ calls.push('focus'); return this; },
        setTextSelection(range){ calls.push(['sel', range]); return this; },
        run(){ calls.push('run'); return true; }
      };
    }
  };
  assert.equal(commands.focusTrackChange(editor, 1), true);
  editor.state.selection = { from:9, to:9 };
  assert.equal(commands.focusTrackChange(editor, -1), true);
  assert.deepEqual(calls, [
    'focus', ['sel', { from:8, to:10 }], 'run',
    'focus', ['sel', { from:2, to:4 }], 'run'
  ]);
});

test('acceptCurrentTrackChange and rejectCurrentTrackChange apply decisions by mark kind', () => {
  const insertType = { name:'trackInsert' };
  const deleteType = { name:'trackDelete' };
  function makeEditor(selectionFrom){
    const ops = [];
    const tr = {
      steps: [],
      delete(from, to){ ops.push(['delete', from, to]); this.steps.push(['delete']); return this; },
      removeMark(from, to, mark){ ops.push(['removeMark', from, to, mark.name]); this.steps.push(['removeMark']); return this; },
      scrollIntoView(){ ops.push(['scroll']); return this; }
    };
    return {
      editor: {
        state: {
          selection: { from:selectionFrom, to:selectionFrom },
          tr,
          schema: { marks: { trackInsert:insertType, trackDelete:deleteType } },
          doc: {
            content: { size:16 },
            nodesBetween(_from, _to, cb){
              cb({ isText:true, nodeSize:3, marks:[{ type:insertType }] }, 1); // 1..4
              cb({ isText:true, nodeSize:2, marks:[{ type:deleteType }] }, 8); // 8..10
            }
          }
        },
        view: { dispatch(){ ops.push(['dispatch']); } }
      },
      ops
    };
  }

  const onInsert = makeEditor(2);
  assert.equal(commands.acceptCurrentTrackChange(onInsert.editor), true);
  assert.deepEqual(onInsert.ops, [
    ['removeMark', 1, 4, 'trackInsert'],
    ['scroll'],
    ['dispatch']
  ]);

  const onDelete = makeEditor(9);
  assert.equal(commands.rejectCurrentTrackChange(onDelete.editor), true);
  assert.deepEqual(onDelete.ops, [
    ['removeMark', 8, 10, 'trackDelete'],
    ['scroll'],
    ['dispatch']
  ]);
});

test('applyParagraphStyle and getActiveParagraphStyle keep style-first flow stable', () => {
  const calls = [];
  const editor = {
    isActive(type, attrs){
      if(type === 'heading' && attrs && attrs.level === 2) return true;
      return false;
    },
    chain(){
      return {
        focus(){ calls.push('focus'); return this; },
        setHeading(args){ calls.push(['setHeading', args]); return this; },
        setParagraph(){ calls.push('setParagraph'); return this; },
        updateAttributes(name, attrs){ calls.push(['updateAttributes', name, attrs]); return this; },
        run(){ calls.push('run'); return true; }
      };
    }
  };
  assert.equal(commands.applyParagraphStyle(editor, 'heading2'), true);
  assert.equal(commands.getActiveParagraphStyle(editor), 'heading2');
  assert.equal(commands.applyParagraphStyle(editor, 'normal'), true);
  assert.deepEqual(calls, [
    'focus',
    ['setHeading', { level:2 }],
    ['updateAttributes', 'heading', { textAlign:'left', style:'text-align:left !important;text-indent:0' }],
    'run',
    'focus',
    'setParagraph',
    ['updateAttributes', 'paragraph', { indentMode:'first-line' }],
    'run'
  ]);
});

test('applyParagraphStyle applies semantic block styles (abstract, keywords, referenceEntry)', () => {
  const calls = [];
  const state = { attrs: { class:'' } };
  const editor = {
    isActive(){ return false; },
    getAttributes(){ return state.attrs; },
    chain(){
      return {
        focus(){ calls.push('focus'); return this; },
        setParagraph(){ calls.push('setParagraph'); return this; },
        updateAttributes(name, attrs){
          calls.push(['updateAttributes', name, attrs]);
          if(attrs && attrs.class) state.attrs = { class: attrs.class };
          return this;
        },
        run(){ calls.push('run'); return true; }
      };
    }
  };
  assert.equal(commands.applyParagraphStyle(editor, 'abstract'), true);
  assert.equal(commands.applyParagraphStyle(editor, 'keywords'), true);
  assert.equal(commands.applyParagraphStyle(editor, 'referenceEntry'), true);
  assert.equal(commands.applyParagraphStyle(editor, 'tableFigureLabel'), true);
  assert.equal(commands.applyParagraphStyle(editor, 'nonexistent'), false);

  const setParagraphCount = calls.filter(c => c === 'setParagraph').length;
  assert.equal(setParagraphCount, 4);

  const updateCalls = calls.filter(c => Array.isArray(c) && c[0] === 'updateAttributes');
  const classes = updateCalls.map(c => c[2] && c[2].class).filter(Boolean);
  assert.ok(classes.includes('aq-abstract'));
  assert.ok(classes.includes('aq-keywords'));
  assert.ok(classes.includes('aq-ref-entry'));
  assert.ok(classes.includes('aq-table-label'));

  // Abstract uses indent-none, others first-line
  const absAttrs = updateCalls.find(c => c[2] && c[2].class === 'aq-abstract')[2];
  assert.equal(absAttrs.indentMode, 'none');
  const kwAttrs = updateCalls.find(c => c[2] && c[2].class === 'aq-keywords')[2];
  assert.equal(kwAttrs.indentMode, 'first-line');
});

test('getActiveParagraphStyle detects semantic block classes from paragraph attrs', () => {
  function makeEditor(cls){
    return {
      isActive(){ return false; },
      getAttributes(name){
        if(name === 'paragraph') return { class: cls };
        return {};
      }
    };
  }
  assert.equal(commands.getActiveParagraphStyle(makeEditor('aq-abstract')), 'abstract');
  assert.equal(commands.getActiveParagraphStyle(makeEditor('aq-keywords')), 'keywords');
  assert.equal(commands.getActiveParagraphStyle(makeEditor('aq-ref-entry')), 'referenceEntry');
  assert.equal(commands.getActiveParagraphStyle(makeEditor('aq-table-title')), 'tableFigureTitle');
  assert.equal(commands.getActiveParagraphStyle(makeEditor('aq-table-label')), 'tableFigureLabel');
  assert.equal(commands.getActiveParagraphStyle(makeEditor('')), 'normal');
});

test('PARAGRAPH_STYLES includes APA semantic block styles', () => {
  const ids = Object.keys(commands.PARAGRAPH_STYLES);
  ['abstract', 'keywords', 'referenceEntry', 'tableFigureLabel', 'tableFigureTitle'].forEach(id => {
    assert.ok(ids.includes(id), 'PARAGRAPH_STYLES should include ' + id);
  });
  assert.equal(commands.PARAGRAPH_STYLES.abstract.blockStyle, 'abstract');
  assert.equal(commands.PARAGRAPH_STYLES.referenceEntry.className, 'aq-ref-entry');
});

test('buildFigureHTML and buildTableHTML include requested values', () => {
  const figure = commands.buildFigureHTML('2', 'Deneme');
  const table = commands.buildTableHTML({ number:'3', cols:2, rows:3, title:'Baslik', note:'Aciklama' });

  assert.match(figure, /Sekil 2|Şekil 2|Åekil 2/);
  assert.match(figure, /Deneme/);
  assert.match(table, /Tablo 3/);
  assert.match(table, /Baslik/);
  assert.match(table, /Aciklama/);
});

test('execCommand, execFontSize and execLineSpacing call onApplied hooks', () => {
  let applied = 0;
  const editor = {
    chain(){
      return {
        focus(){ return this; },
        toggleBold(){ return this; },
        setMark(){ return this; },
        run(){ return true; }
      };
    }
  };
  assert.equal(commands.execCommand({
    editor: editor,
    cmd: 'bold',
    onApplied(){ applied++; }
  }), true);
  assert.equal(commands.execFontSize({
    editor: editor,
    pt: 13,
    onApplied(){ applied++; }
  }), true);
  function mockStyle(){ return { setProperty(){}, removeProperty(){} }; }
  global.window = {
    AQTipTapWordSurface: {
      getHost(){ return { style:mockStyle() }; },
      getEditorDom(){ return { style:mockStyle() }; }
    }
  };
  try{
    assert.equal(commands.execLineSpacing({
      value: '2',
      onApplied(){ applied++; }
    }), '2');
  } finally {
    delete global.window;
  }
  assert.equal(applied, 3);
});

test('applyCommand aligns text through command chain and fallback attrs', () => {
  const chainCalls = [];
  const chainEditor = {
    chain(){
      return {
        focus(){ return this; },
        setTextAlign(value){ chainCalls.push(['align', value]); return this; },
        run(){ return true; }
      };
    }
  };
  assert.equal(commands.applyCommand(chainEditor, 'justifyCenter'), true);
  assert.deepEqual(chainCalls, [['align', 'center']]);

  const fallbackCalls = [];
  const para = { type:{ name:'paragraph' }, attrs:{}, marks:[] };
  const fallbackEditor = {
    chain(){
      return {
        focus(){ return this; },
        run(){ return false; }
      };
    },
    state: {
      selection: { from:1, to:2 },
      tr: {
        doc: {
          nodesBetween(_from, _to, cb){ cb(para, 1); }
        },
        setNodeMarkup(pos, _type, attrs){
          fallbackCalls.push([pos, attrs]);
          return this;
        }
      },
      doc: {
        nodesBetween(_from, _to, cb){ cb(para, 1); }
      }
    },
    view: {
      dispatch(){ fallbackCalls.push('dispatch'); }
    }
  };
  assert.equal(commands.applyCommand(fallbackEditor, 'justifyRight'), true);
  assert.deepEqual(fallbackCalls, [[1, { textAlign:'right', style:'text-align:right !important', 'data-text-align':'right' }], 'dispatch']);
});

test('applyCommand aligns the active block when cursor selection is empty', () => {
  const calls = [];
  const para = { type:{ name:'paragraph' }, attrs:{}, marks:[] };
  const editor = {
    chain(){
      return {
        focus(){ return this; },
        run(){ return false; }
      };
    },
    state: {
      selection: {
        from:2,
        to:2,
        $from: {
          depth:1,
          node(depth){ return depth === 1 ? para : { type:{ name:'doc' } }; },
          before(depth){ return depth === 1 ? 1 : 0; }
        }
      },
      tr: {
        doc: {
          nodesBetween(){ /* Empty cursor selections can skip the parent block. */ }
        },
        setNodeMarkup(pos, _type, attrs){
          calls.push([pos, attrs]);
          return this;
        }
      },
      doc: {
        nodesBetween(){ /* Empty cursor selections can skip the parent block. */ }
      }
    },
    view: {
      dispatch(){ calls.push('dispatch'); }
    }
  };

  assert.equal(commands.applyCommand(editor, 'justifyCenter'), true);
  assert.deepEqual(calls, [[1, { textAlign:'center', style:'text-align:center !important', 'data-text-align':'center' }], 'dispatch']);
});

test('applyCommand indents paragraphs and inserts page breaks safely', () => {
  const calls = [];
  const para = { type:{ name:'paragraph' }, attrs:{ style:'color:red', indentMode:'first-line' }, marks:[] };
  const editor = {
    isActive(){ return false; },
    chain(){
      return {
        focus(){ return this; },
        insertContent(html){ calls.push(['insertContent', html]); return this; },
        run(){ return true; }
      };
    },
    state: {
      selection: { from:1, to:2 },
      tr: {
        doc: {
          nodesBetween(_from, _to, cb){ cb(para, 1); }
        },
        setNodeMarkup(pos, _type, attrs){
          calls.push([pos, attrs]);
          return this;
        }
      },
      doc: {
        nodesBetween(_from, _to, cb){ cb(para, 1); }
      }
    },
    view: {
      dispatch(){ calls.push('dispatch'); }
    }
  };

  assert.equal(commands.applyCommand(editor, 'indent'), true);
  assert.equal(commands.applyCommand(editor, 'insertPageBreak'), true);
  assert.deepEqual(calls[0], [1, { style:'color:red;margin-left:0.5in', indentMode:'none' }]);
  assert.equal(calls[1], 'dispatch');
  assert.match(calls[2][1], /aq-page-break/);
});

test('runFontSize handles both editor and dom fallback paths', () => {
  const calls = [];
  const editorOk = commands.runFontSize({
    editor: {
      chain() {
        return {
          focus() { return this; },
          setMark() { calls.push(['setMark']); return this; },
          run() { calls.push(['run']); return true; }
        };
      }
    },
    pt: 14,
    onMutated(value) {
      calls.push(['mutated-editor', value]);
    }
  });

  const fontNode = { innerHTML: 'abc', parentNode: { replaceChild(node) { calls.push(['replace', node.style.fontSize]); } } };
  const domOk = commands.runFontSize({
    pt: 16,
    host: {
      focus() { calls.push(['focus-host']); },
      querySelectorAll() { return [fontNode]; }
    },
    documentObj: {
      createElement() { return { style: {}, innerHTML: '' }; },
      execCommand(cmd, _showUi, value) { calls.push(['exec', cmd, value]); return true; }
    },
    getSelection() {
      return { isCollapsed: false };
    },
    onMutated(value) {
      calls.push(['mutated-dom', value]);
    }
  });

  assert.equal(editorOk, true);
  assert.equal(domOk, true);
  assert.deepEqual(calls, [
    ['setMark'],
    ['run'],
    ['mutated-editor', 14],
    ['focus-host'],
    ['exec', 'fontSize', '7'],
    ['replace', '16pt'],
    ['mutated-dom', 16]
  ]);
});

test('transformText and execTextTransform apply Turkish casing rules', () => {
  assert.equal(commands.transformText('istanbul \u0131\u015f\u0131\u011f\u0131', 'upper'), '\u0130STANBUL I\u015eI\u011eI');
  assert.equal(commands.transformText('\u0130STANBUL I\u015eI\u011eI', 'lower'), 'istanbul \u0131\u015f\u0131\u011f\u0131');
  assert.equal(commands.transformText('istanbul \u0131\u015f\u0131\u011f\u0131', 'title'), '\u0130stanbul I\u015f\u0131\u011f\u0131');

  const calls = [];
  const editor = {
    state: {
      selection: { from:1, to:5 },
      doc: {
        textBetween(){ return 'istanbul'; }
      }
    },
    chain(){
      return {
        focus(){ return this; },
        insertContentAt(range, text){ calls.push(['insert', range, text]); return this; },
        run(){ calls.push(['run']); return true; }
      };
    }
  };

  const ok = commands.execTextTransform({
    editor: editor,
    mode: 'upper',
    onApplied(){ calls.push(['applied']); }
  });
  assert.equal(ok, true);
  assert.deepEqual(calls, [
    ['insert', { from:1, to:5 }, 'İSTANBUL'],
    ['run'],
    ['applied']
  ]);
});

test('syncCommandUI and execEditorCommand can use fallback sync path', () => {
  const calls = [];
  const editor = {
    chain(){
      return {
        focus(){ return this; },
        toggleBold(){ return this; },
        run(){ return true; }
      };
    }
  };

  const ok = commands.execEditorCommand({
    editor,
    cmd: 'bold',
    onFallback() {
      calls.push('fallback');
    }
  });

  assert.equal(ok, true);
  assert.deepEqual(calls, ['fallback']);
});

test('applyListStyle updates active list style without retoggling list structure', () => {
  const calls = [];
  const listNode = { type:{ name:'bulletList' }, attrs:{}, marks:[] };
  const tr = {
    doc: {
      nodeAt(pos){ return pos === 5 ? listNode : null; }
    },
    setNodeMarkup(pos, _type, attrs){
      calls.push(['setNodeMarkup', pos, attrs]);
      listNode.attrs = attrs;
      return this;
    }
  };
  const editor = {
    isActive(type){ return type === 'bulletList'; },
    state: {
      selection: {
        from: 6,
        to: 6,
        $from: {
          depth: 1,
          node(depth){ return depth === 1 ? listNode : { type:{ name:'doc' } }; },
          before(){ return 5; }
        },
        $to: {
          depth: 1,
          node(depth){ return depth === 1 ? listNode : { type:{ name:'doc' } }; },
          before(){ return 5; }
        }
      },
      doc: {
        nodesBetween(){ /* no-op; collapsed selection ancestor path is enough */ }
      },
      tr
    },
    view: {
      dispatch(nextTr){ calls.push(['dispatch', nextTr === tr]); }
    },
    commands: {
      focus(){ calls.push('focus-command'); return true; }
    },
    chain(){
      return {
        run(){ calls.push('run'); return true; }
      };
    }
  };

  const ok = commands.applyCommand(editor, 'setBulletListStyle', 'circle');
  assert.equal(ok, true);
  assert.deepEqual(calls, [
    'run',
    ['setNodeMarkup', 5, { listStyleType:'circle' }],
    ['dispatch', true]
  ]);
});

test('applyListStyle converts list type safely when needed', () => {
  const calls = [];
  const listNode = { type:{ name:'bulletList' }, attrs:{}, marks:[] };
  const tr = {
    doc: {
      nodeAt(pos){ return pos === 9 ? listNode : null; }
    },
    setNodeMarkup(pos, _type, attrs){
      calls.push(['setNodeMarkup', pos, attrs]);
      listNode.attrs = attrs;
      return this;
    }
  };
  const editor = {
    isActive(type){ return type === 'orderedList'; },
    state: {
      selection: {
        from: 10,
        to: 10,
        $from: {
          depth: 1,
          node(depth){ return depth === 1 ? listNode : { type:{ name:'doc' } }; },
          before(){ return 9; }
        },
        $to: {
          depth: 1,
          node(depth){ return depth === 1 ? listNode : { type:{ name:'doc' } }; },
          before(){ return 9; }
        }
      },
      doc: {
        nodesBetween(){ /* no-op */ }
      },
      tr
    },
    view: {
      dispatch(nextTr){ calls.push(['dispatch', nextTr === tr]); }
    },
    chain(){
      return {
        focus(){ calls.push('focus'); return this; },
        toggleBulletList(){ calls.push('toggleBulletList'); return this; },
        run(){ calls.push('run'); return true; }
      };
    }
  };

  const ok = commands.applyCommand(editor, 'setBulletListStyle', 'square');
  assert.equal(ok, true);
  assert.deepEqual(calls, [
    'focus',
    'toggleBulletList',
    'run',
    ['setNodeMarkup', 9, { listStyleType:'square' }],
    ['dispatch', true]
  ]);
});

test('applyListStyleAtSelection avoids focus resets and updates current selection list', () => {
  const calls = [];
  const editor = {
    isActive(type){ return type === 'orderedList'; },
    state: {
      selection: {
        from: 10,
        to: 10,
        $from: { depth: 0, node(){ return { type:{ name:'doc' } }; } },
        $to: { depth: 0, node(){ return { type:{ name:'doc' } }; } }
      },
      doc: {
        nodesBetween(){ /* no-op */ }
      }
    },
    view: {
      nodeDOM(){ return null; }
    },
    chain(){
      return {
        updateAttributes(name, attrs){ calls.push(['updateAttributes', name, attrs]); return this; },
        run(){ calls.push('run'); return true; }
      };
    }
  };

  const ok = commands.applyListStyleAtSelection(editor, 'orderedList', 'lower-alpha');
  assert.equal(ok, true);
  assert.deepEqual(calls, [
    ['updateAttributes', 'orderedList', { listStyleType:'lower-alpha' }],
    'run'
  ]);
});

test('syncRenderedListStyles mirrors explicit style to live list dom', () => {
  const attrs = {};
  const style = {};
  const editor = {
    state: {
      selection: {
        from: 6,
        to: 6,
        $from: { depth: 0, node(){ return { type:{ name:'doc' } }; } },
        $to: { depth: 0, node(){ return { type:{ name:'doc' } }; } }
      },
      doc: {
        nodesBetween(){ /* no-op */ }
      }
    },
    view: {
      nodeDOM(pos){
        if(pos !== 5) return null;
        return {
          nodeType: 1,
          nodeName: 'OL',
          style,
          setAttribute(name, value){ attrs[name] = value; },
          removeAttribute(name){ delete attrs[name]; }
        };
      }
    }
  };

  const changed = commands.syncRenderedListStyles(editor, 'orderedList', 'lower-alpha', [5]);
  assert.equal(changed, true);
  assert.equal(attrs['data-list-style'], 'lower-alpha');
  assert.equal(attrs.type, 'a');
  assert.equal(style.listStyleType, 'lower-alpha');
});

test('runEditorCommand routes both success and warning paths', () => {
  const calls = [];
  const editor = {
    chain(){
      return {
        focus(){ return this; },
        toggleBold(){ calls.push('bold'); return this; },
        run(){ return true; }
      };
    }
  };

  const ok = commands.runEditorCommand({
    editor,
    cmd: 'bold',
    onFallback() {
      calls.push('sync');
    },
    warn(kind, cmd) {
      calls.push(['warn', kind, cmd]);
    }
  });

  const missing = commands.runEditorCommand({
    cmd: 'bold',
    warn(kind, cmd) {
      calls.push(['warn', kind, cmd]);
    }
  });

  assert.equal(ok, true);
  assert.equal(missing, false);
  assert.deepEqual(calls, [
    'bold',
    'sync',
    ['warn', 'not-ready', 'bold']
  ]);
});

test('execTextTransformWithEffects and execLineSpacingWithEffects run mutation callbacks', () => {
  const calls = [];
  const editor = {
    state: {
      selection: { from:1, to:5 },
      doc: {
        textBetween(){ return 'istanbul'; }
      }
    },
    chain(){
      return {
        focus(){ return this; },
        insertContentAt(){ calls.push('insert'); return this; },
        run(){ calls.push('run'); return true; }
      };
    }
  };

  const transformOk = commands.execTextTransformWithEffects({
    editor,
    mode: 'upper',
    onMutated() {
      calls.push('mutated-text');
    }
  });

  function mockStyle2(){ return { setProperty(){}, removeProperty(){} }; }
  global.window = {
    AQTipTapWordSurface: {
      getHost(){ return { style:mockStyle2() }; },
      getEditorDom(){ return { style:mockStyle2() }; }
    }
  };
  try {
    const spacing = commands.execLineSpacingWithEffects({
      value: '2',
      onMutated(value) {
        calls.push(['mutated-spacing', value]);
      }
    });
    assert.equal(spacing, '2');
  } finally {
    delete global.window;
  }

  assert.equal(transformOk, true);
  assert.deepEqual(calls, [
    'insert',
    'run',
    'mutated-text',
    ['mutated-spacing', '2']
  ]);
});

test('runTextTransform and runLineSpacing delegate through higher-level helpers', () => {
  const calls = [];
  const editor = {
    state: {
      selection: { from:1, to:5 },
      doc: {
        textBetween(){ return 'istanbul'; }
      }
    },
    chain(){
      return {
        focus(){ return this; },
        insertContentAt(range, text){ calls.push(['insert', range, text]); return this; },
        run(){ calls.push('run'); return true; }
      };
    }
  };

  const transformed = commands.runTextTransform({
    editor,
    mode: 'upper',
    onMutated() {
      calls.push('mutated-text');
    }
  });

  function mockStyle3(){ return { setProperty(){}, removeProperty(){} }; }
  global.window = {
    AQTipTapWordSurface: {
      getHost(){ return { style:mockStyle3() }; },
      getEditorDom(){ return { style:mockStyle3() }; }
    }
  };
  try {
    const spaced = commands.runLineSpacing({
      value: '2',
      onMutated(value) {
        calls.push(['mutated-spacing', value]);
      }
    });
    assert.equal(spaced, true);
  } finally {
    delete global.window;
  }

  assert.equal(transformed, true);
  assert.deepEqual(calls, [
    ['insert', { from:1, to:5 }, 'İSTANBUL'],
    'run',
    'mutated-text',
    ['mutated-spacing', '2']
  ]);
});

// ---------------------------------------------------------------------------
// Phase 3: multilevel list template contract.
// Templates must stay routed through existing TipTap list toggles and the
// shared list-style update path — no parallel command path.
// ---------------------------------------------------------------------------

test('getMultiLevelTemplates exposes bullet, number, outline, and mixed templates', () => {
  const tpls = commands.getMultiLevelTemplates();
  assert.equal(tpls.bullet.listType, 'bulletList');
  assert.deepEqual(tpls.bullet.levels, ['disc','circle','square']);
  assert.equal(tpls.number.listType, 'orderedList');
  assert.deepEqual(tpls.number.levels, ['decimal','lower-alpha','lower-roman']);
  assert.equal(tpls.outline.listType, 'orderedList');
  assert.deepEqual(tpls.outline.levels, ['upper-roman','upper-alpha','decimal']);
  assert.equal(tpls.mixed.listType, 'orderedList');
  assert.deepEqual(tpls.mixed.levels, ['decimal','disc','lower-alpha']);
});

test('applyMultiLevelListTemplate rejects unknown templates without touching editor', () => {
  const calls = [];
  const editor = {
    isActive(){ calls.push('isActive'); return true; },
    chain(){ calls.push('chain'); return { focus(){ return this; }, run(){ calls.push('run'); return true; } }; }
  };
  assert.equal(commands.applyMultiLevelListTemplate(editor, 'bogus'), false);
  assert.equal(calls.length, 0);
});

test('applyMultiLevelListTemplate toggles ordered list and stamps first-level style', () => {
  const calls = [];
  const listNode = { type:{ name:'orderedList' }, attrs:{}, marks:[] };
  const tr = {
    doc: { nodeAt(pos){ return pos === 3 ? listNode : null; } },
    setNodeMarkup(pos, _type, attrs){
      calls.push(['setNodeMarkup', pos, attrs]);
      listNode.attrs = attrs;
      return this;
    }
  };
  const editor = {
    isActive(type){ calls.push(['isActive', type]); return false; },
    state: {
      selection: {
        from: 4,
        to: 4,
        $from: {
          depth: 1,
          node(depth){ return depth === 1 ? listNode : { type:{ name:'doc' } }; },
          before(){ return 3; }
        },
        $to: {
          depth: 1,
          node(depth){ return depth === 1 ? listNode : { type:{ name:'doc' } }; },
          before(){ return 3; }
        }
      },
      doc: { nodesBetween(){} },
      tr
    },
    view: { dispatch(nextTr){ calls.push(['dispatch', nextTr === tr]); } },
    chain(){
      return {
        focus(){ calls.push('focus'); return this; },
        toggleOrderedList(){ calls.push('toggleOrderedList'); return this; },
        run(){ calls.push('run'); return true; }
      };
    }
  };

  const ok = commands.applyMultiLevelListTemplate(editor, 'outline');
  assert.equal(ok, true);
  // Must route through existing toggleOrderedList + shared list-style update.
  assert.ok(calls.some(c => c === 'toggleOrderedList'), 'routes through toggleOrderedList');
  assert.ok(calls.some(c => Array.isArray(c) && c[0] === 'setNodeMarkup' && c[2].listStyleType === 'upper-roman'),
    'stamps first level style (upper-roman) on the active list node');
});

test('applyMultiLevelListTemplate skips toggle when the list is already active', () => {
  const calls = [];
  const listNode = { type:{ name:'bulletList' }, attrs:{}, marks:[] };
  const tr = {
    doc: { nodeAt(pos){ return pos === 7 ? listNode : null; } },
    setNodeMarkup(pos, _type, attrs){
      calls.push(['setNodeMarkup', pos, attrs]);
      listNode.attrs = attrs;
      return this;
    }
  };
  const editor = {
    isActive(type){ return type === 'bulletList'; },
    state: {
      selection: {
        from: 8,
        to: 8,
        $from: { depth:1, node(d){ return d === 1 ? listNode : { type:{ name:'doc' } }; }, before(){ return 7; } },
        $to:   { depth:1, node(d){ return d === 1 ? listNode : { type:{ name:'doc' } }; }, before(){ return 7; } }
      },
      doc: { nodesBetween(){} },
      tr
    },
    view: { dispatch(nextTr){ calls.push(['dispatch', nextTr === tr]); } },
    chain(){
      return {
        focus(){ calls.push('focus'); return this; },
        toggleBulletList(){ calls.push('toggleBulletList'); return this; },
        run(){ calls.push('run'); return true; }
      };
    }
  };

  const ok = commands.applyMultiLevelListTemplate(editor, 'bullet');
  assert.equal(ok, true);
  // No redundant toggle when the desired list type is already active.
  assert.equal(calls.some(c => c === 'toggleBulletList'), false);
  // First-level bullet style must still land on the current list node.
  assert.ok(calls.some(c => Array.isArray(c) && c[0] === 'setNodeMarkup' && c[2].listStyleType === 'disc'));
});

test('applyListStyle rejects unknown styles without mutating the editor', () => {
  const calls = [];
  const editor = {
    isActive(){ calls.push('isActive'); return true; },
    chain(){ calls.push('chain'); return { focus(){ return this; }, run(){ calls.push('run'); return true; } }; },
    state:{ selection:{ from:1, to:1 }, tr:{} },
    view:{ dispatch(){ calls.push('dispatch'); } }
  };
  assert.equal(commands.applyListStyle(editor, 'bulletList', 'bogus'), false);
  assert.equal(commands.applyListStyle(editor, 'orderedList', ''), false);
  // Unknown list type is also a safe no-op — no chain, no dispatch.
  assert.equal(commands.applyListStyle(editor, 'mysteryList', 'disc'), false);
  assert.equal(calls.length, 0);
});
