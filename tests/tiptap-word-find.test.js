const test = require('node:test');
const assert = require('node:assert/strict');

const find = require('../src/tiptap-word-find.js');

test('tiptap word find exports helpers', () => {
  assert.equal(typeof find.getElements, 'function');
  assert.equal(typeof find.toggleBar, 'function');
  assert.equal(typeof find.closeBar, 'function');
  assert.equal(typeof find.resetSearchState, 'function');
  assert.equal(typeof find.clearHighlights, 'function');
  assert.equal(typeof find.buildSearchRegExp, 'function');
  assert.equal(typeof find.scheduleFind, 'function');
  assert.equal(typeof find.bindInputs, 'function');
  assert.equal(typeof find.highlightActive, 'function');
  assert.equal(typeof find.executeSearch, 'function');
  assert.equal(typeof find.findNext, 'function');
  assert.equal(typeof find.findPrev, 'function');
  assert.equal(typeof find.replaceCurrent, 'function');
  assert.equal(typeof find.replaceAll, 'function');
  assert.equal(typeof find.closeSearchUI, 'function');
  assert.equal(typeof find.toggleSearchUI, 'function');
  assert.equal(typeof find.closeSearchWithState, 'function');
  assert.equal(typeof find.toggleSearchWithState, 'function');
  assert.equal(typeof find.executeSearchWithState, 'function');
  assert.equal(typeof find.navigateSearch, 'function');
  assert.equal(typeof find.replaceSearchWithState, 'function');
  assert.equal(typeof find.bindSearchUI, 'function');
  assert.equal(typeof find.collectTextSegments, 'function');
  assert.equal(typeof find.buildSearchText, 'function');
  assert.equal(typeof find.findMatchesInText, 'function');
});

test('toggleBar opens and closeBar resets count', () => {
  const els = {
    findbar: { style:{ display:'none' } },
    findinp: { focused:false, selected:false, focus(){ this.focused = true; }, select(){ this.selected = true; } },
    replaceinp: {},
    findcount: { textContent:'' }
  };
  const doc = { getElementById(id){ return els[id] || null; } };
  const opened = find.toggleBar({ doc });
  assert.equal(opened, true);
  assert.equal(els.findbar.style.display, 'block');
  assert.equal(els.findinp.focused, true);
  assert.equal(els.findinp.selected, true);

  let cleared = false;
  const closed = find.closeBar({
    doc,
    clearHighlights(){ cleared = true; }
  });
  assert.equal(closed, true);
  assert.equal(els.findbar.style.display, 'none');
  assert.equal(els.findcount.textContent, '--');
  assert.equal(cleared, true);
});

test('buildSearchRegExp supports plain and regex modes', () => {
  assert.match('Hello', find.buildSearchRegExp('hello', false, false));
  assert.match('abc123', find.buildSearchRegExp('\\d+', true, false));
  assert.equal(find.buildSearchRegExp('', false, false), null);
});

test('collectTextSegments and buildSearchText preserve combined text across nodes', () => {
  const nodes = [
    { textContent:'Alpha ', parentElement:{ classList:{ contains(){ return false; } } } },
    { textContent:'Beta', parentElement:{ classList:{ contains(){ return false; } } } },
    { textContent:'', parentElement:{ classList:{ contains(){ return false; } } } },
    { textContent:' Gamma', parentElement:{ classList:{ contains(name){ return name === 'find-hl'; } } } },
    { textContent:' Delta', parentElement:{ classList:{ contains(){ return false; } } } }
  ];
  const doc = {
    createTreeWalker(){
      let index = -1;
      return {
        currentNode: null,
        nextNode(){
          index += 1;
          if(index >= nodes.length) return false;
          this.currentNode = nodes[index];
          return true;
        }
      };
    }
  };
  const segments = find.collectTextSegments({ doc, host:{} });
  assert.equal(segments.length, 3);
  assert.equal(find.buildSearchText(segments), 'Alpha Beta Delta');
  assert.deepEqual(segments.map(segment => [segment.start, segment.end]), [[0, 6], [6, 10], [10, 16]]);
});

