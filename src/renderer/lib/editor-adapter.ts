export type AcademiqEditorState = {
  docId: string;
  html: string;
  snapshot: unknown;
};

export type CreateAcademiqEditorOptions = {
  mount: HTMLElement;
  docId: string;
  initialState?: unknown;
  onChange?: (state: AcademiqEditorState) => void;
};

export type AcademiqEditorApi = {
  focus: () => void;
  getHTML: () => string;
  setHTML: (html: string) => void;
  insertHTML: (html: string) => void;
  insertCitation: (refId: string) => void;
  insertBibliography: () => void;
  setCitationStyle: (style: string) => void;
  exportSnapshot: () => unknown;
  destroy: () => void;
};

type LegacyWindow = Window & {
  S?: { docs?: Array<{ id: string; content?: string }>; curDoc?: string; doc?: string; cm?: string; cur?: string; wss?: any[]; notes?: any[] };
  editor?: any;
  AQTipTapWordInit?: { init: () => any };
  AQTipTapWordIO?: {
    repairWordImportHTML?: (html: string) => string;
  };
  AQEditorCore?: {
    focus?: (toEnd?: boolean) => boolean;
    getContent?: () => string;
    setContent?: (html: string, focusAtEnd?: boolean) => boolean;
    insertHTML?: (html: string) => boolean;
  };
  AQBibliographyState?: {
    ensureBibliographySection?: (editor: any, options?: Record<string, unknown>) => boolean;
    collectAQEngineUsedReferences?: (editor: any, options?: Record<string, unknown>) => any[];
    syncReferenceViewsForState?: (options?: Record<string, unknown>) => any[] | boolean;
    refreshManualBibliographyForState?: (options?: Record<string, unknown>) => boolean;
    openBibliographySectionForState?: (options?: Record<string, unknown>) => boolean;
    resetManualBibliographyForState?: (state: unknown, docId?: string) => boolean;
    updateBibliographySection?: (options?: Record<string, unknown>) => boolean;
  };
  AQCitationRuntime?: {
    init?: () => void;
    openFromSlash?: (query?: string, mode?: string) => void;
    refreshFromEditor?: () => void;
    insertSelection?: (refId?: string) => boolean;
    syncReferenceSection?: () => boolean;
  };
  AQCitationStyles?: {
    normalizeStyleId?: (style: string) => string;
    visibleCitationText?: (refs: any[], options?: Record<string, unknown>) => string;
    formatReference?: (ref: any, options?: Record<string, unknown>) => string;
    sortReferences?: (refs: any[], options?: Record<string, unknown>) => any[];
  };
  AQReferenceManager?: {
    getWorkspaceId?: () => string;
    getLibrary?: (workspaceId?: string) => any[];
    findReference?: (id: string, workspaceId?: string) => any;
    sortReferences?: (refs: any[]) => any[];
    dedupeReferences?: (refs: any[]) => any[];
    filterReferences?: (query: string, workspaceId?: string) => any[];
    referenceKey?: (ref: any) => string;
    getInlineCitation?: (ref: any) => string;
    formatReference?: (ref: any) => string;
    getUsedReferences?: () => any[];
    buildBibliographyHTML?: (refs: any[]) => string;
    syncReferenceSection?: () => unknown;
  };
  updateRefSection?: (forceAuto?: boolean) => unknown;
  insRefs?: () => unknown;
  refreshBibliographyManual?: () => unknown;
  resetBibliographyManual?: () => unknown;
  openBibliographySection?: () => unknown;
  setCitationStyle?: (style: string) => void;
  insertCitation?: (refId?: string) => unknown;
  rRefs?: () => any[];
  getUsedRefs?: () => any[];
  filterRefsForQuery?: (refs: any[], query: string) => any[];
  dedupeRefs?: (refs: any[]) => any[];
  sortLib?: (refs: any[]) => any[];
  formatRef?: (ref: any, options?: Record<string, unknown>) => string;
  getCurrentCitationStyle?: () => string;
  save?: () => void;
  uSt?: () => void;
  updatePageHeight?: () => void;
  normalizeCitationSpans?: (root?: HTMLElement | null) => void;
  autoUpdateTOC?: () => void;
  checkTrig?: () => void;
  __aqSetEditorDoc?: (html: string, focusAtEnd?: boolean) => void;
  __aqEngineActive?: boolean;
  cLib?: (workspaceId?: string) => any[];
  findRef?: (id: string, workspaceId?: string) => any;
  refKey?: (ref: any) => string;
  getInlineCitationText?: (ref: any) => string;
  visibleCitationText?: (refs: any[]) => string;
  buildCitationHTML?: (refs: any[]) => string;
  getNarrativeCitationText?: (ref: any) => string;
  __aqReactSyncFromLegacy?: (state: unknown) => void;
};

