const test = require('node:test');
const assert = require('node:assert/strict');

const editorMod = require('../src/tiptap-word-editor.js');
const cmdMod = require('../src/tiptap-word-commands.js');

function makeListEditor(options){
  options = options || {};
  const calls = [];
  const commandCalls = [];
  const listItemType = options.inList === false ? 'paragraph' : 'listItem';
  const chainApi = {
    focus(){ calls.push('focus'); return chainApi; },
    splitListItem(type){ calls.push(['splitListItem', type]); return chainApi; },
    liftListItem(type){ calls.push(['liftListItem', type]); return chainApi; },
    sinkListItem(type){ calls.push(['sinkListItem', type]); return chainApi; },
    clearNodes(){ calls.push('clearNodes'); return chainApi; },
    toggleBulletList(){ calls.push('toggleBulletList'); return chainApi; },
    toggleOrderedList(){ calls.push('toggleOrderedList'); return chainApi; },
    updateAttributes(type, attrs){ calls.push(['updateAttributes', type, attrs]); return chainApi; },
    insertContent(html){ calls.push(['insertContent', html]); return chainApi; },
    run(){ calls.push('run'); return options.runResult !== false; }
  };
  const activeTypes = options.activeTypes || (options.inList !== false ? ['bulletList','listItem'] : []);
  return {
    calls,
    commandCalls,
    isActive(type){ return activeTypes.indexOf(type) >= 0; },
    state: {
      selection: {
        from: 1,
        to: 1,
        $from: {
          depth: 1,
          node(depth){
            if(depth === 1){
              return {
                type: { name:listItemType },
                textContent: options.textContent == null ? 'Madde' : options.textContent
              };
            }
            return { type: { name:'doc' } };
          }
        },
        $to: {
          depth: 1,
          node(depth){
            if(depth === 1) return { type: { name:listItemType } };
            return { type: { name:'doc' } };
          }
        }
      },
      doc: {
        nodesBetween: function(){}
      },
      tr: {
        doc: { nodeAt: function(){ return null; } },
        setNodeMarkup: function(){ return this; }
      }
    },
    view: {
      dom: {},
      nodeDOM: function(){ return null; },
      domAtPos: function(){ return { node: null }; },
      dispatch: function(){}
    },
    chain(){ return chainApi; },
    commands: Object.assign({
      splitListItem(type){ commandCalls.push(['splitListItem', type]); return options.commandSuccess !== false; },
      liftListItem(type){ commandCalls.push(['liftListItem', type]); return options.commandSuccess !== false; },
      sinkListItem(type){ commandCalls.push(['sinkListItem', type]); return options.commandSuccess !== false; },
      clearNodes(){ calls.push('clearNodes-cmd'); return true; }
    }, options.hasClearNodes === false ? { clearNodes:undefined } : {})
  };
}

// ── handleWordListEnter ──

test('handleWordListEnter splits non-empty list item', () => {
  const editor = makeListEditor({ textContent:'Madde' });
  const handled = editorMod.handleWordListEnter(editor);
  assert.equal(handled, true);
  assert.deepEqual(editor.commandCalls, [['splitListItem', 'listItem']]);
});

test('handleWordListEnter exits empty list item', () => {
  const editor = makeListEditor({ textContent:'   ' });
  const handled = editorMod.handleWordListEnter(editor);
  assert.equal(handled, true);
  assert.deepEqual(editor.commandCalls, [['liftListItem', 'listItem']]);
});

// ── handleWordListTab ──

test('handleWordListTab indents and outdents only in list context', () => {
  const indentEditor = makeListEditor({ inList:true });
  const outdentEditor = makeListEditor({ inList:true });
  const normalEditor = makeListEditor({ inList:false });

  assert.equal(editorMod.handleWordListTab(indentEditor, false), true);
  assert.equal(editorMod.handleWordListTab(outdentEditor, true), true);
  assert.equal(editorMod.handleWordListTab(normalEditor, false), false);

  assert.deepEqual(indentEditor.commandCalls, [['sinkListItem', 'listItem']]);
  assert.deepEqual(outdentEditor.commandCalls, [['liftListItem', 'listItem']]);
});

// ── handleWordListBackspace ──

function makeBackspaceEditor(opts){
  opts = opts || {};
  const base = makeListEditor({
    inList: opts.inList !== false,
    textContent: opts.textContent == null ? '' : opts.textContent,
    activeTypes: opts.activeTypes || (opts.inList !== false ? ['bulletList','listItem'] : [])
  });
  const parentOffset = opts.parentOffset == null ? 0 : opts.parentOffset;
  const nestedDepth = opts.nestedDepth || 1; // 1 = top-level list
  base.state.selection.from = 5;
  base.state.selection.to = 5;
  base.state.selection.$from = {
    parentOffset: parentOffset,
    depth: nestedDepth * 2,
    node(depth){
      if(depth === nestedDepth * 2) return { type:{ name:'listItem' }, textContent: opts.textContent == null ? '' : opts.textContent };
      if(depth > 0 && depth % 2 === 1) return { type:{ name:'bulletList' } };
      return { type:{ name:'doc' } };
    }
  };
  return base;
}