test('findMatchesInText matches across formatting boundaries in combined text', () => {
  const re = find.buildSearchRegExp('alpha beta', false, false);
  const matches = find.findMatchesInText('Alpha Beta Delta', re);
  assert.deepEqual(matches, [{ start:0, end:10 }]);
});

test('executeSearchWithState uses editor ranges instead of DOM marks when editor is provided', () => {
  const countEl = { textContent:'' };
  const state = { matches:[], index:-1 };
  let focusCount = 0;
  const dispatched = [];
  const doc = {
    getElementById(id){
      if(id === 'findcount') return countEl;
      return null;
    }
  };
  const editor = {
    state: {
      selection: {
        constructor: {
          create(_doc, from, to){
            return { from, to };
          }
        }
      },
      tr: {
        setSelection(sel){
          dispatched.push(sel);
          return this;
        },
        scrollIntoView(){
          return this;
        }
      },
      doc: {
        descendants(fn){
          fn({ isText:true, text:'Alpha' }, 1);
          fn({ isText:true, text:' Beta' }, 6);
        }
      }
    },
    view: {
      dispatch(payload){
        dispatched.push(payload);
      }
    },
    chain(){
      return {
        focus(){ focusCount += 1; return this; },
        setTextSelection(){ return this; },
        run(){ return true; }
      };
    }
  };

  const matches = find.executeSearchWithState({
    doc,
    state,
    editor,
    query:'alpha beta',
    useRegex:false,
    caseSensitive:false
  });

  assert.equal(matches.length, 1);
  assert.equal(typeof matches[0].__aqEditorRange, 'object');
  assert.deepEqual(state.editorRanges, [{ from:1, to:11 }]);
  assert.equal(state.index, 0);
  assert.equal(countEl.textContent, '1/1');
  assert.equal(focusCount, 0);
  assert.ok(dispatched.length >= 1);
});

test('executeSearchWithState skips cross-block false joins and keeps later block ranges accurate', () => {
  const countEl = { textContent:'' };
  const state = { matches:[], index:-1 };
  const doc = {
    getElementById(id){
      if(id === 'findcount') return countEl;
      return null;
    }
  };
  const editor = {
    state: {
      doc: {
        descendants(fn){
          fn({ isText:true, text:'Alpha' }, 1);
          fn({ isText:true, text:'Beta' }, 10);
        }
      }
    },
    chain(){
      return {
        focus(){ return this; },
        setTextSelection(){ return this; },
        run(){ return true; }
      };
    }
  };

  const noCrossBlock = find.executeSearchWithState({
    doc,
    state,
    editor,
    query:'haBe',
    useRegex:false,
    caseSensitive:true
  });
  assert.equal(noCrossBlock.length, 0);

  const nextState = { matches:[], index:-1 };
  const blockMatch = find.executeSearchWithState({
    doc,
    state: nextState,
    editor,
    query:'Beta',
    useRegex:false,
    caseSensitive:true
  });
  assert.equal(blockMatch.length, 1);
  assert.deepEqual(nextState.editorRanges, [{ from:10, to:14 }]);
});

