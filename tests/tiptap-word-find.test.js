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
  assert.deepEqual(state, { matches: [], index: -1 });
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
  assert.deepEqual(state, { matches: [], index: -1 });
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
  assert.deepEqual(state, { matches: [], index: -1 });
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
