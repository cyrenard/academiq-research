'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { createCaptureStatusBuilder } = require('../src/main-process-capture-status-builder.js');
const { DEFAULT_CAPTURE_PORT, BROWSER_CAPTURE_PROTOCOL_VERSION } = require('../src/main-process-browser-capture.js');

const FAKE_SOURCE_DIR = path.join(__dirname, '..', 'browser-capture-extension');

function makeFakeStorage(overrides = {}) {
  return Object.assign({
    loadCaptureAgentState: () => ({}),
    loadCaptureQueue: () => ({ items: [] })
  }, overrides);
}

function makeFakeWindow() {
  const sent = [];
  let destroyed = false;
  return {
    sent,
    isDestroyed: () => destroyed,
    destroy() { destroyed = true; },
    webContents: {
      send(channel, payload) { sent.push({ channel, payload }); }
    }
  };
}

function baseSettings(overrides = {}) {
  return Object.assign({
    enabled: true,
    agentAutoStart: true,
    agentAutoStartSupported: true,
    port: DEFAULT_CAPTURE_PORT,
    token: 'aq_token',
    browserFamily: 'chromium',
    defaultBrowserLabel: 'Chrome',
    defaultBrowserProgId: 'ChromeHTML',
    autoAttachPdfUrl: true,
    focusImportedWorkspace: false,
    lastUsedWorkspaceId: '',
    lastUsedComparisonId: ''
  }, overrides);
}

function makeBuilder(opts = {}) {
  return createCaptureStatusBuilder(Object.assign({
    getSettings: () => baseSettings(),
    getMainWindow: () => makeFakeWindow(),
    storage: makeFakeStorage(),
    runtime: { lastHelloPayload: null, lastHelloAt: 0 },
    sourceDir: FAKE_SOURCE_DIR,
    appVersion: '1.0.0',
    getLatestStateJSON: () => ''
  }, opts));
}

test('createCaptureStatusBuilder validates required deps', () => {
  assert.throws(() => createCaptureStatusBuilder({}));
  assert.throws(() => createCaptureStatusBuilder({ getSettings: () => ({}) }));
  assert.throws(() => createCaptureStatusBuilder({
    getSettings: () => ({}), getMainWindow: () => null
  }));
  assert.throws(() => createCaptureStatusBuilder({
    getSettings: () => ({}), getMainWindow: () => null, runtime: {}
  }));
});

test('buildStatus produces a complete settings/agent status object', () => {
  const builder = makeBuilder({
    storage: makeFakeStorage({
      loadCaptureAgentState: () => ({
        running: true,
        pid: 9999,
        port: DEFAULT_CAPTURE_PORT,
        agentVersion: '1.0.0',
        protocolVersion: BROWSER_CAPTURE_PROTOCOL_VERSION,
        lastHelloAt: 12345,
        lastCaptureReceivedAt: 67890
      })
    })
  });
  const s = builder.buildStatus();
  assert.equal(s.enabled, true);
  assert.equal(s.tokenReady, true);
  assert.equal(s.agentRunning, true);
  assert.equal(s.agentPid, 9999);
  assert.equal(s.bridgeConnected, true);
  assert.equal(s.browserCaptureProtocolVersion, BROWSER_CAPTURE_PROTOCOL_VERSION);
  assert.equal(s.lastHelloAt, 12345);
  assert.equal(s.lastCaptureReceivedAt, 67890);
  assert.equal(typeof s.installStrategy, 'object');
  assert.equal(typeof s.setupState, 'string');
});

test('buildStatus reflects offline agent state', () => {
  const builder = makeBuilder({
    storage: makeFakeStorage({
      loadCaptureAgentState: () => ({ running: false, pid: 0 })
    })
  });
  const s = builder.buildStatus();
  assert.equal(s.agentRunning, false);
  assert.equal(s.bridgeConnected, false);
  assert.equal(s.bridgeReady, false);
  assert.equal(s.agentPid, 0);
});

