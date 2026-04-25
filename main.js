const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const { session } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const crypto = require('crypto');
const { createStorageService } = require('./src/main-process-storage.js');
const {
  DEFAULT_CAPTURE_PORT,
  BROWSER_CAPTURE_PROTOCOL_VERSION,
  parseWindowsDefaultBrowserRegOutput,
  parseBrowserOpenCommandOutput,
  extractExecutableFromCommand,
  safeId,
  deriveSetupState,
  readExtensionManifestInfo,
  evaluateBrowserCaptureLifecycle,
  getBrowserExtensionManagerUrl,
  normalizeBrowserCaptureSettings,
  buildTargetsFromDataJSON,
  sanitizeCapturePayload,
  buildCaptureDeepLink,
  parseCaptureProtocolUrl,
  determineBrowserInstallStrategy,
  buildManagedChromiumLaunchArgs,
  buildManagedSessionGuide,
  prepareExtensionBundle
} = require('./src/main-process-browser-capture.js');
const {
  createCaptureAgentRuntime,
  processCaptureQueue
} = require('./src/capture-agent.js');
const AQWebRelatedPapers = require('./src/web-related-papers.js');
const AQLiteratureMatrixState = require('./src/literature-matrix-state.js');
const AQDocTabsState = require('./src/doc-tabs-state.js');
const AQStateSchema = require('./src/state-schema.js');
const {
  buildUpdateCheckResult,
  normalizeDownloadUrl,
  applyDownloadedUpdate,
  computeRuntimeSignature,
  computeRendererRuntimeSignature,
  resolveRuntimeOverride,
  archiveLegacyRuntimeOverrides,
  archiveRuntimeOverride,
  archiveStaleRuntimeOverrides,
  archiveUnexpectedAppRuntimeFiles
} = require('./src/main-process-updater.js');
const { followRedirects, fetchJSON, postFormJSON } = require('./src/main-process-net.js');
const { createLocalOcr } = require('./src/local-ocr.js');
const {
  buildExportHTML,
  buildPrintToPDFOptions
} = require('./src/main-process-pdf-export.js');
const {
  buildVerificationReport
} = require('./src/pdf-verification.js');
const {
  classifyPdfDownloadFailure
} = require('./src/pdf-download-errors.js');
const {
  decodeWordImportBuffer
} = require('./src/main-process-word-import.js');

// â”€â”€ PATHS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const APP_DIR = path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'AcademiQ');
const storage = createStorageService({ appDir: APP_DIR });
const localOcr = createLocalOcr({ appDir: APP_DIR });
const BROWSER_CAPTURE_SOURCE_DIR = path.join(__dirname, 'browser-capture-extension');
const APP_VERSION = require('./package.json').version;
const APP_USER_MODEL_ID = 'com.academiq.research';
const CAPTURE_AGENT_ARG = '--capture-agent';
const CAPTURE_AGENT_AUTOSTART_ARG = '--capture-agent-autostart';
const IS_CAPTURE_AGENT_MODE = process.argv.includes(CAPTURE_AGENT_ARG);
const IS_CAPTURE_AGENT_AUTOSTART = process.argv.includes(CAPTURE_AGENT_AUTOSTART_ARG);

if (process.platform === 'win32') {
  // Ensures taskbar/start menu/protocol windows resolve to the app identity
  // instead of the generic Electron host identity when possible.
  try { app.setAppUserModelId(APP_USER_MODEL_ID); } catch (_e) {}
}

// â”€â”€ WINDOW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let mainWindow;
let latestStateJSON = '';
let browserCaptureRuntime = {
  bridge: null,
  ready: false,
  pendingPayloads: [],
  pendingWorkspaceEvents: [],
  deliveredPayloadIds: {},
  deliveredWorkspaceIds: {},
  flushTimer: null,
  lastBridgeEventAt: 0,
  lastHelloAt: 0,
  lastHelloPayload: null,
  stopAgentRequested: false,
  quitEnsured: false
};
let captureAgentRuntime = null;
let captureAgentStartPromise = null;
let captureQueuePollTimer = null;
let captureQueuePollRunning = false;
const CAPTURE_AGENT_START_RETRIES = 2;
const CAPTURE_AGENT_START_DELAY_MS = 1200;
const UPDATE_ALLOWED_HOSTS = [
  /^api\.github\.com$/i,
  /^github\.com$/i,
  /^raw\.githubusercontent\.com$/i,
  /^objects\.githubusercontent\.com$/i,
  /^release-assets\.githubusercontent\.com$/i,
  /^github-releases\.githubusercontent\.com$/i,
  /^codeload\.github\.com$/i
];
const BROWSER_CAPTURE_MANAGED_PROFILE_DIR = path.join(APP_DIR, 'browser-capture-profile');
const NET_ALLOWED_HOSTS = [
  /^api\.crossref\.org$/i,
  /^api\.unpaywall\.org$/i,
  /^api\.semanticscholar\.org$/i,
  /^www\.semanticscholar\.org$/i,
  /^api\.openalex\.org$/i,
  /^api\.core\.ac\.uk$/i,
  /^www\.ebi\.ac\.uk$/i,
  /^eutils\.ncbi\.nlm\.nih\.gov$/i,
  /^www\.ncbi\.nlm\.nih\.gov$/i,
  /^pubmed\.ncbi\.nlm\.nih\.gov$/i,
  /^doaj\.org$/i,
  /^api\.openaire\.eu$/i,
  /^api\.datacite\.org$/i,
  /^zenodo\.org$/i,
  /^doi\.org$/i,
  /^dx\.doi\.org$/i,
  /^dergipark\.org\.tr$/i,
  /^www\.dergipark\.org\.tr$/i,
  /^europepmc\.org$/i
];

const RENDERER_LOG_MAX_BYTES = 5 * 1024 * 1024; // 5 MB soft cap
const RENDERER_LOG_KEEP_BYTES = 1 * 1024 * 1024; // retain last ~1 MB on rotation
function rotateRendererProbeLogIfNeeded(target) {
  try {
    const stat = fs.statSync(target);
    if (stat && stat.size > RENDERER_LOG_MAX_BYTES) {
      // Keep only the tail (last KEEP bytes), drop partial first line
      const fd = fs.openSync(target, 'r');
      try {
        const buf = Buffer.alloc(RENDERER_LOG_KEEP_BYTES);
        const start = Math.max(0, stat.size - RENDERER_LOG_KEEP_BYTES);
        const read = fs.readSync(fd, buf, 0, RENDERER_LOG_KEEP_BYTES, start);
        let tail = buf.slice(0, read).toString('utf8');
        const nl = tail.indexOf('\n');
        if (nl !== -1) tail = tail.slice(nl + 1);
        fs.writeFileSync(target, tail, 'utf8');
      } finally {
        try { fs.closeSync(fd); } catch (_e) {}
      }
    }
  } catch (_e) {}
}
function appendRendererProbeError(payload) {
  try {
    const target = path.join(storage.appDir, 'renderer-errors.log');
    rotateRendererProbeLogIfNeeded(target);
    const line = JSON.stringify({
      ts: Date.now(),
      payload: payload && typeof payload === 'object'
        ? payload
        : { message: String(payload || '') }
    });
    fs.appendFileSync(target, line + '\n', 'utf8');
  } catch (_e) {}
}

function psQuote(value) {
  return "'" + String(value || '').replace(/'/g, "''") + "'";
}

function normalizeHost(hostname) {
  return String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
}

function isBlockedHost(hostname) {
  const host = normalizeHost(hostname);
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '0.0.0.0') return true;
  if (host === '::1' || host === '[::1]') return true;
  if (host.endsWith('.local')) return true;
  return false;
}

function isSafeHttpURL(rawUrl, options = {}) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    const protocol = String(parsed.protocol || '').toLowerCase();
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    if (options.httpsOnly && protocol !== 'https:') return false;
    if (isBlockedHost(parsed.hostname)) return false;
    return true;
  } catch (_e) {
    return false;
  }
}

function createCaptureToken() {
  // Cryptographically random; 32 bytes -> 64 hex chars. Used to authenticate
  // the local browser-capture bridge, so it must not be predictable.
  return 'aq_' + crypto.randomBytes(32).toString('hex');
}

function getBrowserCaptureSettings() {
  const raw = storage.getBrowserCaptureSettings ? storage.getBrowserCaptureSettings() : {};
  const normalized = normalizeBrowserCaptureSettings(raw);
  if (!normalized.token) {
    normalized.token = createCaptureToken();
    if (storage.setBrowserCaptureSettings) storage.setBrowserCaptureSettings({ token: normalized.token });
  }
  if (!normalized.port) {
    normalized.port = DEFAULT_CAPTURE_PORT;
    if (storage.setBrowserCaptureSettings) storage.setBrowserCaptureSettings({ port: normalized.port });
  }
  return normalized;
}

function getPersistedPendingCaptures() {
  const snapshot = storage.getSettingsSnapshot ? storage.getSettingsSnapshot() : {};
  const browserCapture = snapshot && snapshot.browserCapture && typeof snapshot.browserCapture === 'object'
    ? snapshot.browserCapture
    : {};
  const items = Array.isArray(browserCapture.pendingPayloads) ? browserCapture.pendingPayloads : [];
  return items
    .map(function (entry) {
      const raw = entry && typeof entry === 'object' ? entry : {};
      const id = safeId(raw.id) || '';
      const payload = sanitizeCapturePayload(raw.payload || raw);
      if (!id || (!payload.detectedTitle && !payload.doi && !payload.sourcePageUrl)) return null;
      return {
        id,
        createdAt: Number(raw.createdAt) > 0 ? Number(raw.createdAt) : Date.now(),
        payload
      };
    })
    .filter(Boolean)
    .slice(-40);
}

function savePersistedPendingCaptures(entries) {
  const normalized = Array.isArray(entries) ? entries.map(function (entry) {
    const raw = entry && typeof entry === 'object' ? entry : {};
    const id = safeId(raw.id) || '';
    const payload = sanitizeCapturePayload(raw.payload || raw);
    if (!id || (!payload.detectedTitle && !payload.doi && !payload.sourcePageUrl)) return null;
    return {
      id,
      createdAt: Number(raw.createdAt) > 0 ? Number(raw.createdAt) : Date.now(),
      payload
    };
  }).filter(Boolean).slice(-40) : [];
  storage.setBrowserCaptureSettings({ pendingPayloads: normalized });
  return normalized;
}

function hydratePendingCaptureRuntime() {
  browserCaptureRuntime.pendingPayloads = getPersistedPendingCaptures();
  return browserCaptureRuntime.pendingPayloads;
}

function scheduleBrowserCaptureFlush(delayMs) {
  if (browserCaptureRuntime.flushTimer) {
    clearTimeout(browserCaptureRuntime.flushTimer);
  }
  browserCaptureRuntime.flushTimer = setTimeout(function () {
    browserCaptureRuntime.flushTimer = null;
    flushPendingBrowserCaptures();
    if (getPersistedPendingCaptures().length || browserCaptureRuntime.pendingWorkspaceEvents.length) {
      scheduleBrowserCaptureFlush(1200);
    }
  }, Math.max(80, Number(delayMs) || 200));
}

function persistPendingCapture(payload) {
  const safePayload = sanitizeCapturePayload(payload);
  const entry = {
    id: safeId((payload && payload.queueId) || '') || ('cap_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
    createdAt: Date.now(),
    payload: safePayload
  };
  const existing = getPersistedPendingCaptures().filter(function (item) { return item && item.id !== entry.id; });
  const next = savePersistedPendingCaptures(existing.concat([entry]));
  browserCaptureRuntime.pendingPayloads = next;
  return entry;
}

function acknowledgePendingCapture(queueId) {
  const id = safeId(queueId);
  if (!id) return { ok: false, error: 'Geçersiz capture kimliği' };
  const next = savePersistedPendingCaptures(getPersistedPendingCaptures().filter(function (entry) {
    return entry && entry.id !== id;
  }));
  browserCaptureRuntime.pendingPayloads = next;
  delete browserCaptureRuntime.deliveredPayloadIds[id];
  return { ok: true };
}

function getCaptureTargets() {
  const targets = buildTargetsFromDataJSON(latestStateJSON || '');
  const settings = getBrowserCaptureSettings();
  targets.preferredWorkspaceId = settings.lastUsedWorkspaceId || '';
  targets.preferredComparisonId = settings.lastUsedComparisonId || '';
  return targets;
}

function browserCaptureStatus(extra) {
  return buildBrowserCaptureStatus(extra);
}

function buildCaptureQueueStats(items) {
  const stats = {
    queued: 0,
    waitingRetry: 0,
    failed: 0,
    imported: 0,
    duplicateAttached: 0
  };
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item) return;
    if (item.status === 'queued') {
      if (Number(item.nextRetryAt || 0) > Date.now()) stats.waitingRetry += 1;
      else stats.queued += 1;
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
    if (item.status === 'duplicate_attached') stats.duplicateAttached += 1;
  });
  return stats;
}

function buildCaptureQueueActivity(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && item.status)
    .slice()
    .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))
    .slice(0, 6)
    .map((item) => ({
      id: String(item.id || ''),
      type: item.type === 'workspace_create' ? 'workspace_create' : 'capture',
      status: String(item.status || 'queued'),
      title: item.type === 'workspace_create'
        ? String(item.name || 'Yeni Workspace')
        : String((item.payload && (item.payload.detectedTitle || item.payload.pageTitle)) || 'Yakalanan makale'),
      workspaceId: String(item.realWorkspaceId || item.clientWorkspaceId || (item.payload && item.payload.selectedWorkspaceId) || ''),
      updatedAt: Number(item.updatedAt || item.createdAt || 0),
      nextRetryAt: Number(item.nextRetryAt || 0),
      attemptCount: Number(item.attemptCount || 0),
      lastError: String(item.lastError || '')
    }));
}

function sanitizeDocHTMLForMain(html) {
  return String(html || '<p></p>');
}

function createMainUid(prefix) {
  return String(prefix || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function hydrateMainState(rawState) {
  const source = rawState && typeof rawState === 'object' ? rawState : {};
  if (AQStateSchema && typeof AQStateSchema.hydrate === 'function') {
    return AQStateSchema.hydrate(source, { sanitize: sanitizeDocHTMLForMain });
  }
  return source;
}

function serializeMainState(state) {
  if (AQStateSchema && typeof AQStateSchema.serialize === 'function') {
    return AQStateSchema.serialize(state, { sanitize: sanitizeDocHTMLForMain });
  }
  return state;
}

function saveMainState(state) {
  const persisted = serializeMainState(state);
  latestStateJSON = JSON.stringify(persisted);
  storage.saveData(latestStateJSON);
  try {
    if (storage.saveCaptureTargets) storage.saveCaptureTargets(getCaptureTargets());
  } catch (_e) {}
  return persisted;
}

function notifyBrowserCaptureStateChanged(detail) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send('browserCapture:stateChanged', detail && typeof detail === 'object' ? detail : {});
  } catch (_e) {}
}

async function processCaptureQueueFromApp(reason) {
  if (captureQueuePollRunning || IS_CAPTURE_AGENT_MODE) return { ok: false, skipped: true };
  captureQueuePollRunning = true;
  try {
    return await processCaptureQueue({
      storage,
      createWorkspace: createWorkspaceFromMain,
      importCapture: importBrowserCaptureIntoState,
      reason: reason || 'app-poll'
    });
  } finally {
    captureQueuePollRunning = false;
  }
}

