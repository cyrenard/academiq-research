const { createBrowserCaptureBridge, DEFAULT_CAPTURE_PORT, BROWSER_CAPTURE_PROTOCOL_VERSION, sanitizeCapturePayload, safeId, normalizeBrowserCaptureSettings, buildTargetsFromDataJSON } = require('./main-process-browser-capture.js');

const QUEUE_STATUS = {
  queued: true,
  imported: true,
  duplicate_attached: true,
  failed: true
};
const MAX_QUEUE_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 15000;

function asText(value, maxLen) {
  if (value == null) return '';
  const out = String(value).trim();
  if (!maxLen || out.length <= maxLen) return out;
  return out.slice(0, maxLen);
}

function nowTs() {
  return Date.now();
}

function compareVersions(a, b) {
  const aa = String(a || '0').split('.').map((part) => parseInt(part, 10) || 0);
  const bb = String(b || '0').split('.').map((part) => parseInt(part, 10) || 0);
  const length = Math.max(aa.length, bb.length);
  for (let index = 0; index < length; index += 1) {
    const left = aa[index] || 0;
    const right = bb[index] || 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }
  return 0;
}

function normalizeQueueItem(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const type = String(source.type || '').trim();
  const status = QUEUE_STATUS[source.status] ? String(source.status) : 'queued';
  const item = {
    id: safeId(source.id) || ('q_' + nowTs().toString(36) + Math.random().toString(36).slice(2, 8)),
    type: type === 'workspace_create' ? 'workspace_create' : 'capture',
    status,
    createdAt: Number(source.createdAt) > 0 ? Number(source.createdAt) : nowTs(),
    updatedAt: Number(source.updatedAt) > 0 ? Number(source.updatedAt) : nowTs(),
    attemptCount: Number(source.attemptCount) > 0 ? Number(source.attemptCount) : 0,
    nextRetryAt: Number(source.nextRetryAt) > 0 ? Number(source.nextRetryAt) : 0,
    lastError: asText(source.lastError, 512),
    clientWorkspaceId: safeId(source.clientWorkspaceId),
    realWorkspaceId: safeId(source.realWorkspaceId),
    name: asText(source.name, 256),
    payload: sanitizeCapturePayload(source.payload || source),
    result: source.result && typeof source.result === 'object' ? source.result : {}
  };
  if (item.type === 'workspace_create') item.payload = {};
  return item;
}

function computeRetryDelay(attemptCount) {
  const attempts = Math.max(1, Number(attemptCount) || 1);
  return Math.min(1000 * 60 * 10, RETRY_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempts - 1)));
}

function markQueueRetry(item, errorMessage) {
  const nextAttempt = Number(item.attemptCount || 0) + 1;
  item.attemptCount = nextAttempt;
  item.updatedAt = nowTs();
  item.lastError = asText(errorMessage, 512) || 'Capture islenemedi';
  if (nextAttempt >= MAX_QUEUE_ATTEMPTS) {
    item.status = 'failed';
    item.nextRetryAt = 0;
    return;
  }
  item.status = 'queued';
  item.nextRetryAt = nowTs() + computeRetryDelay(nextAttempt);
}

function loadQueueState(storage) {
  const raw = storage && storage.loadCaptureQueue ? storage.loadCaptureQueue() : { items: [] };
  const items = Array.isArray(raw.items) ? raw.items.map(normalizeQueueItem) : [];
  return { items };
}

function saveQueueState(storage, queueState) {
  const source = queueState && typeof queueState === 'object' ? queueState : {};
  const items = Array.isArray(source.items) ? source.items.map(normalizeQueueItem) : [];
  if (storage && storage.saveCaptureQueue) storage.saveCaptureQueue({ items });
  return { items };
}

function buildPendingWorkspaces(queueItems) {
  return (Array.isArray(queueItems) ? queueItems : [])
    .filter((item) => item && item.type === 'workspace_create' && item.status === 'queued' && item.clientWorkspaceId)
    .map((item) => ({
      id: item.clientWorkspaceId,
      name: item.name || 'Yeni Workspace',
      pending: true
    }));
}

