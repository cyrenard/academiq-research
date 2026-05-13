import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContext } from './components/editor/EditorContext';
import { EditorHost } from './components/editor/EditorHost';
import type { AcademiqEditorApi, AcademiqEditorState } from './lib/editor-adapter';
import { AppShell } from './components/shell/AppShell';
import { RefSidebar } from './components/shell/RefSidebar';
import { NoteSidebar, type NoteSidebarTab } from './components/shell/NoteSidebar';
import { StatusBar } from './components/shell/StatusBar';
import { TopToolbar } from './components/shell/TopToolbar';
import {
  addManualNote,
  addDocument,
  addReferenceToActiveWorkspace,
  addWorkspace,
  createBlankState,
  deleteWorkspace,
  deleteDocument,
  getActiveDocument,
  getActiveWorkspace,
  hydrateAppState,
  removeReferenceFromActiveWorkspace,
  renameWorkspace,
  renameDocument,
  switchWorkspace,
  switchDocument,
  updateReferenceInActiveWorkspace,
  updateActiveDocumentHTML,
  type AcademiqAppState,
  type AcademiqNote,
  type AcademiqReference
} from './lib/app-state';
import { WorkspaceTabs } from './components/shell/WorkspaceTabs';
import { DocumentTabs } from './components/shell/DocumentTabs';
import type { CommandItem } from './components/shell/CommandPalette';
import type { FeatureModal } from './components/shell/FeatureModals';
import { callLegacy } from './lib/legacy-feature-adapter';

const CommandPalette = lazy(() => import('./components/shell/CommandPalette').then((module) => ({ default: module.CommandPalette })));
const FeatureModals = lazy(() => import('./components/shell/FeatureModals').then((module) => ({ default: module.FeatureModals })));
const CollectionManagerModal = lazy(() => import('./components/shell/CollectionManagerModal').then((module) => ({ default: module.CollectionManagerModal })));
const WorkspaceNameModal = lazy(() => import('./components/shell/WorkspaceNameModal').then((module) => ({ default: module.WorkspaceNameModal })));
const LegacyCompatibilityHost = lazy(() => import('./components/shell/LegacyCompatibilityHost').then((module) => ({ default: module.LegacyCompatibilityHost })));

type LegacyReferenceFetcher = (value: string, callback: (error: unknown, reference?: AcademiqReference) => void) => void;

const DEFAULT_REFERENCE_LABELS = [
  { name: 'Okudum', color: '#4caf50' },
  { name: 'Önemli', color: '#f44336' },
  { name: 'Metodoloji', color: '#2196f3' },
  { name: 'Teori', color: '#9c27b0' },
  { name: 'Sonra Oku', color: '#ff9800' },
  { name: 'Tezde Kullan', color: '#e91e63' }
];

function labelName(label: unknown) {
  return typeof label === 'string' ? label : String((label as { name?: unknown })?.name || '');
}

