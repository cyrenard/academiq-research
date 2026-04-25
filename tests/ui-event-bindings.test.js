const test = require('node:test');
const assert = require('node:assert/strict');

const bindings = require('../src/ui-event-bindings.js');

test('ui-event-bindings exports install api without auto-running', () => {
  assert.equal(typeof bindings.install, 'function');
  assert.equal(typeof bindings.autoInstall, 'function');
  assert.equal(typeof bindings.bindUIEvents, 'function');
  assert.equal(typeof bindings.bindEditorToolbarEvents, 'function');
  assert.equal(typeof bindings.bindTopToolbarEvents, 'function');
  assert.equal(typeof bindings.EDITOR_SELECTION_SAFE_COMMANDS, 'object');
  assert.equal(typeof bindings.EDITOR_SELECTION_SAFE_ACTIONS, 'object');
  assert.equal(typeof bindings.callEditorCommandAndSync, 'function');
  assert.equal(typeof bindings.callEditorActionAndSync, 'function');
});

test('EDITOR_SELECTION_SAFE_COMMANDS protects critical editor toolbar commands', () => {
  const safe = bindings.EDITOR_SELECTION_SAFE_COMMANDS;
  const criticalCommands = [
    'bold',
    'italic',
    'underline',
    'strikeThrough',
    'formatBlock',
    'setParagraphStyle',
    'justifyLeft',
    'justifyCenter',
    'justifyRight',
    'justifyFull',
    'insertUnorderedList',
    'insertOrderedList',
    'applyMultiLevelList',
    'indent',
    'outdent',
    'insertPageBreak',
    'subscript',
    'superscript',
    'foreColor',
    'hiliteColor',
    'fontName',
    'setPageSize',
    'setParagraphSpacing'
  ];

  for (const command of criticalCommands) {
    assert.equal(safe[command], true, `${command} should preserve editor selection`);
  }
});

test('EDITOR_SELECTION_SAFE_ACTIONS protects select-driven formatting actions', () => {
  const safe = bindings.EDITOR_SELECTION_SAFE_ACTIONS;

  assert.equal(safe.applyFontSize, true);
  assert.equal(safe.setLineSpacing, true);
});

test('callEditorCommandAndSync restores selection before running editor command', () => {
  const calls = [];
  const previous = {
    capture: global.captureEditorListStyleSelection,
    restore: global.restoreEditorListStyleSelection,
    ec: global.ec,
    updateFmtState: global.updateFmtState
  };

  global.captureEditorListStyleSelection = () => calls.push('capture');
  global.restoreEditorListStyleSelection = () => calls.push('restore');
  global.ec = (cmd, val) => calls.push(['ec', cmd, val]);
  global.updateFmtState = () => calls.push('sync');

  try {
    bindings.callEditorCommandAndSync('fontName', 'Times New Roman');
    assert.deepEqual(calls.slice(0, 3), [
      'capture',
      'restore',
      ['ec', 'fontName', 'Times New Roman']
    ]);
  } finally {
    global.captureEditorListStyleSelection = previous.capture;
    global.restoreEditorListStyleSelection = previous.restore;
    global.ec = previous.ec;
    global.updateFmtState = previous.updateFmtState;
  }
});

test('callEditorActionAndSync restores selection before running formatting action', () => {
  const calls = [];
  const previous = {
    capture: global.captureEditorListStyleSelection,
    restore: global.restoreEditorListStyleSelection,
    applyFontSize: global.applyFontSize,
    updateFmtState: global.updateFmtState
  };

  global.captureEditorListStyleSelection = () => calls.push('capture');
  global.restoreEditorListStyleSelection = () => calls.push('restore');
  global.applyFontSize = (value) => calls.push(['applyFontSize', value]);
  global.updateFmtState = () => calls.push('sync');

  try {
    bindings.callEditorActionAndSync('applyFontSize', '12');
    assert.deepEqual(calls.slice(0, 3), [
      'capture',
      'restore',
      ['applyFontSize', '12']
    ]);
  } finally {
    global.captureEditorListStyleSelection = previous.capture;
    global.restoreEditorListStyleSelection = previous.restore;
    global.applyFontSize = previous.applyFontSize;
    global.updateFmtState = previous.updateFmtState;
  }
});