function stopCaptureQueuePolling() {
  if (captureQueuePollTimer) {
    clearInterval(captureQueuePollTimer);
    captureQueuePollTimer = null;
  }
}

function startCaptureQueuePolling() {
  stopCaptureQueuePolling();
  if (IS_CAPTURE_AGENT_MODE) return;
  captureQueuePollTimer = setInterval(function () {
    processCaptureQueueFromApp('interval').catch(() => {});
  }, 2500);
}

function normalizeCaptureReferenceType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'book' || raw === 'website' || raw === 'article') return raw;
  return 'article';
}

function normalizeCaptureReference(ref) {
  const target = ref && typeof ref === 'object' ? ref : {};
  target.referenceType = normalizeCaptureReferenceType(target.referenceType);
  target.title = String(target.title || '').replace(/\s+/g, ' ').trim();
  target.year = String(target.year || '').trim();
  const yearMatch = target.year.match(/\b(19|20)\d{2}\b/);
  target.year = yearMatch ? yearMatch[0] : target.year;
  if (!target.year && target.publishedDate) {
    const publishedYear = String(target.publishedDate).match(/\b(19|20)\d{2}\b/);
    if (publishedYear && publishedYear[0]) target.year = publishedYear[0];
  }
  target.doi = normalizeDoi(target.doi || target.url || '');
  target.journal = String(target.journal || '').replace(/\s+/g, ' ').trim();
  target.publisher = String(target.publisher || '').replace(/\s+/g, ' ').trim();
  target.edition = String(target.edition || '').replace(/\s+/g, ' ').trim();
  target.websiteName = String(target.websiteName || '').replace(/\s+/g, ' ').trim();
  target.publishedDate = String(target.publishedDate || '').replace(/\s+/g, ' ').trim();
  target.accessedDate = String(target.accessedDate || '').replace(/\s+/g, ' ').trim();
  target.volume = String(target.volume || '').trim();
  target.issue = String(target.issue || '').trim();
  target.fp = String(target.fp || '').trim();
  target.lp = String(target.lp || '').trim();
  target.url = String(target.url || '').trim();
  target.pdfUrl = String(target.pdfUrl || '').trim();
  target.abstract = String(target.abstract || '').trim();
  target.note = String(target.note || '').trim();
  target.authors = Array.isArray(target.authors)
    ? target.authors.map(function (author) { return String(author || '').replace(/\s+/g, ' ').trim(); }).filter(Boolean)
    : [];
  target.labels = Array.isArray(target.labels)
    ? target.labels.map(function (label) { return String(label || '').trim(); }).filter(Boolean)
    : [];
  target.collectionIds = Array.isArray(target.collectionIds)
    ? target.collectionIds.map(function (id) { return String(id || '').trim(); }).filter(Boolean)
    : [];
  return target;
}

function mergeCaptureReferenceFields(target, source) {
  if (!target || !source || target === source) return target;
  normalizeCaptureReference(target);
  normalizeCaptureReference(source);
  [
    'referenceType', 'title', 'year', 'journal', 'volume', 'issue', 'fp', 'lp', 'doi', 'url', 'pdfUrl',
    'websiteName', 'publishedDate', 'accessedDate',
    'publisher', 'edition', 'booktitle', 'location', 'language', 'abstract', 'note'
  ].forEach(function (key) {
    if (source[key] && !target[key]) target[key] = source[key];
  });
  if (source.referenceType && source.referenceType !== 'article' && target.referenceType === 'article') {
    target.referenceType = source.referenceType;
  }
  if ((source.authors || []).length && !(target.authors || []).length) target.authors = source.authors.slice();
  if ((source.labels || []).length) {
    target.labels = Array.from(new Set([].concat(target.labels || [], source.labels || []).filter(Boolean)));
  }
  if (source.pdfData && !target.pdfData) target.pdfData = source.pdfData;
  if (source.pdfVerification && !target.pdfVerification) target.pdfVerification = source.pdfVerification;
  if (source.citationCount != null && target.citationCount == null) target.citationCount = source.citationCount;
  if (source.citationFetchDate && !target.citationFetchDate) target.citationFetchDate = source.citationFetchDate;
  normalizeCaptureReference(target);
  return target;
}

function buildBrowserCaptureReference(payload, targetWorkspaceId) {
  const safePayload = sanitizeCapturePayload(payload);
  const reference = AQWebRelatedPapers.buildWorkspaceReference({
    referenceType: safePayload.referenceType || 'article',
    title: safePayload.detectedTitle,
    authors: safePayload.detectedAuthors,
    year: safePayload.detectedYear,
    journal: safePayload.detectedJournal,
    publisher: safePayload.detectedPublisher,
    edition: safePayload.detectedEdition,
    websiteName: safePayload.detectedWebsiteName,
    publishedDate: safePayload.detectedPublishedDate,
    accessedDate: safePayload.detectedAccessedDate,
    doi: safePayload.doi,
    url: safePayload.sourcePageUrl,
    abstract: safePayload.detectedAbstract,
    pdfUrl: safePayload.pdfUrl,
    provider: 'browser-capture',
    providerLabel: safePayload.browserSource || 'Browser Capture',
    reasons: ['Tarayici yakalama']
  }, {
    workspaceId: targetWorkspaceId,
    createId: function () { return createMainUid('ref_'); }
  });
  reference.wsId = targetWorkspaceId;
  reference.browserCaptureMeta = {
    sourcePageUrl: safePayload.sourcePageUrl,
    browserSource: safePayload.browserSource,
    capturedAt: safePayload.timestamp,
    detectedPdfUrl: safePayload.pdfUrl,
    detectionMeta: safePayload.detectionMeta
  };
  return normalizeCaptureReference(reference);
}

function cloneReferenceForWorkspace(existingRef, candidateRef, targetWorkspaceId) {
  const clone = JSON.parse(JSON.stringify(existingRef || {}));
  clone.id = createMainUid('ref_');
  clone.wsId = targetWorkspaceId;
  clone.collectionIds = [];
  mergeCaptureReferenceFields(clone, candidateRef || {});
  return normalizeCaptureReference(clone);
}

function applyBrowserCaptureMetaToReference(targetRef, safePayload) {
  if (!targetRef) return;
  if (!targetRef.browserCaptureMeta || typeof targetRef.browserCaptureMeta !== 'object') {
    targetRef.browserCaptureMeta = {};
  }
  targetRef.browserCaptureMeta.sourcePageUrl = safePayload.sourcePageUrl || targetRef.browserCaptureMeta.sourcePageUrl || '';
  targetRef.browserCaptureMeta.browserSource = safePayload.browserSource || targetRef.browserCaptureMeta.browserSource || '';
  targetRef.browserCaptureMeta.capturedAt = safePayload.timestamp || targetRef.browserCaptureMeta.capturedAt || Date.now();
  targetRef.browserCaptureMeta.detectedPdfUrl = safePayload.pdfUrl || targetRef.browserCaptureMeta.detectedPdfUrl || '';
  targetRef.browserCaptureMeta.detectionMeta = safePayload.detectionMeta || targetRef.browserCaptureMeta.detectionMeta || {};
}

function attachPdfUrlFromCapture(targetRef, safePayload, prefs) {
  if (!targetRef || !safePayload.pdfUrl) {
    return { status: 'not_detected', detected: false, storedUrl: '' };
  }
  if (!targetRef.browserCaptureMeta || typeof targetRef.browserCaptureMeta !== 'object') {
    targetRef.browserCaptureMeta = {};
  }
  targetRef.browserCaptureMeta.detectedPdfUrl = safePayload.pdfUrl;
  if (prefs && prefs.autoAttachPdfUrl === false) {
    targetRef.browserCaptureMeta.pdfCaptureStatus = 'detected_only';
    return { status: 'detected_only', detected: true, storedUrl: safePayload.pdfUrl };
  }
  if (targetRef.pdfData || targetRef.pdfUrl) {
    targetRef.browserCaptureMeta.pdfCaptureStatus = 'already_present';
    return { status: 'already_present', detected: true, storedUrl: targetRef.pdfUrl || safePayload.pdfUrl };
  }
  targetRef.pdfUrl = safePayload.pdfUrl;
  targetRef.browserCaptureMeta.pdfCaptureStatus = 'url_stored';
  return { status: 'url_stored', detected: true, storedUrl: safePayload.pdfUrl };
}

async function maybeAutoDownloadCapturedPdf(targetRef, safePayload, pdfHandling, prefs) {
  if (!targetRef || !safePayload || !safePayload.pdfUrl) {
    return pdfHandling || { status: 'not_detected', detected: false, storedUrl: '' };
  }
  const current = pdfHandling && typeof pdfHandling === 'object' ? Object.assign({}, pdfHandling) : {};
  if ((prefs && prefs.autoAttachPdfUrl === false) || current.status !== 'url_stored') {
    return current;
  }
  if (targetRef.pdfData) {
    current.status = 'downloaded';
    return current;
  }
  const downloadResult = await downloadPDFfromURLMain(safePayload.pdfUrl, targetRef.id, {
    timeoutMs: 20000,
    expectedDoi: targetRef.doi || safePayload.doi || '',
    expectedTitle: targetRef.title || safePayload.detectedTitle || '',
    expectedAuthors: Array.isArray(targetRef.authors) && targetRef.authors.length
      ? targetRef.authors.slice(0, 4)
      : (Array.isArray(safePayload.detectedAuthors) ? safePayload.detectedAuthors.slice(0, 4) : []),
    expectedYear: targetRef.year || safePayload.detectedYear || '',
    requireDoiEvidence: false
  });
  if (downloadResult && downloadResult.ok) {
    if (downloadResult.finalUrl) targetRef.pdfUrl = String(downloadResult.finalUrl);
    if (downloadResult.verification) targetRef.pdfVerification = downloadResult.verification;
    if (!targetRef.browserCaptureMeta || typeof targetRef.browserCaptureMeta !== 'object') {
      targetRef.browserCaptureMeta = {};
    }
    targetRef.browserCaptureMeta.pdfCaptureStatus = 'downloaded';
    return Object.assign(current, {
      status: 'downloaded',
      downloaded: true,
      storedUrl: targetRef.pdfUrl || safePayload.pdfUrl,
      verification: downloadResult.verification || null
    });
  }
  if (!targetRef.browserCaptureMeta || typeof targetRef.browserCaptureMeta !== 'object') {
    targetRef.browserCaptureMeta = {};
  }
  targetRef.browserCaptureMeta.pdfCaptureStatus = 'download_failed';
  targetRef.browserCaptureMeta.pdfDownloadFailure = downloadResult && downloadResult.failure ? downloadResult.failure : null;
  return Object.assign(current, {
    status: 'download_failed',
    downloaded: false,
    failure: downloadResult && downloadResult.failure ? downloadResult.failure : null,
    error: downloadResult && downloadResult.error ? String(downloadResult.error) : 'PDF download failed',
    storedUrl: targetRef.pdfUrl || safePayload.pdfUrl
  });
}

function resolveCaptureTargetWorkspace(state, safePayload, prefs) {
  const workspaces = Array.isArray(state && state.wss) ? state.wss : [];
  const requestedWorkspaceId = safePayload.selectedWorkspaceId || '';
  const currentWorkspaceId = String((state && state.cur) || '');
  const preferredWorkspaceId = prefs && prefs.lastUsedWorkspaceId ? String(prefs.lastUsedWorkspaceId) : '';
  let targetWorkspace = null;
  let fallback = false;
  let reason = 'first';
  if (requestedWorkspaceId) {
    targetWorkspace = workspaces.find(function (ws) { return ws && String(ws.id || '') === requestedWorkspaceId; }) || null;
    if (targetWorkspace) {
      reason = 'selected';
    } else {
      fallback = true;
    }
  }
  if (!targetWorkspace && currentWorkspaceId) {
    targetWorkspace = workspaces.find(function (ws) { return ws && String(ws.id || '') === currentWorkspaceId; }) || null;
    if (targetWorkspace) reason = requestedWorkspaceId ? 'selected_missing_to_active' : 'active';
  }
  if (!targetWorkspace && preferredWorkspaceId) {
    targetWorkspace = workspaces.find(function (ws) { return ws && String(ws.id || '') === preferredWorkspaceId; }) || null;
    if (targetWorkspace) reason = requestedWorkspaceId ? 'selected_missing_to_preferred' : 'preferred';
  }
  if (!targetWorkspace && workspaces.length) {
    targetWorkspace = workspaces[0];
    reason = requestedWorkspaceId ? 'selected_missing_to_first' : 'first';
  }
  return {
    workspace: targetWorkspace,
    workspaceId: targetWorkspace && targetWorkspace.id ? String(targetWorkspace.id) : '',
    fallback: fallback,
    reason: reason
  };
}

function findEquivalentReferenceAcrossState(state, candidateRef, excludeWorkspaceId) {
  const workspaces = Array.isArray(state && state.wss) ? state.wss : [];
  for (let index = 0; index < workspaces.length; index += 1) {
    const workspace = workspaces[index];
    if (!workspace || String(workspace.id || '') === String(excludeWorkspaceId || '')) continue;
    const match = AQWebRelatedPapers.findMatchInList(candidateRef, workspace.lib || []);
    if (match) {
      return { workspaceId: String(workspace.id || ''), workspace: workspace, ref: match };
    }
  }
  return null;
}

function attachCaptureToComparison(state, workspaceId, reference, comparisonId) {
  if (String(comparisonId || '') !== 'literature-matrix') {
    return { requested: !!comparisonId, applied: false, comparisonId: '' };
  }
  if (!(AQLiteratureMatrixState && typeof AQLiteratureMatrixState.ensureRowForReference === 'function')) {
    return { requested: true, applied: false, comparisonId: 'literature-matrix' };
  }
  try {
    const result = AQLiteratureMatrixState.ensureRowForReference(state, workspaceId, reference, {
      uid: function () { return createMainUid('mxr-'); }
    });
    return {
      requested: true,
      applied: !!(result && result.row),
      created: !!(result && result.created),
      comparisonId: 'literature-matrix'
    };
  } catch (_e) {
    return { requested: true, applied: false, comparisonId: 'literature-matrix' };
  }
}

function buildBrowserCaptureImportMessage(result) {
  if (!result || !result.ok) return result && result.error ? result.error : 'Browser Capture iceri aktarilamadi.';
  const parts = [];
  const workspaceName = result.workspace && result.workspace.name ? result.workspace.name : 'workspace';
  if (result.mode === 'already_in_workspace') {
    parts.push('Kaynak zaten "' + workspaceName + '" icindeydi.');
  } else if (result.mode === 'attached_existing_library') {
    parts.push('Kaynak kutuphanede vardi; "' + workspaceName + '" icine baglandi.');
  } else {
    parts.push('Yeni kaynak "' + workspaceName + '" icine eklendi.');
  }
  if (result.comparison && result.comparison.applied) {
    parts.push(result.comparison.created ? 'Literatur Matrisi satiri olusturuldu.' : 'Literatur Matrisi guncellendi.');
  } else if (result.comparison && result.comparison.requested) {
    parts.push('Karsilastirma hedefi istendi ama uygulanamadi.');
  }
  if (result.pdfHandling) {
    if (result.pdfHandling.status === 'downloaded') {
      parts.push('PDF otomatik indirildi.');
    } else if (result.pdfHandling.status === 'url_stored') {
      parts.push('PDF baglantisi URL olarak kaydedildi.');
    } else if (result.pdfHandling.status === 'detected_only') {
      parts.push('PDF baglantisi tespit olarak saklandi.');
    } else if (result.pdfHandling.status === 'already_present') {
      parts.push('Mevcut PDF bilgisi korundu.');
    } else if (result.pdfHandling.status === 'download_failed') {
      const failureMessage = result.pdfHandling.failure && result.pdfHandling.failure.userMessage
        ? result.pdfHandling.failure.userMessage
        : 'PDF otomatik indirilemedi; baglanti korundu.';
      parts.push(failureMessage);
    }
  }
  if (result.target && result.target.fallback) {
    parts.push('Secilen workspace bulunamadigi icin guvenli hedef kullanildi.');
  }
  return parts.join(' ');
}

