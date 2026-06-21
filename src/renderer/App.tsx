import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContext } from './components/editor/EditorContext';
import { EditorHost } from './components/editor/EditorHost';
import type { AcademiqEditorApi, AcademiqEditorState } from './lib/editor-adapter';
import { AppShell } from './components/shell/AppShell';
import { RefSidebar } from './components/shell/RefSidebar';
import { NoteSidebar, type NoteSidebarTab } from './components/shell/NoteSidebar';
import { StatusBar } from './components/shell/StatusBar';
import { useSpellcheck } from './lib/useSpellcheck';
import { SpellcheckPanel } from './components/shell/SpellcheckPanel';
import { InlineInteractionHandler } from './components/editor/InlineInteractionHandler';
import { SpellSuggestionPopup } from './components/editor/SpellSuggestionPopup';
import { ConfirmDialog } from './components/Dialog/ConfirmDialog';
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
import { openDocumentOutline as reactOpenDocumentOutline } from './lib/outline-modals';
import type { CommandItem } from './components/shell/CommandPalette';
import { useKeyboardShortcut } from './lib/keyboard-router';
import type { FeatureModal } from './components/shell/FeatureModals';
import { callLegacy } from './lib/legacy-feature-adapter';
import {
  normalizeDoiInput,
  normalizeIsbnInput,
  fetchLegacyReference,
  hasSameReference,
  referenceImportKey,
  isPlaceholderReferenceTitle,
  mergeReferenceRecords,
  hasUsableReferenceMetadata,
  normalizeReferenceList,
  normalizeReferenceState,
  upsertReferenceInWorkspace,
  patchReferenceInWorkspace,
  yearFromCrossrefDate,
  mapCrossrefWorkToReference,
  fetchDoiReference,
  resolveOpenAccessPdfUrls,
  collectOpenAccessPdfCandidates,
  countDownloadedPdfCandidates
} from './lib/reference-import';
import { confirmDialog } from './lib/dialog';
import {
  noteTextForInsert,
  buildNoteInsertHTML,
  collectReferenceIdsFromHTML
} from './lib/note-insert';
import { publishStateToLegacyWindow } from './lib/legacy-state-bridge';
import { appStore, useAppStore } from './lib/app-store';

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

function countWorkspaceReferences(state: AcademiqAppState) {
  return (state.wss || []).reduce((total, workspace) => (
    total + (Array.isArray(workspace.lib) ? workspace.lib.length : 0)
  ), 0);
}

function referenceMergeKeys(reference: AcademiqReference) {
  return [
    String(reference.id || '').trim() ? `id:${String(reference.id).trim()}` : '',
    referenceImportKey(reference)
  ].filter(Boolean);
}

function preserveReferenceLibraries(next: AcademiqAppState, current: AcademiqAppState) {
  const currentCount = countWorkspaceReferences(current);
  const nextCount = countWorkspaceReferences(next);
  if (!currentCount || nextCount >= currentCount) return next;

  const currentById = new Map((current.wss || []).map((workspace) => [workspace.id, workspace]));
  let changed = false;
  const wss = (next.wss || []).map((workspace) => {
    const currentWorkspace = currentById.get(workspace.id);
    const currentLib = Array.isArray(currentWorkspace?.lib) ? currentWorkspace.lib : [];
    const nextLib = Array.isArray(workspace.lib) ? workspace.lib : [];
    if (!currentLib.length) return workspace;
    if (!nextLib.length) {
      changed = true;
      return { ...workspace, lib: currentLib };
    }
    const seen = new Set(nextLib.flatMap(referenceMergeKeys));
    const missing = currentLib.filter((reference) => {
      const keys = referenceMergeKeys(reference);
      return keys.length && !keys.some((key) => seen.has(key));
    });
    if (missing.length) {
      changed = true;
      missing.forEach((reference) => referenceMergeKeys(reference).forEach((key) => seen.add(key)));
      return { ...workspace, lib: [...nextLib, ...missing] };
    }
    return workspace;
  });

  return changed ? { ...next, wss } : next;
}


