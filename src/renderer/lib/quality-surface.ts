/**
 * Quality Surface — duplicate review + metadata-health fallback renderers
 *
 * Extracted from LegacyCompatibilityHost.tsx. These helpers maintain
 * the legacy "Duplicate Review" and "Metadata Health Center" modals
 * that the renderer pops open via #dupModal / #metaHealthModal when
 * the user hits "Duplicate Bul" or "Metadata Health" from the toolbar.
 *
 * Everything here is DOM-coupled (innerHTML / getElementById) and
 * mutates `window.S` via the legacy `save()` chain. The React side
 * just calls openQualitySurface() and renders a container; this module
 * fills the inner DOM and binds the action buttons.
 */
import type { MouseEvent } from 'react';
import { legacyWin } from './legacy-window';
import {
  showLegacyModal,
  escapeHtml,
  saveLegacyState
} from './legacy-dom-helpers';
import { mergeRefFields, normalizeRefRecord } from './reference-format';
import {
  appStore,
  selectCurrentWorkspace,
  selectCurrentWorkspaceId,
  selectNotes,
  selectReferenceById,
  selectWorkspaceLibrary
} from './app-store';

// ───────────────────────────────────────────────────────────────────────────
// Duplicate detection helpers
// ───────────────────────────────────────────────────────────────────────────

function dismissedDuplicateMap(): Record<string, boolean> {
  const win = legacyWin();
  const key = selectCurrentWorkspaceId(appStore.getState()) || 'default';
  if (!win.__aqDismissedDuplicateSignatures) win.__aqDismissedDuplicateSignatures = {};
  if (!win.__aqDismissedDuplicateSignatures[key]) win.__aqDismissedDuplicateSignatures[key] = {};
  return win.__aqDismissedDuplicateSignatures[key] as Record<string, boolean>;
}

function activeWorkspaceId(): string {
  return selectCurrentWorkspaceId(appStore.getState());
}

function activeWorkspace(): any | null {
  return selectCurrentWorkspace(appStore.getState());
}

function activeWorkspaceRefs(): any[] {
  return selectWorkspaceLibrary(appStore.getState());
}

function currentDuplicateGroups(): any[] {
  const win = legacyWin();
  const refs = activeWorkspaceRefs();
  const w = win as any;
  const legacyGroups = Array.isArray(w.duplicateReviewState?.groups) ? w.duplicateReviewState.groups : [];
  const detect = w.AQDuplicateDetection?.detectDuplicateGroups;
  const apiGroups = typeof detect === 'function'
    ? detect(refs, { workspaceId: activeWorkspaceId(), dismissedSignatures: dismissedDuplicateMap() }) || []
    : [];
  return legacyGroups.length ? legacyGroups : apiGroups;
}

function reasonLabel(code: string) {
  const labels: Record<string, string> = {
    doi_exact: 'DOI aynı',
    title_exact: 'Başlık aynı',
    author_year_similar_title: 'Yazar/yıl ve başlık benzer',
    pdf_signature: 'PDF aynı'
  };
  return labels[code] || code || 'benzer metadata';
}

// ───────────────────────────────────────────────────────────────────────────
// Duplicate review modal renderer
// ───────────────────────────────────────────────────────────────────────────

