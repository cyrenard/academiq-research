# Feature Placement Plan

Her eski davranis bu plana gore yeni shell'e yerlestirilecek. `Status` degerleri: `Bound`, `NeedsCleanup`, `NeedsBinding`, `UseLegacyHost`, `DisabledWithReason`.

| Legacy behavior | New shell location | Component to use | Existing function/API to bind | Status |
|---|---|---|---|---|
| App load/hydrate | App root | `App` effect | `electronAPI.loadData`, `hydrateAppState`, legacy `S` sync | Bound |
| App save/autosave | App root + editor adapter | `persistState`, adapter save bridge | `electronAPI.saveData`, `electronAPI.saveEditorDraft`, legacy `save()` wrapper | Bound |
| Recovery/backup state | Status/History surface | `StatusBar`, `FeatureModals history` | legacy recovery/session info, `getDocumentHistory` | NeedsBinding |
| Workspace switch/create/rename/delete | Workspace strip, not LeftSidebar content | `WorkspaceTabs` | `switchWorkspace`, `addWorkspace`, `renameWorkspace`, `deleteWorkspace`, legacy commit-before-switch principle | Bound |
| Document switch/create/rename/delete | Document strip | `DocumentTabs` | `switchDocument`, `addDocument`, `renameDocument`, `deleteDocument` | Bound |
| Basic editor formatting | Center toolbar | `TopToolbar`, `IconButton`, `Select` | `runEditorCommand`, `runEditorAction`, editor adapter | Bound |
| Advanced editor formatting | Center toolbar dropdown/popover | Existing `TopToolbar` + future dropdown | `setParagraphStyle`, color, line/list/page commands | NeedsBinding |
| Find/replace | Center toolbar | `TopToolbar` find button, popover/modal | `toggleFindBar`, `findExec`, `replaceCurrent/All` | Partial/NeedsBinding |
| Insert citation | Center toolbar + References cards | `TopToolbar`, ref card action, command palette | `doTrigRef`, `openTrig`, `AQCitationRuntime`, fallback adapter insert | Bound |
| Citation style | Center toolbar small select | `TopToolbar` select | `setCitationStyle`, adapter `setCitationStyle` | NeedsBinding |
| Bibliography insert/update/reset | Center toolbar dropdown | `DropdownMenu` or existing legacy quick menu | `insRefs`, `refreshBibliographyManual`, `resetBibliographyManual` | NeedsBinding |
| Reference list/select | LeftSidebar navigation and RightPanel References | `LeftSidebar` cards, `RightPanel` refs tab | React state + legacy state sync | Bound |
| DOI/URL/ISBN lookup | LeftSidebar search | `LeftSidebar` input | legacy `addDOI` or current `lookupBrowserCaptureTarget`/state helper | NeedsCleanup |
| Reference add/edit/delete | RightPanel References | reference detail modal | `updateReferenceInActiveWorkspace`, `removeReferenceFromActiveWorkspace` | Bound |
| Collections/labels | References tab filter/popover/modal | `RightPanel`/`LeftSidebar` filter, `Modal` | `openCollectionManager`, `toggleReferenceCollection`, label filter helpers | Partial/NeedsCleanup |
| Bib/RIS/Zotero import | TopToolbar import menu or References tab import action | `DropdownMenu`, file input via host | `importBib`, `importZotero`, hidden inputs | Partial/NeedsPlacement |
| Duplicate review | References tab action or reference quality menu | `Modal`/legacy modal host | `openDuplicateReview` | UseLegacyHost |
| Metadata health | References tab action or quality menu | `Modal`/legacy modal host | `openMetadataHealthCenter` | UseLegacyHost |
| Related papers | References detail drawer or PDF related panel | Drawer/legacy panel | `toggleRelatedPanel`, PDF related handlers | NeedsBinding |
| Notes list/create/delete | RightPanel Notes | `RightPanel` notes branch, future drawer | `addManualNote`, `deleteNote`, legacy `saveNote/dNote` where needed | Bound/NeedsCleanup |
| Notebook detail | RightPanel Notes | `Drawer` or legacy side panel host | notebook detail runtime | NeedsBinding |
| Note filters | RightPanel Notes | compact selects/search | `setNoteFilter*`, React filter state or legacy render | NeedsBinding |
| Insert note into document | RightPanel Notes card action | note card action/popover | `insCiteNote`, editor insert helpers, `markNoteInserted` | NeedsBinding |
| PDF attach/open | RightPanel PDF | PDF tab actions | `openPDFDialog/savePDF`, `hPDFs`, `openRef`, `togglePDF` | Bound |
| PDF delete/download/show/sync | RightPanel PDF | PDF tab actions | `deletePDF`, `downloadPDFfromURL`, `showPdfInExplorer`, `pdfSyncAll` | Bound |
| PDF viewer nav/search/sidebars | PDF viewer modal/drawer/legacy host | `LegacyCompatibilityHost` PDF DOM | `pPrev/pNext/pZI/pZO/togglePdfSearch/toggleThumbs/toggleOutline` | UseLegacyHost |
| PDF annotations/highlights | PDF viewer host | `LegacyCompatibilityHost` + legacy overlay | `doHL`, `toggleAnnotMode`, `toggleDrawMode`, annotation state | UseLegacyHost |
| OCR | RightPanel PDF or PDF viewer action | PDF tab action/popover | `ocrAPI.recognize`, legacy OCR functions if present | NeedsBinding |
| Annotated PDF export | TopToolbar export menu or PDF tab | `DropdownMenu` | `exportAnnotatedPdf`, `exportAnnotatedPdfNative` | NeedsBinding |
| Literature matrix | RightPanel Matrix + fullscreen legacy view | `RightPanel` matrix branch, legacy matrix view | `openLiteratureMatrix`, `toggleLiteratureMatrix`, `AQLiteratureMatrixState` | Bound/UseLegacyHost |
| Matrix cell edit/autofill | Fullscreen matrix surface | legacy matrix view preferred | `AQLiteratureMatrix` handlers | UseLegacyHost |
| Word import | TopToolbar import menu | dropdown + hidden input host | `importWordFile`, `wordToHtml` | NeedsBinding |
| Export preview/PDF/DOCX | Header export / TopToolbar export menu | `DropdownMenu`, `Modal` preview | `openExportPreview`, `expPDF`, `expDOC`, electronAPI export | Partial/NeedsCleanup |
| Bibliography/export formats | TopToolbar export menu | `DropdownMenu` | `expBIB`, `expRIS`, `expCSLJSON`, `expBibliography*`, `expNotes`, `expLib` | NeedsBinding |
| Settings sync/update/about | Settings modal | `FeatureModals settings` grouped Sync/Updates sections | `getSyncSettings`, `setSyncDir`, `clearSyncDir`, `getAppInfo`, update APIs | Bound |
| Browser capture setup/status | Settings modal Browser Capture surface | `FeatureModals browserCapture` grouped Setup/Preferences sections | browser capture preload APIs | Bound |
| Browser capture incoming review | Toast + review modal | `Toast`, `Modal` | `onBrowserCaptureIncoming`, `ackBrowserCapturePayload`, add ref helper | Partial/NeedsBinding |
| Document history restore | Document toolbar/history drawer | `FeatureModals history` or `Drawer` | `getDocumentHistory`, `restoreDocumentHistorySnapshot` | Bound/NeedsPlacement |
| Command palette | Global shortcut | `CommandPalette` | Only non-destructive bound handlers or real modal open | Bound |

## Cleanup Decisions Before Further Binding

| Current surface | Decision |
|---|---|
| `LeftSidebar` visible `PDF` button | Removed. PDF attach/open/download/delete stays in RightPanel PDF. |
| `LeftSidebar` `Bib/RIS` button | Removed from sidebar. Import/export needs a proper bound import/export surface before returning. |
| `LeftSidebar` collections info box | Removed. The sidebar keeps only the real collection manager trigger. |
| `RightPanel` PDF grid | Keep only actions with selected-ref guards and real APIs; avoid adding annotation buttons here. |
| `FeatureModals` matrix fallback | Removed. Matrix now routes only to legacy matrix functions from the Matrix tab/links. |
| Settings flat button list | Keep only real sync/update/about actions for now; duplicate PDF sync was removed. Convert to tabs only in a dedicated settings pass. |
| Header `Disa Aktar` | Should become export dropdown/preview entry, not direct single PDF only if more export features are restored. |
