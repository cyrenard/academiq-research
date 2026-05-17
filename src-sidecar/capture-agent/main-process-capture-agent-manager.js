'use strict';

const path = require('path');
const { execFile } = require('child_process');
const { DEFAULT_CAPTURE_PORT, BROWSER_CAPTURE_PROTOCOL_VERSION } = require('./main-process-browser-capture');

/**
 * Capture Agent Process Manager
 *
 * Owns the lifecycle of the detached Electron capture-agent helper process:
 * spawning it (Windows-detached or Unix-detached), pinging /status, requesting
 * graceful shutdown via /agent/stop, and reflecting the result into the
 * persistent capture-agent-state file. Also wraps the Windows login-item
 * "auto-start" toggle.
 *
 * Encapsulates `startPromise` so concurrent ensureRunning() calls dedupe.
 *
 * Required deps:
 *   app                 — Electron app (getAppPath, isPackaged, getLoginItem*)
 *   storage             — needs saveCaptureAgentState + loadCaptureAgentState (optional but recommended)
 *   getBrowserSettings  — () => normalized browser-capture settings (token, port)
 *   appVersion          — string, current app version
 *   captureAgentArg     — CLI flag identifying agent mode (default: --capture-agent)
 *   captureAgentAutostartArg — CLI flag for autostart (default: --capture-agent-autostart)
 *   startRetries        — number, attempts on start failure (default: 2)
 *   startDelayMs        — number, ms between start and first ping (default: 1200)
 *   nowFn               — () => Date.now() (for testability; default: Date.now)
 *   fetchFn             — fetch(url, opts) (for testability; default: globalThis.fetch)
 *   execFileFn          — child_process.execFile (for testability; default: execFile)
 */
