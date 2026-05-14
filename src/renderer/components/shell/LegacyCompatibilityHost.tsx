import { useEffect, useState, type ChangeEvent, type MouseEvent } from 'react';
import type { AcademiqReference } from '../../lib/app-state';
import {
  insertImageFile,
  importWordFileDirect,
  importBibliographyFile
} from '../../lib/file-import';
import {
  runExternalReferenceTextImport,
  runExternalReferenceBibliographyTextImport,
  runExternalReferenceFileImport,
  runExternalReferenceDoiImport
} from '../../lib/external-reference-import';
import {
  hideLegacyModal,
  showLegacyModal,
  escapeHtml,
  currentWorkspaceRefs,
  currentWorkspace,
  syncReactFromLegacy,
  scheduleReactSyncFromLegacy,
  saveLegacyState
} from '../../lib/legacy-dom-helpers';
import {
  type MetadataLookupCandidate,
  normalizeDoiForMetadata,
  normalizeLookupText,
  lookupTokens,
  compactLookupText,
  ngramSimilarity,
  titleSimilarity,
  authorLastNames,
  authorOverlapScore,
  yearFromCrossrefDate,
  firstMetadataString,
  openAlexSourceName,
  mapCrossrefWork,
  mapOpenAlexWork,
  mapSemanticScholarWork,
  scoreMetadataCandidate,
  isWeakMetadataValue,
  metadataYear,
  metadataAuthors,
  isPlaceholderTitleForRef,
  applyFetchedMetadataToRef,
  fetchCrossrefMetadataByDoi,
  fetchOpenAlexMetadataByDoi,
  enrichMetadataByDoi,
  searchMetadataByTitle
} from '../../lib/metadata-lookup';

type LegacyCompatibilityHostProps = {
  onStatus: (message: string) => void;
  onImportReferences: (references: AcademiqReference[], sourceLabel: string, options?: { includeInBibliography?: boolean; revealBibliography?: boolean }) => void;
};

type MetadataHealthRow = {
  ref: any;
  report: any;
};

type MetadataHealthSummary = {
  total: number;
  complete: number;
  incomplete: number;
  suspicious: number;
  issueText: string;
};


function dismissedDuplicateMap() {
  const win = window as any;
  const key = String(win.S?.cur || 'default');
  if (!win.__aqDismissedDuplicateSignatures) win.__aqDismissedDuplicateSignatures = {};
  if (!win.__aqDismissedDuplicateSignatures[key]) win.__aqDismissedDuplicateSignatures[key] = {};
  return win.__aqDismissedDuplicateSignatures[key] as Record<string, boolean>;
}

function currentDuplicateGroups() {
  const win = window as any;
  const refs = currentWorkspaceRefs();
  const legacyGroups = Array.isArray(win.duplicateReviewState?.groups) ? win.duplicateReviewState.groups : [];
  const apiGroups = typeof win.AQDuplicateDetection?.detectDuplicateGroups === 'function'
    ? win.AQDuplicateDetection.detectDuplicateGroups(refs, { workspaceId: win.S?.cur, dismissedSignatures: dismissedDuplicateMap() }) || []
    : [];
  return legacyGroups.length ? legacyGroups : apiGroups;
}

function reasonLabel(code: string) {
  const labels: Record<string, string> = {
    doi_exact: 'DOI ayn?',
    title_exact: 'Başlık ayn?',
    author_year_similar_title: 'Yazar/yıl ve başlık benzer',
    pdf_signature: 'PDF ayn?'
  };
  return labels[code] || code || 'benzer metadata';
}