test('handleWordListBackspace lifts empty top-level list item', () => {
  const editor = makeBackspaceEditor({ textContent:'  ' });
  const handled = editorMod.handleWordListBackspace(editor);
  assert.equal(handled, true);
  assert.deepEqual(editor.commandCalls, [['liftListItem', 'listItem']]);
});

test('handleWordListBackspace no-op when parentOffset > 0', () => {
  const editor = makeBackspaceEditor({ textContent:'', parentOffset:3 });
  assert.equal(editorMod.handleWordListBackspace(editor), false);
  assert.deepEqual(editor.commandCalls, []);
});

test('handleWordListBackspace no-op outside list context', () => {
  const editor = makeListEditor({ inList:false, activeTypes:[] });
  assert.equal(editorMod.handleWordListBackspace(editor), false);
});

test('handleWordListBackspace no-op for non-empty list item', () => {
  const editor = makeBackspaceEditor({ textContent:'Hello' });
  assert.equal(editorMod.handleWordListBackspace(editor), false);
  assert.deepEqual(editor.commandCalls, []);
});

// ── normalizeListStyleType ──

test('normalizeListStyleType validates bullet styles', () => {
  assert.equal(editorMod.normalizeListStyleType('bulletList', 'disc'), 'disc');
  assert.equal(editorMod.normalizeListStyleType('bulletList', 'circle'), 'circle');
  assert.equal(editorMod.normalizeListStyleType('bulletList', 'square'), 'square');
  assert.equal(editorMod.normalizeListStyleType('bulletList', 'invalid'), null);
  assert.equal(editorMod.normalizeListStyleType('bulletList', ''), null);
});

test('normalizeListStyleType validates ordered styles including upper-roman and upper-alpha', () => {
  assert.equal(editorMod.normalizeListStyleType('orderedList', 'decimal'), 'decimal');
  assert.equal(editorMod.normalizeListStyleType('orderedList', 'lower-alpha'), 'lower-alpha');
  assert.equal(editorMod.normalizeListStyleType('orderedList', 'lower-roman'), 'lower-roman');
  assert.equal(editorMod.normalizeListStyleType('orderedList', 'upper-alpha'), 'upper-alpha');
  assert.equal(editorMod.normalizeListStyleType('orderedList', 'upper-roman'), 'upper-roman');
  assert.equal(editorMod.normalizeListStyleType('orderedList', 'invalid'), null);
});

// ── applyCommand list commands ──

test('applyCommand handles insertUnorderedList', () => {
  const editor = makeListEditor({});
  const result = cmdMod.applyCommand(editor, 'insertUnorderedList');
  assert.equal(result, true);
  assert.ok(editor.calls.indexOf('toggleBulletList') >= 0);
});

test('applyCommand handles insertOrderedList', () => {
  const editor = makeListEditor({ activeTypes:[] });
  const result = cmdMod.applyCommand(editor, 'insertOrderedList');
  assert.equal(result, true);
  assert.ok(editor.calls.indexOf('toggleOrderedList') >= 0);
});

test('applyCommand indent sinks list item when in list', () => {
  const editor = makeListEditor({ activeTypes:['bulletList','listItem'] });
  assert.equal(cmdMod.applyCommand(editor, 'indent'), true);
  assert.ok(editor.calls.some(c => Array.isArray(c) && c[0] === 'sinkListItem'));
});

test('applyCommand indent creates bullet list when not in list', () => {
  const editor = makeListEditor({ activeTypes:[] });
  assert.equal(cmdMod.applyCommand(editor, 'indent'), true);
  assert.ok(editor.calls.indexOf('toggleBulletList') >= 0);
});

test('applyCommand outdent lifts list item when in list', () => {
  const editor = makeListEditor({ activeTypes:['orderedList','listItem'] });
  assert.equal(cmdMod.applyCommand(editor, 'outdent'), true);
  assert.ok(editor.calls.some(c => Array.isArray(c) && c[0] === 'liftListItem'));
});

test('applyCommand handles insertPageBreak', () => {
  const editor = makeListEditor({ activeTypes:[] });
  assert.equal(cmdMod.applyCommand(editor, 'insertPageBreak'), true);
});

// ── Multi-level list ──

test('applyMultiLevelListTemplate creates bullet list for bullet template', () => {
  const editor = makeListEditor({ activeTypes:[] });
  const result = cmdMod.applyMultiLevelListTemplate(editor, 'bullet');
  assert.equal(result, true);
  assert.ok(editor.calls.indexOf('toggleBulletList') >= 0);
});

test('applyMultiLevelListTemplate creates ordered list for number template', () => {
  const editor = makeListEditor({ activeTypes:[] });
  const result = cmdMod.applyMultiLevelListTemplate(editor, 'number');
  assert.equal(result, true);
  assert.ok(editor.calls.indexOf('toggleOrderedList') >= 0);
});

test('applyMultiLevelListTemplate creates ordered list for outline template', () => {
  const editor = makeListEditor({ activeTypes:[] });
  const result = cmdMod.applyMultiLevelListTemplate(editor, 'outline');
  assert.equal(result, true);
  assert.ok(editor.calls.indexOf('toggleOrderedList') >= 0);
});

