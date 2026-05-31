export {};

/**
 * Type declarations for the legacy JS modules that attach themselves to
 * `window` (loaded as <script> tags before the React bundle). These types
 * document the surface React calls into via `callLegacy()` and `(window
 * as LegacyWindow).foo` casts.
 *
 * Goal: replace `(window as any)` access scattered through the React
 * renderer with `window as LegacyWindow` so TypeScript catches typos and
 * shows what's actually expected from the legacy runtime.
 *
 * This is intentionally `any`-loose at the value level — the legacy code
 * is dynamic, and our React code only depends on member *existence*, not
 * on the precise signatures. The win is: the symbol must exist, not be a
 * typo. For new code, prefer narrowly-typed wrappers.
 */
type LegacyAny = any;

declare global {
  /** State container the legacy runtime mutates and React reads from. */
  interface LegacyState {
    cur?: string;                  // active workspace id
    curDoc?: string;               // active document id
    curNb?: string;                // active notebook id
    cm?: string;                   // citation style key
    doc?: string;                  // active doc HTML (legacy mirror)
    wss?: Array<LegacyAny>;        // workspaces
    docs?: Array<LegacyAny>;       // documents in active workspace
    notes?: Array<LegacyAny>;      // notes (root list)
    notebooks?: Array<LegacyAny>;  // notebooks (root list)
    citationStyle?: string;        // newer key alongside `cm`
    literatureMatrix?: LegacyAny;
    [key: string]: LegacyAny;      // legacy code adds ad-hoc keys
  }

  /**
   * The subset of `window` properties contributed by legacy JS modules.
   * Augments lib.dom.d.ts's `Window` so `(window as LegacyWindow).foo`
   * doesn't bypass typechecks the way `(window as any)` does.
   */
  interface LegacyWindow extends Window {
    // --- Core state ---------------------------------------------------------
    S?: LegacyState;
    editor?: LegacyAny;                          // active editor instance (AQ Engine or TipTap)
    __aqEngineActive?: boolean;
    __aqDismissedDuplicateSignatures?: Record<string, Record<string, boolean>>;

    // --- Cross-layer sync hook ---------------------------------------------
    __aqReactSyncFromLegacy?: (state: LegacyState | unknown) => void;
    __aqSetEditorDoc?: (html: string, focusAtEnd?: boolean) => void;

    // --- Save / lifecycle ---------------------------------------------------
    save?: () => void;
    uSt?: () => void;
    updatePageHeight?: () => void;
    autoUpdateTOC?: () => void;
    checkTrig?: () => void;
    normalizeCitationSpans?: (root?: HTMLElement | null) => void;

    // --- Reference manager --------------------------------------------------
    rRefs?: () => LegacyAny[];
    getUsedRefs?: () => LegacyAny[];
    filterRefsForQuery?: (refs: LegacyAny[], query: string) => LegacyAny[];
    dedupeRefs?: (refs: LegacyAny[]) => LegacyAny[];
    sortLib?: (refs: LegacyAny[]) => LegacyAny[];
    formatRef?: (ref: LegacyAny, options?: Record<string, unknown>) => string;
    getCurrentCitationStyle?: () => string;
    getCurrentDocument?: () => LegacyAny | null;
    cLib?: (workspaceId?: string) => LegacyAny[];
    findRef?: (id: string, workspaceId?: string) => LegacyAny | null;
    refKey?: (ref: LegacyAny) => string;
    normalizeRefRecord?: (ref: LegacyAny) => LegacyAny;
    mergeRefFields?: (target: LegacyAny, source: LegacyAny) => LegacyAny;

    // --- Citation runtime ---------------------------------------------------
    getInlineCitationText?: (ref: LegacyAny) => string;
    visibleCitationText?: (refs: LegacyAny[]) => string;
    buildCitationHTML?: (refs: LegacyAny[]) => string;
    getNarrativeCitationText?: (ref: LegacyAny) => string;
    insertCitation?: (refId?: string) => unknown;

    // --- Bibliography -------------------------------------------------------
    updateRefSection?: (forceAuto?: boolean) => unknown;
    insRefs?: () => unknown;
    refreshBibliographyManual?: () => unknown;
    resetBibliographyManual?: () => unknown;
    openBibliographySection?: () => unknown;
    setCitationStyle?: (style: string) => void;

    // --- AQ Engine modules (registered by their respective scripts) ---------
    AQEngine?: LegacyAny;
    AQEngineDocument?: LegacyAny;
    AQEngineCompat?: LegacyAny;
    AQEditorCore?: {
      focus?: (toEnd?: boolean) => boolean;
      getContent?: () => string;
      setContent?: (html: string, focusAtEnd?: boolean) => boolean;
      insertHTML?: (html: string) => boolean;
    };
    AQTipTapWordInit?: { init: () => LegacyAny };
    AQTipTapWordTOC?: LegacyAny;
    AQTipTapWordFind?: LegacyAny;
    AQTipTapWordCitation?: LegacyAny;
    AQBibliographyState?: LegacyAny;
    AQCitationRuntime?: {
      init?: () => void;
      openFromSlash?: (query?: string, mode?: string) => void;
      refreshFromEditor?: () => void;
      insertSelection?: (refId?: string) => boolean;
      syncReferenceSection?: () => boolean;
    };
    AQCitationState?: LegacyAny;
    AQCitationStyles?: {
      normalizeStyleId?: (style: string) => string;
      visibleCitationText?: (refs: LegacyAny[], options?: Record<string, unknown>) => string;
      formatReference?: (ref: LegacyAny, options?: Record<string, unknown>) => string;
      sortReferences?: (refs: LegacyAny[], options?: Record<string, unknown>) => LegacyAny[];
    };
    AQReferenceManager?: LegacyAny;
    AQDocumentOutline?: LegacyAny;
    AQAcademicObjects?: LegacyAny;
    AQFootnotes?: LegacyAny;
    AQMarginNotes?: LegacyAny;
    AQWebRelatedPapers?: LegacyAny;
    AQLiteratureMatrixState?: LegacyAny;
    AQNotesState?: LegacyAny;
    AQHighlightState?: LegacyAny;
    AQAnnotationState?: LegacyAny;

    // --- Modal / UI ---------------------------------------------------------
    showM?: (id: string) => void;
    setDst?: (message: string, tone?: 'ok' | 'er') => void;
    openTrig?: (query?: string, mode?: 'inline' | 'footnote' | string) => void;
    doTrigRef?: () => boolean;

    // --- Editor selection plumbing -----------------------------------------
    captureEditorListStyleSelection?: () => void;
    restoreEditorListStyleSelection?: () => void;
    runEditorMutationEffects?: (opts?: {
      layout?: boolean;
      syncChrome?: boolean;
      syncTOC?: boolean;
      syncRefs?: boolean;
      refreshTrigger?: boolean;
    }) => void;
    applyFontSize?: (pt: string) => boolean;
    transformSelectedText?: (mode: 'upper' | 'title' | 'lower') => void;

    // --- Auxiliary pages ----------------------------------------------------
    syncAuxiliaryPages?: () => void;
    sanitizeAuxPageHTML?: (html: string) => string;
    fixTOCDots?: (root: HTMLElement) => void;
    buildAppendixHTML?: (index: number) => string;
    renumberAppendicesHTML?: (html: string) => string;
    updateAQEngineAppendices?: (editor: LegacyAny, html: string) => boolean;
    deleteAQEngineAppendix?: (editor: LegacyAny, appendixId: string, blockIndex?: number) => boolean;

    // --- Misc helpers -------------------------------------------------------
    iHTML?: (html: string) => void;
    insImage?: () => boolean;
    insBlkQ?: () => void;
    insFig?: () => void;
    insCover?: () => void;
    insAbstract?: () => void;
    insAppendix?: () => void;
    getActiveEditorInstance?: () => LegacyAny | null;
    togglePdfRegionCaptureMode?: () => boolean | void;

    // --- Indexer escape hatch for unlisted globals -------------------------
    [key: string]: LegacyAny;
  }

  /**
   * Convenience cast: lets components do `getLegacyWindow().S` instead
   * of `(window as any).S`.
   */
  function __unused_marker_to_keep_global_decls__(): void;
}
