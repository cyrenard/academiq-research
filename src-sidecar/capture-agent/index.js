#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createBrowserCaptureBridge,
  DEFAULT_CAPTURE_PORT,
  BROWSER_CAPTURE_PROTOCOL_VERSION,
  normalizeBrowserCaptureSettings,
  sanitizeCapturePayload,
  safeId
} = require('./main-process-browser-capture.js');

function now() {
  return Date.now();
}

function asText(value, maxLen) {
  const text = value == null ? '' : String(value).trim();
  return maxLen && text.length > maxLen ? text.slice(0, maxLen) : text;
}

function writeLine(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function notify(method, params) {
  writeLine({ method, params: params || {} });
}

function getDataDir() {
  const explicit = process.env.AQ_CAPTURE_DATA_DIR || process.env.AQ_APP_DATA_DIR;
  if (explicit) return explicit;
  return path.join(os.homedir(), 'AppData', 'Roaming', 'AcademiQ Research', 'capture-sidecar');
}

const dataDir = getDataDir();
fs.mkdirSync(dataDir, { recursive: true });
const statePath = path.join(dataDir, 'capture-sidecar-state.json');

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (_e) {
    return {};
  }
}

function saveState(patch) {
  const current = loadState();
  const next = Object.assign({}, current, patch || {}, { updatedAt: now() });
  fs.writeFileSync(statePath, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function createToken() {
  return 'aq_' + Math.random().toString(36).slice(2) + now().toString(36);
}

function getSettings() {
  const state = loadState();
  const settings = normalizeBrowserCaptureSettings(state.settings || {});
  const patch = {};
  if (!settings.token) {
    settings.token = createToken();
    patch.token = settings.token;
  }
  if (!settings.port) {
    settings.port = DEFAULT_CAPTURE_PORT;
    patch.port = settings.port;
  }
  if (Object.keys(patch).length) {
    saveState({ settings: Object.assign({}, state.settings || {}, patch) });
  }
  return settings;
}

function patchSettings(patch) {
  const state = loadState();
  const settings = normalizeBrowserCaptureSettings(Object.assign({}, state.settings || {}, patch || {}));
  saveState({ settings });
  return settings;
}

function loadQueue() {
  const state = loadState();
  return Array.isArray(state.queue) ? state.queue : [];
}

function saveQueue(queue) {
  const items = Array.isArray(queue) ? queue.slice(-200) : [];
  saveState({ queue: items });
  return items;
}

function queueCapture(payload) {
  const safePayload = sanitizeCapturePayload(payload);
  const id = safeId(safePayload.queueId) || ('cap_' + now().toString(36) + Math.random().toString(36).slice(2, 8));
  const entry = { id, createdAt: now(), payload: safePayload };
  saveQueue(loadQueue().filter((item) => item && item.id !== id).concat([entry]));
  notify('browserCapture:incoming', Object.assign({}, safePayload, { queueId: id }));
  return { ok: true, queued: true, queueId: id, message: 'Capture AcademiQ kuyruğuna alındı.' };
}

function queueWorkspace(name) {
  const id = 'pending_ws_' + now().toString(36) + Math.random().toString(36).slice(2, 8);
  const workspace = { id, name: asText(name, 256) || 'Yeni Workspace', pending: true };
  notify('browserCapture:workspaceCreated', { ok: true, workspace });
  return { ok: true, queued: true, workspace };
}

function ackPayload(queueId) {
  const id = safeId(queueId);
  if (!id) return { ok: false, error: 'Geçersiz capture kimliği', id: '' };
  saveQueue(loadQueue().filter((item) => item && item.id !== id));
  return { ok: true, id };
}

let bridge = null;
let activePort = 0;
let lastHello = null;

async function ensureBridge() {
  if (bridge) return { ok: true, port: activePort };
  const settings = getSettings();
  bridge = createBrowserCaptureBridge({
    host: '127.0.0.1',
    port: settings.port || DEFAULT_CAPTURE_PORT,
    token: settings.token,
    onGetTargets: () => ({ activeWorkspaceId: '', workspaces: [] }),
    onGetStatus: () => buildStatus(),
    onLookup: () => ({ ok: false, message: 'Lookup host import path is owned by Tauri.' }),
    onCreateWorkspace: queueWorkspace,
    onCapture: queueCapture,
    onHello: (payload) => {
      lastHello = payload || {};
      patchSettings({
        lastConnectedAt: now(),
        lastVerificationAt: now(),
        installedExtensionVersion: asText(lastHello.extensionVersion, 32),
        installedProtocolVersion: Number(lastHello.protocolVersion || 0),
        lifecycleState: 'ready',
        compatibilityState: 'compatible',
        lastError: ''
      });
      notify('browserCapture:stateChanged', { connected: true, lastHello });
      return Object.assign({ acknowledged: true }, buildStatus());
    },
    onStop: async () => {
      await stopBridge();
      return { ok: true };
    }
  });
  const bound = await bridge.listen();
  activePort = bound.port;
  patchSettings({ port: activePort, enabled: true, lifecycleState: 'ready', lastError: '' });
  notify('browserCapture:stateChanged', { bridgeReady: true, port: activePort });
  return { ok: true, port: activePort };
}

async function stopBridge() {
  if (bridge) {
    try { await bridge.close(); } catch (_e) {}
    bridge = null;
  }
  activePort = 0;
  notify('browserCapture:stateChanged', { bridgeReady: false });
  return { ok: true };
}

function buildStatus(extra) {
  const settings = getSettings();
  const queue = loadQueue();
  return Object.assign({
    ok: true,
    enabled: settings.enabled !== false,
    port: activePort || settings.port || DEFAULT_CAPTURE_PORT,
    tokenReady: !!settings.token,
    browserCaptureProtocolVersion: BROWSER_CAPTURE_PROTOCOL_VERSION,
    bridgeConnected: !!bridge,
    bridgeReady: !!bridge,
    agentRunning: true,
    agentPid: process.pid,
    agentPort: activePort || settings.port || DEFAULT_CAPTURE_PORT,
    queueLength: queue.length,
    lifecycleState: bridge ? 'ready' : 'not_running',
    compatibilityState: lastHello ? 'compatible' : 'unknown',
    installedExtensionVersion: lastHello && lastHello.extensionVersion ? String(lastHello.extensionVersion) : '',
    installedProtocolVersion: lastHello && lastHello.protocolVersion ? Number(lastHello.protocolVersion) : 0,
    lastHelloAt: lastHello ? now() : 0,
    lastError: ''
  }, extra || {});
}

async function dispatch(method, params) {
  switch (method) {
    case 'status':
    case 'getStatus':
      await ensureBridge();
      return buildStatus();
    case 'prepareSetup':
      await ensureBridge();
      return buildStatus({ ok: true, action: 'prepareSetup' });
    case 'runAction':
      if (params && params.action === 'stop_agent') return stopBridge();
      await ensureBridge();
      return buildStatus({ ok: true, action: asText(params && params.action, 64) || 'install' });
    case 'testConnection':
      await ensureBridge();
      return buildStatus({ ok: true, action: 'test' });
    case 'lookup':
      return { ok: false, message: 'Lookup host import path is owned by Tauri.', payload: params && params.payload || {} };
    case 'openInstallDir':
    case 'openGuide':
      return { ok: false, error: 'open_path_owned_by_tauri' };
    case 'updatePrefs':
      return Object.assign({ ok: true }, buildStatus({ settings: patchSettings(params && params.prefs || {}) }));
    case 'createWorkspace':
      return queueWorkspace(params && params.name);
    case 'rendererReady':
      await ensureBridge();
      notify('browserCapture:stateChanged', { rendererReady: true });
      return { ok: true };
    case 'ackPayload':
      return ackPayload(params && params.queueId);
    case 'shutdown':
      await stopBridge();
      return { ok: true };
    default:
      return { ok: false, error: 'unknown_method', method };
  }
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
  let index;
  while ((index = input.indexOf('\n')) >= 0) {
    const line = input.slice(0, index).trim();
    input = input.slice(index + 1);
    if (!line) continue;
    Promise.resolve().then(async () => {
      let message;
      try {
        message = JSON.parse(line);
        const result = await dispatch(String(message.method || ''), message.params || {});
        if (message.id != null) writeLine({ id: message.id, result });
      } catch (error) {
        if (message && message.id != null) {
          writeLine({ id: message.id, error: error && error.message ? error.message : String(error) });
        } else {
          notify('browserCapture:error', { error: error && error.message ? error.message : String(error) });
        }
      }
    });
  }
});

ensureBridge().catch((error) => {
  notify('browserCapture:error', { error: error && error.message ? error.message : String(error) });
});

process.on('SIGTERM', () => {
  stopBridge().finally(() => process.exit(0));
});