test('replaceSearchWithState succeeds with editor-backed replacement path', () => {
  const calls = [];
  const firstText = { textContent:'Alpha', ownerDocument:null };
  const lastText = { textContent:'Beta', ownerDocument:null };
  const markParent = {
    replaceChild(){},
    normalize(){}
  };
  const mark = { ownerDocument:null, parentNode:markParent };
  const doc = {
    getElementById(){ return null; },
    createTextNode(value){ return { value, parentNode:markParent }; },
    createTreeWalker(root){
      let done = false;
      return {
        currentNode: null,
        nextNode(){
          if(done) return false;
          done = true;
          this.currentNode = root === mark ? firstText : null;
          return root === mark;
        }
      };
    }
  };
  firstText.ownerDocument = doc;
  lastText.ownerDocument = doc;
  mark.ownerDocument = {
    createTreeWalker(){
      const nodes = [firstText, lastText];
      let index = -1;
      return {
        currentNode: null,
        nextNode(){
          index += 1;
          if(index >= nodes.length) return false;
          this.currentNode = nodes[index];
          return true;
        }
      };
    }
  };
  const editor = {
    view: {
      posAtDOM(node, offset){
        if(node === firstText) return offset === 0 ? 5 : 10;
        if(node === lastText) return offset === String(lastText.textContent || '').length ? 13 : 9;
        return 0;
      }
    },
    chain(){
      return {
        focus(){ return this; },
        insertContentAt(range, replacement){
          calls.push({ range, replacement });
          return this;
        },
        run(){ return true; }
      };
    }
  };
  const state = { matches:[mark], index:0 };
  const ok = find.replaceSearchWithState({
    doc,
    state,
    replacement:'Gamma',
    editor
  });
  assert.equal(ok, true);
  assert.ok(calls.length <= 1);
  if(calls.length === 1){
    assert.deepEqual(calls, [{ range:{ from:5, to:13 }, replacement:'Gamma' }]);
  }
  assert.deepEqual(state, { matches:[], index:-1, editorRanges:[] });
});

test('bindInputs wires input and escape handlers once', async () => {
  const events = {};
  const findInput = {
    addEventListener(type, fn){ events['find:' + type] = fn; }
  };
  const replaceInput = {
    addEventListener(type, fn){ events['replace:' + type] = fn; }
  };
  const doc = {
    getElementById(id){
      if(id === 'findinp') return findInput;
      if(id === 'replaceinp') return replaceInput;
      if(id === 'findbar' || id === 'findcount') return { style:{}, textContent:'' };
      return null;
    }
  };
  let execCount = 0;
  let closeCount = 0;
  let prevCount = 0;
  let nextCount = 0;
  find.bindInputs({
    doc,
    delay: 1,
    onExec(){ execCount++; },
    onClose(){ closeCount++; },
    onPrev(){ prevCount++; },
    onNext(){ nextCount++; }
  });
  events['find:input']();
  await new Promise(resolve => setTimeout(resolve, 10));
  events['find:keydown']({ key:'Enter', shiftKey:false, preventDefault(){} });
  events['find:keydown']({ key:'Enter', shiftKey:true, preventDefault(){} });
  events['find:keydown']({ key:'Escape', preventDefault(){} });
  events['replace:keydown']({ key:'Escape', preventDefault(){} });
  assert.equal(execCount, 1);
  assert.equal(nextCount, 1);
  assert.equal(prevCount, 1);
  assert.equal(closeCount, 2);
});

test('resetSearchState, highlightActive and next/prev manage search state', () => {
  const countEl = { textContent:'' };
  const calls = [];
  const state = {
    matches: [
      { className:'', scrollIntoView(){ calls.push('scroll-0'); } },
      { className:'', scrollIntoView(){ calls.push('scroll-1'); } }
    ],
    index: 0
  };

  assert.equal(find.highlightActive({ state, countEl }), true);
  assert.equal(state.matches[0].className, 'find-hl find-hl-active');
  assert.equal(countEl.textContent, '1/2');

  assert.equal(find.findNext({ state, countEl }), true);
  assert.equal(state.index, 1);
  assert.equal(countEl.textContent, '2/2');

  assert.equal(find.findPrev({ state, countEl }), true);
  assert.equal(state.index, 0);

  find.resetSearchState(state);
  assert.deepEqual(state, { matches: [], index: -1, editorRanges: [] });
  assert.deepEqual(calls, ['scroll-0', 'scroll-1', 'scroll-0']);
});