let activeEditor: any = null;
let activeMount: HTMLElement | null = null;
let activeNotify: (() => void) | null = null;

function normalizeHTML(value: unknown) {
  const html = String(value || '').trim();
  return html || '<p></p>';
}

function repairPersistedWordHTML(win: LegacyWindow, value: unknown) {
  const html = normalizeHTML(value);
  if (win.AQTipTapWordIO && typeof win.AQTipTapWordIO.repairWordImportHTML === 'function') {
    try {
      return normalizeHTML(win.AQTipTapWordIO.repairWordImportHTML(html));
    } catch (_error) {}
  }
  return html;
}

function readPersistedDoc(docId: string, raw: unknown) {
  const data = raw && typeof raw === 'object' ? raw as any : {};
  const docs = Array.isArray(data.docs) ? data.docs : [];
  const preferred = docs.find((doc: any) => doc && doc.id === docId) || docs[0];
  return normalizeHTML(preferred && preferred.content ? preferred.content : data.doc);
}

function buildEditorSurface(mount: HTMLElement) {
  mount.innerHTML = [
    '<div id="legacy-editor-shell" class="h-full w-full" spellcheck="true" data-gramm="true" data-gramm_editor="true">',
    '<div id="escroll" class="aq-editor-scroll">',
    '<div id="coverpage" class="aq-legacy-page" style="display:none"><div id="coverbody"></div></div>',
    '<div id="tocpage" class="aq-legacy-page" style="display:none"><div id="tocbody"></div></div>',
    '<div id="abstractpage" class="aq-legacy-page" style="display:none"><div id="abstractbody"></div></div>',
    '<div id="apapage" class="aq-legacy-page" spellcheck="true"><div id="apaed" spellcheck="true" data-gramm="true" data-gramm_editor="true"></div></div>',
    '<div id="bibpage"></div><div id="appendixpage" class="aq-legacy-page" style="display:none"><div id="appendixbody"></div></div>',
    '</div>',
    '<div id="reflist" hidden></div><div id="bibbody" hidden></div>',
    '</div>'
  ].join('');
}

function markWritingAssistSurface(root: ParentNode | null = document) {
  const targets = [
    document.body,
    document.getElementById('legacy-editor-shell'),
    document.getElementById('escroll'),
    document.getElementById('apapage'),
    document.getElementById('apaed'),
    document.getElementById('aq-engine-host'),
    root && 'querySelector' in root ? root.querySelector('.aq-engine-stage') : null,
    root && 'querySelector' in root ? root.querySelector('.aq-input-capture') : null,
    root && 'querySelector' in root ? root.querySelector('.ProseMirror') : null
  ].filter((node): node is HTMLElement => node instanceof HTMLElement);

  targets.forEach((node) => {
    node.setAttribute('spellcheck', 'true');
    node.setAttribute('data-gramm', 'true');
    node.setAttribute('data-gramm_editor', 'true');
    if (node.id === 'apaed' || node.classList.contains('ProseMirror')) {
      node.setAttribute('role', 'textbox');
      node.setAttribute('aria-multiline', 'true');
    }
  });

  document.querySelectorAll<HTMLElement>('.aq-input-capture').forEach((node) => {
    node.setAttribute('spellcheck', 'true');
    node.setAttribute('autocorrect', 'on');
    node.setAttribute('autocomplete', 'on');
    node.setAttribute('data-gramm', 'true');
    node.setAttribute('data-gramm_editor', 'true');
    node.removeAttribute('aria-hidden');
    node.setAttribute('aria-label', 'AcademiQ editor input');
  });
}

