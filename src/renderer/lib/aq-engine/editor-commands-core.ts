/**
 * aq-engine editor commands & selection tracking — faithful 1:1 TS ports of
 * the legacy `legacy-runtime.js` functions (captureEditorListStyleSelection,
 * restoreEditorListStyleSelection, runEditorMutationEffects, toggleTrackChangesMode,
 * isTrackChangesEnabled, setTrackChangesMode).
 *
 * Side-effectful or environment dependencies are cleanly injected (via a `deps`
 * parameter) or read from legacy globals/DOM when not provided.
 *
 * Phase 4 strangler port: do not wire to live editor calling sites directly yet.
 */

// Module-level state mirrors the legacy runtime's global selection variables.
let editorSavedPmSelection: any = null;
let editorSavedRange: Range | null = null;

export interface SelectionDeps {
  getSelection?: () => Selection | null;
  getElementById?: (id: string) => HTMLElement | null;
  AQEditorCore?: {
    captureSelection?: () => any;
    restoreSelection?: (sel: any, options?: any) => boolean;
  };
  editor?: any;
}

/** Legacy `saveEditorSelection`. */
export function saveEditorSelection(deps?: SelectionDeps): void {
  const getSel = deps?.getSelection || (() => typeof window !== 'undefined' ? window.getSelection() : null);
  const getEl = deps?.getElementById || ((id) => typeof document !== 'undefined' ? document.getElementById(id) : null);
  const sel = getSel();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    const ed = getEl('apaed');
    if (ed && ed.contains(range.commonAncestorContainer)) {
      editorSavedRange = range.cloneRange();
    }
  }
}

/** Legacy `restoreEditorSelection`. */
export function restoreEditorSelection(deps?: SelectionDeps): boolean {
  if (editorSavedRange) {
    try {
      const getSel = deps?.getSelection || (() => typeof window !== 'undefined' ? window.getSelection() : null);
      const sel = getSel();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(editorSavedRange);
        editorSavedRange = null;
        return true;
      }
    } catch {
      editorSavedRange = null;
      return false;
    }
  }
  return false;
}

/** Legacy `captureEditorListStyleSelection`. */
export function captureEditorListStyleSelection(deps?: SelectionDeps): boolean {
  editorSavedPmSelection = null;
  const activeEditor = deps?.editor || (typeof window !== 'undefined' ? (window as any).editor : null);
  
  if (activeEditor && activeEditor._aqEngine && typeof activeEditor._captureSelection === 'function') {
    try {
      const aqRange = activeEditor._captureSelection();
      if (aqRange) {
        editorSavedPmSelection = {
          type: 'aq',
          editor: activeEditor,
          range: aqRange
        };
        saveEditorSelection(deps);
        return true;
      }
    } catch {}
  }
  
  const editorCore = deps?.AQEditorCore || (typeof window !== 'undefined' ? (window as any).AQEditorCore : null);
  if (editorCore && typeof editorCore.captureSelection === 'function') {
    try {
      editorSavedPmSelection = editorCore.captureSelection() || null;
    } catch {}
  }
  
  if (activeEditor && activeEditor.state && activeEditor.state.selection) {
    try {
      editorSavedPmSelection = {
        type: 'pm',
        from: activeEditor.state.selection.from,
        to: activeEditor.state.selection.to
      };
    } catch {}
  }
  
  saveEditorSelection(deps);
  return true;
}

/** Legacy `restoreEditorListStyleSelection`. */
export function restoreEditorListStyleSelection(deps?: SelectionDeps): boolean {
  if (editorSavedPmSelection && editorSavedPmSelection.type === 'aq') {
    try {
      const aqEditor = editorSavedPmSelection.editor || deps?.editor || (typeof window !== 'undefined' ? (window as any).editor : null);
      if (aqEditor && typeof aqEditor._restoreSelection === 'function' && aqEditor._restoreSelection(editorSavedPmSelection.range)) {
        editorSavedPmSelection = null;
        return true;
      }
    } catch {
      editorSavedPmSelection = null;
    }
  }
  
  const editorCore = deps?.AQEditorCore || (typeof window !== 'undefined' ? (window as any).AQEditorCore : null);
  if (editorSavedPmSelection && editorCore && typeof editorCore.restoreSelection === 'function') {
    try {
      if (editorCore.restoreSelection(editorSavedPmSelection, { focusAtEnd: false })) return true;
    } catch {}
  }
  
  return restoreEditorSelection(deps);
}

export function getCapturedPmSelection(): any {
  return editorSavedPmSelection;
}

export function setCapturedPmSelection(val: any): void {
  editorSavedPmSelection = val;
}