test('applyMultiLevelListTemplate returns false for unknown template', () => {
  const editor = makeListEditor({});
  const result = cmdMod.applyMultiLevelListTemplate(editor, 'nonexistent');
  assert.equal(result, false);
});

test('applyMultiLevelListTemplate does not toggle if already active', () => {
  const editor = makeListEditor({ activeTypes:['orderedList'] });
  const result = cmdMod.applyMultiLevelListTemplate(editor, 'number');
  assert.equal(result, true);
  assert.ok(editor.calls.indexOf('toggleOrderedList') < 0, 'should not toggle existing list');
});

test('getMultiLevelTemplates returns all templates', () => {
  const templates = cmdMod.getMultiLevelTemplates();
  assert.ok(templates.bullet);
  assert.ok(templates.number);
  assert.ok(templates.outline);
  assert.ok(templates.mixed);
  assert.equal(templates.bullet.listType, 'bulletList');
  assert.equal(templates.number.listType, 'orderedList');
  assert.deepEqual(templates.number.levels, ['decimal','lower-alpha','lower-roman']);
  assert.deepEqual(templates.outline.levels, ['upper-roman','upper-alpha','decimal']);
});

// ── isListContextActive ──

test('isListContextActive detects list context', () => {
  const inList = makeListEditor({ activeTypes:['bulletList'] });
  const notInList = makeListEditor({ activeTypes:[], inList:false });
  assert.equal(editorMod.isListContextActive(inList), true);
  assert.equal(editorMod.isListContextActive(notInList), false);
});

test('isListContextActive falls back to selection ancestry when isActive misses', () => {
  const inListBySelection = makeListEditor({ activeTypes:[], inList:true });
  assert.equal(editorMod.isListContextActive(inListBySelection), true);
});

test('isCurrentListItemEmpty detects empty item', () => {
  const empty = makeListEditor({ textContent:'  ' });
  const nonEmpty = makeListEditor({ textContent:'Hello' });
  assert.equal(editorMod.isCurrentListItemEmpty(empty), true);
  assert.equal(editorMod.isCurrentListItemEmpty(nonEmpty), false);
});

// ── parseListStyleTypeFromElement ──

test('parseListStyleTypeFromElement handles upper-case type attributes', () => {
  const el = {
    getAttribute(name){
      if(name === 'type') return 'A';
      return null;
    },
    style: {}
  };
  assert.equal(editorMod.parseListStyleTypeFromElement('orderedList', el), 'upper-alpha');
  el.getAttribute = function(name){ return name === 'type' ? 'I' : null; };
  assert.equal(editorMod.parseListStyleTypeFromElement('orderedList', el), 'upper-roman');
});

test('parseListStyleTypeFromElement reads data-list-style first', () => {
  const el = {
    getAttribute(name){
      if(name === 'data-list-style') return 'circle';
      return null;
    },
    style: {}
  };
  assert.equal(editorMod.parseListStyleTypeFromElement('bulletList', el), 'circle');
});

// ── normalizeListStyleType from commands module ──

test('commands normalizeListStyleType supports upper-alpha and upper-roman', () => {
  assert.equal(cmdMod.normalizeListStyleType('orderedList', 'upper-alpha'), 'upper-alpha');
  assert.equal(cmdMod.normalizeListStyleType('orderedList', 'upper-roman'), 'upper-roman');
  assert.equal(cmdMod.normalizeListStyleType('orderedList', 'UPPER-ALPHA'), 'upper-alpha');
});

test('matchWordListAutoformatPattern maps word-like prefixes to list styles', () => {
  assert.deepEqual(
    editorMod.matchWordListAutoformatPattern('1.'),
    { listType:'orderedList', listStyleType:'decimal' }
  );
  assert.deepEqual(
    editorMod.matchWordListAutoformatPattern('a.'),
    { listType:'orderedList', listStyleType:'lower-alpha' }
  );
  assert.deepEqual(
    editorMod.matchWordListAutoformatPattern('iv.'),
    { listType:'orderedList', listStyleType:'lower-roman' }
  );
  assert.deepEqual(
    editorMod.matchWordListAutoformatPattern('-'),
    { listType:'bulletList', listStyleType:'disc' }
  );
  assert.equal(editorMod.matchWordListAutoformatPattern('hello'), null);
});

test('resolveWordListAutoformatCandidate returns candidate only at paragraph start marker', () => {
  const marker = 'a.';
  const editor = {
    isActive(){ return false; },
    state: {
      selection: {
        from: marker.length,
        to: marker.length
      },
      doc: {
        content: { size: marker.length },
        resolve(pos){
          return {
            parentOffset: pos,
            parent: { type: { name:'paragraph' } }
          };
        },
        textBetween(from, to){
          if(from === 0 && to === marker.length) return marker;
          return '';
        }
      }
    }
  };
  const candidate = editorMod.resolveWordListAutoformatCandidate(editor, marker.length);
  assert.deepEqual(candidate, {
    from: 0,
    to: marker.length,
    listType: 'orderedList',
    listStyleType: 'lower-alpha'
  });
});
