'use strict';

const { sanitizeCapturePayload } = require('./main-process-browser-capture');

/**
 * Capture Queue Dispatcher
 *
 * Owns the in-process scheduling of pending browser-capture deliveries to
 * the renderer. Holds three pieces of state:
 *   1. flushTimer       — debounced setTimeout handle for next flush
 *   2. deliveredPayloadIds — { [queueId]: deliveredAtMs }
 *      (so a payload isn't re-sent within 1.5s)
 *   3. pendingWorkspaceEvents — workspaceCreated events that couldn't be
 *      delivered yet because the renderer wasn't ready
 *
 * State is stored in a `runtime` object provided by the caller — main.js
 * already owns `browserCaptureRuntime` and continues to do so.
 *
 * The dispatcher does I/O via `getMainWindow` (lazy ref) and
 * `getPersistedPendingCaptures` from the store. Acknowledged deliveries
 * are recorded in the runtime's deliveredPayloadIds so we don't double-send.
 *
 * Required deps:
 *   runtime                 — { flushTimer, pendingPayloads, deliveredPayloadIds,
 *                              pendingWorkspaceEvents, deliveredWorkspaceIds, ready }
 *   getMainWindow           — () => BrowserWindow | null
 *   store                   — browser-capture store (getPersistedPendingCaptures, persistPending)
 *   nowFn                   — () => Date.now (for testability)
 *
 * Optional:
 *   readyMessage            — string sent when runtime.ready is true
 *   notReadyMessage         — string sent when runtime.ready is false
 *   reFlushDelayMs          — debounce when more entries arrive (default 1200)
 *   minFlushDelayMs         — lower bound on schedule delay (default 80)
 *   defaultFlushDelayMs     — default delay when caller passes 0/undefined (default 200)
 *   payloadResendIntervalMs — drop duplicate sends within this window (default 1500)
 *   workspaceResendIntervalMs — same for workspace events (default 1200)
 *   maxWorkspaceAttempts    — give up workspace event after N attempts (default 4)
 */
function createCaptureQueueDispatcher({
  runtime,
  getMainWindow,
  store,
  nowFn = Date.now,
  readyMessage = 'Capture AcademiQ kuyruğuna alındı ve işleniyor.',
  notReadyMessage = 'Capture AcademiQ kuyruğuna alındı. Uygulama hazır olduğunda senkronize edilecek.',
  reFlushDelayMs = 1200,
  minFlushDelayMs = 80,
  defaultFlushDelayMs = 200,
  payloadResendIntervalMs = 1500,
  workspaceResendIntervalMs = 1200,
  maxWorkspaceAttempts = 4,
  insufficientErrorMessage = 'Capture verisi yetersiz'
}) {
  if (!runtime || typeof runtime !== 'object') {
    throw new Error('createCaptureQueueDispatcher: runtime object required');
  }
  if (typeof getMainWindow !== 'function') {
    throw new Error('createCaptureQueueDispatcher: getMainWindow required');
  }
  if (!store || typeof store.getPersistedPendingCaptures !== 'function') {
    throw new Error('createCaptureQueueDispatcher: store with getPersistedPendingCaptures required');
  }

  // Make sure runtime has the substructures we use
  if (!runtime.deliveredPayloadIds || typeof runtime.deliveredPayloadIds !== 'object') {
    runtime.deliveredPayloadIds = {};
  }
  if (!runtime.deliveredWorkspaceIds || typeof runtime.deliveredWorkspaceIds !== 'object') {
    runtime.deliveredWorkspaceIds = {};
  }
  if (!Array.isArray(runtime.pendingWorkspaceEvents)) {
    runtime.pendingWorkspaceEvents = [];
  }

  function isWindowAlive() {
    const win = getMainWindow();
    return !!(win && typeof win.isDestroyed === 'function' && !win.isDestroyed());
  }

  function sendToRenderer(channel, payload) {
    const win = getMainWindow();
    if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return false;
    try {
      win.webContents.send(channel, payload);
      return true;
    } catch (_e) {
      return false;
    }
  }

  function hydratePendingFromStore() {
    runtime.pendingPayloads = store.getPersistedPendingCaptures();
    return runtime.pendingPayloads;
  }

  function flushPending() {
    if (!isWindowAlive()) return;
    hydratePendingFromStore().forEach((entry) => {
      if (!entry || !entry.id || !entry.payload) return;
      const deliveredAt = Number(runtime.deliveredPayloadIds[entry.id] || 0);
      const now = nowFn();
      if (deliveredAt && (now - deliveredAt) < payloadResendIntervalMs) return;
      runtime.deliveredPayloadIds[entry.id] = now;
      sendToRenderer('browserCapture:incoming', Object.assign({}, entry.payload, { queueId: entry.id }));
    });

    runtime.pendingWorkspaceEvents = runtime.pendingWorkspaceEvents.filter((entry) => {
      if (!entry || !entry.workspace || !entry.workspace.id) return false;
      entry.attempts = Number(entry.attempts || 0);
      const wsId = entry.workspace.id;
      const deliveredAt = Number(runtime.deliveredWorkspaceIds[wsId] || 0);
      const now = nowFn();
      if (deliveredAt && (now - deliveredAt) < workspaceResendIntervalMs) {
        return entry.attempts < maxWorkspaceAttempts;
      }
      runtime.deliveredWorkspaceIds[wsId] = now;
      entry.attempts += 1;
      sendToRenderer('browserCapture:workspaceCreated', entry);
      return entry.attempts < maxWorkspaceAttempts;
    });
  }

  function scheduleFlush(delayMs) {
    if (runtime.flushTimer) clearTimeout(runtime.flushTimer);
    runtime.flushTimer = setTimeout(() => {
      runtime.flushTimer = null;
      flushPending();
      const stillPending = store.getPersistedPendingCaptures().length || runtime.pendingWorkspaceEvents.length;
      if (stillPending) scheduleFlush(reFlushDelayMs);
    }, Math.max(minFlushDelayMs, Number(delayMs) || defaultFlushDelayMs));
  }

  function queuePayload(payload) {
    const safePayload = sanitizeCapturePayload(payload);
    if (!safePayload.detectedTitle && !safePayload.doi && !safePayload.sourcePageUrl) {
      return { ok: false, error: insufficientErrorMessage };
    }
    const { entry, all } = store.persistPending(safePayload);
    runtime.pendingPayloads = all;

    // Try to bring the main window forward so the user notices
    const win = getMainWindow();
    if (win && (typeof win.isDestroyed !== 'function' || !win.isDestroyed())) {
      try {
        if (typeof win.isMinimized === 'function' && win.isMinimized() && typeof win.restore === 'function') {
          win.restore();
        }
        if (typeof win.show === 'function') win.show();
        if (typeof win.focus === 'function') win.focus();
      } catch (_e) {}
    }

    scheduleFlush(50);
    return {
      ok: true,
      queued: true,
      queueId: entry.id,
      message: runtime.ready ? readyMessage : notReadyMessage
    };
  }

  function pushWorkspaceEvent(event) {
    if (!event || !event.workspace || !event.workspace.id) return false;
    runtime.pendingWorkspaceEvents.push(Object.assign({}, event, {
      attempts: Number(event.attempts || 0)
    }));
    scheduleFlush(50);
    return true;
  }

  function clear() {
    if (runtime.flushTimer) {
      clearTimeout(runtime.flushTimer);
      runtime.flushTimer = null;
    }
  }

  return {
    hydratePendingFromStore,
    flushPending,
    scheduleFlush,
    queuePayload,
    pushWorkspaceEvent,
    clear
  };
}

module.exports = { createCaptureQueueDispatcher };