function setAuxiliaryPage(pageId: string, bodyId: string, html: unknown) {
  const content = String(html || '').trim();
  const page = document.getElementById(pageId);
  const body = document.getElementById(bodyId);
  if (body) body.innerHTML = content;
  if (page) page.style.display = content ? 'block' : 'none';
  if (content && pageId === 'abstractpage' && body instanceof HTMLElement) {
    decorateAbstractPage(body);
  }
}

function decorateAbstractPage(body: HTMLElement) {
  if (body.querySelector('.abstract-remove-btn')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'abstract-remove-btn';
  button.textContent = 'Özü Sil';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent('aq:remove-abstract-page'));
  });
  body.appendChild(button);
}

function hydrateAuxiliaryPages(win: LegacyWindow, doc: any) {
  if (!doc) return;
  setAuxiliaryPage('coverpage', 'coverbody', doc.coverHTML);
  setAuxiliaryPage('tocpage', 'tocbody', doc.tocHTML);
  setAuxiliaryPage('abstractpage', 'abstractbody', doc.abstractHTML);
  setAuxiliaryPage('appendixpage', 'appendixbody', doc.appendicesHTML);
  const tocBody = document.getElementById('tocbody');
  try {
    if (tocBody && doc.tocHTML && typeof (win as any).fixTOCDots === 'function') {
      window.setTimeout(() => (win as any).fixTOCDots(tocBody), 0);
    }
  } catch (_error) {}
  try {
    if (doc.appendicesHTML && activeEditor?._aqEngine && typeof (win as any).updateAQEngineAppendices === 'function') {
      (win as any).updateAQEngineAppendices(activeEditor, String(doc.appendicesHTML || ''));
      setAuxiliaryPage('appendixpage', 'appendixbody', '');
    }
  } catch (_error) {}
  try { if (typeof (win as any).syncAuxiliaryPages === 'function') (win as any).syncAuxiliaryPages(); } catch (_error) {}
}

