'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');

const { createBrowserCaptureLifecycle } = require('../src/main-process-capture-lifecycle.js');
const { DEFAULT_CAPTURE_PORT } = require('../src/main-process-browser-capture.js');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aq-cap-lc-'));
}

function makeStorage() {
  const calls = [];
  return {
    setBrowserCaptureSettings(patch) { calls.push(patch); },
    _patches: calls,
    _peek() {
      return calls.reduce((acc, p) => Object.assign(acc, p), {});
    }
  };
}

function makeAgentManager(overrides = {}) {
  return Object.assign({
    ensureRunning: async () => ({ ok: true, agentVersion: '1.0.0' }),
    stop: async () => ({ stopped: true }),
    syncLoginItem: () => ({ supported: true, enabled: true }),
    refreshStatusSnapshot: async () => ({ ok: true, agentVersion: '1.0.0' }),
    getLoginItemState: () => ({ supported: true, enabled: false })
  }, overrides);
}

function makeQueueDispatcher() {
  const queued = [];
  return {
    queuePayload(payload) {
      queued.push(payload);
      return { ok: true, queued: true, queueId: 'cap_test', message: 'queued' };
    },
    _queued: queued
  };
}

function makeShell(overrides = {}) {
  return Object.assign({
    openExternal: async () => true,
    openPath: async () => ''
  }, overrides);
}

function makeBaseDeps(overrides = {}) {
  const dir = tmpDir();
  const sourceDir = path.join(__dirname, '..', 'browser-capture-extension');
  const settings = {
    enabled: true,
    token: 'aq_token',
    port: DEFAULT_CAPTURE_PORT,
    browserFamily: 'chromium',
    defaultBrowserLabel: 'Chrome',
    defaultBrowserProgId: 'ChromeHTML',
    agentAutoStart: true,
    agentAutoStartSupported: true
  };
  return Object.assign({
    storage: makeStorage(),
    getSettings: () => Object.assign({}, settings),
    buildStatus: (extra) => Object.assign({
      enabled: true,
      browserFamily: 'chromium',
      installDir: '',
      installedExtensionVersion: '',
      bundledExtensionVersion: '',
      browserExecutablePath: '',
      extensionManagerUrl: 'chrome://extensions',
      installStrategy: { id: 'manual_dropin', supported: false }
    }, extra || {}),
    agentManager: makeAgentManager(),
    queueDispatcher: makeQueueDispatcher(),
    runtime: {
      bridge: null, lastBridgeEventAt: 0, lastHelloAt: 0,
      lastHelloPayload: null, stopAgentRequested: false
    },
    shell: makeShell(),
    appDir: dir,
    sourceDir,
    managedProfileDir: path.join(dir, 'managed-profile'),
    getCaptureTargets: () => ({ activeWorkspaceId: 'w1', workspaces: [{ id: 'w1', name: 'WS1' }] }),
    buildLookup: () => ({ ok: true }),
    createWorkspace: () => ({ id: 'w-new', name: 'Yeni' }),
    importCapture: async () => ({ ok: true, workspace: { id: 'w1' }, ref: { id: 'r1' } }),
    detectDefaultBrowser: async () => ({ browser: { family: 'chromium', label: 'Chrome' }, progId: 'ChromeHTML' }),
    detectBrowserOpenCommand: async () => '"C:\\Program Files\\Chrome\\chrome.exe" %1'
  }, overrides);
}

test('createBrowserCaptureLifecycle validates required deps', () => {
  assert.throws(() => createBrowserCaptureLifecycle({}));
  assert.throws(() => createBrowserCaptureLifecycle({ storage: {} }));
});

test('buildStartUrl produces local URL with token + port', () => {
  const lc = createBrowserCaptureLifecycle(makeBaseDeps());
  assert.equal(lc.buildStartUrl({ token: 'tok', port: 27183 }), 'http://127.0.0.1:27183/status?token=tok');
  assert.equal(lc.buildStartUrl({}), 'http://127.0.0.1:' + DEFAULT_CAPTURE_PORT + '/status?token=');
});

test('ensureManagedDirs creates the managed profile directory', () => {
  const deps = makeBaseDeps();
  const lc = createBrowserCaptureLifecycle(deps);
  assert.equal(fs.existsSync(deps.managedProfileDir), false);
  lc.ensureManagedDirs();
  assert.equal(fs.existsSync(deps.managedProfileDir), true);
});

test('refreshSettings detects browser + persists patch', async () => {
  const deps = makeBaseDeps();
  const lc = createBrowserCaptureLifecycle(deps);
  const result = await lc.refreshSettings();
  assert.equal(result.defaultBrowserLabel, 'Chrome');
  assert.equal(result.browserFamily, 'chromium');
  assert(deps.storage._patches.length >= 1);
  const persisted = deps.storage._peek();
  assert.equal(persisted.defaultBrowserLabel, 'Chrome');
});