function renderDuplicateReviewFallback() {
  const win = window as any;
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

function renderMetadataHealthFallback() {
  const win = window as any;
  const listEl = document.getElementById('metaHealthList');
  const sumEl = document.getElementById('metaHealthSummary');
  if (!listEl || !sumEl) return;
  const refs = currentWorkspaceRefs();
  const healthApi = win.AQMetadataHealth || {};
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
      const win = window as any;
      const action = String(button.getAttribute('data-mh-action') || '');
      const idx = Number(button.getAttribute('data-ref-index') || '-1');
      const rowRef = Number.isFinite(idx) && idx >= 0 ? (rows[idx]?.ref || null) : null;
      const ref = rowRef || runResolveRefFromButton(button);
      if (!ref) {
        try { if (typeof win.setDst === 'function') win.setDst('Kaynak bulunamadı.', 'er'); } catch (_error) {}
        return false;
      }
      try {
        if (action === 'edit') {
          if (typeof win.hideM === 'function') win.hideM('metaHealthModal');
          window.setTimeout(() => {
            try {
              if (typeof win.editRefMetadata === 'function') win.editRefMetadata(ref);
              else if (typeof win.openReferenceEditor === 'function') win.openReferenceEditor(ref);
            } catch (_error) {}
          }, 25);
          return false;
        }
        if (action === 'refetch') {
          if (!ref.doi || typeof win.fetchCR !== 'function') {
            if (typeof win.setDst === 'function') win.setDst('DOI olmayan kaynakta yeniden çekme yapılamaz.', 'er');
            return false;
          }
          if (typeof win.setDst === 'function') win.setDst('Metadata DOI ?zerinden güncelleniyor...', 'ld');
          win.fetchCR(ref.doi, (err: unknown, fetched: unknown) => {
            if (err || !fetched) {
              if (typeof win.setDst === 'function') win.setDst('DOI metadata alınamadı.', 'er');
              return;
            }
            if (typeof win.mergeRefFields === 'function') win.mergeRefFields(ref, fetched);
            saveLegacyState();
            renderMetadataHealthFallback();
            if (typeof win.setDst === 'function') win.setDst('Metadata güncellendi.', 'ok');
          });
          return false;
        }
        if (action === 'normalize') {
          if (win.AQMetadataHealth && typeof win.AQMetadataHealth.applyConservativeRepairs === 'function') {
            const result = win.AQMetadataHealth.applyConservativeRepairs(ref);
            if (result?.ref) Object.keys(result.ref).forEach((key) => { ref[key] = result.ref[key]; });
          }
          if (typeof win.normalizeRefRecord === 'function') win.normalizeRefRecord(ref);
          saveLegacyState();
          renderMetadataHealthFallback();
          if (typeof win.setDst === 'function') win.setDst('Kayıt normalize edildi.', 'ok');
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

function runResolveRefFromButton(button: HTMLElement) {
  const refId = String(button.getAttribute('data-ref-id') || '');
  const refIndex = Number(button.getAttribute('data-ref-index') || '-1');
  const refByIndex = Number.isFinite(refIndex) && refIndex >= 0 ? (currentWorkspaceRefs()[refIndex] || null) : null;
  return findLegacyReference(refId) || refByIndex;
}

function openQualitySurface(target: 'duplicate' | 'metadata') {
  const win = window as any;
  if (target === 'duplicate') {
    try {
      if (typeof win.openDuplicateReview === 'function') win.openDuplicateReview();
    } catch (error) {
      console.error('[legacy-duplicate]', error);
    }
    showLegacyModal('dupModal');
    window.setTimeout(() => {
      try { if (typeof win.__bindSprint1PanelEvents === 'function') win.__bindSprint1PanelEvents(); } catch (_error) {}
      renderDuplicateReviewFallback();
    }, 0);
    return;
  }
  try {
    if (typeof win.openMetadataHealthCenter === 'function') win.openMetadataHealthCenter();
  } catch (error) {
    console.error('[legacy-metadata-health]', error);
  }
  showLegacyModal('metaHealthModal');
  window.setTimeout(() => {
    try { if (typeof win.__bindSprint1PanelEvents === 'function') win.__bindSprint1PanelEvents(); } catch (_error) {}
    renderMetadataHealthFallback();
  }, 0);
}

function mergeReferencesIntoPrimary(primary: any, secondary: any) {
  const win = window as any;
  if (!primary || !secondary || primary === secondary) return primary;
  if (typeof win.AQDuplicateDetection?.mergeRecords === 'function') {
    win.AQDuplicateDetection.mergeRecords(primary, secondary);
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
  try { if (typeof win.normalizeRefRecord === 'function') win.normalizeRefRecord(primary); } catch (_error) {}
  return primary;
}

function mergeDuplicateGroupFallback(signature: string) {
  const win = window as any;
  const workspace = currentWorkspace();
  if (!workspace) return false;
  const groups = currentDuplicateGroups();
  const group = groups.find((item: any) => String(item?.signature || '') === signature);
  const ids = Array.isArray(group?.ids) ? group.ids : [];
  const records = ids
    .map((id: string) => (workspace.lib || []).find((ref: any) => ref && ref.id === id))
    .filter(Boolean);
  if (records.length < 2) return false;
  const primary = typeof win.AQDuplicateDetection?.pickPrimaryRecord === 'function'
    ? win.AQDuplicateDetection.pickPrimaryRecord(records)
    : records[0];
  const removeIds: Record<string, boolean> = {};
  records.forEach((ref: any) => {
    if (!ref || ref.id === primary.id) return;
    mergeReferencesIntoPrimary(primary, ref);
    removeIds[ref.id] = true;
  });
  workspace.lib = (workspace.lib || []).filter((ref: any) => !removeIds[ref.id]);
  if (Array.isArray(win.S?.notes)) {
    win.S.notes.forEach((note: any) => {
      if (note && removeIds[note.rid]) note.rid = primary.id;
    });
  }
  dismissedDuplicateMap()[signature] = true;
  saveLegacyState();
  return true;
}

function closestActionButton(event: MouseEvent<HTMLElement>, selector: string) {
  const target = event.target as HTMLElement | null;
  return target?.closest(selector) as HTMLElement | null;
}

function runDuplicateAction(button: HTMLElement | null) {
  if (!button) return;
  const win = window as any;
  const action = String(button.getAttribute('data-dup-action') || '');
  const signature = String(button.getAttribute('data-dup-signature') || '');
  if (!signature) return;
  try {
    if (action === 'merge') {
      let merged = false;
      if (typeof win.__mergeDuplicateGroup === 'function') {
        try { merged = !!win.__mergeDuplicateGroup(signature); } catch (_error) { merged = false; }
      }
      if (!merged) merged = mergeDuplicateGroupFallback(signature);
      if (typeof win.setDst === 'function') win.setDst(merged ? 'Duplicate kayıtlar birleştirildi.' : 'Duplicate birleştirilemedi.', merged ? 'ok' : 'er');
      window.setTimeout(renderDuplicateReviewFallback, 0);
      return;
    }
    if (action === 'dismiss' || action === 'keep') {
      try {
        if (typeof win.__duplicateDismissedMap === 'function') {
          const dismissed = win.__duplicateDismissedMap(win.S?.cur);
          if (dismissed) dismissed[signature] = true;
        }
      } catch (_error) {}
      dismissedDuplicateMap()[signature] = true;
    }
    try { if (typeof win.__removeDuplicateGroup === 'function') win.__removeDuplicateGroup(signature); } catch (_error) {}
    try { if (typeof win.__renderDuplicateReviewModal === 'function') win.__renderDuplicateReviewModal(); } catch (_error) {}
    window.setTimeout(renderDuplicateReviewFallback, 0);
  } catch (error) {
    console.error('[legacy-duplicate-action]', error);
  }
}

function handleDuplicateReviewClick(event: MouseEvent<HTMLElement>) {
  const button = closestActionButton(event, '[data-dup-action]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  runDuplicateAction(button);
}

function findLegacyReference(refId: string) {
  const win = window as any;
  if (typeof win.findRef === 'function') {
    return win.findRef(refId, win.S?.cur) || win.findRef(refId);
  }
  return currentWorkspaceRefs().find((ref: any) => ref && ref.id === refId) || null;
}

function runMetadataHealthAction(button: HTMLElement | null) {
  if (!button) return;
  const win = window as any;
  const action = String(button.getAttribute('data-mh-action') || '');
  const refId = String(button.getAttribute('data-ref-id') || '');
  const refIndex = Number(button.getAttribute('data-ref-index') || '-1');
  const refByIndex = Number.isFinite(refIndex) && refIndex >= 0 ? (currentWorkspaceRefs()[refIndex] || null) : null;
  const ref = findLegacyReference(refId) || refByIndex;
  if (!ref) {
    if (typeof win.setDst === 'function') win.setDst('Kaynak bulunamadı.', 'er');
    return;
  }
  try {
    if (action === 'edit') {
      if (typeof win.editRefMetadata === 'function') win.editRefMetadata(ref);
      else if (typeof win.openReferenceEditor === 'function') win.openReferenceEditor(ref);
      window.setTimeout(renderMetadataHealthFallback, 250);
      return;
    }
    if (action === 'normalize') {
      if (typeof win.AQMetadataHealth?.applyConservativeRepairs === 'function') {
        const result = win.AQMetadataHealth.applyConservativeRepairs(ref);
        if (result?.ref) {
          Object.keys(result.ref).forEach((key) => { ref[key] = result.ref[key]; });
          if (typeof win.normalizeRefRecord === 'function') win.normalizeRefRecord(ref);
          if (typeof win.save === 'function') win.save();
          if (typeof win.rLib === 'function') win.rLib();
          if (typeof win.rRefs === 'function') win.rRefs();
        }
      }
      if (typeof win.setDst === 'function') win.setDst('Kayıt normalize edildi.', 'ok');
      renderMetadataHealthFallback();
      return;
    }
    if (action === 'refetch') {
      if (!ref.doi || typeof win.fetchCR !== 'function') {
        if (typeof win.setDst === 'function') win.setDst('DOI olmayan kaynakta yeniden çekme yapılamaz.', 'er');
        return;
      }
      if (typeof win.setDst === 'function') win.setDst('Metadata DOI ?zerinden güncelleniyor...', 'ld');
      win.fetchCR(ref.doi, (err: unknown, fetched: unknown) => {
        if (err || !fetched) {
          if (typeof win.setDst === 'function') win.setDst('DOI metadata alınamadı.', 'er');
          return;
        }
        if (typeof win.mergeRefFields === 'function') win.mergeRefFields(ref, fetched);
        if (typeof win.save === 'function') win.save();
        if (typeof win.rLib === 'function') win.rLib();
        if (typeof win.rRefs === 'function') win.rRefs();
        if (typeof win.updateRefSection === 'function') win.updateRefSection();
        renderMetadataHealthFallback();
        if (typeof win.setDst === 'function') win.setDst('Metadata güncellendi.', 'ok');
      });
    }
  } catch (error) {
    console.error('[legacy-metadata-action]', error);
  }
}

function handleMetadataHealthClick(event: MouseEvent<HTMLElement>) {
  const button = closestActionButton(event, '[data-mh-action]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  runMetadataHealthAction(button);
}

function filterMetadataHealth(status: string) {
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

function readLegacyInputValue(id: string, fallback = '') {
  return String((document.getElementById(id) as HTMLInputElement | null)?.value || fallback);
}

function insertTableFromWizard(onStatus: (message: string) => void) {
  const win = window as any;
  const tableOptions = {
    number: readLegacyInputValue('wtn', '1'),
    cols: readLegacyInputValue('wtc', '3'),
    rows: readLegacyInputValue('wtr', '4'),
    title: readLegacyInputValue('wtt', ''),
    note: readLegacyInputValue('wtn2', '')
  };

  try {
    if (typeof win.doTable === 'function') {
      win.doTable();
      hideLegacyModal('wiz');
      return;
    }
    const html = typeof win.AQTipTapWordCommands?.buildTableHTML === 'function'
      ? win.AQTipTapWordCommands.buildTableHTML(tableOptions)
      : `<p class="ni"><strong>Tablo ${tableOptions.number}</strong></p><table><thead><tr><th>Başlık 1</th><th>Başlık 2</th><th>Başlık 3</th></tr></thead><tbody><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p><br></p>`;
    const editor = win.editor;
    if (editor?.chain) {
      if (typeof win.restoreEditorListStyleSelection === 'function') {
        try { win.restoreEditorListStyleSelection(); } catch (_error) {}
      }
      editor.chain().focus().insertContent(html, { parseOptions: { preserveWhitespace: false } }).run();
      if (typeof win.runEditorMutationEffects === 'function') {
        win.runEditorMutationEffects({ layout: true, syncChrome: true, syncTOC: true, syncRefs: true, refreshTrigger: false });
      }
      hideLegacyModal('wiz');
      onStatus('Tablo eklendi');
      return;
    }
    onStatus('Editor hazır değil');
  } catch (error) {
    console.error('[legacy-table]', error);
    onStatus('Tablo eklenemedi');
  }
}

function callFileHandler(name: string, event: ChangeEvent<HTMLInputElement>, onStatus: (message: string) => void) {
  const fn = (window as any)[name];
  if (typeof fn !== 'function') {
    onStatus(`${name} hazır değil`);
    return;
  }
  try {
    fn(event.nativeEvent || event);
    window.setTimeout(syncReactFromLegacy, 250);
    window.setTimeout(syncReactFromLegacy, 1000);
  } catch (error) {
    console.error('[legacy-input]', name, error);
    onStatus(`${name} çalıştırılamadı`);
  } finally {
    event.currentTarget.value = '';
  }
}



export function LegacyCompatibilityHost({ onStatus, onImportReferences }: LegacyCompatibilityHostProps) {
  const [metadataRows, setMetadataRows] = useState<MetadataHealthRow[]>([]);
  const [metadataSummary, setMetadataSummary] = useState<MetadataHealthSummary>({
    total: 0,
    complete: 0,
    incomplete: 0,
    suspicious: 0,
    issueText: ''
  });
  const [metadataFilter, setMetadataFilter] = useState('all');
  const [metadataLookupCandidate, setMetadataLookupCandidate] = useState<MetadataLookupCandidate | null>(null);
  const [metadataLookupBusyId, setMetadataLookupBusyId] = useState('');

  // Note: the legacy → React sync debounce timer is owned by
  // legacy-dom-helpers; no per-component cleanup needed here.

  const refreshMetadataHealth = () => {
    const win = window as any;
    const refs = currentWorkspaceRefs();
    const healthApi = win.AQMetadataHealth || {};
    const rows = refs.map((ref: any) => ({
      ref,
      report: typeof healthApi.analyzeReference === 'function'
        ? healthApi.analyzeReference(ref)
        : { status: 'complete', issues: [] }
    }));
    const summary = typeof healthApi.summarizeHealth === 'function'
      ? healthApi.summarizeHealth(refs)
      : { total: refs.length, complete: refs.length, incomplete: 0, suspicious: 0, issueCounts: {} };
    const issueText = Object.entries(summary.issueCounts || {})
      .map(([code, count]) => `${code} ${count}`)
      .join(' · ');
    setMetadataRows(rows);
    setMetadataSummary({
      total: Number(summary.total || refs.length || 0),
      complete: Number(summary.complete || 0),
      incomplete: Number(summary.incomplete || 0),
      suspicious: Number(summary.suspicious || 0),
      issueText
    });
  };

  const openReactMetadataHealth = () => {
    showLegacyModal('metaHealthModal');
    refreshMetadataHealth();
  };

  const applyMetadataCandidate = async (mode: 'merge' | 'doi-only') => {
    const win = window as any;
    const candidate = metadataLookupCandidate;
    if (!candidate?.ref || !candidate.fetched) return;
    const busyId = String(candidate.ref.id || candidate.ref.title || 'ref');
    try {
      let fetched = { ...candidate.fetched };
      if (mode === 'merge' && fetched.doi) {
        setMetadataLookupBusyId(busyId);
        fetched = await enrichMetadataByDoi(fetched, fetched.doi);
      }
      if (mode === 'doi-only') {
        const doi = normalizeDoiForMetadata(fetched.doi);
        if (doi) {
          candidate.ref.doi = doi;
          if (!candidate.ref.url) candidate.ref.url = `https://doi.org/${doi}`;
        }
      } else if (typeof win.mergeRefFields === 'function') {
        win.mergeRefFields(candidate.ref, fetched);
      } else {
        Object.entries(fetched).forEach(([key, value]) => {
          if (key === 'id' || value == null || value === '') return;
          if (!candidate.ref[key] || key === 'doi' || key === 'url' || key === 'pdfUrl') candidate.ref[key] = value;
        });
      }
      const changedFields = mode === 'doi-only' ? [] : applyFetchedMetadataToRef(candidate.ref, fetched);
      if (typeof win.normalizeRefRecord === 'function') win.normalizeRefRecord(candidate.ref);
      saveLegacyState();
      refreshMetadataHealth();
      setMetadataLookupCandidate(null);
      const report = typeof win.AQMetadataHealth?.analyzeReference === 'function'
        ? win.AQMetadataHealth.analyzeReference(candidate.ref)
        : null;
      const remaining = Array.isArray(report?.issues) ? report.issues.length : 0;
      onStatus(mode === 'doi-only'
        ? 'DOI kayda eklendi'
        : `Metadata kayda işlendi${changedFields.length ? `: ${changedFields.join(', ')}` : ''}${remaining ? ` · ${remaining} sorun kaldı` : ''}`);
    } catch (error) {
      console.error('[metadata-candidate-apply]', error);
      onStatus('Bulunan metadata kayda işlenemedi');
    } finally {
      setMetadataLookupBusyId('');
    }
  };

  const handleMetadataAction = async (action: string, ref: any) => {
    const win = window as any;
    if (!ref) {
      onStatus('Kaynak bulunamadı');
      return;
    }
    try {
      if (action === 'edit') {
        hideLegacyModal('metaHealthModal');
        if (typeof win.editRefMetadata === 'function') win.editRefMetadata(ref);
        else if (typeof win.openReferenceEditor === 'function') win.openReferenceEditor(ref);
        window.setTimeout(refreshMetadataHealth, 350);
        return;
      }
      if (action === 'refetch') {
        const doi = normalizeDoiForMetadata(ref.doi || ref.url || '');
        setMetadataLookupBusyId(String(ref.id || ref.title || 'ref'));
        setMetadataLookupCandidate(null);
        try {
          if (doi) {
            onStatus('Metadata DOI üzerinden güncelleniyor...');
            let fetched = await fetchCrossrefMetadataByDoi(doi);
            if (fetched) fetched = await enrichMetadataByDoi(fetched, doi);
            if (!fetched) {
              onStatus('DOI metadata alınamadı');
              return;
            }
            if (typeof win.mergeRefFields === 'function') win.mergeRefFields(ref, fetched);
            else Object.entries(fetched).forEach(([key, value]) => {
              if (key !== 'id' && value != null && value !== '' && (!ref[key] || key === 'doi' || key === 'url' || key === 'pdfUrl')) ref[key] = value;
            });
            const changedFields = applyFetchedMetadataToRef(ref, fetched);
            if (typeof win.normalizeRefRecord === 'function') win.normalizeRefRecord(ref);
            saveLegacyState();
            refreshMetadataHealth();
            const report = typeof win.AQMetadataHealth?.analyzeReference === 'function'
              ? win.AQMetadataHealth.analyzeReference(ref)
              : null;
            const remaining = Array.isArray(report?.issues) ? report.issues.length : 0;
            onStatus(`Metadata güncellendi${changedFields.length ? `: ${changedFields.join(', ')}` : ''}${remaining ? ` · ${remaining} sorun kaldı` : ''}`);
            return;
          }
          onStatus('DOI aranıyor: başlık, yazar ve yıl kontrol ediliyor...');
          const candidate = await searchMetadataByTitle(ref);
          if (!candidate) {
            onStatus('Bu kaynak için güvenilir DOI adayı bulunamadı');
            return;
          }
          setMetadataLookupCandidate(candidate);
          onStatus(`DOI adayı bulundu: ${candidate.fetched.doi || candidate.fetched.title}`);
        } finally {
          setMetadataLookupBusyId('');
        }
        return;
      }
      if (action === 'normalize') {
        if (typeof win.AQMetadataHealth?.applyConservativeRepairs === 'function') {
          const result = win.AQMetadataHealth.applyConservativeRepairs(ref);
          if (result?.ref) Object.keys(result.ref).forEach((key) => { ref[key] = result.ref[key]; });
        }
        if (typeof win.normalizeRefRecord === 'function') win.normalizeRefRecord(ref);
        saveLegacyState();
        refreshMetadataHealth();
        onStatus('Kayıt normalize edildi');
      }
    } catch (error) {
      console.error('[metadata-health-react-action]', error);
      onStatus('Metadata işlemi çalıştırılamadı');
    }
  };

  const visibleMetadataRows = metadataRows.filter((row) => {
    const status = String(row.report?.status || 'complete');
    return metadataFilter === 'all' || status === metadataFilter;
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        (window as any).AQCitationRuntime?.init?.();
        (window as any).AQLiteratureMatrix?.init?.();
        (window as any).AQMarginNotes?.init?.();
        (window as any).__bindSprint1PanelEvents?.();
      } catch (error) {
        console.error('[legacy-host:init]', error);
        onStatus('Legacy arayuz baglantisi yenilenemedi');
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const win = window as any;
    if (typeof win.togglePdfRegionCaptureMode === 'function') return;
    win.togglePdfRegionCaptureMode = () => {
      onStatus('PDF bölge yakalama henüz aktif değil — yakında eklenecek');
      return false;
    };
    return () => {
      if (win.togglePdfRegionCaptureMode && String(win.togglePdfRegionCaptureMode).includes('PDF bölge yakalama henüz aktif')) {
        delete win.togglePdfRegionCaptureMode;
      }
    };
  }, [onStatus]);

  useEffect(() => {
    const onImport = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const entries = Array.isArray(detail.entries) ? detail.entries : [];
      if (!entries.length) return;
      onImportReferences(entries, String(detail.sourceLabel || 'Kaynak aktarımı'), {
        includeInBibliography: !!detail.includeInBibliography,
        revealBibliography: !!detail.revealBibliography
      });
    };
    window.addEventListener('aq:import-references', onImport);
    return () => window.removeEventListener('aq:import-references', onImport);
  }, [onImportReferences]);

  useEffect(() => {
    const onOpenQualitySurface = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.target === 'duplicate') openQualitySurface('duplicate');
      else openReactMetadataHealth();
    };
    window.addEventListener('aq:open-quality-surface', onOpenQualitySurface);
    return () => window.removeEventListener('aq:open-quality-surface', onOpenQualitySurface);
  }, []);

  useEffect(() => {
    const win = window as any;
    win.__aqHandleDuplicateAction = (button: HTMLElement) => runDuplicateAction(button);
    win.__aqHandleMetadataHealthAction = (button: HTMLElement) => runMetadataHealthAction(button);
    win.__aqOpenDuplicateReview = () => openQualitySurface('duplicate');
    win.__aqOpenMetadataHealth = () => openReactMetadataHealth();
    return () => {
      delete win.__aqHandleDuplicateAction;
      delete win.__aqHandleMetadataHealthAction;
      delete win.__aqOpenDuplicateReview;
      delete win.__aqOpenMetadataHealth;
    };
  }, []);

  useEffect(() => {
    const onDuplicateClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const actionButton = target.closest('[data-dup-action]') as HTMLElement | null;
      const mergeAllButton = target.closest('#dupMergeAllBtn');
      const dismissAllButton = target.closest('#dupDismissAllBtn');
      if (!actionButton && !mergeAllButton && !dismissAllButton) return;
      event.preventDefault();
      event.stopPropagation();
      const win = window as any;
      if (mergeAllButton) {
        if (typeof win.__mergeAllDuplicateGroups === 'function') win.__mergeAllDuplicateGroups();
        window.setTimeout(renderDuplicateReviewFallback, 0);
        return;
      }
      if (dismissAllButton) {
        if (typeof win.__dismissAllDuplicateGroups === 'function') win.__dismissAllDuplicateGroups();
        window.setTimeout(renderDuplicateReviewFallback, 0);
        return;
      }
      runDuplicateAction(actionButton);
    };
    const onMetadataClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const actionButton = target.closest('[data-mh-action]') as HTMLElement | null;
      if (!actionButton) return;
      event.preventDefault();
      event.stopPropagation();
      runMetadataHealthAction(actionButton);
    };
    const onGlobalPointer = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('#dupModal')) onDuplicateClick(event);
      if (target.closest('#metaHealthModal')) onMetadataClick(event);
    };
    document.addEventListener('click', onGlobalPointer, true);
    document.addEventListener('pointerdown', onGlobalPointer, true);
    document.getElementById('dupModal')?.addEventListener('click', onDuplicateClick, true);
    document.getElementById('metaHealthModal')?.addEventListener('click', onMetadataClick, true);
    return () => {
      document.removeEventListener('click', onGlobalPointer, true);
      document.removeEventListener('pointerdown', onGlobalPointer, true);
      document.getElementById('dupModal')?.removeEventListener('click', onDuplicateClick, true);
      document.getElementById('metaHealthModal')?.removeEventListener('click', onMetadataClick, true);
    };
  }, []);

  useEffect(() => {
    const fallbackCommand = async (id: string) => {
      const win = window as any;
      const state = win.__aqPdfFallbackState;
      const panel = document.getElementById('pdfpanel');
      const scroll = document.getElementById('pdfscroll');
      const scrollToPage = (pageNumber: number) => {
        if (!scroll) return;
        const pages = Array.from(scroll.querySelectorAll<HTMLElement>('.pdf-page-wrap'));
        const total = Number(state?.total || pages.length || 0);
        const nextPage = Math.max(1, Math.min(total || 1, pageNumber));
        const target = scroll.querySelector<HTMLElement>(`.pdf-page-wrap[data-page="${nextPage}"]`);
        if (target) scroll.scrollTo({ top: target.offsetTop, behavior: 'smooth' });
        if (state) state.page = nextPage;
        const pageNode = document.getElementById('pdfpg');
        if (pageNode) pageNode.textContent = total ? `${nextPage}/${total}` : '--';
        document.querySelectorAll<HTMLElement>('#pdfthumbs [data-thumbpage]').forEach((item) => {
          const active = Number(item.dataset.thumbpage || 0) === nextPage;
          item.classList.toggle('active', active);
        });
      };
      const renderFallbackThumbs = async () => {
        const el = document.getElementById('pdfthumbs');
        if (!el || !scroll) return;
        const pages = Array.from(scroll.querySelectorAll<HTMLElement>('.pdf-page-wrap'));
        if (!pages.length) {
          el.innerHTML = '<div class="aq-empty-note">PDF sayfası bulunamadı.</div>';
          return;
        }
        el.innerHTML = '';
        pages.forEach((page, index) => {
          const source = page.querySelector<HTMLCanvasElement>('canvas:not(.hl-overlay):not(.draw-overlay)');
          const card = document.createElement('button');
          card.type = 'button';
          card.className = 'pdf-thumb-card';
          card.dataset.thumbpage = String(index + 1);
          card.onclick = () => scrollToPage(index + 1);
          if (source) {
            const thumb = document.createElement('canvas');
            const width = 110;
            const ratio = source.height / Math.max(1, source.width);
            thumb.width = width;
            thumb.height = Math.max(1, Math.round(width * ratio));
            thumb.getContext('2d')?.drawImage(source, 0, 0, thumb.width, thumb.height);
            card.appendChild(thumb);
          }
          const label = document.createElement('span');
          label.textContent = String(index + 1);
          card.appendChild(label);
          el.appendChild(card);
        });
        scrollToPage(Number(state?.page || 1));
      };
      const resolveOutlinePage = async (dest: any) => {
        if (!state?.pdf || !dest) return 1;
        const destination = typeof dest === 'string' ? await state.pdf.getDestination(dest) : dest;
        const ref = Array.isArray(destination) ? destination[0] : null;
        if (!ref) return 1;
        try {
          const pageIndex = await state.pdf.getPageIndex(ref);
          return Number(pageIndex || 0) + 1;
        } catch (_error) {
          return 1;
        }
      };
      const renderFallbackOutline = async () => {
        const el = document.getElementById('pdfoutline');
        if (!el) return;
        if (!state?.pdf?.getOutline) {
          el.innerHTML = '<div class="aq-empty-note">İçerik tablosu bu PDF için hazır değil.</div>';
          return;
        }
        const outline = await state.pdf.getOutline();
        if (!Array.isArray(outline) || !outline.length) {
          el.innerHTML = '<div class="aq-empty-note">Bu PDF içinde gömülü içerik tablosu yok.</div>';
          return;
        }
        el.innerHTML = '';
        const addItems = async (items: any[], depth = 0) => {
          for (const item of items) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'pdf-outline-item';
            button.style.paddingLeft = `${10 + depth * 14}px`;
            button.textContent = String(item?.title || 'Başlıksız');
            button.onclick = async () => scrollToPage(await resolveOutlinePage(item?.dest));
            el.appendChild(button);
            if (Array.isArray(item?.items) && item.items.length) await addItems(item.items, depth + 1);
          }
        };
        await addItems(outline);
      };
      const renderFallbackRelated = async () => {
        const el = document.getElementById('pdfrelated');
        if (!el) return;
        const ref = win.__aqCurrentPdfReference;
        const refs = Array.isArray(win.S?.wss)
          ? ((win.S.wss.find((workspace: any) => workspace?.id === win.S?.cur)?.lib) || [])
          : [];
        const recApi = win.AQReferenceRecommendation;
        if (!ref) {
          el.innerHTML = '<div class="aq-empty-note">Benzer makale icin seçili kaynak yok.</div>';
          return;
        }
        const related = recApi && typeof recApi.relatedPapers === 'function'
          ? recApi.relatedPapers(ref, refs, { notes: win.S?.notes || [] }).slice(0, 8)
          : [];
        const localHtml = related.length ? related.map((item: any) => {
          const relatedRef = item.ref || {};
          return `<button class="pdf-related-card" type="button" data-related-ref="${escapeHtml(relatedRef.id || '')}">
            <b>${escapeHtml(relatedRef.title || 'Başlıksız')}</b>
            <span>${escapeHtml((Array.isArray(relatedRef.authors) ? relatedRef.authors.slice(0, 2).join(', ') : '') || 'Yazar yok')} · ${escapeHtml(relatedRef.year || 't.y.')}</span>
          </button>`;
        }).join('') : '<div class="aq-empty-note">Kütüphanede benzer kayıt bulunamadı.</div>';
        el.innerHTML = `<div class="pdf-related-section-title">Yerel kütüphane</div>${localHtml}<div class="pdf-related-section-title">Web sonuçları <span>aranıyor...</span></div>`;

        const discoveryApi = win.AQWebRelatedDiscovery;
        if (!discoveryApi || typeof discoveryApi.discoverWebRelated !== 'function' || !window.electronAPI?.netFetchJSON) {
          el.innerHTML += '<div class="aq-empty-note">Web related motoru hazır değil.</div>';
          return;
        }
        try {
          const output = await discoveryApi.discoverWebRelated(ref, {
            limit: 8,
            fetchJSON: async (url: string, options: Record<string, unknown> = {}) => {
              const result = await window.electronAPI?.netFetchJSON?.(url, {
                ...options,
                allowAnyHost: true,
                timeoutMs: Number(options.timeoutMs || 9000)
              }) as any;
              if (result?.ok === false) throw new Error(String(result.error || 'Web sorgusu başarısız'));
              return result?.data || result;
            }
          });
          const items = Array.isArray(output?.items) ? output.items : [];
          const webHtml = items.length ? items.map((item: any, index: number) => {
            const authors = Array.isArray(item.authors) ? item.authors.slice(0, 2).join(', ') : '';
            const source = item.providerLabel || item.provider || 'Web';
            const doi = item.doi ? `https://doi.org/${encodeURIComponent(item.doi)}` : '';
            return `<div class="pdf-related-card pdf-related-web-card" data-web-related-index="${index}">
              <b>${escapeHtml(item.title || 'Başlıksız')}</b>
              <span>${escapeHtml(authors || 'Yazar yok')} · ${escapeHtml(item.year || 't.y.')} · ${escapeHtml(source)}</span>
              ${item.journal ? `<span>${escapeHtml(item.journal)}</span>` : ''}
              <div class="pdf-related-actions">
                <button type="button" data-web-related-action="add" data-web-related-index="${index}">Workspace'e ekle</button>
                ${(doi || item.url) ? `<button type="button" data-web-related-action="open" data-web-related-url="${escapeHtml(doi || item.url)}">DOI / URL a?</button>` : ''}
              </div>
            </div>`;
          }).join('') : '<div class="aq-empty-note">Webde benzer kayıt bulunamadı.</div>';
          win.__aqPdfWebRelatedItems = items;
          el.innerHTML = `<div class="pdf-related-section-title">Yerel kütüphane</div>${localHtml}<div class="pdf-related-section-title">Web sonuçlar? <span>${items.length} sonuç</span></div>${webHtml}`;
        } catch (error) {
          el.innerHTML = `<div class="pdf-related-section-title">Yerel kütüphane</div>${localHtml}<div class="pdf-related-section-title">Web sonuçlar? <span>hata</span></div><div class="aq-empty-note">${escapeHtml((error as Error)?.message || 'Web sonuçlar? alınamadı')}</div>`;
        }
      };
      if (id === 'pdfclosebtn') {
        panel?.classList.remove('open');
        return true;
      }
      if (id === 'pdffullbtn') {
        panel?.classList.toggle('fullscreen');
        return true;
      }
      if (id === 'pdfSearchToggleBtn' || id === 'pdfSearchCloseBtn') {
        document.getElementById('pdfsearchbar')?.classList.toggle('open');
        return true;
      }
      if (id === 'pdfThumbsToggleBtn') {
        const el = document.getElementById('pdfthumbs');
        if (el) {
          const opening = el.style.display === 'none';
          el.style.display = opening ? 'block' : 'none';
          if (opening) await renderFallbackThumbs();
        }
        return true;
      }
      if (id === 'pdfOutlineToggleBtn') {
        const el = document.getElementById('pdfoutline');
        if (el) {
          const opening = el.style.display === 'none';
          el.style.display = opening ? 'block' : 'none';
          if (opening) await renderFallbackOutline();
        }
        return true;
      }
      if (id === 'pdfAnnotsToggleBtn') {
        const el = document.getElementById('pdfannots');
        if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
        return true;
      }
      if (id === 'pdfRelatedToggleBtn') {
        const el = document.getElementById('pdfrelated');
        if (el) {
          const opening = el.style.display === 'none';
          el.style.display = opening ? 'block' : 'none';
          if (opening) void renderFallbackRelated();
        }
        return true;
      }
      if (id === 'annotbtn' || id === 'drawbtn' || id === 'pdfRegionBtn') {
        const win = window as any;
        const nextMode = id === 'annotbtn' ? 'annot' : id === 'drawbtn' ? 'draw' : 'region';
        if (typeof win.__aqSetPdfToolMode === 'function') {
          win.__aqSetPdfToolMode(win.__aqPdfToolMode === nextMode ? '' : nextMode);
        } else {
          win.__aqPdfToolMode = win.__aqPdfToolMode === nextMode ? '' : nextMode;
          document.getElementById(id)?.classList.toggle('on', !!win.__aqPdfToolMode);
        }
        return true;
      }
      if (id === 'pdfDrawClearBtn') {
        const state = (window as any).__aqPdfFallbackState;
        const page = Number(state?.page || 1);
        const currentPage = document.querySelector<HTMLElement>(`#pdfscroll .pdf-page-wrap[data-page="${page}"]`) || document.querySelector<HTMLElement>('#pdfscroll .pdf-page-wrap[data-page]');
        const canvas = currentPage?.querySelector<HTMLCanvasElement>('.draw-overlay');
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        return true;
      }
      if (!state || !scroll) return false;
      const pages = Array.from(scroll.querySelectorAll<HTMLElement>('.pdf-page-wrap'));
      const currentPageFromDom = () => {
        if (!pages.length) return Number(state.page || 1);
        const top = scroll.scrollTop;
        let best = 1;
        let bestDistance = Number.POSITIVE_INFINITY;
        pages.forEach((page, index) => {
          const distance = Math.abs(page.offsetTop - top);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = index + 1;
          }
        });
        return best;
      };
      if (id === 'pdfPrevBtn') {
        scrollToPage(currentPageFromDom() - 1);
        return true;
      }
      if (id === 'pdfNextBtn') {
        scrollToPage(currentPageFromDom() + 1);
        return true;
      }
      const rerender = async (scale: number) => {
        const renderer = win.__aqRenderPdfFallback;
        if (typeof renderer !== 'function') return false;
        state.scale = scale;
        await renderer(state.buffer, state.title, scale);
        return true;
      };
      if (id === 'pdfZoomOutBtn') return rerender(Math.max(0.5, Number(state.scale || 1.25) - 0.15));
      if (id === 'pdfZoomInBtn') return rerender(Math.min(3, Number(state.scale || 1.25) + 0.15));
      if (id === 'pdfzoom') return rerender(1.25);
      return false;
    };
    const invoke = (name: string, ...args: unknown[]) => {
      const fn = (window as any)[name];
      if (typeof fn !== 'function') return false;
      try {
        fn(...args);
        return true;
      } catch (error) {
        console.error('[pdf-viewer-command]', name, error);
        return false;
      }
    };
    const onPdfClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest?.('#pdfpanel button, #pdfpanel [role="button"], #pdfpanel .hlc') as HTMLElement | null;
      if (!button) return;
      const webAction = button.getAttribute('data-web-related-action');
      if (webAction) {
        event.preventDefault();
        event.stopPropagation();
        const win = window as any;
        if (webAction === 'open') {
          const url = String(button.getAttribute('data-web-related-url') || '');
          if (url) window.open(url, '_blank', 'noopener,noreferrer');
          return;
        }
        if (webAction === 'add') {
          const idx = Number(button.getAttribute('data-web-related-index') || '-1');
          const item = Array.isArray(win.__aqPdfWebRelatedItems) ? win.__aqPdfWebRelatedItems[idx] : null;
          const ws = Array.isArray(win.S?.wss) ? win.S.wss.find((workspace: any) => workspace?.id === win.S?.cur) : null;
          const api = win.AQWebRelatedPapers;
          if (!item || !ws || !api || typeof api.buildWorkspaceReference !== 'function') {
            onStatus('Web sonucu kaynağa donusturulemedi');
            return;
          }
          const reference = api.buildWorkspaceReference(item, {
            workspaceId: ws.id,
            createId: () => `ref_${Date.now()}_${Math.random().toString(16).slice(2)}`
          });
          const exists = Array.isArray(ws.lib) && ws.lib.some((ref: any) => {
            const doiA = String(ref?.doi || '').toLowerCase();
            const doiB = String(reference?.doi || '').toLowerCase();
            return (doiA && doiA === doiB) || String(ref?.title || '').trim().toLowerCase() === String(reference?.title || '').trim().toLowerCase();
          });
          if (!exists) {
            if (!Array.isArray(ws.lib)) ws.lib = [];
            ws.lib.unshift(reference);
            saveLegacyState();
            onImportReferences([reference], 'Web related');
            onStatus('Web sonucu workspace kütüphanesine eklendi');
          } else {
            onStatus('Bu web sonucu zaten kütüphanede var');
          }
          return;
        }
      }
      const id = button.id;
      const commandMap: Record<string, string> = {
        pdfPrevBtn: 'pPrev',
        pdfNextBtn: 'pNext',
        pdfZoomOutBtn: 'pZO',
        pdfZoomInBtn: 'pZI',
        pdfSearchToggleBtn: 'togglePdfSearch',
        pdfThumbsToggleBtn: 'toggleThumbs',
        pdfOutlineToggleBtn: 'toggleOutline',
        pdfAnnotsToggleBtn: 'togglePdfAnnotations',
        pdfRelatedToggleBtn: 'togglePdfRelated',
        annotbtn: 'toggleAnnotMode',
        drawbtn: 'toggleDrawMode',
        pdfRegionBtn: 'togglePdfRegionCaptureMode',
        pdfDrawClearBtn: 'clearPdfDrawingPage',
        pdffullbtn: 'togglePdfFullscreen',
        pdfclosebtn: 'togglePDF',
        pdfSearchPrevBtn: 'pdfSearchPrev',
        pdfSearchNextBtn: 'pdfSearchNext',
        pdfSearchCloseBtn: 'togglePdfSearch',
        hlToNoteBtn: 'doHL',
        hlOnlyBtn: 'doHL',
        hlCloseBtn: 'hideHLtip'
      };
      if (id === 'pdfUploadBtn' || id === 'pdfEmptyUploadBtn') {
        event.preventDefault();
        event.stopPropagation();
        document.getElementById('lfinp')?.click();
        return;
      }
      if (id === 'pdfpg') {
        event.preventDefault();
        event.stopPropagation();
        invoke('goToPage');
        return;
      }
      if (id === 'pdfzoom') {
        event.preventDefault();
        event.stopPropagation();
        invoke('pZFit');
        return;
      }
      if (button.classList.contains('hlc')) {
        event.preventDefault();
        event.stopPropagation();
        document.querySelectorAll('#hlbar .hlc').forEach((node) => node.classList.remove('on'));
        button.classList.add('on');
        invoke('setHLC', button);
        return;
      }
      const command = commandMap[id];
      if (!command) return;
      event.preventDefault();
      event.stopPropagation();
      if ((id === 'hlToNoteBtn' || id === 'hlOnlyBtn') && (window as any).__aqPdfFallbackSelection) {
        const applyFallbackHighlight = (window as any).__aqApplyPdfFallbackHighlight;
        if (typeof applyFallbackHighlight === 'function') {
          applyFallbackHighlight(id === 'hlToNoteBtn');
        }
        return;
      }
      let handled = false;
      const forceFallback = new Set([
        'pdfSearchToggleBtn',
        'pdfSearchCloseBtn',
        'pdfThumbsToggleBtn',
        'pdfOutlineToggleBtn',
        'pdfAnnotsToggleBtn',
        'pdfRelatedToggleBtn',
        'annotbtn',
        'drawbtn',
        'pdfRegionBtn',
        'pdfDrawClearBtn',
        'pdfclosebtn',
        'pdffullbtn'
      ]);
      if (forceFallback.has(id)) {
        void fallbackCommand(id);
        return;
      }
      if (id === 'hlToNoteBtn') handled = invoke(command, true);
      else if (id === 'hlOnlyBtn') handled = invoke(command, false);
      else handled = invoke(command);
      if (!handled) void fallbackCommand(id);
    };
    const onPdfChange = (event: Event) => {
      const target = event.target as HTMLInputElement | HTMLSelectElement | null;
      if (!target || !target.closest('#pdfpanel')) return;
      if (target.id === 'pdfDrawColor') invoke('setPdfDrawColor', target.value);
      if (target.id === 'pdfDrawWidth') invoke('setPdfDrawWidth', target.value);
    };
    document.addEventListener('click', onPdfClick, true);
    document.addEventListener('change', onPdfChange, true);
    return () => {
      document.removeEventListener('click', onPdfClick, true);
      document.removeEventListener('change', onPdfChange, true);
    };
  }, []);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      if (!node) return false;
      if (/^(INPUT|TEXTAREA|SELECT)$/i.test(node.tagName)) return true;
      if (node.isContentEditable) return true;
      return Boolean(node.closest?.('[contenteditable="true"], .ProseMirror, #apaed, #tgs'));
    };
    const isPdfActive = (target: EventTarget | null) => {
      const panel = document.getElementById('pdfpanel');
      if (!panel?.classList.contains('open')) return false;
      const node = target as HTMLElement | null;
      return Boolean(node?.closest?.('#pdfpanel') || document.activeElement?.closest?.('#pdfpanel') || panel.matches(':hover'));
    };
    const clickPdfButton = (id: string) => {
      const button = document.getElementById(id) as HTMLElement | null;
      if (!button) return false;
      button.click();
      return true;
    };
    const focusSearch = () => {
      const bar = document.getElementById('pdfsearchbar');
      if (!bar?.classList.contains('open')) clickPdfButton('pdfSearchToggleBtn');
      window.setTimeout(() => {
        const input = document.getElementById('pdfsearchinp') as HTMLInputElement | null;
        input?.focus();
        input?.select();
      }, 20);
    };
    const scrollToEdgePage = (last: boolean) => {
      const scroll = document.getElementById('pdfscroll');
      const pages = scroll ? Array.from(scroll.querySelectorAll<HTMLElement>('.pdf-page-wrap[data-page]')) : [];
      const target = pages[last ? pages.length - 1 : 0];
      if (!scroll || !target) return false;
      scroll.scrollTo({ top: target.offsetTop, behavior: 'smooth' });
      const pageNode = document.getElementById('pdfpg');
      const page = Number(target.dataset.page || (last ? pages.length : 1));
      if (pageNode) pageNode.textContent = `${page}/${pages.length}`;
      return true;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const panel = document.getElementById('pdfpanel');
      if (!panel?.classList.contains('open')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        focusSearch();
        return;
      }
      if (!isPdfActive(event.target) || isEditableTarget(event.target)) return;
      const key = event.key;
      if (key === 'Escape') {
        const search = document.getElementById('pdfsearchbar');
        const tip = document.getElementById('hltip');
        const menu = document.getElementById('pdfctxmenu');
        if (tip?.classList.contains('show')) {
          tip.classList.remove('show');
          event.preventDefault();
          return;
        }
        if (menu?.classList.contains('show')) {
          menu.classList.remove('show');
          event.preventDefault();
          return;
        }
        if (search?.classList.contains('open')) {
          clickPdfButton('pdfSearchCloseBtn');
          event.preventDefault();
          return;
        }
        if (panel.classList.contains('fullscreen')) {
          clickPdfButton('pdffullbtn');
          event.preventDefault();
        }
        return;
      }
      if (key === 'ArrowLeft' || key === 'PageUp') {
        event.preventDefault();
        clickPdfButton('pdfPrevBtn');
        return;
      }
      if (key === 'ArrowRight' || key === 'PageDown') {
        event.preventDefault();
        clickPdfButton('pdfNextBtn');
        return;
      }
      if (key === 'Home') {
        event.preventDefault();
        scrollToEdgePage(false);
        return;
      }
      if (key === 'End') {
        event.preventDefault();
        scrollToEdgePage(true);
        return;
      }
      if (key === '+' || key === '=') {
        event.preventDefault();
        clickPdfButton('pdfZoomInBtn');
        return;
      }
      if (key === '-' || key === '_') {
        event.preventDefault();
        clickPdfButton('pdfZoomOutBtn');
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === '0') {
        event.preventDefault();
        clickPdfButton('pdfzoom');
      }
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !isPdfActive(event.target) || isEditableTarget(event.target)) return;
      event.preventDefault();
      clickPdfButton(event.deltaY < 0 ? 'pdfZoomInBtn' : 'pdfZoomOutBtn');
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('wheel', onWheel, true);
    };
  }, []);

  useEffect(() => {
    type FallbackSelection = {
      id?: string;
      text: string;
      page: number;
      rects: Array<{ x: number; y: number; w: number; h: number }>;
      color?: string;
      createdAt?: string;
    };

    const getCurrentColor = () => {
      const active = document.querySelector<HTMLElement>('#hlbar .hlc.on');
      return active?.dataset.c || active?.style.backgroundColor || '#fef08a';
    };

    const isEditablePdfTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return !!el?.closest?.('input, textarea, select, [contenteditable="true"], .pdf-annot-body');
    };

    const setFallbackToolMode = (mode: string) => {
      const win = window as any;
      const nextMode = ['annot', 'draw', 'region'].includes(mode) ? mode : '';
      win.__aqPdfToolMode = nextMode;
      const panel = document.getElementById('pdfpanel');
      if (panel) {
        if (nextMode) panel.dataset.toolMode = nextMode;
        else delete panel.dataset.toolMode;
      }
      document.getElementById('annotbtn')?.classList.toggle('on', nextMode === 'annot');
      document.getElementById('drawbtn')?.classList.toggle('on', nextMode === 'draw');
      document.getElementById('pdfRegionBtn')?.classList.toggle('on', nextMode === 'region');
      document.querySelectorAll<HTMLElement>('.pdf-page-wrap').forEach((page) => {
        page.style.cursor = nextMode ? 'crosshair' : '';
      });
      const label = nextMode === 'annot'
        ? 'Metin notu modu açık'
        : nextMode === 'draw'
          ? 'Serbest çizim modu açık'
          : nextMode === 'region'
            ? 'PDF bölgesi seçimi açık'
            : 'PDF annotation modu kapandı';
      onStatus(label);
      return nextMode;
    };

    (window as any).__aqSetPdfToolMode = setFallbackToolMode;

    const getFallbackSelection = (): FallbackSelection | null => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
      const text = selection.toString().trim();
      if (!text) return null;
      const range = selection.getRangeAt(0);
      const pageMap = new Map<number, { wrap: HTMLElement; rects: Array<{ x: number; y: number; w: number; h: number }> }>();
      Array.from(range.getClientRects()).forEach((rect) => {
        if (rect.width < 2 || rect.height < 2) return;
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const wrap = document.elementFromPoint(centerX, centerY)?.closest?.('.pdf-page-wrap') as HTMLElement | null;
        if (!wrap) return;
        const page = Number(wrap.dataset.page || wrap.dataset.pageNumber || 1);
        const bounds = wrap.getBoundingClientRect();
        const normalized = {
          x: Math.max(0, (rect.left - bounds.left) / Math.max(1, bounds.width)),
          y: Math.max(0, (rect.top - bounds.top) / Math.max(1, bounds.height)),
          w: Math.min(1, rect.width / Math.max(1, bounds.width)),
          h: Math.min(1, rect.height / Math.max(1, bounds.height))
        };
        if (!pageMap.has(page)) pageMap.set(page, { wrap, rects: [] });
        pageMap.get(page)?.rects.push(normalized);
      });
      const first = Array.from(pageMap.entries()).find(([, value]) => value.rects.length);
      if (!first) return null;
      return { text, page: first[0], rects: first[1].rects };
    };

    const getFallbackHighlights = (): FallbackSelection[] => {
      const win = window as any;
      const ref = win.__aqCurrentPdfReference || null;
      const source = Array.isArray(ref?._hlData)
        ? ref._hlData
        : (Array.isArray(win.__aqPdfFallbackHighlights) ? win.__aqPdfFallbackHighlights : []);
      return source
        .filter((item: any) => item && Array.isArray(item.rects) && item.rects.length)
        .map((item: any, index: number) => ({
          ...item,
          id: String(item.id || `hl_${Number(item.page || 1)}_${index}_${String(item.createdAt || Date.now())}`),
          text: String(item.text || ''),
          page: Number(item.page || 1),
          color: String(item.color || '#fef08a'),
          rects: Array.isArray(item.rects) ? item.rects : []
        }));
    };

    const persistFallbackHighlights = (highlights: FallbackSelection[]) => {
      const win = window as any;
      const normalized = highlights.map((item) => ({
        ...item,
        id: String(item.id || `hl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`),
        page: Number(item.page || 1),
        color: item.color || '#fef08a',
        rects: Array.isArray(item.rects) ? item.rects : [],
        text: String(item.text || '')
      }));
      win.__aqPdfFallbackHighlights = normalized.slice();
      win.hlData = normalized.slice();
      const ref = win.__aqCurrentPdfReference || null;
      if (ref) {
        ref._hlData = normalized.slice();
        try {
          const workspace = Array.isArray(win.S?.wss)
            ? win.S.wss.find((item: any) => item && item.id === win.S?.cur)
            : null;
          const linkedRef = Array.isArray(workspace?.lib)
            ? workspace.lib.find((item: any) => item && item.id === ref.id)
            : null;
          if (linkedRef && linkedRef !== ref) linkedRef._hlData = normalized.slice();
        } catch (_error) {}
      }
      saveLegacyState();
      return normalized;
    };

    const repaintFallbackHighlights = () => {
      const highlights = getFallbackHighlights();
      document.querySelectorAll<HTMLButtonElement>('.pdf-fallback-highlight-hit').forEach((node) => node.remove());
      document.querySelectorAll<HTMLCanvasElement>('.pdf-page-wrap .hl-overlay').forEach((canvas) => {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      });
      const selectedId = String((window as any).__aqSelectedPdfFallbackHighlightId || '');
      highlights.forEach((highlight, index) => {
        const wrap = document.querySelector<HTMLElement>(`.pdf-page-wrap[data-page="${highlight.page}"]`);
        const canvas = wrap?.querySelector<HTMLCanvasElement>('.hl-overlay');
        const ctx = canvas?.getContext('2d');
        if (!wrap || !canvas || !ctx) return;
        ctx.save();
        ctx.globalAlpha = 0.38;
        ctx.fillStyle = String(highlight.color || '#fef08a');
        highlight.rects.forEach((rect) => {
          const x = Number(rect.x) || 0;
          const y = Number(rect.y) || 0;
          const w = Number(rect.w) || 0;
          const h = Number(rect.h) || 0;
          ctx.fillRect(x * canvas.width, y * canvas.height, w * canvas.width, h * canvas.height);
          const hit = document.createElement('button');
          hit.type = 'button';
          hit.className = `pdf-fallback-highlight-hit${selectedId && selectedId === String(highlight.id || '') ? ' is-selected' : ''}`;
          hit.dataset.highlightId = String(highlight.id || '');
          hit.dataset.highlightIndex = String(index);
          hit.dataset.page = String(highlight.page);
          hit.dataset.text = String(highlight.text || '');
          hit.dataset.rects = JSON.stringify(highlight.rects || []);
          hit.style.left = `${x * 100}%`;
          hit.style.top = `${y * 100}%`;
          hit.style.width = `${w * 100}%`;
          hit.style.height = `${h * 100}%`;
          wrap.appendChild(hit);
        });
        ctx.restore();
      });
    };

    const updateFallbackStats = () => {
      const win = window as any;
      const highlights = getFallbackHighlights();
      const notes = Array.isArray(win.__aqPdfFallbackNotes) ? win.__aqPdfFallbackNotes : [];
      const stats = document.getElementById('pdfreadstats');
      if (stats) stats.textContent = `${highlights.length} highlight - ${notes.length} not`;
    };

    const renderFallbackAnnotationPanel = () => {
      const panel = document.getElementById('pdfannots');
      if (!panel) return;
      const win = window as any;
      const query = String(win.__aqPdfAnnotPanelQuery || '').trim().toLowerCase();
      const kindFilter = String(win.__aqPdfAnnotPanelKind || 'all');
      const colorFilter = String(win.__aqPdfAnnotPanelColor || 'all');
      const highlights = getFallbackHighlights();
      const notes = Array.isArray(win.__aqPdfFallbackNotes) ? win.__aqPdfFallbackNotes : [];
      const noteRows = notes.map((note: any, index: number) => ({
        id: String(note.noteId || `note_${index}`),
        kind: 'note',
        page: Number(note.page || 1),
        text: String(note.text || ''),
        color: String(note.color || '#dbeafe')
      }));
      const rows = highlights.map((item, index) => ({
        id: String(item.id || ''),
        index,
        kind: 'highlight',
        page: Number(item.page || 1),
        text: String(item.text || ''),
        color: String(item.color || '#fef08a')
      })).concat(noteRows as any);
      const selectedId = String(win.__aqSelectedPdfFallbackHighlightId || '');
      const colors = Array.from(new Set(rows.map((item: any) => String(item.color || '')).filter(Boolean)));
      const filteredRows = rows.filter((item: any) => {
        if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
        if (colorFilter !== 'all' && String(item.color || '') !== colorFilter) return false;
        if (query && !String(item.text || '').toLowerCase().includes(query)) return false;
        return true;
      });
      panel.innerHTML = `
        <div class="pdf-annots-head">
          <span>Annotationlar</span>
          <span>${filteredRows.length}/${rows.length} · ${highlights.length} highlight · ${notes.length} not</span>
        </div>
        <div class="pdf-annots-controls">
          <input class="pdf-annots-search" id="aqPdfAnnotPanelSearch" value="${escapeHtml(win.__aqPdfAnnotPanelQuery || '')}" placeholder="Annotationlarda ara..." />
          <div class="pdf-annots-filter">
            <button type="button" data-fallback-annot-kind="all" class="${kindFilter === 'all' ? 'on' : ''}">Tümü</button>
            <button type="button" data-fallback-annot-kind="highlight" class="${kindFilter === 'highlight' ? 'on' : ''}">Highlight</button>
            <button type="button" data-fallback-annot-kind="note" class="${kindFilter === 'note' ? 'on' : ''}">Not</button>
          </div>
          <div class="pdf-annots-colors">
            <button type="button" data-fallback-annot-color="all" class="${colorFilter === 'all' ? 'on' : ''}">Renk</button>
            ${colors.map((color) => `<button type="button" data-fallback-annot-color="${escapeHtml(color)}" class="${colorFilter === color ? 'on' : ''}" style="--annot-color:${escapeHtml(color)}" title="Bu renge göre filtrele"></button>`).join('')}
          </div>
          <div class="pdf-annots-bulk">
            <button type="button" data-fallback-annot-bulk="copy">Özeti Kopyala</button>
            <button type="button" data-fallback-annot-bulk="notes">Tümünü Notlara Aktar</button>
            <button type="button" data-fallback-annot-bulk="doc">Belgeye Özet Ekle</button>
            <button type="button" data-fallback-annot-bulk="matrix">Matrise Aktar</button>
            <button type="button" class="primary" data-fallback-annot-bulk="export">Annotationlı PDF</button>
          </div>
        </div>
        ${filteredRows.length ? `<div class="pdf-annots-list">${filteredRows.map((item: any) => `
          <article class="pdf-annot-card ${selectedId && selectedId === String(item.id || '') ? 'is-selected' : ''}" data-fallback-annot-id="${escapeHtml(item.id)}" data-fallback-annot-index="${'index' in item ? item.index : ''}" data-kind="${item.kind}">
            <div class="pdf-annot-card-title">
              <span class="pdf-annot-card-type" style="--annot-color:${escapeHtml(item.color)}">${item.kind === 'note' ? 'Not' : 'Highlight'}</span>
              <span class="pdf-annot-card-page">s. ${item.page}</span>
            </div>
            <div class="pdf-annot-card-text">${escapeHtml(item.text || '(metin yok)').slice(0, 420)}</div>
            <div class="pdf-annot-card-actions">
              <button type="button" class="aq-fallback-annot-action" data-act="jump">Git</button>
              <button type="button" class="aq-fallback-annot-action" data-act="copy">Kopyala</button>
              ${item.kind === 'highlight' ? '<button type="button" class="aq-fallback-annot-action" data-act="note">Notlara Aktar</button><button type="button" class="aq-fallback-annot-action" data-act="matrix">Matrise Gönder</button><button type="button" class="aq-fallback-annot-action" data-act="doc">Metne Aktar</button><button type="button" class="aq-fallback-annot-action danger" data-act="delete">Sil</button>' : ''}
            </div>
          </article>
        `).join('')}</div>` : '<div class="pdf-annots-empty">Bu filtrede annotation yok. PDF metni seçince highlight, alıntı notu veya serbest not burada görünür.</div>'}
      `;
    };

    const hideFallbackTip = () => {
      document.getElementById('hltip')?.classList.remove('show');
      document.getElementById('pdfctxmenu')?.classList.remove('show');
      (window as any).__aqPdfFallbackSelection = null;
      (window as any).__aqSelectedPdfFallbackHighlightId = null;
    };

    const selectFallbackHighlightText = (selection: FallbackSelection) => {
      const wrap = document.querySelector<HTMLElement>(`.pdf-page-wrap[data-page="${selection.page}"]`);
      const textLayer = wrap?.querySelector<HTMLElement>('.textLayer');
      if (!wrap || !textLayer || !selection.rects.length) return false;
      const wrapBounds = wrap.getBoundingClientRect();
      const matches: Array<{ node: Text; start: number; end: number; x: number; y: number }> = [];
      textLayer.querySelectorAll<HTMLElement>('span').forEach((span) => {
        const text = span.textContent || '';
        if (!text) return;
        const bounds = span.getBoundingClientRect();
        if (bounds.width < 1 || bounds.height < 1) return;
        const sx = (bounds.left - wrapBounds.left) / Math.max(1, wrapBounds.width);
        const sy = (bounds.top - wrapBounds.top) / Math.max(1, wrapBounds.height);
        const sw = bounds.width / Math.max(1, wrapBounds.width);
        const sh = bounds.height / Math.max(1, wrapBounds.height);
        const rect = selection.rects.find((item) => sx + sw > item.x && sx < item.x + item.w && sy + sh > item.y && sy < item.y + item.h);
        if (!rect) return;
        const left = Math.max(sx, rect.x);
        const right = Math.min(sx + sw, rect.x + rect.w);
        const start = Math.max(0, Math.floor(((left - sx) / Math.max(sw, 0.0001)) * text.length));
        const end = Math.min(text.length, Math.ceil(((right - sx) / Math.max(sw, 0.0001)) * text.length));
        const node = span.firstChild instanceof Text ? span.firstChild : document.createTextNode(text);
        if (!span.firstChild) span.appendChild(node);
        if (end > start) matches.push({ node, start, end, x: bounds.left, y: bounds.top });
      });
      if (!matches.length) return false;
      matches.sort((a, b) => (a.y - b.y) || (a.x - b.x));
      const first = matches[0];
      const last = matches[matches.length - 1];
      try {
        const range = document.createRange();
        range.setStart(first.node, Math.min(first.start, first.node.length));
        range.setEnd(last.node, Math.min(last.end, last.node.length));
        const browserSelection = window.getSelection();
        browserSelection?.removeAllRanges();
        browserSelection?.addRange(range);
        return true;
      } catch (_error) {
        return false;
      }
    };

    const focusFallbackHighlight = (selection: FallbackSelection, options: { showTip?: boolean; scroll?: boolean } = {}) => {
      if (!selection || !selection.id) return;
      const win = window as any;
      win.__aqPdfFallbackSelection = selection;
      win.__aqSelectedPdfFallbackHighlightId = selection.id;
      if (options.scroll) {
        document.querySelector<HTMLElement>(`.pdf-page-wrap[data-page="${selection.page}"]`)?.scrollIntoView({ block: 'center' });
      }
      selectFallbackHighlightText(selection);
      document.querySelectorAll<HTMLElement>('.pdf-fallback-highlight-hit.is-selected').forEach((node) => node.classList.remove('is-selected'));
      document.querySelectorAll<HTMLElement>('.pdf-annot-card.is-selected').forEach((node) => node.classList.remove('is-selected'));
      const hits = Array.from(document.querySelectorAll<HTMLElement>(`.pdf-fallback-highlight-hit[data-highlight-id="${CSS.escape(String(selection.id))}"]`));
      hits.forEach((node) => node.classList.add('is-selected'));
      const card = document.querySelector<HTMLElement>(`.pdf-annot-card[data-fallback-annot-id="${CSS.escape(String(selection.id))}"]`);
      card?.classList.add('is-selected');
      if (options.showTip) {
        const tip = document.getElementById('hltip');
        const rect = hits[0]?.getBoundingClientRect();
        if (tip && rect) {
          tip.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 220))}px`;
          tip.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 120)}px`;
          tip.classList.add('show');
        }
      }
    };

    const pushHighlightToNotes = (selection: FallbackSelection, color: string) => {
      const win = window as any;
      if (!win.S || typeof win.S !== 'object') win.S = {};
      if (!Array.isArray(win.S.notes)) win.S.notes = [];
      if (!Array.isArray(win.S.notebooks) || !win.S.notebooks.length) {
        win.S.notebooks = [{ id: 'nb1', name: 'Genel Notlar' }];
      }
      if (!win.S.curNb) win.S.curNb = win.S.notebooks[0]?.id || 'nb1';
      const ref = win.__aqCurrentPdfReference || null;
      const quote = String(selection.text || '').trim();
      if (!quote) return null;
      const note = {
        id: `note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        wsId: win.S.cur || '',
        nbId: win.S.curNb || 'nb1',
        type: 'hl',
        txt: '',
        q: quote,
        src: ref ? String(ref.title || ref.doi || ref.url || '') : '',
        rid: ref ? String(ref.id || '') : '',
        tag: `s.${selection.page}`,
        dt: new Date().toLocaleDateString('tr-TR'),
        hlColor: color,
        noteType: 'direct_quote',
        sourceExcerpt: quote,
        comment: '',
        sourcePage: `s.${selection.page}`,
        inserted: false
      };
      try {
        if (typeof win.createStructuredPdfNote === 'function') {
          const legacyNote = win.createStructuredPdfNote('direct_quote', quote, {
            source: note.src,
            referenceId: note.rid,
            pageTag: note.tag,
            dateText: note.dt,
            highlightColor: color
          });
          if (legacyNote) Object.assign(note, legacyNote);
        }
      } catch (_error) {}
      try { if (typeof win.normalizeResearchNote === 'function') win.normalizeResearchNote(note); } catch (_error) {}
      win.S.notes.unshift(note);
      try { if (typeof win.rNotes === 'function') win.rNotes(); } catch (_error) {}
      try { if (typeof win.swR === 'function') win.swR('notes', document.querySelectorAll('.rtab')[0]); } catch (_error) {}
      saveLegacyState();
      onStatus('Highlight notlara eklendi');
      return note;
    };

    const MATRIX_CONTEXT_COLUMNS = [
      { key: 'purpose', label: 'Purpose' },
      { key: 'method', label: 'Method' },
      { key: 'sample', label: 'Sample' },
      { key: 'findings', label: 'Findings' },
      { key: 'limitations', label: 'Limitations' },
      { key: 'myNotes', label: 'My Notes' }
    ];

    const sendPdfSelectionToMatrixColumn = (selection: FallbackSelection, columnKey = 'myNotes') => {
      const win = window as any;
      const ref = win.__aqCurrentPdfReference || null;
      const matrixApi = win.AQLiteratureMatrixState;
      const column = MATRIX_CONTEXT_COLUMNS.some((item) => item.key === columnKey) ? columnKey : 'myNotes';
      const label = MATRIX_CONTEXT_COLUMNS.find((item) => item.key === column)?.label || 'My Notes';
      const selectedText = String(selection?.text || '').trim();
      if (!selectedText) {
        onStatus('Matrise göndermek için önce PDF metni seçin');
        return false;
      }
      if (!ref?.id || !win.S?.cur || !matrixApi?.ensureRowForReference) {
        onStatus('Matrise aktarım için seçili kaynak gerekli');
        return false;
      }
      const ensured = matrixApi.ensureRowForReference(win.S, win.S.cur, ref, {
        uid: () => `mxr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
      });
      const row = ensured?.row;
      if (!row) {
        onStatus('Matrix satırı oluşturulamadı');
        return false;
      }
      const source = {
        page: selection.page ? String(selection.page) : '',
        snippet: selectedText.slice(0, 2000),
        section: '',
        extractionType: 'pdf-selection-context-menu',
        confidence: 1,
        updatedAt: Date.now()
      };
      if (typeof matrixApi.appendTextToCell === 'function') {
        matrixApi.appendTextToCell(win.S, win.S.cur, row.id, column, selectedText, {
          source,
          status: 'user_confirmed',
          mode: 'append'
        });
      } else if (typeof matrixApi.appendNoteToCell === 'function') {
        matrixApi.appendNoteToCell(win.S, win.S.cur, row.id, column, '', selectedText, {
          sourcePage: source.page,
          sourceSnippet: source.snippet,
          extractionType: source.extractionType,
          confidence: 1,
          status: 'user_confirmed',
          joiner: '\n\n'
        });
      } else {
        onStatus('Matrix hücre güncelleme API bulunamadı');
        return false;
      }
      try { win.AQLiteratureMatrix?.render?.(); } catch (_error) {}
      try { win.openLiteratureMatrix?.(); } catch (_error) {}
      saveLegacyState();
      onStatus(`Seçili metin ${label} hücresine gönderildi`);
      return true;
    };

    const sendHighlightToMatrix = (selection: FallbackSelection) => {
      const win = window as any;
      const noteType = String((selection as any)?.noteType || 'direct_quote');
      const matrixApi = win.AQLiteratureMatrixState;
      const column = typeof matrixApi?.inferColumnFromNoteType === 'function'
        ? matrixApi.inferColumnFromNoteType(noteType)
        : 'myNotes';
      return sendPdfSelectionToMatrixColumn(selection, column || 'myNotes');
    };
    const collectFallbackAnnots = () => Array.from(document.querySelectorAll<HTMLElement>('.pdf-page-wrap .pdf-annot')).map((el) => {
      const body = el.querySelector<HTMLElement>('.pdf-annot-body');
      return {
        id: String(el.dataset.annotId || `annot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`),
        page: Number(el.dataset.page || 1),
        x: parseFloat(el.style.left || '0') || 0,
        y: parseFloat(el.style.top || '0') || 0,
        w: el.offsetWidth || 160,
        h: el.offsetHeight || 80,
        text: String(body?.innerText || body?.textContent || '')
      };
    });

    const persistFallbackAnnots = () => {
      const win = window as any;
      const annots = collectFallbackAnnots();
      const ref = win.__aqCurrentPdfReference || null;
      if (ref) {
        ref._annots = annots;
        try {
          const workspace = Array.isArray(win.S?.wss)
            ? win.S.wss.find((item: any) => item && item.id === win.S?.cur)
            : null;
          const linkedRef = Array.isArray(workspace?.lib)
            ? workspace.lib.find((item: any) => item && item.id === ref.id)
            : null;
          if (linkedRef && linkedRef !== ref) linkedRef._annots = annots.slice();
        } catch (_error) {}
      }
      saveLegacyState();
      updateFallbackStats();
      renderFallbackAnnotationPanel();
      return annots;
    };

    const makeFallbackAnnotDraggable = (el: HTMLElement, wrap: HTMLElement) => {
      if ((el as any).__aqDragBound) return;
      (el as any).__aqDragBound = true;
      let dragging = false;
      let startX = 0;
      let startY = 0;
      let left = 0;
      let top = 0;
      el.addEventListener('pointerdown', (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest?.('.pdf-annot-body, .pdf-annot-del')) return;
        dragging = true;
        startX = event.clientX;
        startY = event.clientY;
        left = parseFloat(el.style.left || '0') || 0;
        top = parseFloat(el.style.top || '0') || 0;
        el.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      });
      el.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        const maxLeft = Math.max(0, wrap.clientWidth - el.offsetWidth);
        const maxTop = Math.max(0, wrap.clientHeight - el.offsetHeight);
        el.style.left = `${Math.max(0, Math.min(maxLeft, left + event.clientX - startX))}px`;
        el.style.top = `${Math.max(0, Math.min(maxTop, top + event.clientY - startY))}px`;
      });
      el.addEventListener('pointerup', (event) => {
        if (!dragging) return;
        dragging = false;
        el.releasePointerCapture?.(event.pointerId);
        persistFallbackAnnots();
      });
    };

    const addFallbackTextAnnot = (wrap: HTMLElement, page: number, x: number, y: number, text = '') => {
      const el = document.createElement('div');
      el.className = 'pdf-annot';
      el.tabIndex = 0;
      el.dataset.page = String(page);
      el.dataset.annotId = `annot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      el.style.left = `${Math.max(0, Math.min(x, wrap.clientWidth - 140))}px`;
      el.style.top = `${Math.max(0, Math.min(y, wrap.clientHeight - 80))}px`;
      el.style.width = '170px';
      const body = document.createElement('div');
      body.className = 'pdf-annot-body';
      body.contentEditable = 'true';
      body.spellcheck = true;
      body.innerText = text;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'pdf-annot-del';
      del.textContent = '×';
      del.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        el.remove();
        persistFallbackAnnots();
      });
      body.addEventListener('blur', persistFallbackAnnots);
      el.appendChild(body);
      el.appendChild(del);
      wrap.appendChild(el);
      makeFallbackAnnotDraggable(el, wrap);
      window.setTimeout(() => body.focus(), 0);
      persistFallbackAnnots();
      return el;
    };

    const paintFallbackHighlight = (selection: FallbackSelection, saveAsNote = false) => {
      const win = window as any;
      const color = getCurrentColor();
      const wrap = document.querySelector<HTMLElement>(`.pdf-page-wrap[data-page="${selection.page}"]`);
      const canvas = wrap?.querySelector<HTMLCanvasElement>('.hl-overlay');
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return false;
      const existingId = String(selection.id || '');
      if (existingId && getFallbackHighlights().some((item) => String(item.id) === existingId)) {
        focusFallbackHighlight(selection, { showTip: true });
        if (saveAsNote) pushHighlightToNotes(selection, selection.color || color);
        document.getElementById('pdfctxmenu')?.classList.remove('show');
        updateFallbackStats();
        renderFallbackAnnotationPanel();
        return true;
      }
      ctx.save();
      ctx.globalAlpha = 0.38;
      ctx.fillStyle = color;
      selection.rects.forEach((rect) => {
        ctx.fillRect(rect.x * canvas.width, rect.y * canvas.height, rect.w * canvas.width, rect.h * canvas.height);
      });
      ctx.restore();
      const storedHighlight = {
        ...selection,
        id: selection.id || `hl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        color,
        createdAt: new Date().toISOString()
      };
      persistFallbackHighlights(getFallbackHighlights().concat([storedHighlight]));
      repaintFallbackHighlights();
      focusFallbackHighlight(storedHighlight, { showTip: true });
      if (saveAsNote) {
        if (!Array.isArray(win.__aqPdfFallbackNotes)) win.__aqPdfFallbackNotes = [];
        const savedNote = pushHighlightToNotes(selection, color);
        win.__aqPdfFallbackNotes.push({ text: selection.text, page: selection.page, color, noteId: savedNote?.id || '' });
        const panel = document.getElementById('pdfannots');
        if (panel) panel.style.display = 'block';
      }
      updateFallbackStats();
      renderFallbackAnnotationPanel();
      document.getElementById('pdfctxmenu')?.classList.remove('show');
      return true;
    };
    (window as any).__aqApplyPdfFallbackHighlight = (saveAsNote = false) => {
      const selection = (window as any).__aqPdfFallbackSelection as FallbackSelection | null;
      return selection ? paintFallbackHighlight(selection, Boolean(saveAsNote)) : false;
    };

    const showContextMenu = (event: Event) => {
      const pointer = event as PointerEvent;
      const target = event.target as HTMLElement | null;
      if (!target?.closest('#pdfscroll')) return;
      const menu = document.getElementById('pdfctxmenu');
      if (!menu) return;
      event.preventDefault();
      event.stopPropagation();
      const selection = getFallbackSelection();
      (window as any).__aqPdfFallbackSelection = selection;
      menu.style.left = `${Math.min(pointer.clientX, window.innerWidth - 220)}px`;
      menu.style.top = `${Math.min(pointer.clientY, window.innerHeight - 220)}px`;
      menu.classList.add('show');
      menu.querySelectorAll<HTMLButtonElement>('[data-needs-selection]').forEach((button) => {
        button.disabled = !selection;
      });
    };

    const onMenuClick = (event: Event) => {
      const button = (event.target as HTMLElement | null)?.closest?.('[data-pdf-context-action]') as HTMLElement | null;
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const win = window as any;
      const action = String(button.dataset.pdfContextAction || '');
      const selection = (win.__aqPdfFallbackSelection as FallbackSelection | null) || getFallbackSelection();
      if (action === 'copy' && selection) {
        navigator.clipboard?.writeText(selection.text).catch(() => undefined);
        document.getElementById('pdfctxmenu')?.classList.remove('show');
        return;
      }
      if (action === 'highlight' && selection) {
        let handled = false;
        try { handled = Boolean(win.doHL?.(false)); } catch (_error) { handled = false; }
        if (!handled) paintFallbackHighlight(selection, false);
        return;
      }
      if (action === 'note' && selection) {
        let handled = false;
        try { handled = Boolean(win.doHL?.(true, 'direct_quote')); } catch (_error) { handled = false; }
        if (!handled) paintFallbackHighlight(selection, true);
        return;
      }
      if (action === 'matrix' && selection) {
        sendPdfSelectionToMatrixColumn(selection, String(button.dataset.matrixColumn || 'myNotes'));
        document.getElementById('pdfctxmenu')?.classList.remove('show');
        return;
      }
      if (action === 'annots') {
        const panel = document.getElementById('pdfannots');
        if (panel) {
          panel.style.display = 'block';
          renderFallbackAnnotationPanel();
        }
        document.getElementById('pdfctxmenu')?.classList.remove('show');
        return;
      }
      if (action === 'delete') {
        const id = String(win.__aqSelectedPdfFallbackHighlightId || selection?.id || '');
        if (id) {
          persistFallbackHighlights(getFallbackHighlights().filter((item) => String(item.id) !== id));
          repaintFallbackHighlights();
          renderFallbackAnnotationPanel();
          updateFallbackStats();
          hideFallbackTip();
        }
        return;
      }
      if (action === 'close') {
        document.getElementById('pdfctxmenu')?.classList.remove('show');
      }
    };

    const onMouseUp = (event: Event) => {
      const pointerEvent = event as globalThis.MouseEvent;
      if (pointerEvent.button === 2) return;
      const target = event.target as HTMLElement | null;
      const hit = target?.closest?.('.pdf-fallback-highlight-hit') as HTMLElement | null;
      if (hit) {
        const rects = (() => {
          try { return JSON.parse(String(hit.dataset.rects || '[]')); } catch (_error) { return []; }
        })();
        const selection = {
          id: String(hit.dataset.highlightId || ''),
          text: String(hit.dataset.text || ''),
          page: Number(hit.dataset.page || 1),
          rects: Array.isArray(rects) ? rects : []
        };
        focusFallbackHighlight(selection, { showTip: false });
        hideFallbackTip();
        return;
      }
      const pointer = event as globalThis.MouseEvent;
      const pageWrap = target?.closest?.('.pdf-page-wrap') as HTMLElement | null;
      const activeSelection = getFallbackSelection();
      if (!activeSelection && pageWrap && !target?.closest?.('#hltip, #pdfctxmenu, .pdf-annot')) {
        const bounds = pageWrap.getBoundingClientRect();
        const x = (pointer.clientX - bounds.left) / Math.max(1, bounds.width);
        const y = (pointer.clientY - bounds.top) / Math.max(1, bounds.height);
        const page = Number(pageWrap.dataset.page || 1);
        const selected = getFallbackHighlights().find((item) => (
          Number(item.page || 1) === page
          && Array.isArray(item.rects)
          && item.rects.some((rect) => (
            x >= Number(rect.x || 0)
            && x <= Number(rect.x || 0) + Number(rect.w || 0)
            && y >= Number(rect.y || 0)
            && y <= Number(rect.y || 0) + Number(rect.h || 0)
          ))
        ));
        if (selected) {
          focusFallbackHighlight(selected, { showTip: false });
          hideFallbackTip();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
      window.setTimeout(() => {
        const selection = getFallbackSelection();
        if (!selection) {
          hideFallbackTip();
          return;
        }
        (window as any).__aqPdfFallbackSelection = selection;
        hideFallbackTip();
      }, 60);
    };

    const onDocumentClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('#pdfctxmenu')) document.getElementById('pdfctxmenu')?.classList.remove('show');
      if (target?.id === 'hlCloseBtn') {
        hideFallbackTip();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if ((target?.id === 'hlToNoteBtn' || target?.id === 'hlOnlyBtn') && (window as any).__aqPdfFallbackSelection) {
        const selection = (window as any).__aqPdfFallbackSelection as FallbackSelection;
        const handled = paintFallbackHighlight(selection, target.id === 'hlToNoteBtn');
        if (handled) {
          event.preventDefault();
          event.stopPropagation();
        }
      }
      if (target?.id === 'hlCopyBtn' && (window as any).__aqPdfFallbackSelection) {
        const selection = (window as any).__aqPdfFallbackSelection as FallbackSelection;
        navigator.clipboard?.writeText(selection.text).catch(() => undefined);
        hideFallbackTip();
        event.preventDefault();
        event.stopPropagation();
      }
      if (target?.id === 'hlDeleteBtn') {
        const id = String((window as any).__aqSelectedPdfFallbackHighlightId || '');
        if (id) {
          persistFallbackHighlights(getFallbackHighlights().filter((item) => String(item.id) !== id));
          repaintFallbackHighlights();
          renderFallbackAnnotationPanel();
          updateFallbackStats();
          hideFallbackTip();
          event.preventDefault();
          event.stopPropagation();
        }
      }
      const kindFilterBtn = target?.closest?.('#pdfannots [data-fallback-annot-kind]') as HTMLElement | null;
      if (kindFilterBtn) {
        (window as any).__aqPdfAnnotPanelKind = String(kindFilterBtn.dataset.fallbackAnnotKind || 'all');
        renderFallbackAnnotationPanel();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const colorFilterBtn = target?.closest?.('#pdfannots [data-fallback-annot-color]') as HTMLElement | null;
      if (colorFilterBtn) {
        (window as any).__aqPdfAnnotPanelColor = String(colorFilterBtn.dataset.fallbackAnnotColor || 'all');
        renderFallbackAnnotationPanel();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const fallbackAction = target?.closest?.('#pdfannots .aq-fallback-annot-action') as HTMLElement | null;
      if (fallbackAction) {
        const card = fallbackAction.closest<HTMLElement>('[data-fallback-annot-id]');
        const id = String(card?.dataset.fallbackAnnotId || '');
        const item = getFallbackHighlights().find((entry) => String(entry.id) === id);
        const action = String(fallbackAction.dataset.act || '');
        if (item) {
          if (action === 'jump') {
            document.querySelector<HTMLElement>(`.pdf-page-wrap[data-page="${item.page}"]`)?.scrollIntoView({ block: 'center' });
            focusFallbackHighlight(item, { showTip: true });
          } else if (action === 'copy') {
            navigator.clipboard?.writeText(item.text || '').catch(() => undefined);
            onStatus('Highlight kopyalandı');
          } else if (action === 'note') {
            pushHighlightToNotes(item, item.color || getCurrentColor());
          } else if (action === 'matrix') {
            sendHighlightToMatrix(item);
          } else if (action === 'doc') {
            try {
              const text = item.text ? `<blockquote>${escapeHtml(item.text)}</blockquote>` : '';
              if (text && typeof (window as any).iHTML === 'function') (window as any).iHTML(text);
              onStatus('Highlight belgeye aktarıldı');
            } catch (_error) {}
          } else if (action === 'delete') {
            persistFallbackHighlights(getFallbackHighlights().filter((entry) => String(entry.id) !== id));
            repaintFallbackHighlights();
            onStatus('Highlight silindi');
          }
          renderFallbackAnnotationPanel();
          updateFallbackStats();
          event.preventDefault();
          event.stopPropagation();
        }
      }
      const fallbackBulk = target?.closest?.('#pdfannots [data-fallback-annot-bulk]') as HTMLElement | null;
      if (fallbackBulk) {
        const action = String(fallbackBulk.dataset.fallbackAnnotBulk || '');
        const highlights = getFallbackHighlights();
        if (action === 'copy') {
          navigator.clipboard?.writeText(highlights.map((item) => `s. ${item.page}: ${item.text}`).join('\n\n')).catch(() => undefined);
        } else if (action === 'notes') {
          highlights.forEach((item) => pushHighlightToNotes(item, item.color || getCurrentColor()));
          updateFallbackStats();
        } else if (action === 'matrix') {
          highlights.forEach((item) => sendHighlightToMatrix(item));
        } else if (action === 'doc') {
          const html = highlights.map((item) => `<p><strong>s. ${item.page}</strong> ${escapeHtml(item.text)}</p>`).join('');
          try { if (html && typeof (window as any).iHTML === 'function') (window as any).iHTML(`<section><h2>PDF Notları</h2>${html}</section>`); } catch (_error) {}
        } else if (action === 'export') {
          try { (window as any).exportAnnotatedPdf?.(); } catch (_error) {}
        }
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const onDocumentPointerDown = (event: Event) => {
      const pointer = event as PointerEvent;
      if (pointer.button === 2) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('#hltip, #pdfctxmenu, .pdf-fallback-highlight-hit')) return;
      hideFallbackTip();
    };

    let drawSession: { wrap: HTMLElement; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; lastX: number; lastY: number } | null = null;
    let regionSession: { wrap: HTMLElement; el: HTMLElement; startX: number; startY: number; page: number } | null = null;

    const pointInWrap = (wrap: HTMLElement, event: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
        y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
        rect
      };
    };

    const onPdfPointerDown = (event: Event) => {
      const pointer = event as PointerEvent;
      const target = pointer.target as HTMLElement | null;
      const wrap = target?.closest?.('.pdf-page-wrap') as HTMLElement | null;
      const mode = String((window as any).__aqPdfToolMode || '');
      if (!wrap || !mode || target?.closest?.('.pdf-annot, #hltip, #pdfctxmenu')) return;
      const page = Number(wrap.dataset.page || 1);
      const point = pointInWrap(wrap, pointer);
      if (mode === 'annot') {
        addFallbackTextAnnot(wrap, page, point.x, point.y);
        pointer.preventDefault();
        pointer.stopPropagation();
        return;
      }
      if (mode === 'draw') {
        const canvas = wrap.querySelector<HTMLCanvasElement>('.draw-overlay');
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        const dpr = window.devicePixelRatio || 1;
        const nextWidth = Math.max(1, Math.floor(wrap.clientWidth * dpr));
        const nextHeight = Math.max(1, Math.floor(wrap.clientHeight * dpr));
        if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
          const previous = canvas.toDataURL('image/png');
          canvas.width = nextWidth;
          canvas.height = nextHeight;
          const img = new Image();
          img.onload = () => ctx.drawImage(img, 0, 0, wrap.clientWidth, wrap.clientHeight);
          img.src = previous;
        }
        canvas.style.width = `${wrap.clientWidth}px`;
        canvas.style.height = `${wrap.clientHeight}px`;
        canvas.style.pointerEvents = 'none';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.strokeStyle = String((document.getElementById('pdfDrawColor') as HTMLInputElement | null)?.value || '#c9453e');
        ctx.lineWidth = Number((document.getElementById('pdfDrawWidth') as HTMLSelectElement | null)?.value || 2.5);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        drawSession = { wrap, canvas, ctx, lastX: point.x, lastY: point.y };
        pointer.preventDefault();
        pointer.stopPropagation();
        return;
      }
      if (mode === 'region') {
        const el = document.createElement('div');
        el.className = 'pdf-region-selection';
        el.style.left = `${point.x}px`;
        el.style.top = `${point.y}px`;
        el.style.width = '1px';
        el.style.height = '1px';
        wrap.appendChild(el);
        regionSession = { wrap, el, startX: point.x, startY: point.y, page };
        pointer.preventDefault();
        pointer.stopPropagation();
      }
    };

    const onPdfPointerMove = (event: Event) => {
      const pointer = event as PointerEvent;
      if (drawSession) {
        const point = pointInWrap(drawSession.wrap, pointer);
        drawSession.ctx.beginPath();
        drawSession.ctx.moveTo(drawSession.lastX, drawSession.lastY);
        drawSession.ctx.lineTo(point.x, point.y);
        drawSession.ctx.stroke();
        drawSession.lastX = point.x;
        drawSession.lastY = point.y;
        pointer.preventDefault();
        return;
      }
      if (regionSession) {
        const point = pointInWrap(regionSession.wrap, pointer);
        const x = Math.min(regionSession.startX, point.x);
        const y = Math.min(regionSession.startY, point.y);
        const w = Math.abs(point.x - regionSession.startX);
        const h = Math.abs(point.y - regionSession.startY);
        regionSession.el.style.left = `${x}px`;
        regionSession.el.style.top = `${y}px`;
        regionSession.el.style.width = `${w}px`;
        regionSession.el.style.height = `${h}px`;
        pointer.preventDefault();
      }
    };

    const onPdfPointerUp = (event: Event) => {
      if (drawSession) {
        const win = window as any;
        const ref = win.__aqCurrentPdfReference || null;
        const page = String(drawSession.wrap.dataset.page || '1');
        if (ref) {
          if (!ref._drawings) ref._drawings = {};
          ref._drawings[page] = drawSession.canvas.toDataURL('image/png');
          saveLegacyState();
        }
        drawSession = null;
        event.preventDefault();
        return;
      }
      if (regionSession) {
        const bounds = {
          x: parseFloat(regionSession.el.style.left || '0') || 0,
          y: parseFloat(regionSession.el.style.top || '0') || 0,
          w: regionSession.el.offsetWidth || 0,
          h: regionSession.el.offsetHeight || 0
        };
        if (bounds.w < 8 || bounds.h < 8) {
          regionSession.el.remove();
        } else {
          addFallbackTextAnnot(
            regionSession.wrap,
            regionSession.page,
            Math.min(bounds.x + bounds.w + 8, regionSession.wrap.clientWidth - 180),
            bounds.y,
            `PDF bölgesi · s.${regionSession.page}`
          );
        }
        regionSession = null;
        event.preventDefault();
      }
    };

    const onKeyDown = (event: Event) => {
      const keyboard = event as KeyboardEvent;
      const key = keyboard.key.toLowerCase();
      const panelOpen = document.getElementById('pdfpanel')?.classList.contains('open');
      if (keyboard.key === 'Escape') {
        hideFallbackTip();
        if ((window as any).__aqPdfToolMode) {
          setFallbackToolMode('');
          keyboard.preventDefault();
        }
      }
      if (panelOpen && !isEditablePdfTarget(keyboard.target) && !keyboard.ctrlKey && !keyboard.metaKey && !keyboard.altKey) {
        if (key === 'a') {
          setFallbackToolMode((window as any).__aqPdfToolMode === 'annot' ? '' : 'annot');
          keyboard.preventDefault();
          return;
        }
        if (key === 'd') {
          setFallbackToolMode((window as any).__aqPdfToolMode === 'draw' ? '' : 'draw');
          keyboard.preventDefault();
          return;
        }
        if (key === 'r') {
          setFallbackToolMode((window as any).__aqPdfToolMode === 'region' ? '' : 'region');
          keyboard.preventDefault();
          return;
        }
        if (key === 'h') {
          const selection = (window as any).__aqPdfFallbackSelection || getFallbackSelection();
          if (selection) {
            paintFallbackHighlight(selection, false);
            keyboard.preventDefault();
            return;
          }
        }
        if (key === 'n') {
          const selection = (window as any).__aqPdfFallbackSelection || getFallbackSelection();
          if (selection) {
            paintFallbackHighlight(selection, true);
            keyboard.preventDefault();
            return;
          }
        }
      }
      if ((keyboard.key === 'Delete' || keyboard.key === 'Backspace') && (window as any).__aqSelectedPdfFallbackHighlightId) {
        const active = document.activeElement as HTMLElement | null;
        if (active?.closest?.('.pdf-annot-body, input, textarea, [contenteditable="true"]')) return;
        persistFallbackHighlights(getFallbackHighlights().filter((item) => String(item.id) !== String((window as any).__aqSelectedPdfFallbackHighlightId)));
        repaintFallbackHighlights();
        renderFallbackAnnotationPanel();
        updateFallbackStats();
        hideFallbackTip();
        keyboard.preventDefault();
      }
    };

    const onPdfScroll = () => {
      const tip = document.getElementById('hltip');
      if (tip?.classList.contains('show') && !tip.matches(':hover')) hideFallbackTip();
    };

    const onPanelInput = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      if (target?.id !== 'aqPdfAnnotPanelSearch') return;
      (window as any).__aqPdfAnnotPanelQuery = String(target.value || '');
      renderFallbackAnnotationPanel();
      window.setTimeout(() => {
        const next = document.getElementById('aqPdfAnnotPanelSearch') as HTMLInputElement | null;
        if (!next) return;
        next.focus();
        try { next.setSelectionRange(next.value.length, next.value.length); } catch (_error) {}
      }, 0);
    };

    document.addEventListener('contextmenu', showContextMenu, true);
    document.addEventListener('click', onMenuClick, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('input', onPanelInput, true);
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    document.addEventListener('pointerdown', onPdfPointerDown, true);
    document.addEventListener('pointermove', onPdfPointerMove, true);
    document.addEventListener('pointerup', onPdfPointerUp, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.getElementById('pdfscroll')?.addEventListener('scroll', onPdfScroll, { passive: true });
    return () => {
      document.removeEventListener('contextmenu', showContextMenu, true);
      document.removeEventListener('click', onMenuClick, true);
      document.removeEventListener('mouseup', onMouseUp, true);
      document.removeEventListener('click', onDocumentClick, true);
      document.removeEventListener('input', onPanelInput, true);
      document.removeEventListener('pointerdown', onDocumentPointerDown, true);
      document.removeEventListener('pointerdown', onPdfPointerDown, true);
      document.removeEventListener('pointermove', onPdfPointerMove, true);
      document.removeEventListener('pointerup', onPdfPointerUp, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.getElementById('pdfscroll')?.removeEventListener('scroll', onPdfScroll);
      delete (window as any).__aqApplyPdfFallbackHighlight;
      delete (window as any).__aqSetPdfToolMode;
    };
  }, []);

  const call = (name: string, ...args: unknown[]) => {
    const fn = (window as any)[name];
    if (typeof fn !== 'function') {
      onStatus(`${name} hazır değil`);
      return;
    }
    try {
      fn(...args);
    } catch (error) {
      console.error('[legacy-host]', name, error);
      onStatus(`${name} çalıştırılamadı`);
    }
  };

  return (
    <>
      <div className="hidden" aria-hidden="true">
        <div id="dst" />
        <input id="libsrch" />
        <div id="liblist" />
        <div id="reflist" />
        <button id="doiFetchBtn" type="button" />
        <button id="batchOABtn" type="button" />
        <button id="batchCiteBtn" type="button" />
      </div>
      <input id="lfinp" type="file" accept="application/pdf,.pdf" multiple hidden onChange={(event) => callFileHandler('hPDFs', event, onStatus)} />
      <input id="bibinp" type="file" accept=".bib,.ris,.txt,.enw,application/x-bibtex,application/x-research-info-systems" hidden onChange={(event) => importBibliographyFile(event, onStatus)} />
      <input id="zoteroinp" type="file" accept=".json,.rdf,.bib,.ris" hidden onChange={(event) => callFileHandler('importZotero', event, onStatus)} />
      <input id="wordinp" type="file" accept=".doc,.docx,.html,.htm,.rtf,.txt" hidden onChange={(event) => importWordFileDirect(event, onStatus)} />
      <input id="imginp" type="file" accept="image/*" hidden onChange={(event) => insertImageFile(event, onStatus)} />

      <section id="pdfpanel" className="aq-legacy-pdf-panel" aria-label="PDF viewer">
        <div id="pdfresize" className="aq-legacy-pdf-resize" title="Genislik ayarla" />
        <div id="pdftb" className="aq-legacy-pdf-toolbar">
          <div className="pdf-brand">
            <span className="pdf-kicker">PDF Reader</span>
            <span id="pdftitle" className="aq-legacy-pdf-title">-- kaynak seç --</span>
          </div>
          <div className="pdf-toolbar-group compact" aria-label="Sayfa gezinme">
            <button className="ppb" id="pdfPrevBtn" type="button" title="Önceki sayfa" onClick={() => (window as any).pPrev?.()}>◀</button>
            <span id="pdfpg" role="button" tabIndex={0} title="Sayfaya git" onClick={() => (window as any).goToPage?.()}>--</span>
            <button className="ppb" id="pdfNextBtn" type="button" title="Sonraki sayfa" onClick={() => (window as any).pNext?.()}>▶</button>
          </div>
          <div className="pdf-toolbar-group compact" aria-label="Zoom">
            <button className="ppb" id="pdfZoomOutBtn" type="button" title="Uzaklaştır" onClick={() => (window as any).pZO?.()}>-</button>
            <span id="pdfzoom" role="button" tabIndex={0} title="Genişliğe sığdır" onClick={() => (window as any).pZFit?.()}>--</span>
            <button className="ppb" id="pdfZoomInBtn" type="button" title="Yakınlaştır" onClick={() => (window as any).pZI?.()}>+</button>
          </div>
          <div className="pdf-toolbar-spacer" />
          <div className="pdf-toolbar-window" aria-label="Pencere">
            <button className="ppb" id="pdffullbtn" type="button" title="Tam ekran" onClick={() => (window as any).togglePdfFullscreen?.()}>⛶</button>
            <button className="ppb pdf-close-btn" id="pdfclosebtn" type="button" title="Kapat" onClick={() => (window as any).togglePDF?.()}>×</button>
          </div>
        </div>
        <div id="pdftabs" className="aq-legacy-pdf-tabs" />
        <div id="pdfsearchbar" className="aq-legacy-pdf-search">
          <input id="pdfsearchinp" placeholder="PDF içinde ara..." onKeyDown={(event) => {
            if (event.key === 'Enter') (window as any).pdfSearchNext?.();
            if (event.key === 'Escape') (window as any).togglePdfSearch?.();
          }} />
          <span id="pdfsearchcount">--</span>
          <button id="pdfSearchPrevBtn" type="button" onClick={() => (window as any).pdfSearchPrev?.()}>Önceki</button>
          <button id="pdfSearchNextBtn" type="button" onClick={() => (window as any).pdfSearchNext?.()}>Sonraki</button>
          <button id="pdfSearchCloseBtn" type="button" onClick={() => (window as any).togglePdfSearch?.()}>Kapat</button>
        </div>
        <div id="hlbar" className="aq-legacy-pdf-tools">
          <div className="pdf-tools-group" aria-label="Görünüm">
            <button className="ppb" id="pdfSearchToggleBtn" type="button" title="PDF içinde ara" onClick={() => (window as any).togglePdfSearch?.()}>🔍</button>
            <button className="ppb" id="pdfThumbsToggleBtn" type="button" title="Küçük resimler" onClick={() => (window as any).toggleThumbs?.()}>☷</button>
            <button className="ppb" id="pdfOutlineToggleBtn" type="button" title="İçerik tablosu" onClick={() => (window as any).toggleOutline?.()}>≡</button>
            <button className="ppb" id="pdfAnnotsToggleBtn" type="button" title="Notlar ve highlightlar" onClick={() => (window as any).togglePdfAnnotations?.()}>✍</button>
            <button className="ppb pdf-pill" id="pdfRelatedToggleBtn" type="button" title="Benzer makaleler" onClick={() => (window as any).togglePdfRelated?.()}>🔗 Benzer</button>
          </div>
          <div className="pdf-tools-divider" />
          <div className="pdf-tools-group" aria-label="Highlight">
            {['#fef08a', '#86efac', '#93c5fd', '#fca5a5'].map((color, index) => (
              <button
                key={color}
                type="button"
                className={`hlc${index === 0 ? ' on' : ''}`}
                data-c={color}
                style={{ background: color }}
                title="Highlight rengi"
                onClick={(event) => (window as any).setHLC?.(event.currentTarget)}
              />
            ))}
          </div>
          <div className="pdf-tools-divider" />
          <div className="pdf-tools-group" aria-label="Not ve kalem">
            <button className="ppb" id="annotbtn" type="button" title="Metin notu ekle" onClick={() => (window as any).toggleAnnotMode?.()}>✎</button>
            <button className="ppb" id="drawbtn" type="button" title="Serbest cizim" onClick={() => (window as any).toggleDrawMode?.()}>✏</button>
            <input id="pdfDrawColor" className="pdf-draw-color" type="color" defaultValue="#c9453e" title="Çizim rengi" onChange={(event) => (window as any).setPdfDrawColor?.(event.target.value)} />
            <button className="ppb" id="pdfRegionBtn" type="button" title="PDF bölgesi seç" onClick={() => (window as any).togglePdfRegionCaptureMode?.()}>▢</button>
            <select id="pdfDrawWidth" className="pdf-draw-width" title="Çizim kalınlığı" defaultValue="2.5" onChange={(event) => (window as any).setPdfDrawWidth?.(event.target.value)}>
              <option value="1.5">Ince</option>
              <option value="2.5">Orta</option>
              <option value="4">Kalin</option>
              <option value="7">Marker</option>
            </select>
            <button className="ppb" id="pdfDrawClearBtn" type="button" title="Bu sayfadaki çizimi temizle" onClick={() => (window as any).clearPdfDrawingPage?.()}>🗑</button>
          </div>
          <div className="pdf-tools-spacer" />
          <button className="ppb" id="pdfUploadBtn" type="button" title="PDF yükle" onClick={() => document.getElementById('lfinp')?.click()}>+</button>
        </div>
        <div id="pdfreaderbar" className="aq-legacy-pdf-status">
          <div className="pdf-reader-line">
            <span id="pdfreadmeta">PDF bekleniyor</span>
            <span id="pdfreadstats">0 highlight - 0 not</span>
            <span id="pdfReaderStatus" />
          </div>
          <span id="pdfprogress"><i id="pdfprogressbar" /></span>
        </div>
        <div id="pdfbody" className="aq-legacy-pdf-body">
          <aside id="pdfthumbs" className="aq-legacy-pdf-side" style={{ display: 'none' }} />
          <aside id="pdfoutline" className="aq-legacy-pdf-side" style={{ display: 'none' }} />
          <aside id="pdfannots" className="aq-legacy-pdf-annots" style={{ display: 'none' }} />
          <aside id="pdfrelated" className="aq-legacy-pdf-side" style={{ display: 'none' }} />
          <div id="pdfscroll" className="aq-legacy-pdf-scroll">
            <div id="pdfempty" className="aq-legacy-pdf-empty">
              <div>PDF yükle veya kütüphaneden seç</div>
              <button id="pdfEmptyUploadBtn" type="button" onClick={() => document.getElementById('lfinp')?.click()}>PDF Yükle</button>
            </div>
          </div>
        </div>
      </section>

      <div id="hltip" role="menu">
        <button className="htb htb-primary" id="hlToNoteBtn" type="button" onClick={() => call('doHL', true)}>Nota kaydet</button>
        <button className="htb" id="hlOnlyBtn" type="button" onClick={() => call('doHL', false)}>Highlight</button>
        <button className="htb" id="hlCopyBtn" type="button">Kopyala</button>
        <button className="htb htb-danger" id="hlDeleteBtn" type="button">Sil</button>
        <button className="htb htb-ghost" id="hlCloseBtn" type="button" onClick={() => call('hideHLtip')}>Kapat</button>
      </div>

      <div id="pdfctxmenu" className="aq-pdf-context-menu" role="menu">
        <button type="button" data-pdf-context-action="highlight" data-needs-selection="true">Highlight</button>
        <button type="button" data-pdf-context-action="note" data-needs-selection="true">Nota kaydet</button>
        <button type="button" data-pdf-context-action="copy" data-needs-selection="true">Seçimi kopyala</button>
        <div className="aq-pdf-context-submenu" role="none">
          <button type="button" data-pdf-context-action="matrix-menu" data-needs-selection="true">Matrise gönder ›</button>
          <div className="aq-pdf-context-submenu-panel" role="menu">
            <button type="button" data-pdf-context-action="matrix" data-matrix-column="purpose" data-needs-selection="true">Purpose</button>
            <button type="button" data-pdf-context-action="matrix" data-matrix-column="method" data-needs-selection="true">Method</button>
            <button type="button" data-pdf-context-action="matrix" data-matrix-column="sample" data-needs-selection="true">Sample</button>
            <button type="button" data-pdf-context-action="matrix" data-matrix-column="findings" data-needs-selection="true">Findings</button>
            <button type="button" data-pdf-context-action="matrix" data-matrix-column="limitations" data-needs-selection="true">Limitations</button>
            <button type="button" data-pdf-context-action="matrix" data-matrix-column="myNotes" data-needs-selection="true">My Notes</button>
          </div>
        </div>
        <button type="button" data-pdf-context-action="delete">Seçili highlight'ı sil</button>
        <button type="button" data-pdf-context-action="annots">Highlight / not paneli</button>
        <button type="button" data-pdf-context-action="close">Kapat</button>
      </div>

      <div id="trig">
        <div className="tgh"><span className="tgtag">Kaynak Seç</span><span id="tgq" /><span id="tgsel" /></div>
        <div className="tgmodes">
          <button className="tgm on" id="citationInlineModeBtn" type="button" onClick={(event) => call('setCM', 'inline', event.currentTarget)}>(Yazar, Yıl)</button>
          <button className="tgm" id="citationFootnoteModeBtn" type="button" onClick={(event) => call('setCM', 'footnote', event.currentTarget)}>Dipnot*</button>
        </div>
        <input id="tgs" type="text" placeholder="Yazar, başlık, yıl..." />
        <div id="tgl" />
        <div className="tghint">Oklarla gez, Enter metne ekle, Esc kapat</div>
      </div>

      <div id="ctxmenu" />
      <div id="folderCtxmenu" />
      <div id="mn-layer" />
      <div id="mn-mode-hint">
        <span>Kenar notu modu açık</span>
        <span>Belgede bir paragrafa tıklayın</span>
      </div>

      <div className="modal-bg" id="promptModal">
        <div className="modal aq-legacy-modal-sm">
          <div className="mt" id="promptTitle">Giris</div>
          <input className="minp" id="promptInput" />
          <div className="mb">
            <button className="mbtn s" id="promptCancelBtn" type="button" onClick={() => call('resolvePrompt', false)}>Iptal</button>
            <button className="mbtn p" id="promptConfirmBtn" type="button" onClick={() => call('resolvePrompt', true)}>Tamam</button>
          </div>
        </div>
      </div>

      <div className="modal-bg" id="collectionModal">
        <div className="modal aq-legacy-modal-md">
          <div className="mt">Klasörler</div>
          <div className="wr">
            <div className="wf"><label>Yeni Klasör</label><input type="text" id="collectionNameInp" placeholder="Örn. Literatür Taramas?" /></div>
            <button className="mbtn p" id="collectionCreateBtn" type="button" onClick={() => call('createCollectionFromInput')}>Olustur</button>
          </div>
          <div id="collectionList" />
          <div className="mb">
            <button className="mbtn s" id="collectionCloseBtn" type="button" onClick={() => call('hideM', 'collectionModal')}>Kapat</button>
          </div>
        </div>
      </div>

      <div className="modal-bg" id="wiz">
        <div className="modal aq-legacy-modal-sm">
          <div className="mt">APA 7 Tablo Ekle</div>
          <div className="wr aq-legacy-grid-3">
            <div className="wf"><label>No</label><input type="number" id="wtn" defaultValue="1" min="1" /></div>
            <div className="wf"><label>Sutun</label><input type="number" id="wtc" defaultValue="3" min="2" max="10" /></div>
            <div className="wf"><label>Satir</label><input type="number" id="wtr" defaultValue="4" min="2" max="30" /></div>
          </div>
          <div className="wr"><div className="wf"><label>Başlık</label><input type="text" id="wtt" /></div></div>
          <div className="wr"><div className="wf"><label>Not</label><input type="text" id="wtn2" /></div></div>
          <div className="mb">
            <button className="mbtn s" id="wizCancelBtn" type="button" onClick={() => hideLegacyModal('wiz')}>Iptal</button>
            <button
              className="mbtn p"
              id="wizInsertBtn"
              type="button"
              onClick={(event) => {
                const button = event.currentTarget as HTMLButtonElement & { __aqTableWizardBound?: boolean };
                if (button.__aqTableWizardBound) return;
                insertTableFromWizard(onStatus);
              }}
            >
              Ekle
            </button>
          </div>
        </div>
      </div>

      <div className="modal-bg" id="covermodal">
        <div className="modal aq-legacy-modal-sm">
          <div className="mt">APA 7 Kapak Sayfasi</div>
          <div className="wr"><div className="wf"><label>Makale Basligi *</label><input type="text" id="cvtitle" /></div></div>
          <div className="wr"><div className="wf"><label>Yazar(lar)</label><input type="text" id="cvauthor" /></div></div>
          <div className="wr"><div className="wf"><label>Kurum</label><input type="text" id="cvinst" /></div></div>
          <div className="wr">
            <div className="wf"><label>Ders</label><input type="text" id="cvcourse" /></div>
            <div className="wf"><label>Ogretim Uyesi</label><input type="text" id="cvprof" /></div>
          </div>
          <div className="mb">
            <button className="mbtn s" id="coverCancelBtn" type="button" onClick={() => call('hideM', 'covermodal')}>Iptal</button>
            <button className="mbtn p" id="coverInsertBtn" type="button" onClick={() => call('doCover')}>Ekle</button>
          </div>
        </div>
      </div>

      <div className="modal-bg" id="externalReferenceImportModal">
        <div className="modal aq-legacy-modal-lg">
          <div className="mt">Dışarıdan Kaynakça Ekle</div>
          <div className="wf">
            <label>APA kaynakça metni</label>
          </div>
          <textarea id="externalReferenceTextInput" rows={8} placeholder="APA 7 kaynakça metni" />
          <div className="mb">
            <button className="mbtn p" id="externalReferenceTextImportBtn" type="button" onClick={() => runExternalReferenceTextImport(onStatus)}>Metinden Ekle</button>
          </div>
          <div className="wf">
            <label>BibTeX / RIS</label>
          </div>
          <textarea id="externalReferenceBibRisInput" rows={5} placeholder="@article{...} veya TY  - JOUR ..." />
          <div className="mb">
            <button className="mbtn p" type="button" onClick={() => runExternalReferenceBibliographyTextImport(onStatus)}>Bib/RIS Metninden Ekle</button>
            <label className="mbtn s">
              Bib/RIS Dosya Seç
              <input type="file" id="externalReferenceFileInput" accept=".bib,.ris,.enw,.txt,.apa" hidden onChange={(event) => runExternalReferenceFileImport(event, onStatus)} />
            </label>
          </div>
          <div className="wf">
            <label>DOI</label>
          </div>
          <textarea id="externalReferenceDoiInput" rows={3} placeholder="DOI listesi" />
          <div className="mb">
            <button className="mbtn p" id="externalReferenceDoiImportBtn" type="button" onClick={() => runExternalReferenceDoiImport(onStatus)}>DOI'den Çek</button>
            <button className="mbtn s" id="externalReferenceImportCloseBtn" type="button" onClick={() => call('hideM', 'externalReferenceImportModal')}>Kapat</button>
          </div>
          <div id="externalReferenceImportStatus" />
        </div>
      </div>

      <div className="modal-bg" id="exportPreviewModal">
        <div className="modal aq-legacy-modal-xl">
          <div className="mt">PDF ?nizleme</div>
          <div className="export-preview-meta" id="exportPreviewMeta">Temiz export yüzeyi hazırlanıyor...</div>
          <div className="export-preview-frame"><iframe id="exportPreviewFrame" sandbox="allow-same-origin" title="PDF önizleme" /></div>
          <div className="mb">
            <button className="mbtn s" id="exportPreviewRefreshBtn" type="button" onClick={() => call('refreshExportPreview')}>Yenile</button>
            <button className="mbtn p" id="exportPreviewPdfBtn" type="button" onClick={() => call('expPDF')}>PDF Olarak Dışa Aktar</button>
            <button className="mbtn s" id="exportPreviewCloseBtn" type="button" onClick={() => call('hideM', 'exportPreviewModal')}>Kapat</button>
          </div>
        </div>
      </div>

      <div className="modal-bg" id="docOutlineModal" onMouseDown={(event) => {
        if (event.target === event.currentTarget) hideLegacyModal('docOutlineModal');
      }}>
        <div className="modal aq-legacy-modal-lg aq-outline-modal">
          <div className="aq-modal-kicker">Belge</div>
          <div className="mt">Belge Anahatı</div>
          <div id="docOutlineSummary">Anahat yükleniyor...</div>
          <div className="doc-outline-controls">
            <input type="text" id="docOutlineSearch" placeholder="Başlık, tablo veya Şekil ara" />
            <select id="docOutlineFilter" defaultValue="all">
              <option value="all">Tüm ?eler</option>
              <option value="heading">Başlıklar</option>
              <option value="table">Tablolar</option>
              <option value="figure">Şekiller</option>
            </select>
            <button className="mbtn s" id="docOutlineCurrentBtn" type="button">Bulundugum Yere Git</button>
          </div>
          <div id="docOutlineList" />
          <div className="mb">
            <button className="mbtn s" id="docOutlineRefreshBtn" type="button" onClick={() => call('openDocumentOutline')}>Yenile</button>
            <button className="mbtn s" id="docOutlineCloseBtn" type="button" onClick={() => call('hideM', 'docOutlineModal')}>Kapat</button>
          </div>
        </div>
      </div>

      <div className="modal-bg" id="captionManagerModal" onMouseDown={(event) => {
        if (event.target === event.currentTarget) hideLegacyModal('captionManagerModal');
      }}>
        <div className="modal aq-legacy-modal-lg aq-outline-modal">
          <div className="aq-modal-kicker">Nesne Başlıkları</div>
          <div className="mt">Tablo ve Şekil Başlıklar?</div>
          <div id="captionManagerSummary">Başlıklar yükleniyor...</div>
          <div id="captionManagerList" />
          <div className="mb">
            <button className="mbtn s" id="captionManagerRefreshBtn" type="button" onClick={() => call('openCaptionManager')}>Yenile</button>
            <button className="mbtn s" id="captionManagerCloseBtn" type="button" onClick={() => call('hideM', 'captionManagerModal')}>Kapat</button>
          </div>
        </div>
      </div>

      <div className="modal-bg" id="dupModal" onMouseDown={(event) => {
        if (event.target === event.currentTarget) hideLegacyModal('dupModal');
      }}>
        <div className="modal aq-legacy-modal-lg">
          <div className="mt">Duplicate Review</div>
          <div id="dupSummary" />
          <div className="mb">
            <button className="mbtn p" id="dupMergeAllBtn" type="button" onClick={() => {
              const win = window as any;
              if (typeof win.__mergeAllDuplicateGroups === 'function') win.__mergeAllDuplicateGroups();
              window.setTimeout(renderDuplicateReviewFallback, 0);
            }}>Tümünü Birleştir</button>
            <button className="mbtn s" id="dupDismissAllBtn" type="button" onClick={() => {
              const win = window as any;
              if (typeof win.__dismissAllDuplicateGroups === 'function') win.__dismissAllDuplicateGroups();
              window.setTimeout(renderDuplicateReviewFallback, 0);
            }}>Tümünü Yoksay</button>
          </div>
          <div id="dupGroups" onClick={handleDuplicateReviewClick} />
          <div className="mb"><button className="mbtn s" id="dupCloseBtn" type="button" onClick={() => hideLegacyModal('dupModal')}>Kapat</button></div>
        </div>
      </div>

      <div className="modal-bg" id="metaHealthModal" onMouseDown={(event) => {
        if (event.target === event.currentTarget) hideLegacyModal('metaHealthModal');
      }}>
        <div className="modal aq-legacy-modal-lg">
          <div className="mt">Metadata Health</div>
          <div id="metaHealthSummary">
            Toplam {metadataSummary.total} · Tam {metadataSummary.complete} · Eksik {metadataSummary.incomplete} · Şüpheli {metadataSummary.suspicious}
            {metadataSummary.issueText ? ` · ${metadataSummary.issueText}` : ''}
          </div>
          <div className="mh-sortbar" id="metaHealthSortBar">
            {[
              ['all', metadataSummary.total],
              ['incomplete', metadataSummary.incomplete],
              ['suspicious', metadataSummary.suspicious],
              ['complete', metadataSummary.complete]
            ].map(([sort, count]) => (
              <button
                key={String(sort)}
                type="button"
                className={`mh-sortbtn ${metadataFilter === sort ? 'on' : ''}`}
                data-mh-sort={String(sort)}
                onClick={() => setMetadataFilter(String(sort))}
              >
                {String(sort)}<span className="mh-sortcount">{String(count)}</span>
              </button>
            ))}
          </div>
          <div id="metaHealthList">
            {visibleMetadataRows.length ? visibleMetadataRows.map((row, index) => {
              const ref = row.ref || {};
              const report = row.report || { status: 'complete', issues: [] };
              const status = String(report.status || 'complete');
              const busy = metadataLookupBusyId && metadataLookupBusyId === String(ref.id || ref.title || 'ref');
              const statusLabel = status === 'complete' ? 'Tam' : (status === 'incomplete' ? 'Eksik' : 'Şüpheli');
              const authors = (Array.isArray(ref.authors) ? ref.authors : []).slice(0, 2).join('; ');
              const issues = Array.isArray(report.issues) ? report.issues : [];
              return (
                <div className="mh-card" data-ref-id={ref.id || ''} key={`${ref.id || 'ref'}-${index}`}>
                  <div className="mh-card-head">
                    <span className={`mh-status mh-${status}`}>{statusLabel}</span>
                    <span className="mh-title">{ref.title || 'Başlıksız'}</span>
                  </div>
                  <div className="mh-meta">{authors || 'Yazar yok'} · {ref.year || 'yıl yok'} · {ref.journal || 'dergi yok'}</div>
                  <div className="mh-issues">
                    {issues.length ? issues.map((issue: any, issueIndex: number) => (
                      <span className="mh-issue" key={issueIndex}>{issue.message || issue.code}</span>
                    )) : <span className="mh-issue">Sorun yok</span>}
                  </div>
                  <div className="mb">
                    <button className="mbtn s" type="button" onClick={() => handleMetadataAction('edit', ref)}>Manuel Düzenle</button>
                    <button className="mbtn s" type="button" onClick={() => handleMetadataAction('refetch', ref)}>DOI Yeniden Çek</button>
                    <button className="mbtn p" type="button" onClick={() => handleMetadataAction('normalize', ref)}>Normalize Et</button>
                  </div>
                </div>
              );
            }) : <div className="aq-empty-note">Kaynak bulunamadı.</div>}
          </div>
          {metadataLookupCandidate ? (
            <div className="mh-card mh-candidate-card">
              <div className="mh-card-head">
                <span className="mh-status mh-complete">{Math.round(metadataLookupCandidate.score * 100)}%</span>
                <span className="mh-title">Metadata eşleşmesi bulundu</span>
              </div>
              <div className="mh-meta">
                {metadataLookupCandidate.source} · {metadataLookupCandidate.evidence.join(' · ') || 'web araması'}
              </div>
              <div className="mh-compare-grid">
                <div>
                  <div className="mh-compare-label">Mevcut</div>
                  <b>{metadataLookupCandidate.ref.title || 'Başlıksız'}</b>
                  <span>{(Array.isArray(metadataLookupCandidate.ref.authors) ? metadataLookupCandidate.ref.authors : []).slice(0, 3).join('; ') || 'Yazar yok'}</span>
                  <span>{metadataLookupCandidate.ref.year || 'Yıl yok'} · {metadataLookupCandidate.ref.doi || 'DOI yok'}</span>
                </div>
                <div>
                  <div className="mh-compare-label">Bulunan</div>
                  <b>{metadataLookupCandidate.fetched.title || 'Başlıksız'}</b>
                  <span>{(Array.isArray(metadataLookupCandidate.fetched.authors) ? metadataLookupCandidate.fetched.authors : []).slice(0, 3).join('; ') || 'Yazar yok'}</span>
                  <span>{metadataLookupCandidate.fetched.year || 'Yıl yok'} · {metadataLookupCandidate.fetched.doi || 'DOI yok'}</span>
                </div>
              </div>
              <div className="mb">
                <button className="mbtn p" type="button" disabled={Boolean(metadataLookupBusyId)} onClick={() => { void applyMetadataCandidate('merge'); }}>{metadataLookupBusyId ? 'İşleniyor...' : 'Birleştir'}</button>
                <button className="mbtn s" type="button" disabled={Boolean(metadataLookupBusyId) || !metadataLookupCandidate.fetched.doi} onClick={() => { void applyMetadataCandidate('doi-only'); }}>Sadece DOI Ekle</button>
                <button className="mbtn s" type="button" onClick={() => setMetadataLookupCandidate(null)}>Yoksay</button>
              </div>
            </div>
          ) : null}
          <div className="mb">
            <button className="mbtn s" id="metaHealthRefreshBtn" type="button" onClick={() => openReactMetadataHealth()}>Yenile</button>
            <button className="mbtn s" id="metaHealthCloseBtn" type="button" onClick={() => hideLegacyModal('metaHealthModal')}>Kapat</button>
          </div>
        </div>
      </div>

      <div id="matrixView">
        <div id="matrixToolbar">
          <input id="matrixSearchInp" type="text" placeholder="Kaynak veya hucre icinde ara..." />
          <button id="matrixAddCurrentRefBtn" data-matrix-action="add-current-ref" type="button">Seçili Kaynağı Ekle</button>
          <button id="matrixFullscreenBtn" data-matrix-action="toggle-fullscreen" type="button" onClick={() => (window as any).AQLiteratureMatrix?.toggleFullscreen?.()}>Tam Ekran</button>
          <button id="matrixExportBtn" data-matrix-action="export-excel" type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); (window as any).AQLiteratureMatrix?.exportExcel?.(); }}>Dışarı Aktar</button>
          <button id="matrixCloseBtn" data-matrix-action="close" type="button" onClick={() => (window as any).closeLiteratureMatrix?.()}>Kapat</button>
        </div>
        <div id="matrixFilterPanel" />
        <div id="matrixTableWrap">
          <table id="matrixTable" />
          <div id="matrixEmptyState" />
        </div>
      </div>
    </>
  );
}

