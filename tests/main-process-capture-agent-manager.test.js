'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createCaptureAgentManager } = require('../src/main-process-capture-agent-manager.js');

function makeFakeApp({ packaged = true, loginItemSupported = true } = {}) {
  const calls = { setLoginItem: [], getLoginItem: [] };
  let loginItemState = { openAtLogin: false };
  const app = {
    isPackaged: packaged,
    getAppPath: () => '/fake/app',
    getLoginItemSettings(args) {
      if (!loginItemSupported) throw new Error('not supported');
      calls.getLoginItem.push(args);
      return loginItemState;
    },
    setLoginItemSettings(args) {
      if (!loginItemSupported) throw new Error('not supported');
      calls.setLoginItem.push(args);
      loginItemState = { openAtLogin: !!args.openAtLogin };
    }
  };
  if (!loginItemSupported) {
    delete app.getLoginItemSettings;
    delete app.setLoginItemSettings;
  }
  return { app, calls, _setOpenAtLogin: (v) => { loginItemState = { openAtLogin: !!v }; } };
}

function makeFakeStorage() {
  let state = {};
  return {
    saveCaptureAgentState(next) { state = JSON.parse(JSON.stringify(next || {})); },
    loadCaptureAgentState() { return JSON.parse(JSON.stringify(state)); },
    _peek: () => state
  };
}

function makeFakeProcess({ platform = 'linux', defaultApp = false, execPath = '/fake/electron' } = {}) {
  return { platform, defaultApp, execPath, argv: [] };
}

function makeFakeFetch(responses) {
  const calls = [];
  return {
    calls,
    fetch: async (url, opts) => {
      calls.push({ url, opts });
      const resp = responses.shift();
      if (resp instanceof Error) throw resp;
      if (resp == null) throw new Error('no more responses');
      return resp;
    }
  };
}

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

test('createCaptureAgentManager validates required deps', () => {
  assert.throws(() => createCaptureAgentManager({}));
  assert.throws(() => createCaptureAgentManager({ app: {} }));
  assert.throws(() => createCaptureAgentManager({ app: {}, getBrowserSettings: () => ({}) }));
});

test('buildSpawnArgs includes app path only when process.defaultApp', () => {
  const { app } = makeFakeApp();
  const mgr = createCaptureAgentManager({
    app, getBrowserSettings: () => ({}), appVersion: '1.0.0',
    processRef: makeFakeProcess({ defaultApp: false })
  });
  assert.deepEqual(mgr.buildSpawnArgs(), ['--capture-agent']);

  const mgr2 = createCaptureAgentManager({
    app, getBrowserSettings: () => ({}), appVersion: '1.0.0',
    processRef: makeFakeProcess({ defaultApp: true })
  });
  const args = mgr2.buildSpawnArgs();
  assert.equal(args.length, 2);
  assert.equal(args[1], '--capture-agent');
});

test('buildAutoStartArgs appends autostart flag', () => {
  const { app } = makeFakeApp();
  const mgr = createCaptureAgentManager({
    app, getBrowserSettings: () => ({}), appVersion: '1.0.0',
    processRef: makeFakeProcess()
  });
  assert.deepEqual(mgr.buildAutoStartArgs(), ['--capture-agent', '--capture-agent-autostart']);
});

test('buildSpawnArgs honors custom captureAgentArg', () => {
  const { app } = makeFakeApp();
  const mgr = createCaptureAgentManager({
    app, getBrowserSettings: () => ({}), appVersion: '1.0.0',
    captureAgentArg: '--my-agent',
    captureAgentAutostartArg: '--my-autostart',
    processRef: makeFakeProcess()
  });
  assert.deepEqual(mgr.buildAutoStartArgs(), ['--my-agent', '--my-autostart']);
});

test('getLoginItemState reports unsupported on non-win32', () => {
  const { app } = makeFakeApp();
  const mgr = createCaptureAgentManager({
    app, getBrowserSettings: () => ({}), appVersion: '1.0.0',
    processRef: makeFakeProcess({ platform: 'linux' })
  });
  assert.deepEqual(mgr.getLoginItemState(), { supported: false, enabled: false });
});

test('getLoginItemState reports unsupported when app not packaged', () => {
  const { app } = makeFakeApp({ packaged: false });
  const mgr = createCaptureAgentManager({
    app, getBrowserSettings: () => ({}), appVersion: '1.0.0',
    processRef: makeFakeProcess({ platform: 'win32' })
  });
  assert.deepEqual(mgr.getLoginItemState(), { supported: false, enabled: false });
});

