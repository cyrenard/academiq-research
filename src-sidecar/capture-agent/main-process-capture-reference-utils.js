'use strict';

/**
 * Browser-capture reference utilities (pure-ish, no Electron deps).
 *
 * These functions translate a sanitized capture payload into a workspace
 * reference, merge fields between captured and existing refs, decide a
 * target workspace, and attach PDF metadata. Extracted from main.js to
 * keep the Electron host file focused on lifecycle/IPC only.
 *
 * Side effects: callers pass in `createId` to mint new reference ids, and
 * pass `AQWebRelatedPapers` / `AQLiteratureMatrixState` from the renderer
 * runtime globals (these are eval'd into the main process via the legacy
 * runtime bridge). The functions themselves perform no I/O.
 */

const { normalizeDoi, sanitizeCapturePayload } = require('./main-process-browser-capture');

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

function buildBrowserCaptureReference(payload, targetWorkspaceId, deps) {
  const { createId, AQWebRelatedPapers } = deps || {};
  if (typeof createId !== 'function') throw new Error('buildBrowserCaptureReference: createId required');
  if (!AQWebRelatedPapers || typeof AQWebRelatedPapers.buildWorkspaceReference !== 'function') {
    throw new Error('buildBrowserCaptureReference: AQWebRelatedPapers.buildWorkspaceReference required');
  }
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
    createId
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

function cloneReferenceForWorkspace(existingRef, candidateRef, targetWorkspaceId, deps) {
  const { createId } = deps || {};
  if (typeof createId !== 'function') throw new Error('cloneReferenceForWorkspace: createId required');
  const clone = JSON.parse(JSON.stringify(existingRef || {}));
  clone.id = createId();
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
  if (targetRef.pdfData) {
    targetRef.browserCaptureMeta.pdfCaptureStatus = 'downloaded';
    return { status: 'downloaded', detected: true, storedUrl: targetRef.pdfUrl || safePayload.pdfUrl };
  }
  if (targetRef.pdfUrl && String(targetRef.pdfUrl) !== String(safePayload.pdfUrl)) {
    targetRef.browserCaptureMeta.pdfCaptureStatus = 'already_present';
    return { status: 'already_present', detected: true, storedUrl: targetRef.pdfUrl || safePayload.pdfUrl };
  }
  targetRef.pdfUrl = safePayload.pdfUrl;
  targetRef.browserCaptureMeta.pdfCaptureStatus = 'url_stored';
  return { status: 'url_stored', detected: true, storedUrl: safePayload.pdfUrl };
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

function findEquivalentReferenceAcrossState(state, candidateRef, excludeWorkspaceId, deps) {
  const { AQWebRelatedPapers } = deps || {};
  if (!AQWebRelatedPapers || typeof AQWebRelatedPapers.findMatchInList !== 'function') return null;
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

function attachCaptureToComparison(state, workspaceId, reference, comparisonId, deps) {
  const { createId, AQLiteratureMatrixState } = deps || {};
  if (String(comparisonId || '') !== 'literature-matrix') {
    return { requested: !!comparisonId, applied: false, comparisonId: '' };
  }
  if (!(AQLiteratureMatrixState && typeof AQLiteratureMatrixState.ensureRowForReference === 'function')) {
    return { requested: true, applied: false, comparisonId: 'literature-matrix' };
  }
  if (typeof createId !== 'function') {
    return { requested: true, applied: false, comparisonId: 'literature-matrix' };
  }
  try {
    const result = AQLiteratureMatrixState.ensureRowForReference(state, workspaceId, reference, {
      uid: createId
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

module.exports = {
  normalizeCaptureReferenceType,
  normalizeCaptureReference,
  mergeCaptureReferenceFields,
  buildBrowserCaptureReference,
  cloneReferenceForWorkspace,
  applyBrowserCaptureMetaToReference,
  attachPdfUrlFromCapture,
  resolveCaptureTargetWorkspace,
  findEquivalentReferenceAcrossState,
  attachCaptureToComparison,
  buildBrowserCaptureImportMessage,
  buildCaptureQueueStats,
  buildCaptureQueueActivity
};