test('bindEditorToolbarEvents routes select controls through selection-safe helpers', () => {
  const listeners = {};
  const makeElement = (id, value = '') => ({
    id,
    value,
    addEventListener(eventName, handler) {
      listeners[`${id}:${eventName}`] = handler;
    }
  });
  const elements = {
    etb: makeElement('etb'),
    fontsel: makeElement('fontsel', 'Georgia'),
    sizesel: makeElement('sizesel', '14'),
    lineSpacing: makeElement('lineSpacing', '2'),
    txtColor: makeElement('txtColor', '#111111'),
    hlColor: makeElement('hlColor', '#ffee00')
  };
  const calls = [];
  const previous = {
    document: global.document,
    capture: global.captureEditorListStyleSelection,
    restore: global.restoreEditorListStyleSelection,
    ec: global.ec,
    applyFontSize: global.applyFontSize,
    setLineSpacing: global.setLineSpacing,
    updateFmtState: global.updateFmtState
  };

  global.document = {
    getElementById(id) {
      return elements[id] || null;
    }
  };
  global.captureEditorListStyleSelection = () => calls.push('capture');
  global.restoreEditorListStyleSelection = () => calls.push('restore');
  global.ec = (cmd, val) => calls.push(['ec', cmd, val]);
  global.applyFontSize = (value) => calls.push(['applyFontSize', value]);
  global.setLineSpacing = (value) => calls.push(['setLineSpacing', value]);
  global.updateFmtState = () => calls.push('sync');

  try {
    bindings.bindEditorToolbarEvents();
    listeners['fontsel:change']({ target: { value: 'Georgia' } });
    listeners['sizesel:change']({ target: { value: '14' } });
    listeners['lineSpacing:change']({ target: { value: '2' } });
    listeners['txtColor:change']({ target: { value: '#111111' } });
    listeners['hlColor:change']({ target: { value: '#ffee00' } });

    assert.deepEqual(calls.filter((entry) => entry === 'capture'), [
      'capture',
      'capture',
      'capture',
      'capture',
      'capture'
    ]);
    assert.deepEqual(calls.filter((entry) => entry === 'restore'), [
      'restore',
      'restore',
      'restore',
      'restore',
      'restore'
    ]);
    assert.ok(calls.some((entry) => Array.isArray(entry) && entry[0] === 'ec' && entry[1] === 'fontName'));
    assert.ok(calls.some((entry) => Array.isArray(entry) && entry[0] === 'applyFontSize'));
    assert.ok(calls.some((entry) => Array.isArray(entry) && entry[0] === 'setLineSpacing'));
    assert.ok(calls.some((entry) => Array.isArray(entry) && entry[0] === 'ec' && entry[1] === 'foreColor'));
    assert.ok(calls.some((entry) => Array.isArray(entry) && entry[0] === 'ec' && entry[1] === 'hiliteColor'));
  } finally {
    global.document = previous.document;
    global.captureEditorListStyleSelection = previous.capture;
    global.restoreEditorListStyleSelection = previous.restore;
    global.ec = previous.ec;
    global.applyFontSize = previous.applyFontSize;
    global.setLineSpacing = previous.setLineSpacing;
    global.updateFmtState = previous.updateFmtState;
  }
});

test('toolbar mousedown captures select selection without blocking native dropdowns', () => {
  const listeners = {};
  const elements = {
    etb: {
      addEventListener(eventName, handler) {
        listeners[`etb:${eventName}`] = handler;
      }
    }
  };
  const calls = [];
  let prevented = false;
  const previous = {
    document: global.document,
    capture: global.captureEditorListStyleSelection
  };

  global.document = {
    getElementById(id) {
      return elements[id] || null;
    }
  };
  global.captureEditorListStyleSelection = () => calls.push('capture');

  try {
    bindings.bindEditorToolbarEvents();
    listeners['etb:mousedown']({
      target: {
        closest(selector) {
          if (selector === 'select,input[type="color"]') return { id: 'fontsel' };
          return null;
        }
      },
      preventDefault() {
        prevented = true;
      }
    });

    assert.deepEqual(calls, ['capture']);
    assert.equal(prevented, false);
  } finally {
    global.document = previous.document;
    global.captureEditorListStyleSelection = previous.capture;
  }
});

test('bindTopToolbarEvents wires bibliography export format actions', () => {
  const listeners = {};
  const makeElement = (id) => ({
    id,
    addEventListener(eventName, handler) {
      listeners[`${id}:${eventName}`] = handler;
    }
  });

  const elements = {
    ddExpApaTxtBtn: makeElement('ddExpApaTxtBtn'),
    ddExpChicagoTxtBtn: makeElement('ddExpChicagoTxtBtn'),
    ddExpVancouverTxtBtn: makeElement('ddExpVancouverTxtBtn'),
    ddExpCslJsonBtn: makeElement('ddExpCslJsonBtn')
  };
  const calls = [];
  const previous = {
    document: global.document,
    expBibliographyAPA: global.expBibliographyAPA,
    expBibliographyChicago: global.expBibliographyChicago,
    expBibliographyVancouver: global.expBibliographyVancouver,
    expCSLJSON: global.expCSLJSON,
    cdd: global.cdd
  };

  global.document = {
    getElementById(id) {
      return elements[id] || null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {}
  };
  global.expBibliographyAPA = () => calls.push('apa');
  global.expBibliographyChicago = () => calls.push('chicago');
  global.expBibliographyVancouver = () => calls.push('vancouver');
  global.expCSLJSON = () => calls.push('csl');
  global.cdd = () => calls.push('close');

  try {
    bindings.bindTopToolbarEvents();
    listeners['ddExpApaTxtBtn:click']();
    listeners['ddExpChicagoTxtBtn:click']();
    listeners['ddExpVancouverTxtBtn:click']();
    listeners['ddExpCslJsonBtn:click']();

    assert.deepEqual(calls, [
      'apa', 'close',
      'chicago', 'close',
      'vancouver', 'close',
      'csl', 'close'
    ]);
  } finally {
    global.document = previous.document;
    global.expBibliographyAPA = previous.expBibliographyAPA;
    global.expBibliographyChicago = previous.expBibliographyChicago;
    global.expBibliographyVancouver = previous.expBibliographyVancouver;
    global.expCSLJSON = previous.expCSLJSON;
    global.cdd = previous.cdd;
  }
});
