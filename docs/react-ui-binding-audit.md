# React UI Binding Audit

Status values: `Bound`, `Removed`, `DisabledWithReason`, `NeedsCleanup`, `NeedsBinding`.

| New UI element | Component | Location | Handler | Real legacy function/API | Status |
|---|---|---|---|---|---|
| App load | `App` | root effect | load/hydrate effect | `electronAPI.loadData`, `hydrateAppState` | Bound |
| App save | `App` | root helper | `persistState` | `electronAPI.saveData`, `electronAPI.saveEditorDraft` | Bound |
| Legacy save bridge | `editor-adapter` | editor mount | wrapped `window.save` | legacy `save()`, React `__aqReactSyncFromLegacy` | Bound |
| Workspace tab select | `WorkspaceTabs` | workspace strip | `handleWorkspaceChange` | `switchWorkspace`, `persistState`, editor `getHTML` | Bound |
| Workspace add | `WorkspaceTabs` | workspace strip | `handleAddWorkspace` | `addWorkspace`, `persistState` | Bound |
| Workspace rename | `WorkspaceTabs` | workspace strip | `handleRenameWorkspace` | `renameWorkspace`, `persistState` | Bound |
| Workspace delete | `WorkspaceTabs` | workspace strip | `handleDeleteWorkspace` | `deleteWorkspace`, `persistState` | Bound |
| Document tab select | `DocumentTabs` | document strip | `handleDocumentChange` | `switchDocument`, `persistState`, editor `getHTML` | Bound |
| Document add | `DocumentTabs` | document strip | `handleAddDocument` | `addDocument`, `persistState` | Bound |
| Document rename | `DocumentTabs` | document strip | `handleRenameDocument` | `renameDocument`, `persistState` | Bound |
| Document delete | `DocumentTabs` | document strip | `handleDeleteDocument` | `deleteDocument`, `persistState` | Bound |
| Header export | `AppShell` | header | `onExportPDF` wrapper | `openExportPreview` fallback `electronAPI.exportPDF` | Bound |
| Header focus | `AppShell` | header | `onViewChange('focus')` | `toggleZenMode` | Bound |
| Header settings | `AppShell` | header | `setFeatureModal('settings')` | Settings modal with electronAPI calls | Bound |
| Header PDF | `AppShell` | header | `setRightTab('pdf')` | Opens PDF tab only | Bound |
| Header library | `AppShell` | header | `setRightTab('refs')` | RightPanel refs | Bound |
| Header notes | `AppShell` | header | `setRightTab('notes')` | RightPanel notes | Bound |
| Left DOI/search input | `LeftSidebar` | left sidebar | `onSearch`/`handleReferenceSearch` | `lookupBrowserCaptureTarget`, `addReferenceToActiveWorkspace` | Bound |
| Left collections button | `LeftSidebar` | left sidebar | `onOpenCollections` | `openCollectionManager`; no local fake panel fallback | Bound |
| Left filters button | `LeftSidebar` | left sidebar | local toggle | React filter state | Bound |
| Left PDF button | `LeftSidebar` | left sidebar | removed | PDF actions belong to RightPanel PDF | Removed |
| Left Bib/RIS button | `LeftSidebar` | left sidebar | removed | import actions need a proper import/export surface | Removed |
| Left collection info box | `LeftSidebar` | left sidebar | removed | static counts were not real collection management | Removed |
| Reference card select | `LeftSidebar` | left sidebar | `onSelectReference` | React selected ref state | Bound |
| TopToolbar heading select | `TopToolbar` | editor toolbar | `command('formatBlock')` | `runEditorCommand` / `ec` | Bound |
| TopToolbar bold/italic/underline/strike | `TopToolbar` | editor toolbar | `command(...)` | `runEditorCommand`, editor chain fallback | Bound |
| TopToolbar font size | `TopToolbar` | editor toolbar | `runEditorAction('applyFontSize')` | legacy editor action | Bound |
| TopToolbar citation | `TopToolbar` | editor toolbar | `openCitationPicker` | `doTrigRef`, fallback adapter insert | Bound |
| TopToolbar lists/alignment/spacing | `TopToolbar` | editor toolbar | `command`/`runEditorAction` | legacy editor commands/actions | Bound |
| TopToolbar undo/redo | `TopToolbar` | editor toolbar | direct editor commands | `window.editor.commands.undo/redo` | Bound |
| TopToolbar find | `TopToolbar` | editor toolbar | `runById('find-open')` | `toggleFindBar` | Bound |
| RightPanel tab switch | `RightPanel` | right panel | `onTabChange` | React tab state | Bound |
| References card citation | `RightPanel` refs | refs tab | `onInsertCitation(ref.id)` | adapter insert citation | Bound |
| References edit | `RightPanel` refs | refs tab | `onEditReference(ref.id)` | selects clicked ref and opens `FeatureModals referenceEdit` | Bound |
| References PDF open | `RightPanel` refs | refs tab | `onReferencePdfAction('open')` | `openRef/togglePDF` | Bound |
| References PDF show/download/delete quick actions | `RightPanel` refs | refs tab | removed | duplicate of selected-reference PDF tab actions | Removed |
| References delete quick action | `RightPanel` refs | refs tab | removed | destructive action remains in reference edit modal | Removed |
| PDF upload | `RightPanel` pdf | PDF tab | `onOpenPDF` | `openPDFDialog`, `savePDF`, state reference insert | Bound |
| PDF viewer open | `RightPanel` pdf | PDF tab | `run('pdf-toggle')` | `togglePDF` | Bound |
| PDF URL download | `RightPanel` pdf | PDF tab | `onReferencePdfAction('download')` | `downloadPDFfromURL` | Bound |
| PDF show in folder | `RightPanel` pdf | PDF tab | `onReferencePdfAction('show')` | `showPdfInExplorer` | Bound |
| PDF delete | `RightPanel` pdf | PDF tab | `onReferencePdfAction('delete')` | `deletePDF` | Bound |
| PDF sync | `RightPanel` pdf | PDF tab | inline promise | `pdfSyncAll` | Bound |
| Notes delete | `RightPanel` notes | Notes tab | `onDeleteNote` | `deleteNote`, `persistState` | Bound |
| Notes insert citation | `RightPanel` notes | Notes tab | `onInsertCitation(note.rid)` | adapter insert citation | Bound |
| Notes matrix link | `RightPanel` notes | Notes tab | `onOpenMatrix` | `toggleLiteratureMatrix/openLiteratureMatrix`; disabled by status if legacy unavailable | Bound |
| Notes add form | `RightPanel` notes | Notes tab | `submitNote` | `addManualNote`, `persistState` | Bound |
| Matrix open | `RightPanel` matrix | Matrix tab | `onOpenMatrix` | `toggleLiteratureMatrix/openLiteratureMatrix`; disabled by status if legacy unavailable | Bound |
| Settings sync dir | `FeatureModals` settings | settings modal | inline promise | `setSyncDir` | Bound |
| Settings clear sync | `FeatureModals` settings | settings modal | inline promise | `clearSyncDir` | Bound |
| Settings update check/download/url/restart | `FeatureModals` settings | settings modal grouped Updates section | inline promises with error status | `checkUpdate`, `downloadUpdate`, `setUpdateUrl`, `restartApp` | Bound |
| Settings PDF sync | `FeatureModals` settings | settings modal | removed | duplicate of RightPanel PDF action | Removed |
| Browser capture modal actions | `FeatureModals` browserCapture | grouped Setup/Preferences sections | inline promises with error status | capture preload APIs | Bound |
| History restore | `FeatureModals` history | modal | inline promise | `restoreDocumentHistorySnapshot` | Bound |
| Reference edit modal save/delete | `FeatureModals` referenceEdit | modal | `saveReference`, delete callback | `updateReferenceInActiveWorkspace`, `removeReferenceFromActiveWorkspace` | Bound |
| Matrix fallback modal cell edit | `FeatureModals` matrix | modal | removed | legacy matrix view is the only matrix surface for now | Removed |
| Command palette new workspace | `CommandPalette` | global | commands array | `handleAddWorkspace` | Bound |
| Command palette new document | `CommandPalette` | global | commands array | `handleAddDocument` | Bound |
| Command palette rename/delete workspace | `CommandPalette` | global | removed | duplicate of workspace strip destructive actions | Removed |
| Command palette rename/delete document | `CommandPalette` | global | removed | duplicate of document strip destructive actions | Removed |
| Command palette reference edit | `CommandPalette` | global | commands array | `FeatureModals referenceEdit` | Bound |
| Command palette delete reference | `CommandPalette` | global | removed | duplicate destructive action from References panel | Removed |
| Command palette PDF/export/editor/history/settings | `CommandPalette` | global | commands array | real handlers/electronAPI/legacy calls | Bound |
| Command palette browser capture/update shortcuts | `CommandPalette` | global | removed | settings/update belong in Settings surfaces | Removed |
| Legacy file inputs | `LegacyCompatibilityHost` | hidden host | `callFileHandler` | `hPDFs`, `importBib`, `importZotero`, `importWordFile`, `handleImgUpload` | Bound |
| Legacy PDF viewer DOM | `LegacyCompatibilityHost` | legacy host | old runtime handlers/direct ids | PDF runtime functions | Bound/UseLegacyHost |
| Legacy citation trigger DOM | `LegacyCompatibilityHost` | legacy host | old runtime | `AQCitationRuntime`, `setCM`, `doTrigRef` | Bound/UseLegacyHost |
| Legacy modal roots | `LegacyCompatibilityHost` | legacy host | old runtime/`__bindSprint1PanelEvents` | collection/table/cover/external import/export preview/outline/caption/duplicate/metadata/matrix legacy functions | Bound/UseLegacyHost |

## Audit Rules For Next Code Pass

| Rule | Action |
|---|---|
| `NeedsCleanup` | Keep only if placement plan says this is correct; otherwise remove or move in a later code pass. |
| `NeedsPlacement` | Do not add more UI; move to planned surface or remove duplicate entry. |
| `NeedsBinding` | Add binding only after matching `legacy-behavior-map.md` function/API and `feature-placement-plan.md` location. |
| `UseLegacyHost` | Do not recreate the UI in React; expose one clean shell entry to the legacy behavior. |