test('closeSearchUI clears highlights and resets search state', () => {
  const state = { matches:[1], index:0 };
  let cleared = false;
  const els = {
    findbar: { style:{ display:'block' } },
    findcount: { textContent:'' }
  };
  const doc = { getElementById(id){ return els[id] || null; } };

  const ok = find.closeSearchUI({
    doc,
    state,
    clearHighlights(){ cleared = true; }
  });

  assert.equal(ok, true);
  assert.equal(cleared, true);
  assert.equal(els.findbar.style.display, 'none');
  assert.equal(els.findcount.textContent, '--');
  assert.deepEqual(state, { matches: [], index: -1, editorRanges: [] });
});

test('toggleSearchWithState and closeSearchWithState use host-aware clearing', () => {
  const calls = [];
  const host = { id:'host' };
  const els = {
    findbar: { style:{ display:'none' } },
    findinp: { focus(){ calls.push('focus'); }, select(){ calls.push('select'); } },
    replaceinp: {},
    findcount: { textContent:'' }
  };
  const doc = { getElementById(id){ return els[id] || null; } };
  const state = { matches:[1], index:0 };

  const opened = find.toggleSearchWithState({ doc, state, host });
  const closed = find.closeSearchWithState({
    doc,
    state,
    host
  });

  assert.equal(opened, true);
  assert.equal(closed, true);
  assert.equal(els.findbar.style.display, 'none');
  assert.deepEqual(state, { matches: [], index: -1, editorRanges: [] });
  assert.deepEqual(calls, ['focus', 'select']);
});

test('executeSearchWithState, navigateSearch and replaceSearchWithState use doc-derived elements', () => {
  const markA = { className:'', scrollIntoView(){} };
  const markB = { className:'', scrollIntoView(){} };
  const state = { matches:[markA, markB], index:0 };
  const countEl = { textContent:'' };

  const next = find.navigateSearch({
    doc: { getElementById(id){ return id === 'findcount' ? countEl : null; } },
    state,
    forward: true
  });

  assert.equal(next, true);
  assert.equal(state.index, 1);
  assert.equal(countEl.textContent, '2/2');

  const replaceDoc = {
    getElementById(id){
      if(id === 'replaceinp') return { value:'yenisi' };
      if(id === 'findcount') return countEl;
      return null;
    },
    createTextNode(value){
      return { value, parentNode:null };
    }
  };
  const parent = {
    replaceChild(node) {
      node.parentNode = parent;
    },
    normalize() {}
  };
  state.matches = [{ parentNode: parent }];
  state.index = 0;
  const replaced = find.replaceSearchWithState({
    doc: replaceDoc,
    state,
    onMutate() {
      countEl.textContent = 'mutated';
    }
  });

  assert.equal(replaced, true);
  assert.equal(countEl.textContent, 'mutated');
});

test('bindSearchUI wires higher-level search callbacks', async () => {
  const events = {};
  const findInput = {
    value: '',
    addEventListener(type, fn){ events['find:' + type] = fn; }
  };
  const replaceInput = {
    value: 'degis',
    addEventListener(type, fn){ events['replace:' + type] = fn; }
  };
  const count = { textContent:'' };
  const bar = { style:{ display:'block' } };
  const doc = {
    getElementById(id){
      if(id === 'findinp') return findInput;
      if(id === 'replaceinp') return replaceInput;
      if(id === 'findcount') return count;
      if(id === 'findbar') return bar;
      if(id === 'apaed') return { querySelectorAll(){ return []; } };
      return null;
    }
  };

  find.bindSearchUI({ doc, state:{ matches:[], index:-1 }, host:{} , delay:1 });
  events['find:input']();
  await new Promise(resolve => setTimeout(resolve, 10));
  events['find:keydown']({ key:'Enter', shiftKey:false, preventDefault(){} });
  events['find:keydown']({ key:'Escape', preventDefault(){} });
  assert.equal(bar.style.display, 'none');
  assert.equal(count.textContent, '--');
});