export function renderDuplicateReviewFallback() {
  const summaryEl = document.getElementById('dupSummary');
  const listEl = document.getElementById('dupGroups');
  if (!summaryEl || !listEl) return;
  const groups = currentDuplicateGroups();
  summaryEl.textContent = groups.length ? `${groups.length} duplicate grup bulundu` : 'Duplicate grup bulunamadı';
  if (!groups.length) {
    listEl.innerHTML = '<div class="aq-empty-note">Şüpheli duplicate bulunamadı.</div>';
    return;
  }
  listEl.innerHTML = groups.map((group: any) => {
    const records = Array.isArray(group.records) ? group.records : [];
    const reasons = (Array.isArray(group.reasons) ? group.reasons : []).map((reason: any) => reasonLabel(String(reason?.code || reason))).join(', ');
    const cards = records.map((ref: any) => {
      const authors = (Array.isArray(ref.authors) ? ref.authors : []).slice(0, 2).join('; ');
      return `<div class="dup-ref-card">
        <div class="dup-ref-title">${escapeHtml(ref.title || 'Başlıksız')}</div>
        <div class="dup-ref-meta"><b>Yazar:</b> ${escapeHtml(authors || '-')}</div>
        <div class="dup-ref-meta"><b>Yıl:</b> ${escapeHtml(ref.year || '-')}</div>
        <div class="dup-ref-meta"><b>Dergi:</b> ${escapeHtml(ref.journal || '-')}</div>
        <div class="dup-ref-meta"><b>DOI:</b> ${escapeHtml(ref.doi || '-')}</div>
      </div>`;
    }).join('');
    const signature = escapeHtml(group.signature || '');
    return `<div class="dup-group-card" data-dup-signature="${signature}">
      <div class="dup-head">Güven: ${Math.round(Number(group.confidence || 0) * 100)}% · ${escapeHtml(reasons || 'benzer metadata')}</div>
      <div class="dup-ref-grid">${cards}</div>
      <div class="mb">
        <button class="mbtn p" data-dup-action="merge" data-dup-signature="${signature}" onclick="window.__aqHandleDuplicateAction&&window.__aqHandleDuplicateAction(this);return false;">Birleştir</button>
        <button class="mbtn s" data-dup-action="keep" data-dup-signature="${signature}" onclick="window.__aqHandleDuplicateAction&&window.__aqHandleDuplicateAction(this);return false;">İkisini de Tut</button>
        <button class="mbtn s" data-dup-action="dismiss" data-dup-signature="${signature}" onclick="window.__aqHandleDuplicateAction&&window.__aqHandleDuplicateAction(this);return false;">Yoksay</button>
      </div>
    </div>`;
  }).join('');
  listEl.querySelectorAll<HTMLElement>('[data-dup-action]').forEach((button) => {
    button.onclick = (event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      runDuplicateAction(button);
      return false;
    };
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Metadata health modal renderer
// ───────────────────────────────────────────────────────────────────────────

export function renderMetadataHealthFallback() {
  const win = legacyWin();
  const w = win as any;
  const listEl = document.getElementById('metaHealthList');
  const sumEl = document.getElementById('metaHealthSummary');
  if (!listEl || !sumEl) return;
  const refs = activeWorkspaceRefs();
  const healthApi = w.AQMetadataHealth || {};
  const rows = refs.map((ref: any, idx: number) => ({
    idx,
    ref,
    report: typeof healthApi.analyzeReference === 'function'
      ? healthApi.analyzeReference(ref)
      : { status: 'complete', issues: [] }
  }));
  const summary = typeof healthApi.summarizeHealth === 'function'
    ? healthApi.summarizeHealth(refs)
    : { total: refs.length, complete: refs.length, incomplete: 0, suspicious: 0, issueCounts: {} };
  const counts: Record<string, number> = {
    All: Number(summary.total || refs.length || 0),
    Incomplete: Number(summary.incomplete || 0),
    Suspicious: Number(summary.suspicious || 0),
    Complete: Number(summary.complete || 0)
  };
  Object.entries(counts).forEach(([key, value]) => {
    const el = document.getElementById(`metaHealthCount${key}`);
    if (el) el.textContent = String(value);
  });
  const issueText = Object.entries(summary.issueCounts || {})
    .map(([code, count]) => `${code} ${count}`)
    .join(' · ');
  sumEl.textContent = `Toplam ${counts.All} · Tam ${counts.Complete} · Eksik ${counts.Incomplete} · Şüpheli ${counts.Suspicious}${issueText ? ` · ${issueText}` : ''}`;
  if (!rows.length) {
    listEl.innerHTML = '<div class="aq-empty-note">Kaynak bulunamadı.</div>';
    return;
  }
  listEl.innerHTML = rows.map((row: any) => {
    const ref = row.ref || {};
    const refIndex = Number.isFinite(row.idx) ? row.idx : -1;
    const report = row.report || { status: 'complete', issues: [] };
    const status = String(report.status || 'complete');
    const statusLabel = status === 'complete' ? 'Tam' : (status === 'incomplete' ? 'Eksik' : 'Şüpheli');
    const issues = Array.isArray(report.issues) ? report.issues : [];
    const issueHtml = issues.map((issue: any) => `<span class="mh-issue">${escapeHtml(issue.message || issue.code)}</span>`).join(' ');
    const authors = (Array.isArray(ref.authors) ? ref.authors : []).slice(0, 2).join('; ');
    return `<div class="mh-card" data-ref-id="${escapeHtml(ref.id || '')}" data-ref-index="${refIndex}">
      <div class="mh-card-head"><span class="mh-status mh-${escapeHtml(status)}">${statusLabel}</span><span class="mh-title">${escapeHtml(ref.title || 'Başlıksız')}</span></div>
      <div class="mh-meta">${escapeHtml(authors || 'Yazar yok')} · ${escapeHtml(ref.year || 'yıl yok')} · ${escapeHtml(ref.journal || 'dergi yok')}</div>
      <div class="mh-issues">${issueHtml || '<span class="mh-issue">Sorun yok</span>'}</div>
      <div class="mb">
        <button class="mbtn s" data-mh-action="edit" data-ref-id="${escapeHtml(ref.id || '')}" data-ref-index="${refIndex}" onclick="window.__aqHandleMetadataHealthAction&&window.__aqHandleMetadataHealthAction(this);return false;">Manuel Düzenle</button>
        <button class="mbtn s" data-mh-action="refetch" data-ref-id="${escapeHtml(ref.id || '')}" data-ref-index="${refIndex}" onclick="window.__aqHandleMetadataHealthAction&&window.__aqHandleMetadataHealthAction(this);return false;">DOI Yeniden Çek</button>
        <button class="mbtn p" data-mh-action="normalize" data-ref-id="${escapeHtml(ref.id || '')}" data-ref-index="${refIndex}" onclick="window.__aqHandleMetadataHealthAction&&window.__aqHandleMetadataHealthAction(this);return false;">Normalize Et</button>
      </div>
    </div>`;
  }).join('');
  listEl.querySelectorAll<HTMLElement>('[data-mh-action]').forEach((button) => {
    button.onclick = (event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      const w2 = legacyWin() as any;
      const action = String(button.getAttribute('data-mh-action') || '');
      const idx = Number(button.getAttribute('data-ref-index') || '-1');
      const rowRef = Number.isFinite(idx) && idx >= 0 ? (rows[idx]?.ref || null) : null;
      const ref = rowRef || runResolveRefFromButton(button);
      if (!ref) {
        try { if (typeof w2.setDst === 'function') w2.setDst('Kaynak bulunamadı.', 'er'); } catch (_error) {}
        return false;
      }
      try {
        if (action === 'edit') {
          if (typeof w2.hideM === 'function') w2.hideM('metaHealthModal');
          window.setTimeout(() => {
            try {
              if (typeof w2.editRefMetadata === 'function') w2.editRefMetadata(ref);
              else if (typeof w2.openReferenceEditor === 'function') w2.openReferenceEditor(ref);
            } catch (_error) {}
          }, 25);
          return false;
        }
        if (action === 'refetch') {
          if (!ref.doi || typeof w2.fetchCR !== 'function') {
            if (typeof w2.setDst === 'function') w2.setDst('DOI olmayan kaynakta yeniden çekme yapılamaz.', 'er');
            return false;
          }
          if (typeof w2.setDst === 'function') w2.setDst('Metadata DOI üzerinden güncelleniyor...', 'ld');
          w2.fetchCR(ref.doi, (err: unknown, fetched: unknown) => {
            if (err || !fetched) {
              if (typeof w2.setDst === 'function') w2.setDst('DOI metadata alınamadı.', 'er');
              return;
            }
            try {
              mergeRefFields(ref, fetched as any);
            } catch (_error) {
              if (typeof w2.mergeRefFields === 'function') w2.mergeRefFields(ref, fetched);
            }
            saveLegacyState();
            renderMetadataHealthFallback();
            if (typeof w2.setDst === 'function') w2.setDst('Metadata güncellendi.', 'ok');
          });
          return false;
        }
        if (action === 'normalize') {
          if (w2.AQMetadataHealth && typeof w2.AQMetadataHealth.applyConservativeRepairs === 'function') {
            const result = w2.AQMetadataHealth.applyConservativeRepairs(ref);
            if (result?.ref) Object.keys(result.ref).forEach((key) => { ref[key] = result.ref[key]; });
          }
          try {
            normalizeRefRecord(ref);
          } catch (_error) {
            if (typeof w2.normalizeRefRecord === 'function') w2.normalizeRefRecord(ref);
          }
          saveLegacyState();
          renderMetadataHealthFallback();
          if (typeof w2.setDst === 'function') w2.setDst('Kayıt normalize edildi.', 'ok');
          return false;
        }
      } catch (error) {
        console.error('[legacy-metadata-direct-action]', error);
      }
      runMetadataHealthAction(button);
      return false;
    };
  });
  filterMetadataHealth('all');
}

// ───────────────────────────────────────────────────────────────────────────
// Open / dispatch handlers
// ───────────────────────────────────────────────────────────────────────────

function runResolveRefFromButton(button: HTMLElement) {
  const refId = String(button.getAttribute('data-ref-id') || '');
  const refIndex = Number(button.getAttribute('data-ref-index') || '-1');
  const refByIndex = Number.isFinite(refIndex) && refIndex >= 0 ? (activeWorkspaceRefs()[refIndex] || null) : null;
  return findLegacyReference(refId) || refByIndex;
}

export function openQualitySurface(target: 'duplicate' | 'metadata') {
  const w = legacyWin() as any;
  if (target === 'duplicate') {
    try {
      if (typeof w.openDuplicateReview === 'function') w.openDuplicateReview();
    } catch (error) {
      console.error('[legacy-duplicate]', error);
    }
    showLegacyModal('dupModal');
    window.setTimeout(() => {
      try { if (typeof w.__bindSprint1PanelEvents === 'function') w.__bindSprint1PanelEvents(); } catch (_error) {}
      renderDuplicateReviewFallback();
    }, 0);
    return;
  }
  try {
    if (typeof w.openMetadataHealthCenter === 'function') w.openMetadataHealthCenter();
  } catch (error) {
    console.error('[legacy-metadata-health]', error);
  }
  showLegacyModal('metaHealthModal');
  window.setTimeout(() => {
    try { if (typeof w.__bindSprint1PanelEvents === 'function') w.__bindSprint1PanelEvents(); } catch (_error) {}
    renderMetadataHealthFallback();
  }, 0);
}

// ───────────────────────────────────────────────────────────────────────────
// Merge actions (used by duplicate action handler)
// ───────────────────────────────────────────────────────────────────────────

function mergeReferencesIntoPrimary(primary: any, secondary: any) {
  const w = legacyWin() as any;
  if (!primary || !secondary || primary === secondary) return primary;
  if (typeof w.AQDuplicateDetection?.mergeRecords === 'function') {
    w.AQDuplicateDetection.mergeRecords(primary, secondary);
  } else {
    [
      'title', 'year', 'journal', 'volume', 'issue', 'fp', 'lp', 'doi', 'url', 'pdfUrl', 'pdfPath',
      'publisher', 'edition', 'booktitle', 'location', 'language', 'abstract', 'note'
    ].forEach((field) => {
      if (!primary[field] && secondary[field]) primary[field] = secondary[field];
    });
    const authors = new Set([...(Array.isArray(primary.authors) ? primary.authors : []), ...(Array.isArray(secondary.authors) ? secondary.authors : [])].filter(Boolean));
    const labels = new Set([...(Array.isArray(primary.labels) ? primary.labels : []), ...(Array.isArray(secondary.labels) ? secondary.labels : [])].filter(Boolean));
    primary.authors = Array.from(authors);
    primary.labels = Array.from(labels);
  }
  try { normalizeRefRecord(primary); } catch (_error) {
    try { if (typeof w.normalizeRefRecord === 'function') w.normalizeRefRecord(primary); } catch (_fallbackError) {}
  }
  return primary;
}

function mergeDuplicateGroupFallback(signature: string) {
  const win = legacyWin();
  const w = win as any;
  const workspace = activeWorkspace();
  if (!workspace) return false;
  const groups = currentDuplicateGroups();
  const group = groups.find((item: any) => String(item?.signature || '') === signature);
  const ids = Array.isArray(group?.ids) ? group.ids : [];
  const records = ids
    .map((id: string) => (workspace.lib || []).find((ref: any) => ref && ref.id === id))
    .filter(Boolean);
  if (records.length < 2) return false;
  const primary = typeof w.AQDuplicateDetection?.pickPrimaryRecord === 'function'
    ? w.AQDuplicateDetection.pickPrimaryRecord(records)
    : records[0];
  const removeIds: Record<string, boolean> = {};
  records.forEach((ref: any) => {
    if (!ref || ref.id === primary.id) return;
    mergeReferencesIntoPrimary(primary, ref);
    removeIds[ref.id] = true;
  });
  workspace.lib = (workspace.lib || []).filter((ref: any) => !removeIds[ref.id]);
  selectNotes(appStore.getState()).forEach((note: any) => {
    if (note && removeIds[note.rid]) note.rid = primary.id;
  });
  dismissedDuplicateMap()[signature] = true;
  saveLegacyState();
  return true;
}

// ───────────────────────────────────────────────────────────────────────────
// Action button click handlers
// ───────────────────────────────────────────────────────────────────────────

function closestActionButton(event: MouseEvent<HTMLElement>, selector: string) {
  const target = event.target as HTMLElement | null;
  return target?.closest(selector) as HTMLElement | null;
}

export function runDuplicateAction(button: HTMLElement | null) {
  if (!button) return;
  const w = legacyWin() as any;
  const action = String(button.getAttribute('data-dup-action') || '');
  const signature = String(button.getAttribute('data-dup-signature') || '');
  if (!signature) return;
  try {
    if (action === 'merge') {
      let merged = false;
      if (typeof w.__mergeDuplicateGroup === 'function') {
        try { merged = !!w.__mergeDuplicateGroup(signature); } catch (_error) { merged = false; }
      }
      if (!merged) merged = mergeDuplicateGroupFallback(signature);
      if (typeof w.setDst === 'function') w.setDst(merged ? 'Duplicate kayıtlar birleştirildi.' : 'Duplicate birleştirilemedi.', merged ? 'ok' : 'er');
      window.setTimeout(renderDuplicateReviewFallback, 0);
      return;
    }
    if (action === 'dismiss' || action === 'keep') {
      try {
        if (typeof w.__duplicateDismissedMap === 'function') {
          const dismissed = w.__duplicateDismissedMap(activeWorkspaceId());
          if (dismissed) dismissed[signature] = true;
        }
      } catch (_error) {}
      dismissedDuplicateMap()[signature] = true;
    }
    try { if (typeof w.__removeDuplicateGroup === 'function') w.__removeDuplicateGroup(signature); } catch (_error) {}
    try { if (typeof w.__renderDuplicateReviewModal === 'function') w.__renderDuplicateReviewModal(); } catch (_error) {}
    window.setTimeout(renderDuplicateReviewFallback, 0);
  } catch (error) {
    console.error('[legacy-duplicate-action]', error);
  }
}

export function handleDuplicateReviewClick(event: MouseEvent<HTMLElement>) {
  const button = closestActionButton(event, '[data-dup-action]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  runDuplicateAction(button);
}

function findLegacyReference(refId: string) {
  const w = legacyWin() as any;
  if (typeof w.findRef === 'function') {
    return w.findRef(refId, activeWorkspaceId()) || w.findRef(refId);
  }
  return selectReferenceById(appStore.getState(), refId, activeWorkspaceId()) || null;
}

export function runMetadataHealthAction(button: HTMLElement | null) {
  if (!button) return;
  const w = legacyWin() as any;
  const action = String(button.getAttribute('data-mh-action') || '');
  const refId = String(button.getAttribute('data-ref-id') || '');
  const refIndex = Number(button.getAttribute('data-ref-index') || '-1');
  const refByIndex = Number.isFinite(refIndex) && refIndex >= 0 ? (activeWorkspaceRefs()[refIndex] || null) : null;
  const ref = findLegacyReference(refId) || refByIndex;
  if (!ref) {
    if (typeof w.setDst === 'function') w.setDst('Kaynak bulunamadı.', 'er');
    return;
  }
  try {
    if (action === 'edit') {
      if (typeof w.editRefMetadata === 'function') w.editRefMetadata(ref);
      else if (typeof w.openReferenceEditor === 'function') w.openReferenceEditor(ref);
      window.setTimeout(renderMetadataHealthFallback, 250);
      return;
    }
    if (action === 'normalize') {
      if (typeof w.AQMetadataHealth?.applyConservativeRepairs === 'function') {
        const result = w.AQMetadataHealth.applyConservativeRepairs(ref);
        if (result?.ref) {
          Object.keys(result.ref).forEach((key) => { ref[key] = result.ref[key]; });
          try {
            normalizeRefRecord(ref);
          } catch (_error) {
            if (typeof w.normalizeRefRecord === 'function') w.normalizeRefRecord(ref);
          }
          if (typeof w.save === 'function') w.save();
          if (typeof w.rLib === 'function') w.rLib();
          if (typeof w.rRefs === 'function') w.rRefs();
        }
      }
      if (typeof w.setDst === 'function') w.setDst('Kayıt normalize edildi.', 'ok');
      renderMetadataHealthFallback();
      return;
    }
    if (action === 'refetch') {
      if (!ref.doi || typeof w.fetchCR !== 'function') {
        if (typeof w.setDst === 'function') w.setDst('DOI olmayan kaynakta yeniden çekme yapılamaz.', 'er');
        return;
      }
      if (typeof w.setDst === 'function') w.setDst('Metadata DOI üzerinden güncelleniyor...', 'ld');
      w.fetchCR(ref.doi, (err: unknown, fetched: unknown) => {
        if (err || !fetched) {
          if (typeof w.setDst === 'function') w.setDst('DOI metadata alınamadı.', 'er');
          return;
        }
        try {
          mergeRefFields(ref, fetched as any);
        } catch (_error) {
          if (typeof w.mergeRefFields === 'function') w.mergeRefFields(ref, fetched);
        }
        if (typeof w.save === 'function') w.save();
        if (typeof w.rLib === 'function') w.rLib();
        if (typeof w.rRefs === 'function') w.rRefs();
        if (typeof w.updateRefSection === 'function') w.updateRefSection();
        renderMetadataHealthFallback();
        if (typeof w.setDst === 'function') w.setDst('Metadata güncellendi.', 'ok');
      });
    }
  } catch (error) {
    console.error('[legacy-metadata-action]', error);
  }
}

export function handleMetadataHealthClick(event: MouseEvent<HTMLElement>) {
  const button = closestActionButton(event, '[data-mh-action]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  runMetadataHealthAction(button);
}

export function filterMetadataHealth(status: string) {
  const nextStatus = String(status || 'all');
  document.querySelectorAll<HTMLElement>('#metaHealthSortBar [data-mh-sort]').forEach((button) => {
    button.classList.toggle('on', button.getAttribute('data-mh-sort') === nextStatus);
  });
  document.querySelectorAll<HTMLElement>('#metaHealthList .mh-card').forEach((card) => {
    const cardStatus = Array.from(card.querySelector('.mh-status')?.classList || [])
      .find((className) => ['mh-complete', 'mh-incomplete', 'mh-suspicious'].includes(className))
      ?.replace('mh-', '') || 'complete';
    card.style.display = nextStatus === 'all' || cardStatus === nextStatus ? '' : 'none';
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Test-only exports (internal helpers exposed for vitest coverage)
// ───────────────────────────────────────────────────────────────────────────

export const _internal = {
  dismissedDuplicateMap,
  currentDuplicateGroups,
  reasonLabel,
  runResolveRefFromButton,
  mergeReferencesIntoPrimary,
  mergeDuplicateGroupFallback,
  runDuplicateAction,
  findLegacyReference
};
