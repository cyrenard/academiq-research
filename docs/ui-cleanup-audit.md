# UI Cleanup Audit

Bu audit React/Tailwind shell icindeki gorunur UI elemanlarini temizleme kararlarini listeler. Amaç, yalnizca gercek fonksiyon/API baglantisi olan yuzeyleri birakmak ve son turda eklenen gereksiz/duplicate aksiyonlari kaldirmaktir.

| UI Element | Component | Handler | Real Function/API | Action |
|---|---|---|---|---|
| Workspace tab select | `WorkspaceTabs` | `onSelectWorkspace` | `switchWorkspace`, `saveData` | Keep |
| Yeni workspace | `WorkspaceTabs` | `onAddWorkspace` | `addWorkspace`, `saveData` | Keep |
| Workspace rename | `WorkspaceTabs` | `onRenameWorkspace` | `renameWorkspace`, `saveData` | Keep |
| Workspace delete | `WorkspaceTabs` | `onDeleteWorkspace` | `deleteWorkspace`, `saveData`, confirm | Keep |
| Document tab select | `DocumentTabs` | `onSelectDocument` | `switchDocument`, `saveData` | Keep |
| Yeni document | `DocumentTabs` | `onAddDocument` | `addDocument`, `saveData` | Keep |
| Document rename | `DocumentTabs` | `onRenameDocument` | `renameDocument`, `saveData` | Keep |
| Document delete | `DocumentTabs` | `onDeleteDocument` | `deleteDocument`, `saveData`, confirm | Keep |
| Header export | `AppShell` | `onExportPDF` | `electronAPI.exportPDF` | Keep |
| Header Import/Export | `AppShell` | `setFeatureModal('importExport')` | Removed modal was too broad/duplicate | Remove |
| Header History | `AppShell` | `setFeatureModal('history')` | Duplicated command palette access | Remove |
| Header Odak | `AppShell` | `onViewChange('focus')` | `toggleZenMode` via `callLegacy` | FixBinding |
| Header Settings | `AppShell` | `onViewChange('settings')` | Settings modal + `electronAPI` calls | Keep |
| Header PDF | `AppShell` | `onViewChange('pdf')` | switches to PDF panel | Keep |
| Header Kutuphane | `AppShell` | `onViewChange('library')` | switches to references panel | Keep |
| Header Not & Refs | `AppShell` | `onViewChange('notes')` | switches to notes panel | Keep |
| Sidebar DOI/URL/ISBN input | `LeftSidebar` | `onSearch` | `lookupBrowserCaptureTarget`, `addReferenceToActiveWorkspace`, `saveData` | Keep |
| Sidebar Klasorler | `LeftSidebar` | `onOpenCollections` | toggles collection panel; manager calls `openCollectionManager` | Keep |
| Sidebar Filtrele | `LeftSidebar` | `onToggleFilters` | local reference filter | Keep |
| Sidebar Ice Aktar | `LeftSidebar` | `setFeatureModal('importExport')` | Removed duplicate modal path | Remove |
| Sidebar PDF | `LeftSidebar` | `onOpenPDF` | `openPDFDialog`, `savePDF`, `saveData` | Keep |
| Sidebar Bib/RIS | `LeftSidebar` | `run('reference-import-bib')` | hidden `bibinp`, `importBib` | Keep |
| Sidebar Zotero | `LeftSidebar` | `run('reference-import-zotero')` | duplicate import action in cramped sidebar | Remove |
| Collection manager | `LeftSidebar` | `run('reference-collections')` | `openCollectionManager` | Keep |
| Toolbar paragraph/headings | `TopToolbar` | `command('formatBlock')` | editor command bridge | Keep |
| Toolbar bold/italic/underline/strike | `TopToolbar` | `command(...)` | `AQTipTapWordCommands.applyCommand` / legacy `ec` | Keep |
| Toolbar font size | `TopToolbar` | `runEditorAction('applyFontSize')` | legacy editor action bridge | Keep |
| Toolbar citation | `TopToolbar` | `editorRef.current.insertCitation` | editor adapter / legacy citation insert | Keep |
| Toolbar table/figure/blockquote/TOC | `TopToolbar` | legacy insert helpers | Valid but cluttered top toolbar | Remove |
| Toolbar lists/alignment/spacing | `TopToolbar` | editor command/action bridge | editor command bridge | Keep |
| Toolbar undo/redo/find | `TopToolbar` | editor commands / `find-open` | editor + legacy find | Keep |
| Toolbar font family select | `TopToolbar` | `fontName` | duplicate style control, visual clutter | Remove |
| Right panel tabs refs/pdf/notes/matrix | `RightPanel` | `onTabChange` | changes active working panel | Keep |
| Right panel details tab | `RightPanel` | details-only actions | duplicate metadata/settings surface | Remove |
| Right panel plus button | `RightPanel` | status message only | no create flow | Remove |
| Right panel fake filters | `RightPanel` | status message only | no filter state | Remove |
| Reference select | `RightPanel` | `onSelectReference` | active reference state | Keep |
| Reference citation action | `RightPanel` | `onInsertCitation` | editor adapter insert citation | Keep |
| Reference edit action | `RightPanel` | `onEditReference` | reference edit modal submit updates state | Keep |
| Reference PDF action | `RightPanel` | `onReferencePdfAction('open')` | `openRef` / `togglePDF` | Keep |
| Reference show folder | `RightPanel` | `onReferencePdfAction('show')` | `electronAPI.showPdfInExplorer` | Keep |
| Reference download PDF | `RightPanel` | `onReferencePdfAction('download')` | `electronAPI.downloadPDFfromURL` | Keep |
| Reference delete | `RightPanel` | `onDeleteReference` | state update, `saveData`, `deletePDF`, confirm | Keep |
| PDF tab upload/view/download/show/delete/sync | `RightPanel` | PDF handlers | `openPDFDialog`, legacy `togglePDF`, PDF electron APIs | Keep |
| PDF annotation button grid | `RightPanel` | many legacy feature calls | duplicate of actual PDF viewer toolbar | Remove |
| PDF tools modal launcher | `RightPanel` | `setFeatureModal('pdfTools')` | duplicate broad modal | Remove |
| Matrix tab open | `RightPanel` | `onOpenMatrix` | matrix modal with persisted cell updates | Keep |
| Matrix duplicate legacy toggles | `RightPanel` | `matrix-open`, `matrix-toggle` | duplicate paths | Remove |
| Note delete | `RightPanel` | `onDeleteNote` | note state update, `saveData` | Keep |
| Note citation/matrix actions | `RightPanel` | insert citation / open matrix | editor adapter / matrix modal | Keep |
| Add note form | `RightPanel` | `submitNote` | `addManualNote`, `saveData` | Keep |
| Settings sync dir | `FeatureModals` | `setSyncDir` | `electronAPI.setSyncDir` | Keep |
| Settings clear sync | `FeatureModals` | `clearSyncDir` | `electronAPI.clearSyncDir` | Keep |
| Settings update check/download/restart | `FeatureModals` | update handlers | update electron APIs | Keep |
| Settings PDF sync | `FeatureModals` | `pdfSyncAll` | `electronAPI.pdfSyncAll` | Keep |
| History restore | `FeatureModals` | restore click | `restoreDocumentHistorySnapshot`, reload state | Keep |
| Matrix cell edit | `FeatureModals` | `onBlur` | updates `literatureMatrix`, `saveData` | Keep |
| Browser capture setup/test/guide | `FeatureModals` | capture buttons | browser capture electron APIs | Keep |
| Reference edit save/delete | `FeatureModals` | `saveReference`, `onDeleteReference` | state update/delete | Keep |
| PDF tools modal | `FeatureModals` | broad legacy button grid | duplicate/clutter | Remove |
| Import/export modal | `FeatureModals` | broad legacy button grid | duplicate/clutter | Remove |
| Command palette workspace/doc commands | `App` | handlers | state update, `saveData` | Keep |
| Command palette fake add reference hint | `App` | status message only | no actual action | Remove |
| Command palette PDF tools/OCR/import/export extras | `App` | broad legacy calls | clutter/duplicate | Remove |
| Command palette PDF/DOCX export | `App` | export handlers | `electronAPI.exportPDF`, `electronAPI.exportDOCX` | Keep |
| Command palette insert citation/bibliography | `App` | editor adapter | editor adapter commands | Keep |
| Command palette history/matrix/settings/capture | `App` | modal open with real actions | real modal contents | Keep |
| Command palette legacy feature spread | `App` | maps all `legacyFeatures` | uncontrolled button flood | Remove |
| Hidden PDF/import compatibility controls | `LegacyCompatibilityHost` | legacy DOM ids | required by old runtime/viewer | Keep |
