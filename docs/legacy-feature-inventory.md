# Legacy Feature Inventory

Bu envanter eski HTML/renderer/event-binding yuzeyinden cikarildi. Yeni React shell bu fonksiyonlari `src/renderer/lib/legacy-feature-adapter.ts` uzerinden komut paletine, toolbar'a, sag/sol panellere ve modal yuzeylere baglar.

| Area | Legacy entry points | New React surface |
| --- | --- | --- |
| Data/load/save | `loadData`, `saveData`, `saveEditorDraft`, `save`, `uSt` | `App`, `EditorHost`, autosave bridge |
| Workspaces | `doAddWs`, `switchWs`, `delWs`, workspace state | `WorkspaceTabs`, command palette |
| References | `addDOI`, `rLib`, `openRef`, `openRefMetadataModal`, `dRefIn`, `toggleLabelFilterPanel`, `openCollectionManager` | `LeftSidebar`, `RightPanel`, `Reference Detail`, command palette |
| Reference import | `importBib`, `importZotero`, `openExternalReferenceImportModal`, `importExternalReferenceFile/Text/Doi` | Left sidebar Bib/RIS/Zotero buttons, command palette |
| Duplicate/metadata | `openDuplicateReview`, `openMetadataHealthCenter`, `batchDownloadOA`, `batchFetchCitations` | Left filter tools, command palette |
| Related papers | `toggleRelatedPanel`, web-related discovery modules | Left filter tools, command palette |
| Citation | `doTrigRef`, `openTrig`, `insertCitation`, `setCitationStyle`, `updateRefSection` | Top toolbar, right panel citation buttons, command palette, editor adapter |
| Bibliography | `insRefs`, `refreshBibliographyManual`, `resetBibliographyManual`, `expBIB`, `expRIS`, `expCSLJSON`, text exports | Top toolbar/command palette |
| Editor formatting | `ec`, `AQTipTapWordCommands.applyCommand`, `applyFontSize`, `setLineSpacing` | Top toolbar, command palette |
| Editor layout | `setPageSize`, `setParagraphSpacing`, `editorZoom`, page break/list/indent commands | Top toolbar, command palette |
| Find/replace | `toggleFindBar`, `findNext`, `findPrev`, `replaceCurrent`, `replaceAll` | Top toolbar find, command palette |
| Insert objects | `openTableWizard`, `insFig`, `insImage`, `insBlkQ`, `insCover`, `insAbstract`, `insAppendix` | Top toolbar and command palette |
| Templates | `applyTemplate('tez'|'makale'|'rapor'|'literatur')` | Command palette |
| TOC/outline/captions | `insertTOC`, `removeTOC`, `openDocumentOutline`, `openCaptionManager` | Top toolbar, command palette |
| Footnotes/endnotes | `AQFootnotes.insertFootnote`, `AQFootnotes.showCrossRefDialog` | Command palette |
| Margin notes | `AQMarginNotes.toggleMnMode`, `toggleMnVisible` | Command palette |
| Track changes | `toggleTrackChangesMode`, `focusNext/PrevTrackedChange`, accept/reject current/all | Command palette |
| PDF management | `openPDFDialog`, `savePDF`, `loadPDF`, `pdfExists`, `deletePDF`, `showPdfInExplorer`, `downloadPDFfromURL` | Left PDF button, right reference PDF actions, PDF tools modal |
| PDF viewer | `togglePDF`, `pPrev`, `pNext`, `pZI`, `pZO`, `pZFit`, `togglePdfSearch`, `toggleThumbs`, `toggleOutline` | PDF tools modal, command palette |
| PDF annotations | `togglePdfAnnotations`, `toggleAnnotMode`, `toggleDrawMode`, `clearPdfDrawingPage`, `exportAnnotatedPdfNative` | PDF tools modal, command palette |
| PDF OCR | `runPdfOcrNeedScan`, `runPdfOcrExtractionNow`, `runPdfOcrRetryFailedNow`, `cancelPdfOcrRun`, `showPdfOcrStatus`, `ocrAPI.recognize` | PDF tools modal, command palette |
| Notes | `AQNotesState`, `saveNote`, `rNotes`, `insCiteNote`, `deleteNote` | Right notes panel |
| Literature matrix | `AQLiteratureMatrixState`, `openLiteratureMatrix`, `toggleLiteratureMatrix`, cell edit helpers | Matrix modal, command palette |
| Export/import | `expPDF`, `expDOC`, `wordToHtml`, `importWordFile`, bibliography exports | Header export, command palette |
| Browser capture | `getBrowserCaptureStatus`, setup/test/guide/actions/listeners | Browser Capture modal |
| Sync/settings/update | `getSyncSettings`, `setSyncDir`, `clearSyncDir`, `checkUpdate`, `downloadUpdate`, `setUpdateUrl`, `restartApp` | Settings modal |
| Theme/focus | `toggleTheme`, `toggleZenMode` | Header and command palette |

## Notlar

- Editor content React state'e tasinmadi; editor komutlari adapter ve legacy command API uzerinden calisir.
- Legacy fonksiyonlar silinmedi. React shell yeni yuzey olarak bu fonksiyonlari cagirir.
- Bazi legacy fonksiyonlar kendi modal/DOM hostlarini bekledigi icin komut paletinden cagrildiginda eski modal davranisini kullanir; bu kasten geri uyumluluk icindir.