test('syncLoginItem patches Electron loginItem and reflects state', () => {
  const fakeApp = makeFakeApp();
  const mgr = createCaptureAgentManager({
    app: fakeApp.app, getBrowserSettings: () => ({}), appVersion: '1.0.0',
    processRef: makeFakeProcess({ platform: 'win32' })
  });
  const after = mgr.syncLoginItem(true);
  assert.equal(after.supported, true);
  assert.equal(after.enabled, true);
  assert.equal(fakeApp.calls.setLoginItem.length, 1);
  assert.equal(fakeApp.calls.setLoginItem[0].openAtLogin, true);
});

test('syncLoginItem becomes no-op on unsupported platform', () => {
  const fakeApp = makeFakeApp({ loginItemSupported: false });
  const mgr = createCaptureAgentManager({
    app: fakeApp.app, getBrowserSettings: () => ({}), appVersion: '1.0.0',
    processRef: makeFakeProcess({ platform: 'linux' })
  });
  const result = mgr.syncLoginItem(true);
  assert.equal(result.supported, false);
});

test('startDetached uses powershell on win32', async () => {
  const { app } = makeFakeApp();
  const spawnCalls = [];
  const fakeExecFile = (file, args, opts, cb) => {
    spawnCalls.push({ file, args, opts });
    setImmediate(() => cb && cb(null));
    return { unref() {} };
  };
  const mgr = createCaptureAgentManager({
    app, getBrowserSettings: () => ({}), appVersion: '1.0.0',
    processRef: makeFakeProcess({ platform: 'win32' }),
    execFileFn: fakeExecFile
  });
  await mgr.startDetached();
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].file, 'powershell.exe');
  assert.match(spawnCalls[0].args.join(' '), /Start-Process/);
});

test('startDetached spawns directly on non-win32', async () => {
  const { app } = makeFakeApp();
  const spawnCalls = [];
  const fakeExecFile = (file, args, opts, cb) => {
    spawnCalls.push({ file, args, opts });
    setImmediate(() => cb && cb(null));
    return { unref() {} };
  };
  const mgr = createCaptureAgentManager({
    app, getBrowserSettings: () => ({}), appVersion: '1.0.0',
    processRef: makeFakeProcess({ platform: 'linux' }),
    execFileFn: fakeExecFile
  });
  await mgr.startDetached();
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].file, '/fake/electron');
  assert.equal(spawnCalls[0].opts.detached, true);
});

test('pingStatus hits /status with token + returns JSON', async () => {
  const { fetch: fetchFn, calls } = makeFakeFetch([
    jsonResponse({ ok: true, agentVersion: '1.0.0', protocolVersion: 1 })
  ]);
  const { app } = makeFakeApp();
  const mgr = createCaptureAgentManager({
    app,
    getBrowserSettings: () => ({ port: 27183, token: 'tok-abc' }),
    appVersion: '1.0.0',
    fetchFn,
    processRef: makeFakeProcess()
  });
  const result = await mgr.pingStatus();
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /http:\/\/127\.0\.0\.1:27183\/status\?token=tok-abc/);
});

test('pingStatus throws on non-ok response', async () => {
  const { fetch: fetchFn } = makeFakeFetch([jsonResponse({}, false, 503)]);
  const { app } = makeFakeApp();
  const mgr = createCaptureAgentManager({
    app,
    getBrowserSettings: () => ({ port: 27183, token: 't' }),
    appVersion: '1.0.0',
    fetchFn,
    processRef: makeFakeProcess()
  });
  await assert.rejects(() => mgr.pingStatus(), /agent-status-503/);
});

test('refreshStatusSnapshot persists running=true on success', async () => {
  const { fetch: fetchFn } = makeFakeFetch([
    jsonResponse({ ok: true, agentPid: 1234, agentPort: 27183, agentVersion: '1.0.0', protocolVersion: 1 })
  ]);
  const storage = makeFakeStorage();
  const { app } = makeFakeApp();
  const mgr = createCaptureAgentManager({
    app,
    storage,
    getBrowserSettings: () => ({ port: 27183, token: 't' }),
    appVersion: '1.0.0',
    fetchFn,
    processRef: makeFakeProcess()
  });
  await mgr.refreshStatusSnapshot();
  const persisted = storage._peek();
  assert.equal(persisted.running, true);
  assert.equal(persisted.pid, 1234);
  assert.equal(persisted.agentVersion, '1.0.0');
  assert.equal(persisted.lastError, '');
});

test('refreshStatusSnapshot persists running=false on ping failure', async () => {
  const { fetch: fetchFn } = makeFakeFetch([new Error('econnrefused')]);
  const storage = makeFakeStorage();
  const { app } = makeFakeApp();
  const mgr = createCaptureAgentManager({
    app,
    storage,
    getBrowserSettings: () => ({ port: 27183, token: 't' }),
    appVersion: '1.0.0',
    fetchFn,
    processRef: makeFakeProcess()
  });
  const result = await mgr.refreshStatusSnapshot();
  assert.equal(result, null);
  const persisted = storage._peek();
  assert.equal(persisted.running, false);
  assert.equal(persisted.pid, 0);
  assert.match(persisted.lastError, /econnrefused/);
});

