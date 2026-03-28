const test = require('node:test');
const assert = require('node:assert/strict');

test('editor runtime exports orchestration helpers', () => {
  delete globalThis.AQEditorRuntime;
  const runtime = require('../src/editor-runtime.js');
  assert.equal(typeof runtime.init, 'function');
  assert.equal(typeof runtime.onEditorUpdate, 'function');
  assert.equal(typeof runtime.handleMutation, 'function');
  assert.equal(typeof runtime.runContentApplyEffects, 'function');
  assert.equal(typeof runtime.syncCommandUI, 'function');
  assert.equal(typeof runtime.runDocumentLoadEffects, 'function');
});

test('handleMutation syncs chrome and layout when not switching docs', () => {
  let status = 0;
  let save = 0;
  let layout = 0;
  globalThis.uSt = () => { status++; };
  globalThis.save = () => { save++; };
  globalThis.updatePageHeight = () => { layout++; };
  globalThis.__aqDocSwitching = false;
  const runtime = require('../src/editor-runtime.js');
  const ok = runtime.handleMutation();
  assert.equal(ok, true);
  assert.equal(status, 1);
  assert.equal(save, 1);
  assert.equal(layout, 1);
  delete globalThis.uSt;
  delete globalThis.save;
  delete globalThis.updatePageHeight;
  delete globalThis.__aqDocSwitching;
});

test('runContentApplyEffects schedules normalize, layout and callbacks', async () => {
  const calls = [];
  globalThis.normalizeCitationSpans = (target) => { calls.push(['normalize', target]); };
  globalThis.updatePageHeight = () => { calls.push(['layout']); };
  const runtime = require('../src/editor-runtime.js');
  runtime.runContentApplyEffects({
    target: 'pm-root',
    onApplied: () => { calls.push(['applied']); },
    afterLayout: () => { calls.push(['after']); },
    refreshTrigger: false
  });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(calls, [
    ['normalize', 'pm-root'],
    ['layout'],
    ['applied'],
    ['after']
  ]);
  delete globalThis.normalizeCitationSpans;
  delete globalThis.updatePageHeight;
});

test('runContentApplyEffects can sync editor chrome', async () => {
  const calls = [];
  globalThis.uSt = () => { calls.push(['status']); };
  globalThis.save = () => { calls.push(['save']); };
  const runtime = require('../src/editor-runtime.js');
  runtime.runContentApplyEffects({
    normalize:false,
    layout:false,
    syncChrome:true,
    refreshTrigger:false
  });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(calls, [
    ['status'],
    ['save']
  ]);
  delete globalThis.uSt;
  delete globalThis.save;
});

test('runContentApplyEffects can render refs and schedule ref sync', async () => {
  const calls = [];
  globalThis.rRefs = () => { calls.push(['refs']); };
  globalThis.scheduleRefSectionSync = () => { calls.push(['syncRefs']); };
  const runtime = require('../src/editor-runtime.js');
  runtime.runContentApplyEffects({
    normalize:false,
    layout:false,
    syncChrome:false,
    renderRefs:true,
    syncRefs:true,
    refDelay:1,
    refreshTrigger:false
  });
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.deepEqual(calls, [
    ['refs'],
    ['syncRefs']
  ]);
  delete globalThis.rRefs;
  delete globalThis.scheduleRefSectionSync;
});

test('syncCommandUI syncs chrome and format state', () => {
  const calls = [];
  globalThis.uSt = () => { calls.push('status'); };
  globalThis.save = () => { calls.push('save'); };
  globalThis.updateFmtState = () => { calls.push('format'); };
  const runtime = require('../src/editor-runtime.js');
  runtime.syncCommandUI();
  assert.deepEqual(calls, ['status', 'save', 'format']);
  delete globalThis.uSt;
  delete globalThis.save;
  delete globalThis.updateFmtState;
});

test('runDocumentLoadEffects applies normalize, refs, chrome and layout', async () => {
  const calls = [];
  globalThis.normalizeCitationSpans = (target) => { calls.push(['normalize', target]); };
  globalThis.updateRefSection = () => { calls.push(['refs']); };
  globalThis.uSt = () => { calls.push(['status']); };
  globalThis.save = () => { calls.push(['save']); };
  globalThis.updatePageHeight = () => { calls.push(['layout']); };
  const runtime = require('../src/editor-runtime.js');
  runtime.runDocumentLoadEffects({
    target: 'doc-root',
    beforeApply(){ calls.push(['before']); },
    focusToEnd: true,
    focusToEndFn(){ calls.push(['focus-end']); },
    afterLayout(){ calls.push(['after']); }
  });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(calls, [
    ['before'],
    ['normalize', 'doc-root'],
    ['focus-end'],
    ['refs'],
    ['status'],
    ['save'],
    ['layout'],
    ['after']
  ]);
  delete globalThis.normalizeCitationSpans;
  delete globalThis.updateRefSection;
  delete globalThis.uSt;
  delete globalThis.save;
  delete globalThis.updatePageHeight;
});

test('init completes without binding blank-surface focus hacks', () => {
  let layout = 0;
  globalThis.updatePageHeight = () => { layout++; };

  const runtime = require('../src/editor-runtime.js');
  const ok = runtime.init();

  assert.equal(ok, true);
  assert.equal(layout, 1);

  delete globalThis.updatePageHeight;
});