export function getCapturedRange(): Range | null {
  return editorSavedRange;
}

export function setCapturedRange(val: Range | null): void {
  editorSavedRange = val;
}

export interface EditorMutationDeps {
  AQTipTapWordBridge?: {
    runEditorMutationEffects?: (opts: any) => boolean;
  };
  AQTipTapWordContent?: any;
  AQEditorRuntime?: {
    runContentApplyEffects?: (opts: any) => void;
  };
  normalizeCitationSpans?: (target?: any) => void;
  updatePageHeight?: () => void;
  uSt?: () => void;
  save?: () => void;
  autoUpdateTOC?: () => void;
  scheduleRefSectionSync?: () => void;
  checkTrig?: () => void;
  scheduleTrackReviewBarUpdate?: () => void;
}

/** Legacy `runEditorMutationEffects` — faithful 1:1. */
export function runEditorMutationEffects(opts: any, deps?: EditorMutationDeps): boolean {
  const options = opts || {};
  const win = typeof window !== 'undefined' ? (window as any) : {};
  const bridge = deps?.AQTipTapWordBridge || win.AQTipTapWordBridge;
  
  if (bridge && typeof bridge.runEditorMutationEffects === 'function') {
    const success = bridge.runEditorMutationEffects({
      contentApi: deps?.AQTipTapWordContent || win.AQTipTapWordContent || null,
      runtimeApi: deps?.AQEditorRuntime || win.AQEditorRuntime || null,
      target: options.target || null,
      normalize: options.normalize !== false,
      layout: options.layout !== false,
      syncChrome: !!options.syncChrome,
      syncTOC: !!options.syncTOC,
      syncRefs: !!options.syncRefs,
      refreshTrigger: !!options.refreshTrigger,
      onApplied: typeof options.onApplied === 'function' ? options.onApplied : null,
      afterLayout: typeof options.afterLayout === 'function' ? options.afterLayout : null,
      normalizeCitationSpans: deps?.normalizeCitationSpans || win.normalizeCitationSpans,
      updatePageHeight: deps?.updatePageHeight || win.updatePageHeight,
      syncStatus: deps?.uSt || win.uSt || null,
      save: deps?.save || win.save || null,
      syncTOCNow: deps?.autoUpdateTOC || win.autoUpdateTOC || null,
      syncRefsNow: deps?.scheduleRefSectionSync || win.scheduleRefSectionSync || null,
      refreshTriggerNow: deps?.checkTrig || win.checkTrig ? () => {
        const fn = deps?.checkTrig || win.checkTrig;
        setTimeout(fn, 0);
      } : null
    });
    if (success) {
      const trackBarUpdate = deps?.scheduleTrackReviewBarUpdate || win.scheduleTrackReviewBarUpdate;
      if (typeof trackBarUpdate === 'function') trackBarUpdate();
      return true;
    }
  }

  const editorRuntime = deps?.AQEditorRuntime || win.AQEditorRuntime;
  if (editorRuntime && typeof editorRuntime.runContentApplyEffects === 'function') {
    editorRuntime.runContentApplyEffects({
      target: options.target || null,
      normalize: !!options.normalize,
      layout: options.layout !== false,
      syncChrome: !!options.syncChrome,
      syncTOC: !!options.syncTOC,
      syncRefs: !!options.syncRefs,
      refreshTrigger: !!options.refreshTrigger,
      onApplied: typeof options.onApplied === 'function' ? options.onApplied : null,
      afterLayout: typeof options.afterLayout === 'function' ? options.afterLayout : null
    });
    const trackBarUpdate = deps?.scheduleTrackReviewBarUpdate || win.scheduleTrackReviewBarUpdate;
    if (typeof trackBarUpdate === 'function') trackBarUpdate();
    return true;
  }

  const normalizeCitationSpans = deps?.normalizeCitationSpans || win.normalizeCitationSpans;
  if (options.normalize && typeof normalizeCitationSpans === 'function') {
    normalizeCitationSpans(options.target);
  }

  const updatePageHeight = deps?.updatePageHeight || win.updatePageHeight;
  if (options.layout !== false && typeof updatePageHeight === 'function') {
    updatePageHeight();
  }

  if (options.syncChrome) {
    const uSt = deps?.uSt || win.uSt;
    if (typeof uSt === 'function') uSt();
    const save = deps?.save || win.save;
    if (typeof save === 'function') save();
  }

  const autoUpdateTOC = deps?.autoUpdateTOC || win.autoUpdateTOC;
  if (options.syncTOC && typeof autoUpdateTOC === 'function') {
    autoUpdateTOC();
  }

  const scheduleRefSectionSync = deps?.scheduleRefSectionSync || win.scheduleRefSectionSync;
  if (options.syncRefs && typeof scheduleRefSectionSync === 'function') {
    scheduleRefSectionSync();
  }

  const checkTrig = deps?.checkTrig || win.checkTrig;
  if (options.refreshTrigger && typeof checkTrig === 'function') {
    setTimeout(checkTrig, 0);
  }

  if (typeof options.onApplied === 'function') options.onApplied();
  if (typeof options.afterLayout === 'function') options.afterLayout();

  const trackBarUpdate = deps?.scheduleTrackReviewBarUpdate || win.scheduleTrackReviewBarUpdate;
  if (typeof trackBarUpdate === 'function') trackBarUpdate();
  
  return true;
}

