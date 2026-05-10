# React Feature UI Map

Bu harita eski AcademiQ Research UI/event-binding yuzeylerinin yeni React/Tailwind shell icindeki karsiliklarini izler. Durum alani, ozelligin yeni UI'da gorunur ve mevcut legacy/electronAPI fonksiyonuna bagli olup olmadigini gosterir.

| Eski özellik | Eski UI/fonksiyon | Yeni React component | Yeni UI tipi | Durum | Test notu |
|---|---|---|---|---|---|
| Uygulama verisi yükleme | `electronAPI.loadData`, `AQStateSchema.hydrate` | `App` | startup/load state | Done | `npm test`, `gate:release` state tests |
| Veri kaydetme | `save`, `electronAPI.saveData` | `App.persistState` | status/toast | Done | `npm test` |
| Editor draft autosave | `saveEditorDraft`, legacy save bridge | `EditorHost`, `editor-adapter` | background/status | Done | `gate:editor` |
| Recovery/backup sinyali | `legacy-runtime` recovery banner helpers | `docs/react-feature-parity-checklist.md` | status/checklist | Partial | Legacy load korunur; React ozel banner yuzeyi ayrica genisletilebilir |
| Workspace listesi | `rDocTabs`, `switchWs` | `WorkspaceTabs` | top tab bar | Done | Typecheck/build |
| Workspace ekle | `promptAddWs`, `doAddWs` | `WorkspaceTabs`, command palette | button/command | Done | Typecheck/build |
| Workspace rename/delete | `renameWs`, `delWs`, `showWsMenu` | `WorkspaceTabs` | buttons/confirm | Done | Typecheck/build |
| Document tabs | `rDocTabs`, `switchDoc` | `DocumentTabs` | tab bar | Done | `doc-tabs-state` tests |
| Document ekle/rename/delete | `createDoc`, `renameDoc`, `deleteDoc` | `DocumentTabs` plus create command | buttons/confirm/command | Done | `doc-tabs-state` tests |
| Collection manager | `openCollectionManager` | `LeftSidebar`, command palette | sidebar/button/command | Done | Legacy function bridge |
| Collection filter | `toggleLabelFilterPanel`, collection state | `LeftSidebar` | sidebar/filter panel | Partial | Basic filter visible; legacy manager remains callable |
| Reference list | `rRefs`, `openRef` | `LeftSidebar`, `RightPanel` | sidebar/tab/card | Done | Typecheck/build |
| Reference search/lookup | `importExternalReferenceText`, `lookupBrowserCaptureTarget` | `LeftSidebar`, command palette | search/input/command | Done | Electron API typecheck |
| Reference add/edit/delete | `addRef`, `editRef`, `delRef` | `RightPanel`, `FeatureModals` | modal/confirm/card actions | Done | `npm test` reference tests |
| Duplicate review | `openDuplicateReview` | `RightPanel Details`, command palette | button/command | Done | Legacy function bridge |
| Metadata health | `openMetadataHealthCenter` | `RightPanel Details`, command palette | button/command | Done | Legacy function bridge |
| Related papers | `toggleRelatedPanel`, `web-related-papers` | command palette | command/panel | Done | `web-related-papers` tests |
| DOI/ISBN normalization | `state-schema`, `reference-parse` | existing state/legacy import flows | import/modal | Done | `npm test` |
| RIS/BibTeX import | `importBib`, `bibinp` | `LegacyCompatibilityHost`, `FeatureModals` | hidden file input/import modal/command | Done | Typecheck/build |
| Zotero import | `importZotero`, `zoteroinp` | `LegacyCompatibilityHost`, `FeatureModals` | hidden file input/import modal | Done | Typecheck/build |
| External DOI/URL/ISBN import | `openExternalReferenceImportModal` | `FeatureModals`, command palette | modal/command | Done | Legacy function bridge |
| RIS export | `expRIS` | `FeatureModals`, command palette | export modal/command | Done | Legacy function bridge |
| BibTeX export | `expBIB` | `FeatureModals`, command palette | export modal/command | Done | Legacy function bridge |
| CSL JSON export | `expCSLJSON` | `FeatureModals` | export modal | Done | Legacy function bridge |
| Library export | `expLib` | `FeatureModals` | export modal | Done | Legacy function bridge |
| Notes export | `expNotes` | `FeatureModals` | export modal | Done | Legacy function bridge |
| Citation insert | `doTrigRef`, `openTrig`, `insertCitationIntoEditor` | `TopToolbar`, `RightPanel`, command palette | toolbar/card action/command | Done | `gate:editor` citation tests |
| Citation style dropdown | `setCitationStyle`, `AQCitationStyles` | command palette, legacy bridge | command/dropdown bridge | Partial | Style commands callable; compact top dropdown can be expanded further |
| Bibliography insert/update | `insRefs`, `syncReferenceViews` | `TopToolbar`, command palette | toolbar/command | Done | bibliography tests |
| Manual bibliography reset/refresh | `resetBibliographyManual`, `refreshBibliographyManual` | command palette | command | Done | bibliography tests |
| Editor format commands | `ec`, `AQTipTapWordCommands.applyCommand` | `TopToolbar` | toolbar buttons/selects | Done | `gate:editor` toolbar tests |
| Editor insert table/figure/image | `openTableWizard`, `insFig`, `insImage` | `TopToolbar`, import modal | toolbar/import modal | Done | `npm test` media/table tests |
| Footnote/endnote/cross-ref | `AQFootnotes` methods | command palette | command | Done | Legacy module bridge |
| Margin notes | `AQMarginNotes` methods | command palette | command | Done | Legacy module bridge |
| Track changes | `toggleTrackChangesMode`, accept/reject funcs | command palette | command | Done | `gate:editor` track tests |
| Find/search | `toggleFindBar`, `findNext`, `findPrev` | `TopToolbar`, command palette | toolbar/command | Done | `gate:editor` find tests |
| Page size/line spacing/zoom | `setPageSize`, `setLineSpacing`, `editorZoom` | `TopToolbar`, command palette | toolbar/command | Done | layout tests |
| PDF attach/import | `openPDFDialog`, `savePDF`, `lfinp`, `hPDFs` | `RightPanel PDF`, `LegacyCompatibilityHost` | button/file input/panel | Done | build/typecheck |
| PDF open/viewer | `togglePDF`, `openRef`, `AQPdfViewer.toggle` | `RightPanel PDF`, compatibility host | panel/command | Done | `npm test` PDF shortcut tests |
| PDF delete/show/download | `deletePDF`, `showPdfInExplorer`, `downloadPDFfromURL` | `RightPanel PDF`, reference card actions | buttons | Done | Electron API typecheck |
| PDF sync all | `pdfSyncAll` | `RightPanel PDF` | button | Done | Electron API typecheck |
| PDF page navigation | `pPrev`, `pNext`, `pdfpg` | `LegacyCompatibilityHost`, `RightPanel PDF` | viewer toolbar/panel actions | Done | `npm test` shortcut tests |
| PDF zoom/fit | `pZI`, `pZO`, `pZFit` | `LegacyCompatibilityHost`, `RightPanel PDF` | viewer toolbar/panel actions | Done | `npm test` shortcut tests |
| PDF search/thumbnails/outline | `togglePdfSearch`, `toggleThumbs`, `toggleOutline` | `LegacyCompatibilityHost`, `RightPanel PDF` | viewer toolbar/panel actions | Done | Legacy DOM restored |
| PDF annotation list | `togglePdfAnnotations`, `pdfannots` | `LegacyCompatibilityHost`, `RightPanel PDF` | annotation side panel | Done | annotation tests |
| PDF highlight/annotation mode | `doHL`, `toggleAnnotMode`, `hlbar` | `LegacyCompatibilityHost`, `RightPanel PDF` | toolbar/popover/color buttons | Done | annotation tests |
| PDF drawing/region capture | `toggleDrawMode`, `clearPdfDrawingPage`, `togglePdfRegionCaptureMode` | `LegacyCompatibilityHost`, `RightPanel PDF` | viewer toolbar/panel actions | Done | Legacy DOM restored |
| Annotated PDF export | `exportAnnotatedPdfNative` | `FeatureModals`, command palette | export modal/command | Done | Electron API typecheck |
| PDF verification | `pdfVerificationBadgeHTML`, `AQPDFVerification` | reference cards/details checklist | badge/detail bridge | Partial | Old data preserved; richer React popover can be expanded |
| OCR | `ocrAPI.recognize`, `runPdfOcrExtractionNow` | `RightPanel PDF`, command palette | button/command | Done | OCR API exposed |
| Word import | `wordToHtml`, `importWordFile`, `wordinp` | `FeatureModals`, `LegacyCompatibilityHost`, command palette | import modal/file input | Done | Word import tests |
| PDF/DOCX export | `exportPDF`, `exportDOCX` | `AppShell`, command palette | toolbar/command | Done | export tests/release gate |
| Export preview/options | `openExportPreview`, export preflight helpers | `FeatureModals` | export modal | Done | export gate |
| Notes list/add/delete | `AQNotes`, `rNotes` | `RightPanel Notes` | side tab/form/confirm | Done | note tests |
| Note type/tag | `notes-state`, `notes-module` | `RightPanel Notes` | select/input | Done | note tests |
| Annotation/highlight to note | `hlToNoteBtn`, `AQNotes` | `LegacyCompatibilityHost` | viewer toolbar/action | Done | Legacy DOM restored |
| Literature matrix view | `openLiteratureMatrix`, `AQLiteratureMatrix` | `RightPanel Matrix`, `FeatureModals` | tab/fullscreen modal/command | Done | matrix tests |
| Matrix cell edit | `literature-matrix-state` | `FeatureModals` | inline textarea modal | Done | matrix tests |
| Matrix auto-fill | `runWorkspaceAutoFill`, matrix inference | command/legacy matrix panel | command/panel | Partial | Legacy panel callable; React modal focuses edit |
| Browser capture status | `getBrowserCaptureStatus` | `FeatureModals` | settings modal/status JSON | Done | capture-agent tests |
| Browser capture setup/test/guide | preload browser capture APIs | `FeatureModals` | settings modal/buttons | Done | capture-agent tests |
| Incoming capture | `onBrowserCaptureIncoming`, `ackBrowserCapturePayload` | `App` | listener/toast/status | Done | build/typecheck |
| Capture queue stats | `buildAgentStatus` | Browser capture modal JSON | settings/status | Done | capture-agent tests |
| Sync settings | `getSyncSettings`, `setSyncDir`, `clearSyncDir` | `FeatureModals` | settings modal | Done | Electron API typecheck |
| Document history | `getDocumentHistory`, `restoreDocumentHistorySnapshot` | `FeatureModals`, AppShell | modal/restore button | Done | history API typecheck |
| Updates/About | `getAppInfo`, `checkUpdate`, `setUpdateUrl`, `downloadUpdate`, `restartApp` | `FeatureModals`, command palette | settings/about/update buttons | Done | release gate syntax |
| Global command palette | `AQLeanUIShell` commands + React commands | `CommandPalette` | command palette | Done | command palette tests |
| Toast/status feedback | `setSL`, `setAutosave*` | `StatusBar`, `flashStatus` | status bar | Done | typecheck/build |
| Confirm destructive actions | `confirm` in legacy runtime | React handlers | confirm dialog/native confirm | Done | typecheck/build |
| Common UI primitives | legacy CSS/widgets | `components/ui/*` | modal/drawer/popover/buttons | Done | typecheck/build |
| Editor CSS separation | old editor styles | `styles/editor.css` | isolated CSS | Done | build |
| PDF overlay CSS separation | old PDF CSS | `styles/app.css` compatibility PDF block | viewer overlay CSS | Done | build |
| Print/export CSS separation | old print styles | `styles/print.css` | print/export CSS | Done | build |
