import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  BookOpen,
  Bold,
  Eye,
  Image as ImageIcon,
  Indent,
  Italic,
  List,
  ListOrdered,
  Outdent,
  Quote,
  RefreshCw,
  Search,
  Strikethrough,
  Table2,
  PenLine,
  Underline
} from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { IconButton } from '../ui/IconButton';
import { useEditorCommands } from '../editor/EditorContext';
import { callLegacy, runEditorAction, runEditorCommand } from '../../lib/legacy-feature-adapter';
import {
  buildTOCPageHTML,
  buildCoverPageHTML,
  buildBilingualAbstractPageHTML,
  parseBilingualAbstractHTML,
  turkishToday,
  getAppendixCount,
  buildAppendixBlockHTML,
  normalizeAppendicesHTML as normalizeAppendicesHTMLLib,
  removeAppendixFromHTML as removeAppendixFromHTMLLib
} from '../../lib/auxiliary-page-html';
import { scrollToBibliographyBlock } from '../../lib/bibliography-navigation';
import { openDocumentOutline } from '../../lib/outline-modals';
import { computeActiveMarks, activeMarksEqual, type ActiveMarks } from '../../lib/editor-active-marks';
import { SectionTabs } from './SectionTabs';
import {
  getActiveDocRecord,
  commitEditorHTMLToLegacyState as commitEditorHTMLToLegacyStateLib,
  sanitizeAuxiliaryHTML,
  saveAuxiliaryChange as saveAuxiliaryChangeLib,
  setStatusText,
  setAuxiliaryPageHTML as setAuxiliaryPageHTMLLib
} from '../../lib/legacy-doc-helpers';
import {
  applyAppendicesToEngine as applyAppendicesToEngineLib,
  removeAppendixFromEngine as removeAppendixFromEngineLib,
  scrollToLatestAppendix as scrollToLatestAppendixLib,
  installAppendixDeleteButtons as installAppendixDeleteButtonsLib,
  resolveAppendixIdFromButton
} from '../../lib/appendix-engine';
import { deleteAQEngineAppendix as deleteAQEngineAppendixCore } from '../../lib/aq-engine/appendix-engine-core';

type TopToolbarProps = {
  selectedReferenceId?: string;
  onOpenAudit?: () => void;
  onOpenFeatureModal?: (modal: 'settings' | 'recovery' | 'history' | 'browserCapture' | 'referenceEdit' | 'crossRef' | 'referenceImport' | 'plainCitationLinker' | null) => void;
};

type ToolbarButtonProps = {
  children: ReactNode;
  label?: string;
  onClick: () => void;
  strong?: boolean;
  active?: boolean;
};