test('buildStatus rolls up queue stats and recent activity', () => {
  const now = Date.now();
  const builder = makeBuilder({
    storage: makeFakeStorage({
      loadCaptureQueue: () => ({
        items: [
          { id: 'a', status: 'queued', updatedAt: now - 5000, payload: { detectedTitle: 'A' } },
          { id: 'b', status: 'queued', nextRetryAt: now + 30_000, updatedAt: now - 1000, payload: { detectedTitle: 'B' } },
          { id: 'c', status: 'failed', updatedAt: now - 200, lastError: 'boom', payload: { detectedTitle: 'C' } },
          { id: 'd', status: 'imported', updatedAt: now - 100, payload: { detectedTitle: 'D' } }
        ]
      })
    })
  });
  const s = builder.buildStatus();
  assert.equal(s.queueLength, 2, 'queued items count');
  assert.equal(s.queueStats.queued, 1);
  assert.equal(s.queueStats.waitingRetry, 1);
  assert.equal(s.queueStats.failed, 1);
  assert.equal(s.queueStats.imported, 1);
  assert(Array.isArray(s.recentQueueItems));
  assert(s.recentQueueItems.length > 0);
});

test('buildStatus accepts and merges extra overrides', () => {
  const builder = makeBuilder();
  const s = builder.buildStatus({ customFlag: true, lastError: 'override' });
  assert.equal(s.customFlag, true);
  assert.equal(s.lastError, 'override');
});

test('buildStatus prefers live extension hello over stale persisted version', () => {
  const builder = makeBuilder({
    getSettings: () => baseSettings({
      installDir: 'C:/AcademiQ/browser-capture-extension/chromium',
      installedExtensionVersion: '1.0.0',
      installedProtocolVersion: BROWSER_CAPTURE_PROTOCOL_VERSION
    }),
    runtime: {
      lastHelloPayload: {
        extensionVersion: '1.0.1',
        protocolVersion: BROWSER_CAPTURE_PROTOCOL_VERSION
      },
      lastHelloAt: Date.now()
    }
  });
  const s = builder.buildStatus();
  assert.equal(s.installedExtensionVersion, '1.0.1');
  assert.equal(s.updateAvailable, false);
});

test('buildStatus tolerates storage without optional methods', () => {
  const builder = makeBuilder({ storage: {} });
  const s = builder.buildStatus();
  assert.equal(s.queueLength, 0);
  assert.equal(s.agentRunning, false);
});

test('notifyStateChanged sends to mainWindow when alive', () => {
  const win = makeFakeWindow();
  const builder = makeBuilder({ getMainWindow: () => win });
  const ok = builder.notifyStateChanged({ reason: 'capture-imported', refId: 'r1' });
  assert.equal(ok, true);
  assert.equal(win.sent.length, 1);
  assert.equal(win.sent[0].channel, 'browserCapture:stateChanged');
  assert.equal(win.sent[0].payload.reason, 'capture-imported');
});

test('notifyStateChanged returns false when window destroyed', () => {
  const win = makeFakeWindow();
  win.destroy();
  const builder = makeBuilder({ getMainWindow: () => win });
  const ok = builder.notifyStateChanged({ reason: 'x' });
  assert.equal(ok, false);
  assert.equal(win.sent.length, 0);
});

test('notifyStateChanged returns false when getMainWindow returns null', () => {
  const builder = makeBuilder({ getMainWindow: () => null });
  assert.equal(builder.notifyStateChanged({}), false);
});

test('notifyStateChanged coerces non-object detail to {}', () => {
  const win = makeFakeWindow();
  const builder = makeBuilder({ getMainWindow: () => win });
  builder.notifyStateChanged(null);
  builder.notifyStateChanged('string');
  assert.equal(win.sent.length, 2);
  assert.deepEqual(win.sent[0].payload, {});
  assert.deepEqual(win.sent[1].payload, {});
});

test('getCaptureTargets returns settings preferences', () => {
  const stateJSON = JSON.stringify({
    wss: [
      { id: 'w1', name: 'Workspace 1' },
      { id: 'w2', name: 'Workspace 2' }
    ],
    cur: 'w2'
  });
  const builder = makeBuilder({
    getSettings: () => baseSettings({ lastUsedWorkspaceId: 'w2', lastUsedComparisonId: 'literature-matrix' }),
    getLatestStateJSON: () => stateJSON
  });
  const t = builder.getCaptureTargets();
  assert.equal(t.preferredWorkspaceId, 'w2');
  assert.equal(t.preferredComparisonId, 'literature-matrix');
});

test('getCaptureTargets handles empty state JSON gracefully', () => {
  const builder = makeBuilder({ getLatestStateJSON: () => '' });
  const t = builder.getCaptureTargets();
  assert.equal(typeof t, 'object');
  assert.equal(t.preferredWorkspaceId, '');
});
