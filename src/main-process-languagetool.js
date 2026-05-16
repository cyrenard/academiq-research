/* eslint-disable no-console */
/**
 * LanguageTool server lifecycle (main process).
 *
 * Spawns a local `languagetool-server.jar` using the bundled JRE,
 * health-checks it, restarts it on crash, and kills it on app quit.
 * All paths are resolved against the packaged Electron resources:
 *
 *   resources/
 *     jre/
 *       bin/java(.exe)
 *     languagetool/
 *       languagetool-server.jar
 *       (+ language models bundled with the jar's distribution zip)
 *
 * In development we look for the same layout under <repo>/vendor/.
 * If neither path exists the module reports status:'missing' and the
 * renderer falls back to disabled-with-helpful-message in the UI.
 *
 * Exposed surface (called from main.js):
 *   - init({ resourcesPath, devVendorPath, port? }) → install + try spawn
 *   - getStatus() → { state, port, endpoint, error? }
 *   - stop() → graceful kill on app-quit
 *   - onStatusChange(cb) → subscribe to state transitions
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

// Lifecycle states:
//   'missing'   — JRE or JAR not on disk yet (bundling problem)
//   'starting'  — spawned, waiting for /v2/check to respond 2xx
//   'ready'     — health check passed at least once
//   'crashed'   — process exited unexpectedly; will be restarted
//   'stopped'   — explicit stop() during quit; no auto-restart
//   'error'     — could not spawn at all (bad permissions, etc.)
const VALID_STATES = ['missing', 'starting', 'ready', 'crashed', 'stopped', 'error'];

const DEFAULT_PORT = 8087;
const HEALTH_INTERVAL_MS = 750;
const HEALTH_TIMEOUT_MS = 30000;   // give the JVM up to 30s to warm up
const RESTART_DELAY_MS = 4000;     // back-off before respawn on crash
const MAX_RESTARTS = 3;            // give up after this many crashes in a row

let state = 'missing';
let port = DEFAULT_PORT;
let proc = null;
let lastError = '';
let restartCount = 0;
let healthTimer = null;
let healthDeadline = 0;
let stopping = false;
let listeners = [];
let resolvedJavaPath = '';
let resolvedJarPath = '';

function setState(next, err) {
  if (!VALID_STATES.includes(next)) return;
  if (next === state && (!err || err === lastError)) return;
  state = next;
  lastError = err ? String(err) : '';
  for (const fn of listeners) {
    try { fn(getStatus()); } catch (_e) {}
  }
}

function getStatus() {
  return {
    state,
    port,
    endpoint: `http://127.0.0.1:${port}/v2/check`,
    error: lastError || undefined,
    jarPath: resolvedJarPath || undefined,
    javaPath: resolvedJavaPath || undefined
  };
}

function onStatusChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((x) => x !== fn);
  };
}

function pathExists(p) {
  try { return fs.statSync(p).isFile() || fs.statSync(p).isDirectory(); } catch { return false; }
}

/**
 * Resolve the bundled Java + jar paths. We try the packaged location
 * first (Electron's resourcesPath), then fall back to the dev vendor/
 * directory so `npm start` works once `npm run setup:lt` has been run.
 */
function resolveBinaries({ resourcesPath, devVendorPath }) {
  const javaName = process.platform === 'win32' ? 'java.exe' : 'java';
  const candidates = [];
  if (resourcesPath) {
    candidates.push({
      java: path.join(resourcesPath, 'jre', 'bin', javaName),
      jar: path.join(resourcesPath, 'languagetool', 'languagetool-server.jar')
    });
  }
  if (devVendorPath) {
    candidates.push({
      java: path.join(devVendorPath, 'jre', 'bin', javaName),
      jar: path.join(devVendorPath, 'languagetool', 'languagetool-server.jar')
    });
  }
  for (const c of candidates) {
    if (pathExists(c.java) && pathExists(c.jar)) {
      return c;
    }
  }
  return null;
}

function pingHealth() {
  const req = http.request({
    host: '127.0.0.1',
    port,
    method: 'POST',
    path: '/v2/check',
    timeout: 1500,
    headers: { 'content-type': 'application/x-www-form-urlencoded' }
  }, (res) => {
    res.resume();
    // Server replies 200 to a valid /v2/check, or 400 to a missing-text
    // request. Either proves the JVM is up and routing.
    if (res.statusCode === 200 || res.statusCode === 400) {
      setState('ready');
      stopHealthLoop();
      return;
    }
    scheduleNextHealth();
  });
  req.on('error', () => scheduleNextHealth());
  req.on('timeout', () => { try { req.destroy(); } catch (_e) {} scheduleNextHealth(); });
  req.write('language=tr-TR&text=warmup');
  req.end();
}

function scheduleNextHealth() {
  if (state !== 'starting') return;
  if (Date.now() > healthDeadline) {
    setState('error', 'health-check timeout');
    if (proc) { try { proc.kill('SIGTERM'); } catch (_e) {} }
    return;
  }
  healthTimer = setTimeout(pingHealth, HEALTH_INTERVAL_MS);
}

function stopHealthLoop() {
  if (healthTimer) { clearTimeout(healthTimer); healthTimer = null; }
}

function spawnServer() {
  if (!resolvedJavaPath || !resolvedJarPath) {
    setState('missing', 'binaries not found');
    return;
  }
  if (proc) return;
  try {
    proc = spawn(resolvedJavaPath, [
      '-Xms256m',
      '-Xmx1g',
      '-jar', resolvedJarPath,
      '--port', String(port),
      '--allow-origin', '*'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    setState('error', err && err.message ? err.message : 'spawn failed');
    proc = null;
    return;
  }
  setState('starting');
  healthDeadline = Date.now() + HEALTH_TIMEOUT_MS;
  scheduleNextHealth();

  proc.on('exit', (code, signal) => {
    proc = null;
    stopHealthLoop();
    if (stopping) {
      setState('stopped');
      return;
    }
    const reason = signal ? `signal ${signal}` : `exit code ${code}`;
    setState('crashed', reason);
    if (restartCount < MAX_RESTARTS) {
      restartCount += 1;
      setTimeout(() => { if (!stopping) spawnServer(); }, RESTART_DELAY_MS);
    } else {
      setState('error', `gave up after ${MAX_RESTARTS} restarts (${reason})`);
    }
  });

  // Surface stderr as the most recent error string for the status payload.
  proc.stderr.on('data', (chunk) => {
    const text = String(chunk || '').trim();
    if (text) lastError = text.slice(0, 240);
  });
}

function init(options) {
  const opts = options && typeof options === 'object' ? options : {};
  port = Number(opts.port) > 0 ? Number(opts.port) : DEFAULT_PORT;
  const resolved = resolveBinaries({
    resourcesPath: opts.resourcesPath || '',
    devVendorPath: opts.devVendorPath || ''
  });
  if (!resolved) {
    setState('missing', 'JRE or LanguageTool jar not bundled');
    return getStatus();
  }
  resolvedJavaPath = resolved.java;
  resolvedJarPath = resolved.jar;
  stopping = false;
  restartCount = 0;
  spawnServer();
  return getStatus();
}

function stop() {
  stopping = true;
  stopHealthLoop();
  if (proc) {
    try { proc.kill('SIGTERM'); } catch (_e) {}
    // Force-kill if it doesn't go gracefully within 3s
    setTimeout(() => {
      if (proc) { try { proc.kill('SIGKILL'); } catch (_e) {} }
    }, 3000);
  } else {
    setState('stopped');
  }
}

module.exports = {
  init,
  stop,
  getStatus,
  onStatusChange
};