function installLegacySaveBridge(win: LegacyWindow, docId: string, onChange?: CreateAcademiqEditorOptions['onChange']) {
  const legacySave = typeof win.save === 'function' ? win.save.bind(win) : null;
  let saveTimer: number | null = null;
  const notify = () => {
    if (!onChange) return;
    onChange({ docId, html: getEditorHTML(win), snapshot: exportEditorSnapshot(win) });
  };
  const runSave = () => {
    saveTimer = null;
    if (legacySave) legacySave();
    if (typeof win.__aqReactSyncFromLegacy === 'function') win.__aqReactSyncFromLegacy(win.S || {});
    notify();
  };
  activeNotify = notify;
  win.uSt = win.uSt || (() => {});
  win.updatePageHeight = win.updatePageHeight || (() => {});
  win.normalizeCitationSpans = win.normalizeCitationSpans || (() => {});
  win.autoUpdateTOC = win.autoUpdateTOC || (() => {});
  win.checkTrig = win.checkTrig || (() => {});
  win.save = () => {
    const editor = activeEditor || win.editor;
    if (editor && editor._aqEngine) {
      if (saveTimer != null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(runSave, 1800);
      return;
    }
    runSave();
  };
  (win as any).__aqFlushSaveBridge = () => {
    if (saveTimer == null) return;
    window.clearTimeout(saveTimer);
    runSave();
  };
}

function getEditorHTML(win: LegacyWindow) {
  const core = win.AQEditorCore;
  if (core && typeof core.getContent === 'function') return normalizeHTML(core.getContent());
  const editor = activeEditor || win.editor;
  if (editor && typeof editor.getHTML === 'function') return normalizeHTML(editor.getHTML());
  const host = document.getElementById('apaed');
  return normalizeHTML(host ? host.innerHTML : '');
}

function setEditorHTML(win: LegacyWindow, html: string) {
  const next = normalizeHTML(html);
  const editor = activeEditor || win.editor;
  if (editor && editor._aqEngine && editor.commands && typeof editor.commands.setContent === 'function') {
    editor.commands.setContent(next, false);
    return;
  }
  if (win.AQEditorCore && typeof win.AQEditorCore.setContent === 'function' && win.AQEditorCore.setContent(next, false)) return;
  if (typeof win.__aqSetEditorDoc === 'function') {
    win.__aqSetEditorDoc(next, false);
    return;
  }
  if (editor && editor.commands && typeof editor.commands.setContent === 'function') {
    editor.commands.setContent(next, false);
    return;
  }
  const host = document.getElementById('apaed');
  if (host) host.innerHTML = next;
}

function insertEditorHTML(win: LegacyWindow, html: string) {
  const next = String(html || '').trim();
  if (!next) return false;
  const editor = activeEditor || win.editor;
  if (win.AQEditorCore && typeof win.AQEditorCore.insertHTML === 'function') {
    try {
      if (win.AQEditorCore.insertHTML(next)) {
        activeNotify?.();
        return true;
      }
    } catch (_error) {}
  }
  if (editor && editor.commands && typeof editor.commands.insertContent === 'function') {
    try {
      editor.commands.insertContent(next, { parseOptions: { preserveWhitespace: false } });
      if (typeof editor.emit === 'function') editor.emit('update');
      activeNotify?.();
      return true;
    } catch (_error) {}
  }
  if (editor && editor.chain) {
    try {
      if (editor.chain().focus().insertContent(next, { parseOptions: { preserveWhitespace: false } }).run()) {
        activeNotify?.();
        return true;
      }
    } catch (_error) {}
  }
  if (typeof (win as any).iHTML === 'function') {
    try {
      (win as any).iHTML(next);
      activeNotify?.();
      return true;
    } catch (_error) {}
  }
  const host = document.getElementById('apaed');
  if (host) {
    host.insertAdjacentHTML('beforeend', next);
    activeNotify?.();
    return true;
  }
  return false;
}

function exportEditorSnapshot(win: LegacyWindow) {
  const editor = activeEditor || win.editor;
  return {
    docId: win.S && win.S.curDoc ? win.S.curDoc : '',
    html: getEditorHTML(win),
    mode: editor && editor._aqEngine ? 'aq-engine' : editor ? 'tiptap' : 'dom'
  };
}

function getCurrentDoc(win: LegacyWindow) {
  const state = win.S || {};
  const docs = Array.isArray(state.docs) ? state.docs : [];
  const docId = state.curDoc || state.doc || '';
  return docs.find((doc: any) => doc && doc.id === docId) || docs[0] || null;
}

function getCitationStyle(win: LegacyWindow) {
  const doc = getCurrentDoc(win) as any;
  const raw = doc?.citationStyle || (win.S as any)?.citationStyle || win.S?.cm || 'apa7';
  if (win.AQCitationStyles && typeof win.AQCitationStyles.normalizeStyleId === 'function') {
    return win.AQCitationStyles.normalizeStyleId(String(raw || 'apa7'));
  }
  return String(raw || 'apa7').trim().toLowerCase() || 'apa7';
}

function referenceKey(ref: any) {
  if (!ref) return '';
  const id = String(ref.id || '').trim();
  if (id) return `id:${id}`;
  const doi = String(ref.doi || '').trim().toLowerCase();
  if (doi) return `doi:${doi}`;
  return `ref:${String(ref.title || '').trim().toLowerCase()}|${String(ref.year || '').trim()}`;
}

function dedupeReferences(refs: any[]) {
  const seen = new Set<string>();
  return (Array.isArray(refs) ? refs : []).filter((ref) => {
    const key = referenceKey(ref);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortReferences(win: LegacyWindow, refs: any[]) {
  const list = dedupeReferences(refs);
  if (win.AQCitationStyles && typeof win.AQCitationStyles.sortReferences === 'function') {
    return win.AQCitationStyles.sortReferences(list, { style: getCitationStyle(win), locale: 'tr', preserveOrder: false });
  }
  return list.sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || ''), 'tr', { numeric: true, sensitivity: 'base' }));
}

function filterReferences(win: LegacyWindow, query: string, workspaceId?: string) {
  const q = String(query || '').trim().toLocaleLowerCase('tr');
  const refs = win.cLib?.(workspaceId || win.S?.cur) || [];
  if (!q) return refs.slice();
  return refs.filter((ref: any) => {
    const authors = Array.isArray(ref?.authors) ? ref.authors.join(' ') : String(ref?.authors || '');
    const haystack = [
      ref?.title,
      authors,
      ref?.year,
      ref?.journal,
      ref?.publisher,
      ref?.doi,
      ref?.isbn,
      ref?.url,
      Array.isArray(ref?.labels) ? ref.labels.join(' ') : ''
    ].map((part) => String(part || '').toLocaleLowerCase('tr')).join(' ');
    return haystack.includes(q);
  });
}

function formatReference(win: LegacyWindow, ref: any, options?: Record<string, unknown>) {
  if (win.AQCitationStyles && typeof win.AQCitationStyles.formatReference === 'function') {
    return win.AQCitationStyles.formatReference(ref, {
      ...(options || {}),
      style: getCitationStyle(win)
    });
  }
  const authors = Array.isArray(ref?.authors) ? ref.authors.join(', ') : String(ref?.authors || '');
  const year = String(ref?.year || 't.y.');
  const title = String(ref?.title || ref?.id || 'Kaynak');
  const journal = String(ref?.journal || ref?.publisher || ref?.websiteName || '');
  return [authors, `(${year}).`, title + '.', journal].filter(Boolean).join(' ');
}

function visibleCitationText(win: LegacyWindow, refs: any[]) {
  const list = dedupeReferences(Array.isArray(refs) ? refs : []);
  if (win.AQCitationStyles && typeof win.AQCitationStyles.visibleCitationText === 'function') {
    return win.AQCitationStyles.visibleCitationText(list, { style: getCitationStyle(win) });
  }
  return list.map((ref) => String(win.getInlineCitationText?.(ref) || '').replace(/^\(|\)$/g, '')).filter(Boolean).join('; ');
}

function authorSurname(author: unknown) {
  const text = String(author || '').trim();
  if (!text) return '';
  if (text.includes(',')) return text.split(',')[0].trim();
  return text.split(/\s+/).filter(Boolean).pop() || '';
}

function narrativeCitationText(ref: any) {
  const authors = Array.isArray(ref?.authors) ? ref.authors : (ref?.authors ? [ref.authors] : []);
  const surnames = authors.map(authorSurname).filter(Boolean);
  const label = surnames.length === 0
    ? String(ref?.title || ref?.id || 'Kaynak')
    : surnames.length === 1
      ? surnames[0]
      : surnames.length === 2
        ? `${surnames[0]} & ${surnames[1]}`
        : `${surnames[0]} vd.`;
  return `${label}${ref?.year ? ` (${String(ref.year)})` : ''}`;
}

function buildCitationHTML(win: LegacyWindow, refs: any[]) {
  const normalized = sortReferences(win, dedupeReferences(Array.isArray(refs) ? refs : []));
  if (!normalized.length) return '';
  if ((win as any).AQCitationState && typeof (win as any).AQCitationState.buildCitationHTML === 'function') {
    return (win as any).AQCitationState.buildCitationHTML(normalized, {
      citationStyles: win.AQCitationStyles || null,
      styleId: getCitationStyle(win),
      dedupeReferences: (items: any[]) => dedupeReferences(items),
      sortReferences: (items: any[]) => sortReferences(win, items)
    });
  }
  const ids = normalized.map((ref) => ref.id).join(',');
  return `<span class="cit" data-ref="${ids}">${visibleCitationText(win, normalized)}</span> `;
}

function collectUsedReferences(win: LegacyWindow) {
  const editor = activeEditor || win.editor;
  const findReference = (id: string) => win.findRef?.(id, win.S?.cur) || null;
  if (editor && editor._aqEngine && win.AQBibliographyState && typeof win.AQBibliographyState.collectAQEngineUsedReferences === 'function') {
    return win.AQBibliographyState.collectAQEngineUsedReferences(editor, {
      findReference,
      dedupeReferences: (refs: any[]) => dedupeReferences(refs),
      sortReferences: (refs: any[]) => sortReferences(win, refs)
    }) || [];
  }
  const root = document.getElementById('apaed');
  const refs: any[] = [];
  root?.querySelectorAll?.('.cit,[data-ref],[data-aq-ref]').forEach((node) => {
    const raw = (node as HTMLElement).dataset.ref || (node as HTMLElement).dataset.aqRef || '';
    raw.split(',').forEach((id) => {
      const ref = findReference(id.trim());
      if (ref) refs.push(ref);
    });
  });
  return sortReferences(win, refs);
}

function getExtraBibliographyReferences(win: LegacyWindow) {
  const doc = getCurrentDoc(win) as any;
  const ids = Array.isArray(doc?.bibliographyExtraRefIds) ? doc.bibliographyExtraRefIds : [];
  return ids.map((id: unknown) => win.findRef?.(String(id), win.S?.cur)).filter(Boolean);
}

function installReferenceBridge(win: LegacyWindow) {
  win.getCurrentCitationStyle = () => getCitationStyle(win);
  win.dedupeRefs = (refs: any[]) => dedupeReferences(refs);
  win.sortLib = (refs: any[]) => sortReferences(win, refs);
  win.formatRef = (ref: any, options?: Record<string, unknown>) => formatReference(win, ref, options);
  win.visibleCitationText = (refs: any[]) => visibleCitationText(win, refs);
  win.getNarrativeCitationText = (ref: any) => narrativeCitationText(ref);
  win.buildCitationHTML = (refs: any[]) => buildCitationHTML(win, refs);
  win.filterRefsForQuery = (refs: any[], query: string) => filterReferences({ ...win, cLib: () => refs } as LegacyWindow, query);
  win.getUsedRefs = () => collectUsedReferences(win);
  win.rRefs = () => collectUsedReferences(win);
  win.AQReferenceManager = {
    getWorkspaceId: () => win.S?.cur || '',
    getLibrary: (workspaceId?: string) => win.cLib?.(workspaceId || win.S?.cur) || [],
    findReference: (id: string, workspaceId?: string) => win.findRef?.(id, workspaceId || win.S?.cur) || null,
    sortReferences: (refs: any[]) => sortReferences(win, refs),
    dedupeReferences: (refs: any[]) => dedupeReferences(refs),
    filterReferences: (query: string, workspaceId?: string) => filterReferences(win, query, workspaceId),
    referenceKey: (ref: any) => referenceKey(ref),
    getInlineCitation: (ref: any) => win.getInlineCitationText?.(ref) || '',
    formatReference: (ref: any) => formatReference(win, ref),
    getUsedReferences: () => collectUsedReferences(win),
    buildBibliographyHTML: (refs: any[]) => {
      const sorted = sortReferences(win, dedupeReferences(refs || []));
      if (!sorted.length) return '';
      return '<h1>KAYNAKÇA</h1>' + sorted.map((ref, idx) => `<p class="refe">${formatReference(win, ref, { index: idx + 1 })}</p>`).join('');
    },
    syncReferenceSection: () => win.updateRefSection?.(true)
  } as any;

  win.updateRefSection = (forceAuto?: boolean) => {
    const editor = activeEditor || win.editor;
    const state = win.S || {};
    const currentDoc = getCurrentDoc(win);
    const currentDocId = currentDoc?.id || state.curDoc || '';
    const listEl = document.getElementById('reflist');
    const pageEl = document.getElementById('bibpage');
    const bodyEl = document.getElementById('bibbody');
    const findReference = (id: string) => win.findRef?.(id, state.cur) || null;
    const options = {
      state,
      currentDocId,
      editor,
      host: document.getElementById('apaed'),
      listEl,
      pageEl,
      bodyEl,
      forceAuto: !!forceAuto,
      citationApi: (win as any).AQTipTapWordCitation || null,
      findReference,
      getInlineCitationText: (ref: any) => win.getInlineCitationText?.(ref) || '',
      visibleCitationText: (refs: any[]) => visibleCitationText(win, refs),
      formatReference: (ref: any, fmtOptions?: Record<string, unknown>) => formatReference(win, ref, fmtOptions),
      dedupeReferences: (refs: any[]) => dedupeReferences(refs),
      sortReferences: (refs: any[]) => sortReferences(win, refs),
      getExtraReferences: () => getExtraBibliographyReferences(win),
      formatRef: (ref: any, fmtOptions?: Record<string, unknown>) => formatReference(win, ref, fmtOptions),
      onAfterUpdate: () => activeNotify?.()
    };
    if (win.AQBibliographyState && typeof win.AQBibliographyState.syncReferenceViewsForState === 'function') {
      const result = win.AQBibliographyState.syncReferenceViewsForState(options);
      activeNotify?.();
      return result;
    }
    if (win.AQBibliographyState && typeof win.AQBibliographyState.updateBibliographySection === 'function') {
      const refs = collectUsedReferences(win);
      const result = win.AQBibliographyState.updateBibliographySection({ ...options, refs, doc: currentDoc });
      activeNotify?.();
      return result;
    }
    return false;
  };

  win.insRefs = () => {
    const result = win.updateRefSection?.(true);
    const editor = activeEditor || win.editor;
    if (editor && editor._aqEngine && win.AQBibliographyState && typeof win.AQBibliographyState.ensureBibliographySection === 'function') {
      win.AQBibliographyState.ensureBibliographySection(editor, {});
    }
    return result;
  };

  win.refreshBibliographyManual = () => win.AQBibliographyState?.refreshManualBibliographyForState?.({
    state: win.S || {},
    currentDocId: getCurrentDoc(win)?.id || win.S?.curDoc,
    editor: activeEditor || win.editor,
    forceAuto: true,
    findReference: (id: string) => win.findRef?.(id, win.S?.cur) || null,
    visibleCitationText: (refs: any[]) => visibleCitationText(win, refs),
    formatRef: (ref: any, fmtOptions?: Record<string, unknown>) => formatReference(win, ref, fmtOptions),
    dedupeReferences: (refs: any[]) => dedupeReferences(refs),
    sortReferences: (refs: any[]) => sortReferences(win, refs),
    getExtraReferences: () => getExtraBibliographyReferences(win),
    onAfterUpdate: () => activeNotify?.()
  });

  win.resetBibliographyManual = () => {
    win.AQBibliographyState?.resetManualBibliographyForState?.(win.S || {}, getCurrentDoc(win)?.id || win.S?.curDoc);
    return win.updateRefSection?.(true);
  };

  win.openBibliographySection = () => win.AQBibliographyState?.openBibliographySectionForState?.({
    state: win.S || {},
    currentDocId: getCurrentDoc(win)?.id || win.S?.curDoc,
    editor: activeEditor || win.editor,
    pageEl: document.getElementById('bibpage'),
    refreshBibliography: () => win.updateRefSection?.(true)
  }) || win.insRefs?.();

  win.setCitationStyle = (style: string) => {
    const next = win.AQCitationStyles?.normalizeStyleId?.(style) || String(style || 'apa7').trim().toLowerCase() || 'apa7';
    const doc = getCurrentDoc(win) as any;
    if (doc) doc.citationStyle = next;
    if (win.S) {
      (win.S as any).citationStyle = next;
      win.S.cm = next;
    }
    win.updateRefSection?.(true);
    activeNotify?.();
  };
}

function destroyLegacyEditor(win: LegacyWindow) {
  try { if (typeof (win as any).__aqFlushSaveBridge === 'function') (win as any).__aqFlushSaveBridge(); } catch (_error) {}
  const editor = activeEditor || win.editor;
  if (editor && typeof editor.destroy === 'function') {
    try { editor.destroy(); } catch (_error) {}
  }
  activeEditor = null;
  activeNotify = null;
  win.editor = null;
  if (activeMount) activeMount.innerHTML = '';
  activeMount = null;
}

function hydrateInitialDocument(win: LegacyWindow, docId: string, initialState: unknown) {
  const source = initialState && typeof initialState === 'object' ? initialState as any : {};
  const rawHTML = readPersistedDoc(docId, source);
  const html = repairPersistedWordHTML(win, rawHTML);
  const sourceDocs = Array.isArray(source.docs) && source.docs.length ? source.docs : [{ id: docId, content: html }];
  const docs = sourceDocs.map((doc: any) => doc && doc.id === docId ? { ...doc, content: html } : doc);
  win.S = Object.assign({}, win.S || {}, source, {
    cur: source.cur || win.S?.cur || '',
    wss: Array.isArray(source.wss) ? source.wss : win.S?.wss,
    notes: Array.isArray(source.notes) ? source.notes : win.S?.notes,
    curDoc: docId,
    doc: html,
    docs
  });
  win.cLib = (workspaceId?: string) => {
    const state = win.S || {};
    const workspace = (state.wss || []).find((ws: any) => ws && ws.id === (workspaceId || state.cur)) || (state.wss || [])[0];
    return Array.isArray(workspace && workspace.lib) ? workspace.lib : [];
  };
  win.findRef = (id: string, workspaceId?: string) => {
    const refId = String(id || '');
    return (win.cLib?.(workspaceId) || []).find((ref: any) => ref && String(ref.id) === refId) || null;
  };
  win.refKey = (ref: any) => ref && ref.id ? `id:${String(ref.id)}` : '';
  win.getInlineCitationText = (ref: any) => {
    if (!ref) return '';
    if (win.AQCitationStyles && typeof win.AQCitationStyles.visibleCitationText === 'function') {
      return win.AQCitationStyles.visibleCitationText([ref], { style: getCitationStyle(win) });
    }
    const authors = Array.isArray(ref.authors) ? ref.authors : [];
    const first = authors[0] ? String(authors[0]).split(/\s+/).slice(-1)[0] : String(ref.title || ref.id || 'Kaynak');
    return `(${first}${ref.year ? `, ${String(ref.year)}` : ''})`;
  };
  installReferenceBridge(win);
  setEditorHTML(win, html);
  hydrateAuxiliaryPages(win, docs.find((doc: any) => doc && doc.id === docId) || docs[0]);
  if (html !== rawHTML) {
    window.setTimeout(() => {
      try { if (typeof win.save === 'function') win.save(); } catch (_error) {}
    }, 0);
  }
}

export function createAcademiqEditor(options: CreateAcademiqEditorOptions): AcademiqEditorApi {
  const win = window as LegacyWindow;
  destroyLegacyEditor(win);
  activeMount = options.mount;
  buildEditorSurface(options.mount);
  markWritingAssistSurface(options.mount);
  installLegacySaveBridge(win, options.docId, options.onChange);

  const host = document.getElementById('apaed');
  if (host) host.innerHTML = '<p></p>';
  activeEditor = win.AQTipTapWordInit && typeof win.AQTipTapWordInit.init === 'function'
    ? win.AQTipTapWordInit.init()
    : null;
  markWritingAssistSurface(options.mount);
  window.setTimeout(() => markWritingAssistSurface(options.mount), 0);
  win.editor = activeEditor;
  hydrateInitialDocument(win, options.docId, options.initialState);
  installReferenceBridge(win);
  if (win.AQCitationRuntime && typeof win.AQCitationRuntime.init === 'function') {
    try { win.AQCitationRuntime.init(); } catch (_error) {}
  }

  return {
    focus: () => {
      if (win.AQEditorCore && typeof win.AQEditorCore.focus === 'function' && win.AQEditorCore.focus(false)) return;
      const editor = activeEditor || win.editor;
      if (editor && editor.commands && typeof editor.commands.focus === 'function') editor.commands.focus();
    },
    getHTML: () => getEditorHTML(win),
    setHTML: (html: string) => setEditorHTML(win, html),
    insertHTML: (html: string) => {
      insertEditorHTML(win, html);
    },
    insertCitation: (refId: string) => {
      win.AQCitationRuntime?.init?.();
      if (refId && win.AQCitationRuntime && typeof win.AQCitationRuntime.insertSelection === 'function') {
        if (win.AQCitationRuntime.insertSelection(refId)) return;
      }
      if (refId && typeof win.insertCitation === 'function') {
        win.insertCitation(refId);
        return;
      }
      if (win.AQCitationRuntime && typeof win.AQCitationRuntime.openFromSlash === 'function') {
        win.AQCitationRuntime.openFromSlash('', 'inline');
        return;
      }
      if (typeof (win as any).openTrig === 'function') (win as any).openTrig('', 'inline');
    },
    insertBibliography: () => {
      if (win.insRefs) win.insRefs();
      else if (win.updateRefSection) win.updateRefSection(true);
    },
    setCitationStyle: (style: string) => {
      if (win.setCitationStyle) win.setCitationStyle(style);
      else if (win.S) win.S.cm = style;
      activeNotify?.();
    },
    exportSnapshot: () => exportEditorSnapshot(win),
    destroy: () => destroyLegacyEditor(win)
  };
}
