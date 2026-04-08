const test = require('node:test');
const assert = require('node:assert/strict');

const toolbar = require('../src/tiptap-word-toolbar.js');

test('tiptap word toolbar exports helpers', () => {
  assert.equal(typeof toolbar.normalizeColorValue, 'function');
  assert.equal(typeof toolbar.computeWordCount, 'function');
  assert.equal(typeof toolbar.buildGoalState, 'function');
  assert.equal(typeof toolbar.getStats, 'function');
  assert.equal(typeof toolbar.syncFormatState, 'function');
  assert.equal(typeof toolbar.syncStatus, 'function');
  assert.equal(typeof toolbar.syncEditorUI, 'function');
  assert.equal(typeof toolbar.syncFormatUI, 'function');
  assert.equal(typeof toolbar.syncStatusUI, 'function');
});

function makeClassList() {
  return {
    addCalls: [],
    removeCalls: [],
    add(name) { this.addCalls.push(name); },
    remove(name) { this.removeCalls.push(name); }
  };
}

test('computeWordCount and buildGoalState return expected values', () => {
  assert.equal(toolbar.computeWordCount('bir iki  uc'), 3);
  assert.equal(toolbar.normalizeColorValue('rgb(0, 0, 0)', '#fff'), '#000000');

  const goal = toolbar.buildGoalState(90, 100);
  assert.match(goal.text, /90\/100/);
  assert.equal(goal.color, 'var(--green)');
});

test('syncFormatState supports legacy queryCommandState fallback', () => {
  const buttons = {
    btnBold: { classList: makeClassList() },
    btnItalic: { classList: makeClassList() },
    btnUnderline: { classList: makeClassList() },
    btnStrike: { classList: makeClassList() }
  };
  const ok = toolbar.syncFormatState({
    doc: {
      getElementById(id){ return buttons[id] || null; }
    },
    queryState(cmd){
      return cmd === 'bold' || cmd === 'underline';
    }
  });
  assert.equal(ok, true);
  assert.deepEqual(buttons.btnBold.classList.addCalls, ['active', 'is-active']);
  assert.deepEqual(buttons.btnItalic.classList.removeCalls, ['active', 'is-active']);
  assert.deepEqual(buttons.btnUnderline.classList.addCalls, ['active', 'is-active']);
  assert.deepEqual(buttons.btnStrike.classList.removeCalls, ['active', 'is-active']);
});

test('syncEditorUI can update both format and status surfaces', () => {
  const buttons = {
    btnBold: { classList: makeClassList() },
    btnItalic: { classList: makeClassList() },
    btnUnderline: { classList: makeClassList() },
    btnStrike: { classList: makeClassList() }
  };
  const fields = {
    tbinfo: { textContent:'' },
    sbw: { textContent:'' },
    sbc: { textContent:'' },
    sbr2: { textContent:'' },
    sbgoal: { innerHTML:'', style:{} }
  };
  const doc = {
    getElementById(id){
      return buttons[id] || fields[id] || null;
    }
  };
  const host = {
    innerText:'bir iki uc',
    querySelectorAll(sel){ return sel === '.cit' ? [1] : []; }
  };
  const ok = toolbar.syncEditorUI({
    doc,
    host,
    refs:2,
    wordGoal:5,
    queryState(cmd){ return cmd === 'bold'; }
  });
  assert.equal(ok, true);
  assert.deepEqual(buttons.btnBold.classList.addCalls, ['active', 'is-active']);
  assert.match(fields.tbinfo.textContent, /3 kelime/);
  assert.match(fields.sbc.textContent, /1 at/);
  assert.match(fields.sbr2.textContent, /2 kaynak/);
});

test('syncFormatUI and syncStatusUI provide thin high-level wrappers', () => {
  const buttons = {
    btnBold: { classList: makeClassList() },
    btnItalic: { classList: makeClassList() },
    btnUnderline: { classList: makeClassList() },
    btnStrike: { classList: makeClassList() }
  };
  const fields = {
    tbinfo: { textContent:'' },
    sbw: { textContent:'' },
    sbc: { textContent:'' },
    sbr2: { textContent:'' },
    sbgoal: { innerHTML:'', style:{} }
  };
  const doc = {
    getElementById(id){
      return buttons[id] || fields[id] || null;
    }
  };
  const host = {
    innerText:'dort bes',
    querySelectorAll(sel){ return sel === '.cit' ? [1,2] : []; }
  };

  const fmt = toolbar.syncFormatUI({
    doc,
    queryState(cmd){ return cmd === 'italic'; }
  });
  const status = toolbar.syncStatusUI({
    doc,
    getHost(){ return host; },
    getRefs(){ return 3; },
    wordGoal: 10
  });

  assert.equal(fmt, true);
  assert.equal(status, true);
  assert.deepEqual(buttons.btnItalic.classList.addCalls, ['active', 'is-active']);
  assert.match(fields.tbinfo.textContent, /2 kelime/);
  assert.match(fields.sbc.textContent, /2 at/);
  assert.match(fields.sbr2.textContent, /3 kaynak/);
});

test('syncFormatState highlights structure, alignment and list buttons for active selection', () => {
  const buttons = {
    btnBold: { classList: makeClassList() },
    btnItalic: { classList: makeClassList() },
    btnUnderline: { classList: makeClassList() },
    btnStrike: { classList: makeClassList() },
    btnParagraph: { classList: makeClassList() },
    btnBlockQuote: { classList: makeClassList() },
    btnUnorderedList: { classList: makeClassList() },
    btnOrderedList: { classList: makeClassList() },
    btnAlignLeft: { classList: makeClassList() },
    btnAlignCenter: { classList: makeClassList() },
    btnAlignRight: { classList: makeClassList() },
    btnH1: { classList: makeClassList() },
    btnH2: { classList: makeClassList() },
    btnH3: { classList: makeClassList() },
    btnH4: { classList: makeClassList() },
    btnH5: { classList: makeClassList() }
  };
  const doc = {
    getElementById(id) {
      return buttons[id] || null;
    }
  };
  const editor = {
    isActive(type, attrs) {
      if (type === 'paragraph') return true;
      if (type === 'blockquote') return false;
      if (type === 'bulletList') return true;
      if (type === 'orderedList') return false;
      if (type === 'heading' && attrs && attrs.level === 2) return true;
      if (type && typeof type === 'object' && type.textAlign === 'center') return true;
      return false;
    },
    getAttributes(name) {
      if (name === 'textStyle') return {};
      if (name === 'highlight') return {};
      if (name === 'paragraph') return { textAlign:'center' };
      if (name === 'heading') return {};
      return {};
    }
  };

  const ok = toolbar.syncFormatState({ doc, editor });
  assert.equal(ok, true);
  assert.deepEqual(buttons.btnParagraph.classList.addCalls, ['active', 'is-active']);
  assert.deepEqual(buttons.btnUnorderedList.classList.addCalls, ['active', 'is-active']);
  assert.deepEqual(buttons.btnAlignCenter.classList.addCalls, ['active', 'is-active']);
  assert.deepEqual(buttons.btnH2.classList.addCalls, ['heading-active', 'active', 'is-active']);
  assert.deepEqual(buttons.btnH1.classList.removeCalls, ['heading-active', 'active', 'is-active']);
});
