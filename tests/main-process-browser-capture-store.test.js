'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createBrowserCaptureStore, PENDING_CAPTURE_LIMIT } = require('../src/main-process-browser-capture-store.js');
const { DEFAULT_CAPTURE_PORT } = require('../src/main-process-browser-capture.js');

function createFakeStorage(initial) {
  let settings = JSON.parse(JSON.stringify(initial || {}));
  return {
    getBrowserCaptureSettings() {
      return JSON.parse(JSON.stringify(settings || {}));
    },
    setBrowserCaptureSettings(patch) {
      settings = Object.assign({}, settings, patch || {});
    },
    getSettingsSnapshot() {
      return { browserCapture: JSON.parse(JSON.stringify(settings || {})) };
    },
    _peek() { return settings; }
  };
}

test('createBrowserCaptureStore throws without storage methods', () => {
  assert.throws(() => createBrowserCaptureStore({}));
  assert.throws(() => createBrowserCaptureStore({ storage: {} }));
  assert.throws(() => createBrowserCaptureStore({ storage: { getBrowserCaptureSettings: () => ({}) } }));
});

test('createCaptureToken returns prefixed 64-hex string', () => {
  const store = createBrowserCaptureStore({ storage: createFakeStorage() });
  const a = store.createCaptureToken();
  const b = store.createCaptureToken();
  assert.match(a, /^aq_[0-9a-f]{64}$/);
  assert.notEqual(a, b, 'tokens should differ');
});

test('getSettings auto-provisions missing token (port already defaulted by normalize)', () => {
  const storage = createFakeStorage({});
  const store = createBrowserCaptureStore({ storage });
  const settings = store.getSettings();
  assert.match(settings.token, /^aq_[0-9a-f]{64}$/);
  assert.equal(settings.port, DEFAULT_CAPTURE_PORT);
  // Token must be persisted so subsequent calls reuse it
  const peek = storage._peek();
  assert.equal(peek.token, settings.token);
  // Calling again must NOT mint a new token
  const second = store.getSettings();
  assert.equal(second.token, settings.token);
});

test('getSettings preserves existing token + port', () => {
  const existing = { token: 'aq_existing', port: 31337 };
  const storage = createFakeStorage(existing);
  const store = createBrowserCaptureStore({ storage });
  const settings = store.getSettings();
  assert.equal(settings.token, 'aq_existing');
  assert.equal(settings.port, 31337);
});

test('getPersistedPendingCaptures returns [] when no snapshot data', () => {
  const store = createBrowserCaptureStore({ storage: createFakeStorage() });
  assert.deepEqual(store.getPersistedPendingCaptures(), []);
});

test('getPersistedPendingCaptures skips entries missing id or detectable payload', () => {
  const storage = createFakeStorage({
    pendingPayloads: [
      { id: 'good', payload: { detectedTitle: 'Paper A', sourcePageUrl: 'https://x.com' } },
      { id: '', payload: { detectedTitle: 'No id' } },
      { id: 'noBody', payload: {} },
      { id: 'urlOnly', payload: { sourcePageUrl: 'https://example.org/article' } }
    ]
  });
  const store = createBrowserCaptureStore({ storage });
  const out = store.getPersistedPendingCaptures();
  assert.equal(out.length, 2);
  assert.equal(out[0].id, 'good');
  assert.equal(out[1].id, 'urlOnly');
});

test('savePersistedPendingCaptures normalizes and caps at PENDING_CAPTURE_LIMIT', () => {
  const storage = createFakeStorage();
  const store = createBrowserCaptureStore({ storage });
  const many = Array.from({ length: PENDING_CAPTURE_LIMIT + 5 }, (_, i) => ({
    id: `e${i}`,
    payload: { detectedTitle: `Paper ${i}` }
  }));
  const saved = store.savePersistedPendingCaptures(many);
  assert.equal(saved.length, PENDING_CAPTURE_LIMIT);
  // The most recent items should win (slice(-LIMIT))
  assert.equal(saved[saved.length - 1].id, `e${PENDING_CAPTURE_LIMIT + 4}`);
  assert.equal(saved[0].id, `e5`);
});

test('persistPending appends entry and dedupes by queueId', () => {
  const storage = createFakeStorage();
  const store = createBrowserCaptureStore({ storage });

  const r1 = store.persistPending({ queueId: 'q1', detectedTitle: 'Paper One' });
  assert.equal(r1.entry.id, 'q1');
  assert.equal(r1.all.length, 1);

  const r2 = store.persistPending({ queueId: 'q2', detectedTitle: 'Paper Two' });
  assert.equal(r2.all.length, 2);

  // Persisting the same queueId should replace, not duplicate
  const r3 = store.persistPending({ queueId: 'q1', detectedTitle: 'Paper One v2' });
  assert.equal(r3.all.length, 2);
  const q1Entry = r3.all.find((e) => e.id === 'q1');
  assert.equal(q1Entry.payload.detectedTitle, 'Paper One v2');
});

test('persistPending auto-generates id when queueId missing', () => {
  const store = createBrowserCaptureStore({ storage: createFakeStorage() });
  const r = store.persistPending({ detectedTitle: 'No queueId' });
  assert.match(r.entry.id, /^cap_/);
});

test('acknowledgePending removes entry and returns id', () => {
  const storage = createFakeStorage({
    pendingPayloads: [
      { id: 'keep', payload: { detectedTitle: 'Stay' } },
      { id: 'drop', payload: { detectedTitle: 'Go' } }
    ]
  });
  const store = createBrowserCaptureStore({ storage });
  const result = store.acknowledgePending('drop');
  assert.equal(result.ok, true);
  assert.equal(result.id, 'drop');
  assert.equal(result.next.length, 1);
  assert.equal(result.next[0].id, 'keep');
});

test('acknowledgePending rejects empty/invalid id', () => {
  const store = createBrowserCaptureStore({ storage: createFakeStorage() });
  const result = store.acknowledgePending('');
  assert.equal(result.ok, false);
  assert.match(result.error, /Geçersiz/);
});

test('acknowledgePending is idempotent (no-op for unknown id)', () => {
  const storage = createFakeStorage({
    pendingPayloads: [{ id: 'one', payload: { detectedTitle: 'Solo' } }]
  });
  const store = createBrowserCaptureStore({ storage });
  const result = store.acknowledgePending('unknown');
  assert.equal(result.ok, true);
  assert.equal(result.next.length, 1, 'queue unchanged');
});

test('store does not leak crypto state between instances', () => {
  const a = createBrowserCaptureStore({ storage: createFakeStorage() });
  const b = createBrowserCaptureStore({ storage: createFakeStorage() });
  assert.notEqual(a.createCaptureToken(), b.createCaptureToken());
});

test('round-trip: persist then acknowledge restores empty queue', () => {
  const storage = createFakeStorage();
  const store = createBrowserCaptureStore({ storage });
  const r = store.persistPending({ queueId: 'q', detectedTitle: 'X' });
  assert.equal(r.all.length, 1);
  const ack = store.acknowledgePending('q');
  assert.equal(ack.ok, true);
  assert.equal(ack.next.length, 0);
  // Verify storage actually persisted the empty state
  const fresh = store.getPersistedPendingCaptures();
  assert.equal(fresh.length, 0);
});