async function importBrowserCaptureIntoState(payload) {
  const safePayload = sanitizeCapturePayload(payload);
  const prefs = getBrowserCaptureSettings();
  const state = hydrateMainState(parseDataState());
  const target = resolveCaptureTargetWorkspace(state, safePayload, prefs);
  const targetWorkspace = target.workspace;
  if (!targetWorkspace) {
    return { ok: false, error: 'Hedef workspace bulunamadi' };
  }
  targetWorkspace.lib = Array.isArray(targetWorkspace.lib) ? targetWorkspace.lib : [];
  const candidateRef = buildBrowserCaptureReference(safePayload, target.workspaceId);
  const decision = AQWebRelatedPapers.decideAddToActiveWorkspace(state.wss || [], target.workspaceId, candidateRef);
  let resultRef = null;
  let mode = 'added_new';
  if (decision && decision.action === 'already_in_workspace' && decision.existingRef) {
    resultRef = decision.existingRef;
    mergeCaptureReferenceFields(resultRef, candidateRef);
    mode = 'already_in_workspace';
  } else if (decision && decision.action === 'attach_existing' && decision.existingRef) {
    resultRef = cloneReferenceForWorkspace(decision.existingRef, candidateRef, target.workspaceId);
    targetWorkspace.lib.push(resultRef);
    mode = 'attached_existing_library';
  } else {
    const existingAnywhere = findEquivalentReferenceAcrossState(state, candidateRef, target.workspaceId);
    if (existingAnywhere && existingAnywhere.ref) {
      resultRef = cloneReferenceForWorkspace(existingAnywhere.ref, candidateRef, target.workspaceId);
      targetWorkspace.lib.push(resultRef);
      mode = 'attached_existing_library';
    } else {
      resultRef = candidateRef;
      targetWorkspace.lib.push(resultRef);
      mode = 'added_new';
    }
  }
  normalizeCaptureReference(resultRef);
  applyBrowserCaptureMetaToReference(resultRef, safePayload);
  let pdfHandling = attachPdfUrlFromCapture(resultRef, safePayload, prefs || {});
  pdfHandling = await maybeAutoDownloadCapturedPdf(resultRef, safePayload, pdfHandling, prefs || {});
  const comparison = attachCaptureToComparison(state, target.workspaceId, resultRef, safePayload.selectedComparisonId);
  state.cur = state.cur || target.workspaceId;
  saveMainState(state);
  storage.setBrowserCaptureSettings({
    lastUsedWorkspaceId: target.workspaceId,
    lastUsedComparisonId: safePayload.selectedComparisonId || ''
  });
  notifyBrowserCaptureStateChanged({
    reason: 'capture-imported',
    workspaceId: target.workspaceId,
    refId: resultRef && resultRef.id ? String(resultRef.id) : '',
    focusWorkspace: !!prefs.focusImportedWorkspace
  });
  return {
    ok: true,
    mode: mode,
    ref: resultRef,
    workspace: { id: targetWorkspace.id, name: targetWorkspace.name },
    target: target,
    comparison: comparison,
    pdfHandling: pdfHandling,
    message: ''
  };
}

async function processPersistedBrowserCaptureQueue(options) {
  const source = options && typeof options === 'object' ? options : {};
  const onlyId = source.onlyId ? safeId(source.onlyId) : '';
  const queue = getPersistedPendingCaptures();
  const results = [];
  for (const entry of queue) {
    if (!entry || !entry.id || !entry.payload) continue;
    if (onlyId && entry.id !== onlyId) continue;
    const outcome = await importBrowserCaptureIntoState(Object.assign({}, entry.payload, { queueId: entry.id }));
    if (outcome && outcome.ok) {
      acknowledgePendingCapture(entry.id);
      results.push(Object.assign({ queueId: entry.id }, outcome));
    }
  }
  return results;
}

function buildCaptureLookup(payload) {
  const safePayload = sanitizeCapturePayload(payload);
  const targets = getCaptureTargets();
  const requestedWorkspaceId = safePayload.selectedWorkspaceId || '';
  const workspaceId = requestedWorkspaceId || targets.preferredWorkspaceId || targets.activeWorkspaceId || '';
  const workspaces = Array.isArray(targets.workspaces) ? targets.workspaces.map(function (entry) {
    const wsData = (() => {
      try {
        const parsed = JSON.parse(String(latestStateJSON || '{}'));
        return Array.isArray(parsed.wss) ? parsed.wss.find(function (ws) { return ws && String(ws.id || '') === String(entry.id || ''); }) || null : null;
      } catch (_e) {
        return null;
      }
    })();
    return wsData || { id: entry.id, name: entry.name, lib: [] };
  }) : [];
  const selectedWorkspace = workspaces.find(function (ws) { return ws && String(ws.id || '') === String(workspaceId || ''); }) || null;
  const targetWorkspace = selectedWorkspace || workspaces[0] || null;
  if (!targetWorkspace) {
    return { ok: false, error: 'Workspace bulunamadı' };
  }
  const candidate = AQWebRelatedPapers.buildWorkspaceReference({
    title: safePayload.detectedTitle,
    authors: safePayload.detectedAuthors,
    year: safePayload.detectedYear,
    journal: safePayload.detectedJournal,
    doi: safePayload.doi,
    url: safePayload.sourcePageUrl,
    abstract: safePayload.detectedAbstract,
    pdfUrl: safePayload.pdfUrl,
    provider: 'browser-capture',
    providerLabel: safePayload.browserSource || 'Browser Capture'
  }, {
    workspaceId: targetWorkspace.id,
    createId: function () { return 'preview_ref'; }
  });
  const decision = AQWebRelatedPapers.decideAddToActiveWorkspace(workspaces, targetWorkspace.id, candidate);
  let existingAnywhere = null;
  for (let wi = 0; wi < workspaces.length; wi += 1) {
    const match = AQWebRelatedPapers.findMatchInList(candidate, (workspaces[wi] && workspaces[wi].lib) || []);
    if (match) {
      existingAnywhere = { wsId: workspaces[wi].id, ref: match };
      break;
    }
  }
  let matrixState = {};
  try { matrixState = JSON.parse(String(latestStateJSON || '{}')).literatureMatrix || {}; } catch (_e) {}
  let matrixHasRow = false;
  if (safePayload.selectedComparisonId === 'literature-matrix' && AQLiteratureMatrixState && typeof AQLiteratureMatrixState.findRowByReference === 'function') {
    const matrixRefId = decision && decision.existingRef ? decision.existingRef.id : (existingAnywhere && existingAnywhere.wsId === targetWorkspace.id && existingAnywhere.ref ? existingAnywhere.ref.id : '');
    if (matrixRefId) {
      try { matrixHasRow = !!AQLiteratureMatrixState.findRowByReference({ literatureMatrix: matrixState }, targetWorkspace.id, matrixRefId); } catch (_e) {}
    }
  }
  const requestedComparisonId = safePayload.selectedComparisonId || '';
  const comparisonRequested = requestedComparisonId === 'literature-matrix';
  const workspaceFallback = !!(requestedWorkspaceId && (!selectedWorkspace || String(selectedWorkspace.id || '') !== String(requestedWorkspaceId)));
  let message = 'Bu kaynak yeni referans olarak eklenecek.';
  if (decision && decision.action === 'already_in_workspace') {
    message = matrixHasRow ? 'Kaynak zaten bu workspace ve matriste mevcut.' : 'Kaynak zaten bu workspace icinde mevcut.';
  } else if (decision && decision.action === 'attach_existing') {
    message = 'Kaynak kutuphanede var; secilen workspace icine baglanacak.';
  } else if (existingAnywhere) {
    message = 'Kaynak baska bir workspace icinde bulundu; klonlanarak eklenecek.';
  }
  if (comparisonRequested && !matrixHasRow) {
    message += ' Literatur Matrisi satiri da olusturulabilir.';
  }
  if (workspaceFallback) {
    message += ' Secilen workspace bulunamadigi icin guvenli hedef kullanilacak.';
  }
  if (safePayload.pdfUrl) {
    message += ' PDF baglantisi tespit edildi; import sonrasi ayrıca dogrulanir.';
  } else {
    message += ' PDF baglantisi tespit edilemedi.';
  }
  return {
    ok: true,
    targetWorkspaceId: targetWorkspace.id,
    targetWorkspaceName: targetWorkspace.name || 'Çalışma Alanı',
    existsInLibrary: !!existingAnywhere,
    existsInWorkspace: !!(decision && decision.action === 'already_in_workspace'),
    existsInComparison: !!matrixHasRow,
    workspaceFallback,
    comparisonRequested,
    action: decision && decision.action ? decision.action : 'create_new',
    message
  };
}

function flushPendingBrowserCaptures() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  hydratePendingCaptureRuntime().forEach(function (entry) {
    if (!entry || !entry.id || !entry.payload) return;
    const deliveredAt = Number(browserCaptureRuntime.deliveredPayloadIds[entry.id] || 0);
    if (deliveredAt && (Date.now() - deliveredAt) < 1500) return;
    try {
      browserCaptureRuntime.deliveredPayloadIds[entry.id] = Date.now();
      mainWindow.webContents.send('browserCapture:incoming', Object.assign({}, entry.payload, {
        queueId: entry.id
      }));
    } catch (_e) {}
  });
  browserCaptureRuntime.pendingWorkspaceEvents = browserCaptureRuntime.pendingWorkspaceEvents.filter(function (entry) {
    if (!entry || !entry.workspace || !entry.workspace.id) return false;
    entry.attempts = Number(entry.attempts || 0);
    const deliveredAt = Number(browserCaptureRuntime.deliveredWorkspaceIds[entry.workspace.id] || 0);
    if (deliveredAt && (Date.now() - deliveredAt) < 1200) return entry.attempts < 4;
    try {
      browserCaptureRuntime.deliveredWorkspaceIds[entry.workspace.id] = Date.now();
      entry.attempts += 1;
      mainWindow.webContents.send('browserCapture:workspaceCreated', entry);
      return entry.attempts < 4;
    } catch (_e) {
      entry.attempts += 1;
      return entry.attempts < 4;
    }
  });
}

function queueBrowserCapturePayload(payload) {
  const safePayload = sanitizeCapturePayload(payload);
  if (!safePayload.detectedTitle && !safePayload.doi && !safePayload.sourcePageUrl) {
    return { ok: false, error: 'Capture verisi yetersiz' };
  }
  const queued = persistPendingCapture(safePayload);
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } catch (_e) {}
  }
  scheduleBrowserCaptureFlush(50);
  return {
    ok: true,
    queued: true,
    queueId: queued.id,
    message: browserCaptureRuntime.ready
      ? 'Capture AcademiQ kuyruğuna alındı ve işleniyor.'
      : 'Capture AcademiQ kuyruğuna alındı. Uygulama hazır olduğunda senkronize edilecek.'
  };
}

function parseDataState() {
  if (latestStateJSON) {
    try { return JSON.parse(String(latestStateJSON || '{}')); } catch (_e) {}
  }
  try {
    const loaded = storage.loadData();
    if (loaded && loaded.ok && loaded.data) {
      latestStateJSON = String(loaded.data || '');
      return JSON.parse(latestStateJSON);
    }
  } catch (_e) {}
  return {};
}

function createWorkspaceFromMain(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return { ok: false, error: 'Workspace adı gerekli' };
  const state = hydrateMainState(parseDataState());
  state.wss = Array.isArray(state.wss) ? state.wss : [];
  const existing = state.wss.find(function (ws) {
    return ws && String(ws.name || '').trim().toLowerCase() === trimmed.toLowerCase();
  });
  if (existing) {
    return {
      ok: true,
      created: false,
      workspace: { id: existing.id, name: existing.name },
      targets: getCaptureTargets(),
      message: 'Workspace zaten mevcut.'
    };
  }
  const uidFactory = function () { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2); };
  const created = AQDocTabsState && typeof AQDocTabsState.addWorkspaceWithDocState === 'function'
    ? AQDocTabsState.addWorkspaceWithDocState(state, { id: uidFactory(), name: trimmed, lib: [] }, {
        uid: uidFactory,
        sanitize: function (html) { return String(html || '<p></p>'); }
      })
    : null;
  if (!created || !created.workspace) {
    return { ok: false, error: 'Workspace oluşturulamadı' };
  }
  saveMainState(state);
  const patch = { lastUsedWorkspaceId: created.workspace.id };
  storage.setBrowserCaptureSettings(patch);
  notifyBrowserCaptureStateChanged({
    reason: 'workspace-created',
    workspaceId: created.workspace.id,
    focusWorkspace: true
  });
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      browserCaptureRuntime.pendingWorkspaceEvents.push({
        workspace: created.workspace,
        doc: created.doc || null
      });
      scheduleBrowserCaptureFlush(50);
    } catch (_e) {}
  }
  return {
    ok: true,
    created: true,
    workspace: { id: created.workspace.id, name: created.workspace.name },
    targets: getCaptureTargets(),
    message: 'Yeni workspace oluşturuldu.'
  };
}

