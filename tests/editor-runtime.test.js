const test = require('node:test');
const assert = require('node:assert/strict');

// Editor runtime keeps module-scoped timers (state.refTimer /
// state.academicTimer / state.tocTimer). When one test schedules a deferred
// sync that fires later than expected, it can land inside the next test's
// assertion window and trigger that test's freshly-defined globals (e.g.
// updateRefSection), producing spurious extra entries in the calls log.
// Clear pending timers and any globals that our deferred helpers probe
// before every test so each run starts from a clean slate.
test.beforeEach(() => {
  try {
    const runtime = require('../src/editor-runtime.js');
    if(typeof runtime.resetPendingTimers === 'function'){
      runtime.resetPendingTimers();
    }
  } catch(_e) {}
  [
    'uSt', 'save', 'updatePageHeight', 'updateFmtState',
    'normalizeCitationSpans', 'AQAcademicObjects',
    'rRefs', 'scheduleRefSectionSync', 'updateRefSection',
    'autoUpdateTOC', 'refreshDocumentOutlineIfOpen', 'refreshCaptionManagerIfOpen',
    'checkTrig', 'AQCitationRuntime', '__aqDocSwitching'
  ].forEach((key) => { delete globalThis[key]; });
});

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
  globalThis.AQAcademicObjects = {
    normalizeDocument(options) {
      calls.push(['academic', options && options.root ? 'root' : 'none']);
    }
  };
  const runtime = require('../src/editor-runtime.js');
  runtime.runContentApplyEffects({
    target: 'pm-root',
    onApplied: () => { calls.push(['applied']); },
    afterLayout: () => { calls.push(['after']); },
    refreshTrigger: false,
    // Pin the academic-objects timer so the test isn't at the mercy of the
    // default 140ms delay plus OS timer slop on slower CI machines.
    academicDelay: 20
  });
  // Poll up to ~600ms for the academic callback to land. setTimeout precision
  // in Node on Windows can be quite coarse, so a fixed short wait was flaky.
  const deadline = Date.now() + 600;
  while(Date.now() < deadline && !calls.some(c => c[0] === 'academic')){
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.deepEqual(calls.slice(0, 4), [
    ['normalize', 'pm-root'],
    ['layout'],
    ['applied'],
    ['after']
  ]);
  assert.deepEqual(calls[calls.length - 1], ['academic', 'root']);
  delete globalThis.normalizeCitationSpans;
  delete globalThis.updatePageHeight;
  delete globalThis.AQAcademicObjects;
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

test('runDocumentLoadEffects skips stale token callbacks', async () => {
  const calls = [];
  globalThis.normalizeCitationSpans = () => { calls.push(['normalize']); };
  globalThis.updateRefSection = () => { calls.push(['refs']); };
  globalThis.uSt = () => { calls.push(['status']); };
  globalThis.save = () => { calls.push(['save']); };
  globalThis.updatePageHeight = () => { calls.push(['layout']); };

  const runtime = require('../src/editor-runtime.js');
  runtime.runDocumentLoadEffects({
    token: 'stale-load',
    isTokenActive() {
      return false;
    },
    beforeApply() {
      calls.push(['before']);
    },
    afterLayout() {
      calls.push(['after']);
    }
  });

  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(calls, []);

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
