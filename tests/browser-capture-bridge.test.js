const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..');
const sidecarEntry = path.join(rootDir, 'src-sidecar', 'capture-agent', 'index.js');
const sidecarBinary = path.join(
  rootDir,
  'src-tauri',
  'binaries',
  'capture-agent-x86_64-pc-windows-msvc.exe'
);

function startSidecar(mode = 'node') {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'academiq-capture-sidecar-'));
  const useBinary = mode === 'binary';
  const child = spawn(useBinary ? sidecarBinary : process.execPath, useBinary ? [] : [sidecarEntry], {
    cwd: useBinary ? rootDir : path.dirname(sidecarEntry),
    env: { ...process.env, AQ_CAPTURE_DATA_DIR: dataDir },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  const lines = [];
  child.stdout.on('data', (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim()) lines.push(JSON.parse(line));
    }
  });
  return { child, lines };
}

function call(sidecar, method, params = {}) {
  const id = `${Date.now()}-${Math.random()}`;
  sidecar.child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const found = sidecar.lines.find((line) => line.id === id);
      if (found) {
        clearInterval(timer);
        if (found.error) reject(new Error(found.error));
        else resolve(found.result);
        return;
      }
      if (Date.now() - started > 8000) {
        clearInterval(timer);
        reject(new Error(`timeout waiting for ${method}`));
      }
    }, 25);
  });
}

function parseExtensionConfig(installDir) {
  const configJs = fs.readFileSync(path.join(installDir, 'config.js'), 'utf8');
  const match = configJs.match(/AQ_CAPTURE_CONFIG=(\{[\s\S]*\});?\s*$/);
  assert.ok(match, 'config.js contains AQ_CAPTURE_CONFIG');
  return JSON.parse(match[1]);
}

test('capture sidecar JSON-RPC responds and emits notifications', async () => {
  const sidecar = startSidecar();
  try {
    const status = await call(sidecar, 'getStatus');
    assert.equal(status.ok, true);
    assert.equal(typeof status.port, 'number');

    const workspace = await call(sidecar, 'createWorkspace', { name: 'Sidecar Test' });
    assert.equal(workspace.ok, true);
    assert.equal(workspace.workspace.name, 'Sidecar Test');

    await call(sidecar, 'rendererReady');
    assert.ok(sidecar.lines.some((line) => line.method === 'browserCapture:stateChanged'));

    const ack = await call(sidecar, 'ackPayload', { queueId: 'cap_missing' });
    assert.equal(ack.ok, true);
  } finally {
    try { await call(sidecar, 'shutdown'); } catch (_e) {}
    sidecar.child.kill();
  }
});

test('capture sidecar prepares extension config and accepts extension HTTP capture', async () => {
  const sidecar = startSidecar();
  try {
    const setup = await call(sidecar, 'prepareSetup', { browserFamily: 'chromium' });
    assert.equal(setup.ok, true);
    assert.equal(fs.existsSync(path.join(setup.installDir, 'manifest.json')), true);

    const config = parseExtensionConfig(setup.installDir);
    assert.equal(config.bridgeBaseUrl, `http://127.0.0.1:${config.port}`);
    assert.equal(typeof config.token, 'string');

    const headers = {
      'content-type': 'application/json',
      'x-aq-token': config.token,
      origin: 'chrome-extension://academiq-test'
    };
    const hello = await fetch(`${config.bridgeBaseUrl}/hello`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ extensionVersion: 'test', protocolVersion: 1, browserFamily: 'chromium' })
    }).then((res) => res.json());
    assert.equal(hello.ok, true);
    assert.equal(hello.compatibilityState, 'compatible');

    const capture = await fetch(`${config.bridgeBaseUrl}/capture`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: 'Phase 6 Capture',
        pageUrl: 'https://example.test/article',
        doi: '10.1234/example',
        browserSource: 'Chromium'
      })
    }).then((res) => res.json());
    assert.equal(capture.ok, true);
    assert.equal(capture.queued, true);
    assert.ok(sidecar.lines.some((line) => line.method === 'browserCapture:incoming'));

    const ack = await call(sidecar, 'ackPayload', { queueId: capture.queueId });
    assert.equal(ack.ok, true);
  } finally {
    try { await call(sidecar, 'shutdown'); } catch (_e) {}
    sidecar.child.kill();
  }
});

test('packaged capture sidecar binary prepares extension config', async (t) => {
  if (!fs.existsSync(sidecarBinary)) {
    t.skip('capture-agent binary has not been built yet');
    return;
  }
  const sidecar = startSidecar('binary');
  try {
    const setup = await call(sidecar, 'prepareSetup', { browserFamily: 'chromium' });
    assert.equal(setup.ok, true);
    assert.equal(fs.existsSync(path.join(setup.installDir, 'config.js')), true);
    const config = parseExtensionConfig(setup.installDir);
    assert.equal(typeof config.token, 'string');
    assert.equal(config.port, setup.port);
  } finally {
    try { await call(sidecar, 'shutdown'); } catch (_e) {}
    sidecar.child.kill();
  }
});

test('packaged capture sidecar binary speaks the same JSON-RPC protocol', async (t) => {
  if (!fs.existsSync(sidecarBinary)) {
    t.skip('capture-agent binary has not been built yet');
    return;
  }
  const sidecar = startSidecar('binary');
  try {
    const status = await call(sidecar, 'getStatus');
    assert.equal(status.ok, true);
    assert.equal(typeof status.port, 'number');
    assert.equal(status.tokenReady, true);
  } finally {
    try { await call(sidecar, 'shutdown'); } catch (_e) {}
    sidecar.child.kill();
  }
});
