'use strict';

const crypto = require('crypto');
const {
  DEFAULT_CAPTURE_PORT,
  normalizeBrowserCaptureSettings,
  sanitizeCapturePayload,
  safeId
} = require('./main-process-browser-capture');

const PENDING_CAPTURE_LIMIT = 40;

/**
 * Storage-facing helpers for browser-capture settings + persisted pending
 * payload queue. All I/O goes through the injected `storage` service so
 * callers can use real disk storage in production and in-memory fakes in
 * tests. The factory returns purely-functional methods; runtime-state
 * mutation (browserCaptureRuntime.pendingPayloads etc.) stays in main.js
 * via thin wrappers, so the responsibilities are clear.
 *
 * Required storage methods:
 *   - getBrowserCaptureSettings() -> object
 *   - setBrowserCaptureSettings(patch) -> void
 *   - getSettingsSnapshot() -> object (full settings tree)
 */
function createBrowserCaptureStore({ storage }) {
  if (!storage || typeof storage.getBrowserCaptureSettings !== 'function') {
    throw new Error('createBrowserCaptureStore: storage.getBrowserCaptureSettings required');
  }
  if (typeof storage.setBrowserCaptureSettings !== 'function') {
    throw new Error('createBrowserCaptureStore: storage.setBrowserCaptureSettings required');
  }

  function createCaptureToken() {
    // Cryptographically random; 32 bytes -> 64 hex chars. Used to authenticate
    // the local browser-capture bridge, so it must not be predictable.
    return 'aq_' + crypto.randomBytes(32).toString('hex');
  }

  function getSettings() {
    const raw = storage.getBrowserCaptureSettings();
    const normalized = normalizeBrowserCaptureSettings(raw);
    if (!normalized.token) {
      normalized.token = createCaptureToken();
      storage.setBrowserCaptureSettings({ token: normalized.token });
    }
    if (!normalized.port) {
      normalized.port = DEFAULT_CAPTURE_PORT;
      storage.setBrowserCaptureSettings({ port: normalized.port });
    }
    return normalized;
  }

  function normalizePendingEntry(rawEntry) {
    const raw = rawEntry && typeof rawEntry === 'object' ? rawEntry : {};
    const id = safeId(raw.id) || '';
    const payload = sanitizeCapturePayload(raw.payload || raw);
    if (!id || (!payload.detectedTitle && !payload.doi && !payload.sourcePageUrl)) return null;
    return {
      id,
      createdAt: Number(raw.createdAt) > 0 ? Number(raw.createdAt) : Date.now(),
      payload
    };
  }

  function getPersistedPendingCaptures() {
    const snapshot = typeof storage.getSettingsSnapshot === 'function'
      ? storage.getSettingsSnapshot()
      : {};
    const browserCapture = snapshot && snapshot.browserCapture && typeof snapshot.browserCapture === 'object'
      ? snapshot.browserCapture
      : {};
    const items = Array.isArray(browserCapture.pendingPayloads) ? browserCapture.pendingPayloads : [];
    return items
      .map(normalizePendingEntry)
      .filter(Boolean)
      .slice(-PENDING_CAPTURE_LIMIT);
  }

  function savePersistedPendingCaptures(entries) {
    const normalized = Array.isArray(entries)
      ? entries.map(normalizePendingEntry).filter(Boolean).slice(-PENDING_CAPTURE_LIMIT)
      : [];
    storage.setBrowserCaptureSettings({ pendingPayloads: normalized });
    return normalized;
  }

  function persistPending(payload) {
    const safePayload = sanitizeCapturePayload(payload);
    const queueId = payload && payload.queueId ? payload.queueId : '';
    const fallbackId = 'cap_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const entry = {
      id: safeId(queueId) || fallbackId,
      createdAt: Date.now(),
      payload: safePayload
    };
    const existing = getPersistedPendingCaptures().filter((item) => item && item.id !== entry.id);
    const all = savePersistedPendingCaptures(existing.concat([entry]));
    return { entry, all };
  }

  function acknowledgePending(queueId) {
    const id = safeId(queueId);
    if (!id) return { ok: false, error: 'Geçersiz capture kimliği', id: '', next: null };
    const next = savePersistedPendingCaptures(
      getPersistedPendingCaptures().filter((entry) => entry && entry.id !== id)
    );
    return { ok: true, id, next };
  }

  return {
    PENDING_CAPTURE_LIMIT,
    createCaptureToken,
    getSettings,
    getPersistedPendingCaptures,
    savePersistedPendingCaptures,
    persistPending,
    acknowledgePending
  };
}

module.exports = {
  createBrowserCaptureStore,
  PENDING_CAPTURE_LIMIT
};
