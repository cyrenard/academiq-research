const assert = require('node:assert/strict');
const test = require('node:test');

const commands = require('../src/tiptap-word-commands.js');

test('tiptap word commands exports core builders and helpers', () => {
  assert.equal(typeof commands.buildAbstractHTML, 'function');
  assert.equal(typeof commands.buildBlockquoteHTML, 'function');
  assert.equal(typeof commands.buildFigureHTML, 'function');
  assert.equal(typeof commands.buildTableHTML, 'function');
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
  global.window = {
    AQTipTapWordSurface: {
      getHost(){ return { style:{} }; },
      getEditorDom(){ return { style:{} }; }
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

  global.window = {
    AQTipTapWordSurface: {
      getHost(){ return { style:{} }; },
      getEditorDom(){ return { style:{} }; }
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

  global.window = {
    AQTipTapWordSurface: {
      getHost(){ return { style:{} }; },
      getEditorDom(){ return { style:{} }; }
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
