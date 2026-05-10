import { useEffect, useState, type ChangeEvent, type MouseEvent } from 'react';
import type { AcademiqReference } from '../../lib/app-state';

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

function syncReactFromLegacy() {
  const win = window as any;
  if (typeof win.__aqReactSyncFromLegacy === 'function') {
    try { win.__aqReactSyncFromLegacy(win.S || {}); } catch (_error) {}
  }
}

function hideLegacyModal(id: string) {
  document.getElementById(id)?.classList.remove('show');
}

function showLegacyModal(id: string) {
  document.getElementById(id)?.classList.add('show');
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function currentWorkspaceRefs() {
  const win = window as any;
  const state = win.S || {};
  const workspace = Array.isArray(state.wss)
    ? state.wss.find((item: any) => item && item.id === state.cur)
    : null;
  return Array.isArray(workspace?.lib) ? workspace.lib : [];
}

function currentWorkspace() {
  const win = window as any;
  const state = win.S || {};
  return Array.isArray(state.wss)
    ? state.wss.find((item: any) => item && item.id === state.cur)
    : null;
}

function saveLegacyState() {
  const win = window as any;
  try { if (typeof win.save === 'function') win.save(); } catch (_error) {}
  try { if (typeof win.rLib === 'function') win.rLib(); } catch (_error) {}
  try { if (typeof win.rRefs === 'function') win.rRefs(); } catch (_error) {}
  try { if (typeof win.updateRefSection === 'function') win.updateRefSection(); } catch (_error) {}
  syncReactFromLegacy();
  window.setTimeout(syncReactFromLegacy, 250);
}

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
  summaryEl.textContent = groups.length ? `${groups.length} duplicate grup bulundu` : 'Duplicate grup bulunamad?';
  if (!groups.length) {
    listEl.innerHTML = '<div class="aq-empty-note">?pheli duplicate bulunamad?.</div>';
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
        <div class="dup-ref-meta"><b>Yil:</b> ${escapeHtml(ref.year || '-')}</div>
        <div class="dup-ref-meta"><b>Dergi:</b> ${escapeHtml(ref.journal || '-')}</div>
        <div class="dup-ref-meta"><b>DOI:</b> ${escapeHtml(ref.doi || '-')}</div>
      </div>`;
    }).join('');
    const signature = escapeHtml(group.signature || '');
    return `<div class="dup-group-card" data-dup-signature="${signature}">
      <div class="dup-head">Guven: ${Math.round(Number(group.confidence || 0) * 100)}% · ${escapeHtml(reasons || 'benzer metadata')}</div>
      <div class="dup-ref-grid">${cards}</div>
      <div class="mb">
        <button class="mbtn p" data-dup-action="merge" data-dup-signature="${signature}" onclick="window.__aqHandleDuplicateAction&&window.__aqHandleDuplicateAction(this);return false;">Birlestir</button>
        <button class="mbtn s" data-dup-action="keep" data-dup-signature="${signature}" onclick="window.__aqHandleDuplicateAction&&window.__aqHandleDuplicateAction(this);return false;">Ikisini de Tut</button>
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
  sumEl.textContent = `Toplam ${counts.All} · Tam ${counts.Complete} · Eksik ${counts.Incomplete} · ?pheli ${counts.Suspicious}${issueText ? ` · ${issueText}` : ''}`;
  if (!rows.length) {
    listEl.innerHTML = '<div class="aq-empty-note">Kaynak bulunamad?.</div>';
    return;
  }
  listEl.innerHTML = rows.map((row: any) => {
    const ref = row.ref || {};
    const refIndex = Number.isFinite(row.idx) ? row.idx : -1;
    const report = row.report || { status: 'complete', issues: [] };
    const status = String(report.status || 'complete');
    const statusLabel = status === 'complete' ? 'Tam' : (status === 'incomplete' ? 'Eksik' : '?pheli');
    const issues = Array.isArray(report.issues) ? report.issues : [];
    const issueHtml = issues.map((issue: any) => `<span class="mh-issue">${escapeHtml(issue.message || issue.code)}</span>`).join(' ');
    const authors = (Array.isArray(ref.authors) ? ref.authors : []).slice(0, 2).join('; ');
    return `<div class="mh-card" data-ref-id="${escapeHtml(ref.id || '')}" data-ref-index="${refIndex}">
      <div class="mh-card-head"><span class="mh-status mh-${escapeHtml(status)}">${statusLabel}</span><span class="mh-title">${escapeHtml(ref.title || 'Başlıksız')}</span></div>
      <div class="mh-meta">${escapeHtml(authors || 'Yazar yok')} · ${escapeHtml(ref.year || 'yıl yok')} · ${escapeHtml(ref.journal || 'dergi yok')}</div>
      <div class="mh-issues">${issueHtml || '<span class="mh-issue">Sorun yok</span>'}</div>
      <div class="mb">
        <button class="mbtn s" data-mh-action="edit" data-ref-id="${escapeHtml(ref.id || '')}" data-ref-index="${refIndex}" onclick="window.__aqHandleMetadataHealthAction&&window.__aqHandleMetadataHealthAction(this);return false;">Manuel Düzenle</button>
        <button class="mbtn s" data-mh-action="refetch" data-ref-id="${escapeHtml(ref.id || '')}" data-ref-index="${refIndex}" onclick="window.__aqHandleMetadataHealthAction&&window.__aqHandleMetadataHealthAction(this);return false;">DOI Yeniden Cek</button>
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
        try { if (typeof win.setDst === 'function') win.setDst('Kaynak bulunamad?.', 'er'); } catch (_error) {}
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
            if (typeof win.setDst === 'function') win.setDst('DOI olmayan kaynakta yeniden cekme yapilamaz.', 'er');
            return false;
          }
          if (typeof win.setDst === 'function') win.setDst('Metadata DOI uzerinden güncelleniyor...', 'ld');
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
          if (typeof win.setDst === 'function') win.setDst('Kayit normalize edildi.', 'ok');
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
      if (typeof win.setDst === 'function') win.setDst(merged ? 'Duplicate kayıtlar birlestirildi.' : 'Duplicate birlestirilemedi.', merged ? 'ok' : 'er');
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
    if (typeof win.setDst === 'function') win.setDst('Kaynak bulunamad?.', 'er');
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
      if (typeof win.setDst === 'function') win.setDst('Kayit normalize edildi.', 'ok');
      renderMetadataHealthFallback();
      return;
    }
    if (action === 'refetch') {
      if (!ref.doi || typeof win.fetchCR !== 'function') {
        if (typeof win.setDst === 'function') win.setDst('DOI olmayan kaynakta yeniden cekme yapilamaz.', 'er');
        return;
      }
      if (typeof win.setDst === 'function') win.setDst('Metadata DOI uzerinden güncelleniyor...', 'ld');
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

function setExternalImportStatus(message: string) {
  const status = document.getElementById('externalReferenceImportStatus');
  if (status) status.textContent = message;
}

function syncAfterExternalImport() {
  [250, 900, 1800].forEach((delay) => window.setTimeout(syncReactFromLegacy, delay));
}

function normalizeExternalDoi(value: string) {
  const win = window as any;
  const normalized = win.normalizeRefDoi?.(value) || win.AQReferenceParseç.normalizeDoi?.(value);
  if (normalized) return String(normalized);
  const match = String(value || '').match(/\b10\.\d{4,9}\/[^\s"'<>]+/i);
  return match ? match[0].replace(/[),.;]+$/, '') : '';
}

function parseApaFallbackEntries(text: string) {
  const win = window as any;
  const createId = () => (typeof win.uid === 'function' ? win.uid() : `ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const chunks = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n|(?=\n?[A-ZÇĞİÖŞÜ][^.\n]{1,120},\s*[A-ZÇĞİÖŞÜ]\.)/g)
    .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return chunks.map((chunk) => {
    const yearMatch = chunk.match(/\((\d{4}[a-z]?|n\.d\.)\)/i);
    const doi = normalizeExternalDoi(chunk);
    if (!yearMatch && !doi) return null;
    const beforeYear = yearMatch ? chunk.slice(0, yearMatch.index).trim().replace(/[.;,\s]+$/, '') : '';
    const afterYear = yearMatch ? chunk.slice((yearMatch.index || 0) + yearMatch[0].length).trim() : chunk;
    const titleMatch = afterYear.match(/^\.?\s*([^.]*(?:\.[^A-ZÇĞİÖŞÜ0-9][^.]*)?)\./);
    const title = String(titleMatch?.[1] || afterYear.split(/\s+(?:https?:\/\/|doi:|10\.)/i)[0] || doi || chunk)
      .replace(/\s+/g, ' ')
      .replace(/[.;,\s]+$/, '')
      .trim();
    const authors = beforeYear
      ? beforeYear.split(/\s*&\s*|\s+and\s+|;\s*/i).map((part) => part.replace(/[.;\s]+$/, '').trim()).filter(Boolean)
      : [];
    if (!title && !doi) return null;
    return {
      id: createId(),
      title: title || doi,
      authors,
      year: yearMatch ? yearMatch[1] : '',
      doi,
      url: doi ? `https://doi.org/${doi}` : '',
      wsId: win.S?.cur
    };
  }).filter(Boolean);
}

function parseExternalReferenceText(text: string, kind: 'auto' | 'bibtex' | 'ris' | 'apa' = 'auto') {
  const win = window as any;
  const raw = String(text || '').trim();
  if (!raw) return [];
  const options = { createId: win.uid, workspaceId: win.S?.cur };
  const looksBib = /@\w+\s*\{/i.test(raw);
  const looksRis = /(^|\n)TY\s*-\s*/i.test(raw);
  if ((kind === 'bibtex' || (kind === 'auto' && looksBib)) && typeof (win.parseBibTeX || win.AQReferenceParseç.parseBibTeX) === 'function') {
    return (win.parseBibTeX || win.AQReferenceParse.parseBibTeX)(raw, options) || [];
  }
  if ((kind === 'ris' || (kind === 'auto' && looksRis)) && typeof (win.parseRIS || win.AQReferenceParseç.parseRIS) === 'function') {
    return (win.parseRIS || win.AQReferenceParse.parseRIS)(raw, options) || [];
  }
  const parsed = typeof (win.parseApaReferenceText || win.AQReferenceParseç.parseApaReferenceText) === 'function'
    ? (win.parseApaReferenceText || win.AQReferenceParse.parseApaReferenceText)(raw, options) || []
    : [];
  return parsed.length ? parsed : parseApaFallbackEntries(raw);
}

function importExternalEntries(entries: any[], sourceLabel: string, onStatus: (message: string) => void) {
  const win = window as any;
  if (!entries.length) {
    setExternalImportStatus('Kaynak bulunamad?.');
    return;
  }
  try {
    if (typeof win.importReferenceEntries === 'function') {
      const summary = win.importReferenceEntries(entries, { includeInBibliography: true, revealBibliography: true });
      const imported = Number(summary?.imported || 0);
      const duplicates = Number(summary?.duplicates || 0);
      const skipped = Number(summary?.skipped || 0);
      const message = `${sourceLabel}: ${imported} eklendi, ${duplicates} duplicate, ${skipped} atlandi`;
      setExternalImportStatus(message);
      onStatus(message);
      syncAfterExternalImport();
      return;
    }
    window.dispatchEvent(new CustomEvent('aq:import-references', {
      detail: { entries, sourceLabel, includeInBibliography: true, revealBibliography: true }
    }));
    setExternalImportStatus(`${sourceLabel}: ${entries.length} kaynak bulundu.`);
    syncAfterExternalImport();
  } catch (error) {
    console.error('[external-reference-import]', error);
    setExternalImportStatus(`${sourceLabel} aktarılamadı.`);
    onStatus(`${sourceLabel} aktarılamadı`);
  }
}

function runExternalReferenceTextImport(onStatus: (message: string) => void) {
  const input = document.getElementById('externalReferenceTextInput') as HTMLTextAreaElement | null;
  const raw = String(input?.value || '').trim();
  if (!raw) {
    setExternalImportStatus('APA kaynak metni bos.');
    return;
  }
  const entries = parseExternalReferenceText(raw, 'apa');
  if (!entries.length) {
    setExternalImportStatus('Kaynak bulunamad?. APA 7 kaynakça satiri, DOI, BibTeX/RIS dosyas? veya DOI alanini kullan.');
    return;
  }
  importExternalEntries(entries, 'APA metin', onStatus);
  if (input) input.value = '';
}

function runExternalReferenceBibliographyTextImport(onStatus: (message: string) => void) {
  const input = document.getElementById('externalReferenceBibRisInput') as HTMLTextAreaElement | null;
  const raw = String(input?.value || '').trim();
  if (!raw) {
    setExternalImportStatus('BibTeX/RIS metni bos.');
    return;
  }
  const entries = parseExternalReferenceText(raw, 'auto');
  if (!entries.length) {
    setExternalImportStatus('BibTeX/RIS kaynağı bulunamad?.');
    return;
  }
  importExternalEntries(entries, /@\w+\s*\{/i.test(raw) ? 'BibTeX' : 'RIS', onStatus);
  if (input) input.value = '';
}

function runExternalReferenceFileImport(event: ChangeEvent<HTMLInputElement>, onStatus: (message: string) => void) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  const win = window as any;
  try {
    if (typeof win.importExternalReferenceFile === 'function') {
      win.importExternalReferenceFile(event.nativeEvent || event);
      setExternalImportStatus('Dosya isleniyor...');
      syncAfterExternalImport();
      return;
    }
    if (typeof win.__importFromFileInput === 'function') {
      win.__importFromFileInput({ target: input }, {
        allowJson: false,
        prefix: 'D? kaynak dosyas?',
        includeInBibliography: true,
        revealBibliography: true
      });
      setExternalImportStatus('Dosya isleniyor...');
      syncAfterExternalImport();
      return;
    }
    onStatus('D? kaynak dosyas? aktarımı hazır değil');
    setExternalImportStatus('Dosya aktarımı hazır değil.');
  } catch (error) {
    console.error('[external-reference-file]', error);
    onStatus('D? kaynak dosyas? aktarılamadı');
    setExternalImportStatus('Dosya aktarılamadı.');
  }
}

function runExternalReferenceDoiImport(onStatus: (message: string) => void) {
  const win = window as any;
  const input = document.getElementById('externalReferenceDoiInput') as HTMLTextAreaElement | null;
  if (!String(input?.value || '').trim()) {
    setExternalImportStatus('DOI alani bos.');
    return;
  }
  try {
    if (typeof win.importExternalReferenceDoi === 'function') {
      win.importExternalReferenceDoi();
      syncAfterExternalImport();
      return;
    }
    onStatus('DOI aktarımı hazır değil');
    setExternalImportStatus('DOI aktarımı hazır değil.');
  } catch (error) {
    console.error('[external-reference-doi]', error);
    onStatus('DOI kaynak aktarımı başarısız');
    setExternalImportStatus('DOI aktarım hatası.');
  }
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(String(event.target?.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Dosya okunamad?'));
    reader.readAsText(file);
  });
}

function readFileAsDataURL(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(String(event.target?.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Gorsel okunamad?'));
    reader.readAsDataURL(file);
  });
}

async function insertImageFile(event: ChangeEvent<HTMLInputElement>, onStatus: (message: string) => void) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  const win = window as any;
  try {
    const editor = win.editor;
    if (typeof win.AQTipTapWordContent?.insertImageFile === 'function') {
      const handled = win.AQTipTapWordContent.insertImageFile({
        file,
        editor: editor || null,
        host: document.getElementById('apaed'),
        getSavedRange: () => null,
        setSavedRange: () => undefined
      });
      if (handled) {
        onStatus('Gorsel eklendi');
        return;
      }
    }

    const src = await readFileAsDataURL(file);
    const html = typeof win.AQTipTapWordDocument?.buildImageHTML === 'function'
      ? win.AQTipTapWordDocument.buildImageHTML(src, file.name)
      : `<img src="${src}" data-width="70%" data-align="left" style="display:block;float:left;width:70%;max-width:100%;height:auto;text-indent:0;margin-left:0;margin-right:14px;margin-top:2px;margin-bottom:10px;" alt="${file.name}"/><p><br></p>`;
    if (typeof win.restoreEditorListStyleSelection === 'function') {
      try { win.restoreEditorListStyleSelection(); } catch (_error) {}
    }
    if (editor?.chain) {
      editor.chain().focus().insertContent(html, { parseOptions: { preserveWhitespace: false } }).run();
      if (typeof win.runEditorMutationEffects === 'function') {
        win.runEditorMutationEffects({ layout: true, syncChrome: true, syncTOC: false, syncRefs: false, refreshTrigger: false });
      }
      onStatus('Gorsel eklendi');
      return;
    }
    if (typeof win.handleImgUpload === 'function') {
      win.handleImgUpload(event.nativeEvent || event);
      onStatus('Gorsel eklendi');
      return;
    }
    onStatus('Gorsel eklenemedi');
  } catch (error) {
    console.error('[legacy-image]', error);
    onStatus('Gorsel eklenemedi');
  } finally {
    input.value = '';
  }
}

function fallbackPlainTextAPA(text: string) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('') || '<p><br></p>';
}

function decodeWordBytes(bytes: ArrayBuffer) {
  const buffer = bytes || new ArrayBuffer(0);
  const decoders = ['utf-8', 'windows-1254', 'windows-1252', 'iso-8859-9', 'latin1'];
  for (const encoding of decoders) {
    try {
      const text = new TextDecoder(encoding).decode(buffer);
      if (text && text.trim()) return text;
    } catch (_error) {}
  }
  return '';
}

async function persistImportedWordDocument(onStatus?: (message: string) => void) {
  const win = window as any;
  try { if (typeof win.save === 'function') win.save(); } catch (_error) {}
  try {
    if (typeof win.runEditorMutationEffects === 'function') {
      win.runEditorMutationEffects({ layout: true, syncChrome: true, syncTOC: false, syncRefs: false, refreshTrigger: false });
    }
  } catch (_error) {}
  try { if (typeof win.flushCurrentDocFromEditor === 'function') win.flushCurrentDocFromEditor(); } catch (_error) {}
  try { if (typeof win.__aqCommitActiveDoc === 'function') win.__aqCommitActiveDoc(); } catch (_error) {}
  try { if (typeof win.save === 'function') win.save(); } catch (_error) {}
  try { if (typeof win.__aqReactSyncFromLegacy === 'function') win.__aqReactSyncFromLegacy(win.S || {}); } catch (_error) {}

  try {
    const json = typeof win.__aqBuildPersistedStateJSON === 'function'
      ? win.__aqBuildPersistedStateJSON()
      : JSON.stringify(win.S || {});
    if (typeof win.electronAPI?.saveEditorDraft === 'function') await win.electronAPI.saveEditorDraft(json);
    if (typeof win.electronAPI?.saveData === 'function') {
      const result = await win.electronAPI.saveData(json);
      if (!result || result.ok === false) throw new Error(result?.error || 'Kaydetme basarisiz');
    } else if (typeof win.syncSave === 'function') {
      await win.syncSave();
    }
    try { if (typeof win.setAutosaveSaved === 'function') win.setAutosaveSaved(); } catch (_error) {}
  } catch (error) {
    console.error('[word-import:persist]', error);
    onStatus?.('Word içerigi aktarildi ama kaydedilemedi');
    return;
  }

  syncReactFromLegacy();
}

function scheduleImportedWordPersist(onStatus: (message: string) => void) {
  void persistImportedWordDocument(onStatus);
  window.setTimeout(() => { void persistImportedWordDocument(onStatus); }, 400);
  window.setTimeout(() => { void persistImportedWordDocument(onStatus); }, 1400);
}

function applyImportedWordHTML(html: string, onStatus: (message: string) => void) {
  const win = window as any;
  const editor = win.editor;
  const io = win.AQTipTapWordIO;
  const normalized = typeof io?.normalizeImportHTML === 'function'
    ? io.normalizeImportHTML(html, win.formatPlainTextAPA || fallbackPlainTextAPA)
    : html;
  const source = normalized || html;
  try {
    if (typeof io?.applyImportedHTML === 'function') {
      const ok = io.applyImportedHTML({
        editor: editor || null,
        html: source || '<p><br></p>',
        cleanPastedHTML: win.cleanPastedHTML,
        setCurrentEditorHTML: win.setCurrentEditorHTML,
        afterEditorImport: () => {
          if (typeof win.runEditorMutationEffects === 'function') {
            win.runEditorMutationEffects({ layout: true, syncChrome: true, syncTOC: false, syncRefs: false, refreshTrigger: false });
          }
          if (typeof win.save === 'function') win.save();
        },
        afterDomImport: () => {
          if (typeof win.runEditorMutationEffects === 'function') {
            win.runEditorMutationEffects({ layout: true, syncChrome: true, syncTOC: false, syncRefs: false, refreshTrigger: false });
          }
          if (typeof win.save === 'function') win.save();
        }
      });
      if (ok) {
        onStatus('Word dosyas? içe aktarıldı');
        scheduleImportedWordPersist(onStatus);
        return true;
      }
    }
    if (editor?.commands?.setContent) {
      editor.commands.setContent(source || '<p><br></p>', false);
      editor.commands.focus?.('end');
      onStatus('Word dosyas? içe aktarıldı');
      scheduleImportedWordPersist(onStatus);
      return true;
    }
  } catch (error) {
    console.error('[word-import:apply]', error);
  }
  return false;
}

async function importWordFileDirect(event: ChangeEvent<HTMLInputElement>, onStatus: (message: string) => void) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  const win = window as any;
  const lowerName = file.name.toLowerCase();
  try {
    let html = '';
    const nativePath = String((file as any).path || '').trim();
    if (nativePath && /\.(doc|docx)$/i.test(lowerName) && typeof win.electronAPI?.wordToHtml === 'function') {
      try {
        const result = await win.electronAPI.wordToHtml(nativePath);
        if (result?.ok && result.html) html = String(result.html || '');
      } catch (_error) {}
    }

    if (!html && /\.docx$/i.test(lowerName) && typeof win.mammoth?.convertToHtml === 'function') {
      const arrayBuffer = await file.arrayBuffer();
      const result = await win.mammoth.convertToHtml({ arrayBuffer });
      html = String(result?.value || '');
    }

    if (!html) {
      const arrayBuffer = await file.arrayBuffer();
      html = decodeWordBytes(arrayBuffer);
    }

    if (!html.trim()) {
      onStatus('Word dosyas? okunamad?');
      return;
    }

    if (!applyImportedWordHTML(html, onStatus)) {
      onStatus('Word dosyas? içe aktarılamadı');
    }
  } catch (error) {
    console.error('[word-import]', error);
    onStatus('Word dosyas? içe aktarılamadı');
  } finally {
    input.value = '';
  }
}

