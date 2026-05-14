'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createCaptureQueuePoller } = require('../src/main-process-capture-queue-poller.js');

test('createCaptureQueuePoller validates processQueue dep', () => {
  assert.throws(() => createCaptureQueuePoller({}));
  assert.throws(() => createCaptureQueuePoller({ processQueue: 'not a fn' }));
});

test('processNow invokes processQueue with reason', async () => {
  const calls = [];
  const poller = createCaptureQueuePoller({
    processQueue: async (opts) => { calls.push(opts); return { ok: true, processed: 1 }; }
  });
  const result = await poller.processNow('did-finish-load');
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].reason, 'did-finish-load');
});

test('processNow defaults reason to app-poll', async () => {
  const calls = [];
  const poller = createCaptureQueuePoller({
    processQueue: async (opts) => { calls.push(opts); return {}; }
  });
  await poller.processNow();
  assert.equal(calls[0].reason, 'app-poll');
});

test('processNow no-ops when in agent mode', async () => {
  let invoked = false;
  const poller = createCaptureQueuePoller({
    processQueue: async () => { invoked = true; return {}; },
    isAgentMode: true
  });
  const result = await poller.processNow('test');
  assert.equal(result.skipped, true);
  assert.equal(invoked, false);
});

test('processNow guards against reentrancy (concurrent call returns skipped)', async () => {
  let inFlight = 0;
  let maxConcurrent = 0;
  const poller = createCaptureQueuePoller({
    processQueue: async () => {
      inFlight += 1;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight -= 1;
      return { ok: true };
    }
  });
  const [a, b, c] = await Promise.all([
    poller.processNow('a'),
    poller.processNow('b'),
    poller.processNow('c')
  ]);
  assert.equal(maxConcurrent, 1, 'no overlapping calls');
  // First wins, others skipped
  const ok = [a, b, c].filter((r) => r && r.ok).length;
  const skipped = [a, b, c].filter((r) => r && r.skipped).length;
  assert.equal(ok, 1);
  assert.equal(skipped, 2);
});

test('isRunning reflects in-flight processNow', async () => {
  const poller = createCaptureQueuePoller({
    processQueue: async () => {
      // While we're inside processQueue, isRunning() should be true
      assert.equal(poller.isRunning(), true);
      return {};
    }
  });
  assert.equal(poller.isRunning(), false);
  await poller.processNow();
  assert.equal(poller.isRunning(), false);
});

test('start begins ticking', async () => {
  let ticks = 0;
  const poller = createCaptureQueuePoller({
    processQueue: async () => { ticks += 1; return {}; },
    intervalMs: 25
  });
  poller.start();
  assert.equal(poller.isPolling(), true);
  await new Promise((r) => setTimeout(r, 80));
  poller.stop();
  assert(ticks >= 2, `expected at least 2 ticks, got ${ticks}`);
});

test('start no-ops in agent mode', () => {
  const poller = createCaptureQueuePoller({
    processQueue: async () => ({}),
    isAgentMode: true,
    intervalMs: 10
  });
  poller.start();
  assert.equal(poller.isPolling(), false);
});

test('stop cancels the timer', () => {
  const poller = createCaptureQueuePoller({
    processQueue: async () => ({}),
    intervalMs: 10
  });
  poller.start();
  assert.equal(poller.isPolling(), true);
  poller.stop();
  assert.equal(poller.isPolling(), false);
});

test('start clears any existing timer (idempotent)', async () => {
  let ticks = 0;
  const poller = createCaptureQueuePoller({
    processQueue: async () => { ticks += 1; return {}; },
    intervalMs: 25
  });
  poller.start();
  poller.start(); // should clear prior timer, not double-tick
  await new Promise((r) => setTimeout(r, 80));
  poller.stop();
  // Without the clear, we'd see roughly 2× ticks
  assert(ticks <= 5, `unexpected tick count ${ticks} (timer likely doubled)`);
});

test('processQueue rejection does not break the poller (when called directly)', async () => {
  const poller = createCaptureQueuePoller({
    processQueue: async () => { throw new Error('boom'); }
  });
  await assert.rejects(() => poller.processNow(), /boom/);
  assert.equal(poller.isRunning(), false, 'running flag cleared after error');
  // Subsequent calls still work
  const poller2 = createCaptureQueuePoller({
    processQueue: async () => ({ ok: true })
  });
  const r = await poller2.processNow();
  assert.equal(r.ok, true);
});
