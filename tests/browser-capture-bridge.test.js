const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..');
const sidecarEntry = path.join(rootDir, 'src-sidecar', 'capture-agent', 'index.js');

function startSidecar() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'academiq-capture-sidecar-'));
  const child = spawn(process.execPath, [sidecarEntry], {
    cwd: path.dirname(sidecarEntry),
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