export interface TrackChangesDeps {
  AQTipTapWordCommands?: {
    isTrackChangesEnabled?: () => boolean;
    setTrackChangesEnabled?: (enabled: boolean, opts: any) => boolean;
  };
  getCurrentDocRecord?: () => any | null;
  ensureDocAuxFields?: (doc: any) => any;
  save?: () => void;
  setSL?: (msg: string, tone?: string) => void;
  updateFmtState?: () => void;
  scheduleTrackReviewBarUpdate?: () => void;
  document?: any;
}

/** Legacy `isTrackChangesEnabled` — faithful 1:1. */
export function isTrackChangesEnabled(deps?: TrackChangesDeps): boolean {
  const win = typeof window !== 'undefined' ? (window as any) : {};
  const commands = deps?.AQTipTapWordCommands || win.AQTipTapWordCommands;
  try {
    if (commands && typeof commands.isTrackChangesEnabled === 'function') {
      return !!commands.isTrackChangesEnabled();
    }
  } catch {}
  return !!(win.__aqTrackChangesState && win.__aqTrackChangesState.enabled);
}

/** Legacy `setTrackChangesMode` — faithful 1:1. */
export function setTrackChangesMode(enabled: boolean, source?: any, deps?: TrackChangesDeps): boolean {
  const win = typeof window !== 'undefined' ? (window as any) : {};
  const options = (source && typeof source === 'object') ? source : { source };
  const sourceTag = options.source || 'runtime';
  const persistDoc = options.persistDoc !== false;
  const saveState = options.saveState !== false;
  const silent = !!options.silent;
  let next = !!enabled;

  const commands = deps?.AQTipTapWordCommands || win.AQTipTapWordCommands;
  try {
    if (commands && typeof commands.setTrackChangesEnabled === 'function') {
      next = !!commands.setTrackChangesEnabled(next, { source: sourceTag });
    } else {
      win.__aqTrackChangesState = win.__aqTrackChangesState || {};
      win.__aqTrackChangesState.enabled = next;
      const doc = deps?.document || (typeof document !== 'undefined' ? document : null);
      if (doc && doc.body && doc.body.classList) {
        doc.body.classList.toggle('aq-track-changes-on', next);
      }
    }
  } catch {}

  if (persistDoc) {
    const getCurrentDoc = deps?.getCurrentDocRecord || win.getCurrentDocRecord;
    const ensureDocAux = deps?.ensureDocAuxFields || win.ensureDocAuxFields;
    const save = deps?.save || win.save;
    
    if (typeof getCurrentDoc === 'function' && typeof ensureDocAux === 'function') {
      const currentDoc = ensureDocAux(getCurrentDoc());
      if (currentDoc && !!currentDoc.trackChangesEnabled !== next) {
        currentDoc.trackChangesEnabled = next;
        if (saveState && typeof save === 'function') {
          save();
        }
      }
    }
  }

  if (!silent) {
    const setSL = deps?.setSL || win.setSL;
    if (typeof setSL === 'function') {
      setSL(next ? 'İnceleme modu açık' : 'İnceleme modu kapalı', next ? 'warn' : 'ok');
      setTimeout(() => {
        setSL('', '');
      }, 1600);
    }
  }

  const updateFmt = deps?.updateFmtState || win.updateFmtState;
  if (typeof updateFmt === 'function') {
    try { updateFmt(); } catch {}
  }

  const trackBarUpdate = deps?.scheduleTrackReviewBarUpdate || win.scheduleTrackReviewBarUpdate;
  if (typeof trackBarUpdate === 'function') {
    trackBarUpdate();
  }

  return next;
}

/** Legacy `toggleTrackChangesMode` — faithful 1:1. */
export function toggleTrackChangesMode(deps?: TrackChangesDeps): boolean {
  return setTrackChangesMode(!isTrackChangesEnabled(deps), { source: 'shortcut' }, deps);
}
