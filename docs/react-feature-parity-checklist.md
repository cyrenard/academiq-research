# React Feature Parity Checklist

Status dili:
- Done: React shell icinden gercek eski API/fonksiyon/preload akisi cagriliyor.
- Partial: Ana akisi bagli, fakat eski UI'daki alt seceneklerin bir kismi legacy modal/host uzerinden calisiyor veya daha fazla React yuzeyi istiyor.
- Missing: Mevcut kodda karsiligi arandi; React shell'de guvenli baglanti henuz yok.

| Feature | Old function/API/state/source file | New React component | UI surface | Status | Test note | Regression risk |
| --- | --- | --- | --- | --- | --- | --- |
| App data load | `electronAPI.loadData`, `src/main-process-storage.js`, `src/state-schema.js` | `App`, `app-state.ts` | startup/status-bar | Done | `typecheck`, `gate:release` | Medium: schema drift |
| App data save | `saveData`, `saveEditorDraft`, `legacy-runtime.js::save/syncSave` | `App`, `EditorHost` | autosave/status-bar | Done | `gate:editor` | Medium: legacy `S` sync |
| Renderer errors | preload error listeners, `renderer-errors.log` | `ErrorBoundary`, preload | modal/error boundary | Done | `typecheck` | Low |
| Workspace list/switch/create | `AQDocTabsState`, `switchWs`, `doAddWs` | `WorkspaceTabs`, `App` | tabs/command-palette | Done | `typecheck` | Medium |
| Workspace rename/delete | `rename/delWs`, `AQDocTabsState.deleteWorkspaceWithDocState` | `WorkspaceTabs`, `App` | buttons/confirm | Done | `typecheck` | Medium |
| Document tabs | `AQDocTabsState`, `switchDoc`, `createDocState`, `deleteDocState` | `DocumentTabs`, `App` | tabs/create command | Done | `typecheck` | Medium |
| Document metadata fields | `state-schema.js`, `document-state.js` | `app-state.ts`, `FeatureModals` | document/settings commands | Partial | covered by state tests indirectly | Medium |
| Editor mount/destroy | `AQTipTapWordInit.init`, `AQEditorCore` | `EditorHost`, `editor-adapter.ts` | editor host | Done | `gate:editor` | High |
| Editor uncontrolled content | legacy editor state, `editor-adapter.ts` | `EditorHost` | adapter | Done | `gate:editor` | High |
| Editor toolbar formatting | `AQTipTapWordCommands.applyCommand`, `ec` | `TopToolbar`, `legacy-feature-adapter.ts` | toolbar/command-palette | Done | `gate:editor` | High |
| Editor headings/layout | `formatBlock`, `setPageSize`, `setParagraphSpacing`, `setLineSpacing` | `TopToolbar`, command palette | toolbar/selects | Done | `gate:editor` | Medium |
| Editor insert objects | `openTableWizard`, `insFig`, `insImage`, `insBlkQ`, `insCover`, `insAbstract`, `insAppendix` | `TopToolbar`, `LegacyCompatibilityHost`, command palette | toolbar/file-picker/command-palette | Done | `gate:editor` | Medium |
| Editor find/replace | `toggleFindBar`, `findNext`, `findPrev`, `replaceCurrent`, `replaceAll` | `TopToolbar`, command palette | toolbar/command-palette | Partial | `gate:editor` | Medium: old find modal host |
| Track changes | `toggleTrackChangesMode`, accept/reject/focus funcs | command palette | command-palette | Done | `gate:editor` | Medium |
| Footnotes/endnotes/cross-ref | `AQFootnotes.insertFootnote`, `showCrossRefDialog` | command palette | command-palette | Done | `gate:editor` | Medium |
| Margin notes | `AQMarginNotes.toggleMnMode`, `toggleMnVisible` | command palette | command-palette | Done | `gate:editor` | Medium |
| TOC/outline/captions | `insertTOC`, `removeTOC`, `openDocumentOutline`, `openCaptionManager` | `TopToolbar`, command palette | toolbar/command-palette | Done | `gate:editor` | Medium |
| Templates | `applyTemplate('tez'|'makale'|'rapor'|'literatur')` | command palette | command-palette | Done | `gate:editor` | Low |
| Reference list/search | workspace `lib`, `rLib`, `AQLibraryState` | `LeftSidebar`, `RightPanel` | sidebar/panel | Done | `typecheck` | Medium |
| Reference add DOI/URL | `addDOI`, `lookupBrowserCaptureTarget`, `AQReferenceParse` | `LeftSidebar`, `App` | search input | Partial | `typecheck` | Medium: enrichment depth |
| Reference edit/delete | `openRefMetadataModal`, `closeRefMetadataModal`, `dRefIn` | `FeatureModals`, `RightPanel` | modal/card actions | Done | `typecheck` | Medium |
| Reference context menu actions | `showLabelMenu`, inline lcard menu, `openCollectionManager` | `LeftSidebar`, `RightPanel`, command palette | card actions/command-palette | Partial | `typecheck` | Medium |
| Duplicate detection | `openDuplicateReview`, `duplicate-detection.js` | `LeftSidebar`, command palette | filter tools/command-palette | Done | `gate:release` | Low |
| Metadata health | `openMetadataHealthCenter`, `metadata-health.js` | `LeftSidebar`, command palette | filter tools/command-palette | Done | `gate:release` | Low |
| Related papers | `toggleRelatedPanel`, `web-related-*` | `LeftSidebar`, command palette | filter tools/command-palette | Done | `gate:release` | Medium |
| Collections | `openCollectionManager`, `createCollectionFromInput`, collection state | `LeftSidebar`, command palette | sidebar/tools | Partial | `typecheck` | Medium: full inline assignment UI |
| RIS/BibTeX import | `importBib`, `importExternalReferenceFile/Text/Doi`, `AQReferenceParse` | `LegacyCompatibilityHost`, command palette | file-picker/command-palette | Done | `gate:release` | Medium |
| Zotero import | `importZotero`, `zotero-integration.js` | `LegacyCompatibilityHost`, command palette | file-picker/command-palette | Done | `gate:release` | Medium |
| RIS/Bib/CSL export | `expBIB`, `expRIS`, `expCSLJSON`, `bibliography-export.js` | command palette | command-palette | Done | `gate:release` | Low |
| Citation insert | `AQCitationRuntime`, `doTrigRef`, `insertCitation` | `TopToolbar`, `RightPanel`, command palette, adapter | toolbar/card/command-palette | Done | `gate:editor` | High |
| Citation styles | `setCitationStyle`, `citation-styles.js` | command palette, adapter | command-palette | Done | `gate:release` | Medium |
| Bibliography insert/update/reset | `insRefs`, `refreshBibliographyManual`, `resetBibliographyManual` | `TopToolbar`, command palette | toolbar/command-palette | Done | `gate:editor` | High |
| Notes list/add/delete | `AQNotesState`, `AQNotes`, `saveNote`, `dNote` | `RightPanel`, command palette | right-panel | Done | `typecheck` | Medium |
| Note filters/notebooks | `setNoteFilterType/Usage/Tag/Ref`, `AQNotebookState` | `RightPanel`, command palette | panel/filter buttons | Partial | `typecheck` | Medium |
| Note to document/citation | `insCiteNote`, `AQNotes.insertNoteIntoEditor` | `RightPanel`, command palette | card actions | Done | `gate:editor` | Medium |
| Literature matrix view/edit | `AQLiteratureMatrixState`, `literature-matrix-view.js` | `FeatureModals`, command palette | modal/command-palette | Done | `gate:release` | Medium |
| Matrix auto-fill/inference | `inferAutoCellsFromReference`, `ensureRowForReference` | command palette/legacy bridge | command-palette | Partial | `literature-matrix-state` via gate | Medium |
| PDF attach | `openPDFDialog`, `savePDF`, `hPDFs` | `RightPanel`, `LegacyCompatibilityHost` | button/file-picker | Done | `typecheck` | High |
| PDF load/open/delete/show | `loadPDF`, `openRef`, `deletePDF`, `showPdfInExplorer` | `RightPanel`, `LegacyCompatibilityHost` | card actions/PDF panel | Done | `typecheck` | High |
| PDF download URL | `downloadPDF`, `downloadPDFfromURL`, `pdf-download-errors.js` | `RightPanel`, `FeatureModals` | card action/modal | Done | `gate:release` | Medium |
| PDF sync all | `pdfSyncAll`, storage sync | `RightPanel` | PDF tab button | Done | `gate:release` | Medium |
| PDF viewer host | `renderPDF`, `togglePDF`, `pdfjsLib`, `pdf-viewer-state.js` | `LegacyCompatibilityHost` | fixed panel | Done | `typecheck` | High |
| PDF navigation/search/zoom | `pPrev`, `pNext`, `pZI`, `pZO`, `pZFit`, `togglePdfSearch` | `LegacyCompatibilityHost`, `FeatureModals` | PDF toolbar/modal | Done | `typecheck` | Medium |
| PDF thumbnails/outline/related | `toggleThumbs`, `toggleOutline`, `togglePdfRelated` | `LegacyCompatibilityHost`, command palette | PDF toolbar/command-palette | Done | `typecheck` | Medium |
| PDF annotations | `addPdfAnnot`, `toggleAnnotMode`, `renderPdfAnnotationPanel`, `AQAnnotationState` | `LegacyCompatibilityHost`, `FeatureModals` | PDF toolbar/annotations side panel | Done | `pdf-annotation-export` via gate | High |
| PDF drawing/ink | `toggleDrawMode`, `setPdfDrawColor`, `setPdfDrawWidth`, `clearPdfDrawingPage` | `LegacyCompatibilityHost`, command palette | PDF toolbar/color/range | Done | `typecheck` | High |
| PDF highlights to notes | `doHL`, `setHLC`, `AQHighlightState`, `AQNotes` | `LegacyCompatibilityHost` | PDF highlight controls | Done | `gate:release` | High |
| Annotated PDF export | `exportAnnotatedPdfNative`, `AQPdfAnnotationExport` | `FeatureModals`, command palette | PDF tools modal | Done | `gate:release` | High |
| PDF verification badges/details | `AQPDFVerification`, `pdfVerification` refs | `RightPanel`, command palette | card/modal | Partial | `pdf-verification.test` via gate | Medium |
| OCR | `ocrAPI.recognize`, `runPdfOcr*`, `local-ocr.js` | `FeatureModals`, command palette | PDF tools modal | Done | `gate:release` | Medium |
| Word import | `importWordFile`, `wordToHtml`, `main-process-word-import.js` | `LegacyCompatibilityHost`, command palette | file-picker/command-palette | Done | `gate:release` | High |
| PDF/DOCX export | `exportPDF`, `exportDOCX`, `main-process-pdf-export.js`, `docx-export.js` | header, `App`, command palette | toolbar/command-palette | Done | `gate:release` | High |
| Export preview/options | `openExportPreview`, export modal legacy funcs | command palette | command-palette | Partial | `export-quality-gate` | Medium |
| Browser capture setup/status | preload browser capture APIs, `main-process-browser-capture.js` | `FeatureModals`, `App` listeners | settings modal/toasts | Done | `gate:release` | Medium |
| Browser capture incoming queue | `onBrowserCaptureIncoming`, `ackBrowserCapturePayload` | `App` | toast/auto-add reference | Done | `typecheck` | Medium |
| Browser capture prefs/actions | `updateBrowserCapturePrefs`, `runBrowserCaptureAction`, guide/install/test | `FeatureModals` | settings modal | Done | `typecheck` | Medium |
| Sync settings | `getSyncSettings`, `setSyncDir`, `clearSyncDir`, `AQSyncState` | `FeatureModals` | settings modal | Done | `gate:release` | Medium |
| Document history | `getDocumentHistory`, `restoreDocumentHistorySnapshot` | `FeatureModals` | history modal | Done | `gate:release` | Medium |
| Updates/About | `getAppInfo`, `checkUpdate`, `setUpdateUrl`, `downloadUpdate`, `restartApp` | `FeatureModals` | settings/about/update modal | Done | `gate:release` | Medium |
| Theme/focus | `toggleTheme`, `toggleZenMode` | header/command palette | button/command-palette | Done | `typecheck` | Low |
| Command palette | `AQLeanUIShell.registerCommand`, legacy shortcuts | `CommandPalette`, `legacy-feature-adapter.ts` | Ctrl+K/Ctrl+Shift+P | Done | `typecheck` | Low |
| Compatibility DOM inputs | `lfinp`, `bibinp`, `zoteroinp`, `wordinp`, `imginp` | `LegacyCompatibilityHost` | hidden file pickers | Done | `typecheck` | High |
| Compatibility PDF DOM | `pdfpanel`, `pdfscroll`, `pdfannots`, `pdfsearchbar`, toolbar ids | `LegacyCompatibilityHost` | PDF panel | Done | `typecheck` | High |
| Common UI primitives | old modal/dropdown/toast patterns | `ui/primitives.tsx`, `OverlayPrimitives.tsx`, `Modal`, `IconButton` | reusable components | Done | `typecheck` | Low |
| Tailwind/editor/export CSS split | app/editor/print styles | `styles/app.css`, `editor.css`, `print.css` | CSS layers | Done | `build:renderer` | Medium |

## Known Technical Notes

- Legacy editor and PDF engines are not rewritten. React creates shell surfaces and compatibility hosts, then calls the existing APIs.
- Several legacy actions still open or mutate legacy DOM internally. Where that DOM was required, React now renders compatibility ids instead of changing IPC/security settings.
- No renderer-side Node APIs were introduced; file/PDF/Word/update/capture flows continue through preload.