test('stop hits /agent/stop with token', async () => {
  const { fetch: fetchFn, calls } = makeFakeFetch([jsonResponse({ stopped: true })]);
  const { app } = makeFakeApp();
  const mgr = createCaptureAgentManager({
    app,
    getBrowserSettings: () => ({ port: 27183, token: 'tok-xyz' }),
    appVersion: '1.0.0',
    fetchFn,
    processRef: makeFakeProcess()
  });
  const result = await mgr.stop();
  assert.equal(result.stopped, true);
  assert.equal(calls[0].opts.method, 'POST');
  assert.match(calls[0].url, /\/agent\/stop\?token=tok-xyz/);
});

test('ensureRunning short-circuits when agent already alive with matching version', async () => {
  const { fetch: fetchFn, calls } = makeFakeFetch([
    jsonResponse({ ok: true, agentVersion: '2.1.0', protocolVersion: 1 })
  ]);
  const { app } = makeFakeApp();
  const mgr = createCaptureAgentManager({
    app,
    storage: makeFakeStorage(),
    getBrowserSettings: () => ({ port: 27183, token: 't' }),
    appVersion: '2.1.0',
    fetchFn,
    processRef: makeFakeProcess()
  });
  const live = await mgr.ensureRunning();
  assert.equal(live.ok, true);
  assert.equal(calls.length, 1, 'only ping, no spawn');
});

test('ensureRunning dedupes concurrent calls via startPromise', async () => {
  // First ping fails → triggers start; second ping succeeds; subsequent ensureRunning during start should return same promise
  const fetchFn = async (url) => {
    if (url.includes('/status')) {
      return jsonResponse({ ok: true, agentVersion: '1.0.0', protocolVersion: 1 });
    }
    return jsonResponse({});
  };
  let pingCount = 0;
  const flakyFetch = async (url, opts) => {
    if (url.includes('/status')) {
      pingCount += 1;
      if (pingCount === 1) throw new Error('not yet'); // first ping fails (agent not running)
      return jsonResponse({ ok: true, agentVersion: '1.0.0', protocolVersion: 1 });
    }
    return jsonResponse({});
  };
  let execCount = 0;
  const fakeExecFile = (file, args, opts, cb) => {
    execCount += 1;
    setImmediate(() => cb && cb(null));
    return { unref() {} };
  };
  const { app } = makeFakeApp();
  const mgr = createCaptureAgentManager({
    app,
    storage: makeFakeStorage(),
    getBrowserSettings: () => ({ port: 27183, token: 't' }),
    appVersion: '1.0.0',
    fetchFn: flakyFetch,
    execFileFn: fakeExecFile,
    processRef: makeFakeProcess({ platform: 'linux' }),
    startDelayMs: 10
  });
  // Fire two ensureRunning calls in parallel — they must share the same start promise
  const [a, b] = await Promise.all([mgr.ensureRunning(), mgr.ensureRunning()]);
  assert.equal(execCount, 1, 'only one spawn despite concurrent ensureRunning calls');
  assert(a && a.ok);
  assert(b && b.ok);
});

test('ensureRunning restarts agent when version mismatches', async () => {
  let pingCount = 0;
  const fetchFn = async (url) => {
    if (url.includes('/agent/stop')) {
      return jsonResponse({ stopped: true });
    }
    pingCount += 1;
    // First ping reports outdated version; subsequent pings report new version
    if (pingCount === 1) {
      return jsonResponse({ ok: true, agentVersion: '1.0.0-OLD', protocolVersion: 1 });
    }
    return jsonResponse({ ok: true, agentVersion: '2.0.0', protocolVersion: 1 });
  };
  let execCount = 0;
  const fakeExecFile = (file, args, opts, cb) => {
    execCount += 1;
    setImmediate(() => cb && cb(null));
    return { unref() {} };
  };
  const { app } = makeFakeApp();
  const mgr = createCaptureAgentManager({
    app,
    storage: makeFakeStorage(),
    getBrowserSettings: () => ({ port: 27183, token: 't' }),
    appVersion: '2.0.0',
    fetchFn,
    execFileFn: fakeExecFile,
    processRef: makeFakeProcess({ platform: 'linux' }),
    startDelayMs: 10
  });
  const live = await mgr.ensureRunning();
  assert.equal(live.agentVersion, '2.0.0');
  assert.equal(execCount, 1, 'restart triggered');
});