export default function App() {
  const appState = useAppStore((state) => state);
  const setAppState = (next: AcademiqAppState | ((prev: AcademiqAppState) => AcademiqAppState)) => {
    appStore.setState(next);
  };
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'library' | 'notes' | 'pdf' | 'matrix' | 'focus' | 'settings'>('notes');
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
  const [plainCitationSingleMatch, setPlainCitationSingleMatch] = useState<any | null>(null);
  const [spellPanelOpen, setSpellPanelOpen] = useState(false);
  const editorRef = useRef<AcademiqEditorApi | null>(null);
  const appStateRef = useRef(appState);
  const statusTimerRef = useRef<number | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveInFlightRef = useRef<Promise<unknown> | null>(null);
  const localWorkspaceTransitionUntilRef = useRef(0);
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
  // Spell-check chip — hidden when the user hasn't turned it on.
  const spellState = useSpellcheck();
  const spellChipLabel = spellState.state.enabled
    ? (spellState.state.error
      ? 'Yazım: hata'
      : spellState.state.loading
        ? 'Yazım: yükleniyor…'
        : spellState.state.matches.length > 0
          ? `${spellState.state.matches.length} yazım`
          : '✓ yazım')
    : '';
  const spellChipTone: 'ok' | 'warning' | 'error' = spellState.state.error
    ? 'error'
    : spellState.state.matches.length > 0
      ? 'warning'
      : 'ok';
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

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  useEffect(() => {
    // Always-reachable opener for the React CrossRefModal. The legacy
    // tiptap-word-footnotes.js::showCrossRefDialog checks for this on
    // every call and defers to us when present, which closes the race
    // window between legacy script load and the intercept() below that
    // overrides AQFootnotes.showCrossRefDialog itself. If a user clicks
    // "Çapraz Referans" in the first 0–1000ms after mount, the legacy
    // path will reach us through this hook instead of rendering the old
    // HTML dialog.
    (window as any).__aqOpenReactCrossRefModal = () => setFeatureModal('crossRef');
    return () => { delete (window as any).__aqOpenReactCrossRefModal; };
  }, []);

  useEffect(() => {
    const intercept = () => {
      const win = window as any;
      if (win.AQFootnotes) {
        win.AQFootnotes.showCrossRefDialog = () => {
          setFeatureModal('crossRef');
        };
      }
      if (win.AQPlainCitationLinking) {
        win.AQPlainCitationLinking.openReviewModal = () => {
          setPlainCitationSingleMatch(null);
          setFeatureModal('plainCitationLinker');
          return [];
        };
        win.AQPlainCitationLinking.openSingleLinkModal = (match: any, citation: any) => {
          const occurrence = match?.occurrence || (citation ? {
            from: citation.from,
            to: citation.to,
            text: citation.text,
            mode: citation.citation?.mode || 'inline'
          } : null);
          if (occurrence) {
            const fakeMatch = match || {
              occurrence,
              ambiguous: [],
              refIds: [],
              complete: false,
              missing: []
            };
            setPlainCitationSingleMatch(fakeMatch);
            setFeatureModal('plainCitationLinker');
          }
        };
      }
      if (win.openPlainCitationLinking) {
        win.openPlainCitationLinking = () => {
          setPlainCitationSingleMatch(null);
          setFeatureModal('plainCitationLinker');
          return true;
        };
      }
      win.openExternalReferenceImportModal = () => {
        setFeatureModal('referenceImport');
        return true;
      };
    };
    intercept();
    const timer = setInterval(intercept, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    publishStateToLegacyWindow(appState);
  }, [appState]);

  useEffect(() => {
    // The React outline helper owns the "Belge Anahatı" modal end-to-end
    // (collect/filter/search/jump via AQDocumentOutline). Route every trigger
    // (command palette, legacy modal buttons) through it so the legacy
    // render chain can be retired.
    (window as any).openDocumentOutline = reactOpenDocumentOutline;
  }, []);

  useEffect(() => {
    (window as any).__aqReactSyncFromLegacy = (legacyState: unknown) => {
      try {
        const hydrated = preserveReferenceLibraries(
          normalizeReferenceState(hydrateAppState(legacyState)),
          appStateRef.current
        );
        const activeId = appStateRef.current.cur;
        if (
          Date.now() < localWorkspaceTransitionUntilRef.current &&
          hydrated.cur &&
          activeId &&
          hydrated.cur !== activeId
        ) {
          return;
        }
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

  const tracePdfDownloadAttempt = (payload: Record<string, unknown>) => {
    try {
      localStorage.setItem('aq.lastPdfDownloadAttempt', JSON.stringify({
        at: new Date().toISOString(),
        ...payload
      }));
    } catch (_error) {}
  };

  const saveDataChecked = useCallback(async (nextState: AcademiqAppState, source = 'save') => {
    const payload = JSON.stringify(nextState);
    const result = await window.electronAPI?.saveData?.(payload) as { ok?: boolean; error?: string } | undefined;
    if (!result || result.ok !== true) {
      const error = result?.error || `${source}_failed`;
      try {
        localStorage.setItem('aq.lastSaveError', JSON.stringify({
          at: new Date().toISOString(),
          source,
          error,
          bytes: payload.length
        }));
      } catch (_error) {}
      throw new Error(error);
    }
    try {
      localStorage.setItem('aq.lastSaveOk', JSON.stringify({
        at: new Date().toISOString(),
        source,
        bytes: payload.length
      }));
    } catch (_error) {}
    return result;
  }, []);

  useEffect(() => {
    const onWordImportCommitted = (event: Event) => {
      const html = String((event as CustomEvent<{ html?: string }>).detail?.html || '');
      if (!html.trim()) return;
      const next = updateActiveDocumentHTML(appStateRef.current, html);
      appStateRef.current = next;
      setAppState(next);
      saveDataChecked(next, 'word-import-commit')
        .then(() => flashStatus('Word içeriği kaydedildi'))
        .catch(() => flashStatus('Word içeriği kaydedilemedi'));
    };
    window.addEventListener('aq:word-import-committed', onWordImportCommitted as EventListener);
    return () => window.removeEventListener('aq:word-import-committed', onWordImportCommitted as EventListener);
  }, [saveDataChecked]);

  const scheduleFullAutosave = useCallback((nextState: AcademiqAppState, delay = 900) => {
    if ((window as any).__aqBackupRestoreInProgress) return;
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      autosaveInFlightRef.current = saveDataChecked(appStateRef.current, 'editor-autosave')
        .then(() => {
          flashStatus('otomatik kaydedildi');
        })
        .catch(() => {
          flashStatus('Autosave kaydedilemedi');
        });
    }, delay);
    appStateRef.current = nextState;
  }, [saveDataChecked]);

  const persistState = useCallback(async (nextState: AcademiqAppState, draft = false) => {
    if ((window as any).__aqBackupRestoreInProgress) return;
    appStateRef.current = nextState;
    setAppState(nextState);
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const payload = JSON.stringify(nextState);
    if (draft) await window.electronAPI?.saveEditorDraft?.(payload);
    await saveDataChecked(nextState, draft ? 'draft-promote' : 'persistState');
  }, [saveDataChecked]);

  const persistEditorDraft = useCallback(async (nextState: AcademiqAppState) => {
    if ((window as any).__aqBackupRestoreInProgress) return;
    appStateRef.current = nextState;
    publishStateToLegacyWindow(nextState);
    const win = window as any;
    scheduleFullAutosave(nextState);
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
  }, [scheduleFullAutosave]);

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
    if ((window as any).__aqBackupRestoreInProgress) return appStateRef.current;
    const currentHTML = editorRef.current?.getHTML?.();
    const nextState = currentHTML ? updateActiveDocumentHTML(appStateRef.current, currentHTML) : appStateRef.current;
    appStateRef.current = nextState;
    setAppState(nextState);
    publishStateToLegacyWindow(nextState);
    await saveDataChecked(nextState, 'flush-editor');
    return nextState;
  }, [saveDataChecked]);

  const commitEditorHTML = useCallback(async () => {
    const maybeHTML = editorRef.current?.getHTML?.();
    const currentHTML = maybeHTML && typeof (maybeHTML as any).then === 'function'
      ? await maybeHTML
      : maybeHTML;
    const nextState = currentHTML
      ? updateActiveDocumentHTML(appStateRef.current, String(currentHTML))
      : appStateRef.current;
    appStateRef.current = nextState;
    setAppState(nextState);
    return nextState;
  }, []);

  useEffect(() => {
    const flushNow = (source: string) => {
      if ((window as any).__aqBackupRestoreInProgress) return;
      try {
        const currentHTML = editorRef.current?.getHTML?.();
        if (currentHTML && typeof (currentHTML as any).then !== 'function') {
          appStateRef.current = updateActiveDocumentHTML(appStateRef.current, String(currentHTML));
        }
        if (autosaveTimerRef.current) {
          window.clearTimeout(autosaveTimerRef.current);
          autosaveTimerRef.current = null;
        }
        autosaveInFlightRef.current = saveDataChecked(appStateRef.current, source).catch(() => {
          flashStatus('Kapanış kaydı başarısız');
        });
      } catch (_error) {}
    };
    const onBeforeUnload = () => flushNow('beforeunload');
    const onPageHide = () => flushNow('pagehide');
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushNow('visibility-hidden');
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [saveDataChecked]);

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

  // Spell-check bootstrap: attach a single editor update listener so
  // every keystroke triggers a fresh check (debounced inside the
  // controller). We poll for the legacy editor instance because it
  // mounts asynchronously after boot.
  // Also wires controller → persisted-state so toggling from Settings
  // survives an app restart. The persisted-state → controller direction
  // lives in a SEPARATE useEffect below (dependent on appState) so we
  // catch the value AFTER reloadStateFromDisk hydrates it.
  useEffect(() => {
    let cancelled = false;
    let detach: (() => void) | null = null;
    let unsubscribeController: (() => void) | null = null;
    (async () => {
      const { subscribeSpellcheck, scheduleRecheck } = await import('./lib/spellcheck-controller');
      if (cancelled) return;
      // Persist toggle changes — Settings panel just calls the
      // controller, so we mirror its state back into AppState here.
      unsubscribeController = subscribeSpellcheck((s) => {
        const current = appStateRef.current as any;
        const currentEnabled = !!(current?.spellcheck?.enabled);
        if (currentEnabled === s.enabled) return;
        const next = { ...current, spellcheck: { ...(current?.spellcheck || {}), enabled: s.enabled } };
        appStateRef.current = next;
        setAppState(next);
        window.electronAPI?.saveData?.(JSON.stringify(next)).catch(() => {});
      });
      // Wait up to 30s for the legacy editor to mount, then subscribe
      // to its 'update' event so each keystroke nudges the spell pass.
      const deadline = Date.now() + 30_000;
      const poll = () => {
        if (cancelled) return;
        const win = window as any;
        try {
          const editor = typeof win.getActiveEditorInstance === 'function'
            ? win.getActiveEditorInstance()
            : null;
          if (editor && typeof editor.on === 'function') {
            const handler = () => scheduleRecheck();
            editor.on('update', handler);
            scheduleRecheck();
            window.setTimeout(scheduleRecheck, 350);
            detach = () => {
              try { editor.off?.('update', handler); } catch (_e) {}
            };
            return;
          }
        } catch (_e) {}
        if (Date.now() < deadline) setTimeout(poll, 500);
      };
      poll();
    })();
    return () => {
      cancelled = true;
      if (detach) detach();
      if (unsubscribeController) unsubscribeController();
    };
  }, []);

  // Persisted-state → controller. Fires once `loading` flips false
  // (state hydrated from disk) and again any time the toggle flips
  // somewhere else (e.g. a future workspace import). The controller is
  // idempotent: setSpellcheckEnabled(true) when it's already true is a
  // no-op.
  const persistedSpellEnabled = appState.spellcheck?.enabled === true;
  useEffect(() => {
    if (loading) return;
    (async () => {
      const { setSpellcheckEnabled } = await import('./lib/spellcheck-controller');
      setSpellcheckEnabled(persistedSpellEnabled);
    })();
  }, [loading, persistedSpellEnabled]);

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
    return () => {
      // The Tauri preload bridge may return a non-function (the Electron
      // contract is `() => () => void`); guard so cleanup never throws and
      // crashes App on unmount/StrictMode remount.
      if (typeof offIncoming === 'function') offIncoming();
      if (typeof offWorkspace === 'function') offWorkspace();
      if (typeof offState === 'function') offState();
    };
  }, [persistState, reloadStateFromDisk]);

  useKeyboardShortcut(
    'global-command-palette',
    [
      { key: 'k', ctrlKey: true },
      { key: 'p', ctrlKey: true, shiftKey: true }
    ],
    (event) => {
      event.preventDefault();
      setCommandOpen(true);
    },
    []
  );

  useKeyboardShortcut(
    'global-shortcut-help',
    [
      { key: 'F1' },
      { key: '/', ctrlKey: true }
    ],
    (event) => {
      const shell = (window as any).AQLeanUIShell;
      if (shell && typeof shell.openShortcutHelp === 'function') {
        event.preventDefault();
        shell.openShortcutHelp();
      }
    },
    []
  );

  useEffect(() => {
    const onEditReference = (event: Event) => {
      const detail = (event as CustomEvent<{ refId?: string }>).detail || {};
      const refId = String(detail.refId || activeReferenceId || '');
      if (refId) setActiveReferenceId(refId);
      setFeatureModal('referenceEdit');
    };
    window.addEventListener('aq:react-edit-reference', onEditReference as EventListener);
    return () => window.removeEventListener('aq:react-edit-reference', onEditReference as EventListener);
  }, [activeReferenceId]);

  const handleEditorChange = useCallback((editorState: AcademiqEditorState) => {
    const next = updateActiveDocumentHTML(appStateRef.current, editorState.html);
    persistEditorDraft(next).catch(() => flashStatus('Taslak kaydedilemedi'));
  }, [persistEditorDraft]);

  const handleWorkspaceChange = async (workspaceId: string) => {
    if (!workspaceId || workspaceId === appStateRef.current.cur) return;
    localWorkspaceTransitionUntilRef.current = Date.now() + 1800;
    const committed = await commitEditorHTML();
    const next = switchWorkspace(committed, workspaceId);
    persistState(next).catch(() => flashStatus('Workspace kaydedilemedi'));
    setActiveReferenceId(getActiveWorkspace(next).lib[0]?.id || '');
    flashStatus('Workspace değişti');
  };

  const handleDocumentChange = async (docId: string) => {
    const committed = await commitEditorHTML();
    const next = switchDocument(committed, docId);
    persistState(next).then(() => flashStatus('Belge değişti')).catch(() => flashStatus('Belge kaydedilemedi'));
  };

  const handleAddDocument = async () => {
    const name = window.prompt('Belge ad?', `Belge ${appStateRef.current.docs.length + 1}`);
    const committed = await commitEditorHTML();
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

  const handleDeleteDocument = async () => {
    const current = getActiveDocument(appStateRef.current);
    if (appStateRef.current.docs.length <= 1) {
      flashStatus('Son belge silinemez');
      return;
    }
    if (!(await confirmDialog(`${current.name || current.id} silinsin mi?`))) return;
    const next = deleteDocument(appStateRef.current, current.id);
    persistState(next).then(() => flashStatus('Belge silindi')).catch(() => flashStatus('Belge silinemedi'));
  };

  const handleAddWorkspace = async (name?: string) => {
    localWorkspaceTransitionUntilRef.current = Date.now() + 1800;
    const committed = await commitEditorHTML();
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
    void handleAddWorkspace(name);
  };

  const handleRenameWorkspace = (workspaceId?: string) => {
    const current = appStateRef.current.wss.find((workspace) => workspace.id === workspaceId) || getActiveWorkspace(appStateRef.current);
    setWorkspaceNameModal({ mode: 'rename', workspaceId: current.id });
  };

  const handleDeleteWorkspace = async (workspaceId?: string) => {
    const current = appStateRef.current.wss.find((workspace) => workspace.id === workspaceId) || getActiveWorkspace(appStateRef.current);
    if (appStateRef.current.wss.length <= 1) {
      flashStatus('Son workspace silinemez');
      return;
    }
    if (!(await confirmDialog(`${current.name} silinsin mi?`))) return;
    const next = deleteWorkspace(appStateRef.current, current.id);
    const workspacePdfContext = {
      id: current.id,
      name: current.name,
      referenceIds: current.lib.map((ref) => ref.id).filter(Boolean)
    };
    persistState(next)
      .then(() => window.electronAPI.deleteWorkspacePdfFolder(workspacePdfContext).catch(() => null))
      .then((pdfResult: any) => {
        const removedCount = Array.isArray(pdfResult?.removed) ? pdfResult.removed.length : 0;
        flashStatus(removedCount ? 'Workspace ve PDF klasörü silindi' : 'Workspace silindi');
      })
      .catch(() => flashStatus('Workspace silinemedi'));
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
      tracePdfDownloadAttempt({ source: 'reference-import', phase: 'start', url: ref.pdfUrl, referenceId, doi });
      try {
        const result = await window.electronAPI?.downloadPDFfromURL?.(String(ref.pdfUrl), referenceId, {
          ws: { id: next.cur, name: getActiveWorkspace(next).name, title: ref.title },
          title: ref.title,
          expectedDoi: doi,
          expectedTitle: ref.title,
          expectedAuthors: ref.authors,
          expectedYear: ref.year,
          requireDoiEvidence: true
        }) as any;
        tracePdfDownloadAttempt({ source: 'reference-import', phase: 'result', url: ref.pdfUrl, referenceId, doi, result });
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
      } catch (error) {
        tracePdfDownloadAttempt({ source: 'reference-import', phase: 'error', url: ref.pdfUrl, referenceId, doi, error: String(error) });
      }
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
        const title = name.replace(/\.pdf$/i, '');
        try {
          if (file.buffer) await window.electronAPI?.savePDF?.(refId, file.buffer, { id: next.cur, name: getActiveWorkspace(next).name, title });
        } catch (_error) {}
        next = addReferenceToActiveWorkspace(next, {
          id: refId,
          title,
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

  const handleDeleteReference = async (referenceId: string, options?: { skipConfirm?: boolean }) => {
    if (!options?.skipConfirm && !(await confirmDialog('Kaynak silinsin mi?'))) return;
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
      if (typeof win.__aqSetPdfTitle === 'function') {
        win.__aqSetPdfTitle(title);
      } else {
        const titleNode = document.getElementById('pdftitle');
        if (titleNode) titleNode.textContent = title;
      }
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
      if (typeof win.__aqSetPdfPage === 'function') {
        win.__aqSetPdfPage(total ? `1/${total}` : '--');
      } else {
        const pageNode = document.getElementById('pdfpg');
        if (pageNode) pageNode.textContent = total ? `1/${total}` : '--';
      }
      if (typeof win.__aqSetPdfZoom === 'function') {
        win.__aqSetPdfZoom(`${Math.round(scale * 100)}%`);
      } else {
        const zoomNode = document.getElementById('pdfzoom');
        if (zoomNode) zoomNode.textContent = `${Math.round(scale * 100)}%`;
      }
      const metaNode = document.getElementById('pdfreadmeta');
      if (metaNode) metaNode.textContent = title;
      win.__aqPdfFallbackHighlights = savedHighlights.slice();
      win.__aqPdfFallbackState = { buffer, title, scale, page: 1, total, pdf, pdfjs };
      win.__aqRefreshPdfFallback = (delay = 120) => {
        window.clearTimeout(win.__aqPdfFallbackRefreshTimer);
        win.__aqPdfFallbackRefreshTimer = window.setTimeout(async () => {
          if (win.__aqPdfFallbackRefreshing) return;
          const state = win.__aqPdfFallbackState;
          const activePanel = document.getElementById('pdfpanel');
          if (!state?.buffer || !activePanel?.classList.contains('open')) return;
          const activeScroll = document.getElementById('pdfscroll');
          const scrollTop = activeScroll?.scrollTop || 0;
          win.__aqPdfFallbackRefreshing = true;
          try {
            await renderPdfBufferFallback(state.buffer, String(state.title || 'PDF'), Number(state.scale || scale || 1.25));
            const nextScroll = document.getElementById('pdfscroll');
            if (nextScroll) nextScroll.scrollTop = scrollTop;
          } finally {
            win.__aqPdfFallbackRefreshing = false;
          }
        }, delay);
      };
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
    const refresh = () => {
      if (typeof win.__aqRefreshPdfFallback === 'function') win.__aqRefreshPdfFallback(140);
    };
    window.addEventListener('resize', refresh);
    document.addEventListener('fullscreenchange', refresh);
    const panel = document.getElementById('pdfpanel');
    const scroll = document.getElementById('pdfscroll');
    const mutationObserver = panel && typeof MutationObserver !== 'undefined'
      ? new MutationObserver(refresh)
      : null;
    if (panel) mutationObserver?.observe(panel, { attributes: true, attributeFilter: ['class', 'style'] });
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(refresh)
      : null;
    if (panel) resizeObserver?.observe(panel);
    if (scroll) resizeObserver?.observe(scroll);
    return () => {
      window.removeEventListener('resize', refresh);
      document.removeEventListener('fullscreenchange', refresh);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      delete win.__aqRenderPdfFallback;
      delete win.__aqRefreshPdfFallback;
      window.clearTimeout(win.__aqPdfFallbackRefreshTimer);
      delete win.__aqPdfFallbackRefreshTimer;
    };
  }, []);

  const handleReferencePdfAction = async (action: 'open' | 'show' | 'delete' | 'download' | 'browser', referenceId: string, options?: { skipConfirm?: boolean }) => {
    const workspace = getActiveWorkspace(appStateRef.current);
    const ref = workspace.lib.find((item) => item.id === referenceId);
    try {
      if (action === 'open') {
        setActiveReferenceId(referenceId);
        publishStateToLegacyWindow(appStateRef.current, { cur: workspace.id });
        const win = window as any;
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
          const result = await window.electronAPI?.loadPDF?.(referenceId, { id: workspace.id, name: workspace.name, title: ref.title }) as any;
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
        await window.electronAPI?.showPdfInExplorer?.(referenceId, { id: workspace.id, name: workspace.name, title: ref?.title });
        flashStatus('PDF klasörde gösterildi');
      }
      if (action === 'delete') {
        if (!options?.skipConfirm && !(await confirmDialog('Bu kaynağın PDF dosyası silinsin mi?'))) return;
        await window.electronAPI?.deletePDF?.(referenceId, { id: workspace.id, name: workspace.name, title: ref?.title });
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
      if (action === 'download') {
        if (!ref) {
          flashStatus('Kaynak seçilmedi');
          return;
        }
        setPdfProgress({ total: 1, attempted: 0, downloaded: 0, failed: 0, active: true });
        setActiveReferenceId(referenceId);
        const win = window as any;
        const urls = Array.from(new Set([
          String(ref.pdfUrl || '').trim(),
          String(ref.url || '').trim()
        ].filter(Boolean)));
        if (ref.doi && !String(ref.pdfUrl || '').trim()) {
          flashStatus('OA PDF URL aranıyor...');
          try {
            const resolvedUrls = typeof win.fetchOAUrls === 'function'
              ? await win.fetchOAUrls(ref.doi)
              : await resolveOpenAccessPdfUrls(String(ref.doi || ''));
            if (Array.isArray(resolvedUrls)) {
              resolvedUrls.map((item) => String(item || '').trim()).filter(Boolean).forEach((item) => {
                if (!urls.includes(item)) urls.push(item);
              });
            }
          } catch (_error) {}
        }
        if (!urls.length) {
          setPdfProgress({ total: 1, attempted: 1, downloaded: 0, failed: 1, active: false });
          flashStatus('PDF URL bulunamadı');
          return;
        }
        let result: any = null;
        let attemptedUrl = urls[0];
        for (const candidateUrl of urls) {
          attemptedUrl = candidateUrl;
          tracePdfDownloadAttempt({ source: 'reference-action', phase: 'start', url: candidateUrl, referenceId, doi: ref.doi });
          result = await window.electronAPI?.downloadPDFfromURL?.(candidateUrl, referenceId, {
            ws: { id: workspace.id, name: workspace.name, title: ref.title },
            title: ref.title,
            expectedDoi: ref.doi,
            expectedTitle: ref.title,
            expectedAuthors: ref.authors,
            expectedYear: ref.year,
            requireDoiEvidence: Boolean(ref.doi),
            allowUnverifiedPdf: true
          }) as any;
          tracePdfDownloadAttempt({ source: 'reference-action', phase: 'result', url: candidateUrl, referenceId, doi: ref.doi, result });
          if (result?.ok) break;
        }
        if (result?.ok) {
          const next = updateReferenceInActiveWorkspace(appStateRef.current, referenceId, {
            pdfUrl: result.finalUrl || attemptedUrl,
            pdfAttached: true,
            pdfVerification: result.verification || null
          });
          await persistState(next);
          setPdfProgress({ total: 1, attempted: 1, downloaded: 1, failed: 0, active: false });
          await handleReferencePdfAction('open', referenceId);
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

  const handleDeleteLabel = async (name: string, options?: { skipConfirm?: boolean }) => {
    const label = name.trim();
    if (!label) return;
    if (!options?.skipConfirm && !(await confirmDialog(`${label} etiketi silinsin mi?`))) return;
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

  const handleDeleteCollection = async (collectionId: string, options?: { skipConfirm?: boolean }) => {
    const workspace = getActiveWorkspace(appStateRef.current);
    const collections = Array.isArray(workspace.collections) ? workspace.collections as Array<{ id: string; name: string }> : [];
    const collection = collections.find((item) => String(item.id) === String(collectionId));
    if (!collection) return;
    if (!options?.skipConfirm && !(await confirmDialog(`${collection.name} klasörü silinsin mi?\nKaynaklar silinmez, sadece klasör bağlantısı kaldırılır.`))) return;
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
      const urls = Array.from(new Set([
        String(reference.pdfUrl || '').trim(),
        ...(!String(reference.pdfUrl || '').trim() ? await resolveOpenAccessPdfUrls(String(reference.doi || '')) : []),
        String(reference.url || '').trim()
      ].filter(Boolean)));
      if (!urls.length) {
        failed++;
        commitProgress(`OA PDF bulunamadı: ${done + failed}/${candidates.length}`);
        return;
      }
      try {
        let result: any = null;
        let attemptedUrl = urls[0];
        for (const url of urls) {
          attemptedUrl = url;
          tracePdfDownloadAttempt({ source: 'batch-oa', phase: 'start', url, referenceId: reference.id, doi: reference.doi, workspaceId: candidate.workspaceId });
          result = await window.electronAPI?.downloadPDFfromURL?.(url, reference.id, {
            ws: { id: candidate.workspaceId, name: candidate.workspaceName, title: reference.title },
            title: reference.title,
            expectedDoi: reference.doi,
            expectedTitle: reference.title,
            expectedAuthors: reference.authors,
            expectedYear: reference.year,
            requireDoiEvidence: Boolean(reference.doi),
            allowUnverifiedPdf: true
          }) as any;
          tracePdfDownloadAttempt({ source: 'batch-oa', phase: 'result', url, referenceId: reference.id, doi: reference.doi, workspaceId: candidate.workspaceId, result });
          if (result?.ok) break;
        }
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
        tracePdfDownloadAttempt({ source: 'batch-oa', phase: 'error', url: urls[0], referenceId: reference.id, doi: reference.doi, workspaceId: candidate.workspaceId, error: String(_error) });
        nextState = patchReferenceInWorkspace(nextState, candidate.workspaceId, reference.id, { pdfUrl: urls[0] });
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
      if (result && typeof result === 'object' && 'ok' in result && result.ok) {
        flashStatus('PDF dışa aktarıldı');
      } else if (result && typeof result === 'object' && 'canceled' in result && result.canceled) {
        flashStatus('PDF iptal edildi');
      } else {
        const message = result && typeof result === 'object' && 'error' in result ? String(result.error || '') : '';
        flashStatus(message ? `PDF dışa aktarılamadı: ${message}` : 'PDF dışa aktarılamadı');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      flashStatus(message ? `PDF dışa aktarılamadı: ${message}` : 'PDF dışa aktarılamadı');
    }
  };

  const handleExportDOCX = async () => {
    await flushEditorToState().catch(() => flashStatus('Export öncesi kayıt tamamlanamadı'));
    try { if (typeof (window as any).refreshExportAuxSections === 'function') (window as any).refreshExportAuxSections(); } catch (_error) {}
    const legacyExportHTML = typeof (window as any).getExportDocHTML === 'function'
      ? String((window as any).getExportDocHTML() || '')
      : '';
    const html = legacyExportHTML || editorRef.current?.getHTML?.() || '<p></p>';
    flashStatus('DOCX hazırlanıyor...');
    try {
      const docxApi = (window as any).AQDocxExport;
      if (!docxApi || typeof docxApi.buildDocxBytesFromHTML !== 'function') {
        throw new Error('DOCX JS exporter yüklenmedi');
      }
      const bytes = docxApi.buildDocxBytesFromHTML(html) as Uint8Array;
      let binary = '';
      for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      }
      const result = await window.electronAPI?.exportDOCX?.({
        defaultPath: 'academiq-document.docx',
        base64: window.btoa(binary)
      }) as { ok?: boolean; canceled?: boolean; error?: string } | undefined;
      if (result?.ok) {
        flashStatus('DOCX dışa aktarıldı');
      } else if (result?.canceled) {
        flashStatus('DOCX iptal edildi');
      } else {
        throw new Error(result?.error || 'DOCX kaydedilemedi');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bilinmeyen hata';
      flashStatus(`DOCX dışa aktarılamadı: ${message}`);
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
    publishStateToLegacyWindow(appStateRef.current);
    const win = window as any;
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

  const handleOpenPlainCitationLinking = () => {
    const linking = (window as any).AQPlainCitationLinking;
    if (linking && typeof linking.openReviewModal === 'function') {
      linking.openReviewModal();
      flashStatus('Düz atıf bağlama açıldı');
      return;
    }
    if (callLegacy('openPlainCitationLinking')) {
      flashStatus('Düz atıf bağlama açıldı');
      return;
    }
    flashStatus('Düz atıf bağlama hazır değil');
  };

  const runPdfViewerCommand = (fnName: string, label: string) => {
    const panel = document.getElementById('pdfpanel');
    if (panel && !panel.classList.contains('open')) panel.classList.add('open');
    if (callLegacy(fnName)) {
      flashStatus(label);
      return;
    }
    const fn = (window as any)[fnName];
    if (typeof fn === 'function') {
      try {
        fn();
        flashStatus(label);
        return;
      } catch (_error) {}
    }
    flashStatus(`${label} hazır değil`);
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
    { id: 'pdf-search', group: 'PDF', label: 'PDF içinde ara', run: () => runPdfViewerCommand('togglePdfSearch', 'PDF arama açıldı') },
    { id: 'pdf-thumbnails', group: 'PDF', label: 'PDF küçük resimler', run: () => runPdfViewerCommand('toggleThumbs', 'PDF küçük resimler açıldı') },
    { id: 'pdf-outline', group: 'PDF', label: 'PDF içerik tablosu', run: () => runPdfViewerCommand('toggleOutline', 'PDF içerik tablosu açıldı') },
    { id: 'pdf-annotations', group: 'PDF', label: 'PDF notlar ve highlightlar', run: () => runPdfViewerCommand('togglePdfAnnotations', 'PDF not paneli açıldı') },
    { id: 'pdf-related', group: 'PDF', label: 'PDF benzer çalışmalar', run: () => runPdfViewerCommand('togglePdfRelated', 'PDF benzer çalışmalar açıldı') },
    { id: 'pdf-fullscreen', group: 'PDF', label: 'PDF tam ekran', run: () => runPdfViewerCommand('togglePdfFullscreen', 'PDF tam ekran değiştirildi') },
    { id: 'pdf-ocr', group: 'PDF', label: 'PDF OCR çalıştır', run: () => runPdfViewerCommand('runPdfOcrExtractionNow', 'PDF OCR başlatıldı') },
    { id: 'export-pdf', group: 'Export', label: 'PDF dışa aktar', run: handleExportPDF },
    { id: 'export-docx', group: 'Export', label: 'DOCX dışa aktar', run: handleExportDOCX },
    { id: 'insert-citation', group: 'Editor', label: 'Atıf ekle', run: handleInsertCitation },
    { id: 'link-plain-citations', group: 'Editor', label: 'Düz atıfları kaynaklara bağla', run: handleOpenPlainCitationLinking },
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
          if (view === 'matrix') handleOpenMatrix();
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
        toolbar={<TopToolbar selectedReferenceId={activeReferenceId} onOpenFeatureModal={setFeatureModal} />}
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
            spellLabel={spellChipLabel}
            spellTone={spellChipTone}
            saveLabel={statusMessage || 'kaydedildi'}
            saveTone={saveTone}
            pdfProgressLabel={pdfProgressLabel}
            onOpenApa={openLegacyMetadataSurface}
            onOpenIssues={openLegacyIssueSurface}
            onOpenSpell={() => setSpellPanelOpen(true)}
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
            plainCitationSingleMatch={plainCitationSingleMatch}
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
        <SpellcheckPanel open={spellPanelOpen} onClose={() => setSpellPanelOpen(false)} />
        <ConfirmDialog />
        <InlineInteractionHandler />
        <SpellSuggestionPopup editorRef={editorRef} />
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