function ToolbarButton({ children, label, onClick, strong, active }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active || undefined}
      title={label || (typeof children === 'string' ? children : undefined)}
      onClick={onClick}
      className={[
        'inline-flex h-[29px] items-center justify-center gap-1 rounded px-1.5 text-[12px] leading-none transition hover:bg-aq-panel active:translate-y-px',
        strong ? 'font-semibold text-aq-ink' : 'text-aq-ink',
        active ? 'bg-aq-navy/10 text-aq-navy shadow-[inset_0_0_0_1px_rgba(30,58,95,0.18)]' : ''
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function TopBarButton({ children, onClick, title, id }: { children: ReactNode; onClick: () => void; title?: string; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      title={title}
      onClick={onClick}
      className="relative inline-flex h-full shrink-0 items-center gap-1 px-2.5 text-left text-[12px] leading-none text-aq-ink transition after:absolute after:right-0 after:top-1/2 after:h-5 after:w-px after:-translate-y-1/2 after:bg-aq-line hover:bg-aq-panel"
    >
      {children}
    </button>
  );
}

function ToolbarGroup({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={['flex min-h-[31px] shrink-0 items-center gap-0.5 px-1 before:h-5 before:w-px before:bg-aq-line before:content-[\'\'] first:before:hidden', wide ? 'min-w-max' : ''].join(' ')}>
      <span className="flex h-[29px] items-center px-0.5 text-[9px] font-semibold uppercase leading-none tracking-[0.14em] text-aq-muted">{label}</span>
      {children}
    </div>
  );
}

export function TopToolbar({ selectedReferenceId, onOpenAudit, onOpenFeatureModal }: TopToolbarProps) {
  const editorRef = useEditorCommands();
  const findStateRef = useRef<{ matches: unknown[]; index: number; editorRanges?: unknown[] }>({ matches: [], index: -1 });
  const findTimerRef = useRef<number | null>(null);
  const savedAqSelectionRef = useRef<unknown>(null);
  const [findQuery, setFindQuery] = useState('');
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceText, setReplaceText] = useState('');
  const [activeMarks, setActiveMarks] = useState<ActiveMarks>({});
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverTitle, setCoverTitle] = useState('');
  const [coverAuthor, setCoverAuthor] = useState('');
  const [coverInstitution, setCoverInstitution] = useState('');
  const [coverCourse, setCoverCourse] = useState('');
  const [coverProfessor, setCoverProfessor] = useState('');
  const [abstractOpen, setAbstractOpen] = useState(false);
  const [abstractText, setAbstractText] = useState('');
  const [abstractKeywords, setAbstractKeywords] = useState('');
  const [abstractEnglishText, setAbstractEnglishText] = useState('');
  const [abstractEnglishKeywords, setAbstractEnglishKeywords] = useState('');
  const [trackChangesActive, setTrackChangesActive] = useState(false);

  const refreshActiveMarks = () => {
    const next = computeActiveMarks();
    setActiveMarks((current) => activeMarksEqual(current, next) ? current : next);
  };

  const scheduleActiveMarksRefresh = () => {
    window.setTimeout(refreshActiveMarks, 0);
    window.setTimeout(refreshActiveMarks, 80);
  };

  const refreshTrackChangesState = () => {
    const win = window as any;
    const doc = typeof win.getCurrentDocument === 'function'
      ? win.getCurrentDocument()
      : win.S?.docs?.find?.((item: any) => item?.id === win.S?.curDoc);
    setTrackChangesActive(Boolean(doc?.trackChangesEnabled));
  };

  useEffect(() => {
    scheduleActiveMarksRefresh();
    const onChange = () => scheduleActiveMarksRefresh();
    document.addEventListener('selectionchange', onChange);
    document.addEventListener('keyup', onChange, true);
    document.addEventListener('mouseup', onChange, true);
    document.addEventListener('pointerup', onChange, true);
    window.addEventListener('aq:react-sync', onChange as EventListener);
    window.addEventListener('aq:track-changes-toggle', refreshTrackChangesState as EventListener);
    refreshTrackChangesState();
    return () => {
      document.removeEventListener('selectionchange', onChange);
      document.removeEventListener('keyup', onChange, true);
      document.removeEventListener('mouseup', onChange, true);
      document.removeEventListener('pointerup', onChange, true);
      window.removeEventListener('aq:react-sync', onChange as EventListener);
      window.removeEventListener('aq:track-changes-toggle', refreshTrackChangesState as EventListener);
    };
  }, []);

  useEffect(() => {
    const onRemoveAbstract = () => removeAbstractPage();
    window.addEventListener('aq:remove-abstract-page', onRemoveAbstract);
    return () => window.removeEventListener('aq:remove-abstract-page', onRemoveAbstract);
  }, []);

  const preserveEditorSelection = () => {
    callLegacy('restoreEditorListStyleSelection');
  };

  const focusEditor = () => {
    editorRef.current?.focus();
  };

  const command = (cmd: string, val?: string) => {
    preserveEditorSelection();
    runEditorCommand(cmd, val);
    focusEditor();
    scheduleActiveMarksRefresh();
  };

  const action = (fn: string, ...args: unknown[]) => {
    preserveEditorSelection();
    callLegacy(fn, ...args);
    scheduleActiveMarksRefresh();
  };

  const editorAction = (fn: string, ...args: unknown[]) => {
    preserveEditorSelection();
    runEditorAction(fn, ...args);
    focusEditor();
    scheduleActiveMarksRefresh();
  };

  const applyFontSize = (pt: string) => {
    const win = window as any;
    const activeEditor = win.editor;
    preserveEditorSelection();
    if (activeEditor?._aqEngine && activeEditor.commands && typeof activeEditor.commands.setFontSize === 'function') {
      if (savedAqSelectionRef.current && typeof activeEditor._restoreSelection === 'function') {
        activeEditor._restoreSelection(savedAqSelectionRef.current);
      }
      activeEditor.commands.setFontSize(pt);
      callLegacy('runEditorMutationEffects', { layout: true, syncChrome: true, refreshTrigger: false });
    } else if (!callLegacy('applyFontSize', pt)) {
      runEditorAction('applyFontSize', pt);
    }
    focusEditor();
    scheduleActiveMarksRefresh();
  };

  const guardEditorToolbarPointer = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('select,input,textarea')) {
      const activeEditor = (window as any).editor;
      if (activeEditor?._aqEngine && typeof activeEditor._captureSelection === 'function') {
        savedAqSelectionRef.current = activeEditor._captureSelection();
      }
      callLegacy('captureEditorListStyleSelection');
      return;
    }
    if (target.closest('button')) {
      const activeEditor = (window as any).editor;
      if (activeEditor?._aqEngine && typeof activeEditor._captureSelection === 'function') {
        savedAqSelectionRef.current = activeEditor._captureSelection();
      }
      callLegacy('captureEditorListStyleSelection');
    }
  };

  const showModal = (id: string) => {
    const modal = document.getElementById(id);
    if (!modal) return false;
    modal.classList.add('show');
    modal.addEventListener('mousedown', closeLegacyModalOnBackdrop);
    return true;
  };

  const closeModal = (id: string) => {
    const modal = document.getElementById(id);
    if (!modal) return false;
    modal.classList.remove('show');
    modal.removeEventListener('mousedown', closeLegacyModalOnBackdrop);
    return true;
  };

  const closeLegacyModalOnBackdrop = (event: MouseEvent) => {
    if (event.target !== event.currentTarget) return;
    const modal = event.currentTarget as HTMLElement;
    modal.classList.remove('show');
    modal.removeEventListener('mousedown', closeLegacyModalOnBackdrop);
  };

  const getEditorHTML = () => editorRef.current?.getHTML?.() || document.getElementById('apaed')?.innerHTML || '<p></p>';
  const setEditorHTML = (html: string) => editorRef.current?.setHTML?.(html);

  const commitEditorHTMLToLegacyState = () =>
    commitEditorHTMLToLegacyStateLib(getEditorHTML());

  const saveAuxiliaryChange = () => saveAuxiliaryChangeLib(activeNotifySave);

  const setAuxiliaryPageHTML = (pageId: string, bodyId: string, html: string) => {
    setAuxiliaryPageHTMLLib(pageId, bodyId, html,
      pageId === 'abstractpage' ? decorateAbstractPage : undefined
    );
  };

  const decorateAbstractPage = (body: HTMLElement) => {
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
  };

  const insertTOCPage = () => {
    commitEditorHTMLToLegacyState();
    const tocHTML = buildTOCPageHTML();
    if (!tocHTML.trim()) {
      setStatusText('Belgede başlık bulunamadı. Önce H1-H5 başlıkları ekleyin.', 'er');
      return false;
    }
    const doc = getActiveDocRecord();
    if (!doc) return false;
    doc.tocHTML = sanitizeAuxiliaryHTML(tocHTML);
    setAuxiliaryPageHTML('tocpage', 'tocbody', doc.tocHTML);
    const tocBody = document.getElementById('tocbody');
    if (tocBody && typeof (window as any).fixTOCDots === 'function') {
      window.setTimeout(() => (window as any).fixTOCDots(tocBody), 0);
    }
    saveAuxiliaryChange();
    window.setTimeout(() => {
      document.getElementById('tocpage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
    return true;
  };

  const openCoverDialog = () => {
    const doc = getActiveDocRecord();
    setCoverTitle(String(doc?.name || '').trim());
    setCoverAuthor('');
    setCoverInstitution('');
    setCoverCourse('');
    setCoverProfessor('');
    setCoverOpen(true);
  };

  const buildLocalCoverHTML = () => buildCoverPageHTML({
    title: coverTitle.trim(),
    author: coverAuthor.trim(),
    institution: coverInstitution.trim(),
    course: coverCourse.trim(),
    professor: coverProfessor.trim(),
    dateText: turkishToday()
  });

  const insertCoverPage = () => {
    const title = coverTitle.trim();
    if (!title) {
      setStatusText('Kapak için başlık girin.', 'er');
      return;
    }
    commitEditorHTMLToLegacyState();
    const doc = getActiveDocRecord();
    if (!doc) return;
    doc.coverHTML = sanitizeAuxiliaryHTML(buildLocalCoverHTML());
    setAuxiliaryPageHTML('coverpage', 'coverbody', doc.coverHTML);
    saveAuxiliaryChange();
    setCoverOpen(false);
    window.setTimeout(() => {
      document.getElementById('coverpage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
    setStatusText('APA 7 kapak sayfası eklendi');
  };

  const openAbstractDialog = () => {
    const doc = getActiveDocRecord();
    const parsed = parseBilingualAbstractHTML(String(doc?.abstractHTML || ''));
    setAbstractText(parsed.turkish.text);
    setAbstractKeywords(parsed.turkish.keywords);
    setAbstractEnglishText(parsed.english.text);
    setAbstractEnglishKeywords(parsed.english.keywords);
    setAbstractOpen(true);
  };

  const buildLocalBilingualAbstractHTML = () => buildBilingualAbstractPageHTML({
    turkish: { text: abstractText, keywords: abstractKeywords },
    english: { text: abstractEnglishText, keywords: abstractEnglishKeywords }
  });

  const insertAbstractPage = () => {
    if (!abstractText.trim()) {
      setStatusText('Özet metni girin.', 'er');
      return;
    }
    commitEditorHTMLToLegacyState();
    const doc = getActiveDocRecord();
    if (!doc) return;
    doc.abstractHTML = sanitizeAuxiliaryHTML(buildLocalBilingualAbstractHTML());
    setAuxiliaryPageHTML('abstractpage', 'abstractbody', doc.abstractHTML);
    saveAuxiliaryChange();
    setAbstractOpen(false);
    setAbstractText('');
    setAbstractKeywords('');
    setAbstractEnglishText('');
    setAbstractEnglishKeywords('');
    window.setTimeout(() => {
      document.getElementById('abstractpage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
    setStatusText('APA 7 abstract sayfası eklendi');
  };

  const removeAbstractPage = () => {
    const doc = getActiveDocRecord();
    if (doc) doc.abstractHTML = '';
    setAuxiliaryPageHTML('abstractpage', 'abstractbody', '');
    saveAuxiliaryChange();
    setStatusText('Öz sayfası silindi');
  };

  const removeTOCPage = () => {
    const doc = getActiveDocRecord();
    if (doc) doc.tocHTML = '';
    setAuxiliaryPageHTML('tocpage', 'tocbody', '');
    saveAuxiliaryChange();
    return true;
  };

  const normalizeAppendicesHTML = (html: string) =>
    normalizeAppendicesHTMLLib(html, sanitizeAuxiliaryHTML);

  const applyAppendicesToEngine = (appendicesHTML: string) =>
    applyAppendicesToEngineLib(appendicesHTML, getAppendixCount);

  const removeAppendixFromHTML = (html: string, appendixId: string) =>
    removeAppendixFromHTMLLib(html, appendixId, sanitizeAuxiliaryHTML);

  const removeAppendixFromEngine = (appendixId?: string) =>
    removeAppendixFromEngineLib(appendixId);

  const deleteAppendix = (appendixId: string, blockIndex = -1) => {
    const doc = getActiveDocRecord();
    if (!doc) return false;
    const win = window as any;
    const activeEditor = typeof win.getActiveEditorInstance === 'function'
      ? win.getActiveEditorInstance()
      : (win.editor || null);
    let removed = false;
    // Phase 4 (strangler): faithful TS port of legacy deleteAQEngineAppendix,
    // with side-effectful deps injected from legacy-doc-helpers. Falls back to
    // the legacy global only if the port is somehow unavailable.
    try {
      removed = deleteAQEngineAppendixCore(activeEditor, appendixId, blockIndex, {
        getDocRecord: getActiveDocRecord,
        sanitize: sanitizeAuxiliaryHTML,
        save: saveAuxiliaryChange
      });
    } catch (_e) {
      removed = false;
    }
    if (!removed && typeof win.deleteAQEngineAppendix === 'function') {
      removed = !!win.deleteAQEngineAppendix(activeEditor, appendixId, blockIndex);
    }
    if (!removed) {
      const currentHTML = String(doc.appendicesHTML || '');
      const nextHTML = removeAppendixFromHTML(currentHTML, appendixId);
      doc.appendicesHTML = nextHTML;
      const appliedToEngine = applyAppendicesToEngine(doc.appendicesHTML);
      if (!appliedToEngine && nextHTML === currentHTML) removed = removeAppendixFromEngine(appendixId);
      else removed = true;
      setAuxiliaryPageHTML('appendixpage', 'appendixbody', appliedToEngine ? '' : doc.appendicesHTML);
    }
    saveAuxiliaryChange();
    window.setTimeout(installAppendixDeleteButtons, 120);
    setStatusText(removed ? 'Ek sayfası silindi' : 'Ek sayfası silinemedi', removed ? 'ok' : 'er');
    return removed;
  };

  const installAppendixDeleteButtons = () =>
    installAppendixDeleteButtonsLib((appendixId, blockIndex) =>
      deleteAppendix(appendixId, blockIndex >= 0 ? blockIndex : -1)
    );

  useEffect(() => {
    const onPointerDown = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest?.('.appendix-remove-btn') as HTMLElement | null;
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest?.('.appendix-remove-btn') as HTMLElement | null;
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const appendixId = resolveAppendixIdFromButton(button);
      const blockIndex = Number(button.dataset.blockIndex || button.closest<HTMLElement>('.aq-engine-line')?.dataset.blockIndex || -1);
      if (appendixId || blockIndex >= 0) deleteAppendix(appendixId, blockIndex);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('click', onClick, true);
    };
  });

  const scrollToLatestAppendix = () => scrollToLatestAppendixLib();

  const insertAppendixPage = () => {
    commitEditorHTMLToLegacyState();
    const doc = getActiveDocRecord();
    if (!doc) return false;
    const current = String(doc.appendicesHTML || '');
    const nextIndex = getAppendixCount(current) + 1;
    const appended = current + buildAppendixBlockHTML(nextIndex);
    doc.appendicesHTML = normalizeAppendicesHTML(appended);
    const appliedToEngine = applyAppendicesToEngine(doc.appendicesHTML);
    setAuxiliaryPageHTML('appendixpage', 'appendixbody', appliedToEngine ? '' : doc.appendicesHTML);
    saveAuxiliaryChange();
    window.setTimeout(() => {
      installAppendixDeleteButtons();
      if (!scrollToLatestAppendix() && !appliedToEngine) {
        document.getElementById('appendixpage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);
    setStatusText('Ek sayfası eklendi');
    return true;
  };

  const runTOC = (mode: 'insert' | 'remove') => {
    preserveEditorSelection();
    if (mode === 'insert' && insertTOCPage()) return;
    if (mode === 'remove' && removeTOCPage()) return;
    const api = (window as any).AQTipTapWordTOC;
    const root = document.getElementById('apaed');
    if (!api) return;
    const deps = {
      getEditorRoot: () => root,
      getHTML: getEditorHTML,
      applyHTML: setEditorHTML,
      onNoHeadings: () => {},
      onUpdated: () => activeNotifySave()
    };
    if (mode === 'remove' && typeof api.removeTOC === 'function') api.removeTOC(deps);
    if (mode === 'insert' && typeof api.insertTOC === 'function') api.insertTOC(deps);
  };

  const insertAppendix = () => {
    preserveEditorSelection();
    if (insertAppendixPage()) return;
    action('insAppendix');
  };

  const activeNotifySave = () => {
    try {
      (window as any).editor?.emit?.('update');
    } catch (_error) {}
  };

  const getCurrentTrackChangesDocument = () => {
    const win = window as any;
    return typeof win.getCurrentDocument === 'function'
      ? win.getCurrentDocument()
      : win.S?.docs?.find?.((item: any) => item?.id === win.S?.curDoc);
  };

  const syncTrackChangesUI = (enabled?: boolean) => {
    const doc = getCurrentTrackChangesDocument();
    const next = typeof enabled === 'boolean' ? enabled : Boolean(doc?.trackChangesEnabled);
    setTrackChangesActive(next);
    window.dispatchEvent(new CustomEvent('aq:track-changes-toggle', { detail: { enabled: next } }));
  };

  const moduleAction = (moduleName: string, methodName: string, ...args: unknown[]) => {
    preserveEditorSelection();
    const mod = (window as any)[moduleName];
    const method = mod && mod[methodName];
    if (typeof method === 'function') method(...args);
  };

  const marginNoteAction = () => {
    const mod = (window as any).AQMarginNotes;
    mod?.init?.();
    const created = typeof mod?.createNoteAtCurrentSelection === 'function'
      ? mod.createNoteAtCurrentSelection()
      : null;
    if (!created && typeof mod?.toggleMnMode === 'function') {
      mod.toggleMnMode();
    }
  };

  const toggleTrackChanges = () => {
    preserveEditorSelection();
    const win = window as any;
    let nextEnabled: boolean | null = null;
    if (typeof win.toggleTrackChangesMode === 'function') {
      try {
        nextEnabled = Boolean(win.toggleTrackChangesMode());
      } catch (error) {
        console.error('[track-changes] toggle failed', error);
      }
    }
    if (nextEnabled == null) {
      const doc = getCurrentTrackChangesDocument();
      nextEnabled = !Boolean(doc?.trackChangesEnabled);
      if (doc) doc.trackChangesEnabled = nextEnabled;
      if (win.AQTipTapWordCommands && typeof win.AQTipTapWordCommands.setTrackChangesEnabled === 'function') {
        try {
          nextEnabled = Boolean(win.AQTipTapWordCommands.setTrackChangesEnabled(nextEnabled, { source: 'react-toolbar' }));
        } catch (_error) {}
      }
      document.body?.classList?.toggle('aq-track-changes-on', nextEnabled);
    }
    syncTrackChangesUI(nextEnabled);
    activeNotifySave();
    window.setTimeout(refreshTrackChangesState, 0);
    window.setTimeout(refreshTrackChangesState, 120);
    focusEditor();
  };

  const runTrackChangeAction = (fn: string) => {
    preserveEditorSelection();
    const win = window as any;
    const editor = typeof win.getActiveEditorInstance === 'function'
      ? win.getActiveEditorInstance()
      : (win.editor || null);
    let handled = false;
    // Prefer the aq-engine's native bulk accept/reject (correct + commit-based,
    // so undo works) over the legacy commands, which may not cover the engine.
    if (editor?._aqEngine) {
      if (/^accept(Tracked|Track)Changes$/.test(fn) && typeof editor.acceptAllTrackChanges === 'function') {
        handled = editor.acceptAllTrackChanges() !== false;
      } else if (/^reject(Tracked|Track)Changes$/.test(fn) && typeof editor.rejectAllTrackChanges === 'function') {
        handled = editor.rejectAllTrackChanges() !== false;
      }
    }
    if (!handled) {
      const ok = callLegacy(fn);
      if (!ok) runEditorCommand(fn.replace(/TrackedChange$/, 'TrackChange').replace(/TrackedChanges$/, 'TrackChanges'));
    }
    activeNotifySave();
    window.setTimeout(refreshTrackChangesState, 0);
    window.setTimeout(refreshTrackChangesState, 120);
    focusEditor();
  };

  const selectAction = (event: ChangeEvent<HTMLSelectElement>, run: (value: string) => void) => {
    const value = event.target.value;
    if (!value) return;
    run(value);
    event.target.value = '';
  };

  const runBibliographyMenuAction = (value: string) => {
    const actions: Record<string, () => void> = {
      go: () => goToBibliography(),
      refresh: () => action('refreshBibliographyManual'),
      reset: () => action('resetBibliographyManual'),
      external: () => openExternalReferenceImport(),
      duplicates: () => openDuplicateReview(),
      health: () => openMetadataHealth(),
      audit: () => onOpenAudit?.()
    };
    actions[value]?.();
  };

  const showLegacyModal = (id: string) => {
    const modal = document.getElementById(id);
    if (!modal) return false;
    modal.classList.add('show');
    modal.addEventListener('mousedown', closeLegacyModalOnBackdrop);
    return true;
  };

  const openDuplicateReview = () => {
    preserveEditorSelection();
    window.dispatchEvent(new CustomEvent('aq:open-quality-surface', { detail: { target: 'duplicate' } }));
  };

  const openMetadataHealth = () => {
    preserveEditorSelection();
    window.dispatchEvent(new CustomEvent('aq:open-quality-surface', { detail: { target: 'metadata' } }));
  };

  const openExternalReferenceImport = () => {
    preserveEditorSelection();
    if (onOpenFeatureModal) {
      onOpenFeatureModal('referenceImport');
      // Keep legacy call as fallback
      // callLegacy('openExternalReferenceImportModal')
    } else {
      const openedByLegacy = callLegacy('openExternalReferenceImportModal');
      const modal = document.getElementById('externalReferenceImportModal');
      if (modal) {
        modal.classList.add('show');
        modal.addEventListener('mousedown', closeLegacyModalOnBackdrop);
        const status = document.getElementById('externalReferenceImportStatus');
        if (status) status.textContent = '';
        window.setTimeout(() => {
          (document.getElementById('externalReferenceTextInput') as HTMLTextAreaElement | null)?.focus();
        }, 40);
      } else if (!openedByLegacy) {
        console.warn('[external-reference-import] modal not found');
      }
    }
  };

  const goToBibliography = () => {
    preserveEditorSelection();
    callLegacy('insRefs');
    window.setTimeout(() => {
      if (scrollToBibliographyBlock()) return;
      const page = document.getElementById('bibpage');
      if (page && window.getComputedStyle(page).display !== 'none') {
        page.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
      }
    }, 80);
  };

  const openTableWizard = () => {
    const activeEditor = (window as any).editor;
    if (activeEditor?._aqEngine && typeof activeEditor._captureSelection === 'function') {
      savedAqSelectionRef.current = activeEditor._captureSelection();
    }
    callLegacy('captureEditorListStyleSelection');
    if (!callLegacy('openTableWizard')) callLegacy('showM', 'wiz');
    const modal = document.getElementById('wiz');
    modal?.classList.add('show');
  };

  const insertImage = () => {
    const activeEditor = (window as any).editor;
    if (activeEditor?._aqEngine && typeof activeEditor._captureSelection === 'function') {
      savedAqSelectionRef.current = activeEditor._captureSelection();
    }
    callLegacy('captureEditorListStyleSelection');
    if (!callLegacy('insImage')) {
      (document.getElementById('imginp') as HTMLInputElement | null)?.click();
    }
  };

  const importWord = () => {
    (document.getElementById('wordinp') as HTMLInputElement | null)?.click();
  };

  const transformSelection = (mode: 'upper' | 'title' | 'lower') => {
    preserveEditorSelection();
    callLegacy('transformSelectedText', mode);
    focusEditor();
  };

  const insertCitation = () => {
    preserveEditorSelection();
    if (!callLegacy('doTrigRef')) {
      editorRef.current?.insertCitation(selectedReferenceId || '');
      focusEditor();
      return;
    }
    window.setTimeout(() => {
      const trigger = document.getElementById('trig');
      if (trigger && window.getComputedStyle(trigger).display === 'none') {
        callLegacy('openTrig', '', 'inline');
      }
    }, 30);
  };

  const openPlainCitationLinking = () => {
    preserveEditorSelection();
    if (onOpenFeatureModal) {
      onOpenFeatureModal('plainCitationLinker');
      // Keep legacy call as fallback
      // callLegacy('openPlainCitationLinking')
    } else {
      if (!callLegacy('openPlainCitationLinking')) {
        callLegacy('linkHighConfidencePlainCitations');
      }
    }
    focusEditor();
  };

  const executeFind = (value = findQuery) => {
    const api = (window as any).AQTipTapWordFind;
    const editor = (window as any).editor || null;
    const countEl = document.getElementById('toolbarFindCount');
    if (!api || typeof api.executeSearchWithState !== 'function') return false;
    api.executeSearchWithState({
      state: findStateRef.current,
      editor,
      query: value,
      countEl
    });
    return true;
  };

  const navigateFind = (forward: boolean) => {
    const api = (window as any).AQTipTapWordFind;
    const editor = (window as any).editor || null;
    const countEl = document.getElementById('toolbarFindCount');
    if (!api || typeof api.navigateSearch !== 'function') return false;
    api.navigateSearch({
      state: findStateRef.current,
      editor,
      countEl,
      forward
    });
    return true;
  };

  const handleFindInput = (value: string) => {
    setFindQuery(value);
    if (findTimerRef.current != null) window.clearTimeout(findTimerRef.current);
    findTimerRef.current = window.setTimeout(() => {
      findTimerRef.current = null;
      executeFind(value);
    }, 180);
  };

  const handleFindKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      navigateFind(!event.shiftKey);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      callLegacy('closeFindBar');
    }
  };

  const runReplace = (all = false) => {
    const api = (window as any).AQTipTapWordFind;
    const editor = (window as any).editor || null;
    const countEl = document.getElementById('toolbarFindCount');
    if (!api || typeof api.replaceSearchWithState !== 'function') return;
    api.replaceSearchWithState({
      state: findStateRef.current,
      editor,
      query: findQuery,
      replacement: replaceText,
      countEl,
      all,
      onMutate: activeNotifySave,
      onAfterReplace: () => executeFind(findQuery)
    });
  };

  return (
    <div
      className="aq-editor-toolbars space-y-1.5 bg-transparent px-2 py-1.5"
    >
      <SectionTabs />
      <div className="flex h-8 w-full items-center overflow-hidden rounded-md border border-aq-line bg-white shadow-sm">
        <TopBarButton id="outlineOpenBtn" onClick={openDocumentOutline} title="Belge anahatı">
          <BookOpen size={15} strokeWidth={1.8} />
          Anahat
        </TopBarButton>
        <div className="relative flex h-full shrink-0 items-center gap-1 px-1.5 after:absolute after:right-0 after:top-1/2 after:h-4 after:w-px after:-translate-y-1/2 after:bg-aq-line">
          <button
            type="button"
            title="Değişiklikleri izle"
            aria-pressed={trackChangesActive || undefined}
            onClick={toggleTrackChanges}
            className={[
              'inline-flex h-[29px] items-center gap-1 rounded px-2 text-[12px] leading-none text-aq-ink transition hover:bg-aq-panel active:translate-y-px',
              trackChangesActive ? 'bg-aq-navy/10 font-semibold text-aq-navy shadow-[inset_0_0_0_1px_rgba(30,58,95,0.18)]' : ''
            ].join(' ')}
          >
            <PenLine size={14} />
            İzle
          </button>
          <select
            defaultValue=""
            onChange={(event) => selectAction(event, runTrackChangeAction)}
            className="h-[29px] w-[82px] rounded border-0 bg-transparent px-1 text-[12px] leading-none text-aq-ink outline-none hover:bg-aq-panel"
            title="Değişiklik izleme işlemleri"
          >
            <option value="">Değişiklik</option>
            <option value="focusPrevTrackedChange">Önceki</option>
            <option value="focusNextTrackedChange">Sonraki</option>
            <option value="acceptCurrentTrackedChange">Kabul</option>
            <option value="rejectCurrentTrackedChange">Reddet</option>
            <option value="acceptTrackedChanges">Tümünü kabul</option>
            <option value="rejectTrackedChanges">Tümünü reddet</option>
          </select>
        </div>

        <div className="relative flex h-full shrink-0 items-center gap-1 px-2 after:absolute after:right-0 after:top-1/2 after:h-4 after:w-px after:-translate-y-1/2 after:bg-aq-line">
          <span className="text-[13px] text-aq-ink">×=</span>
          <select
            defaultValue=""
            onChange={(event) => selectAction(event, (value) => runTOC(value === 'removeTOC' ? 'remove' : 'insert'))}
            className="h-[29px] min-w-28 rounded border-0 bg-transparent px-1 text-[12px] leading-none text-aq-ink outline-none hover:bg-aq-panel"
            title="İçindekiler"
          >
            <option value="">İçindekiler</option>
            <option value="insertTOC">İçindekiler Ekle</option>
            <option value="insertTOC">İçindekileri Güncelle</option>
            <option value="removeTOC">İçindekiler Sil</option>
          </select>
        </div>

        <div className="relative flex h-full shrink-0 items-center gap-1 px-1.5 after:absolute after:right-0 after:top-1/2 after:h-4 after:w-px after:-translate-y-1/2 after:bg-aq-line">
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-aq-muted">Kaynak</span>
          <select
            defaultValue="apa7"
            onChange={(event) => action('setCitationStyle', event.target.value)}
            className="h-[29px] rounded border-0 bg-transparent px-1 text-[12px] leading-none text-aq-ink outline-none hover:bg-aq-panel"
            title="Atıf stili"
          >
            <option value="apa7">APA 7</option>
            <option value="chicago">Chicago</option>
            <option value="vancouver">Vancouver</option>
          </select>
        </div>

        <div className="relative flex h-full shrink-0 items-center gap-1 px-1.5 after:absolute after:right-0 after:top-1/2 after:h-4 after:w-px after:-translate-y-1/2 after:bg-aq-line">
          <span
            title="Kaynakça"
            aria-label="Kaynakça"
            className="inline-flex h-[29px] w-7 shrink-0 items-center justify-center rounded text-aq-muted"
          >
            <ListOrdered size={15} strokeWidth={1.8} />
          </span>
          <select
            defaultValue=""
            onChange={(event) => selectAction(event, runBibliographyMenuAction)}
            className="h-[29px] w-20 rounded border-0 bg-transparent px-1 text-[12px] leading-none text-aq-ink outline-none hover:bg-aq-panel"
            title="Kaynakça"
          >
            <option value="">Kaynakça</option>
            <option value="go">Kaynakçaya Git</option>
            <option value="refresh">Kaynakçayı Güncelle</option>
            <option value="reset">Otomatiğe Dön</option>
            <option value="external">Dışarıdan Kaynakça Ekle</option>
            <option value="duplicates">Duplicate Bul</option>
            <option value="health">Metadata Health</option>
            <option value="audit">Atıfları Denetle</option>
          </select>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1 px-2">
          <div className="relative min-w-24 max-w-[260px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-aq-muted" />
            <input
              id="toolbarFindInp"
              type="text"
              placeholder="Bul..."
              title="Bul (Ctrl+F)"
              onInput={(event) => handleFindInput((event.target as HTMLInputElement).value)}
              onKeyDown={handleFindKeyDown}
              className="h-[29px] w-full rounded-md border border-aq-line bg-white pl-8 pr-2 text-[12px] leading-none text-aq-ink outline-none focus:border-aq-navy"
            />
          </div>
          <span id="toolbarFindCount" className="hidden min-w-8 text-center text-[10px] text-aq-muted">--</span>
          <span id="toolbarFindPreview" className="hidden max-w-32 truncate text-[10px] text-aq-muted" aria-live="polite" />
          <button id="toolbarFindPrevBtn" type="button" title="Önceki" onClick={() => navigateFind(false)} className="h-[29px] w-7 rounded text-[11.5px] leading-none text-aq-ink hover:bg-aq-panel">▲</button>
          <button id="toolbarFindNextBtn" type="button" title="Sonraki" onClick={() => navigateFind(true)} className="h-[29px] w-7 rounded text-[11.5px] leading-none text-aq-ink hover:bg-aq-panel">▼</button>
          <button
            id="toolbarFindReplaceBtn"
            type="button"
            title="Değiştir"
            onClick={() => setReplaceOpen(true)}
            className="inline-flex h-[29px] shrink-0 items-center gap-1 rounded px-2 text-[12px] leading-none text-aq-ink hover:bg-aq-panel"
          >
            <RefreshCw size={13} />
            Değiştir
          </button>
        </div>
      </div>

      <div
        className="aq-editor-toolbar-panel flex w-full flex-col overflow-visible rounded-md border border-aq-line bg-white shadow-none"
        onMouseDownCapture={guardEditorToolbarPointer}
      >
        <div className="flex h-[31px] w-full items-center overflow-hidden border-b border-aq-line/70">
        <ToolbarGroup label="Metin" wide>
          <select onChange={(event) => command('fontName', event.target.value)} defaultValue="Times New Roman" className="h-[29px] rounded border-0 bg-transparent px-1 text-[12px] leading-none outline-none hover:bg-aq-panel">
            <option value="Times New Roman">Times New Roman</option>
            <option value="Arial">Arial</option>
            <option value="Calibri">Calibri</option>
            <option value="Georgia">Georgia</option>
            <option value="Verdana">Verdana</option>
            <option value="Courier New">Courier New</option>
          </select>
          <select onChange={(event) => applyFontSize(event.target.value)} defaultValue="12" className="h-[29px] rounded border-0 bg-transparent px-1 text-[12px] leading-none outline-none hover:bg-aq-panel">
            <option value="8">8</option>
            <option value="10">10</option>
            <option value="11">11</option>
            <option value="12">12</option>
            <option value="14">14</option>
            <option value="16">16</option>
            <option value="18">18</option>
            <option value="24">24</option>
            <option value="36">36</option>
          </select>
          <IconButton icon={<Bold size={13} />} label="Bold" active={activeMarks.bold} onClick={() => command('bold')} className="h-7 w-7" />
          <IconButton icon={<Italic size={13} />} label="Italic" active={activeMarks.italic} onClick={() => command('italic')} className="h-7 w-7" />
          <IconButton icon={<Underline size={13} />} label="Underline" active={activeMarks.underline} onClick={() => command('underline')} className="h-7 w-7" />
          <IconButton icon={<Strikethrough size={13} />} label="Strike" active={activeMarks.strike} onClick={() => command('strikeThrough')} className="h-7 w-7" />
          <input type="color" defaultValue="#000000" title="Metin rengi" onChange={(event) => command('foreColor', event.target.value)} className="h-7 w-7 rounded border border-aq-line bg-white p-0.5" />
          <input type="color" defaultValue="#ffff00" title="Vurgu rengi" onChange={(event) => command('hiliteColor', event.target.value)} className="h-7 w-7 rounded border border-aq-line bg-white p-0.5" />
        </ToolbarGroup>

        <ToolbarGroup label="Başlık">
          <ToolbarButton active={activeMarks.paragraph} onClick={() => command('formatBlock', 'p')}>¶</ToolbarButton>
          {(['1', '2', '3', '4', '5'] as const).map((level) => (
            <ToolbarButton key={level} active={activeMarks[`h${level}`]} onClick={() => command('formatBlock', `h${level}`)}>H{level}</ToolbarButton>
          ))}
          <ToolbarButton label="Blok alıntı" active={activeMarks.quote} onClick={() => action('insBlkQ')}>❝</ToolbarButton>
        </ToolbarGroup>

        <ToolbarGroup label="Paragraf">
          <select
            defaultValue=""
            onChange={(event) => selectAction(event, (value) => command('setParagraphStyle', value))}
            className="h-[29px] w-20 rounded border-0 bg-transparent px-1 text-[12px] leading-none outline-none hover:bg-aq-panel"
          >
            <option value="">Normal</option>
            <option value="normal">Normal</option>
            <option value="heading1">Başlık 1</option>
            <option value="heading2">Başlık 2</option>
            <option value="heading3">Başlık 3</option>
            <option value="heading4">Başlık 4</option>
            <option value="heading5">Başlık 5</option>
            <option value="quote">Alıntı</option>
            <option value="abstract">Özet</option>
            <option value="keywords">Anahtar Kelime</option>
            <option value="referenceEntry">Kaynakça Satırı</option>
            <option value="tableFigureLabel">Tablo/Şekil Etiketi</option>
            <option value="tableFigureTitle">Tablo/Şekil Başlığı</option>
          </select>
          <select onChange={(event) => editorAction('setLineSpacing', event.target.value)} defaultValue="2" className="h-[29px] w-14 rounded border-0 bg-transparent px-1 text-[12px] leading-none outline-none hover:bg-aq-panel">
            <option value="1">1.0</option>
            <option value="1.5">1.5</option>
            <option value="2">2.0</option>
            <option value="2.5">2.5</option>
            <option value="3">3.0</option>
          </select>
          <ToolbarButton label="Sola hizala" active={activeMarks.alignLeft} onClick={() => command('justifyLeft')}><AlignLeft size={13} /></ToolbarButton>
          <ToolbarButton label="Ortala" active={activeMarks.alignCenter} onClick={() => command('justifyCenter')}><AlignCenter size={13} /></ToolbarButton>
          <ToolbarButton label="Sağa hizala" active={activeMarks.alignRight} onClick={() => command('justifyRight')}><AlignRight size={13} /></ToolbarButton>
          <ToolbarButton label="İki yana yasla" active={activeMarks.alignJustify} onClick={() => command('justifyFull')}><AlignJustify size={13} /></ToolbarButton>
        </ToolbarGroup>
        </div>

        <div className="flex h-[31px] w-full items-center overflow-hidden">
        <ToolbarGroup label="Liste">
          <ToolbarButton label="Madde listesi" active={activeMarks.bulletList} onClick={() => command('insertUnorderedList')}><List size={13} /></ToolbarButton>
          <select
            defaultValue=""
            title="Numaralandırma stili"
            onChange={(event) => selectAction(event, (value) => command('setOrderedListStyle', value))}
            className="h-[29px] w-9 rounded border-0 bg-transparent px-0.5 text-[10px] leading-none outline-none hover:bg-aq-panel"
          >
            <option value="">1.</option>
            <option value="decimal">1.</option>
            <option value="lower-alpha">a.</option>
            <option value="upper-alpha">A.</option>
            <option value="lower-roman">i.</option>
            <option value="upper-roman">I.</option>
          </select>
          <select
            defaultValue=""
            title="Çok düzeyli liste"
            onChange={(event) => selectAction(event, (value) => command('applyMultiLevelList', value))}
            className="h-[29px] w-8 rounded border-0 bg-transparent px-0.5 text-[10px] leading-none outline-none hover:bg-aq-panel"
          >
            <option value="">☰</option>
            <option value="number">1.1</option>
            <option value="bullet">•</option>
          </select>
        </ToolbarGroup>

        <ToolbarGroup label="Girinti">
          <IconButton icon={<Indent size={13} />} label="Girinti artır" onClick={() => command('indent')} className="h-7 w-7" />
          <IconButton icon={<Outdent size={13} />} label="Girinti azalt" onClick={() => command('outdent')} className="h-7 w-7" />
        </ToolbarGroup>

        <ToolbarGroup label="Ekle">
          <ToolbarButton onClick={insertCitation}><Quote size={15} /> Atıf</ToolbarButton>
          <ToolbarButton label="Tablo ekle" onClick={openTableWizard}><Table2 size={14} /> Tablo</ToolbarButton>
          <ToolbarButton label="Görsel ekle" onClick={insertImage}><ImageIcon size={15} /> Görsel</ToolbarButton>
          <select
            defaultValue=""
            onChange={(event) => selectAction(event, (value) => {
              if (value === 'figure') action('insFig');
              else if (value === 'plainCitationLinking') openPlainCitationLinking();
              else if (value === 'footnote') moduleAction('AQFootnotes', 'insertFootnote', 'footnote');
              else if (value === 'endnote') moduleAction('AQFootnotes', 'insertFootnote', 'endnote');
              else if (value === 'crossref') {
                if (onOpenFeatureModal) {
                  onOpenFeatureModal('crossRef');
                } else {
                  moduleAction('AQFootnotes', 'showCrossRefDialog');
                }
              }
              else if (value === 'wordImport') importWord();
              else if (value === 'insCover') openCoverDialog();
              else if (value === 'insAbstract') openAbstractDialog();
              else if (value === 'insAppendix') insertAppendix();
              else if (value.startsWith('cmd:')) command(value.slice(4));
              else action(value);
            })}
            className="h-[29px] w-20 rounded border-0 bg-transparent px-1 text-[12px] leading-none outline-none hover:bg-aq-panel"
            title="Diğer ekle"
          >
            <option value="">Diğer</option>
            <option value="plainCitationLinking">Düz atıfları bağla</option>
            <option value="figure">Şekil</option>
            <option value="insBlkQ">Blok alıntı</option>
            <option value="insCover">Kapak</option>
            <option value="insAbstract">Özet</option>
            <option value="insAppendix">Ek</option>
            <option value="wordImport">Word İçe Aktar</option>
            <option value="footnote">Dipnot</option>
            <option value="endnote">Sonnot</option>
            <option value="crossref">Çapraz Referans</option>
            <option value="cmd:insertPageBreak">Sayfa sonu</option>
          </select>
        </ToolbarGroup>

        <ToolbarGroup label="Medya & Not">
          <ToolbarButton label="Kenar notu ekle" onClick={marginNoteAction}>+ Not</ToolbarButton>
          <IconButton icon={<Eye size={13} />} label="Kenar notlarını göster/gizle" onClick={() => moduleAction('AQMarginNotes', 'toggleMnVisible')} className="h-7 w-7" />
        </ToolbarGroup>

        <ToolbarGroup label="Dönüşüm">
          <ToolbarButton active={activeMarks.superscript} onClick={() => command('superscript')}>X²</ToolbarButton>
          <ToolbarButton active={activeMarks.subscript} onClick={() => command('subscript')}>X₂</ToolbarButton>
          <ToolbarButton label="Tümünü büyük harf" onClick={() => transformSelection('upper')}>AA</ToolbarButton>
          <ToolbarButton label="Kelime başlarını büyüt" onClick={() => transformSelection('title')}>Aa</ToolbarButton>
          <ToolbarButton label="Tümünü küçük harf" onClick={() => transformSelection('lower')}>aa</ToolbarButton>
        </ToolbarGroup>
        </div>
      </div>
      {replaceOpen ? (
        <div className="modal-bg show" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setReplaceOpen(false);
        }}>
          <div className="modal aq-legacy-modal-sm" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mt">Bul ve Değiştir</div>
            <div className="wr">
              <div className="wf">
                <label>Bul</label>
                <input className="minp" value={findQuery} onChange={(event) => handleFindInput(event.target.value)} autoFocus />
              </div>
            </div>
            <div className="wr">
              <div className="wf">
                <label>Değiştir</label>
                <input className="minp" value={replaceText} onChange={(event) => setReplaceText(event.target.value)} />
              </div>
            </div>
            <div className="mb">
              <button className="mbtn s" type="button" onClick={() => setReplaceOpen(false)}>Kapat</button>
              <button className="mbtn s" type="button" onClick={() => runReplace(false)}>Değiştir</button>
              <button className="mbtn p" type="button" onClick={() => runReplace(true)}>Tümünü</button>
            </div>
          </div>
        </div>
      ) : null}
      {coverOpen ? (
        <div className="modal-bg show" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setCoverOpen(false);
        }}>
          <div className="modal aq-legacy-modal-sm" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mt">APA 7 Kapak Sayfası</div>
            <div className="text-sm text-aq-muted">
              Kapak ilk sayfaya, içindekilerden önce yerleştirilir.
            </div>
            <div className="wr">
              <div className="wf">
                <label>Makale Başlığı *</label>
                <input
                  className="minp"
                  value={coverTitle}
                  onChange={(event) => setCoverTitle(event.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="wr">
              <div className="wf">
                <label>Yazar</label>
                <input className="minp" value={coverAuthor} onChange={(event) => setCoverAuthor(event.target.value)} />
              </div>
            </div>
            <div className="wr">
              <div className="wf">
                <label>Kurum</label>
                <input className="minp" value={coverInstitution} onChange={(event) => setCoverInstitution(event.target.value)} />
              </div>
            </div>
            <div className="wr">
              <div className="wf">
                <label>Ders / Program</label>
                <input className="minp" value={coverCourse} onChange={(event) => setCoverCourse(event.target.value)} />
              </div>
            </div>
            <div className="wr">
              <div className="wf">
                <label>Danışman / Öğretim Üyesi</label>
                <input className="minp" value={coverProfessor} onChange={(event) => setCoverProfessor(event.target.value)} />
              </div>
            </div>
            <div className="mb">
              <button className="mbtn s" type="button" onClick={() => setCoverOpen(false)}>İptal</button>
              <button className="mbtn p" type="button" onClick={insertCoverPage}>Kapak Ekle</button>
            </div>
          </div>
        </div>
      ) : null}
      {abstractOpen ? (
        <div className="modal-bg show" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setAbstractOpen(false);
        }}>
          <div className="modal w-[min(760px,calc(100vw-56px))] max-w-none" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mt">APA 7 Öz / Abstract</div>
            <div className="text-sm text-aq-muted">
              Abstract sayfası kapak ve içindekilerden sonra, ana metinden önce yerleştirilir.
            </div>
            <div className="wr">
              <div className="wf">
                <label>Öz metni *</label>
                <textarea
                  className="minp min-h-40 resize-y"
                  value={abstractText}
                  onChange={(event) => setAbstractText(event.target.value)}
                  placeholder="150-250 kelimelik özet metni..."
                  autoFocus
                />
              </div>
            </div>
            <div className="wr">
              <div className="wf">
                <label>Anahtar Kelimeler</label>
                <input
                  className="minp"
                  value={abstractKeywords}
                  onChange={(event) => setAbstractKeywords(event.target.value)}
                  placeholder="anahtar kelime 1, anahtar kelime 2, anahtar kelime 3"
                />
              </div>
            </div>
            <div className="mt-5 border-t border-aq-line pt-4">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-aq-muted">Gerekirse İngilizce Abstract</div>
            </div>
            <div className="wr">
              <div className="wf">
                <label>Abstract text</label>
                <textarea
                  className="minp min-h-32 resize-y"
                  value={abstractEnglishText}
                  onChange={(event) => setAbstractEnglishText(event.target.value)}
                  placeholder="Optional English abstract..."
                />
              </div>
            </div>
            <div className="wr">
              <div className="wf">
                <label>Keywords</label>
                <input
                  className="minp"
                  value={abstractEnglishKeywords}
                  onChange={(event) => setAbstractEnglishKeywords(event.target.value)}
                  placeholder="keyword one, keyword two, keyword three"
                />
              </div>
            </div>
            <div className="mb">
              <button className="mbtn s" type="button" onClick={() => setAbstractOpen(false)}>İptal</button>
              <button className="mbtn p" type="button" onClick={insertAbstractPage}>Öz Ekle</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
