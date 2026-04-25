const test = require('node:test');
const assert = require('node:assert/strict');

const {
  processCaptureQueue,
  buildAgentStatus,
  loadQueueState
} = require('../src/capture-agent.js');

function createStorage() {
  const state = {
    queue: { items: [] },
    agentState: {},
    browserCapture: { port: 27183, token: 'token' }
  };
  return {
    loadCaptureQueue() { return JSON.parse(JSON.stringify(state.queue)); },
    saveCaptureQueue(next) { state.queue = JSON.parse(JSON.stringify(next)); return { ok: true }; },
    loadCaptureAgentState() { return JSON.parse(JSON.stringify(state.agentState)); },
    saveCaptureAgentState(next) { state.agentState = JSON.parse(JSON.stringify(next)); return { ok: true }; },
    getBrowserCaptureSettings() { return Object.assign({}, state.browserCapture); },
    setBrowserCaptureSettings(patch) { state.browserCapture = Object.assign({}, state.browserCapture, patch || {}); return { ok: true }; },
    __state: state
  };
}

test('buildAgentStatus reports queue length and persisted agent info', () => {
  const storage = createStorage();
  storage.saveCaptureQueue({
    items: [
      { id: 'q1', type: 'capture', status: 'queued', payload: { detectedTitle: 'Paper One' } },
      { id: 'q2', type: 'capture', status: 'imported', payload: { detectedTitle: 'Paper Two' } }
    ]
  });
  storage.saveCaptureAgentState({
    running: true,
    pid: 1234,
    port: 27183,
    extensionVersion: '1.1.1',
    lastCaptureReceivedAt: 100
  });
  const status = buildAgentStatus(storage, '1.1.1', { agentRunning: true, pid: 1234, port: 27183 });
  assert.equal(status.agentRunning, true);
  assert.equal(status.queueLength, 1);
  assert.equal(status.extensionVersion, '1.1.1');
  assert.equal(status.compatibilityState, 'compatible');
});

test('buildAgentStatus exposes queue stats for retry visibility', () => {
  const storage = createStorage();
  storage.saveCaptureQueue({
    items: [
      { id: 'ready_1', type: 'capture', status: 'queued', payload: { detectedTitle: 'Ready Paper' } },
      { id: 'retry_1', type: 'capture', status: 'queued', nextRetryAt: Date.now() + 60000, payload: { detectedTitle: 'Retry Paper' } },
      { id: 'failed_1', type: 'capture', status: 'failed', attemptCount: 5, lastError: 'permanent failure', payload: { detectedTitle: 'Failed Paper' } },
      { id: 'ws_1', type: 'workspace_create', status: 'queued', clientWorkspaceId: 'pending_ws_1', name: 'Pending Workspace' }
    ]
  });
  const status = buildAgentStatus(storage, '1.1.1', { agentRunning: true, pid: 4321, port: 27183 });
  assert.equal(status.queueLength, 3);
  assert.equal(status.queueStats.queued, 2);
  assert.equal(status.queueStats.waitingRetry, 1);
  assert.equal(status.queueStats.failed, 1);
  assert.equal(status.queueStats.pendingWorkspaceCount, 1);
  assert.equal(status.queueStats.nextRetryAt > Date.now(), true);
});

test('processCaptureQueue creates pending workspaces before importing queued captures', async () => {
  const storage = createStorage();
  storage.saveCaptureQueue({
    items: [
      {
        id: 'ws_1',
        type: 'workspace_create',
        status: 'queued',
        clientWorkspaceId: 'pending_ws_a',
        name: 'Captured Workspace'
      },
      {
        id: 'cap_1',
        type: 'capture',
        status: 'queued',
        payload: {
          detectedTitle: 'Queued Paper',
          selectedWorkspaceId: 'pending_ws_a'
        }
      }
    ]
  });
  const calls = [];
  const result = await processCaptureQueue({
    storage,
    createWorkspace: async (name) => ({ ok: true, workspace: { id: 'real_ws_1', name } }),
    importCapture: async (payload) => {
      calls.push(payload);
      return {
        ok: true,
        mode: 'added_new',
        workspace: { id: payload.selectedWorkspaceId, name: 'Captured Workspace' },
        ref: { id: 'ref_1' }
      };
    }
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].selectedWorkspaceId, 'real_ws_1');
  const queue = loadQueueState(storage);
  assert.equal(queue.items.find((item) => item.id === 'ws_1').status, 'imported');
  assert.equal(queue.items.find((item) => item.id === 'cap_1').status, 'imported');
});

test('processCaptureQueue keeps transient failures queued with retry metadata', async () => {
  const storage = createStorage();
  storage.saveCaptureQueue({
    items: [
      {
        id: 'cap_retry',
        type: 'capture',
        status: 'queued',
        payload: {
          detectedTitle: 'Retry Paper',
          selectedWorkspaceId: ''
        }
      }
    ]
  });

  const result = await processCaptureQueue({
    storage,
    importCapture: async () => ({ ok: false, error: 'temporary failure' })
  });

  assert.equal(result.ok, true);
  const queue = loadQueueState(storage);
  const item = queue.items.find((entry) => entry.id === 'cap_retry');
  assert.equal(item.status, 'queued');
  assert.equal(item.attemptCount, 1);
  assert.equal(item.lastError, 'temporary failure');
  assert.equal(item.nextRetryAt > Date.now(), true);
});

test('processCaptureQueue retries workspace creation failures before final failure', async () => {
  const storage = createStorage();
  storage.saveCaptureQueue({
    items: [
      {
        id: 'ws_retry',
        type: 'workspace_create',
        status: 'queued',
        clientWorkspaceId: 'pending_ws_retry',
        name: 'Retry Workspace'
      }
    ]
  });

  const result = await processCaptureQueue({
    storage,
    createWorkspace: async () => ({ ok: false, error: 'workspace temporarily locked' })
  });

  assert.equal(result.ok, true);
  const queue = loadQueueState(storage);
  const item = queue.items.find((entry) => entry.id === 'ws_retry');
  assert.equal(item.status, 'queued');
  assert.equal(item.attemptCount, 1);
  assert.equal(item.lastError, 'workspace temporarily locked');
  assert.equal(item.nextRetryAt > Date.now(), true);
});

test('processCaptureQueue stops retrying after max attempts', async () => {
  const storage = createStorage();
  storage.saveCaptureQueue({
    items: [
      {
        id: 'cap_fail',
        type: 'capture',
        status: 'queued',
        attemptCount: 4,
        payload: {
          detectedTitle: 'Fail Paper',
          selectedWorkspaceId: ''
        }
      }
    ]
  });

  const result = await processCaptureQueue({
    storage,
    importCapture: async () => ({ ok: false, error: 'permanent failure' })
  });

  assert.equal(result.ok, true);
  const queue = loadQueueState(storage);
  const item = queue.items.find((entry) => entry.id === 'cap_fail');
  assert.equal(item.status, 'failed');
  assert.equal(item.attemptCount, 5);
  assert.equal(item.nextRetryAt, 0);
});