function overlayPendingWorkspaces(targets, queueItems) {
  const base = targets && typeof targets === 'object' ? JSON.parse(JSON.stringify(targets)) : { workspaces: [] };
  const pending = buildPendingWorkspaces(queueItems);
  base.workspaces = Array.isArray(base.workspaces) ? base.workspaces : [];
  pending.forEach((entry) => {
    const exists = base.workspaces.some((ws) => String(ws && ws.id || '') === String(entry.id || ''));
    if (exists) return;
    base.workspaces.push({
      id: entry.id,
      name: entry.name + ' (bekliyor)',
      comparisons: [
        { id: '', name: 'Yok' },
        { id: 'literature-matrix', name: 'Literatür Matrisi' }
      ],
      pending: true
    });
  });
  return base;
}

function buildQueueStats(queueItems) {
  const stats = {
    queued: 0,
    waitingRetry: 0,
    failed: 0,
    imported: 0,
    duplicateAttached: 0,
    pendingWorkspaceCount: 0,
    nextRetryAt: 0
  };
  (Array.isArray(queueItems) ? queueItems : []).forEach((item) => {
    if (!item) return;
    const retryAt = Number(item.nextRetryAt || 0);
    if (item.type === 'workspace_create' && item.status === 'queued') {
      stats.pendingWorkspaceCount += 1;
    }
    if (item.status === 'queued') {
      if (retryAt > nowTs()) {
        stats.waitingRetry += 1;
        if (!stats.nextRetryAt || retryAt < stats.nextRetryAt) stats.nextRetryAt = retryAt;
      } else {
        stats.queued += 1;
      }
      return;
    }
    if (item.status === 'failed') {
      stats.failed += 1;
      return;
    }
    if (item.status === 'imported') {
      stats.imported += 1;
      return;
    }
    if (item.status === 'duplicate_attached') {
      stats.duplicateAttached += 1;
    }
  });
  return stats;
}

function buildAgentStatus(storage, appVersion, extra) {
  const settings = storage && storage.getBrowserCaptureSettings ? normalizeBrowserCaptureSettings(storage.getBrowserCaptureSettings()) : {};
  const agentState = storage && storage.loadCaptureAgentState ? storage.loadCaptureAgentState() : {};
  const queue = loadQueueState(storage);
  const runtime = extra && typeof extra === 'object' ? extra : {};
  const queueStats = buildQueueStats(queue.items);
  const queueLength = queueStats.queued + queueStats.waitingRetry;
  const extensionVersion = asText(agentState.extensionVersion, 32);
  const compatibilityState = extensionVersion
    ? (compareVersions(extensionVersion, appVersion) > 0 ? 'extension_newer' : (compareVersions(extensionVersion, appVersion) < 0 ? 'extension_older' : 'compatible'))
    : 'unknown';
  return {
    ok: true,
    agentRunning: !!runtime.agentRunning,
    agentPid: Number(runtime.pid || agentState.pid || 0),
    agentPort: Number(runtime.port || agentState.port || settings.port || DEFAULT_CAPTURE_PORT),
    queueLength,
    lastCaptureReceivedAt: Number(agentState.lastCaptureReceivedAt || 0),
    lastHelloAt: Number(agentState.lastHelloAt || 0),
    lastError: asText(agentState.lastError, 512),
    agentVersion: asText(agentState.agentVersion, 32) || asText(appVersion, 32),
    extensionVersion,
    protocolVersion: Number(agentState.protocolVersion || BROWSER_CAPTURE_PROTOCOL_VERSION),
    compatibilityState,
    queueStats,
    pendingWorkspaces: buildPendingWorkspaces(queue.items)
  };
}