test('refreshSettings honors agentAutoStart from injected loginItemState', async () => {
  const deps = makeBaseDeps({
    agentManager: makeAgentManager({ getLoginItemState: () => ({ supported: true, enabled: false }) })
  });
  const lc = createBrowserCaptureLifecycle(deps);
  const result = await lc.refreshSettings();
  assert.equal(result.agentAutoStartSupported, true);
  assert.equal(result.agentAutoStart, false);
});

test('openExtensionManager spawns browser if executable exists', async () => {
  const deps = makeBaseDeps();
  // Use the current Node executable as a fake "browser" so existsSync passes
  const fakeExecutable = process.execPath;
  const status = { extensionManagerUrl: 'chrome://extensions', browserExecutablePath: fakeExecutable };
  const lc = createBrowserCaptureLifecycle(deps);
  const result = await lc.openExtensionManager(status);
  assert.equal(result.ok, true);
  assert.equal(result.managerUrl, 'chrome://extensions');
});

test('openExtensionManager falls back to shell.openExternal when no executable', async () => {
  let openedUrl = '';
  const deps = makeBaseDeps({
    shell: makeShell({ openExternal: async (url) => { openedUrl = url; return true; } })
  });
  const lc = createBrowserCaptureLifecycle(deps);
  const result = await lc.openExtensionManager({ extensionManagerUrl: 'chrome://extensions' });
  assert.equal(result.ok, true);
  assert.equal(openedUrl, 'chrome://extensions');
});

test('openExtensionManager returns error when no manager URL', async () => {
  const lc = createBrowserCaptureLifecycle(makeBaseDeps());
  const result = await lc.openExtensionManager({});
  assert.equal(result.ok, false);
  assert.match(result.error, /Extension manager adresi/);
});

test('openExtensionManager returns shell error when openExternal rejects', async () => {
  const deps = makeBaseDeps({
    shell: makeShell({ openExternal: async () => { throw new Error('protocol blocked'); } })
  });
  const lc = createBrowserCaptureLifecycle(deps);
  const result = await lc.openExtensionManager({ extensionManagerUrl: 'chrome://extensions' });
  assert.equal(result.ok, false);
  assert.match(result.error, /protocol blocked/);
});

test('runLifecycle(test) reports ready when agent ping ok', async () => {
  const deps = makeBaseDeps();
  const lc = createBrowserCaptureLifecycle(deps);
  const result = await lc.runLifecycle('test');
  assert.equal(result.ok, true);
  assert.equal(result.action, 'test');
  assert.match(result.message, /hazir/);
  const last = deps.storage._patches[deps.storage._patches.length - 1];
  assert.equal(last.lifecycleState, 'ready');
});

test('runLifecycle(test) reports failure when agent ping returns null', async () => {
  const deps = makeBaseDeps({
    agentManager: makeAgentManager({ refreshStatusSnapshot: async () => null })
  });
  const lc = createBrowserCaptureLifecycle(deps);
  const result = await lc.runLifecycle('test');
  assert.equal(result.ok, false);
  assert.match(result.message, /baglanti dogrulanamadi/);
});

test('runLifecycle(stop_agent) calls agentManager.stop and sets stopAgentRequested', async () => {
  let stopped = false;
  const deps = makeBaseDeps({
    agentManager: makeAgentManager({ stop: async () => { stopped = true; return { stopped: true }; } })
  });
  const lc = createBrowserCaptureLifecycle(deps);
  const result = await lc.runLifecycle('stop_agent');
  assert.equal(result.ok, true);
  assert.equal(stopped, true);
  assert.equal(deps.runtime.stopAgentRequested, true);
});

test('runLifecycle(restart_agent) clears stopAgentRequested and calls ensureRunning', async () => {
  let ensureCalls = 0;
  const deps = makeBaseDeps({
    agentManager: makeAgentManager({
      ensureRunning: async () => { ensureCalls += 1; return { ok: true, agentVersion: '1.0.0' }; }
    })
  });
  deps.runtime.stopAgentRequested = true;
  const lc = createBrowserCaptureLifecycle(deps);
  const result = await lc.runLifecycle('restart_agent');
  assert.equal(result.ok, true);
  assert.equal(deps.runtime.stopAgentRequested, false);
  assert.equal(ensureCalls, 1);
});

test('runLifecycle(unknown action) returns ok=false', async () => {
  const lc = createBrowserCaptureLifecycle(makeBaseDeps());
  const result = await lc.runLifecycle('mystery');
  assert.equal(result.ok, false);
  assert.match(result.error, /Bilinmeyen/);
});

test('startBridge sets runtime.bridge on success', async () => {
  // We use a fresh port to avoid collision
  const deps = makeBaseDeps({
    getSettings: () => ({ token: 'tok', port: 32_700 }),
    buildStatus: () => ({ extensionManagerUrl: '', browserExecutablePath: '' })
  });
  const lc = createBrowserCaptureLifecycle(deps);
  try {
    const bound = await lc.startBridge();
    assert(bound && bound.port, 'bridge bound to a port');
    assert(deps.runtime.bridge, 'runtime.bridge set');
  } finally {
    if (deps.runtime.bridge) {
      try { await deps.runtime.bridge.close(); } catch (_e) {}
    }
  }
});