async function importBibliographyFile(event: ChangeEvent<HTMLInputElement>, onStatus: (message: string) => void) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  const win = window as any;
  try {
    const text = await readFileAsText(file);
    const lowerName = file.name.toLowerCase();
    const parser = lowerName.endsWith('.bib')
      ? (win.parseBibTeX || win.AQReferenceParseç.parseBibTeX)
      : (win.parseRIS || win.AQReferenceParseç.parseRIS);
    if (typeof parser !== 'function') {
      if (typeof win.__importFromFileInput === 'function') {
        win.__importFromFileInput({ target: input }, { allowJson: false, prefix: 'Kaynak aktarımı' });
        [500, 1500, 3500].forEach((delay) => window.setTimeout(syncReactFromLegacy, delay));
        return;
      }
      throw new Error('Parser hazır değil');
    }
    const entries = parser(text, { createId: win.uid, workspaceId: win.S?.cur });
    if (!Array.isArray(entries) || !entries.length) {
      onStatus('Kaynak bulunamad?');
      return;
    }
    window.dispatchEvent(new CustomEvent('aq:import-references', {
      detail: { entries, sourceLabel: lowerName.endsWith('.bib') ? 'BibTeX' : 'RIS' }
    }));
  } catch (error) {
    console.error('[bibliography-import]', error);
    onStatus('BibTeX/RIS aktarılamadı');
  } finally {
    input.value = '';
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

  const handleMetadataAction = (action: string, ref: any) => {
    const win = window as any;
    if (!ref) {
      onStatus('Kaynak bulunamad?');
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
        if (!ref.doi || typeof win.fetchCR !== 'function') {
          onStatus('DOI olmayan kaynakta yeniden cekme yapilamaz');
          return;
        }
        onStatus('Metadata DOI uzerinden güncelleniyor...');
        win.fetchCR(ref.doi, (err: unknown, fetched: unknown) => {
          if (err || !fetched) {
            onStatus('DOI metadata alınamadı');
            return;
          }
          if (typeof win.mergeRefFields === 'function') win.mergeRefFields(ref, fetched);
          saveLegacyState();
          refreshMetadataHealth();
          onStatus('Metadata güncellendi');
        });
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
        onStatus('Kayit normalize edildi');
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
          el.innerHTML = '<div class="aq-empty-note">PDF sayfasi bulunamad?.</div>';
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
        }).join('') : '<div class="aq-empty-note">Kütüphanede benzer kayıt bulunamad?.</div>';
        el.innerHTML = `<div class="pdf-related-section-title">Yerel kütüphane</div>${localHtml}<div class="pdf-related-section-title">Web sonuçlar? <span>araniyor...</span></div>`;

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
          }).join('') : '<div class="aq-empty-note">Webde benzer kayıt bulunamad?.</div>';
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
        const button = document.getElementById(id);
        button?.classList.toggle('on');
        return true;
      }
      if (id === 'pdfDrawClearBtn') {
        const currentPage = document.querySelector<HTMLElement>('#pdfscroll .pdf-page-wrap[data-page]');
        currentPage?.querySelectorAll('.draw-overlay, .pdf-annot').forEach((node) => node.remove());
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
    type FallbackSelection = {
      text: string;
      page: number;
      rects: Array<{ x: number; y: number; w: number; h: number }>;
    };

    const getCurrentColor = () => {
      const active = document.querySelector<HTMLElement>('#hlbar .hlc.on');
      return active?.dataset.c || active?.style.backgroundColor || '#fef08a';
    };

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

    const updateFallbackStats = () => {
      const win = window as any;
      const highlights = Array.isArray(win.__aqPdfFallbackHighlights) ? win.__aqPdfFallbackHighlights : [];
      const notes = Array.isArray(win.__aqPdfFallbackNotes) ? win.__aqPdfFallbackNotes : [];
      const stats = document.getElementById('pdfreadstats');
      if (stats) stats.textContent = `${highlights.length} highlight - ${notes.length} not`;
    };

    const hideFallbackTip = () => {
      document.getElementById('hltip')?.classList.remove('show');
      document.getElementById('pdfctxmenu')?.classList.remove('show');
      (window as any).__aqPdfFallbackSelection = null;
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

    const paintFallbackHighlight = (selection: FallbackSelection, saveAsNote = false) => {
      const win = window as any;
      const color = getCurrentColor();
      const wrap = document.querySelector<HTMLElement>(`.pdf-page-wrap[data-page="${selection.page}"]`);
      const canvas = wrap?.querySelector<HTMLCanvasElement>('.hl-overlay');
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return false;
      ctx.save();
      ctx.globalAlpha = 0.38;
      ctx.fillStyle = color;
      selection.rects.forEach((rect) => {
        ctx.fillRect(rect.x * canvas.width, rect.y * canvas.height, rect.w * canvas.width, rect.h * canvas.height);
      });
      ctx.restore();
      if (!Array.isArray(win.__aqPdfFallbackHighlights)) win.__aqPdfFallbackHighlights = [];
      const storedHighlight = { ...selection, color, createdAt: new Date().toISOString() };
      win.__aqPdfFallbackHighlights.push(storedHighlight);
      const ref = win.__aqCurrentPdfReference || null;
      if (ref) {
        const current = Array.isArray(ref._hlData) ? ref._hlData : [];
        ref._hlData = win.AQHighlightState && typeof win.AQHighlightState.addHighlight === 'function'
          ? win.AQHighlightState.addHighlight(current, storedHighlight)
          : current.concat([storedHighlight]);
        try {
          const workspace = Array.isArray(win.S?.wss)
            ? win.S.wss.find((item: any) => item && item.id === win.S?.cur)
            : null;
          const linkedRef = Array.isArray(workspace?.lib)
            ? workspace.lib.find((item: any) => item && item.id === ref.id)
            : null;
          if (linkedRef && linkedRef !== ref) linkedRef._hlData = Array.isArray(ref._hlData) ? ref._hlData.slice() : ref._hlData;
        } catch (_error) {}
        saveLegacyState();
      }
      selection.rects.forEach((rect) => {
        const hit = document.createElement('button');
        hit.type = 'button';
        hit.className = 'pdf-fallback-highlight-hit';
        hit.dataset.page = String(selection.page);
        hit.dataset.text = selection.text;
        hit.dataset.rects = JSON.stringify(selection.rects);
        hit.style.left = `${rect.x * 100}%`;
        hit.style.top = `${rect.y * 100}%`;
        hit.style.width = `${rect.w * 100}%`;
        hit.style.height = `${rect.h * 100}%`;
        wrap?.appendChild(hit);
      });
      if (saveAsNote) {
        if (!Array.isArray(win.__aqPdfFallbackNotes)) win.__aqPdfFallbackNotes = [];
        const savedNote = pushHighlightToNotes(selection, color);
        win.__aqPdfFallbackNotes.push({ text: selection.text, page: selection.page, color, noteId: savedNote?.id || '' });
        const panel = document.getElementById('pdfannots');
        if (panel) {
          panel.style.display = 'block';
          const note = document.createElement('div');
          note.className = 'aq-pdf-annotation-card';
          note.innerHTML = `<b>Sayfa ${selection.page}</b><p>${escapeHtml(selection.text).slice(0, 240)}</p><span>Notlara eklendi</span>`;
          panel.prepend(note);
        }
      }
      updateFallbackStats();
      window.getSelection()?.removeAllRanges();
      document.getElementById('hltip')?.classList.remove('show');
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
      if (action === 'annots') {
        const panel = document.getElementById('pdfannots');
        if (panel) panel.style.display = 'block';
        document.getElementById('pdfctxmenu')?.classList.remove('show');
        return;
      }
      if (action === 'close') {
        document.getElementById('pdfctxmenu')?.classList.remove('show');
      }
    };

    const onMouseUp = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const hit = target?.closest?.('.pdf-fallback-highlight-hit') as HTMLElement | null;
      if (hit) {
        const rects = (() => {
          try { return JSON.parse(String(hit.dataset.rects || '[]')); } catch (_error) { return []; }
        })();
        const selection = {
          text: String(hit.dataset.text || ''),
          page: Number(hit.dataset.page || 1),
          rects: Array.isArray(rects) ? rects : []
        };
        (window as any).__aqPdfFallbackSelection = selection;
        selectFallbackHighlightText(selection);
        const tip = document.getElementById('hltip');
        const pointer = event as globalThis.MouseEvent;
        if (tip) {
          tip.style.left = `${Math.max(8, Math.min(pointer.clientX, window.innerWidth - 220))}px`;
          tip.style.top = `${Math.min(pointer.clientY + 8, window.innerHeight - 120)}px`;
          tip.classList.add('show');
        }
        return;
      }
      window.setTimeout(() => {
        const selection = getFallbackSelection();
        const tip = document.getElementById('hltip');
        if (!selection || !tip) {
          hideFallbackTip();
          return;
        }
        const range = window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0) : null;
        const rect = range?.getBoundingClientRect();
        (window as any).__aqPdfFallbackSelection = selection;
        if (rect) {
          tip.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 220))}px`;
          tip.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 120)}px`;
          tip.classList.add('show');
        }
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
    };

    const onDocumentPointerDown = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('#hltip, #pdfctxmenu, .pdf-fallback-highlight-hit')) return;
      hideFallbackTip();
    };

    const onKeyDown = (event: Event) => {
      const keyboard = event as KeyboardEvent;
      if (keyboard.key === 'Escape') hideFallbackTip();
    };

    const onPdfScroll = () => {
      const tip = document.getElementById('hltip');
      if (tip?.classList.contains('show') && !tip.matches(':hover')) hideFallbackTip();
    };

    document.addEventListener('contextmenu', showContextMenu, true);
    document.addEventListener('click', onMenuClick, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.getElementById('pdfscroll')?.addEventListener('scroll', onPdfScroll, { passive: true });
    return () => {
      document.removeEventListener('contextmenu', showContextMenu, true);
      document.removeEventListener('click', onMenuClick, true);
      document.removeEventListener('mouseup', onMouseUp, true);
      document.removeEventListener('click', onDocumentClick, true);
      document.removeEventListener('pointerdown', onDocumentPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.getElementById('pdfscroll')?.removeEventListener('scroll', onPdfScroll);
      delete (window as any).__aqApplyPdfFallbackHighlight;
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
            <button className="ppb" id="pdfZoomOutBtn" type="button" title="Uzaklastir" onClick={() => (window as any).pZO?.()}>-</button>
            <span id="pdfzoom" role="button" tabIndex={0} title="Genislige sigdir" onClick={() => (window as any).pZFit?.()}>--</span>
            <button className="ppb" id="pdfZoomInBtn" type="button" title="Yakinlastir" onClick={() => (window as any).pZI?.()}>+</button>
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
          <div className="pdf-tools-group" aria-label="Gorunum">
            <button className="ppb" id="pdfSearchToggleBtn" type="button" title="PDF içinde ara" onClick={() => (window as any).togglePdfSearch?.()}>🔍</button>
            <button className="ppb" id="pdfThumbsToggleBtn" type="button" title="K??k resimler" onClick={() => (window as any).toggleThumbs?.()}>☷</button>
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
            <button className="ppb" id="pdfRegionBtn" type="button" title="Bölge seç" onClick={() => (window as any).togglePdfRegionCaptureMode?.()}>□</button>
            <input id="pdfDrawColor" className="pdf-draw-color" type="color" defaultValue="#c9453e" title="?izim rengi" onChange={(event) => (window as any).setPdfDrawColor?.(event.target.value)} />
            <select id="pdfDrawWidth" className="pdf-draw-width" title="?izim kalinligi" defaultValue="2.5" onChange={(event) => (window as any).setPdfDrawWidth?.(event.target.value)}>
              <option value="1.5">Ince</option>
              <option value="2.5">Orta</option>
              <option value="4">Kalin</option>
              <option value="7">Marker</option>
            </select>
            <button className="ppb" id="pdfDrawClearBtn" type="button" title="Bu sayfadaki ?izimi temizle" onClick={() => (window as any).clearPdfDrawingPage?.()}>🗑</button>
          </div>
          <div className="pdf-tools-spacer" />
          <button className="ppb" id="pdfUploadBtn" type="button" title="PDF yukle" onClick={() => document.getElementById('lfinp')?.click()}>+</button>
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
              <div>PDF yukle veya kütüphaneden seç</div>
              <button id="pdfEmptyUploadBtn" type="button" onClick={() => document.getElementById('lfinp')?.click()}>PDF Yukle</button>
            </div>
          </div>
        </div>
      </section>

      <div id="hltip" role="menu">
        <button className="htb htb-primary" id="hlToNoteBtn" type="button" onClick={() => call('doHL', true)}>Nota kaydet</button>
        <button className="htb" id="hlOnlyBtn" type="button" onClick={() => call('doHL', false)}>Highlight</button>
        <button className="htb htb-ghost" id="hlCloseBtn" type="button" onClick={() => call('hideHLtip')}>Kapat</button>
      </div>

      <div id="pdfctxmenu" className="aq-pdf-context-menu" role="menu">
        <button type="button" data-pdf-context-action="highlight" data-needs-selection="true">Highlight</button>
        <button type="button" data-pdf-context-action="note" data-needs-selection="true">Nota kaydet</button>
        <button type="button" data-pdf-context-action="copy" data-needs-selection="true">Seçimi kopyala</button>
        <button type="button" data-pdf-context-action="annots">Highlight / not paneli</button>
        <button type="button" data-pdf-context-action="close">Kapat</button>
      </div>

      <div id="trig">
        <div className="tgh"><span className="tgtag">Kaynak Sec</span><span id="tgq" /><span id="tgsel" /></div>
        <div className="tgmodes">
          <button className="tgm on" id="citationInlineModeBtn" type="button" onClick={(event) => call('setCM', 'inline', event.currentTarget)}>(Yazar, Yil)</button>
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
            <button className="mbtn p" id="wizInsertBtn" type="button" onClick={() => insertTableFromWizard(onStatus)}>Ekle</button>
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
            <button className="mbtn p" id="externalReferenceDoiImportBtn" type="button" onClick={() => runExternalReferenceDoiImport(onStatus)}>DOI'den Cek</button>
            <button className="mbtn s" id="externalReferenceImportCloseBtn" type="button" onClick={() => call('hideM', 'externalReferenceImportModal')}>Kapat</button>
          </div>
          <div id="externalReferenceImportStatus" />
        </div>
      </div>

      <div className="modal-bg" id="exportPreviewModal">
        <div className="modal aq-legacy-modal-xl">
          <div className="mt">PDF Onizleme</div>
          <div className="export-preview-meta" id="exportPreviewMeta">Temiz export yüzeyi hazırlanıyor...</div>
          <div className="export-preview-frame"><iframe id="exportPreviewFrame" sandbox="allow-same-origin" title="PDF önizleme" /></div>
          <div className="mb">
            <button className="mbtn s" id="exportPreviewRefreshBtn" type="button" onClick={() => call('refreshExportPreview')}>Yenile</button>
            <button className="mbtn p" id="exportPreviewPdfBtn" type="button" onClick={() => call('expPDF')}>PDF Olarak Dışa Aktar</button>
            <button className="mbtn s" id="exportPreviewCloseBtn" type="button" onClick={() => call('hideM', 'exportPreviewModal')}>Kapat</button>
          </div>
        </div>
      </div>

      <div className="modal-bg" id="docOutlineModal">
        <div className="modal aq-legacy-modal-lg">
          <div className="mt">Belge Anahati</div>
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

      <div className="modal-bg" id="captionManagerModal">
        <div className="modal aq-legacy-modal-lg">
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
            }}>Tümünü Birlestir</button>
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
            Toplam {metadataSummary.total} · Tam {metadataSummary.complete} · Eksik {metadataSummary.incomplete} · ?pheli {metadataSummary.suspicious}
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
              const statusLabel = status === 'complete' ? 'Tam' : (status === 'incomplete' ? 'Eksik' : '?pheli');
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
                    <button className="mbtn s" type="button" onClick={() => handleMetadataAction('refetch', ref)}>DOI Yeniden Cek</button>
                    <button className="mbtn p" type="button" onClick={() => handleMetadataAction('normalize', ref)}>Normalize Et</button>
                  </div>
                </div>
              );
            }) : <div className="aq-empty-note">Kaynak bulunamad?.</div>}
          </div>
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
          <button id="matrixFullscreenBtn" data-matrix-action="toggle-fullscreen" type="button">Tam Ekran</button>
        </div>
        <div id="matrixTableWrap">
          <table id="matrixTable" />
          <div id="matrixEmptyState" />
        </div>
      </div>
    </>
  );
}