function loadTargetsSnapshot(storage) {
  const cached = storage && storage.loadCaptureTargets ? storage.loadCaptureTargets() : { workspaces: [] };
  if (cached && Array.isArray(cached.workspaces) && cached.workspaces.length) return cached;
  if (storage && storage.loadData && typeof buildTargetsFromDataJSON === 'function') {
    try {
      const loaded = storage.loadData();
      const derived = buildTargetsFromDataJSON(loaded && loaded.ok ? loaded.data : '');
      if (derived && Array.isArray(derived.workspaces) && derived.workspaces.length) return derived;
    } catch (_e) {}
  }
  return cached && typeof cached === 'object' ? cached : { workspaces: [] };
}

function createCaptureAgentRuntime(options) {
  const config = options && typeof options === 'object' ? options : {};
  const storage = config.storage;
  const appVersion = asText(config.appVersion, 32) || '0.0.0';
  let bridge = null;
  let activePort = 0;

  function saveAgentState(patch) {
    const current = storage && storage.loadCaptureAgentState ? storage.loadCaptureAgentState() : {};
    const next = Object.assign({}, current, patch || {}, {
      updatedAt: nowTs()
    });
    if (storage && storage.saveCaptureAgentState) storage.saveCaptureAgentState(next);
    return next;
  }

  function getTargets() {
    const cached = loadTargetsSnapshot(storage);
    const queue = loadQueueState(storage);
    return overlayPendingWorkspaces(cached, queue.items);
  }

  function queueCapture(payload) {
    const queue = loadQueueState(storage);
    const item = normalizeQueueItem({
      id: '',
      type: 'capture',
      status: 'queued',
      createdAt: nowTs(),
      updatedAt: nowTs(),
      payload: sanitizeCapturePayload(payload)
    });
    queue.items.push(item);
    saveQueueState(storage, queue);
    saveAgentState({
      lastCaptureReceivedAt: nowTs(),
      lastError: ''
    });
    return {
      ok: true,
      queued: true,
      queueId: item.id,
      message: 'Kaynak yerel capture kuyruğuna alındı. Uygulama açıldığında işlenecek.'
    };
  }

  function queueWorkspaceCreate(name) {
    const trimmed = asText(name, 256);
    if (!trimmed) return { ok: false, error: 'Workspace adı gerekli.' };
    const queue = loadQueueState(storage);
    const existing = queue.items.find((item) => item.type === 'workspace_create' && item.status === 'queued' && String(item.name || '').toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      return {
        ok: true,
        queued: true,
        workspace: { id: existing.clientWorkspaceId, name: existing.name, pending: true },
        targets: getTargets(),
        message: 'Workspace zaten kuyruğa alınmış.'
      };
    }
    const item = normalizeQueueItem({
      id: '',
      type: 'workspace_create',
      status: 'queued',
      createdAt: nowTs(),
      updatedAt: nowTs(),
      clientWorkspaceId: 'pending_ws_' + nowTs().toString(36) + Math.random().toString(36).slice(2, 8),
      name: trimmed
    });
    queue.items.push(item);
    saveQueueState(storage, queue);
    saveAgentState({
      lastCaptureReceivedAt: nowTs(),
      lastError: ''
    });
    return {
      ok: true,
      queued: true,
      workspace: { id: item.clientWorkspaceId, name: item.name, pending: true },
      targets: getTargets(),
      message: 'Workspace isteği yerel kuyruğa alındı. Uygulama açıldığında oluşturulacak.'
    };
  }

  async function start() {
    const settings = storage && storage.getBrowserCaptureSettings ? normalizeBrowserCaptureSettings(storage.getBrowserCaptureSettings()) : {};
    if (bridge) {
      try { await bridge.close(); } catch (_e) {}
      bridge = null;
    }
    const candidatePorts = [settings.port || DEFAULT_CAPTURE_PORT];
    let lastError = null;
    for (let index = 0; index < candidatePorts.length; index += 1) {
      const candidateBridge = createBrowserCaptureBridge({
        host: '127.0.0.1',
        port: candidatePorts[index],
        token: settings.token,
        onGetTargets: function () { return getTargets(); },
        onGetStatus: function () { return buildAgentStatus(storage, appVersion, { agentRunning: true, pid: process.pid, port: activePort || candidatePorts[index] }); },
        onLookup: function () {
          return { ok: false, message: 'Editor kapalıyken ön kontrol sınırlı. Capture yine kuyruğa alınabilir.' };
        },
        onCreateWorkspace: function (name) {
          return queueWorkspaceCreate(name);
        },
        onStop: function () {
          saveAgentState({
            running: false,
            pid: 0,
            port: 0,
            stoppedAt: nowTs(),
            lastError: ''
          });
          setTimeout(function () { process.exit(0); }, 120);
          return { ok: true };
        },
        onRequestSeen: function () {
          saveAgentState({ lastBridgeEventAt: nowTs(), lastError: '' });
        },
        onHello: function (payload) {
          saveAgentState({
            lastHelloAt: nowTs(),
            extensionVersion: payload && payload.extensionVersion ? String(payload.extensionVersion) : '',
            protocolVersion: payload && payload.protocolVersion ? Number(payload.protocolVersion) : BROWSER_CAPTURE_PROTOCOL_VERSION,
            browserFamily: payload && payload.browserFamily ? String(payload.browserFamily) : '',
            browserName: payload && payload.browserName ? String(payload.browserName) : '',
            lastError: ''
          });
          return buildAgentStatus(storage, appVersion, { agentRunning: true, pid: process.pid, port: activePort || candidatePorts[index] });
        },
        onCapture: function (payload) {
          return queueCapture(payload);
        }
      });
      try {
        const bound = await candidateBridge.listen();
        bridge = candidateBridge;
        activePort = bound.port;
        saveAgentState({
          running: true,
          pid: process.pid,
          port: activePort,
          agentVersion: appVersion,
          protocolVersion: BROWSER_CAPTURE_PROTOCOL_VERSION,
          startedAt: nowTs(),
          lastError: ''
        });
        return { ok: true, port: activePort };
      } catch (error) {
        lastError = error;
        try { await candidateBridge.close(); } catch (_e) {}
      }
    }
    saveAgentState({
      running: false,
      pid: 0,
      port: 0,
      lastError: lastError && lastError.message ? String(lastError.message) : 'Capture agent başlatılamadı'
    });
    throw lastError || new Error('Capture agent başlatılamadı');
  }

  async function stop() {
    if (bridge) {
      try { await bridge.close(); } catch (_e) {}
      bridge = null;
    }
    activePort = 0;
    saveAgentState({
      running: false,
      pid: 0,
      port: 0,
      stoppedAt: nowTs()
    });
    return { ok: true };
  }

  return {
    start,
    stop,
    getStatus: function () {
      return buildAgentStatus(storage, appVersion, { agentRunning: !!bridge, pid: process.pid, port: activePort });
    }
  };
}

