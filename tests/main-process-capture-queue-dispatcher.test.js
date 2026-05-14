'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createCaptureQueueDispatcher } = require('../src/main-process-capture-queue-dispatcher.js');

function makeRuntime() {
  return {
    bridge: null,
    ready: false,
    pendingPayloads: [],
    pendingWorkspaceEvents: [],
    deliveredPayloadIds: {},
    deliveredWorkspaceIds: {},
    flushTimer: null
  };
}

function makeFakeWindow() {
  const sent = [];
  let destroyed = false;
  let minimized = false;
  let visible = false;
  let focused = false;
  return {
    sent,
    isDestroyed: () => destroyed,
    isMinimized: () => minimized,
    show() { visible = true; },
    focus() { focused = true; },
    restore() { minimized = false; },
    destroy() { destroyed = true; },
    setMinimized(v) { minimized = v; },
    isVisible: () => visible,
    isFocused: () => focused,
    webContents: {
      send(channel, payload) {
        sent.push({ channel, payload });
      }
    }
  };
}

function makeFakeStore(initial = []) {
  let pending = initial.slice();
  return {
    getPersistedPendingCaptures: () => pending.slice(),
    persistPending(payload) {
      const id = (payload && payload.queueId) || ('cap_' + (pending.length + 1));
      const entry = { id, createdAt: Date.now(), payload };
      pending = pending.filter((p) => p.id !== id).concat([entry]);
      return { entry, all: pending.slice() };
    },
    _setPending(next) { pending = next.slice(); },
    _peek: () => pending.slice()
  };
}

function makeClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms) => { now += ms; }
  };
}

test('createCaptureQueueDispatcher validates required deps', () => {
  assert.throws(() => createCaptureQueueDispatcher({}));
  assert.throws(() => createCaptureQueueDispatcher({ runtime: makeRuntime() }));
  assert.throws(() => createCaptureQueueDispatcher({ runtime: makeRuntime(), getMainWindow: () => null }));
});

test('flushPending sends pending payloads to mainWindow as browserCapture:incoming', () => {
  const runtime = makeRuntime();
  const win = makeFakeWindow();
  const store = makeFakeStore([
    { id: 'q1', payload: { detectedTitle: 'A', sourcePageUrl: 'https://a.com' } },
    { id: 'q2', payload: { detectedTitle: 'B', sourcePageUrl: 'https://b.com' } }
  ]);
  const clock = makeClock();
  const d = createCaptureQueueDispatcher({ runtime, getMainWindow: () => win, store, nowFn: clock.now });
  d.flushPending();
  assert.equal(win.sent.length, 2);
  assert.equal(win.sent[0].channel, 'browserCapture:incoming');
  assert.equal(win.sent[0].payload.queueId, 'q1');
  assert.equal(win.sent[1].payload.queueId, 'q2');
});

test('flushPending dedupes deliveries within payloadResendIntervalMs', () => {
  const runtime = makeRuntime();
  const win = makeFakeWindow();
  const store = makeFakeStore([{ id: 'q1', payload: { detectedTitle: 'A' } }]);
  const clock = makeClock();
  const d = createCaptureQueueDispatcher({
    runtime,
    getMainWindow: () => win,
    store,
    nowFn: clock.now,
    payloadResendIntervalMs: 1500
  });
  d.flushPending();
  d.flushPending();
  assert.equal(win.sent.length, 1, 'second flush within window must not resend');

  clock.advance(1600);
  d.flushPending();
  assert.equal(win.sent.length, 2, 'after window expires, resend allowed');
});

test('flushPending no-op when window destroyed', () => {
  const runtime = makeRuntime();
  const win = makeFakeWindow();
  win.destroy();
  const store = makeFakeStore([{ id: 'q1', payload: { detectedTitle: 'A' } }]);
  const d = createCaptureQueueDispatcher({ runtime, getMainWindow: () => win, store, nowFn: () => 1 });
  d.flushPending();
  assert.equal(win.sent.length, 0);
});

test('flushPending retries pendingWorkspaceEvents up to maxWorkspaceAttempts', () => {
  const runtime = makeRuntime();
  runtime.pendingWorkspaceEvents = [
    { workspace: { id: 'ws1', name: 'WS1' }, attempts: 0 }
  ];
  const win = makeFakeWindow();
  const store = makeFakeStore();
  const clock = makeClock();
  const d = createCaptureQueueDispatcher({
    runtime,
    getMainWindow: () => win,
    store,
    nowFn: clock.now,
    workspaceResendIntervalMs: 100,
    maxWorkspaceAttempts: 3
  });
  for (let i = 0; i < 5; i += 1) {
    clock.advance(200);
    d.flushPending();
  }
  // Workspace event should have been sent 3 times then dropped from runtime
  const wsEvents = win.sent.filter((s) => s.channel === 'browserCapture:workspaceCreated');
  assert.equal(wsEvents.length, 3);
  assert.equal(runtime.pendingWorkspaceEvents.length, 0);
});

test('queuePayload rejects insufficient payload', () => {
  const runtime = makeRuntime();
  const win = makeFakeWindow();
  const store = makeFakeStore();
  const d = createCaptureQueueDispatcher({ runtime, getMainWindow: () => win, store, nowFn: () => 1 });
  const result = d.queuePayload({});
  assert.equal(result.ok, false);
  assert.match(result.error, /yetersiz/);
});