function createCaptureAgentManager({
  app,
  storage = null,
  getBrowserSettings,
  appVersion,
  captureAgentArg = '--capture-agent',
  captureAgentAutostartArg = '--capture-agent-autostart',
  startRetries = 2,
  startDelayMs = 1200,
  nowFn = Date.now,
  fetchFn = globalThis.fetch,
  execFileFn = execFile,
  processRef = process
}) {
  if (!app) throw new Error('createCaptureAgentManager: app required');
  if (typeof getBrowserSettings !== 'function') {
    throw new Error('createCaptureAgentManager: getBrowserSettings required');
  }
  if (!appVersion) throw new Error('createCaptureAgentManager: appVersion required');
  if (typeof fetchFn !== 'function') {
    throw new Error('createCaptureAgentManager: fetchFn required (use Node 18+ or pass one in)');
  }

  let startPromise = null;

  function psQuote(value) {
    return "'" + String(value == null ? '' : value).replace(/'/g, "''") + "'";
  }

  function waitForMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function buildSpawnArgs() {
    const args = [];
    if (processRef.defaultApp) {
      args.push(path.resolve(app.getAppPath()));
    }
    args.push(captureAgentArg);
    return args;
  }

  function buildAutoStartArgs() {
    return buildSpawnArgs().concat([captureAgentAutostartArg]);
  }

  function getLoginItemState() {
    if (processRef.platform !== 'win32' || !app.isPackaged || typeof app.getLoginItemSettings !== 'function') {
      return { supported: false, enabled: false };
    }
    try {
      const info = app.getLoginItemSettings({
        path: processRef.execPath,
        args: buildAutoStartArgs()
      });
      return {
        supported: true,
        enabled: !!(info && info.openAtLogin)
      };
    } catch (_e) {
      return { supported: false, enabled: false };
    }
  }

  function syncLoginItem(enabled) {
    const current = getLoginItemState();
    if (!current.supported || typeof app.setLoginItemSettings !== 'function') {
      return current;
    }
    try {
      app.setLoginItemSettings({
        openAtLogin: !!enabled,
        path: processRef.execPath,
        args: buildAutoStartArgs()
      });
    } catch (_e) {}
    return getLoginItemState();
  }

  function startDetached() {
    const args = buildSpawnArgs();
    if (processRef.platform === 'win32') {
      const psArgs = [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-Command',
        'Start-Process -FilePath ' + psQuote(processRef.execPath)
          + ' -ArgumentList @(' + args.map(psQuote).join(',') + ')'
          + ' -WindowStyle Hidden'
      ];
      return new Promise((resolve, reject) => {
        execFileFn('powershell.exe', psArgs, { windowsHide: true }, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
    return new Promise((resolve, reject) => {
      try {
        const child = execFileFn(processRef.execPath, args, {
          detached: true,
          windowsHide: true
        }, (error) => {
          if (error) reject(error);
        });
        if (child && typeof child.unref === 'function') child.unref();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  async function pingStatus() {
    const settings = getBrowserSettings();
    const port = Number(settings.port || DEFAULT_CAPTURE_PORT) || DEFAULT_CAPTURE_PORT;
    const token = encodeURIComponent(String(settings.token || ''));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    try {
      const response = await fetchFn('http://127.0.0.1:' + port + '/status?token=' + token, {
        method: 'GET',
        signal: controller.signal
      });
      if (!response.ok) throw new Error('agent-status-' + response.status);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function refreshStatusSnapshot() {
    const canPersist = storage && typeof storage.saveCaptureAgentState === 'function';
    const loadCurrent = () => {
      if (storage && typeof storage.loadCaptureAgentState === 'function') {
        try { return storage.loadCaptureAgentState() || {}; } catch (_e) { return {}; }
      }
      return {};
    };
    try {
      const live = await pingStatus();
      if (canPersist) {
        const current = loadCurrent();
        storage.saveCaptureAgentState(Object.assign({}, current, {
          running: true,
          pid: Number(live.agentPid || live.pid || current.pid || 0),
          port: Number(live.agentPort || live.port || getBrowserSettings().port || DEFAULT_CAPTURE_PORT),
          agentVersion: String(live.agentVersion || current.agentVersion || appVersion),
          extensionVersion: String(live.extensionVersion || current.extensionVersion || ''),
          protocolVersion: Number(live.protocolVersion || current.protocolVersion || BROWSER_CAPTURE_PROTOCOL_VERSION),
          lastHelloAt: Number(live.lastHelloAt || current.lastHelloAt || 0),
          lastCaptureReceivedAt: Number(live.lastCaptureReceivedAt || current.lastCaptureReceivedAt || 0),
          lastError: ''
        }));
      }
      return live;
    } catch (error) {
      if (canPersist) {
        const current = loadCurrent();
        storage.saveCaptureAgentState(Object.assign({}, current, {
          running: false,
          pid: 0,
          port: 0,
          lastError: error && error.message ? String(error.message) : 'Capture agent ulasilamiyor'
        }));
      }
      return null;
    }
  }

  async function ensureRunning() {
    const live = await refreshStatusSnapshot();
    if (live && live.ok) {
      const liveVersion = String(live.agentVersion || '');
      const liveProtocolVersion = Number(live.protocolVersion || 0);
      if (liveVersion === appVersion && (!liveProtocolVersion || liveProtocolVersion === BROWSER_CAPTURE_PROTOCOL_VERSION)) {
        return live;
      }
      try { await stop(); } catch (_e) {}
    }
    if (startPromise) return startPromise;
    startPromise = new Promise((resolve, reject) => {
      const tryStart = (attemptIndex) => {
        startDetached().then(() => {
          setTimeout(async () => {
            try {
              const status = await refreshStatusSnapshot();
              if (status && status.ok) {
                resolve(status);
                return;
              }
              if (attemptIndex + 1 < startRetries) {
                await waitForMs(350);
                tryStart(attemptIndex + 1);
                return;
              }
              reject(new Error('Capture agent baslatildi ancak ulasilamiyor'));
            } catch (err) {
              if (attemptIndex + 1 < startRetries) {
                await waitForMs(350);
                tryStart(attemptIndex + 1);
                return;
              }
              reject(err);
            }
          }, startDelayMs);
        }).catch((err) => {
          try {
            if (attemptIndex + 1 < startRetries) {
              tryStart(attemptIndex + 1);
              return;
            }
            reject(err);
          } catch (nestedError) {
            reject(nestedError);
          }
        });
      };
      try {
        tryStart(0);
      } catch (err) {
        reject(err);
      }
    }).finally(() => {
      startPromise = null;
    });
    return startPromise;
  }

  async function stop() {
    const settings = getBrowserSettings();
    const port = Number(settings.port || DEFAULT_CAPTURE_PORT) || DEFAULT_CAPTURE_PORT;
    const token = encodeURIComponent(String(settings.token || ''));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
      const response = await fetchFn('http://127.0.0.1:' + port + '/agent/stop?token=' + token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: controller.signal
      });
      if (!response.ok) throw new Error('agent-stop-' + response.status);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    buildSpawnArgs,
    buildAutoStartArgs,
    getLoginItemState,
    syncLoginItem,
    startDetached,
    pingStatus,
    refreshStatusSnapshot,
    ensureRunning,
    stop,
    // Expose internal start-promise for tests/debug
    _isStarting: () => !!startPromise
  };
}

module.exports = { createCaptureAgentManager };