async function processCaptureQueue(options) {
  const config = options && typeof options === 'object' ? options : {};
  const storage = config.storage;
  const createWorkspace = typeof config.createWorkspace === 'function' ? config.createWorkspace : null;
  const importCapture = typeof config.importCapture === 'function' ? config.importCapture : null;
  const queue = loadQueueState(storage);
  const workspaceMap = {};
  const results = [];

  for (const item of queue.items) {
    if (!item || item.status !== 'queued') continue;
    if (Number(item.nextRetryAt || 0) > nowTs()) continue;
    if (item.type !== 'workspace_create') continue;
    if (!createWorkspace) continue;
    try {
      const created = await createWorkspace(item.name);
      if (created && created.ok && created.workspace && created.workspace.id) {
        item.status = 'imported';
        item.updatedAt = nowTs();
        item.nextRetryAt = 0;
        item.lastError = '';
        item.realWorkspaceId = String(created.workspace.id);
        item.result = { workspaceId: item.realWorkspaceId };
        workspaceMap[item.clientWorkspaceId] = item.realWorkspaceId;
        results.push({ id: item.id, type: item.type, status: item.status });
      } else {
        item.status = 'failed';
        item.updatedAt = nowTs();
        item.attemptCount += 1;
        item.lastError = created && created.error ? String(created.error) : 'Workspace oluşturulamadı';
      }
    } catch (error) {
      item.status = 'failed';
      item.updatedAt = nowTs();
      item.attemptCount += 1;
      item.lastError = error && error.message ? String(error.message) : 'Workspace oluşturulamadı';
    }
  }

  for (const item of queue.items) {
    if (!item || item.status !== 'queued') continue;
    if (Number(item.nextRetryAt || 0) > nowTs()) continue;
    if (item.type !== 'capture') continue;
    if (!importCapture) continue;
    try {
      const payload = sanitizeCapturePayload(item.payload || {});
      if (payload.selectedWorkspaceId && workspaceMap[payload.selectedWorkspaceId]) {
        payload.selectedWorkspaceId = workspaceMap[payload.selectedWorkspaceId];
      } else {
        const workspaceItem = queue.items.find((entry) => entry.type === 'workspace_create' && entry.clientWorkspaceId === payload.selectedWorkspaceId && entry.realWorkspaceId);
        if (workspaceItem && workspaceItem.realWorkspaceId) payload.selectedWorkspaceId = workspaceItem.realWorkspaceId;
      }
      const imported = await importCapture(payload);
      if (imported && imported.ok) {
        item.status = imported.mode === 'added_new' ? 'imported' : 'duplicate_attached';
        item.updatedAt = nowTs();
        item.nextRetryAt = 0;
        item.lastError = '';
        item.result = {
          workspaceId: imported.workspace && imported.workspace.id ? String(imported.workspace.id) : '',
          refId: imported.ref && imported.ref.id ? String(imported.ref.id) : '',
          mode: imported.mode || ''
        };
        results.push({ id: item.id, type: item.type, status: item.status });
      } else {
        item.status = 'failed';
        item.updatedAt = nowTs();
        item.attemptCount += 1;
        item.lastError = imported && imported.error ? String(imported.error) : 'Capture içeri aktarılamadı';
      }
    } catch (error) {
      item.status = 'failed';
      item.updatedAt = nowTs();
      item.attemptCount += 1;
      item.lastError = error && error.message ? String(error.message) : 'Capture içeri aktarılamadı';
    }
  }

  queue.items.forEach((item) => {
    if (!item) return;
    if (item.status === 'failed') {
      if (Number(item.attemptCount || 0) >= MAX_QUEUE_ATTEMPTS) {
        item.nextRetryAt = 0;
        return;
      }
      item.status = 'queued';
      item.nextRetryAt = nowTs() + computeRetryDelay(item.attemptCount || 1);
      return;
    }
    if (item.status === 'imported' || item.status === 'duplicate_attached') {
      item.nextRetryAt = 0;
      item.lastError = '';
    }
  });

  const pruned = queue.items.filter((item) => {
    if (!item) return false;
    if (item.status === 'queued') return true;
    return (nowTs() - Number(item.updatedAt || item.createdAt || 0)) < (1000 * 60 * 60 * 24 * 3);
  }).slice(-200);

  saveQueueState(storage, { items: pruned });
  if (storage && storage.saveCaptureAgentState) {
    const current = storage.loadCaptureAgentState ? storage.loadCaptureAgentState() : {};
    storage.saveCaptureAgentState(Object.assign({}, current, {
      lastQueueProcessAt: nowTs(),
      queueLength: pruned.filter((item) => item.status === 'queued').length
    }));
  }
  return {
    ok: true,
    processed: results.length,
    results
  };
}

module.exports = {
  createCaptureAgentRuntime,
  processCaptureQueue,
  buildAgentStatus,
  loadQueueState,
  saveQueueState,
  overlayPendingWorkspaces
};
