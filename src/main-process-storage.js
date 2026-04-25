const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const MAX_DATA_JSON_BYTES = 50 * 1024 * 1024;
const MAX_PDF_BYTES = 120 * 1024 * 1024;
const MAX_DOC_HISTORY_ENTRIES = 30;
const DOC_HISTORY_INTERVAL_MS = 90 * 1000;
const DOC_HISTORY_MIN_CHAR_DELTA = 120;

function createStorageService(options) {
  const appDir = options.appDir;
  const settingsFile = path.join(appDir, 'settings.json');
  const captureQueueFile = path.join(appDir, 'capture-queue.json');
  const captureTargetsFile = path.join(appDir, 'capture-targets.json');
  const captureAgentStateFile = path.join(appDir, 'capture-agent-state.json');
  const sessionStateFile = path.join(appDir, 'session-state.json');
  const editorDraftFile = path.join(appDir, 'editor-draft.json');
  const localPdfDir = path.join(appDir, 'pdfs');
  const workspacesRoot = path.join(appDir, 'workspaces');
  let settings = { syncDir: '', theme: '', browserCapture: {} };

  // refId -> { wsId, wsName } cache, rebuilt on each saveData()
  let refWsIndex = Object.create(null);
  let refWsIndexBuiltFromDisk = false;

  ensureDir(appDir);
  ensureDir(localPdfDir);
  ensureDir(workspacesRoot);

  function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  function buildPdfFileName(refId) {
    const raw = normalizeRefId(refId);
    const base = (raw || 'ref')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'ref';
    const trimmed = base.length > 80 ? base.slice(0, 80) : base;
    const hash = crypto.createHash('sha1').update(raw).digest('hex').slice(0, 10);
    return `${trimmed}__${hash}.pdf`;
  }

  // ── Workspace-scoped PDF directory ─────────────────────────────────────
  // Folder layout: <workspacesRoot>/AcademiQ-<sanitizedName>-<shortId>/pdfs/
  // shortId = first 6 chars of sha1(wsId) — stable across workspace renames
  function sanitizeWorkspaceNamePart(name) {
    const raw = String(name || '').trim();
    if (!raw) return 'workspace';
    return raw
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/[\s.]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40) || 'workspace';
  }

  function buildWorkspaceFolderName(ws) {
    if (!ws || !ws.id) return '';
    const wsId = String(ws.id).trim();
    if (!wsId) return '';
    const namePart = sanitizeWorkspaceNamePart(ws.name || '');
    const shortId = crypto.createHash('sha1').update(wsId).digest('hex').slice(0, 6);
    return `AcademiQ-${namePart}-${shortId}`;
  }

  function getWorkspacePdfDir(ws, options) {
    const folder = buildWorkspaceFolderName(ws);
    if (!folder) return null;
    const dir = path.join(workspacesRoot, folder, 'pdfs');
    if (!options || options.ensure !== false) ensureDir(dir);
    return dir;
  }

  function getWorkspaceSyncPdfDir(ws, options) {
    if (!settings.syncDir) return null;
    const folder = buildWorkspaceFolderName(ws);
    if (!folder) return null;
    const dir = path.join(settings.syncDir, 'AcademiQ', 'workspaces', folder, 'pdfs');
    if (!options || options.ensure !== false) ensureDir(dir);
    return dir;
  }

  function rebuildRefWsIndex(parsedState) {
    const state = parsedState && typeof parsedState === 'object' ? parsedState : {};
    const wss = Array.isArray(state.wss) ? state.wss : [];
    const wsById = Object.create(null);
    wss.forEach((w) => {
      if (w && w.id) wsById[String(w.id)] = { id: String(w.id), name: String(w.name || '') };
    });
    const next = Object.create(null);
    wss.forEach((ws) => {
      if (!ws || !ws.id) return;
      const lib = Array.isArray(ws.lib) ? ws.lib : [];
      lib.forEach((ref) => {
        if (!ref || !ref.id) return;
        const wsInfo = wsById[String(ref.wsId || ws.id)] || wsById[String(ws.id)];
        if (wsInfo) next[String(ref.id)] = { id: wsInfo.id, name: wsInfo.name };
      });
    });
    refWsIndex = next;
    refWsIndexBuiltFromDisk = true;
  }

  function ensureRefWsIndex() {
    if (refWsIndexBuiltFromDisk) return;
    try {
      const raw = readTextFileSafe(getSyncDataPath());
      if (raw && isValidJsonText(raw)) rebuildRefWsIndex(JSON.parse(raw));
    } catch (_e) {}
    refWsIndexBuiltFromDisk = true;
  }

  function resolveWsForRef(refId) {
    const key = String(refId || '').trim();
    if (!key) return null;
    ensureRefWsIndex();
    const entry = refWsIndex[key];
    if (entry) return { id: entry.id, name: entry.name };
    return null;
  }

  function normalizeWsContext(ws) {
    if (!ws || typeof ws !== 'object') return null;
    const id = String(ws.id || '').trim();
    if (!id) return null;
    return { id, name: String(ws.name || '') };
  }

  function resolveWsContext(ws, refId) {
    return normalizeWsContext(ws) || resolveWsForRef(refId);
  }

  function resolvePdfPaths(dir, refId) {
    const normalizedRefId = normalizeRefId(refId);
    const safeName = buildPdfFileName(refId);
    const legacySafe = normalizedRefId.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\.\.+/g, '_') || 'ref';
    const legacyName = legacySafe + '.pdf';
    const safeResolved = path.resolve(path.join(dir, safeName));
    const legacyResolved = path.resolve(path.join(dir, legacyName));
    const dirResolved = path.resolve(dir);
    return {
      safe: safeResolved.startsWith(dirResolved) ? safeResolved : path.join(dir, 'ref__invalid.pdf'),
      legacy: legacyResolved.startsWith(dirResolved) ? legacyResolved : path.join(dir, 'ref__invalid_legacy.pdf')
    };
  }

  function normalizeRefId(refId) {
    const value = String(refId || '').trim();
    if (!value) throw new Error('Geçersiz referans kimliği');
    if (value.length > 320) throw new Error('Referans kimliği çok uzun');
    return value;
  }

  function ensurePDFBuffer(buffer) {
    const buf = Buffer.from(buffer || []);
    if (!buf.length) throw new Error('PDF verisi boş');
    if (buf.length > MAX_PDF_BYTES) throw new Error('PDF boyutu sınırı aşıldı');
    return buf;
  }

  function normalizeSyncDir(dirPath) {
    const raw = String(dirPath || '').trim();
    if (!raw) throw new Error('Geçersiz sync klasörü');
    const resolved = path.resolve(raw);
    if (!fs.existsSync(resolved)) throw new Error('Sync klasörü bulunamadı');
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) throw new Error('Sync klasörü bir dizin olmalı');
    return resolved;
  }

  function loadSettings() {
    try {
      if (fs.existsSync(settingsFile)) {
        settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      }
    } catch (e) {
      console.warn('Settings load error:', e);
    }
    if (!settings || typeof settings !== 'object') settings = { syncDir: '', theme: '', browserCapture: {} };
    if (!settings.browserCapture || typeof settings.browserCapture !== 'object') settings.browserCapture = {};
    return settings;
  }

  function saveSettings() {
    try { fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2)); } catch (e) {}
  }

  function getSettingsSnapshot() {
    return JSON.parse(JSON.stringify(settings || {}));
  }

  function writeJsonAtomic(filePath, value) {
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value == null ? {} : value, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  }

  function readJsonFileSafe(filePath, fallbackValue) {
    try {
      if (!fs.existsSync(filePath)) return fallbackValue;
      const raw = fs.readFileSync(filePath, 'utf8');
      if (!raw || !raw.trim()) return fallbackValue;
      return JSON.parse(raw);
    } catch (_e) {
      return fallbackValue;
    }
  }

  function readTextFileSafe(filePath) {
    try {
      if (!fs.existsSync(filePath)) return '';
      return String(fs.readFileSync(filePath, 'utf8') || '');
    } catch (_e) {
      return '';
    }
  }

  function isValidJsonText(text) {
    if (!text || !String(text).trim()) return false;
    try {
      JSON.parse(String(text));
      return true;
    } catch (_e) {
      return false;
    }
  }

  function readRecoveryPayload(filePath) {
    const raw = readJsonFileSafe(filePath, null);
    if (!raw || typeof raw !== 'object') return '';
    if (!raw.data || typeof raw.data !== 'object') return '';
    try {
      return JSON.stringify(raw.data);
    } catch (_e) {
      return '';
    }
  }

  function readRecoveryMeta(filePath) {
    const raw = readJsonFileSafe(filePath, null);
    if (!raw || typeof raw !== 'object') return null;
    const meta = {
      version: Number(raw.version) || 1,
      updatedAt: Number(raw.updatedAt) || 0,
      source: raw.source ? String(raw.source) : 'autosave'
    };
    if (!meta.updatedAt) return null;
    return meta;
  }

  function readEditorDraft() {
    const raw = readJsonFileSafe(editorDraftFile, null);
    if (!raw || typeof raw !== 'object') return null;
    const updatedAt = Number(raw.updatedAt) || 0;
    if (!updatedAt || !raw.data || typeof raw.data !== 'object') return null;
    try {
      const json = JSON.stringify(raw.data);
      if (!isValidJsonText(json)) return null;
      return {
        version: Number(raw.version) || 1,
        updatedAt,
        source: raw.source ? String(raw.source) : 'editor-draft',
        data: json
      };
    } catch (_e) {
      return null;
    }
  }

  function getEditorDraftSummary() {
    const session = loadSessionState();
    const lastSavedAt = Number(session.lastSavedAt) || 0;
    let stat = null;
    try {
      stat = fs.existsSync(editorDraftFile) ? fs.statSync(editorDraftFile) : null;
    } catch (_e) {
      stat = null;
    }
    if (!stat) {
      return {
        exists: false,
        valid: false,
        updatedAt: 0,
        sizeBytes: 0,
        source: '',
        isNewerThanLastSave: false,
        recoverableAfterUncleanShutdown: false
      };
    }
    const draft = readEditorDraft();
    const summary = {
      exists: true,
      valid: !!draft,
      updatedAt: draft ? Number(draft.updatedAt || 0) : 0,
      sizeBytes: Number(stat.size) || 0,
      source: draft ? String(draft.source || 'editor-draft') : '',
      isNewerThanLastSave: !!(draft && Number(draft.updatedAt || 0) > lastSavedAt),
      recoverableAfterUncleanShutdown: !!(session.previousCleanExit === false && draft && Number(draft.updatedAt || 0) > lastSavedAt)
    };
    if (!draft) summary.invalidReason = 'Draft dosyasi okunamadi veya gecersiz.';
    return summary;
  }

  function clearEditorDraft() {
    try {
      if (fs.existsSync(editorDraftFile)) fs.unlinkSync(editorDraftFile);
    } catch (_e) {}
    return { ok: true };
  }

  function getDataPaths() {
    const dataFile = getSyncDataPath();
    return {
      dataFile,
      backupFile: dataFile + '.bak',
      recoveryFile: dataFile + '.recovery.json'
    };
  }

  function getSyncDataPath() {
    if (settings.syncDir) {
      const dir = path.join(settings.syncDir, 'AcademiQ');
      ensureDir(dir);
      return path.join(dir, 'academiq-data.json');
    }
    return path.join(appDir, 'academiq-data.json');
  }

  function getSyncPDFDir() {
    if (settings.syncDir) {
      const dir = path.join(settings.syncDir, 'AcademiQ', 'pdfs');
      ensureDir(dir);
      return dir;
    }
    return localPdfDir;
  }

  function getDocumentHistoryPath() {
    if (settings.syncDir) {
      const dir = path.join(settings.syncDir, 'AcademiQ');
      ensureDir(dir);
      return path.join(dir, 'document-history.json');
    }
    return path.join(appDir, 'document-history.json');
  }

  function loadSessionState() {
    const data = readJsonFileSafe(sessionStateFile, {});
    return data && typeof data === 'object' ? data : {};
  }

  function saveSessionState(patch) {
    const current = loadSessionState();
    const next = Object.assign({}, current, patch && typeof patch === 'object' ? patch : {}, {
      updatedAt: Date.now()
    });
    writeJsonAtomic(sessionStateFile, next);
    return next;
  }

  function markSessionOpen(meta) {
    const current = loadSessionState();
    return saveSessionState(Object.assign({
      previousCleanExit: current.cleanExit !== false,
      cleanExit: false,
      launchedAt: Date.now()
    }, meta && typeof meta === 'object' ? meta : {}));
  }

  function markSessionClosed(meta) {
    return saveSessionState(Object.assign({
      previousCleanExit: true,
      cleanExit: true,
      closedAt: Date.now()
    }, meta && typeof meta === 'object' ? meta : {}));
  }

  function stripHtmlToText(html) {
    return String(html || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function summarizeDocHTML(html, maxLen) {
    const text = stripHtmlToText(html);
    if (!text) return '';
    const limit = Number(maxLen) > 0 ? Number(maxLen) : 220;
    if (text.length <= limit) return text;
    return text.slice(0, limit).trim() + '…';
  }

  function countWords(text) {
    return String(text || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .length;
  }

  function normalizeHistoryStore(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const docs = src.docs && typeof src.docs === 'object' ? src.docs : {};
    const normalizedDocs = {};
    Object.keys(docs).forEach((docId) => {
      const entry = docs[docId] && typeof docs[docId] === 'object' ? docs[docId] : {};
      const snapshots = Array.isArray(entry.snapshots) ? entry.snapshots : [];
      normalizedDocs[String(docId)] = {
        docId: String(docId),
        docName: String(entry.docName || ''),
        updatedAt: Number(entry.updatedAt) > 0 ? Number(entry.updatedAt) : 0,
        snapshots: snapshots
          .filter((snapshot) => snapshot && typeof snapshot === 'object' && snapshot.id && snapshot.content)
          .map((snapshot) => ({
            id: String(snapshot.id),
            createdAt: Number(snapshot.createdAt) > 0 ? Number(snapshot.createdAt) : Date.now(),
            docName: String(snapshot.docName || ''),
            content: String(snapshot.content || ''),
            excerpt: String(snapshot.excerpt || ''),
            wordCount: Number(snapshot.wordCount) > 0 ? Number(snapshot.wordCount) : 0,
            charCount: Number(snapshot.charCount) > 0 ? Number(snapshot.charCount) : String(snapshot.content || '').length,
            contentHash: String(snapshot.contentHash || ''),
            source: String(snapshot.source || 'autosave')
          }))
          .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
          .slice(0, MAX_DOC_HISTORY_ENTRIES)
      };
    });
    return {
      version: 1,
      updatedAt: Number(src.updatedAt) > 0 ? Number(src.updatedAt) : 0,
      docs: normalizedDocs
    };
  }

  function loadDocumentHistoryStore() {
    return normalizeHistoryStore(readJsonFileSafe(getDocumentHistoryPath(), { version: 1, docs: {} }));
  }

  function saveDocumentHistoryStore(store) {
    const normalized = normalizeHistoryStore(store);
    normalized.updatedAt = Date.now();
    writeJsonAtomic(getDocumentHistoryPath(), normalized);
    return normalized;
  }

  function buildDocumentSnapshot(doc, source, now) {
    const content = String(doc && doc.content || '');
    const text = stripHtmlToText(content);
    return {
      id: 'ver-' + now + '-' + crypto.createHash('sha1').update(String(doc && doc.id || '') + ':' + String(now)).digest('hex').slice(0, 8),
      createdAt: now,
      docName: String(doc && doc.name || '').trim(),
      content,
      excerpt: summarizeDocHTML(content, 220),
      wordCount: countWords(text),
      charCount: text.length,
      contentHash: crypto.createHash('sha1').update(content).digest('hex'),
      source: String(source || 'autosave')
    };
  }

  function shouldStoreDocumentSnapshot(lastSnapshot, nextSnapshot, force) {
    if (force) return true;
    if (!lastSnapshot) return true;
    if (!nextSnapshot || !nextSnapshot.contentHash) return false;
    if (lastSnapshot.contentHash === nextSnapshot.contentHash) return false;
    const age = Number(nextSnapshot.createdAt || 0) - Number(lastSnapshot.createdAt || 0);
    const charDelta = Math.abs(Number(nextSnapshot.charCount || 0) - Number(lastSnapshot.charCount || 0));
    if (age >= DOC_HISTORY_INTERVAL_MS) return true;
    if (charDelta >= DOC_HISTORY_MIN_CHAR_DELTA) return true;
    if (String(nextSnapshot.docName || '') !== String(lastSnapshot.docName || '')) return true;
    return false;
  }

  function updateDocumentHistoryFromState(parsedState, options) {
    const state = parsedState && typeof parsedState === 'object' ? parsedState : {};
    const docs = Array.isArray(state.docs) ? state.docs : [];
    const now = Number(options && options.now) > 0 ? Number(options.now) : Date.now();
    const forceDocIds = Array.isArray(options && options.forceDocIds) ? options.forceDocIds.map(String) : [];
    const source = options && options.source ? String(options.source) : 'autosave';
    if (!docs.length) return loadDocumentHistoryStore();
    const store = loadDocumentHistoryStore();
    docs.forEach((doc) => {
      if (!doc || !doc.id) return;
      const docId = String(doc.id);
      const entry = store.docs[docId] && typeof store.docs[docId] === 'object'
        ? store.docs[docId]
        : { docId, docName: String(doc.name || ''), snapshots: [], updatedAt: 0 };
      const nextSnapshot = buildDocumentSnapshot(doc, source, now);
      const lastSnapshot = Array.isArray(entry.snapshots) && entry.snapshots.length ? entry.snapshots[0] : null;
      const force = forceDocIds.indexOf(docId) >= 0;
      entry.docId = docId;
      entry.docName = String(doc.name || '').trim();
      entry.updatedAt = now;
      entry.snapshots = Array.isArray(entry.snapshots) ? entry.snapshots : [];
      if (shouldStoreDocumentSnapshot(lastSnapshot, nextSnapshot, force)) {
        entry.snapshots.unshift(nextSnapshot);
        entry.snapshots = entry.snapshots
          .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
          .slice(0, MAX_DOC_HISTORY_ENTRIES);
      }
      store.docs[docId] = entry;
    });
    return saveDocumentHistoryStore(store);
  }

  function getDocumentHistory(docId, limit) {
    const store = loadDocumentHistoryStore();
    const key = String(docId || '').trim();
    const max = Number(limit) > 0 ? Number(limit) : MAX_DOC_HISTORY_ENTRIES;
    const entry = key && store.docs[key] ? store.docs[key] : null;
    return {
      ok: true,
      docId: key,
      docName: entry ? String(entry.docName || '') : '',
      snapshots: entry ? entry.snapshots.slice(0, max) : []
    };
  }

  function restoreDocumentHistorySnapshot(docId, snapshotId) {
    const key = String(docId || '').trim();
    const versionKey = String(snapshotId || '').trim();
    if (!key || !versionKey) throw new Error('Gecersiz belge gecmisi secimi');
    const history = loadDocumentHistoryStore();
    const entry = history.docs[key];
    if (!entry) throw new Error('Belge gecmisi bulunamadi');
    const snapshot = (entry.snapshots || []).find((item) => item && item.id === versionKey);
    if (!snapshot) throw new Error('Belge surumu bulunamadi');
    const loaded = loadData();
    if (!loaded || !loaded.ok || !loaded.data) throw new Error('Mevcut belge verisi yuklenemedi');
    let parsed;
    try {
      parsed = JSON.parse(loaded.data);
    } catch (_e) {
      throw new Error('Mevcut belge verisi gecersiz');
    }
    const docs = Array.isArray(parsed.docs) ? parsed.docs : [];
    const doc = docs.find((item) => item && String(item.id || '') === key);
    if (!doc) throw new Error('Belge kaydi bulunamadi');
    doc.content = String(snapshot.content || '');
    if (String(parsed.curDoc || '') === key) {
      parsed.doc = doc.content;
    }
    saveData(JSON.stringify(parsed), {
      source: 'restore',
      forceDocIds: [key]
    });
    return {
      ok: true,
      docId: key,
      snapshotId: versionKey,
      restoredAt: Date.now()
    };
  }

  function getDocumentHistorySummary() {
    const store = loadDocumentHistoryStore();
    let docCount = 0;
    let snapshotCount = 0;
    let latestSnapshotAt = 0;
    Object.keys(store.docs || {}).forEach((docId) => {
      const entry = store.docs[docId];
      const snapshots = Array.isArray(entry && entry.snapshots) ? entry.snapshots : [];
      if (!snapshots.length) return;
      docCount += 1;
      snapshotCount += snapshots.length;
      if (Number(snapshots[0].createdAt || 0) > latestSnapshotAt) {
        latestSnapshotAt = Number(snapshots[0].createdAt || 0);
      }
    });
    return {
      docCount,
      snapshotCount,
      latestSnapshotAt
    };
  }

  function loadData() {
    const paths = getDataPaths();
    const session = loadSessionState();
    const mainData = readTextFileSafe(paths.dataFile);
    const recoveryData = readRecoveryPayload(paths.recoveryFile);
    const recoveryMeta = readRecoveryMeta(paths.recoveryFile);
    const backupData = readTextFileSafe(paths.backupFile);
    const mainValid = isValidJsonText(mainData);
    const recoveryValid = isValidJsonText(recoveryData);
    const backupValid = isValidJsonText(backupData);
    const uncleanShutdown = session.previousCleanExit === false;
    const lastSavedAt = Number(session.lastSavedAt) || 0;
    const editorDraft = readEditorDraft();
    const draftIsNewer = !!(editorDraft && editorDraft.updatedAt > lastSavedAt);

    if (uncleanShutdown && draftIsNewer) {
      return {
        ok: true,
        data: editorDraft.data,
        dir: settings.syncDir || 'Yerel',
        uncleanShutdown,
        recoveredFromRecovery: false,
        recoveredFromDraft: true,
        restoredFromBackup: false,
        recoveryMeta: {
          version: editorDraft.version,
          updatedAt: editorDraft.updatedAt,
          source: editorDraft.source
        },
        lastSavedAt
      };
    }
    if (mainValid) {
      return {
        ok: true,
        data: mainData,
        dir: settings.syncDir || 'Yerel',
        uncleanShutdown,
        recoveredFromRecovery: false,
        recoveredFromDraft: false,
        restoredFromBackup: false,
        recoveryMeta,
        lastSavedAt
      };
    }
    if (recoveryValid) {
      return {
        ok: true,
        data: recoveryData,
        dir: settings.syncDir || 'Yerel',
        uncleanShutdown,
        recoveredFromRecovery: true,
        recoveredFromDraft: false,
        restoredFromBackup: false,
        recoveryMeta,
        lastSavedAt
      };
    }
    if (backupValid) {
      return {
        ok: true,
        data: backupData,
        dir: settings.syncDir || 'Yerel',
        uncleanShutdown,
        recoveredFromRecovery: false,
        recoveredFromDraft: false,
        restoredFromBackup: true,
        recoveryMeta,
        lastSavedAt
      };
    }
    return {
      ok: true,
      data: null,
      dir: settings.syncDir || 'Yerel',
      uncleanShutdown,
      recoveredFromRecovery: false,
      recoveredFromDraft: false,
      restoredFromBackup: false,
      recoveryMeta,
      lastSavedAt
    };
  }

  function saveData(json, options) {
    if (typeof json !== 'string') throw new Error('Kaydedilecek veri metin olmalı');
    if (Buffer.byteLength(json, 'utf8') > MAX_DATA_JSON_BYTES) throw new Error('Veri boyutu sınırı aşıldı');
    if (!isValidJsonText(json)) throw new Error('Kaydedilecek veri geçerli JSON olmalı');
    const parsed = JSON.parse(json);
    const paths = getDataPaths();
    const tmp = paths.dataFile + '.tmp';
    writeJsonAtomic(paths.recoveryFile, {
      version: 1,
      updatedAt: Date.now(),
      source: 'autosave',
      data: parsed
    });
    if (fs.existsSync(paths.dataFile)) {
      try { fs.copyFileSync(paths.dataFile, paths.backupFile); } catch (e) {}
    }
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, paths.dataFile);
    try {
      updateDocumentHistoryFromState(parsed, {
        source: options && options.source ? options.source : 'autosave',
        forceDocIds: options && Array.isArray(options.forceDocIds) ? options.forceDocIds : []
      });
    } catch (_e) {}
    try { rebuildRefWsIndex(parsed); } catch (_e) {}
    saveSessionState({
      lastSavedAt: Date.now(),
      lastSaveError: '',
      cleanExit: false
    });
    clearEditorDraft();
    return { ok: true, savedAt: Date.now(), recoveryPath: paths.recoveryFile };
  }

  function saveEditorDraft(json, options) {
    if (typeof json !== 'string') throw new Error('Kaydedilecek draft metin olmalı');
    if (Buffer.byteLength(json, 'utf8') > MAX_DATA_JSON_BYTES) throw new Error('Draft boyutu sınırı aşıldı');
    if (!isValidJsonText(json)) throw new Error('Draft geçerli JSON olmalı');
    const parsed = JSON.parse(json);
    const now = Date.now();
    writeJsonAtomic(editorDraftFile, {
      version: 1,
      updatedAt: now,
      source: options && options.source ? String(options.source) : 'editor-draft',
      data: parsed
    });
    saveSessionState({
      lastDraftAt: now,
      cleanExit: false
    });
    return { ok: true, savedAt: now, draftPath: editorDraftFile };
  }

  // ── Workspace-aware candidate paths ────────────────────────────────────
  // Returns an ordered list of {dir, tier} where each tier is tried in order.
  // tier: 'ws' (preferred), 'ws-sync', 'legacy-local', 'legacy-sync'
  function pdfCandidateDirs(ws, refId, mode) {
    const list = [];
    const wsCtx = ws || resolveWsForRef(refId);
    if (wsCtx) {
      const d = mode === 'write'
        ? getWorkspacePdfDir(wsCtx, { ensure: true })
        : getWorkspacePdfDir(wsCtx, { ensure: false });
      if (d) list.push({ dir: d, tier: 'ws' });
    }
    list.push({ dir: localPdfDir, tier: 'legacy-local' });
    if (wsCtx && settings.syncDir) {
      const d = mode === 'write'
        ? getWorkspaceSyncPdfDir(wsCtx, { ensure: true })
        : getWorkspaceSyncPdfDir(wsCtx, { ensure: false });
      if (d) list.push({ dir: d, tier: 'ws-sync' });
    }
    if (settings.syncDir) {
      list.push({ dir: getSyncPDFDir(), tier: 'legacy-sync' });
    }
    return list;
  }

  function savePDF(refId, buffer, ws) {
    normalizeRefId(refId);
    const buf = ensurePDFBuffer(buffer);
    const wsCtx = resolveWsContext(ws, refId);
    // Primary target: workspace folder (if we can resolve a workspace)
    let primaryDir = localPdfDir;
    let primaryTier = 'legacy-local';
    if (wsCtx) {
      const wsDir = getWorkspacePdfDir(wsCtx, { ensure: true });
      if (wsDir) { primaryDir = wsDir; primaryTier = 'ws'; }
    }
    const primaryPaths = resolvePdfPaths(primaryDir, refId);
    fs.writeFileSync(primaryPaths.safe, buf);
    // Remove any stale copy in the flat legacy dir once we've written into a workspace folder
    if (primaryTier === 'ws') {
      try {
        const legacyPaths = resolvePdfPaths(localPdfDir, refId);
        if (fs.existsSync(legacyPaths.safe)) fs.unlinkSync(legacyPaths.safe);
        if (fs.existsSync(legacyPaths.legacy)) fs.unlinkSync(legacyPaths.legacy);
      } catch (_e) {}
    }
    // Sync: mirror into workspace sync dir when possible, fall back to legacy sync
    if (settings.syncDir) {
      try {
        let syncDir = null;
        if (wsCtx) syncDir = getWorkspaceSyncPdfDir(wsCtx, { ensure: true });
        if (!syncDir) syncDir = getSyncPDFDir();
        const syncPaths = resolvePdfPaths(syncDir, refId);
        fs.writeFileSync(syncPaths.safe, buf);
      } catch (e) { console.warn('Sync PDF write failed:', e.message); }
    }
    return { ok: true };
  }

  function loadPDF(refId, ws) {
    normalizeRefId(refId);
    const wsCtx = resolveWsContext(ws, refId);
    const candidates = pdfCandidateDirs(wsCtx, refId, 'read');
    let sawInvalid = false;
    for (const cand of candidates) {
      const paths = resolvePdfPaths(cand.dir, refId);
      const fp = fs.existsSync(paths.safe) ? paths.safe : (fs.existsSync(paths.legacy) ? paths.legacy : null);
      if (!fp) continue;
      try {
        const buf = ensurePDFBuffer(fs.readFileSync(fp));
        // Opportunistic migration: if found outside ws dir but we know ws, copy into ws dir
        if (wsCtx && cand.tier !== 'ws') {
          try {
            const wsDir = getWorkspacePdfDir(wsCtx, { ensure: true });
            if (wsDir) {
              const wsPaths = resolvePdfPaths(wsDir, refId);
              if (!fs.existsSync(wsPaths.safe)) fs.writeFileSync(wsPaths.safe, buf);
              // Clean up flat legacy copy after successful migration
              if (cand.tier === 'legacy-local') {
                try { fs.unlinkSync(fp); } catch (_e) {}
              }
            }
          } catch (_e) {}
        }
        return { ok: true, buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
      } catch (_e) {
        sawInvalid = true;
        try { fs.unlinkSync(fp); } catch (_err) {}
      }
    }
    return { ok: false, error: sawInvalid ? 'invalid pdf cache' : 'not found' };
  }

  function pdfExists(refId, ws) {
    normalizeRefId(refId);
    const wsCtx = resolveWsContext(ws, refId);
    const candidates = pdfCandidateDirs(wsCtx, refId, 'read');
    for (const cand of candidates) {
      const paths = resolvePdfPaths(cand.dir, refId);
      if (fs.existsSync(paths.safe) || fs.existsSync(paths.legacy)) return true;
    }
    return false;
  }

  function deletePDF(refId, ws) {
    normalizeRefId(refId);
    const wsCtx = resolveWsContext(ws, refId);
    const candidates = pdfCandidateDirs(wsCtx, refId, 'read');
    for (const cand of candidates) {
      const paths = resolvePdfPaths(cand.dir, refId);
      try { if (fs.existsSync(paths.safe)) fs.unlinkSync(paths.safe); } catch (_e) {}
      try { if (fs.existsSync(paths.legacy)) fs.unlinkSync(paths.legacy); } catch (_e) {}
    }
    return { ok: true };
  }

  // Returns the absolute path of the stored PDF for a given ref, or null if not found.
  // Used by the renderer "Open in File Explorer" action.
  function locatePdfPath(refId, ws) {
    normalizeRefId(refId);
    const wsCtx = resolveWsContext(ws, refId);
    const candidates = pdfCandidateDirs(wsCtx, refId, 'read');
    for (const cand of candidates) {
      const paths = resolvePdfPaths(cand.dir, refId);
      if (fs.existsSync(paths.safe)) return paths.safe;
      if (fs.existsSync(paths.legacy)) return paths.legacy;
    }
    return null;
  }

  // One-shot migration: scan the flat legacy pdfs/ dir and move each .pdf
  // into its workspace-scoped folder (based on the refId->ws index).
  // Files whose refId can't be matched to a workspace are left untouched
  // so they remain loadable via the legacy fallback path.
  function migrateLegacyPdfsToWorkspaces() {
    ensureRefWsIndex();
    if (!fs.existsSync(localPdfDir)) return { ok: true, migrated: 0, skipped: 0 };
    let files = [];
    try { files = fs.readdirSync(localPdfDir).filter((f) => f.toLowerCase().endsWith('.pdf')); }
    catch (_e) { return { ok: false, error: 'read legacy dir failed' }; }
    let migrated = 0;
    let skipped = 0;
    for (const file of files) {
      // Filename shape: "<sanitized-refId>__<hash>.pdf" (new) or "<refId>.pdf" (old)
      const base = file.slice(0, -4); // strip .pdf
      const underscoreIdx = base.lastIndexOf('__');
      const candidateRefIds = [];
      if (underscoreIdx > 0) candidateRefIds.push(base.slice(0, underscoreIdx));
      candidateRefIds.push(base);
      let matchedWs = null;
      let matchedRefId = null;
      for (const cand of candidateRefIds) {
        // Try direct match first, then try un-sanitizing common replacements
        const tryIds = [cand];
        if (cand.indexOf('_') >= 0) tryIds.push(cand.replace(/_/g, '/'));
        for (const tryId of tryIds) {
          const entry = refWsIndex[tryId];
          if (entry) { matchedWs = entry; matchedRefId = tryId; break; }
        }
        if (matchedWs) break;
      }
      if (!matchedWs) { skipped++; continue; }
      const srcPath = path.join(localPdfDir, file);
      try {
        const wsDir = getWorkspacePdfDir(matchedWs, { ensure: true });
        if (!wsDir) { skipped++; continue; }
        const targetPaths = resolvePdfPaths(wsDir, matchedRefId);
        // Don't overwrite if target already exists with same content — just drop the legacy one
        if (fs.existsSync(targetPaths.safe)) {
          try { fs.unlinkSync(srcPath); } catch (_e) {}
          migrated++;
          continue;
        }
        // Prefer rename (atomic when on same volume), fall back to copy+delete
        try {
          fs.renameSync(srcPath, targetPaths.safe);
        } catch (_e) {
          const buf = fs.readFileSync(srcPath);
          fs.writeFileSync(targetPaths.safe, buf);
          try { fs.unlinkSync(srcPath); } catch (_err) {}
        }
        migrated++;
      } catch (e) {
        console.warn('PDF migration failed for', file, e && e.message);
        skipped++;
      }
    }
    return { ok: true, migrated, skipped };
  }

  // Recursively removes a workspace's PDF folder (local + sync).
  function deleteWorkspacePdfFolder(ws) {
    const wsCtx = normalizeWsContext(ws);
    if (!wsCtx) return { ok: false, error: 'invalid workspace' };
    const removed = [];
    const folder = buildWorkspaceFolderName(wsCtx);
    if (!folder) return { ok: false, error: 'invalid folder' };
    const localWsRoot = path.join(workspacesRoot, folder);
    try {
      if (fs.existsSync(localWsRoot)) {
        fs.rmSync(localWsRoot, { recursive: true, force: true });
        removed.push(localWsRoot);
      }
    } catch (e) { console.warn('Workspace PDF folder delete failed (local):', e.message); }
    if (settings.syncDir) {
      const syncWsRoot = path.join(settings.syncDir, 'AcademiQ', 'workspaces', folder);
      try {
        if (fs.existsSync(syncWsRoot)) {
          fs.rmSync(syncWsRoot, { recursive: true, force: true });
          removed.push(syncWsRoot);
        }
      } catch (e) { console.warn('Workspace PDF folder delete failed (sync):', e.message); }
    }
    return { ok: true, removed };
  }

  function syncAllPDFs() {
    if (!settings.syncDir) return { ok: false, error: 'No sync dir' };
    const syncDir = getSyncPDFDir();
    let copied = 0;
    const syncFiles = fs.existsSync(syncDir) ? fs.readdirSync(syncDir).filter(file => file.endsWith('.pdf')) : [];
    for (const file of syncFiles) {
      const localFp = path.join(localPdfDir, file);
      if (!fs.existsSync(localFp)) {
        fs.copyFileSync(path.join(syncDir, file), localFp);
        copied++;
      }
    }
    const localFiles = fs.readdirSync(localPdfDir).filter(file => file.endsWith('.pdf'));
    for (const file of localFiles) {
      const syncFp = path.join(syncDir, file);
      if (!fs.existsSync(syncFp)) {
        fs.copyFileSync(path.join(localPdfDir, file), syncFp);
        copied++;
      }
    }
    return { ok: true, copied };
  }

  function getSyncSettings() {
    return { syncDir: settings.syncDir || '' };
  }

  function setSyncDir(dirPath) {
    const resolvedDir = normalizeSyncDir(dirPath);
    const oldPath = getSyncDataPath();
    settings.syncDir = resolvedDir;
    saveSettings();
    const newPath = getSyncDataPath();
    if (oldPath !== newPath) {
      const localExists = fs.existsSync(oldPath);
      const syncExists = fs.existsSync(newPath);
      if (localExists && !syncExists) {
        try { fs.copyFileSync(oldPath, newPath); } catch (e) {}
      } else if (syncExists && !localExists) {
        try { fs.copyFileSync(newPath, oldPath); } catch (e) {}
      } else if (localExists && syncExists) {
        try {
          const localStat = fs.statSync(oldPath);
          const syncStat = fs.statSync(newPath);
          if (localStat.mtimeMs > syncStat.mtimeMs) {
            fs.copyFileSync(newPath, newPath + '.bak');
            fs.copyFileSync(oldPath, newPath);
          } else {
            fs.copyFileSync(oldPath, oldPath + '.bak');
            fs.copyFileSync(newPath, oldPath);
          }
        } catch (e) {}
      }
    }
    try { syncAllPDFs(); } catch (e) { console.warn('PDF sync error:', e.message); }
    return { ok: true, dir: settings.syncDir };
  }

  function clearSyncDir() {
    settings.syncDir = '';
    saveSettings();
    return { ok: true };
  }

  function setUpdateUrl(url) {
    settings.updateUrl = url || '';
    saveSettings();
    return { ok: true };
  }

  function getBrowserCaptureSettings() {
    return Object.assign({}, settings.browserCapture || {});
  }

  function setBrowserCaptureSettings(patch) {
    const source = patch && typeof patch === 'object' ? patch : {};
    settings.browserCapture = Object.assign({}, settings.browserCapture || {}, source);
    saveSettings();
    return { ok: true, browserCapture: getBrowserCaptureSettings() };
  }

  function getAppInfo(version) {
    const sessionState = loadSessionState();
    const documentHistory = getDocumentHistorySummary();
    const editorDraft = getEditorDraftSummary();
    return {
      version,
      appDir,
      syncDir: settings.syncDir || '',
      pdfDir: localPdfDir,
      pdfCount: (() => { try { return fs.readdirSync(localPdfDir).filter(f => f.endsWith('.pdf')).length; } catch(e) { return 0; } })(),
      sessionState,
      documentHistory,
      editorDraft
    };
  }

  function loadCaptureQueue() {
    const data = readJsonFileSafe(captureQueueFile, { items: [] });
    return data && Array.isArray(data.items) ? data : { items: [] };
  }

  function saveCaptureQueue(queueState) {
    const source = queueState && typeof queueState === 'object' ? queueState : {};
    const items = Array.isArray(source.items) ? source.items : [];
    writeJsonAtomic(captureQueueFile, {
      version: 1,
      updatedAt: Date.now(),
      items: items
    });
    return { ok: true };
  }

  function loadCaptureTargets() {
    const data = readJsonFileSafe(captureTargetsFile, { workspaces: [] });
    return data && Array.isArray(data.workspaces) ? data : { workspaces: [] };
  }

  function saveCaptureTargets(targets) {
    const source = targets && typeof targets === 'object' ? targets : {};
    writeJsonAtomic(captureTargetsFile, {
      version: 1,
      updatedAt: Date.now(),
      activeWorkspaceId: source.activeWorkspaceId || '',
      preferredWorkspaceId: source.preferredWorkspaceId || '',
      preferredComparisonId: source.preferredComparisonId || '',
      workspaces: Array.isArray(source.workspaces) ? source.workspaces : []
    });
    return { ok: true };
  }

  function loadCaptureAgentState() {
    const data = readJsonFileSafe(captureAgentStateFile, {});
    return data && typeof data === 'object' ? data : {};
  }

  function saveCaptureAgentState(agentState) {
    const source = agentState && typeof agentState === 'object' ? agentState : {};
    writeJsonAtomic(captureAgentStateFile, Object.assign({
      version: 1,
      updatedAt: Date.now()
    }, source));
    return { ok: true };
  }

  return {
    appDir,
    localPdfDir,
    loadSettings,
    saveSettings,
    getSettingsSnapshot,
    getSyncDataPath,
    getSyncPDFDir,
    getDocumentHistoryPath,
    loadData,
    saveData,
    saveEditorDraft,
    clearEditorDraft,
    getEditorDraftSummary,
    getDocumentHistory,
    restoreDocumentHistorySnapshot,
    savePDF,
    loadPDF,
    pdfExists,
    deletePDF,
    locatePdfPath,
    deleteWorkspacePdfFolder,
    migrateLegacyPdfsToWorkspaces,
    resolveWsForRef,
    rebuildRefWsIndex,
    buildWorkspaceFolderName,
    getWorkspacePdfDir,
    syncAllPDFs,
    getSyncSettings,
    setSyncDir,
    clearSyncDir,
    setUpdateUrl,
    getBrowserCaptureSettings,
    setBrowserCaptureSettings,
    getAppInfo,
    loadSessionState,
    saveSessionState,
    markSessionOpen,
    markSessionClosed,
    loadCaptureQueue,
    saveCaptureQueue,
    loadCaptureTargets,
    saveCaptureTargets,
    loadCaptureAgentState,
    saveCaptureAgentState
  };
}

module.exports = { createStorageService };
