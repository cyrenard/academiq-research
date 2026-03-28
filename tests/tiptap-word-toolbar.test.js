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

test('computeWordCount and buildGoalState return expected values', () => {
  assert.equal(toolbar.computeWordCount('bir iki  uc'), 3);
  assert.equal(toolbar.normalizeColorValue('rgb(0, 0, 0)', '#fff'), '#000000');

  const goal = toolbar.buildGoalState(90, 100);
  assert.match(goal.text, /90\/100/);
  assert.equal(goal.color, 'var(--green)');
});

test('syncFormatState supports legacy queryCommandState fallback', () => {
  const buttons = {
    btnBold: { classList: { addCalled:false, removeCalled:false, add(){ this.addCalled=true; }, remove(){ this.removeCalled=true; } } },
    btnItalic: { classList: { addCalled:false, removeCalled:false, add(){ this.addCalled=true; }, remove(){ this.removeCalled=true; } } },
    btnUnderline: { classList: { addCalled:false, removeCalled:false, add(){ this.addCalled=true; }, remove(){ this.removeCalled=true; } } },
    btnStrike: { classList: { addCalled:false, removeCalled:false, add(){ this.addCalled=true; }, remove(){ this.removeCalled=true; } } }
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
  assert.equal(buttons.btnBold.classList.addCalled, true);
  assert.equal(buttons.btnItalic.classList.removeCalled, true);
  assert.equal(buttons.btnUnderline.classList.addCalled, true);
  assert.equal(buttons.btnStrike.classList.removeCalled, true);
});

test('syncEditorUI can update both format and status surfaces', () => {
  const buttons = {
    btnBold: { classList: { addCalled:false, removeCalled:false, add(){ this.addCalled=true; }, remove(){ this.removeCalled=true; } } },
    btnItalic: { classList: { addCalled:false, removeCalled:false, add(){ this.addCalled=true; }, remove(){ this.removeCalled=true; } } },
    btnUnderline: { classList: { addCalled:false, removeCalled:false, add(){ this.addCalled=true; }, remove(){ this.removeCalled=true; } } },
    btnStrike: { classList: { addCalled:false, removeCalled:false, add(){ this.addCalled=true; }, remove(){ this.removeCalled=true; } } }
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
  assert.equal(buttons.btnBold.classList.addCalled, true);
  assert.match(fields.tbinfo.textContent, /3 kelime/);
  assert.match(fields.sbc.textContent, /1 at/);
  assert.match(fields.sbr2.textContent, /2 kaynak/);
});

test('syncFormatUI and syncStatusUI provide thin high-level wrappers', () => {
  const buttons = {
    btnBold: { classList: { addCalled:false, removeCalled:false, add(){ this.addCalled=true; }, remove(){ this.removeCalled=true; } } },
    btnItalic: { classList: { addCalled:false, removeCalled:false, add(){ this.addCalled=true; }, remove(){ this.removeCalled=true; } } },
    btnUnderline: { classList: { addCalled:false, removeCalled:false, add(){ this.addCalled=true; }, remove(){ this.removeCalled=true; } } },
    btnStrike: { classList: { addCalled:false, removeCalled:false, add(){ this.addCalled=true; }, remove(){ this.removeCalled=true; } } }
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
  assert.equal(buttons.btnItalic.classList.addCalled, true);
  assert.match(fields.tbinfo.textContent, /2 kelime/);
  assert.match(fields.sbc.textContent, /2 at/);
  assert.match(fields.sbr2.textContent, /3 kaynak/);
});
