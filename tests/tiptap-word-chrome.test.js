const test = require('node:test');
const assert = require('node:assert/strict');

const chrome = require('../src/tiptap-word-chrome.js');

test('tiptap word chrome exports editor chrome helpers', () => {
  assert.equal(typeof chrome.setWordGoal, 'function');
  assert.equal(typeof chrome.setCitationMode, 'function');
  assert.equal(typeof chrome.toggleZenMode, 'function');
  assert.equal(typeof chrome.handleZenMouseMove, 'function');
  assert.equal(typeof chrome.updateZenTime, 'function');
  assert.equal(typeof chrome.isZenActive, 'function');
});

test('setWordGoal updates state through prompt flow', async () => {
  let saved = false;
  let synced = false;
  let goal = 0;
  const result = await chrome.setWordGoal({
    currentGoal: 250,
    prompt(title, value){
      assert.equal(title, 'Kelime hedefi:');
      assert.equal(value, 250);
      return Promise.resolve('500');
    },
    setGoal(value){ goal = value; },
    save(){ saved = true; },
    syncStatus(){ synced = true; }
  });
  assert.equal(result, 500);
  assert.equal(goal, 500);
  assert.equal(saved, true);
  assert.equal(synced, true);
});

test('setCitationMode updates buttons and rerenders trigger UI', () => {
  let mode = '';
  let rendered = '';
  let refsRendered = false;
  const buttons = [
    { classList:{ removed:false, added:false, remove(){ this.removed = true; }, add(){ this.added = true; } } },
    { classList:{ removed:false, added:false, remove(){ this.removed = true; }, add(){ this.added = true; } } }
  ];
  const activeButton = buttons[1];
  const result = chrome.setCitationMode({
    mode: 'footnote',
    button: activeButton,
    doc: {
      querySelectorAll(selector){
        assert.equal(selector, '.tgm');
        return buttons;
      }
    },
    setMode(value){ mode = value; },
    getSearchValue(){ return 'doe'; },
    renderTrigger(value){ rendered = value; },
    renderReferences(){ refsRendered = true; }
  });
  assert.equal(result, 'footnote');
  assert.equal(mode, 'footnote');
  assert.equal(rendered, 'doe');
  assert.equal(refsRendered, true);
  assert.equal(buttons[0].classList.removed, true);
  assert.equal(activeButton.classList.added, true);
});

test('toggleZenMode and updateZenTime manage zen state and counters', async () => {
  let focused = false;
  let bound = false;
  let unbound = false;
  const body = {
    classList:{
      calls:[],
      toggle(name, active){ this.calls.push([name, active]); }
    }
  };
  const toolbar = { style:{ opacity:'' } };

  const onState = chrome.toggleZenMode({
    body,
    toolbar,
    now(){ return 1000; },
    focusEditor(){ focused = true; },
    bindMouseTracking(){ bound = true; }
  });

  assert.equal(onState.active, true);
  assert.equal(focused, true);
  assert.equal(bound, true);
  assert.deepEqual(body.classList.calls[0], ['zen', true]);

  const timeEl = { textContent:'' };
  const wordsEl = { textContent:'' };
  const updated = chrome.updateZenTime({
    now(){ return 71000; },
    timeEl,
    wordsEl,
    getWordCount(){ return 42; }
  });
  assert.equal(updated, true);
  assert.equal(timeEl.textContent, '1dk 10sn');
  assert.equal(wordsEl.textContent, '42 kelime');

  const moved = chrome.handleZenMouseMove({
    toolbar,
    hideDelay: 5
  });
  assert.equal(moved.active, true);
  assert.equal(toolbar.style.opacity, '1');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(toolbar.style.opacity, '0');

  const offState = chrome.toggleZenMode({
    body,
    toolbar,
    unbindMouseTracking(){ unbound = true; }
  });
  assert.equal(offState.active, false);
  assert.equal(unbound, true);
  assert.equal(toolbar.style.opacity, '1');
});