test('queuePayload persists, schedules flush, brings window forward', async () => {
  const runtime = makeRuntime();
  const win = makeFakeWindow();
  win.setMinimized(true);
  const store = makeFakeStore();
  const d = createCaptureQueueDispatcher({
    runtime,
    getMainWindow: () => win,
    store,
    nowFn: Date.now,
    minFlushDelayMs: 1
  });
  const result = d.queuePayload({ detectedTitle: 'New paper' });
  assert.equal(result.ok, true);
  // queueId is auto-generated since sanitizeCapturePayload strips queueId from payload
  assert.match(result.queueId, /^cap_/);
  assert.equal(win.isVisible(), true, 'window should be shown');
  assert.equal(win.isFocused(), true, 'window should be focused');
  assert.equal(win.isMinimized(), false, 'window should be restored');
  assert.equal(store._peek().length, 1);

  // Wait for flush to fire
  await new Promise((r) => setTimeout(r, 80));
  const incoming = win.sent.filter((s) => s.channel === 'browserCapture:incoming');
  assert.equal(incoming.length, 1);
  assert.equal(incoming[0].payload.queueId, result.queueId);
  d.clear();
});

test('queuePayload uses readyMessage vs notReadyMessage based on runtime.ready', () => {
  const runtime = makeRuntime();
  const store = makeFakeStore();
  const d = createCaptureQueueDispatcher({
    runtime, getMainWindow: () => makeFakeWindow(), store, nowFn: () => 1
  });
  const r1 = d.queuePayload({ detectedTitle: 'Paper' });
  assert.match(r1.message, /Uygulama hazır olduğunda/);
  runtime.ready = true;
  const r2 = d.queuePayload({ detectedTitle: 'Paper2' });
  assert.match(r2.message, /işleniyor/);
  d.clear();
});

test('scheduleFlush is debounced (only the latest delay wins) and clears after empty queue', async () => {
  const runtime = makeRuntime();
  const win = makeFakeWindow();
  const store = makeFakeStore([]); // empty queue → no reschedule
  let getCount = 0;
  const wrappedStore = Object.assign({}, store, {
    getPersistedPendingCaptures() {
      getCount += 1;
      return store.getPersistedPendingCaptures();
    }
  });
  const d = createCaptureQueueDispatcher({
    runtime, getMainWindow: () => win, store: wrappedStore, nowFn: Date.now,
    minFlushDelayMs: 1, defaultFlushDelayMs: 30, reFlushDelayMs: 100
  });
  d.scheduleFlush(500);
  d.scheduleFlush(20); // overrides previous
  await new Promise((r) => setTimeout(r, 80));
  assert(getCount >= 1, 'flush executed at least once');
  assert.equal(runtime.flushTimer, null, 'no reschedule when queue empty');
  d.clear();
});

test('pushWorkspaceEvent enqueues and triggers schedule', async () => {
  const runtime = makeRuntime();
  const win = makeFakeWindow();
  const store = makeFakeStore();
  const d = createCaptureQueueDispatcher({
    runtime, getMainWindow: () => win, store, nowFn: Date.now,
    minFlushDelayMs: 1
  });
  const ok = d.pushWorkspaceEvent({ workspace: { id: 'ws-x', name: 'New WS' } });
  assert.equal(ok, true);
  assert.equal(runtime.pendingWorkspaceEvents.length, 1);
  await new Promise((r) => setTimeout(r, 80));
  const events = win.sent.filter((s) => s.channel === 'browserCapture:workspaceCreated');
  assert.equal(events.length, 1);
  d.clear();
});

test('pushWorkspaceEvent rejects malformed event', () => {
  const runtime = makeRuntime();
  const d = createCaptureQueueDispatcher({
    runtime, getMainWindow: () => makeFakeWindow(), store: makeFakeStore(), nowFn: () => 1
  });
  assert.equal(d.pushWorkspaceEvent({}), false);
  assert.equal(d.pushWorkspaceEvent({ workspace: {} }), false);
  assert.equal(d.pushWorkspaceEvent(null), false);
});

test('clear cancels pending flushTimer', () => {
  const runtime = makeRuntime();
  const d = createCaptureQueueDispatcher({
    runtime, getMainWindow: () => makeFakeWindow(), store: makeFakeStore(), nowFn: () => 1
  });
  d.scheduleFlush(5000);
  assert(runtime.flushTimer, 'timer scheduled');
  d.clear();
  assert.equal(runtime.flushTimer, null);
});

test('hydratePendingFromStore mirrors store into runtime.pendingPayloads', () => {
  const runtime = makeRuntime();
  const store = makeFakeStore([
    { id: 'a', payload: { detectedTitle: 'A' } },
    { id: 'b', payload: { detectedTitle: 'B' } }
  ]);
  const d = createCaptureQueueDispatcher({
    runtime, getMainWindow: () => makeFakeWindow(), store, nowFn: () => 1
  });
  const result = d.hydratePendingFromStore();
  assert.equal(result.length, 2);
  assert.equal(runtime.pendingPayloads.length, 2);
  assert.equal(runtime.pendingPayloads[0].id, 'a');
});