function labelColor(label: unknown) {
  return typeof label === 'object' && label ? String((label as { color?: unknown }).color || '') : '';
}

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeDoiInput(value: string) {
  const api = (window as any).AQReferenceParse;
  if (api && typeof api.normalizeDoi === 'function') {
    try {
      const normalized = String(api.normalizeDoi(value) || '');
      if (normalized) return normalized;
    } catch (_error) {}
  }
  let candidate = value.trim();
  if (/^0\.\d{4,9}\//i.test(candidate)) candidate = `1${candidate}`;
  const match = candidate.match(/10\.\d{4,9}\/[^\s"'<>]+/i);
  const doi = match ? match[0] : '';
  return doi
    .replace(/[),.;]+$/, '')
    .replace(/(?:\/|\.)(BIBTEX|RIS|ABSTRACT|FULLTEXT|FULL|PDF|XML|HTML|EPUB)$/i, '')
    .replace(/\/[A-Za-z]$/, '')
    .trim()
    .toLowerCase();
}

function escapeHTML(value: unknown) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function noteTextForInsert(note: AcademiqNote) {
  return String(note.txt || note.q || note.comment || note.sourceExcerpt || '').trim();
}

function buildNoteInsertHTML(note: AcademiqNote) {
  const text = noteTextForInsert(note);
  if (!text) return '';
  const noteId = escapeHTML(note.id);
  const attrs = [
    `data-note-id="${noteId}"`,
    note.rid ? `data-note-ref="${escapeHTML(note.rid)}"` : '',
    note.sourcePage || note.tag ? `data-note-page="${escapeHTML(note.sourcePage || note.tag)}"` : '',
    note.noteType || note.type ? `data-note-type="${escapeHTML(note.noteType || note.type)}"` : ''
  ].filter(Boolean).join(' ');
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((part) => part.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((part, index) => `<p${index === 0 ? ' class="ni"' : ''}>${escapeHTML(part)}</p>`)
    .join('');
  const isQuote = note.noteType === 'direct_quote' || note.type === 'hl' || Boolean(note.q);
  const body = isQuote ? `<blockquote>${paragraphs}</blockquote>` : paragraphs;
  return `<span class="aq-note-link" ${attrs}>${body}</span>`;
}

function collectReferenceIdsFromHTML(html: string) {
  const ids = new Set<string>();
  const source = String(html || '');
  const addIds = (raw: string) => {
    raw.split(',').map((id) => id.trim()).filter(Boolean).forEach((id) => ids.add(id));
  };
  source.replace(/\b(?:data-ref|data-aq-ref)\s*=\s*(['"])(.*?)\1/gi, (_match, _quote, raw) => {
    addIds(String(raw || ''));
    return _match;
  });
  source.replace(/\b(?:ref|id)\s*:\s*(['"]?)([A-Za-z0-9_:-]+)\1/gi, (_match, _quote, raw) => {
    addIds(String(raw || ''));
    return _match;
  });
  return ids;
}

function normalizeIsbnInput(value: string) {
  const api = (window as any).AQReferenceParse;
  if (api && typeof api.normalizeIsbn === 'function') {
    try {
      return String(api.normalizeIsbn(value) || '');
    } catch (_error) {}
  }
  const compact = value.replace(/[^0-9Xx]/g, '').toUpperCase();
  return compact.length === 10 || compact.length === 13 ? compact : '';
}

function fetchLegacyReference(functionName: 'fetchCR' | 'fetchISBN', value: string) {
  const fetcher = (window as any)[functionName] as LegacyReferenceFetcher | undefined;
  if (typeof fetcher !== 'function') return Promise.resolve<AcademiqReference | null>(null);
  return new Promise<AcademiqReference | null>((resolve) => {
    try {
      fetcher(value, (error, reference) => resolve(error || !reference ? null : reference));
    } catch (_error) {
      resolve(null);
    }
  });
}

function hasSameReference(reference: AcademiqReference, input: { doi?: string; isbn?: string; url?: string }) {
  const doi = String(input.doi || '').toLowerCase();
  const isbn = String(input.isbn || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  const url = String(input.url || '').toLowerCase();
  if (doi && String(reference.doi || '').toLowerCase() === doi) return true;
  if (isbn && String(reference.isbn || '').replace(/[^0-9Xx]/g, '').toUpperCase() === isbn) return true;
  if (url && String(reference.url || '').toLowerCase() === url) return true;
  return false;
}

function referenceImportKey(reference: AcademiqReference) {
  const doi = String(reference.doi || '').trim().toLowerCase();
  if (doi) return `doi:${doi}`;
  const isbn = String(reference.isbn || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (isbn) return `isbn:${isbn}`;
  const url = String(reference.url || '').trim().toLowerCase();
  if (url) return `url:${url}`;
  const title = String(reference.title || '').trim().toLowerCase();
  const year = String(reference.year || '').trim();
  const author = Array.isArray(reference.authors) ? String(reference.authors[0] || '').trim().toLowerCase() : '';
  return title ? `title:${title}|${year}|${author}` : '';
}

function isPlaceholderReferenceTitle(title: unknown, reference: AcademiqReference) {
  const normalizedTitle = String(title || '').trim().toLowerCase();
  if (!normalizedTitle) return true;
  const titleAsDoi = normalizeDoiInput(normalizedTitle);
  return [reference.doi, reference.isbn, reference.url]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .some((value) => {
      const valueAsDoi = normalizeDoiInput(value);
      return normalizedTitle === value
        || normalizedTitle.endsWith(value)
        || (!!titleAsDoi && titleAsDoi === value)
        || (!!titleAsDoi && !!valueAsDoi && titleAsDoi === valueAsDoi);
    });
}

function mergeReferenceRecords(target: AcademiqReference, source: AcademiqReference) {
  const merged: AcademiqReference = { ...target };
  Object.entries(source).forEach(([key, value]) => {
    if (key === 'id' || value == null || value === '') return;
    if (key === 'title') {
      if (!merged.title || isPlaceholderReferenceTitle(merged.title, merged)) merged.title = String(value || merged.title || '');
      return;
    }
    if (Array.isArray(value)) {
      const existing = Array.isArray(merged[key]) ? merged[key] as unknown[] : [];
      if (!existing.length) merged[key] = value;
      else if (key === 'labels' || key === 'collectionIds') merged[key] = Array.from(new Set([...existing, ...value]));
      return;
    }
    if (!merged[key]) merged[key] = value;
  });
  return merged;
}

function hasUsableReferenceMetadata(reference: Record<string, any>, query: string) {
  const probe: AcademiqReference = {
    id: 'metadata-probe',
    title: String(reference.title || reference.detectedTitle || ''),
    doi: String(reference.doi || normalizeDoiInput(query) || ''),
    isbn: String(reference.isbn || normalizeIsbnInput(query) || ''),
    url: String(reference.url || (/^https?:\/\//i.test(query) ? query : ''))
  };
  const title = String(reference.title || reference.detectedTitle || '').trim();
  return !!(
    (title && !isPlaceholderReferenceTitle(title, probe))
    || String(reference.doi || '').trim()
    || String(reference.isbn || '').trim()
    || (Array.isArray(reference.authors) && reference.authors.length && reference.year)
  );
}

function normalizeReferenceList(references: AcademiqReference[]) {
  const byKey = new Map<string, AcademiqReference>();
  const output: AcademiqReference[] = [];
  references.forEach((reference) => {
    const key = referenceImportKey(reference);
    if (!key) {
      output.push(reference);
      return;
    }
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, reference);
      output.push(reference);
      return;
    }
    const merged = mergeReferenceRecords(existing, reference);
    byKey.set(key, merged);
    const index = output.findIndex((item) => item.id === existing.id);
    if (index >= 0) output[index] = merged;
  });
  return output;
}

function normalizeReferenceState(state: AcademiqAppState): AcademiqAppState {
  return {
    ...state,
    wss: state.wss.map((workspace) => ({
      ...workspace,
      lib: normalizeReferenceList(Array.isArray(workspace.lib) ? workspace.lib : [])
    }))
  };
}

function upsertReferenceInWorkspace(state: AcademiqAppState, reference: AcademiqReference, rawQuery = '') {
  const workspace = getActiveWorkspace(state);
  const key = referenceImportKey(reference);
  const normalizedQuery = rawQuery.trim().toLowerCase();
  let activeId = reference.id;
  let inserted = false;
  const nextLib = (workspace.lib || []).reduce<AcademiqReference[]>((items, item) => {
    const itemKey = referenceImportKey(item);
    const itemTitle = String(item.title || '').trim().toLowerCase();
    const same = (key && itemKey === key)
      || (!!normalizedQuery && itemTitle === normalizedQuery)
      || (!!reference.doi && itemTitle === reference.doi)
      || (!!reference.doi && itemTitle === reference.doi.replace(/^10\./, '0.'));
    if (same) {
      const merged = mergeReferenceRecords(item, reference);
      activeId = merged.id;
      inserted = true;
      const previousIndex = items.findIndex((existing) => referenceImportKey(existing) === referenceImportKey(merged));
      if (previousIndex >= 0) items[previousIndex] = mergeReferenceRecords(items[previousIndex], merged);
      else items.push(merged);
      return items;
    }
    items.push(item);
    return items;
  }, []);
  if (!inserted) nextLib.unshift(reference);
  return {
    state: {
      ...state,
      wss: state.wss.map((item) => item.id === workspace.id ? { ...item, lib: normalizeReferenceList(nextLib) } : item)
    },
    referenceId: activeId
  };
}

function yearFromCrossrefDate(value: any) {
  const parts = value?.['date-parts'];
  const year = Array.isArray(parts) && Array.isArray(parts[0]) ? parts[0][0] : '';
  return year ? String(year) : '';
}

function mapCrossrefWorkToReference(work: any, doi: string): AcademiqReference {
  const authors = Array.isArray(work?.author)
    ? work.author.map((author: any) => author?.family && author?.given ? `${author.family}, ${author.given}` : String(author?.family || author?.name || '')).filter(Boolean)
    : [];
  const published = work?.['published-print'] || work?.['published-online'] || work?.published || work?.created;
  const pages = String(work?.page || '');
  const pageParts = pages.includes('-') ? pages.split('-') : [pages, ''];
  return {
    id: `ref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: String(Array.isArray(work?.title) ? work.title[0] : work?.title || doi),
    authors,
    year: yearFromCrossrefDate(published),
    journal: String(Array.isArray(work?.['container-title']) ? work['container-title'][0] : work?.['container-title'] || ''),
    volume: String(work?.volume || ''),
    issue: String(work?.issue || ''),
    fp: String(pageParts[0] || ''),
    lp: String(pageParts.slice(1).join('-') || ''),
    doi,
    url: String(work?.URL || `https://doi.org/${doi}`),
    pdfUrl: '',
    labels: [],
    referenceType: 'article'
  };
}

async function fetchDoiReference(doi: string) {
  const crossref = await window.electronAPI?.netFetchJSON?.(
    `https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=academiq@example.com`,
    { timeoutMs: 12000 }
  ) as any;
  if (!crossref?.ok) throw new Error(String(crossref?.error || 'CrossRef yanit vermedi'));
  const ref = mapCrossrefWorkToReference(crossref.data?.message || {}, doi);
  try {
    const unpaywall = await window.electronAPI?.netFetchJSON?.(
      `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=academiq@example.com`,
      { timeoutMs: 12000 }
    ) as any;
    const data = unpaywall?.ok ? unpaywall.data : null;
    const locations = [
      data?.best_oa_location,
      ...(Array.isArray(data?.oa_locations) ? data.oa_locations : [])
    ].filter(Boolean);
    const pdfUrl = locations.map((item: any) => String(item?.url_for_pdf || item?.url || '')).find(Boolean);
    if (pdfUrl) ref.pdfUrl = pdfUrl;
  } catch (_error) {}
  return ref;
}

async function resolveOpenAccessPdfUrl(doi: string) {
  const cleanDoi = normalizeDoiInput(doi);
  if (!cleanDoi) return '';
  const win = window as any;
  if (typeof win.fetchOAUrls === 'function') {
    try {
      const urls = await win.fetchOAUrls(cleanDoi);
      if (Array.isArray(urls)) {
        const url = urls.map((item) => String(item || '').trim()).find(Boolean);
        if (url) return url;
      }
    } catch (_error) {}
  }
  const [openAlex, unpaywall] = await Promise.allSettled([
    window.electronAPI?.netFetchJSON?.(
      `https://api.openalex.org/works/doi:${encodeURIComponent(cleanDoi)}`,
      { timeoutMs: 9000, allowAnyHost: true }
    ),
    window.electronAPI?.netFetchJSON?.(
      `https://api.unpaywall.org/v2/${encodeURIComponent(cleanDoi)}?email=academiq@example.com`,
      { timeoutMs: 9000, allowAnyHost: true }
    )
  ]);
  const candidates: string[] = [];
  if (openAlex.status === 'fulfilled') {
    const result = openAlex.value as any;
    const data = result?.ok ? result.data : null;
    const locations = Array.isArray(data?.locations) ? data.locations : [];
    candidates.push(
      String(data?.open_access?.oa_url || ''),
      ...locations.flatMap((item: any) => [
        String(item?.pdf_url || ''),
        String(item?.landing_page_url || '')
      ])
    );
  }
  if (unpaywall.status === 'fulfilled') {
    const result = unpaywall.value as any;
    const data = result?.ok ? result.data : null;
    const locations = [
      data?.best_oa_location,
      ...(Array.isArray(data?.oa_locations) ? data.oa_locations : [])
    ].filter(Boolean);
    candidates.push(...locations.flatMap((item: any) => [
      String(item?.url_for_pdf || ''),
      String(item?.url || '')
    ]));
  }
  const unique = Array.from(new Set(candidates.map((item) => item.trim()).filter(Boolean)));
  return unique.find((item) => /\.pdf($|[?#])|\/pdf(\/|$|[?#])|pdfdirect|epdf/i.test(item)) || unique[0] || '';
}

function patchReferenceInWorkspace(state: AcademiqAppState, workspaceId: string, referenceId: string, patch: Record<string, unknown>) {
  return {
    ...state,
    wss: state.wss.map((workspace) => workspace.id === workspaceId
      ? {
          ...workspace,
          lib: (workspace.lib || []).map((reference) => reference.id === referenceId ? { ...reference, ...patch } : reference)
        }
      : workspace)
  };
}

function collectOpenAccessPdfCandidates(state: AcademiqAppState) {
  return state.wss.flatMap((workspace) => (workspace.lib || [])
    .filter((reference) => {
      if (!reference || !reference.id) return false;
      if (reference.pdfAttached || reference.pdfData || reference.pdfPath) return false;
      return Boolean(String(reference.pdfUrl || '').trim() || normalizeDoiInput(String(reference.doi || '')));
    })
    .map((reference) => ({ workspaceId: workspace.id, workspaceName: workspace.name, reference })));
}

async function countDownloadedPdfCandidates(
  state: AcademiqAppState,
  candidates: Array<{ workspaceId: string; workspaceName: string; reference: AcademiqReference }>
) {
  let count = 0;
  for (const candidate of candidates) {
    const workspace = state.wss.find((item) => item.id === candidate.workspaceId);
    const reference = (workspace?.lib || []).find((item) => item.id === candidate.reference.id) || candidate.reference;
    if (reference.pdfAttached || reference.pdfData || reference.pdfPath) {
      count++;
      continue;
    }
    try {
      const result = await window.electronAPI?.pdfExists?.(reference.id, { id: candidate.workspaceId, name: candidate.workspaceName }) as any;
      if (result === true || result?.exists === true || result?.found === true) count++;
    } catch (_error) {}
  }
  return count;
}

export default function App() {
  const [appState, setAppState] = useState<AcademiqAppState>(() => createBlankState());
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'library' | 'notes' | 'pdf' | 'focus' | 'settings'>('notes');
  const [activeReferenceId, setActiveReferenceId] = useState('');
  const [rightTab, setRightTab] = useState<NoteSidebarTab>('notes');
  const [noteSidebarOpen, setNoteSidebarOpen] = useState(true);
  const [refSidebarOpen, setRefSidebarOpen] = useState(true);
  const [statusMessage, setStatusMessage] = useState('kaydedildi');
  const [loadMeta, setLoadMeta] = useState<Record<string, unknown> | null>(null);
  const [pdfProgress, setPdfProgress] = useState<{ total: number; attempted: number; downloaded: number; failed: number; active: boolean } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeCollectionId, setActiveCollectionId] = useState('all');
  const [collectionManagerOpen, setCollectionManagerOpen] = useState(false);
  const [workspaceNameModal, setWorkspaceNameModal] = useState<{ mode: 'create' | 'rename'; workspaceId?: string } | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [featureModal, setFeatureModal] = useState<FeatureModal>(null);
  const editorRef = useRef<AcademiqEditorApi | null>(null);
  const appStateRef = useRef(appState);
  const statusTimerRef = useRef<number | null>(null);
  const editorContext = useMemo(() => ({ editorRef }), []);
  const activeWorkspace = getActiveWorkspace(appState);
  const activeDocument = getActiveDocument(appState);
  const activeWorkspaceNotes = useMemo(
    () => appState.notes.filter((note) => String(note.wsId || appState.cur) === appState.cur),
    [appState.notes, appState.cur]
  );
  const activeWorkspaceNotebooks = useMemo(
    () => (appState.notebooks || []).filter((notebook) => String(notebook.wsId || appState.cur) === appState.cur),
    [appState.notebooks, appState.cur]
  );
  const activeDocumentUsedReferences = useMemo(() => {
    const usedIds = collectReferenceIdsFromHTML(String(activeDocument.content || appState.doc || ''));
    if (!usedIds.size) return [];
    return (activeWorkspace.lib || []).filter((ref) => usedIds.has(ref.id));
  }, [activeDocument.content, activeWorkspace.lib, appState.doc]);
  const referenceLabels = useMemo(() => {
    const byName = new Map<string, { name: string; color?: string }>();
    const customLabels = Array.isArray(appState.customLabels) ? appState.customLabels : [];
    customLabels.forEach((label) => {
      const name = labelName(label).trim();
      if (name) byName.set(name, { name, color: labelColor(label) || '#9aa' });
    });
    return Array.from(byName.values());
  }, [appState.customLabels]);
  const wordCount = useMemo(() => {
    const text = String(activeDocument.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text ? String(text.split(' ').length) : '0';
  }, [activeDocument.content]);
  const qualityStatus = useMemo(() => {
    const refs = activeWorkspace.lib || [];
    const healthApi = (window as any).AQMetadataHealth;
    const duplicateApi = (window as any).AQDuplicateDetection;
    const health = healthApi && typeof healthApi.summarizeHealth === 'function'
      ? healthApi.summarizeHealth(refs)
      : { incomplete: 0, suspicious: 0 };
    const duplicateGroups = duplicateApi && typeof duplicateApi.detectDuplicateGroups === 'function'
      ? duplicateApi.detectDuplicateGroups(refs, { workspaceId: activeWorkspace.id }) || []
      : [];
    const issueCount = Number(health.incomplete || 0) + Number(health.suspicious || 0) + duplicateGroups.length;
    const tone = Number(health.suspicious || 0) || duplicateGroups.length ? 'error' : (issueCount ? 'warning' : 'ok');
    return {
      apaLabel: tone === 'error' ? 'APA 7 riskli' : (tone === 'warning' ? 'APA 7 kontrol' : 'APA 7 ok'),
      apaTone: tone as 'ok' | 'warning' | 'error',
      issuesLabel: issueCount ? `${issueCount} sorun` : '0 uyarı',
      issuesTone: tone as 'ok' | 'warning' | 'error',
      duplicateGroups: duplicateGroups.length
    };
  }, [activeWorkspace.id, activeWorkspace.lib]);
  const saveTone = useMemo(() => {
    const normalized = statusMessage.toLocaleLowerCase('tr-TR');
    if (/hata|kaydedilemedi|başarısız|failed|error/.test(normalized)) return 'error';
    if (/kaydediliyor|bekliyor|taslak|degisiklik|saving|pending/.test(normalized)) return 'saving';
    return 'ok';
  }, [statusMessage]);
  const pdfProgressLabel = useMemo(() => {
    if (!pdfProgress || !pdfProgress.total) return '';
    const state = pdfProgress.active ? 'indiriliyor' : 'bitti';
    const failed = pdfProgress.failed ? `, ${pdfProgress.failed} hata` : '';
    return `PDF ${pdfProgress.downloaded}/${pdfProgress.total} indi · ${pdfProgress.attempted}/${pdfProgress.total} denendi${failed} · ${state}`;
  }, [pdfProgress]);

  const openLegacyIssueSurface = () => {
    window.dispatchEvent(new CustomEvent('aq:open-quality-surface', {
      detail: { target: qualityStatus.duplicateGroups ? 'duplicate' : 'metadata' }
    }));
  };

  const openLegacyMetadataSurface = () => {
    window.dispatchEvent(new CustomEvent('aq:open-quality-surface', {
      detail: { target: 'metadata' }
    }));
  };

  const openLegacySaveSurface = () => {
    setFeatureModal('recovery');
  };

  appStateRef.current = appState;

  useEffect(() => {
    (window as any).S = { ...((window as any).S || {}), ...appState };
  }, [appState]);

  useEffect(() => {
    (window as any).__aqReactSyncFromLegacy = (legacyState: unknown) => {
      try {
        const hydrated = normalizeReferenceState(hydrateAppState(legacyState));
        appStateRef.current = hydrated;
        setAppState(hydrated);
        setActiveReferenceId((current) => {
          const workspace = getActiveWorkspace(hydrated);
          return workspace.lib.some((ref) => ref.id === current) ? current : workspace.lib[0]?.id || '';
        });
      } catch (_error) {
        flashStatus('Legacy state senkronize edilemedi');
      }
    };
    return () => {
      delete (window as any).__aqReactSyncFromLegacy;
    };
  }, []);

  const flashStatus = (message: string) => {
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
    setStatusMessage(message);
    statusTimerRef.current = window.setTimeout(() => {
      setStatusMessage('kaydedildi');
      statusTimerRef.current = null;
    }, 1800);
  };

  const persistState = useCallback(async (nextState: AcademiqAppState, draft = false) => {
    appStateRef.current = nextState;
    setAppState(nextState);
    const payload = JSON.stringify(nextState);
    if (draft) await window.electronAPI?.saveEditorDraft?.(payload);
    await window.electronAPI?.saveData?.(payload);
  }, []);

  const persistEditorDraft = useCallback(async (nextState: AcademiqAppState) => {
    appStateRef.current = nextState;
    const win = window as any;
    win.S = { ...(win.S || {}), ...nextState };
    await new Promise<void>((resolve) => {
      const run = async () => {
        try {
          await window.electronAPI?.saveEditorDraft?.(JSON.stringify(nextState));
        } finally {
          resolve();
        }
      };
      if (typeof win.requestIdleCallback === 'function') {
        win.requestIdleCallback(run, { timeout: 1200 });
      } else {
        window.setTimeout(run, 0);
      }
    });
  }, []);

  const reloadStateFromDisk = useCallback(async (focus?: { workspaceId?: string; refId?: string }) => {
    const result = await window.electronAPI?.loadData?.();
    const hydrated = normalizeReferenceState(
      result?.ok && result.data ? hydrateAppState(JSON.parse(String(result.data))) : createBlankState()
    );
    const next = focus?.workspaceId && hydrated.wss.some((workspace) => workspace.id === focus.workspaceId)
      ? switchWorkspace(hydrated, focus.workspaceId)
      : hydrated;
    setLoadMeta(result && typeof result === 'object' ? result as Record<string, unknown> : null);
    setAppState(next);
    appStateRef.current = next;
    const workspace = getActiveWorkspace(next);
    setActiveReferenceId((current) => (
      focus?.refId && workspace.lib.some((ref) => ref.id === focus.refId)
        ? focus.refId
        : workspace.lib.some((ref) => ref.id === current)
          ? current
          : workspace.lib[0]?.id || ''
    ));
    setLoading(false);
    return next;
  }, []);

  const flushEditorToState = useCallback(async () => {
    const currentHTML = editorRef.current?.getHTML?.();
    const nextState = currentHTML ? updateActiveDocumentHTML(appStateRef.current, currentHTML) : appStateRef.current;
    appStateRef.current = nextState;
    setAppState(nextState);
    const win = window as any;
    win.S = { ...(win.S || {}), ...nextState };
    try { if (typeof win.save === 'function') win.save(); } catch (_error) {}
    await window.electronAPI?.saveData?.(JSON.stringify(nextState));
    return nextState;
  }, []);

  useEffect(() => {
    let alive = true;
    reloadStateFromDisk()
      .then(() => {
        if (!alive) return;
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        const fallback = createBlankState();
        setAppState(fallback);
        appStateRef.current = fallback;
        setLoading(false);
        flashStatus('Veri yüklenemedi');
      });
    return () => { alive = false; };
  }, [reloadStateFromDisk]);

  useEffect(() => {
    window.electronAPI?.browserCaptureRendererReady?.()
      .then(() => reloadStateFromDisk().catch(() => undefined))
      .catch(() => {});
    const offIncoming = window.electronAPI?.onBrowserCaptureIncoming?.((payload: any) => {
      const refPayload = payload?.payload || payload || {};
      const ref = {
        id: String(refPayload.id || `cap_${Date.now().toString(36)}`),
        title: String(refPayload.title || refPayload.detectedTitle || refPayload.sourcePageUrl || 'Yakalanan kaynak'),
        authors: Array.isArray(refPayload.authors) ? refPayload.authors : [],
        year: String(refPayload.year || ''),
        doi: String(refPayload.doi || ''),
        url: String(refPayload.url || refPayload.sourcePageUrl || ''),
        pdfUrl: String(refPayload.pdfUrl || ''),
        abstract: String(refPayload.abstract || ''),
        referenceType: String(refPayload.referenceType || 'article'),
        browserCaptureMeta: refPayload
      };
      const targetWorkspaceId = String(refPayload.selectedWorkspaceId || refPayload.workspaceId || '');
      const baseState = targetWorkspaceId && appStateRef.current.wss.some((workspace) => workspace.id === targetWorkspaceId)
        ? switchWorkspace(appStateRef.current, targetWorkspaceId)
        : appStateRef.current;
      const next = addReferenceToActiveWorkspace(baseState, ref);
      persistState(next)
        .then(() => {
          setActiveReferenceId(ref.id);
          flashStatus('Browser capture kaynağı eklendi');
          const queueId = String(payload?.queueId || payload?.id || '');
          if (queueId) window.electronAPI.ackBrowserCapturePayload(queueId).catch(() => {});
        })
        .catch(() => flashStatus('Browser capture kaydedilemedi'));
    });
    const offWorkspace = window.electronAPI?.onBrowserCaptureWorkspaceCreated?.((payload: any) => {
      const name = String(payload?.name || payload?.workspaceName || 'Capture Workspace');
      handleAddWorkspace(name);
      flashStatus('Capture workspace oluşturuldu');
    });
    const offState = window.electronAPI?.onBrowserCaptureStateChanged?.((payload: any) => {
      if (payload?.reason === 'capture-imported') {
        reloadStateFromDisk({
          workspaceId: String(payload.workspaceId || ''),
          refId: String(payload.refId || '')
        })
          .then(() => flashStatus('Browser capture kaynağı eklendi'))
          .catch(() => flashStatus('Browser capture geldi, veri yenilenemedi'));
        return;
      }
      flashStatus('Browser capture durumu güncellendi');
    });
    const offInstitutional = window.electronAPI?.onInstitutionalAccessPdfSaved?.((payload: any) => {
      const refId = String(payload?.refId || '');
      if (!refId) return;
      if (payload?.pending) {
        flashStatus('Kurumsal PDF indiriliyor...');
        return;
      }
      if (!payload?.ok) {
        flashStatus(`Kurumsal PDF bağlanamadı: ${String(payload?.error || 'bilinmeyen hata')}`);
        return;
      }
      const current = appStateRef.current;
      const workspace = getActiveWorkspace(current);
      const ref = workspace.lib.find((item) => item.id === refId);
      if (!ref) {
        flashStatus('Kurumsal PDF indirildi, kaynak yenileniyor');
        reloadStateFromDisk().catch(() => undefined);
        return;
      }
      const labels = Array.from(new Set([...(Array.isArray(ref.labels) ? ref.labels : []), 'PDF']));
      const next = updateReferenceInActiveWorkspace(current, refId, {
        labels,
        pdfAttached: true,
        browserCaptureMeta: {
          ...((ref.browserCaptureMeta && typeof ref.browserCaptureMeta === 'object') ? ref.browserCaptureMeta : {}),
          institutionalAccess: true,
          institutionalCapturedAt: Date.now()
        }
      });
      persistState(next)
        .then(() => flashStatus('Kurumsal PDF kaynağa bağlandı'))
        .catch(() => flashStatus('Kurumsal PDF bağlandı, kayıt güncellenemedi'));
    });
    return () => {
      offIncoming?.();
      offWorkspace?.();
      offState?.();
      offInstitutional?.();
    };
  }, [persistState, reloadStateFromDisk]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && (key === 'k' || (event.shiftKey && key === 'p'))) {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleEditorChange = useCallback((editorState: AcademiqEditorState) => {
    const next = updateActiveDocumentHTML(appStateRef.current, editorState.html);
    persistEditorDraft(next).catch(() => flashStatus('Taslak kaydedilemedi'));
  }, [persistEditorDraft]);

  const handleWorkspaceChange = (workspaceId: string) => {
    const currentHTML = editorRef.current?.getHTML?.();
    const committed = currentHTML ? updateActiveDocumentHTML(appStateRef.current, currentHTML) : appStateRef.current;
    const next = switchWorkspace(committed, workspaceId);
    persistState(next).catch(() => flashStatus('Workspace kaydedilemedi'));
    setActiveReferenceId(getActiveWorkspace(next).lib[0]?.id || '');
    flashStatus('Workspace değişti');
  };

  const handleDocumentChange = (docId: string) => {
    const currentHTML = editorRef.current?.getHTML?.();
    const committed = currentHTML ? updateActiveDocumentHTML(appStateRef.current, currentHTML) : appStateRef.current;
    const next = switchDocument(committed, docId);
    persistState(next).then(() => flashStatus('Belge değişti')).catch(() => flashStatus('Belge kaydedilemedi'));
  };

  const handleAddDocument = () => {
    const name = window.prompt('Belge ad?', `Belge ${appStateRef.current.docs.length + 1}`);
    const currentHTML = editorRef.current?.getHTML?.();
    const committed = currentHTML ? updateActiveDocumentHTML(appStateRef.current, currentHTML) : appStateRef.current;
    const next = addDocument(committed, name || undefined);
    persistState(next).then(() => flashStatus('Belge eklendi')).catch(() => flashStatus('Belge eklenemedi'));
  };

  const handleRenameDocument = () => {
    const current = getActiveDocument(appStateRef.current);
    const name = window.prompt('Belge ad?', current.name || current.id);
    if (!name) return;
    const next = renameDocument(appStateRef.current, current.id, name);
    persistState(next).then(() => flashStatus('Belge yeniden adlandırıldı')).catch(() => flashStatus('Belge kaydedilemedi'));
  };

  const handleDeleteDocument = () => {
    const current = getActiveDocument(appStateRef.current);
    if (appStateRef.current.docs.length <= 1) {
      flashStatus('Son belge silinemez');
      return;
    }
    if (!window.confirm(`${current.name || current.id} silinsin mi?`)) return;
    const next = deleteDocument(appStateRef.current, current.id);
    persistState(next).then(() => flashStatus('Belge silindi')).catch(() => flashStatus('Belge silinemedi'));
  };

  const handleAddWorkspace = (name?: string) => {
    const currentHTML = editorRef.current?.getHTML?.();
    const committed = currentHTML ? updateActiveDocumentHTML(appStateRef.current, currentHTML) : appStateRef.current;
    const next = addWorkspace(committed, name);
    persistState(next).then(() => flashStatus('Workspace eklendi')).catch(() => flashStatus('Workspace eklenemedi'));
    setActiveReferenceId('');
  };

  const openNewWorkspaceModal = () => {
    setWorkspaceNameModal({ mode: 'create' });
  };

  const submitNewWorkspace = (name: string) => {
    const target = workspaceNameModal;
    setWorkspaceNameModal(null);
    if (target?.mode === 'rename') {
      const workspace = appStateRef.current.wss.find((item) => item.id === target.workspaceId);
      if (!workspace) return;
      const next = renameWorkspace(appStateRef.current, workspace.id, name);
      persistState(next).then(() => flashStatus('Workspace yeniden adlandırıldı')).catch(() => flashStatus('Workspace kaydedilemedi'));
      return;
    }
    handleAddWorkspace(name);
  };

  const handleRenameWorkspace = (workspaceId?: string) => {
    const current = appStateRef.current.wss.find((workspace) => workspace.id === workspaceId) || getActiveWorkspace(appStateRef.current);
    setWorkspaceNameModal({ mode: 'rename', workspaceId: current.id });
  };

  const handleDeleteWorkspace = (workspaceId?: string) => {
    const current = appStateRef.current.wss.find((workspace) => workspace.id === workspaceId) || getActiveWorkspace(appStateRef.current);
    if (appStateRef.current.wss.length <= 1) {
      flashStatus('Son workspace silinemez');
      return;
    }
    if (!window.confirm(`${current.name} silinsin mi?`)) return;
    const next = deleteWorkspace(appStateRef.current, current.id);
    persistState(next).then(() => flashStatus('Workspace silindi')).catch(() => flashStatus('Workspace silinemedi'));
    setActiveReferenceId(getActiveWorkspace(next).lib[0]?.id || '');
  };

  const handleReferenceSearch = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const doi = normalizeDoiInput(trimmed);
    const isbn = doi ? '' : normalizeIsbnInput(trimmed);
    const isUrl = /^https?:\/\//i.test(trimmed);
    if (!doi && !isbn && !isUrl) {
      flashStatus('Gecerli DOI, URL veya ISBN girin');
      return;
    }
    const duplicate = getActiveWorkspace(appStateRef.current).lib.find((ref) => hasSameReference(ref, {
      doi,
      isbn,
      url: isUrl ? trimmed : ''
    }));
    const duplicateNeedsMetadata = duplicate && (
      isPlaceholderReferenceTitle(duplicate.title, {
        ...duplicate,
        doi: doi || duplicate.doi,
        isbn: isbn || duplicate.isbn,
        url: isUrl ? trimmed : duplicate.url
      })
      || !Array.isArray(duplicate.authors)
      || !duplicate.authors.length
      || !duplicate.year
      || !duplicate.journal
    );
    if (duplicate && !duplicateNeedsMetadata) {
      setActiveReferenceId(duplicate.id);
      flashStatus('Kaynak zaten kütüphanede');
      return;
    }

    flashStatus(doi ? 'DOI metadata çekiliyor...' : isbn ? 'ISBN metadata çekiliyor...' : 'Kaynak aranıyor...');
    let metadata: AcademiqReference | Record<string, unknown> | null = null;
    try {
      if (doi) {
        metadata = await fetchDoiReference(doi);
      } else if (isbn) {
        metadata = await fetchLegacyReference('fetchISBN', isbn);
      } else if (isUrl) {
        const lookup = await window.electronAPI?.lookupBrowserCaptureTarget?.({ sourcePageUrl: trimmed, detectedTitle: trimmed });
        if (lookup && typeof lookup === 'object') metadata = lookup as Record<string, unknown>;
      }
    } catch (_error) {}
    if (!metadata || !hasUsableReferenceMetadata(metadata as Record<string, any>, trimmed)) {
      flashStatus(doi ? 'DOI metadata alınamadı' : isbn ? 'ISBN metadata alınamadı' : 'URL metadata alınamadı');
      return;
    }
    const source = metadata && typeof metadata === 'object' ? metadata as Record<string, any> : {};
    const ref = {
      id: `ref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      ...source,
      title: String(source.title || source.detectedTitle || trimmed),
      doi: doi || String(source.doi || ''),
      isbn: isbn || String(source.isbn || ''),
      url: isUrl ? trimmed : String(source.url || (doi ? `https://doi.org/${doi}` : '')),
      year: String(source.year || ''),
      authors: Array.isArray(source.authors) ? source.authors : [],
      labels: Array.isArray(source.labels) ? source.labels : []
    } as AcademiqReference;
    const { state: next, referenceId } = upsertReferenceInWorkspace(appStateRef.current, ref, trimmed);
    await persistState(next);
    setActiveReferenceId(referenceId);
    if (doi && ref.pdfUrl) {
      try {
        const result = await window.electronAPI?.downloadPDFfromURL?.(String(ref.pdfUrl), referenceId, {
          expectedDoi: doi,
          expectedTitle: ref.title,
          expectedAuthors: ref.authors,
          expectedYear: ref.year,
          requireDoiEvidence: true
        }) as any;
        if (result?.ok) {
          const withPdf = updateReferenceInActiveWorkspace(appStateRef.current, referenceId, {
            pdfUrl: ref.pdfUrl,
            pdfAttached: true,
            pdfVerification: result.verification || null
          });
          await persistState(withPdf);
          flashStatus('Kaynak eklendi, OA PDF indirildi');
          return;
        }
      } catch (_error) {}
    }
    flashStatus(metadata ? 'Kaynak metadata ile eklendi' : 'Kaynak eklendi');
  };

  const handleImportReferences = useCallback((entries: AcademiqReference[], sourceLabel: string, options?: { includeInBibliography?: boolean; revealBibliography?: boolean }) => {
    const workspace = getActiveWorkspace(appStateRef.current);
    const existingKeys = new Set((workspace.lib || []).map(referenceImportKey).filter(Boolean));
    let next = appStateRef.current;
    let imported = 0;
    let duplicates = 0;
    let firstImportedId = '';
    const bibliographyIds: string[] = [];
    entries.forEach((entry) => {
      const key = referenceImportKey(entry);
      if (key && existingKeys.has(key)) {
        duplicates++;
        const existing = (getActiveWorkspace(next).lib || []).find((item) => referenceImportKey(item) === key);
        if (existing?.id) bibliographyIds.push(String(existing.id));
        return;
      }
      const ref: AcademiqReference = {
        ...entry,
        id: String(entry.id || `ref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`),
        title: String(entry.title || entry.doi || entry.url || 'Başlıksız kaynak'),
        authors: Array.isArray(entry.authors) ? entry.authors : [],
        year: String(entry.year || ''),
        labels: Array.isArray(entry.labels) ? entry.labels : [],
        wsId: workspace.id
      };
      next = addReferenceToActiveWorkspace(next, ref);
      if (key) existingKeys.add(key);
      if (!firstImportedId) firstImportedId = ref.id;
      bibliographyIds.push(ref.id);
      imported++;
    });
    if (options?.includeInBibliography && bibliographyIds.length) {
      const uniqueIds = Array.from(new Set(bibliographyIds.map((id) => String(id || '').trim()).filter(Boolean)));
      next = {
        ...next,
        docs: next.docs.map((doc) => {
          if (doc.id !== next.curDoc) return doc;
          const currentIds = Array.isArray((doc as any).bibliographyExtraRefIds) ? (doc as any).bibliographyExtraRefIds.map(String) : [];
          return {
            ...doc,
            bibliographyManual: false,
            bibliographyExtraRefIds: Array.from(new Set([...currentIds, ...uniqueIds]))
          };
        })
      };
    }
    if (!imported && duplicates && !options?.includeInBibliography) {
      flashStatus(`${sourceLabel}: tum kaynaklar zaten var`);
      return;
    }
    persistState(next)
      .then(() => {
        if (firstImportedId) setActiveReferenceId(firstImportedId);
        flashStatus(`${sourceLabel}: ${imported} eklendi${duplicates ? `, ${duplicates} duplicate` : ''}`);
        if (options?.includeInBibliography) {
          window.setTimeout(() => {
            const win = window as any;
            if (typeof win.updateRefSection === 'function') win.updateRefSection(true);
            if (options.revealBibliography && typeof win.openBibliographySection === 'function') win.openBibliographySection();
          }, 120);
        }
      })
      .catch(() => flashStatus(`${sourceLabel}: kaynaklar kaydedilemedi`));
  }, [persistState]);

  const handleOpenPDF = async () => {
    flashStatus('PDF seçiliyor...');
    try {
      const result = await window.electronAPI?.openPDFDialog?.() as any;
      const files = result && Array.isArray(result.files) ? result.files : [];
      if (!files.length) {
        flashStatus('PDF seçilmedi');
        return;
      }
      let next = appStateRef.current;
      for (const file of files) {
        const refId = `pdf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        const name = String(file.name || 'PDF');
        try {
          if (file.buffer) await window.electronAPI?.savePDF?.(refId, file.buffer, { id: next.cur, name: getActiveWorkspace(next).name });
        } catch (_error) {}
        next = addReferenceToActiveWorkspace(next, {
          id: refId,
          title: name.replace(/\.pdf$/i, ''),
          year: '',
          authors: [],
          labels: ['PDF'],
          pdfAttached: true
        });
        setActiveReferenceId(refId);
      }
      await persistState(next);
      flashStatus(`${files.length} PDF eklendi`);
    } catch (_error) {
      flashStatus('PDF eklenemedi');
    }
  };

  const handleAddNote = (input: { text: string; tag?: string; noteType?: string }) => {
    const next = addManualNote(appStateRef.current, input);
    persistState(next).then(() => flashStatus('Not kaydedildi')).catch(() => flashStatus('Not kaydedilemedi'));
  };

  const handleUpdateNote = (noteId: string, patch: Record<string, unknown>) => {
    const next = {
      ...appStateRef.current,
      notes: appStateRef.current.notes.map((note) => note.id === noteId && String(note.wsId || appStateRef.current.cur) === appStateRef.current.cur ? { ...note, ...patch } : note)
    };
    persistState(next).then(() => flashStatus('Not güncellendi')).catch(() => flashStatus('Not kaydedilemedi'));
  };

  const handleInsertNoteIntoDocument = (note: AcademiqNote) => {
    const win = window as any;
    let inserted = false;
    try {
      if (win.AQNotes && typeof win.AQNotes.insertNoteIntoEditor === 'function') {
        inserted = Boolean(win.AQNotes.insertNoteIntoEditor(note.id));
      }
    } catch (_error) {}
    if (!inserted) {
      try {
        if (typeof win.insCiteNote === 'function') inserted = Boolean(win.insCiteNote(note.id));
      } catch (_error) {}
    }
    if (!inserted) {
      const html = buildNoteInsertHTML(note);
      if (!html) {
        flashStatus('Not metni bos');
        return;
      }
      try {
        editorRef.current?.insertHTML(html);
        inserted = true;
      } catch (_error) {
        inserted = false;
      }
    }
    if (!inserted) {
      flashStatus('Not belgeye eklenemedi');
      return;
    }
    const next = {
      ...appStateRef.current,
      notes: appStateRef.current.notes.map((item) => item.id === note.id && String(item.wsId || appStateRef.current.cur) === appStateRef.current.cur ? { ...item, inserted: true } : item)
    };
    persistState(next).then(() => flashStatus('Not belgeye eklendi')).catch(() => flashStatus('Not eklendi, kayıt hatası'));
  };

  const handleUpdateReference = (referenceId: string, patch: Record<string, unknown>) => {
    const next = updateReferenceInActiveWorkspace(appStateRef.current, referenceId, patch);
    persistState(next).then(() => flashStatus('Kaynak güncellendi')).catch(() => flashStatus('Kaynak kaydedilemedi'));
  };

  const handleDeleteReference = async (referenceId: string) => {
    if (!window.confirm('Kaynak silinsin mi?')) return;
    const next = removeReferenceFromActiveWorkspace(appStateRef.current, referenceId);
    await persistState(next);
    try {
      await window.electronAPI?.deletePDF?.(referenceId, { id: next.cur, name: getActiveWorkspace(next).name });
    } catch (_error) {}
    setActiveReferenceId(getActiveWorkspace(next).lib[0]?.id || '');
    flashStatus('Kaynak silindi');
  };

  const renderPdfBufferFallback = async (buffer: unknown, title: string, scale = 1.25) => {
    const win = window as any;
    const pdfjs = win.pdfjsLib;
    const panel = document.getElementById('pdfpanel');
    const scroll = document.getElementById('pdfscroll');
    if (!pdfjs?.getDocument || !panel || !scroll) return false;
    try {
      const source = buffer instanceof ArrayBuffer
        ? buffer.slice(0)
        : ArrayBuffer.isView(buffer as ArrayBufferView)
          ? (buffer as ArrayBufferView).buffer.slice((buffer as ArrayBufferView).byteOffset, (buffer as ArrayBufferView).byteOffset + (buffer as ArrayBufferView).byteLength)
          : buffer;
      const loadingTask = pdfjs.getDocument({ data: source });
      const pdf = await loadingTask.promise;
      panel.classList.add('open');
      const titleNode = document.getElementById('pdftitle');
      if (titleNode) titleNode.textContent = title;
      scroll.innerHTML = '';
      const total = Number(pdf.numPages || 0);
      const pdfUtil = pdfjs.Util || {};
      const savedHighlightsRaw = Array.isArray(win.__aqCurrentPdfReference?._hlData)
        ? win.__aqCurrentPdfReference._hlData
        : [];
      const savedHighlights = savedHighlightsRaw.map((item: any, index: number) => ({
        ...item,
        id: String(item?.id || `hl_${Number(item?.page || 1)}_${index}_${String(item?.createdAt || Date.now())}`)
      }));
      if (win.__aqCurrentPdfReference) win.__aqCurrentPdfReference._hlData = savedHighlights.slice();
      win.hlData = savedHighlights.slice();
      for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const wrap = document.createElement('div');
        wrap.className = 'pdf-page-wrap';
        wrap.dataset.page = String(pageNumber);
        wrap.dataset.pageNumber = String(pageNumber);
        wrap.style.width = `${Math.round(viewport.width)}px`;
        wrap.style.minHeight = `${Math.round(viewport.height)}px`;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.round(viewport.width)}px`;
        canvas.style.height = `${Math.round(viewport.height)}px`;
        wrap.appendChild(canvas);
        const textLayer = document.createElement('div');
        textLayer.className = 'textLayer';
        textLayer.style.width = `${Math.round(viewport.width)}px`;
        textLayer.style.height = `${Math.round(viewport.height)}px`;
        textLayer.style.setProperty('--scale-factor', String(scale));
        wrap.appendChild(textLayer);
        const highlightCanvas = document.createElement('canvas');
        highlightCanvas.className = 'hl-overlay';
        highlightCanvas.width = Math.floor(viewport.width * dpr);
        highlightCanvas.height = Math.floor(viewport.height * dpr);
        highlightCanvas.style.width = `${Math.round(viewport.width)}px`;
        highlightCanvas.style.height = `${Math.round(viewport.height)}px`;
        wrap.appendChild(highlightCanvas);
        const drawCanvas = document.createElement('canvas');
        drawCanvas.className = 'draw-overlay';
        drawCanvas.width = Math.floor(viewport.width * dpr);
        drawCanvas.height = Math.floor(viewport.height * dpr);
        drawCanvas.style.width = `${Math.round(viewport.width)}px`;
        drawCanvas.style.height = `${Math.round(viewport.height)}px`;
        wrap.appendChild(drawCanvas);
        const savedDrawing = win.__aqCurrentPdfReference?._drawings?.[String(pageNumber)];
        if (savedDrawing) {
          const drawContext = drawCanvas.getContext('2d');
          if (drawContext) {
            const image = new Image();
            image.onload = () => {
              drawContext.setTransform(dpr, 0, 0, dpr, 0, 0);
              drawContext.drawImage(image, 0, 0, Math.round(viewport.width), Math.round(viewport.height));
            };
            image.src = String(savedDrawing);
          }
        }
        scroll.appendChild(wrap);
        if (context) {
          context.setTransform(dpr, 0, 0, dpr, 0, 0);
          await page.render({ canvasContext: context, viewport }).promise;
        }
        try {
          const content = await page.getTextContent({ normalizeWhitespace: true });
          if (typeof pdfjs.renderTextLayer === 'function') {
            const task = pdfjs.renderTextLayer({
              container: textLayer,
              viewport,
              textDivs: [],
              textContent: content,
              textContentSource: content
            });
            await (task?.promise || task);
            textLayer.querySelectorAll<HTMLElement>('span').forEach((span) => {
              span.dataset.page = String(pageNumber);
            });
          } else {
            (content.items || []).forEach((item: any) => {
              const text = String(item.str || '');
              if (!text.trim()) return;
              const transform = typeof pdfUtil.transform === 'function'
                ? pdfUtil.transform(viewport.transform, item.transform)
                : item.transform;
              const x = Number(transform?.[4] || 0);
              const y = Number(transform?.[5] || 0);
              const fontHeight = Math.hypot(Number(transform?.[2] || 0), Number(transform?.[3] || 0)) || Math.abs(Number(transform?.[3] || 0)) || 10;
              const span = document.createElement('span');
              span.textContent = text;
              span.dataset.page = String(pageNumber);
              span.style.left = `${x}px`;
              span.style.top = `${y - fontHeight}px`;
              span.style.fontSize = `${fontHeight}px`;
              span.style.fontFamily = 'serif';
              const itemWidth = Number(item.width || 0) * scale;
              if (itemWidth > 0) {
                span.style.transform = `scaleX(${Math.max(0.1, itemWidth / Math.max(1, text.length * fontHeight * 0.5))})`;
              }
              textLayer.appendChild(span);
            });
          }
        } catch (error) {
          console.warn('[react-pdf-text-layer]', error);
        }
        const pageHighlights = savedHighlights
          .map((item: any, index: number) => ({
            ...item,
            id: String(item?.id || `hl_${Number(item?.page || 1)}_${index}_${String(item?.createdAt || Date.now())}`)
          }))
          .filter((item: any) => Number(item?.page || 0) === pageNumber);
        if (pageHighlights.length) {
          const highlightContext = highlightCanvas.getContext('2d');
          if (highlightContext) {
            pageHighlights.forEach((highlight: any) => {
              highlightContext.save();
              highlightContext.globalAlpha = 0.38;
              highlightContext.fillStyle = String(highlight.color || '#fef08a');
              (Array.isArray(highlight.rects) ? highlight.rects : []).forEach((rect: any) => {
                const x = Number(rect.x) || 0;
                const y = Number(rect.y) || 0;
                const w = Number(rect.w) || 0;
                const h = Number(rect.h) || 0;
                highlightContext.fillRect(x * highlightCanvas.width, y * highlightCanvas.height, w * highlightCanvas.width, h * highlightCanvas.height);
                const hit = document.createElement('button');
                hit.type = 'button';
                hit.className = 'pdf-fallback-highlight-hit';
                hit.dataset.highlightId = String(highlight.id || '');
                hit.dataset.page = String(pageNumber);
                hit.dataset.text = String(highlight.text || '');
                hit.dataset.rects = JSON.stringify(highlight.rects || []);
                hit.style.left = `${x * 100}%`;
                hit.style.top = `${y * 100}%`;
                hit.style.width = `${w * 100}%`;
                hit.style.height = `${h * 100}%`;
                wrap.appendChild(hit);
              });
              highlightContext.restore();
            });
          }
        }
      }
      const pageNode = document.getElementById('pdfpg');
      if (pageNode) pageNode.textContent = total ? `1/${total}` : '--';
      const zoomNode = document.getElementById('pdfzoom');
      if (zoomNode) zoomNode.textContent = `${Math.round(scale * 100)}%`;
      const metaNode = document.getElementById('pdfreadmeta');
      if (metaNode) metaNode.textContent = title;
      win.__aqPdfFallbackHighlights = savedHighlights.slice();
      win.__aqPdfFallbackState = { buffer, title, scale, page: 1, total, pdf, pdfjs };
      const statsNode = document.getElementById('pdfreadstats');
      if (statsNode) {
        const noteCount = Array.isArray(win.__aqCurrentPdfReference?._annots) ? win.__aqCurrentPdfReference._annots.length : 0;
        statsNode.textContent = `${savedHighlights.length} highlight - ${noteCount} not`;
      }
      if (Array.isArray(win.__aqCurrentPdfReference?._annots) && typeof win.restoreAnnots === 'function') {
        window.setTimeout(() => {
          try { win.restoreAnnots(win.__aqCurrentPdfReference._annots); } catch (_error) {}
        }, 0);
      }
      return total > 0;
    } catch (error) {
      console.error('[react-pdf-fallback]', error);
      return false;
    }
  };

  useEffect(() => {
    const win = window as any;
    win.__aqRenderPdfFallback = renderPdfBufferFallback;
    return () => {
      delete win.__aqRenderPdfFallback;
    };
  }, []);

  const handleReferencePdfAction = async (action: 'open' | 'show' | 'delete' | 'download' | 'browser' | 'institutional', referenceId: string) => {
    const workspace = getActiveWorkspace(appStateRef.current);
    const ref = workspace.lib.find((item) => item.id === referenceId);
    try {
      if (action === 'open') {
        setActiveReferenceId(referenceId);
        const win = window as any;
        win.S = { ...(win.S || {}), ...appStateRef.current, cur: workspace.id };
        win.__aqCurrentPdfReference = ref;
        let opened = false;
        if (typeof win.openRef === 'function') {
          try {
            await Promise.resolve(win.openRef(referenceId));
            const panelOpen = Boolean(document.getElementById('pdfpanel')?.classList.contains('open'));
            const hasRenderedPdf = Boolean(
              document.querySelector('#pdfscroll .pdf-page-wrap, #pdfscroll canvas')
            );
            opened = panelOpen && hasRenderedPdf;
          } catch (_error) {
            opened = false;
          }
        }
        if (!opened && ref) {
          const result = await window.electronAPI?.loadPDF?.(referenceId, { id: workspace.id, name: workspace.name }) as any;
          const buffer = result?.ok ? result.buffer : null;
          if (buffer) {
            const legacyWs = Array.isArray(win.S?.wss) ? win.S.wss.find((item: any) => item?.id === workspace.id) : null;
            const legacyRef = legacyWs && Array.isArray(legacyWs.lib) ? legacyWs.lib.find((item: any) => item?.id === referenceId) : null;
            if (legacyRef) legacyRef.pdfData = buffer;
            const panel = document.getElementById('pdfpanel');
            const title = String(ref.title || ref.doi || 'PDF').slice(0, 55);
            panel?.classList.add('open');
            const titleNode = document.getElementById('pdftitle');
            if (titleNode) titleNode.textContent = title;
            if (typeof win.__aqOpenPdfBuffer === 'function') {
              opened = Boolean(win.__aqOpenPdfBuffer({
                refId: referenceId,
                title,
                pdfData: buffer,
                workspaceId: workspace.id
              }));
              if (opened) {
                await new Promise((resolve) => window.setTimeout(resolve, 250));
                opened = Boolean(document.querySelector('#pdfscroll .pdf-page-wrap, #pdfscroll canvas'));
              }
            } else if (typeof win.addPdfTab === 'function') {
              win.addPdfTab(title, buffer, referenceId);
              opened = true;
            } else if (typeof win.openRef === 'function') {
              await Promise.resolve(win.openRef(referenceId));
              opened = Boolean(panel?.classList.contains('open') && document.querySelector('#pdfscroll .pdf-page-wrap, #pdfscroll canvas'));
            }
            if (!opened) opened = await renderPdfBufferFallback(buffer, title);
          } else if (result && result.ok === false) {
            flashStatus(`PDF yüklenemedi: ${String(result.error || 'dosya bulunamadı')}`);
          }
        }
        if (!opened) {
          const panel = document.getElementById('pdfpanel');
          if (panel?.classList.contains('open')) {
            flashStatus('PDF açılıyor');
          } else {
            panel?.classList.add('open');
            flashStatus(panel ? 'PDF dosyası bulunamadı' : 'PDF viewer hazır değil');
          }
        } else {
          flashStatus('PDF açılıyor');
        }
      }
      if (action === 'show') {
        await window.electronAPI?.showPdfInExplorer?.(referenceId, { id: workspace.id, name: workspace.name });
        flashStatus('PDF klasörde gösterildi');
      }
      if (action === 'delete') {
        if (!window.confirm('Bu kaynağın PDF dosyası silinsin mi?')) return;
        await window.electronAPI?.deletePDF?.(referenceId, { id: workspace.id, name: workspace.name });
        flashStatus('PDF silindi');
      }
      if (action === 'browser') {
        if (!ref) {
          flashStatus('Kaynak seçilmedi');
          return;
        }
        const doiUrl = ref.doi ? `https://doi.org/${String(ref.doi).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').trim()}` : '';
        const url = String(ref.pdfUrl || ref.url || doiUrl || '').trim();
        if (!url) {
          flashStatus('Tarayıcıda açılacak URL yok');
          return;
        }
        const result = await window.electronAPI?.openExternalUrl?.(url) as any;
        flashStatus(result?.ok ? 'Tarayıcıda açıldı' : 'Tarayıcıda açılamadı');
      }
      if (action === 'institutional') {
        if (!ref) {
          flashStatus('Kaynak seçilmedi');
          return;
        }
        const doiUrl = ref.doi ? `https://doi.org/${String(ref.doi).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').trim()}` : '';
        const url = String(ref.pdfUrl || ref.url || doiUrl || '').trim();
        if (!url) {
          flashStatus('Kurumsal erişim için URL/DOI yok');
          return;
        }
        const isScienceDirect = [ref.pdfUrl, ref.url, doiUrl].some((value) => {
          try {
            const host = new URL(String(value || '')).hostname.toLowerCase();
            return host === 'sciencedirect.com' || host.endsWith('.sciencedirect.com');
          } catch (_error) {
            return false;
          }
        });
        if (isScienceDirect) {
          const result = await window.electronAPI?.openExternalUrl?.(url) as any;
          flashStatus(result?.ok ? 'ScienceDirect varsayılan tarayıcıda açıldı · PDF için Browser Capture kullan' : 'ScienceDirect açılamadı');
          return;
        }
        const result = await window.electronAPI?.openInstitutionalAccess?.({
          refId: referenceId,
          title: ref.title,
          doi: ref.doi,
          pdfUrl: ref.pdfUrl,
          url: ref.url || url,
          ws: { id: workspace.id, name: workspace.name }
        }) as any;
        flashStatus(result?.ok ? 'Kurumsal pencere açıldı · PDF indirirsen kaynağa bağlanacak' : `Kurumsal pencere açılamadı: ${String(result?.error || '')}`);
      }
      if (action === 'download') {
        if (!ref) {
          flashStatus('Kaynak seçilmedi');
          return;
        }
        setPdfProgress({ total: 1, attempted: 0, downloaded: 0, failed: 0, active: true });
        setActiveReferenceId(referenceId);
        const win = window as any;
        let url = String(ref.pdfUrl || '').trim();
        if (!url && ref.doi && typeof win.fetchOAUrls === 'function') {
          flashStatus('OA PDF URL aranıyor...');
          try {
            const urls = await win.fetchOAUrls(ref.doi);
            if (Array.isArray(urls) && urls.length) {
              url = String(urls[0] || '').trim();
              if (url) {
                const next = updateReferenceInActiveWorkspace(appStateRef.current, referenceId, { pdfUrl: url });
                await persistState(next);
              }
            }
          } catch (_error) {}
        }
        url = url || String(ref.url || '').trim();
        if (!url) {
          setPdfProgress({ total: 1, attempted: 1, downloaded: 0, failed: 1, active: false });
          flashStatus('PDF URL bulunamadı');
          return;
        }
        const result = await window.electronAPI?.downloadPDFfromURL?.(url, referenceId, {
          ws: { id: workspace.id, name: workspace.name },
          expectedDoi: ref.doi,
          expectedTitle: ref.title,
          expectedAuthors: ref.authors,
          expectedYear: ref.year,
          requireDoiEvidence: Boolean(ref.doi),
          allowUnverifiedPdf: true
        }) as any;
        if (result?.ok) {
          setPdfProgress({ total: 1, attempted: 1, downloaded: 1, failed: 0, active: false });
          callLegacy('openRef', referenceId);
          flashStatus('PDF indirildi');
        } else {
          setPdfProgress({ total: 1, attempted: 1, downloaded: 0, failed: 1, active: false });
          flashStatus(`PDF indirilemedi${result?.error ? ` · ${String(result.error).slice(0, 120)}` : ''}`);
        }
      }
    } catch (_error) {
      if (action === 'download') setPdfProgress({ total: 1, attempted: 1, downloaded: 0, failed: 1, active: false });
      flashStatus('PDF işlemi başarısız');
    }
  };

  const handleToggleReferenceCollection = (referenceId: string, collectionId: string) => {
    const workspace = getActiveWorkspace(appStateRef.current);
    const ref = workspace.lib.find((item) => item.id === referenceId);
    if (!ref) return;
    const current = Array.isArray(ref.collectionIds) ? ref.collectionIds.map((id) => String(id)) : [];
    const nextCollectionIds = current.some((id) => id === String(collectionId))
      ? current.filter((id) => id !== String(collectionId))
      : [...current, String(collectionId)];
    const next = updateReferenceInActiveWorkspace(appStateRef.current, referenceId, { collectionIds: nextCollectionIds });
    persistState(next)
      .then(() => flashStatus(nextCollectionIds.length === current.length ? 'Kaynak klasörden çıkarıldı' : 'Kaynak klasöre eklendi'))
      .catch(() => flashStatus('Klasör ataması kaydedilemedi'));
  };

  const handleToggleReferenceLabel = (referenceId: string, label: { name: string; color?: string }) => {
    const workspace = getActiveWorkspace(appStateRef.current);
    const ref = workspace.lib.find((item) => item.id === referenceId);
    if (!ref || !label.name.trim()) return;
    const current = Array.isArray(ref.labels) ? ref.labels : [];
    const exists = current.some((item) => labelName(item) === label.name);
    const nextLabels = exists
      ? current.filter((item) => labelName(item) !== label.name)
      : [...current, { name: label.name, color: label.color || '#9aa' }];
    const next = updateReferenceInActiveWorkspace(appStateRef.current, referenceId, { labels: nextLabels });
    persistState(next)
      .then(() => flashStatus(exists ? 'Etiket kaldırıldı' : 'Etiket eklendi'))
      .catch(() => flashStatus('Etiket kaydedilemedi'));
  };

  const handleCreateLabel = (name: string) => {
    const label = name.trim();
    if (!label) return;
    const customLabels = Array.isArray(appStateRef.current.customLabels) ? appStateRef.current.customLabels : [];
    if (referenceLabels.some((item) => item.name.toLowerCase() === label.toLowerCase())) {
      flashStatus('Etiket zaten var');
      return;
    }
    const colors = ['#4caf50', '#f44336', '#2196f3', '#9c27b0', '#ff9800', '#e91e63', '#00bcd4', '#795548'];
    const next = {
      ...appStateRef.current,
      customLabels: [...customLabels, { name: label, color: colors[customLabels.length % colors.length] }]
    };
    persistState(next)
      .then(() => flashStatus('Etiket oluşturuldu'))
      .catch(() => flashStatus('Etiket kaydedilemedi'));
  };

  const handleDeleteLabel = (name: string) => {
    const label = name.trim();
    if (!label) return;
    if (!window.confirm(`${label} etiketi silinsin mi?`)) return;
    const customLabels = Array.isArray(appStateRef.current.customLabels) ? appStateRef.current.customLabels : [];
    const next = {
      ...appStateRef.current,
      customLabels: customLabels.filter((item) => labelName(item) !== label),
      wss: appStateRef.current.wss.map((workspace) => ({
        ...workspace,
        lib: (workspace.lib || []).map((ref) => ({
          ...ref,
          labels: Array.isArray(ref.labels) ? ref.labels.filter((item) => labelName(item) !== label) : []
        }))
      }))
    };
    persistState(next)
      .then(() => flashStatus('Etiket silindi'))
      .catch(() => flashStatus('Etiket silinemedi'));
  };

  const handleCreateCollection = (name: string) => {
    const collectionName = name.trim();
    if (!collectionName) return;
    const workspace = getActiveWorkspace(appStateRef.current);
    const collections = Array.isArray(workspace.collections) ? workspace.collections as Array<{ id: string; name: string }> : [];
    if (collections.some((collection) => collection.name.toLowerCase() === collectionName.toLowerCase())) {
      flashStatus('Klasör zaten var');
      return;
    }
    const next = {
      ...appStateRef.current,
      wss: appStateRef.current.wss.map((item) => item.id === workspace.id
        ? { ...item, collections: [...collections, { id: uid('col'), name: collectionName }] }
        : item)
    };
    persistState(next)
      .then(() => flashStatus('Klasör oluşturuldu'))
      .catch(() => flashStatus('Klasör kaydedilemedi'));
  };

  const handleRenameCollection = (collectionId: string) => {
    const workspace = getActiveWorkspace(appStateRef.current);
    const collections = Array.isArray(workspace.collections) ? workspace.collections as Array<{ id: string; name: string }> : [];
    const collection = collections.find((item) => String(item.id) === String(collectionId));
    if (!collection) return;
    const nextName = window.prompt('Klasör ad?', collection.name);
    if (!nextName?.trim()) return;
    const name = nextName.trim();
    if (collections.some((item) => item.id !== collectionId && item.name.toLowerCase() === name.toLowerCase())) {
      flashStatus('Klasör zaten var');
      return;
    }
    const next = {
      ...appStateRef.current,
      wss: appStateRef.current.wss.map((item) => item.id === workspace.id
        ? { ...item, collections: collections.map((col) => col.id === collectionId ? { ...col, name } : col) }
        : item)
    };
    persistState(next)
      .then(() => flashStatus('Klasör yeniden adlandırıldı'))
      .catch(() => flashStatus('Klasör kaydedilemedi'));
  };

  const handleDeleteCollection = (collectionId: string) => {
    const workspace = getActiveWorkspace(appStateRef.current);
    const collections = Array.isArray(workspace.collections) ? workspace.collections as Array<{ id: string; name: string }> : [];
    const collection = collections.find((item) => String(item.id) === String(collectionId));
    if (!collection) return;
    if (!window.confirm(`${collection.name} klasör? silinsin mi? Kaynaklar silinmez.`)) return;
    const next = {
      ...appStateRef.current,
      wss: appStateRef.current.wss.map((item) => item.id === workspace.id
        ? {
            ...item,
            collections: collections.filter((col) => col.id !== collectionId),
            lib: (item.lib || []).map((ref) => ({
              ...ref,
              collectionIds: Array.isArray(ref.collectionIds)
                ? ref.collectionIds.filter((id) => String(id) !== String(collectionId))
                : []
            }))
          }
        : item)
    };
    if (activeCollectionId === collectionId) setActiveCollectionId('all');
    persistState(next)
      .then(() => flashStatus('Klasör silindi'))
      .catch(() => flashStatus('Klasör silinemedi'));
  };

  const handleMoveReferenceToCollection = (referenceId: string, collectionId: string) => {
    const workspace = getActiveWorkspace(appStateRef.current);
    const ref = workspace.lib.find((item) => item.id === referenceId);
    if (!ref) return;
    const current = Array.isArray(ref.collectionIds) ? ref.collectionIds.map((id) => String(id)) : [];
    const nextCollectionIds = collectionId === 'unfiled'
      ? []
      : Array.from(new Set([...current, String(collectionId)]));
    const next = updateReferenceInActiveWorkspace(appStateRef.current, referenceId, { collectionIds: nextCollectionIds });
    persistState(next)
      .then(() => flashStatus(collectionId === 'unfiled' ? 'Kaynak klasörsüz yapıldı' : 'Kaynak klasöre taşındı'))
      .catch(() => flashStatus('Klasör ataması kaydedilemedi'));
  };

  const handleBatchOADownload = async () => {
    const candidates = collectOpenAccessPdfCandidates(appStateRef.current);
    if (!candidates.length) {
      flashStatus('OA PDF için DOI/PDF URL olan kaynak yok');
      return;
    }

    flashStatus(`OA PDF indiriliyor: 0/${candidates.length}`);
    setPdfProgress({ total: candidates.length, attempted: 0, downloaded: 0, failed: 0, active: true });

    const win = window as any;
    if (typeof win.batchDownloadOA === 'function') {
      try {
        win.S = appStateRef.current;
        await win.batchDownloadOA();
        const syncedState = hydrateAppState(win.S || appStateRef.current);
        setAppState(syncedState);
        appStateRef.current = syncedState;
        await persistState(syncedState);
        const downloaded = await countDownloadedPdfCandidates(syncedState, candidates);
        const failed = Math.max(0, candidates.length - downloaded);
        const lastFailure = typeof win.__aqGetOALastFailure === 'function'
          ? String(win.__aqGetOALastFailure() || '').slice(0, 180)
          : '';
        setPdfProgress({ total: candidates.length, attempted: candidates.length, downloaded, failed, active: false });
        if (downloaded) {
          flashStatus(`OA PDF indirme bitti: ${downloaded} bulundu${failed ? `, ${failed} bulunamadı` : ''}`);
          return;
        }
        flashStatus(`Legacy OA bulamad?, alternatif resolver deneniyor${lastFailure ? `: ${lastFailure}` : ''}`);
      } catch (_error) {
        flashStatus('Legacy OA motoru hata verdi, alternatif indirme deneniyor');
      }
    }

    let nextState = appStateRef.current;
    let done = 0;
    let failed = 0;
    let cursor = 0;
    const concurrency = Math.min(4, Math.max(1, candidates.length));
    const commitProgress = (message: string) => {
      setAppState(nextState);
      appStateRef.current = nextState;
      setPdfProgress({ total: candidates.length, attempted: done + failed, downloaded: done, failed, active: true });
      flashStatus(message);
    };

    const processCandidate = async (candidate: (typeof candidates)[number]) => {
      const { reference } = candidate;
      let url = String(reference.pdfUrl || '').trim();
      if (!url) url = await resolveOpenAccessPdfUrl(String(reference.doi || ''));
      if (!url) {
        failed++;
        commitProgress(`OA PDF bulunamadı: ${done + failed}/${candidates.length}`);
        return;
      }
      try {
        const attemptedUrl = url;
        const result = await window.electronAPI?.downloadPDFfromURL?.(url, reference.id, {
          ws: { id: candidate.workspaceId, name: candidate.workspaceName },
          expectedDoi: reference.doi,
          expectedTitle: reference.title,
          expectedAuthors: reference.authors,
          expectedYear: reference.year,
          requireDoiEvidence: Boolean(reference.doi),
          allowUnverifiedPdf: true
        }) as any;
        if (result?.ok) {
          done++;
          nextState = patchReferenceInWorkspace(nextState, candidate.workspaceId, reference.id, {
            pdfUrl: result.finalUrl || attemptedUrl,
            pdfAttached: true,
            pdfVerification: result.verification || null
          });
          commitProgress(`OA PDF indiriliyor: ${done + failed}/${candidates.length}`);
        } else {
          failed++;
          const reason = String(result?.error || result?.failure?.userMessage || '').slice(0, 120);
          nextState = patchReferenceInWorkspace(nextState, candidate.workspaceId, reference.id, { pdfUrl: attemptedUrl });
          commitProgress(`OA PDF indirilemedi: ${done + failed}/${candidates.length}${reason ? ` · ${reason}` : ''}`);
        }
      } catch (_error) {
        failed++;
        nextState = patchReferenceInWorkspace(nextState, candidate.workspaceId, reference.id, { pdfUrl: url });
        commitProgress(`OA PDF indirilemedi: ${done + failed}/${candidates.length}`);
      }
    };

    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (cursor < candidates.length) {
        const candidate = candidates[cursor++];
        await processCandidate(candidate);
      }
    }));

    await persistState(nextState);
    setPdfProgress({ total: candidates.length, attempted: done + failed, downloaded: done, failed, active: false });
    if (done) {
      flashStatus(`OA PDF indirme bitti: ${done} başarılı${failed ? `, ${failed} başarısız` : ''}`);
    } else {
      flashStatus('OA PDF indirilemedi');
    }
  };

  const handleOpenRelatedPapers = (reference: AcademiqReference) => {
    if (!callLegacy('openPdfRelatedForRef', reference)) {
      flashStatus('Benzer makaleler hazır değil');
      return;
    }
    flashStatus('Benzer makaleler açılıyor');
  };

  const handleDeleteNote = (noteId: string) => {
    const currentWsId = appStateRef.current.cur;
    const next = {
      ...appStateRef.current,
      notes: appStateRef.current.notes.filter((note) => note.id !== noteId || String(note.wsId || currentWsId) !== currentWsId)
    };
    persistState(next).then(() => flashStatus('Not silindi')).catch(() => flashStatus('Not silinemedi'));
  };

  const handleDeleteNoteTag = (tag: string) => {
    const target = String(tag || '').trim();
    if (!target) return;
    const next = {
      ...appStateRef.current,
      notes: appStateRef.current.notes.map((note) => {
        const currentTags = String(note.tag || note.sourcePage || '')
          .split(/[;,]/)
          .map((item) => item.trim())
          .filter(Boolean);
        if (String(note.wsId || appStateRef.current.cur) !== appStateRef.current.cur || !currentTags.includes(target)) return note;
        const merged = currentTags.filter((item) => item !== target).join(', ');
        return { ...note, tag: merged, sourcePage: merged };
      })
    };
    persistState(next).then(() => flashStatus('Etiket notlardan kaldırıldı')).catch(() => flashStatus('Etiket silinemedi'));
  };

  const handleCreateNotebook = (name: string) => {
    const title = String(name || '').trim();
    if (!title) {
      flashStatus('Not defteri adı boş');
      return;
    }
    const id = `${appStateRef.current.cur}:nb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const next = {
      ...appStateRef.current,
      notebooks: [...(appStateRef.current.notebooks || []), { id, wsId: appStateRef.current.cur, name: title }],
      curNb: id
    };
    persistState(next).then(() => flashStatus('Not defteri oluşturuldu')).catch(() => flashStatus('Not defteri kaydedilemedi'));
  };

  const handleRenameNotebook = (notebookId: string, name: string) => {
    const title = String(name || '').trim();
    if (!notebookId || !title) return;
    const next = {
      ...appStateRef.current,
      notebooks: (appStateRef.current.notebooks || []).map((notebook) => notebook.id === notebookId ? { ...notebook, name: title } : notebook)
    };
    persistState(next).then(() => flashStatus('Not defteri güncellendi')).catch(() => flashStatus('Not defteri kaydedilemedi'));
  };

  const handleDeleteNotebook = (notebookId: string) => {
    const currentWs = appStateRef.current.cur;
    const notebooks = (appStateRef.current.notebooks || []).filter((notebook) => String(notebook.wsId || currentWs) === currentWs);
    if (notebooks.length <= 1) {
      flashStatus('Son not defteri silinemez');
      return;
    }
    const fallback = notebooks.find((notebook) => notebook.id !== notebookId);
    if (!fallback) return;
    const next = {
      ...appStateRef.current,
      notebooks: (appStateRef.current.notebooks || []).filter((notebook) => notebook.id !== notebookId),
      curNb: appStateRef.current.curNb === notebookId ? fallback.id : appStateRef.current.curNb,
      notes: appStateRef.current.notes.map((note) => String(note.wsId || currentWs) === currentWs && note.nbId === notebookId ? { ...note, nbId: fallback.id } : note)
    };
    persistState(next).then(() => flashStatus('Not defteri silindi')).catch(() => flashStatus('Not defteri silinemedi'));
  };

  const handleMoveNoteToNotebook = (noteId: string, notebookId: string) => {
    if (!noteId || !notebookId) return;
    const currentWs = appStateRef.current.cur;
    const next = {
      ...appStateRef.current,
      curNb: notebookId,
      notes: appStateRef.current.notes.map((note) => note.id === noteId && String(note.wsId || currentWs) === currentWs ? { ...note, nbId: notebookId } : note)
    };
    persistState(next).then(() => flashStatus('Not deftere taşındı')).catch(() => flashStatus('Not taşınamadı'));
  };

  const handleExportPDF = async () => {
    await flushEditorToState().catch(() => flashStatus('Export öncesi kayıt tamamlanamadı'));
    if (callLegacy('expPDF')) {
      flashStatus('PDF dışa aktarma açıldı');
      return;
    }
    const legacyExportHTML = typeof (window as any).getExportPDFHTML === 'function'
      ? String((window as any).getExportPDFHTML() || '')
      : '';
    const html = legacyExportHTML || editorRef.current?.getHTML?.() || '<p></p>';
    flashStatus('PDF hazırlanıyor...');
    try {
      const result = await window.electronAPI?.exportPDF?.({ exportHTML: html, defaultPath: 'academiq-document.pdf' });
      flashStatus(result && typeof result === 'object' && 'ok' in result && result.ok ? 'PDF dışa aktarıldı' : 'PDF iptal edildi');
    } catch (_error) {
      flashStatus('PDF dışa aktarılamadı');
    }
  };

  const handleExportDOCX = async () => {
    await flushEditorToState().catch(() => flashStatus('Export öncesi kayıt tamamlanamadı'));
    if (callLegacy('expDOC') || callLegacy('expDOCX')) {
      flashStatus('DOCX dışa aktarma açıldı');
      return;
    }
    const legacyExportHTML = typeof (window as any).getExportDocHTML === 'function'
      ? String((window as any).getExportDocHTML() || '')
      : '';
    const html = legacyExportHTML || editorRef.current?.getHTML?.() || '<p></p>';
    flashStatus('DOCX hazırlanıyor...');
    try {
      const result = await window.electronAPI?.exportDOCX?.({ exportHTML: html, defaultPath: 'academiq-document.docx' });
      flashStatus(result && typeof result === 'object' && 'ok' in result && result.ok ? 'DOCX dışa aktarıldı' : 'DOCX iptal edildi');
    } catch (_error) {
      flashStatus('DOCX dışa aktarılamadı');
    }
  };

  const handleExportPreview = () => {
    if (callLegacy('openExportPreview')) {
      flashStatus('PDF önizleme açıldı');
      return;
    }
    flashStatus('PDF önizleme hazır değil');
  };

  const handleExportAnnotatedPDF = async () => {
    await flushEditorToState().catch(() => flashStatus('Export öncesi kayıt tamamlanamadı'));
    if (callLegacy('exportAnnotatedPdf') || callLegacy('expAnnotatedPDF')) {
      flashStatus('Annotationlı PDF dışa aktarma açıldı');
      return;
    }
    flashStatus('Annotationlı PDF için once PDF açın');
  };

  const handleLegacyExport = (fnName: string, successMessage: string, failureMessage: string) => {
    if (callLegacy(fnName)) {
      flashStatus(successMessage);
      return;
    }
    flashStatus(failureMessage);
  };

  const handleOpenMatrix = () => {
    const win = window as any;
    win.S = { ...(win.S || {}), ...appStateRef.current };
    if (callLegacy('openLiteratureMatrix')) {
      window.setTimeout(() => {
        try {
          win.AQLiteratureMatrix?.render?.();
        } catch (_error) {}
      }, 0);
      flashStatus('Literatür matrisi açıldı');
      return;
    }
    flashStatus('Literatür matrisi hazır değil');
  };

  const handleInsertCitation = () => {
    if (callLegacy('doTrigRef')) return;
    editorRef.current?.insertCitation(activeReferenceId);
  };

  const commands: CommandItem[] = [
    { id: 'new-workspace', group: 'Workspace', label: 'Yeni workspace', run: openNewWorkspaceModal },
    { id: 'new-document', group: 'Belge', label: 'Yeni belge', run: handleAddDocument },
    { id: 'edit-reference', group: 'Kaynak', label: 'Seçili kaynağı düzenle', run: () => setFeatureModal('referenceEdit') },
    { id: 'attach-pdf', group: 'PDF', label: 'PDF yükle', run: handleOpenPDF },
    {
      id: 'open-pdf-viewer',
      group: 'PDF',
      label: 'PDF viewer aç',
      run: () => {
        const panel = document.getElementById('pdfpanel');
        if (panel) {
          panel.classList.add('open');
          flashStatus('PDF viewer açıldı');
        } else {
          flashStatus('PDF viewer hazır değil');
        }
      }
    },
    { id: 'export-pdf', group: 'Export', label: 'PDF dışa aktar', run: handleExportPDF },
    { id: 'export-docx', group: 'Export', label: 'DOCX dışa aktar', run: handleExportDOCX },
    { id: 'insert-citation', group: 'Editor', label: 'Atıf ekle', run: handleInsertCitation },
    { id: 'insert-bibliography', group: 'Editor', label: 'Kaynakça ekle/güncelle', run: () => editorRef.current?.insertBibliography() },
    { id: 'history', group: 'Belge', label: 'Belge geçmişi', run: () => setFeatureModal('history') },
    { id: 'matrix', group: 'Literatür', label: 'Literatür matrisini a?', run: handleOpenMatrix },
    { id: 'settings', group: 'Ayarlar', label: 'Ayarlar', run: () => setFeatureModal('settings') }
  ];

  return (
    <EditorContext.Provider value={editorContext}>
      <AppShell
        activeView={activeView}
        onViewChange={(view) => {
          if (view === 'notes') {
            setNoteSidebarOpen((open) => activeView === 'notes' ? !open : true);
            setRightTab('notes');
          }
          if (view === 'library') {
            setRefSidebarOpen((open) => activeView === 'library' ? !open : true);
          }
          setActiveView(view);
          if (view === 'settings') setFeatureModal('settings');
          if (view === 'pdf') {
            if (activeReferenceId) {
              if (!callLegacy('openRef', activeReferenceId)) {
                const panel = document.getElementById('pdfpanel');
                if (panel) panel.classList.add('open');
                else flashStatus('PDF viewer hazır değil');
              }
            } else {
              const panel = document.getElementById('pdfpanel');
              if (panel) panel.classList.add('open');
              else flashStatus('PDF viewer hazır değil');
            }
          }
          if (view === 'focus') callLegacy('toggleZenMode');
        }}
        onExportPDF={handleExportPDF}
        onExportDOCX={handleExportDOCX}
        onExportPreview={handleExportPreview}
        onExportAnnotatedPDF={handleExportAnnotatedPDF}
        onExportBIB={() => handleLegacyExport('expBIB', 'BibTeX aktarım açıldı', 'BibTeX aktarımı hazır değil')}
        onExportRIS={() => handleLegacyExport('expRIS', 'RIS aktarım açıldı', 'RIS aktarımı hazır değil')}
        onExportCSL={() => handleLegacyExport('expCSLJSON', 'CSL JSON aktarım açıldı', 'CSL JSON aktarımı hazır değil')}
        onExportNotes={() => handleLegacyExport('expNotes', 'Notlar aktarıldı', 'Not aktarımı hazır değil')}
        onExportLibrary={() => handleLegacyExport('expLib', 'Kütüphane aktarıldı', 'Kütüphane aktarımı hazır değil')}
        workspaceBar={(
          <WorkspaceTabs
            workspaces={appState.wss}
            activeWorkspaceId={appState.cur}
            onSelectWorkspace={handleWorkspaceChange}
            onAddWorkspace={openNewWorkspaceModal}
            onRenameWorkspace={handleRenameWorkspace}
            onDeleteWorkspace={handleDeleteWorkspace}
          />
        )}
        documentBar={(
          <DocumentTabs
            documents={appState.docs}
            activeDocumentId={appState.curDoc}
            onSelectDocument={handleDocumentChange}
            onAddDocument={handleAddDocument}
            onRenameDocument={handleRenameDocument}
            onDeleteDocument={handleDeleteDocument}
          />
        )}
        left={(
          <NoteSidebar
            activeTab={rightTab}
            onTabChange={setRightTab}
            notes={activeWorkspaceNotes}
            notebooks={activeWorkspaceNotebooks}
            references={activeWorkspace.lib}
            usedReferences={activeDocumentUsedReferences}
            workspaceName={activeWorkspace.name}
            documentName={String(activeDocument.name || activeDocument.id)}
            activeReferenceId={activeReferenceId}
            onSelectReference={setActiveReferenceId}
            onAddNote={handleAddNote}
            onUpdateNote={handleUpdateNote}
            onDeleteNote={handleDeleteNote}
            onDeleteNoteTag={handleDeleteNoteTag}
            onCreateNotebook={handleCreateNotebook}
            onRenameNotebook={handleRenameNotebook}
            onDeleteNotebook={handleDeleteNotebook}
            onMoveNoteToNotebook={handleMoveNoteToNotebook}
            onInsertNote={handleInsertNoteIntoDocument}
            onInsertCitation={(refId) => editorRef.current?.insertCitation(refId)}
            onEditReference={(refId) => {
              setActiveReferenceId(refId);
              setFeatureModal('referenceEdit');
            }}
            onReferencePdfAction={handleReferencePdfAction}
            onOpenPDF={handleOpenPDF}
            onOpenMatrix={handleOpenMatrix}
            onAction={flashStatus}
          />
        )}
        leftVisible={noteSidebarOpen}
        toolbar={<TopToolbar selectedReferenceId={activeReferenceId} />}
        editor={loading ? (
          <div className="flex h-full items-center justify-center text-sm text-aq-muted">Yükleniyor...</div>
        ) : (
          <EditorHost
            docId={activeDocument.id}
            editorRef={editorRef}
            initialState={appState}
            onEditorChange={handleEditorChange}
          />
        )}
        right={(
          <RefSidebar
            references={activeWorkspace.lib}
            collections={Array.isArray(activeWorkspace.collections) ? activeWorkspace.collections as Array<{ id: string; name: string }> : []}
            labels={referenceLabels}
            activeCollectionId={activeCollectionId}
            activeReferenceId={activeReferenceId}
            onSelectReference={setActiveReferenceId}
            onSelectCollection={setActiveCollectionId}
            onSearch={handleReferenceSearch}
            onOpenCollections={() => setCollectionManagerOpen(true)}
            onToggleFilters={() => setFiltersOpen((value) => !value)}
            onEditReference={(refId) => {
              setActiveReferenceId(refId);
              setFeatureModal('referenceEdit');
            }}
            onToggleReferenceLabel={handleToggleReferenceLabel}
            onCreateLabel={handleCreateLabel}
            onDeleteLabel={handleDeleteLabel}
            onCreateCollection={handleCreateCollection}
            onRenameCollection={handleRenameCollection}
            onDeleteCollection={handleDeleteCollection}
            onMoveReferenceToCollection={handleMoveReferenceToCollection}
            onToggleReferenceCollection={handleToggleReferenceCollection}
            onReferencePdfAction={handleReferencePdfAction}
            onBatchOADownload={handleBatchOADownload}
            onShowReferenceInExplorer={(refId) => handleReferencePdfAction('show', refId)}
            onOpenRelatedPapers={handleOpenRelatedPapers}
            onDeleteReference={handleDeleteReference}
            filtersOpen={filtersOpen}
          />
        )}
        rightVisible={refSidebarOpen}
        status={(
          <StatusBar
            message={statusMessage}
            wordCount={wordCount}
            apaLabel={qualityStatus.apaLabel}
            apaTone={qualityStatus.apaTone}
            issuesLabel={qualityStatus.issuesLabel}
            issuesTone={qualityStatus.issuesTone}
            saveLabel={statusMessage || 'kaydedildi'}
            saveTone={saveTone}
            pdfProgressLabel={pdfProgressLabel}
            onOpenApa={openLegacyMetadataSurface}
            onOpenIssues={openLegacyIssueSurface}
            onOpenSave={openLegacySaveSurface}
          />
        )}
      />
      <Suspense fallback={null}>
        {commandOpen ? <CommandPalette open={commandOpen} commands={commands} onClose={() => setCommandOpen(false)} /> : null}
        {featureModal ? (
          <FeatureModals
            active={featureModal}
            state={appState}
            loadMeta={loadMeta}
            selectedReference={activeWorkspace.lib.find((ref) => ref.id === activeReferenceId) || null}
            onClose={() => setFeatureModal(null)}
            onStatus={flashStatus}
            onUpdateReference={handleUpdateReference}
            onDeleteReference={handleDeleteReference}
            onRestoreState={() => {
              setLoading(true);
              window.electronAPI.loadData().then((result) => {
                const hydrated = result?.ok && result.data ? hydrateAppState(JSON.parse(String(result.data))) : appStateRef.current;
                setAppState(hydrated);
                appStateRef.current = hydrated;
                setLoading(false);
              });
            }}
          />
        ) : null}
        {collectionManagerOpen ? (
          <CollectionManagerModal
            open={collectionManagerOpen}
            collections={Array.isArray(activeWorkspace.collections) ? activeWorkspace.collections as Array<{ id: string; name: string }> : []}
            references={activeWorkspace.lib}
            onClose={() => setCollectionManagerOpen(false)}
            onCreate={handleCreateCollection}
            onRename={handleRenameCollection}
            onDelete={handleDeleteCollection}
            onSelect={(collectionId) => {
              setActiveCollectionId(collectionId);
              setCollectionManagerOpen(false);
            }}
          />
        ) : null}
        {workspaceNameModal ? (
          <WorkspaceNameModal
            open={Boolean(workspaceNameModal)}
            title={workspaceNameModal?.mode === 'rename' ? 'Çalışma Alanını Yeniden Adlandır' : 'Yeni Çalışma Alanı'}
            defaultName={workspaceNameModal?.mode === 'rename'
              ? (appState.wss.find((workspace) => workspace.id === workspaceNameModal.workspaceId)?.name || '')
              : `Workspace ${appState.wss.length + 1}`}
            onClose={() => setWorkspaceNameModal(null)}
            onSubmit={submitNewWorkspace}
          />
        ) : null}
        <LegacyCompatibilityHost onStatus={flashStatus} onImportReferences={handleImportReferences} />
      </Suspense>
    </EditorContext.Provider>
  );
}