function extractProtocolUrlFromArgs(argv) {
  const items = Array.isArray(argv) ? argv : [];
  for (let index = 0; index < items.length; index += 1) {
    const value = String(items[index] || '').trim();
    if (/^academiq:\/\//i.test(value)) return value;
  }
  return '';
}

function handleProtocolUrl(rawUrl) {
  const parsed = parseCaptureProtocolUrl(rawUrl);
  if (!parsed) return false;
  if (parsed.action === 'capture' && parsed.payload) {
    queueBrowserCapturePayload(parsed.payload);
    return true;
  }
  if (parsed.action === 'open' && mainWindow && !mainWindow.isDestroyed()) {
    try {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } catch (_e) {}
    return true;
  }
  return false;
}

function buildAcademiqProtocolCommand() {
  if (process.defaultApp) {
    return '"' + process.execPath + '" "' + path.resolve(app.getAppPath()) + '" "%1"';
  }
  return '"' + process.execPath + '" "%1"';
}

async function ensureAcademiqProtocolRegistration() {
  if (process.platform !== 'win32') return { ok: false, skipped: true };
  const commandValue = buildAcademiqProtocolCommand();
  const keys = [
    { key: 'HKCU\\Software\\Classes\\academiq', valueFlag: '/ve', data: 'URL:AcademiQ Protocol' },
    { key: 'HKCU\\Software\\Classes\\academiq', valueFlag: '/v', valueName: 'URL Protocol', data: '', forceType: 'REG_SZ' },
    { key: 'HKCU\\Software\\Classes\\academiq\\DefaultIcon', valueFlag: '/ve', data: process.execPath + ',0' },
    { key: 'HKCU\\Software\\Classes\\academiq\\shell\\open\\command', valueFlag: '/ve', data: commandValue }
  ];
  for (let index = 0; index < keys.length; index += 1) {
    const entry = keys[index];
    await new Promise(function (resolve, reject) {
      const args = ['add', entry.key, entry.valueFlag];
      if (entry.valueName) args.push(entry.valueName);
      if (entry.forceType) args.push('/t', entry.forceType);
      if (entry.data !== undefined) args.push('/d', entry.data);
      args.push('/f');
      execFile('reg', args, { windowsHide: true }, function (error) {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
  return { ok: true, command: commandValue };
}

async function detectDefaultBrowser() {
  if (process.platform !== 'win32') {
    return { browser: { family: 'unknown', label: 'Bilinmiyor', isChromium: false, isFirefox: false }, progId: '' };
  }
  return new Promise(function (resolve) {
    execFile('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice', '/v', 'ProgId'], { windowsHide: true }, function (error, stdout) {
      if (error) {
        resolve({ browser: { family: 'unknown', label: 'Bilinmiyor', isChromium: false, isFirefox: false }, progId: '' });
        return;
      }
      resolve(parseWindowsDefaultBrowserRegOutput(stdout || ''));
    });
  });
}

async function detectBrowserOpenCommand(progId) {
  const safeProgId = String(progId || '').trim();
  if (!safeProgId || process.platform !== 'win32') return '';
  const keys = [
    'HKCU\\Software\\Classes\\' + safeProgId + '\\shell\\open\\command',
    'HKCR\\' + safeProgId + '\\shell\\open\\command'
  ];
  for (let index = 0; index < keys.length; index += 1) {
    const command = await new Promise(function (resolve) {
      execFile('reg', ['query', keys[index], '/ve'], { windowsHide: true }, function (error, stdout) {
        if (error) {
          resolve('');
          return;
        }
        resolve(parseBrowserOpenCommandOutput(stdout || ''));
      });
    });
    if (command) return command;
  }
  return '';
}

function buildBrowserCaptureStatus(extra) {
  const settings = getBrowserCaptureSettings();
  const agentState = storage.loadCaptureAgentState ? storage.loadCaptureAgentState() : {};
  const queueState = storage.loadCaptureQueue ? storage.loadCaptureQueue() : { items: [] };
  const queueItems = Array.isArray(queueState.items) ? queueState.items : [];
  const queueStats = buildCaptureQueueStats(queueItems);
  const queuedItems = queueItems.filter((item) => item && item.status === 'queued');
  const recentQueueItems = buildCaptureQueueActivity(queueItems);
  const bundledInfo = readExtensionManifestInfo(BROWSER_CAPTURE_SOURCE_DIR, settings.browserFamily);
  const runtimeInfo = browserCaptureRuntime.lastHelloPayload && typeof browserCaptureRuntime.lastHelloPayload === 'object'
    ? browserCaptureRuntime.lastHelloPayload
    : {};
  const status = Object.assign({
    enabled: !!settings.enabled,
    agentAutoStart: settings.agentAutoStart !== false,
    agentAutoStartSupported: !!settings.agentAutoStartSupported,
    port: settings.port || DEFAULT_CAPTURE_PORT,
    tokenReady: !!settings.token,
    browserFamily: settings.browserFamily || 'unknown',
    defaultBrowserLabel: settings.defaultBrowserLabel || 'Bilinmiyor',
    defaultBrowserProgId: settings.defaultBrowserProgId || '',
    browserExecutablePath: settings.browserExecutablePath || '',
    browserOpenCommand: settings.browserOpenCommand || '',
    installDir: settings.installDir || '',
    guidePath: settings.guidePath || '',
    managedProfileDir: settings.managedProfileDir || '',
    lastPreparedAt: settings.lastPreparedAt || 0,
    lastConnectedAt: settings.lastConnectedAt || 0,
    lastVerificationAt: settings.lastVerificationAt || 0,
    autoAttachPdfUrl: settings.autoAttachPdfUrl !== false,
    focusImportedWorkspace: !!settings.focusImportedWorkspace,
    bridgeConnected: !!agentState.running,
    bridgeReady: !!agentState.running,
    browserCaptureProtocolVersion: BROWSER_CAPTURE_PROTOCOL_VERSION,
    bundledExtensionVersion: bundledInfo.version,
    installedExtensionVersion: settings.installedExtensionVersion || agentState.extensionVersion || (runtimeInfo.extensionVersion || ''),
    installedProtocolVersion: settings.installedProtocolVersion || Number(agentState.protocolVersion || runtimeInfo.protocolVersion || 0),
    lastHelloAt: Number(agentState.lastHelloAt || browserCaptureRuntime.lastHelloAt || 0),
    lastError: settings.lastError || '',
    updatePending: !!settings.updatePending,
    lastLifecycleAction: settings.lastLifecycleAction || '',
    extensionManagerUrl: getBrowserExtensionManagerUrl(settings),
    agentRunning: !!agentState.running,
    agentPid: Number(agentState.pid || 0),
    agentPort: Number(agentState.port || settings.port || DEFAULT_CAPTURE_PORT),
    agentVersion: String(agentState.agentVersion || APP_VERSION),
    queueLength: queuedItems.length,
    queueStats,
    recentQueueItems,
    lastCaptureReceivedAt: Number(agentState.lastCaptureReceivedAt || 0)
  }, extra || {});
  status.installStrategy = determineBrowserInstallStrategy(status);
  const lifecycle = evaluateBrowserCaptureLifecycle({
    browserFamily: status.browserFamily,
    installDir: status.installDir,
    lastConnectedAt: status.lastConnectedAt,
    bridgeConnected: status.bridgeConnected,
    bundledExtensionVersion: status.bundledExtensionVersion,
    installedExtensionVersion: status.installedExtensionVersion,
    bridgeProtocolVersion: status.browserCaptureProtocolVersion,
    installedProtocolVersion: status.installedProtocolVersion
  });
  return Object.assign(status, lifecycle, {
    setupState: deriveSetupState(status)
  });
}

async function refreshBrowserCaptureSettings() {
  const detected = await detectDefaultBrowser();
  const browserOpenCommand = await detectBrowserOpenCommand(detected && detected.progId ? detected.progId : '');
  const browserExecutablePath = extractExecutableFromCommand(browserOpenCommand);
  const next = getBrowserCaptureSettings();
  const loginItemState = getCaptureAgentLoginItemState();
  const bundledInfo = readExtensionManifestInfo(BROWSER_CAPTURE_SOURCE_DIR, detected && detected.browser ? detected.browser.family : 'chromium');
  const patch = {
    defaultBrowserLabel: detected && detected.browser ? detected.browser.label : 'Bilinmiyor',
    defaultBrowserProgId: detected && detected.progId ? detected.progId : '',
    browserFamily: detected && detected.browser ? detected.browser.family : 'unknown',
    browserOpenCommand,
    browserExecutablePath,
    agentAutoStartSupported: !!loginItemState.supported,
    agentAutoStart: loginItemState.supported ? !!loginItemState.enabled : (next.agentAutoStart !== false),
    bundledExtensionVersion: bundledInfo.version,
    bridgeProtocolVersion: BROWSER_CAPTURE_PROTOCOL_VERSION
  };
  if (storage.setBrowserCaptureSettings) storage.setBrowserCaptureSettings(patch);
  return Object.assign({}, next, patch);
}

function ensureManagedBrowserCaptureDirs() {
  try { fs.mkdirSync(BROWSER_CAPTURE_MANAGED_PROFILE_DIR, { recursive: true }); } catch (_e) {}
}

function buildBrowserCaptureStartUrl(settings) {
  const token = encodeURIComponent(String(settings && settings.token ? settings.token : ''));
  const port = Number(settings && settings.port ? settings.port : DEFAULT_CAPTURE_PORT) || DEFAULT_CAPTURE_PORT;
  return 'http://127.0.0.1:' + port + '/status?token=' + token;
}

function buildCaptureAgentSpawnArgs() {
  const args = [];
  if (process.defaultApp) {
    args.push(path.resolve(app.getAppPath()));
  }
  args.push(CAPTURE_AGENT_ARG);
  return args;
}

function buildCaptureAgentAutoStartArgs() {
  return buildCaptureAgentSpawnArgs().concat([CAPTURE_AGENT_AUTOSTART_ARG]);
}

function getCaptureAgentLoginItemState() {
  if (process.platform !== 'win32' || !app.isPackaged || typeof app.getLoginItemSettings !== 'function') {
    return { supported: false, enabled: false };
  }
  try {
    const info = app.getLoginItemSettings({
      path: process.execPath,
      args: buildCaptureAgentAutoStartArgs()
    });
    return {
      supported: true,
      enabled: !!(info && info.openAtLogin)
    };
  } catch (_e) {
    return { supported: false, enabled: false };
  }
}

function syncCaptureAgentLoginItem(enabled) {
  const current = getCaptureAgentLoginItemState();
  if (!current.supported || typeof app.setLoginItemSettings !== 'function') {
    return current;
  }
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      path: process.execPath,
      args: buildCaptureAgentAutoStartArgs()
    });
  } catch (_e) {}
  return getCaptureAgentLoginItemState();
}

async function startDetachedCaptureAgentProcess() {
  const args = buildCaptureAgentSpawnArgs();
  if (process.platform === 'win32') {
    const psArgs = [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-Command',
      'Start-Process -FilePath ' + psQuote(process.execPath)
        + ' -ArgumentList @(' + args.map(psQuote).join(',') + ')'
        + ' -WindowStyle Hidden'
    ];
    await new Promise(function (resolve, reject) {
      execFile('powershell.exe', psArgs, { windowsHide: true }, function (error) {
        if (error) reject(error);
        else resolve();
      });
    });
    return;
  }
  await new Promise(function (resolve, reject) {
    try {
      const child = execFile(process.execPath, args, {
        detached: true,
        windowsHide: true
      }, function (error) {
        if (error) reject(error);
      });
      if (child && typeof child.unref === 'function') child.unref();
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

async function pingCaptureAgentStatus() {
  const settings = getBrowserCaptureSettings();
  const port = Number(settings.port || DEFAULT_CAPTURE_PORT) || DEFAULT_CAPTURE_PORT;
  const token = encodeURIComponent(String(settings.token || ''));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch('http://127.0.0.1:' + port + '/status?token=' + token, {
      method: 'GET',
      signal: controller.signal
    });
    if (!response.ok) throw new Error('agent-status-' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function waitForMs(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });
}

async function refreshCaptureAgentStatusSnapshot() {
  try {
    const live = await pingCaptureAgentStatus();
    if (storage.saveCaptureAgentState) {
      const current = storage.loadCaptureAgentState ? storage.loadCaptureAgentState() : {};
      storage.saveCaptureAgentState(Object.assign({}, current, {
        running: true,
        pid: Number(live.agentPid || live.pid || current.pid || 0),
        port: Number(live.agentPort || live.port || getBrowserCaptureSettings().port || DEFAULT_CAPTURE_PORT),
        agentVersion: String(live.agentVersion || current.agentVersion || APP_VERSION),
        extensionVersion: String(live.extensionVersion || current.extensionVersion || ''),
        protocolVersion: Number(live.protocolVersion || current.protocolVersion || BROWSER_CAPTURE_PROTOCOL_VERSION),
        lastHelloAt: Number(live.lastHelloAt || current.lastHelloAt || 0),
        lastCaptureReceivedAt: Number(live.lastCaptureReceivedAt || current.lastCaptureReceivedAt || 0),
        lastError: ''
      }));
    }
    return live;
  } catch (error) {
    if (storage.saveCaptureAgentState) {
      const current = storage.loadCaptureAgentState ? storage.loadCaptureAgentState() : {};
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

async function ensureCaptureAgentRunning() {
  const live = await refreshCaptureAgentStatusSnapshot();
  if (live && live.ok) {
    const liveVersion = String(live.agentVersion || '');
    const liveProtocolVersion = Number(live.protocolVersion || 0);
    if (liveVersion === APP_VERSION && (!liveProtocolVersion || liveProtocolVersion === BROWSER_CAPTURE_PROTOCOL_VERSION)) {
      return live;
    }
    try { await stopCaptureAgent(); } catch (_e) {}
  }
  if (captureAgentStartPromise) return captureAgentStartPromise;
  captureAgentStartPromise = new Promise(function (resolve, reject) {
    try {
      const tryStart = function (attemptIndex) {
        startDetachedCaptureAgentProcess().then(function () {
          setTimeout(async function () {
            try {
              const status = await refreshCaptureAgentStatusSnapshot();
              if (status && status.ok) {
                resolve(status);
                return;
              }
              if (attemptIndex + 1 < CAPTURE_AGENT_START_RETRIES) {
                await waitForMs(350);
                tryStart(attemptIndex + 1);
                return;
              }
              reject(new Error('Capture agent baslatildi ancak ulasilamiyor'));
            } catch (error) {
              if (attemptIndex + 1 < CAPTURE_AGENT_START_RETRIES) {
                await waitForMs(350);
                tryStart(attemptIndex + 1);
                return;
              }
              reject(error);
            }
          }, CAPTURE_AGENT_START_DELAY_MS);
        }).catch(function (error) {
          try {
            if (attemptIndex + 1 < CAPTURE_AGENT_START_RETRIES) {
              tryStart(attemptIndex + 1);
              return;
            }
            reject(error);
          } catch (nestedError) {
            reject(nestedError);
          }
        });
      };
      tryStart(0);
    } catch (error) {
      reject(error);
    }
  }).finally(function () {
    captureAgentStartPromise = null;
  });
  return captureAgentStartPromise;
}

async function stopCaptureAgent() {
  const settings = getBrowserCaptureSettings();
  const port = Number(settings.port || DEFAULT_CAPTURE_PORT) || DEFAULT_CAPTURE_PORT;
  const token = encodeURIComponent(String(settings.token || ''));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch('http://127.0.0.1:' + port + '/agent/stop?token=' + token, {
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

async function prepareBrowserCaptureSetup() {
  const settings = await refreshBrowserCaptureSettings();
  ensureManagedBrowserCaptureDirs();
  const prepared = prepareExtensionBundle({
    sourceRoot: BROWSER_CAPTURE_SOURCE_DIR,
    appDir: APP_DIR,
    browserFamily: settings.browserFamily === 'firefox' ? 'firefox' : 'chromium',
    browserLabel: settings.defaultBrowserLabel,
    config: {
      token: settings.token,
      port: settings.port || DEFAULT_CAPTURE_PORT
    }
  });
  const installStrategy = determineBrowserInstallStrategy(Object.assign({}, settings, { installDir: prepared.installDir }));
  const managedGuidePath = path.join(prepared.installDir, 'MANAGED_SETUP.txt');
  fs.writeFileSync(managedGuidePath, buildManagedSessionGuide(settings.defaultBrowserLabel, prepared.installDir), 'utf8');
  const patch = {
    installDir: prepared.installDir,
    guidePath: installStrategy.supported ? managedGuidePath : prepared.guidePath,
    managedProfileDir: installStrategy.supported ? path.join(BROWSER_CAPTURE_MANAGED_PROFILE_DIR, settings.browserFamily === 'firefox' ? 'firefox' : 'chromium') : '',
    agentAutoStart: settings.agentAutoStart !== false,
    agentAutoStartSupported: !!settings.agentAutoStartSupported,
    lastPreparedAt: Date.now(),
    setupPromptSeen: true,
    lifecycleState: installStrategy.supported ? 'installing' : 'unsupported_browser',
    compatibilityState: installStrategy.supported ? 'preparing' : 'unsupported_browser',
    lastLifecycleAction: 'prepare',
    lastError: installStrategy.supported ? '' : 'Bu tarayici icin tam uygulama-yonetimli kurulum desteklenmiyor.'
  };
  if (storage.setBrowserCaptureSettings) storage.setBrowserCaptureSettings(patch);
  return Object.assign(buildBrowserCaptureStatus(patch), {
    ok: true,
    installDir: prepared.installDir,
    guidePath: patch.guidePath,
    managedProfileDir: patch.managedProfileDir,
    deepLinkExample: buildCaptureDeepLink({
      detectedTitle: 'Örnek Makale',
      selectedWorkspaceId: getCaptureTargets().activeWorkspaceId || '',
      browserSource: settings.defaultBrowserLabel || ''
    }),
    installStrategy
  });
}

async function launchManagedBrowserCaptureSession(reason) {
  const prepared = await prepareBrowserCaptureSetup();
  const status = buildBrowserCaptureStatus(prepared);
  const strategy = status.installStrategy || determineBrowserInstallStrategy(status);
  if (!strategy.supported || strategy.id !== 'managed_chromium_session') {
    const patch = {
      lifecycleState: 'unsupported_browser',
      compatibilityState: 'unsupported_browser',
      lastLifecycleAction: reason || 'install',
      lastError: 'Bu tarayici icin uygulama-yonetimli kurulum desteklenmiyor.'
    };
    if (storage.setBrowserCaptureSettings) storage.setBrowserCaptureSettings(patch);
    return Object.assign({ ok: false, error: patch.lastError }, buildBrowserCaptureStatus(patch));
  }
  const executablePath = status.browserExecutablePath;
  if (!executablePath || !fs.existsSync(executablePath)) {
    const patch = {
      lifecycleState: 'failed',
      compatibilityState: 'missing_browser_path',
      lastLifecycleAction: reason || 'install',
      lastError: 'Varsayilan tarayici calistiricisi bulunamadi.'
    };
    if (storage.setBrowserCaptureSettings) storage.setBrowserCaptureSettings(patch);
    return Object.assign({ ok: false, error: patch.lastError }, buildBrowserCaptureStatus(patch));
  }
  ensureManagedBrowserCaptureDirs();
  const managedProfileDir = status.managedProfileDir || path.join(BROWSER_CAPTURE_MANAGED_PROFILE_DIR, 'chromium');
  try { fs.mkdirSync(managedProfileDir, { recursive: true }); } catch (_e) {}
  const args = buildManagedChromiumLaunchArgs({
    profileDir: managedProfileDir,
    extensionDir: status.installDir,
    startUrl: buildBrowserCaptureStartUrl(status)
  });
  await new Promise(function (resolve, reject) {
    try {
      const child = execFile(executablePath, args, { windowsHide: false }, function (error) {
        if (error) reject(error);
      });
      if (child && typeof child.unref === 'function') child.unref();
      setTimeout(resolve, 350);
    } catch (error) {
      reject(error);
    }
  });
  const patch = {
    enabled: true,
    managedProfileDir,
    lifecycleState: 'installed_not_verified',
    compatibilityState: 'pending_verification',
    lastLifecycleAction: reason || 'install',
    lastError: '',
    updatePending: false
  };
  if (storage.setBrowserCaptureSettings) storage.setBrowserCaptureSettings(patch);
  return Object.assign({ ok: true, launched: true }, buildBrowserCaptureStatus(patch));
}

async function runBrowserCaptureLifecycle(action) {
  const normalizedAction = String(action || 'install').trim().toLowerCase();
  if (normalizedAction === 'test') {
    const live = await refreshCaptureAgentStatusSnapshot();
    const info = buildBrowserCaptureStatus(live && typeof live === 'object' ? live : {});
    const ok = !!(live && live.ok);
    const patch = {
      lastVerificationAt: Date.now(),
      lifecycleState: ok ? 'ready' : (info.installDir ? 'repair_needed' : 'not_installed'),
      compatibilityState: ok ? 'compatible' : info.compatibilityState,
      lastLifecycleAction: 'test',
      lastError: ok ? '' : 'Capture agent veya uzanti ile aktif baglanti dogrulanamadi.'
    };
    if (storage.setBrowserCaptureSettings) storage.setBrowserCaptureSettings(patch);
    return Object.assign({ ok, action: 'test', message: ok ? 'Browser Capture hazir.' : patch.lastError }, buildBrowserCaptureStatus(patch));
  }
  if (normalizedAction === 'stop_agent') {
    try {
      browserCaptureRuntime.stopAgentRequested = true;
      await stopCaptureAgent();
      await refreshCaptureAgentStatusSnapshot();
      return Object.assign({ ok: true, action: normalizedAction, message: 'Capture agent durduruldu.' }, buildBrowserCaptureStatus());
    } catch (error) {
      return Object.assign({ ok: false, action: normalizedAction, error: error && error.message ? error.message : 'Capture agent durdurulamadi.' }, buildBrowserCaptureStatus());
    }
  }
  if (normalizedAction === 'restart_agent') {
    browserCaptureRuntime.stopAgentRequested = false;
    try { await stopCaptureAgent(); } catch (_e) {}
    await ensureCaptureAgentRunning();
    return Object.assign({ ok: true, action: normalizedAction, message: 'Capture agent yeniden baslatildi.' }, buildBrowserCaptureStatus());
  }
  if (normalizedAction === 'update' || normalizedAction === 'repair' || normalizedAction === 'install') {
    const prepared = await prepareBrowserCaptureSetup();
    const loginItemState = syncCaptureAgentLoginItem(prepared.agentAutoStart !== false);
    if (storage.setBrowserCaptureSettings) {
      storage.setBrowserCaptureSettings({
        agentAutoStartSupported: !!loginItemState.supported,
        agentAutoStart: loginItemState.supported ? !!loginItemState.enabled : (prepared.agentAutoStart !== false)
      });
    }
    browserCaptureRuntime.stopAgentRequested = false;
    await ensureCaptureAgentRunning();
    const strategy = prepared.installStrategy || determineBrowserInstallStrategy(prepared);
    if (strategy && strategy.supported && strategy.id === 'managed_chromium_session') {
      return launchManagedBrowserCaptureSession(normalizedAction);
    }
    const patch = {
      enabled: true,
      lifecycleState: 'installed_not_verified',
      compatibilityState: 'pending_verification',
      lastLifecycleAction: normalizedAction,
      lastError: ''
    };
    if (storage.setBrowserCaptureSettings) storage.setBrowserCaptureSettings(patch);
    return Object.assign({ ok: true, action: normalizedAction, message: 'Capture agent hazir. Uzanti kurulumu tamamlandiginda baglanti dogrulanacak.' }, buildBrowserCaptureStatus(patch));
  }
  return Object.assign({ ok: false, error: 'Bilinmeyen Browser Capture aksiyonu.' }, buildBrowserCaptureStatus());
}

async function startBrowserCaptureBridge() {
  const settings = getBrowserCaptureSettings();
  hydratePendingCaptureRuntime();
  if (browserCaptureRuntime.bridge) {
    await browserCaptureRuntime.bridge.close();
    browserCaptureRuntime.bridge = null;
  }
  const candidatePorts = [settings.port || DEFAULT_CAPTURE_PORT];
  for (let offset = 1; offset <= 6; offset += 1) candidatePorts.push((settings.port || DEFAULT_CAPTURE_PORT) + offset);
  let lastError = null;
  for (let index = 0; index < candidatePorts.length; index += 1) {
    const bridge = createBrowserCaptureBridge({
      host: '127.0.0.1',
      port: candidatePorts[index],
      token: settings.token,
      onGetTargets: function () { return getCaptureTargets(); },
      onGetStatus: function () { return browserCaptureStatus(); },
      onLookup: function (payload) { return buildCaptureLookup(payload); },
      onCreateWorkspace: function (name) { return createWorkspaceFromMain(name); },
      onRequestSeen: function () {
        browserCaptureRuntime.lastBridgeEventAt = Date.now();
        if (storage.setBrowserCaptureSettings) storage.setBrowserCaptureSettings({ lastConnectedAt: browserCaptureRuntime.lastBridgeEventAt });
      },
      onHello: function (payload) {
        browserCaptureRuntime.lastHelloAt = Date.now();
        browserCaptureRuntime.lastHelloPayload = payload || {};
        browserCaptureRuntime.lastBridgeEventAt = browserCaptureRuntime.lastHelloAt;
        const patch = {
          lastConnectedAt: browserCaptureRuntime.lastHelloAt,
          lastVerificationAt: browserCaptureRuntime.lastHelloAt,
          installedExtensionVersion: payload && payload.extensionVersion ? String(payload.extensionVersion) : '',
          installedProtocolVersion: payload && payload.protocolVersion ? Number(payload.protocolVersion) : 0,
          lifecycleState: 'ready',
          compatibilityState: 'compatible',
          lastLifecycleAction: 'verify',
          lastError: '',
          updatePending: false
        };
        if (storage.setBrowserCaptureSettings) storage.setBrowserCaptureSettings(patch);
        return Object.assign({ acknowledged: true }, browserCaptureStatus(patch));
      },
      onCapture: async function (payload) {
        const imported = await importBrowserCaptureIntoState(payload);
        if (imported && imported.ok) {
          return {
            ok: true,
            queued: false,
            imported: true,
            workspaceId: imported.workspace && imported.workspace.id ? imported.workspace.id : '',
            refId: imported.ref && imported.ref.id ? imported.ref.id : '',
            message: buildBrowserCaptureImportMessage(imported)
          };
        }
        return queueBrowserCapturePayload(payload);
      }
    });
    try {
      const bound = await bridge.listen();
      browserCaptureRuntime.bridge = bridge;
      if (storage.setBrowserCaptureSettings) storage.setBrowserCaptureSettings({ port: bound.port });
      return bound;
    } catch (error) {
      lastError = error;
      try { await bridge.close(); } catch (_e) {}
    }
  }
  throw lastError || new Error('Bridge baslatilamadi');
}

function normalizeRefId(refId) {
  const value = String(refId || '').trim();
  if (!value) throw new Error('Geçersiz referans kimliği');
  if (value.length > 320) throw new Error('Referans kimliği çok uzun');
  return value;
}

function safeDecodeURIComponent(value) {
  const raw = String(value || '');
  try { return decodeURIComponent(raw); } catch (_e) { return raw; }
}

function normalizeDoi(value) {
  let doi = String(value || '').trim().toLowerCase();
  if (!doi) return '';
  doi = safeDecodeURIComponent(doi);
  doi = doi.replace(/^doi:\s*/i, '');
  doi = doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
  doi = doi.replace(/\s+/g, '');
  doi = doi.replace(/[)\].,;:]+$/g, '');
  const match = doi.match(/10\.\d{4,9}\/[-._;()/:a-z0-9]+/i);
  doi = (match && match[0] ? match[0] : doi).toLowerCase();
  doi = doi
    .replace(/(?:\/|\.)(bibtex|ris|abstract|fulltext|full|pdf|xml|html|epub)$/i, '')
    .replace(/\/[a-z]$/i, '')
    .replace(/[)\].,;:]+$/g, '');
  if (!/^10\.\d{4,9}\//i.test(doi)) return '';
  return doi;
}

function textHasExpectedDoi(text, expectedDoi) {
  const expected = normalizeDoi(expectedDoi);
  if (!expected) return false;
  const hay = String(text || '').toLowerCase();
  if (!hay) return false;
  if (hay.includes(expected)) return true;
  const encoded = expected.replace(/\//g, '%2f');
  if (hay.includes(encoded)) return true;
  const escaped = expected.replace(/\//g, '\\/');
  if (hay.includes(escaped)) return true;
  return false;
}

function urlLikelyMatchesExpectedDoi(url, expectedDoi) {
  const expected = normalizeDoi(expectedDoi);
  if (!expected) return false;
  const raw = String(url || '');
  if (textHasExpectedDoi(raw, expected)) return true;
  return textHasExpectedDoi(safeDecodeURIComponent(raw), expected);
}

function urlContainsDifferentDoi(url, expectedDoi) {
  const expected = normalizeDoi(expectedDoi);
  if (!expected) return false;
  const hay = safeDecodeURIComponent(String(url || '').toLowerCase());
  const match = hay.match(/10\.\d{4,9}\/[-._;()/:a-z0-9]+/i);
  if (!match || !match[0]) return false;
  return normalizeDoi(match[0]) !== expected;
}

function bufferLikelyMatchesExpectedDoi(buffer, expectedDoi) {
  const expected = normalizeDoi(expectedDoi);
  if (!expected || !Buffer.isBuffer(buffer)) return false;
  const sampleSize = Math.min(buffer.length, 2 * 1024 * 1024);
  const sample = buffer.slice(0, sampleSize).toString('latin1');
  return textHasExpectedDoi(sample, expected);
}

function normalizeTitleText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[“”"'"`´’]/g, ' ')
    .replace(/[^a-z0-9çğıöşü\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTitleTokens(value) {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'from', 'into', 'between', 'among', 'over', 'under',
    'study', 'analysis', 'effects', 'effect', 'using', 'use', 'based', 'open', 'access',
    'bir', 've', 'ile', 'için', 'olarak', 'üzerine', 'çalışma', 'araştırma', 'etkisi'
  ]);
  const parts = normalizeTitleText(value).split(' ').filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const part of parts) {
    if (part.length < 4) continue;
    if (stop.has(part)) continue;
    if (seen.has(part)) continue;
    seen.add(part);
    out.push(part);
    if (out.length >= 8) break;
  }
  return out;
}

function bufferLikelyMatchesExpectedTitle(buffer, expectedTitle) {
  const tokens = buildTitleTokens(expectedTitle);
  if (!tokens.length || !Buffer.isBuffer(buffer)) return false;
  const sampleSize = Math.min(buffer.length, 3 * 1024 * 1024);
  const sample = normalizeTitleText(buffer.slice(0, sampleSize).toString('latin1'));
  if (!sample) return false;
  let hits = 0;
  for (const token of tokens) {
    if (sample.includes(token)) hits += 1;
  }
  if (tokens.length >= 5) return hits >= 3;
  if (tokens.length >= 3) return hits >= 2;
  return hits >= 1;
}

function extractDoiCandidates(text) {
  const out = [];
  const seen = new Set();
  const src = String(text || '');
  const re = /10\.\d{4,9}\/[-._;()/:a-z0-9]+/ig;
  let m;
  while ((m = re.exec(src))) {
    const norm = normalizeDoi(m[0]);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

function isLowSignalDiscoveryURL(url) {
  const value = String(url || '').toLowerCase();
  if (!value) return false;
  return (
    /scholar\.google/.test(value) ||
    /semanticscholar\.org\/search/.test(value) ||
    /dergipark\.org\.tr\/.*search/.test(value) ||
    /\/search\?/.test(value) ||
    /[?&]q=/.test(value)
  );
}

function sanitizeDataPayload(json) {
  if (typeof json !== 'string') throw new Error('Kayit verisi metin olmalidir');
  const maxLen = 60 * 1024 * 1024;
  if (json.length > maxLen) throw new Error('Kayit verisi cok buyuk');
  return json;
}

function sanitizePDFBuffer(buffer) {
  if (Buffer.isBuffer(buffer)) return buffer;
  if (buffer instanceof ArrayBuffer) return Buffer.from(buffer);
  if (ArrayBuffer.isView(buffer)) return Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  throw new Error('Gecersiz PDF veri formati');
}

function sanitizeDownloadOptions(input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  if (src.timeoutMs != null && Number.isFinite(Number(src.timeoutMs))) out.timeoutMs = Number(src.timeoutMs);
  if (src.maxBytes != null && Number.isFinite(Number(src.maxBytes))) out.maxBytes = Number(src.maxBytes);
  if (src.expectedDoi != null) out.expectedDoi = String(src.expectedDoi || '').slice(0, 256);
  if (src.expectedTitle != null) out.expectedTitle = String(src.expectedTitle || '').slice(0, 1024);
  if (Array.isArray(src.expectedAuthors)) out.expectedAuthors = src.expectedAuthors.map(v => String(v || '').slice(0, 256)).filter(Boolean).slice(0, 8);
  if (src.expectedYear != null) out.expectedYear = String(src.expectedYear || '').slice(0, 32);
  if (src.requireDoiEvidence != null) out.requireDoiEvidence = !!src.requireDoiEvidence;
  if (src.ws && typeof src.ws === 'object') {
    const wsId = String(src.ws.id || '').trim();
    if (wsId) out.ws = { id: wsId.slice(0, 128), name: String(src.ws.name || '').slice(0, 256) };
  }
  return out;
}

function buildAuthorTokens(authors) {
  const out = [];
  const seen = new Set();
  (Array.isArray(authors) ? authors : []).forEach((author) => {
    const raw = String(author || '').trim();
    if (!raw) return;
    const parts = raw.includes(',') ? raw.split(',') : raw.split(/\s+/);
    const surname = normalizeTitleText(parts[0] || parts[parts.length - 1] || '');
    if (!surname || surname.length < 3 || seen.has(surname)) return;
    seen.add(surname);
    out.push(surname);
  });
  return out.slice(0, 4);
}

function sampleContainsYear(sample, expectedYear) {
  const year = String(expectedYear || '').match(/\b(19|20)\d{2}\b/);
  if (!year || !year[0]) return false;
  return String(sample || '').includes(year[0]);
}

function sanitizeNetFetchOptions(input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  if (src.timeoutMs != null && Number.isFinite(Number(src.timeoutMs))) {
    out.timeoutMs = Number(src.timeoutMs);
  }
  if (src.maxBytes != null && Number.isFinite(Number(src.maxBytes))) {
    out.maxBytes = Number(src.maxBytes);
  }
  if (src.allowAnyHost != null) {
    out.allowAnyHost = !!src.allowAnyHost;
  }
  return out;
}

function runPowerShell(command, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      {
        windowsHide: true,
        timeout: Math.max(5000, Math.min(parseInt(timeoutMs, 10) || 45000, 180000)),
        maxBuffer: 10 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          const msg = (stderr || error.message || '').toString().trim() || 'PowerShell failed';
          reject(new Error(msg));
          return;
        }
        resolve(String(stdout || '').trim());
      }
    );
  });
}

async function convertWordWithOfficeComToHtml(inputPath) {
  const inPath = path.resolve(String(inputPath || ''));
  if (!inPath || !fs.existsSync(inPath)) throw new Error('Word dosyasi bulunamadi');
  const tempHtml = path.join(app.getPath('temp'), `aq_word_import_${Date.now()}_${Math.random().toString(16).slice(2)}.html`);
  const script = [
    "$ErrorActionPreference='Stop'",
    `$inPath=${psQuote(inPath)}`,
    `$outPath=${psQuote(tempHtml)}`,
    "$word=$null",
    "$doc=$null",
    "try {",
    "  $word = New-Object -ComObject Word.Application",
    "  $word.Visible = $false",
    "  $word.DisplayAlerts = 0",
    "  $doc = $word.Documents.Open($inPath, $false, $true)",
    "  $wdFormatFilteredHTML = 10",
    "  $doc.SaveAs([ref]$outPath, [ref]$wdFormatFilteredHTML)",
    "} finally {",
    "  if($doc -ne $null){ try { $doc.Close([ref]0) } catch {} }",
    "  if($word -ne $null){ try { $word.Quit() } catch {} }",
    "}",
    "Write-Output $outPath"
  ].join(';');
  const outPath = await runPowerShell(script, 120000);
  const finalPath = outPath && fs.existsSync(outPath) ? outPath : (fs.existsSync(tempHtml) ? tempHtml : '');
  if (!finalPath) throw new Error('Office COM HTML donusumu basarisiz');
  const raw = fs.readFileSync(finalPath);
  const decoded = decodeWordImportBuffer(raw);
  const html = decoded && decoded.html ? String(decoded.html) : raw.toString('utf8');
  // Debug: keep a copy of the last Word import so we can inspect what the
  // filtered-HTML conversion produced when the editor renders oddly.
  try {
    const debugPath = path.join(app.getPath('temp'), 'aq_last_word_import.html');
    fs.writeFileSync(debugPath, html, 'utf8');
  } catch (_e) {}
  try { fs.unlinkSync(finalPath); } catch (_e) {}
  return html;
}

async function convertExportHTMLWithOfficeComToDocx(html, outputPath) {
  const outPath = path.resolve(String(outputPath || ''));
  if (!outPath) throw new Error('DOCX hedef yolu geçersiz');
  const tempHtml = path.join(app.getPath('temp'), `aq_docx_export_${Date.now()}_${Math.random().toString(16).slice(2)}.html`);
  try {
    fs.writeFileSync(tempHtml, String(html || '<p></p>'), 'utf8');
    const script = [
      "$ErrorActionPreference='Stop'",
      `$inPath=${psQuote(tempHtml)}`,
      `$outPath=${psQuote(outPath)}`,
      "$word=$null",
      "$doc=$null",
      "try {",
      "  $word = New-Object -ComObject Word.Application",
      "  $word.Visible = $false",
      "  $word.DisplayAlerts = 0",
      "  $doc = $word.Documents.Open($inPath, $false, $true)",
      "  $wdFormatXMLDocument = 12",
      "  $doc.SaveAs([ref]$outPath, [ref]$wdFormatXMLDocument)",
      "} finally {",
      "  if($doc -ne $null){ try { $doc.Close([ref]0) } catch {} }",
      "  if($word -ne $null){ try { $word.Quit() } catch {} }",
      "}"
    ].join(';');
    await runPowerShell(script, 120000);
  } finally {
    try { fs.unlinkSync(tempHtml); } catch (_e) {}
  }
  if (!fs.existsSync(outPath)) throw new Error('DOCX dışa aktarımı tamamlanamadı');
  return outPath;
}

function createWindow() {
  browserCaptureRuntime.ready = false;
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'AcademiQ Research',
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  // In development (npm start / unpackaged), always use bundled files directly.
  // Packaged builds archive stale overrides from userData but also load the
  // bundled file to keep the runtime deterministic across updates.
  const bundledHtml = path.join(__dirname, 'academiq-research.html');
  if (app.isPackaged) {
    try { archiveLegacyRuntimeOverrides(storage.appDir); } catch (_e) {}
    try { archiveUnexpectedAppRuntimeFiles(storage.appDir); } catch (_e) {}
    const expectedRuntimeSignature = computeRendererRuntimeSignature(__dirname);
    try { archiveStaleRuntimeOverrides(storage.appDir, APP_VERSION, expectedRuntimeSignature); } catch (_e) {}
  }
  if (!fs.existsSync(bundledHtml)) {
    console.error('[startup] bundled renderer HTML missing:', bundledHtml);
    app.quit();
    return;
  }
  mainWindow.loadFile(bundledHtml);
  mainWindow.webContents.on('did-finish-load', () => {
    browserCaptureRuntime.ready = true;
    processCaptureQueueFromApp('did-finish-load').catch(() => {});
    flushPendingBrowserCaptures();
    scheduleBrowserCaptureFlush(160);
    try {
      mainWindow.webContents.executeJavaScript(`(() => {
        const byId = (id) => document.getElementById(id);
        const themeBtn = byId('themebtn');
        const settingsBtn = byId('settingsBtn');
        const toolbarRows = Array.from(document.querySelectorAll('#etb .etb-row')).map((row) => ({
          text: (row.textContent || '').replace(/\s+/g, ' ').trim(),
          children: Array.from(row.querySelectorAll('.tbgrp')).map((group) => ({
            title: (group.querySelector('.tbgrp-title')?.textContent || '').trim(),
            text: (group.textContent || '').replace(/\s+/g, ' ').trim()
          }))
        }));
        const modals = Array.from(document.querySelectorAll('.modal-bg')).map((el) => ({
          id: el.id || '',
          cls: el.className || '',
          display: getComputedStyle(el).display,
          pointerEvents: getComputedStyle(el).pointerEvents
        }));
        return {
          href: location.href,
          scriptCount: document.scripts.length,
          scriptSources: Array.from(document.scripts).slice(0, 120).map((script) => ({
            src: script.getAttribute('src') || '',
            inlineLength: script.getAttribute('src') ? 0 : String(script.textContent || '').length
          })),
          hasDoTrigRef: typeof window.doTrigRef,
          hasCheckTrig: typeof window.checkTrig,
          hasOpenTrig: typeof window.openTrig,
          hasRenderTrig: typeof window.renderTrig,
          hasCitationRuntime: typeof window.AQCitationRuntime,
          citationRuntimeInit: !!window.__aqCitationRuntimeV1,
          editorPresent: !!window.editor,
          themeText: themeBtn ? themeBtn.textContent : '',
          themeDisplay: themeBtn ? getComputedStyle(themeBtn).display : '',
          settingsText: settingsBtn ? settingsBtn.textContent : '',
          bodyPointerEvents: document.body && document.body.style ? document.body.style.pointerEvents : '',
          legacyPhase: window.__aqLegacyRuntimePhase || '',
          hasShowSyncSettings: typeof window.showSyncSettings,
          hasSyncLoad: typeof window.syncLoad,
          toolbarRows,
          modalSnapshot: modals
        };
      })()`, true).then((probe) => {
        try {
          fs.writeFileSync(path.join(storage.appDir, 'ui-load-probe.json'), JSON.stringify({
            ts: Date.now(),
            htmlPath,
            probe
          }, null, 2), 'utf8');
        } catch (_e) {}
      }).catch(() => {});
    } catch (_e) {}
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    appendRendererProbeError({
      type: 'console-message',
      level,
      message: String(message || ''),
      line: Number(line || 0),
      sourceId: String(sourceId || '')
    });
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeHttpURL(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Never navigate away from local UI inside the app window.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow && mainWindow.webContents ? mainWindow.webContents.getURL() : '';
    if (url === currentUrl) return;
    event.preventDefault();
    if (isSafeHttpURL(url)) shell.openExternal(url);
  });

  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  // PDF viewer sağ tık: seçili metin varsa native menüyü bastır (renderer hltip'i gösterir)
  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable && params.selectionText && params.selectionText.trim()) return;
    const tpl = [];
    if (params.isEditable) {
      tpl.push({ label: 'Kes', role: 'cut' });
      tpl.push({ label: 'Kopyala', role: 'copy', enabled: !!(params.selectionText) });
      tpl.push({ label: 'Yapıştır', role: 'paste' });
      tpl.push({ type: 'separator' });
    }
    tpl.push({ label: 'Tümünü Seç', role: 'selectAll' });
    Menu.buildFromTemplate(tpl).popup({ window: mainWindow });
  });

  // Close confirmation â€” ask user if they want to save
  let forceClose = false;
  mainWindow.on('close', (e) => {
    if (forceClose) return;
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Kaydet ve Kapat', 'Kaydetmeden Kapat', 'Ä°ptal'],
      defaultId: 0,
      cancelId: 2,
      title: 'AcademiQ Research',
      message: 'DeÄŸiÅŸiklikler kaydedilsin mi?'
    });
    if (choice === 0) {
      // Save then close
      mainWindow.webContents.executeJavaScript('(async function(){try{await syncSave();}catch(e){}})()')
        .then(() => { forceClose = true; mainWindow.close(); })
        .catch(() => { forceClose = true; mainWindow.close(); });
    } else if (choice === 1) {
      // Close without saving
      forceClose = true;
      mainWindow.close();
    }
    // choice === 2: Cancel â€” do nothing
  });
  mainWindow.on('closed', () => {
    browserCaptureRuntime.ready = false;
    mainWindow = null;
  });
}

if (IS_CAPTURE_AGENT_MODE) {
  app.whenReady().then(async () => {
    storage.loadSettings();
    const settings = getBrowserCaptureSettings();
    if (IS_CAPTURE_AGENT_AUTOSTART && (settings.enabled === false || settings.agentAutoStart === false)) {
      app.exit(0);
      return;
    }
    try {
      const existing = await pingCaptureAgentStatus().catch(() => null);
      if (existing && existing.ok) {
        app.exit(0);
        return;
      }
      captureAgentRuntime = createCaptureAgentRuntime({
        storage,
        appVersion: APP_VERSION
      });
      await captureAgentRuntime.start();
    } catch (error) {
      console.warn('Capture agent start error:', error && error.message ? error.message : error);
      app.exit(1);
    }
  });
} else {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });
  });

  app.on('second-instance', (_event, argv) => {
    const protocolUrl = extractProtocolUrlFromArgs(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    if (protocolUrl) handleProtocolUrl(protocolUrl);
  });

  app.whenReady().then(async () => {
    try {
      session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
        callback(permission === 'clipboard-sanitized-write');
      });
    } catch (_e) {}
    // One-shot: purge any residual AI data (encrypted API keys + chat history)
    // from prior versions. Run BEFORE storage init so nothing can re-touch
    // these files between cleanup and load. Cleans both APP_DIR and the
    // Electron userData path (different installs may have used either).
    try {
      const cleanupDirs = [];
      cleanupDirs.push(APP_DIR);
      try {
        const userData = app.getPath('userData');
        if (userData && userData !== APP_DIR) cleanupDirs.push(userData);
      } catch (_e) {}
      for (const dir of cleanupDirs) {
        try {
          const aiSecretsFile = path.join(dir, 'ai-secrets.enc');
          if (fs.existsSync(aiSecretsFile)) {
            try { fs.unlinkSync(aiSecretsFile); console.log('[ai-cleanup] removed', aiSecretsFile); } catch (_e) {}
          }
          const aiChatDir = path.join(dir, 'ai-chat');
          if (fs.existsSync(aiChatDir)) {
            try { fs.rmSync(aiChatDir, { recursive: true, force: true }); console.log('[ai-cleanup] removed', aiChatDir); } catch (_e) {}
          }
        } catch (_e) {}
      }
    } catch (e) {
      console.warn('AI cleanup error:', e && e.message ? e.message : e);
    }
    storage.loadSettings();
    try {
      const bootData = storage.loadData();
      latestStateJSON = bootData && bootData.data ? String(bootData.data) : '';
    } catch (_e) {
      latestStateJSON = '';
    }
    try {
      if (storage.markSessionOpen) storage.markSessionOpen({ appVersion: APP_VERSION });
    } catch (_e) {}
    // One-shot: migrate any legacy flat-dir PDFs into workspace-scoped folders.
    try {
      if (typeof storage.migrateLegacyPdfsToWorkspaces === 'function') {
        const migResult = storage.migrateLegacyPdfsToWorkspaces();
        if (migResult && (migResult.migrated || migResult.skipped || migResult.failed)) {
          console.log('[pdf-migration]', migResult);
        }
      }
    } catch (e) {
      console.warn('PDF migration error:', e && e.message ? e.message : e);
    }
    try {
      if (storage.saveCaptureTargets) storage.saveCaptureTargets(getCaptureTargets());
    } catch (_e) {}
    getBrowserCaptureSettings();
    try {
      await processCaptureQueueFromApp('startup');
    } catch (error) {
      console.warn('Capture queue process error:', error && error.message ? error.message : error);
    }
    try {
      if (process.defaultApp && process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('academiq', process.execPath, [path.resolve(process.argv[1])]);
      } else {
        app.setAsDefaultProtocolClient('academiq');
      }
    } catch (_e) {}
    ensureAcademiqProtocolRegistration().catch((error) => {
      console.warn('AcademiQ protocol registration error:', error && error.message ? error.message : error);
    });
    createWindow();
    startCaptureQueuePolling();
    ensureCaptureAgentRunning().catch((error) => {
      console.warn('Capture agent start error:', error && error.message ? error.message : error);
    });
    const initialProtocolUrl = extractProtocolUrlFromArgs(process.argv);
    if (initialProtocolUrl) setTimeout(() => { handleProtocolUrl(initialProtocolUrl); }, 250);
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  }
}

app.on('window-all-closed', () => {
  if (IS_CAPTURE_AGENT_MODE) return;
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', (event) => {
  if (!IS_CAPTURE_AGENT_MODE && !browserCaptureRuntime.quitEnsured) {
    const settings = getBrowserCaptureSettings();
    const shouldKeepAgentAlive = settings.enabled !== false && settings.agentAutoStart !== false && !browserCaptureRuntime.stopAgentRequested;
    if (shouldKeepAgentAlive) {
      event.preventDefault();
      browserCaptureRuntime.quitEnsured = true;
      ensureCaptureAgentRunning()
        .catch(() => null)
        .finally(() => {
          app.quit();
        });
      return;
    }
  }
  stopCaptureQueuePolling();
  try {
    if (storage.markSessionClosed) storage.markSessionClosed({ appVersion: APP_VERSION });
  } catch (_e) {}
  if (captureAgentRuntime && IS_CAPTURE_AGENT_MODE) {
    try { captureAgentRuntime.stop(); } catch (_e) {}
  }
  if (browserCaptureRuntime.bridge) {
    try { browserCaptureRuntime.bridge.close(); } catch (_e) {}
  }
});
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

// â”€â”€ IPC: DATA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.on('renderer:probeError', (_event, payload) => {
  appendRendererProbeError(payload);
});

ipcMain.handle('data:load', async () => {
  try {
    const result = storage.loadData();
    latestStateJSON = result && result.data ? String(result.data) : '';
    try {
      if (storage.saveCaptureTargets) storage.saveCaptureTargets(getCaptureTargets());
    } catch (_e) {}
    return result;
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('data:save', async (_ev, json) => {
  try {
    const safeJSON = sanitizeDataPayload(json);
    latestStateJSON = safeJSON;
    const saved = storage.saveData(safeJSON);
    try {
      if (storage.saveCaptureTargets) storage.saveCaptureTargets(getCaptureTargets());
    } catch (_e) {}
    return saved;
  } catch (e) {
    try {
      if (storage.saveSessionState) storage.saveSessionState({ lastSaveError: e && e.message ? String(e.message) : 'Bilinmeyen kaydetme hatasi' });
    } catch (_err) {}
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('data:saveDraft', async (_ev, json) => {
  try {
    const safeJSON = sanitizeDataPayload(json);
    return storage.saveEditorDraft(safeJSON, { source: 'editor-draft' });
  } catch (e) {
    try {
      if (storage.saveSessionState) storage.saveSessionState({ lastDraftError: e && e.message ? String(e.message) : 'Bilinmeyen draft kaydetme hatasi' });
    } catch (_err) {}
    return { ok: false, error: e.message };
  }
});

// â”€â”€ IPC: PDF FILES (dual-write: local cache + sync folder) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function sanitizeWsContext(ws) {
  if (!ws || typeof ws !== 'object') return null;
  const id = String(ws.id || '').trim();
  if (!id) return null;
  if (id.length > 128) return null;
  return { id, name: String(ws.name || '').slice(0, 256) };
}

ipcMain.handle('pdf:save', async (_ev, refId, buffer, ws) => {
  try {
    normalizeRefId(refId);
    const pdfBuffer = sanitizePDFBuffer(buffer);
    if (pdfBuffer.length > 150 * 1024 * 1024) throw new Error('PDF dosyasi cok buyuk');
    return storage.savePDF(refId, pdfBuffer, sanitizeWsContext(ws));
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('pdf:load', async (_ev, refId, ws) => {
  try {
    normalizeRefId(refId);
    return storage.loadPDF(refId, sanitizeWsContext(ws));
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('pdf:exists', async (_ev, refId, ws) => {
  try {
    normalizeRefId(refId);
    return storage.pdfExists(refId, sanitizeWsContext(ws));
  } catch (_e) {
    return false;
  }
});

ipcMain.handle('pdf:delete', async (_ev, refId, ws) => {
  try {
    normalizeRefId(refId);
    return storage.deletePDF(refId, sanitizeWsContext(ws));
  } catch (e) { return { ok: false, error: e.message }; }
});

// Open the stored PDF's folder in the OS file explorer, highlighting the file.
ipcMain.handle('pdf:showInExplorer', async (_ev, refId, ws) => {
  try {
    normalizeRefId(refId);
    const filePath = storage.locatePdfPath(refId, sanitizeWsContext(ws));
    if (!filePath) return { ok: false, error: 'PDF bulunamadi' };
    try { shell.showItemInFolder(filePath); } catch (e) { return { ok: false, error: e.message }; }
    return { ok: true, path: filePath };
  } catch (e) { return { ok: false, error: e.message }; }
});

// Delete an entire workspace's PDF folder (called before removing a workspace).
ipcMain.handle('pdf:deleteWorkspaceFolder', async (_ev, ws) => {
  try {
    const wsCtx = sanitizeWsContext(ws);
    if (!wsCtx) return { ok: false, error: 'Gecersiz calisma alani' };
    return storage.deleteWorkspacePdfFolder(wsCtx);
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('pdf:syncAll', async () => storage.syncAllPDFs());

async function downloadPDFfromURLMain(url, refId, options = {}) {
  if (!isSafeHttpURL(url)) return { ok: false, error: 'Geçersiz veya güvenli olmayan URL' };
  try { normalizeRefId(refId); } catch (e) { return { ok: false, error: e.message }; }
  const safeOptions = sanitizeDownloadOptions(options);
  const expectedDoi = normalizeDoi(safeOptions.expectedDoi || '');
  const expectedTitle = String(safeOptions.expectedTitle || '').trim();
  const expectedAuthors = Array.isArray(safeOptions.expectedAuthors) ? safeOptions.expectedAuthors.slice() : [];
  const expectedYear = String(safeOptions.expectedYear || '').trim();
  const requireDoiEvidence = expectedDoi ? (safeOptions.requireDoiEvidence !== false) : false;
  function extractPdfCandidatesFromHTML(html, baseUrl) {
    const out = [];
    const seen = new Set();
    if (!html || typeof html !== 'string') return out;
    function pushCandidate(link) {
      try {
        if (!link || typeof link !== 'string') return;
        const normalized = new URL(link, baseUrl).href;
        if (!/^https?:\/\//i.test(normalized)) return;
        if (seen.has(normalized)) return;
        seen.add(normalized);
        out.push(normalized);
      } catch (_e) {}
    }
    const hrefRe = /href\s*=\s*["']([^"']+)["']/ig;
    let match;
    while ((match = hrefRe.exec(html))) {
      const link = String(match[1] || '').trim();
      if (!link) continue;
      if (/\.pdf($|[?#])/i.test(link)) pushCandidate(link);
      else if (/\/pdf(\/|$|[?#])/i.test(link)) pushCandidate(link);
      else if (/download/i.test(link) && /article|paper|fulltext|file|view/i.test(link)) pushCandidate(link);
    }
    const metaPdfRe = /<meta[^>]+(?:name|property)\s*=\s*["'](?:citation_pdf_url|dc\.identifier|og:pdf|twitter:image:src)["'][^>]+content\s*=\s*["']([^"']+)["']/ig;
    while ((match = metaPdfRe.exec(html))) {
      const link = String(match[1] || '').trim();
      if (!link) continue;
      if (/\.pdf($|[?#])/i.test(link) || /\/pdf(\/|$|[?#])/i.test(link)) pushCandidate(link);
    }
    const dataPdfRe = /"(?:pdfUrl|pdf_url|citation_pdf_url)"\s*:\s*"([^"]+)"/ig;
    while ((match = dataPdfRe.exec(html))) {
      const raw = String(match[1] || '').replace(/\\\//g, '/').trim();
      if (!raw) continue;
      pushCandidate(raw);
    }
    return out;
  }
  async function fetchPdfBufferWithFallback(startUrl, timeoutMs) {
    const maxBytes = Math.max(512 * 1024, Math.min(Number(safeOptions.maxBytes) || (50 * 1024 * 1024), 150 * 1024 * 1024));
    const visited = new Set();
    function scoreCandidate(candidateUrl) {
      let score = 0;
      if (/\.pdf($|[?#])/i.test(candidateUrl)) score += 4;
      if (/\/pdf(\/|$|[?#])/i.test(candidateUrl)) score += 3;
      if (expectedDoi && urlLikelyMatchesExpectedDoi(candidateUrl, expectedDoi)) score += 8;
      if (isLowSignalDiscoveryURL(candidateUrl)) score -= 10;
      return score;
    }
    async function tryUrl(targetUrl, depth) {
      if (!targetUrl || visited.has(targetUrl) || depth > 2) return { ok: false, error: 'No PDF candidate succeeded' };
      if (!isSafeHttpURL(targetUrl)) return { ok: false, error: 'Blocked URL candidate' };
      if (isLowSignalDiscoveryURL(targetUrl)) {
        return { ok: false, error: 'Low-signal discovery URL skipped' };
      }
      visited.add(targetUrl);
      const meta = await followRedirects(targetUrl, 8, {
        timeout: timeoutMs,
        returnMeta: true,
        maxBytes,
        blockPrivate: true
      });
      const buf = meta && meta.buffer ? meta.buffer : meta;
      if (!buf || !Buffer.isBuffer(buf)) return { ok: false, error: 'Invalid response buffer' };
      if (buf.length < 100) return { ok: false, error: 'Too small: ' + buf.length + ' bytes' };
      const headerStr = buf.slice(0, 4096).toString('ascii');
      const pdfIdx = headerStr.indexOf('%PDF-');
      const finalUrl = (meta && meta.finalUrl) || targetUrl;
      if (pdfIdx >= 0) {
        const pdfBuffer = pdfIdx > 0 ? buf.slice(pdfIdx) : buf;
        if (expectedDoi || expectedTitle) {
          const sampleSize = Math.min(pdfBuffer.length, 3 * 1024 * 1024);
          const sample = pdfBuffer.slice(0, sampleSize).toString('latin1');
          const normalizedSample = normalizeTitleText(sample);
          const titleTokens = buildTitleTokens(expectedTitle);
          const authorTokens = buildAuthorTokens(expectedAuthors);
          const titleHits = titleTokens.reduce((count, token) => count + (normalizedSample.includes(token) ? 1 : 0), 0);
          const authorHits = authorTokens.reduce((count, token) => count + (normalizedSample.includes(token) ? 1 : 0), 0);
          const yearMatch = sampleContainsYear(sample, expectedYear);
          const titleRatio = titleTokens.length ? (titleHits / Math.max(titleTokens.length, 1)) : 0;
          const titleLikely = !!expectedTitle && (titleRatio >= 0.55 || titleHits >= Math.min(4, Math.max(2, titleTokens.length)));
          const metadataLikely = titleLikely && (authorHits >= 1 || yearMatch || authorTokens.length === 0);
          let doiCandidates = [];
          let hasDifferentDoi = false;
          let doiInUrl = false;
          let doiInBody = false;
          if (expectedDoi) {
            doiInUrl = urlLikelyMatchesExpectedDoi(finalUrl, expectedDoi) || urlLikelyMatchesExpectedDoi(targetUrl, expectedDoi);
            doiInBody = bufferLikelyMatchesExpectedDoi(pdfBuffer, expectedDoi);
            doiCandidates = extractDoiCandidates(sample);
            hasDifferentDoi = doiCandidates.length > 0 && !doiCandidates.includes(expectedDoi);
            if (hasDifferentDoi) {
              return { ok: false, error: 'PDF DOI mismatch (different DOI found)' };
            }
            if (!doiInBody && !doiInUrl) {
              if (requireDoiEvidence && !metadataLikely) {
                return { ok: false, error: 'PDF DOI kanıtı yok' };
              }
              if (!metadataLikely && !(expectedTitle && bufferLikelyMatchesExpectedTitle(pdfBuffer, expectedTitle))) {
                return { ok: false, error: 'PDF DOI mismatch' };
              }
            }
          } else if (expectedTitle && !bufferLikelyMatchesExpectedTitle(pdfBuffer, expectedTitle)) {
            return { ok: false, error: 'PDF title mismatch' };
          }
          const verification = buildVerificationReport({
            expectedDoi,
            expectedTitle,
            finalUrl,
            sourceUrl: targetUrl,
            doiInBody,
            doiInUrl,
            titleTokenHits: titleHits,
            titleTokenTotal: titleTokens.length,
            authorTokenHits: authorHits,
            authorTokenTotal: authorTokens.length,
            yearMatch,
            differentDoiFound: hasDifferentDoi,
            doiCandidates
          });
          if (verification.status === 'suspicious') {
            return { ok: false, error: verification.summary || 'PDF güven skoru düşük', verification };
          }
          return { ok: true, buffer: pdfBuffer, finalUrl, verification };
        }
        return { ok: true, buffer: pdfBuffer, finalUrl, verification: null };
      }
      const isHTML = headerStr.toLowerCase().includes('<html') || headerStr.toLowerCase().includes('<!doctype');
      if (!isHTML) {
        return { ok: false, error: 'No PDF header found in first 4096 bytes' };
      }
      const html = buf.slice(0, Math.min(buf.length, 300000)).toString('utf8');
      if (expectedDoi) {
        if (!textHasExpectedDoi(html, expectedDoi) && !urlLikelyMatchesExpectedDoi(finalUrl, expectedDoi)) {
          return { ok: false, error: 'Landing page DOI mismatch' };
        }
      }
      const candidates = extractPdfCandidatesFromHTML(html, finalUrl)
        .filter(candidate => isSafeHttpURL(candidate))
        .filter(candidate => !isLowSignalDiscoveryURL(candidate))
        .filter(candidate => !(expectedDoi && urlContainsDifferentDoi(candidate, expectedDoi)))
        .filter(candidate => !(expectedDoi && !urlLikelyMatchesExpectedDoi(candidate, expectedDoi) && !/\/pdf(\/|$|[?#])|\.pdf($|[?#])/i.test(candidate)))
        .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))
        .slice(0, 10);
      for (const cand of candidates) {
        const tried = await tryUrl(cand, depth + 1);
        if (tried && tried.ok) return tried;
      }
      return { ok: false, error: 'HTML page, no PDF link candidate' };
    }
    return tryUrl(startUrl, 0);
  }
  try {
    const timeoutMs = Math.max(5000, Math.min(Number(safeOptions.timeoutMs) || 30000, 90000));
    const fetched = await fetchPdfBufferWithFallback(url, timeoutMs);
    if (!fetched || !fetched.ok || !fetched.buffer) {
      const errorText = (fetched && fetched.error) ? fetched.error : 'PDF download failed';
      return {
        ok: false,
        error: errorText,
        failure: classifyPdfDownloadFailure(errorText),
        finalUrl: fetched && fetched.finalUrl ? String(fetched.finalUrl) : String(url || '')
      };
    }
    const pdfBuf = fetched.buffer;
    storage.savePDF(refId, pdfBuf, options && options.ws ? sanitizeWsContext(options.ws) : null);
    return {
      ok: true,
      size: pdfBuf.length,
      finalUrl: fetched.finalUrl || String(url || ''),
      verification: fetched.verification || null
    };
  } catch (e) {
    const errorText = e && e.message ? e.message : String(e);
    return {
      ok: false,
      error: errorText,
      failure: classifyPdfDownloadFailure(errorText),
      finalUrl: String(url || '')
    };
  }
}

ipcMain.handle('pdf:download', async (_ev, url, refId, options = {}) => {
  return downloadPDFfromURLMain(url, refId, options);
});

// â”€â”€ IPC: DIALOG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('dialog:openPDF', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'PDF Dosyasi Sec',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile', 'multiSelections']
  });
  if (result.canceled || !result.filePaths.length) return { ok: false };
  const files = [];
  for (const fp of result.filePaths) {
    if (!/\.pdf$/i.test(fp)) continue;
    const stat = fs.statSync(fp);
    if (!stat.isFile()) continue;
    if (stat.size > 120 * 1024 * 1024) continue;
    const buf = fs.readFileSync(fp);
    files.push({
      name: path.basename(fp),
      buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    });
  }
  return { ok: true, files };
});

ipcMain.handle('word:toHtml', async (_ev, filePath) => {
  try {
    const resolved = path.resolve(String(filePath || ''));
    if (!/\.(docx?|rtf)$/i.test(resolved)) return { ok: false, error: 'Desteklenmeyen dosya türü (.doc/.docx/.rtf gerekli)' };
    if (!fs.existsSync(resolved)) return { ok: false, error: 'Dosya bulunamadı' };
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) return { ok: false, error: 'Dosya okunamadı' };
    if (stat.size > 40 * 1024 * 1024) return { ok: false, error: 'Dosya çok büyük' };
    const html = await convertWordWithOfficeComToHtml(resolved);
    return { ok: true, html };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('net:fetch-json', async (_ev, url, options = {}) => {
  if (!isSafeHttpURL(url)) return { ok: false, error: 'Geçersiz veya güvenli olmayan URL' };
  try {
    const safeOptions = sanitizeNetFetchOptions(options);
    const timeout = Math.max(2500, Math.min(parseInt(safeOptions.timeoutMs, 10) || 8000, 30000));
    const data = await fetchJSON(url, {
      timeout,
      blockPrivate: true,
      allowedHosts: NET_ALLOWED_HOSTS
    });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle('net:fetch-text', async (_ev, url, options = {}) => {
  if (!isSafeHttpURL(url)) return { ok: false, error: 'Geçersiz veya güvenli olmayan URL' };
  try {
    const safeOptions = sanitizeNetFetchOptions(options);
    const timeout = Math.max(2500, Math.min(parseInt(safeOptions.timeoutMs, 10) || 8000, 30000));
    const maxBytes = Math.max(32 * 1024, Math.min(parseInt(safeOptions.maxBytes, 10) || (4 * 1024 * 1024), 12 * 1024 * 1024));
    const allowedHosts = safeOptions.allowAnyHost ? null : NET_ALLOWED_HOSTS;
    const meta = await followRedirects(url, 6, {
      timeout,
      maxBytes,
      returnMeta: true,
      blockPrivate: true,
      allowedHosts,
      headers: {
        'User-Agent': 'AcademiQ/1.0 (academic research tool)',
        'Accept': 'text/html,application/xhtml+xml,application/xml,text/plain,*/*'
      }
    });
    const buf = meta && meta.buffer ? meta.buffer : meta;
    const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : '';
    return { ok: true, text, finalUrl: meta && meta.finalUrl ? String(meta.finalUrl) : String(url) };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle('export:pdf', async (event, options = {}) => {
  let exportWindow = null;
  let tempExportHtmlPath = '';
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (!win) return { ok: false, error: 'Pencere bulunamadi' };
    const saveResult = await dialog.showSaveDialog(win, {
      title: 'PDF Olarak Kaydet',
      defaultPath: String(options.defaultPath || 'makale.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (saveResult.canceled || !saveResult.filePath) return { ok: false, canceled: true };

    const exportHTML = buildExportHTML(options);
    tempExportHtmlPath = path.join(
      app.getPath('temp'),
      `aq_export_${Date.now()}_${Math.random().toString(16).slice(2)}.html`
    );
    fs.writeFileSync(tempExportHtmlPath, exportHTML, 'utf8');

    exportWindow = new BrowserWindow({
      show: false,
      width: 1024,
      height: 1400,
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false
      }
    });
    await exportWindow.loadFile(tempExportHtmlPath);
    await new Promise(resolve => setTimeout(resolve, 80));

    const pdfBuffer = await exportWindow.webContents.printToPDF(
      buildPrintToPDFOptions(options)
    );
    fs.writeFileSync(saveResult.filePath, pdfBuffer);
    return { ok: true, filePath: saveResult.filePath, size: pdfBuffer.length };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    if (exportWindow && !exportWindow.isDestroyed()) {
      try { exportWindow.destroy(); } catch (_e) {}
    }
    if (tempExportHtmlPath) {
      try { fs.unlinkSync(tempExportHtmlPath); } catch (_e) {}
    }
  }
});

ipcMain.handle('pdf:exportAnnotated', async (event, options = {}) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (!win) return { ok: false, error: 'Pencere bulunamadi' };
    const pdfBase64 = String((options && options.pdfBase64) || '');
    if (!pdfBase64) return { ok: false, error: 'Kaynak PDF verisi yok.' };
    const srcBytes = Buffer.from(pdfBase64, 'base64');
    if (!srcBytes.length) return { ok: false, error: 'Kaynak PDF boş.' };
    const saveResult = await dialog.showSaveDialog(win, {
      title: 'Annotationlı PDF Olarak Kaydet',
      defaultPath: String(options.defaultPath || 'makale - annotated.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (saveResult.canceled || !saveResult.filePath) return { ok: false, canceled: true };
    const { flattenAnnotationsIntoPdf } = require('./src/main-process-pdf-annotate.js');
    const outBytes = await flattenAnnotationsIntoPdf({
      pdfBytes: srcBytes,
      payload: options.payload || {}
    });
    fs.writeFileSync(saveResult.filePath, Buffer.from(outBytes));
    return { ok: true, filePath: saveResult.filePath, size: outBytes.length };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle('export:docx', async (event, options = {}) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (!win) return { ok: false, error: 'Pencere bulunamadi' };
    const saveResult = await dialog.showSaveDialog(win, {
      title: 'DOCX Olarak Kaydet',
      defaultPath: String(options.defaultPath || 'makale.docx'),
      filters: [{ name: 'Word Belgesi', extensions: ['docx'] }]
    });
    if (saveResult.canceled || !saveResult.filePath) return { ok: false, canceled: true };
    const targetPath = /\.docx$/i.test(saveResult.filePath)
      ? saveResult.filePath
      : (saveResult.filePath + '.docx');
    const exportHTML = buildExportHTML(options);
    await convertExportHTMLWithOfficeComToDocx(exportHTML, targetPath);
    const size = fs.existsSync(targetPath) ? fs.statSync(targetPath).size : 0;
    return { ok: true, filePath: targetPath, size };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

// â”€â”€ IPC: SYNC SETTINGS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('sync:getSettings', async () => {
  return storage.getSyncSettings();
});

ipcMain.handle('sync:setSyncDir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Sync Klasoru Sec (OneDrive, Proton Drive, Google Drive vb.)',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) return { ok: false };
  try {
    return storage.setSyncDir(result.filePaths[0]);
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('sync:clearSyncDir', async () => {
  return storage.clearSyncDir();
});

// â”€â”€ IPC: BROWSER CAPTURE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('browserCapture:getStatus', async () => {
  await refreshBrowserCaptureSettings();
  await refreshCaptureAgentStatusSnapshot();
  return browserCaptureStatus({
    activeWorkspaceId: getCaptureTargets().activeWorkspaceId || ''
  });
});

ipcMain.handle('browserCapture:prepareSetup', async () => {
  return runBrowserCaptureLifecycle('install');
});

ipcMain.handle('browserCapture:runAction', async (_ev, action = 'install') => {
  return runBrowserCaptureLifecycle(action);
});

ipcMain.handle('browserCapture:testConnection', async () => {
  return runBrowserCaptureLifecycle('test');
});

ipcMain.handle('browserCapture:lookup', async (_ev, payload = {}) => {
  return buildCaptureLookup(payload);
});

ipcMain.handle('browserCapture:openInstallDir', async () => {
  const settings = getBrowserCaptureSettings();
  if (!settings.installDir) return { ok: false, error: 'Kurulum klasoru hazir degil' };
  const error = await shell.openPath(settings.installDir);
  return error ? { ok: false, error } : { ok: true };
});

ipcMain.handle('browserCapture:openGuide', async () => {
  const settings = getBrowserCaptureSettings();
  if (!settings.guidePath) return { ok: false, error: 'Kurulum rehberi hazir degil' };
  const error = await shell.openPath(settings.guidePath);
  return error ? { ok: false, error } : { ok: true };
});

ipcMain.handle('browserCapture:updatePrefs', async (_ev, prefs = {}) => {
  const safe = {};
  if (prefs && typeof prefs === 'object' && typeof prefs.autoAttachPdfUrl !== 'undefined') {
    safe.autoAttachPdfUrl = !!prefs.autoAttachPdfUrl;
  }
  if (prefs && typeof prefs === 'object' && typeof prefs.focusImportedWorkspace !== 'undefined') {
    safe.focusImportedWorkspace = !!prefs.focusImportedWorkspace;
  }
  if (prefs && typeof prefs === 'object' && prefs.lastUsedWorkspaceId != null) {
    safe.lastUsedWorkspaceId = safeId(prefs.lastUsedWorkspaceId);
  }
  if (prefs && typeof prefs === 'object' && prefs.lastUsedComparisonId != null) {
    safe.lastUsedComparisonId = safeId(prefs.lastUsedComparisonId);
  }
  if (prefs && typeof prefs === 'object' && typeof prefs.setupPromptSeen !== 'undefined') {
    safe.setupPromptSeen = !!prefs.setupPromptSeen;
  }
  if (prefs && typeof prefs === 'object' && typeof prefs.agentAutoStart !== 'undefined') {
    const loginItemState = syncCaptureAgentLoginItem(!!prefs.agentAutoStart);
    safe.agentAutoStartSupported = !!loginItemState.supported;
    safe.agentAutoStart = loginItemState.supported ? !!loginItemState.enabled : !!prefs.agentAutoStart;
    if (safe.agentAutoStart) {
      try { await ensureCaptureAgentRunning(); } catch (_e) {}
    }
  }
  storage.setBrowserCaptureSettings(safe);
  return Object.assign({ ok: true }, browserCaptureStatus());
});

ipcMain.handle('browserCapture:createWorkspace', async (_ev, name = '') => {
  return createWorkspaceFromMain(name);
});

ipcMain.handle('browserCapture:rendererReady', async () => {
  browserCaptureRuntime.ready = true;
  processCaptureQueueFromApp('renderer-ready').catch(() => {});
  flushPendingBrowserCaptures();
  scheduleBrowserCaptureFlush(100);
  return { ok: true };
});

ipcMain.handle('browserCapture:ackPayload', async (_ev, queueId = '') => {
  return acknowledgePendingCapture(queueId);
});

// â”€â”€ IPC: APP INFO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const UPDATE_URL = 'https://api.github.com/repos/cyrenard/academiq-research/releases/latest';

ipcMain.handle('app:getInfo', async () => {
  return storage.getAppInfo(APP_VERSION);
});

ipcMain.handle('docHistory:get', async (_event, docId, limit = 20) => {
  return storage.getDocumentHistory(docId, limit);
});

ipcMain.handle('docHistory:restore', async (_event, docId, snapshotId) => {
  const result = storage.restoreDocumentHistorySnapshot(docId, snapshotId);
  latestStateJSON = '';
  return result;
});

// â”€â”€ IPC: AUTO-UPDATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('update:check', async () => {
  const checkUrl = storage.getSettingsSnapshot().updateUrl || UPDATE_URL;
  try {
    const data = await fetchJSON(checkUrl, {
      blockPrivate: true,
      allowedHosts: UPDATE_ALLOWED_HOSTS
    });
    return buildUpdateCheckResult(data, APP_VERSION);
  } catch (e) {
    return { available: false, current: APP_VERSION, error: e.message };
  }
});

ipcMain.handle('update:download', async (_ev, origUrl) => {
  try {
    if (!origUrl) return { ok: false, error: 'No URL' };
    if (!/^https:\/\/(raw\.githubusercontent\.com\/cyrenard|github\.com\/cyrenard|api\.github\.com\/repos\/cyrenard)\//i.test(origUrl)) {
      return { ok: false, error: 'Güncelleme yalnızca github.com/cyrenard adresinden yapılabilir' };
    }
    const url = normalizeDownloadUrl(origUrl);
    console.log('[UPDATE] Downloading from:', url, '(original:', origUrl, ')');
    const buf = await followRedirects(url, 8, {
      blockPrivate: true,
      allowedHosts: UPDATE_ALLOWED_HOSTS,
      maxBytes: 200 * 1024 * 1024,
      timeout: 45000
    });
    if (!buf || buf.length < 100) return { ok: false, error: 'Empty download (' + (buf ? buf.length : 0) + ' bytes)' };
    return applyDownloadedUpdate({
      appDir: APP_DIR,
      dirname: __dirname,
      url,
      buffer: buf,
      appVersion: APP_VERSION,
      isPackaged: app.isPackaged,
      fetchBuffer: followRedirects
    });
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('update:setUrl', async (_ev, url) => {
  if (url && !/^https:\/\/api\.github\.com\//i.test(url)) {
    return { ok: false, error: 'Güncelleme URL\'si https://api.github.com/ ile başlamalı' };
  }
  return storage.setUpdateUrl(url);
});

ipcMain.handle('update:restart', async () => {
  app.relaunch();
  app.exit(0);
});

// ── Local OCR (Tesseract.js) ────────────────────────────────────────────
// Runs entirely on-device. No external API calls, no API keys, no telemetry.

function ocrSanitizeRecognizePayload(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  if (typeof raw.imageDataUrl === 'string') out.imageDataUrl = raw.imageDataUrl.length > 20 * 1024 * 1024 ? raw.imageDataUrl.slice(0, 20 * 1024 * 1024) : raw.imageDataUrl;
  if (typeof raw.lang === 'string') out.lang = raw.lang.slice(0, 32);
  if (Number.isFinite(Number(raw.page))) out.page = Math.max(1, Math.floor(Number(raw.page)));
  return out;
}

ipcMain.handle('ocr:recognize', async (_ev, payload) => {
  try {
    const p = ocrSanitizeRecognizePayload(payload);
    if (!p.imageDataUrl) return { ok: false, code: 'OCR_NO_IMAGE', message: 'Resim verisi yok' };
    return await localOcr.recognize({ imageDataUrl: p.imageDataUrl, lang: p.lang });
  } catch (e) {
    return { ok: false, code: e && e.code ? e.code : 'OCR_ERROR', message: e && e.message ? e.message : 'OCR hatasi' };
  }
});

// Dispose OCR worker on app quit to avoid dangling native threads.
app.on('will-quit', () => {
  try { if (localOcr && typeof localOcr.dispose === 'function') localOcr.dispose(); } catch (_e) {}
});
