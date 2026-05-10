# Old UI Behavior Map

Bu dokuman, eski `academiq-research.html` + `src/ui-event-bindings.js` + `src/legacy-runtime.js` davranis modelini React/Tailwind shell'e tasirken korunacak siniri tarif eder.

Ana ilke: React shell uygulama kromunu, layout'u ve sade komut girislerini yonetir. Editor, PDF viewer, annotation overlay, citation trigger, bibliography, collection manager, import/export preview ve browser capture gibi karmasik davranislar legacy runtime'in gercek fonksiyonlari uzerinden calismaya devam eder.

## Shell / Legacy Ownership

| Alan | Eski sahip | Yeni sahip | Aktarim kurali |
|---|---|---|---|
| Ust uygulama bari | `#tb`, `bindTopToolbarEvents()` | React shell header | Sadece ana girisler React'te kalir; export/settings/pdf gibi item'lar gercek electronAPI veya legacy komuta gider. |
| Workspace/doc tabs | `#wsrow`, `#doctabs`, `rDocTabs()`, `switchWs()`, `renameWs()`, `delWs()` | React `WorkspaceTabs`, `DocumentTabs` | React UI sade gorunur; state degisimi eski schema ile uyumlu helper'lardan kaydedilir. Legacy doc switch mantigindaki commit-before-switch prensibi korunur. |
| Sol kutuphane | `#sbl`, `#doiinp`, `#libsrch`, `#collectionbar`, `#liblist` | React `LeftSidebar` | Liste React'te render edilebilir; DOI/Bib/PDF/Klasor islemleri gercek eski fonksiyon/electronAPI baglantisi olmadan eklenmez. |
| Editor yuzeyi | `#escroll`, `#apapage`, `#apaed`, `#bibpage`, `#appendixpage` | `EditorHost` + legacy editor adapter | React controlled editor yapmaz. Editor DOM'u mount/destroy edilir; toolbar komutlari adapter/legacy komut koprusunden gecer. |
| Save/state bridge | `save()`, `syncSave()`, `saveEditorDraftNow()` | Legacy save + React sync bridge | Adapter eski `save()` fonksiyonunu ezmez; sarmalar. Legacy state once React'e senkronize edilir, sonra editor draft bildirimi calisir. |
| Editor toolbar davranisi | `#etb`, `bindEditorToolbarEvents()` | React `TopToolbar` + legacy quick menus | Basit format komutlari React'ten adapter'a gidebilir. Selection/caret korumasi gereken menu ve popoverlar legacy runtime'da kalir veya ayni guard mantigiyla cagrilir. |
| Sag not/kaynak paneli | `#sbr`, `#rpnotes`, `#rprefs`, `rNotes()`, `rRefs()` | React `RightPanel` | React sekme shell'i yonetir. Not/kaynak kaydetme eski state alanlarini bozmadan persist edilir; bibliography listesi ve citation text legacy formatter'a baglanir. |
| PDF viewer | `#pdfpanel`, `#pdfscroll`, `#pdfannots`, `#hlbar`, `bindPDFPanelEvents()` | Legacy DOM host + React shell entry | Viewer ve annotation overlay React'e yeniden yazilmaz. React sadece viewer'i ac/kapat, PDF sec/indir/senkron girislerini verir. |
| Modal sistemi | `.modal-bg`, `showM(id)`, `hideM(id)` | Hibrit | Karmasik eski modallar legacy DOM olarak korunur. Yeni React modal ancak submit gercek eski fonksiyon/electronAPI cagiriyorsa kullanilir. |
| Ayarlar/update/sync/browser capture | `#syncmodal`, `showSyncSettings()`, browser capture IPC helpers | React `FeatureModals` veya legacy settings modal | Tercih: shell sade settings girisi; icerikte sadece gercek electronAPI'ye bagli sekmeler. Eksik micro-control calisir gibi gosterilmez. |

## Behavior Inventory

| Eski UI ogesi | Eski dosya/selector/fonksiyon | Kullanici akisi | Cagrilan gercek fonksiyon/API | Guncellenen state | Yeni React karsiligi | Durum |
|---|---|---|---|---|---|---|
| Ana format butonlari | `#tbBoldBtn`, `#tbItalicBtn`, `#tbUnderlineBtn`; `bindTopToolbarEvents()` | Kullanici ust barda B/I/U/H basar | `callEditorCommandAndSync('bold'/'italic'/'underline'/'formatBlock')` | Aktif editor HTML, doc draft | `TopToolbar` temel format butonlari | Partial |
| Insert dropdown | `#ddins`; `ddInsCitationBtn`, `ddInsTableBtn`, `ddInsCoverBtn`, templates | Ekle menusu acilir, secili komut editor'e uygulanir | `triggerCitationInsert`, `openTableWizard`, `insBlkQ`, `insFig`, `insCover`, `insAbstract`, `insRefs`, `insAppendix`, `applyTemplate`, file input `wordinp` | Editor HTML, aux pages, docs | Shell'de toplu geri eklenmeyecek; gerekli olanlar legacy quick menu olarak acilmali | Missing |
| Export dropdown | `#ddexp`; `ddExpPdfBtn`, `ddExpDocBtn`, `ddExpBibBtn`, `ddExpRisBtn`, text exports | Export menusu secimi | `openExportPreview`, `expPDF`, `expDOC`, `expBIB`, `expRIS`, `expBibliographyAPA/Chicago/Vancouver`, `expCSLJSON`, `expNotes`, `expLib` | Export dosyalari, not/kutuphane ciktisi | Header export artik legacy preview'e duser; diger format entryleri henuz sade shell yuzeyine tasinmadi | Partial |
| Tema/odak/settings/PDF/sidebar toggle | `#themebtn`, `#zenbtn`, `#settingsBtn`, `#togglePdfBtn`, `#btnsbl`, `#btnsbr` | Ust bardan shell gorunumu degisir | `toggleTheme`, `toggleZenMode`, `showSyncSettings`, `togglePDF`, `tSB` | UI prefs/local state | `AppShell` view buttons + settings modal | Partial |
| Recovery banner | `#recoveryBanner`, storage bootstrap | Acilista recovery/backup bilgisi gosterilir | storage hydrate/recovery logic | `S`, recovery/session state | React status/toast alanina tasinmali; mevcut garanti edilmeli | Missing |
| Workspace tabs | `#doctabs`, `rDocTabs()`, `promptAddWs`, `switchWs`, `renameWs`, `delWs` | Workspace sec, cift tik rename, x ile sil, + ile ekle | Legacy workspace functions, `save()` | `S.wss`, `S.cur`, linked doc | `WorkspaceTabs` | Partial |
| Document state switch | `createDoc`, `switchDoc`, `deleteDoc`, `renameDoc` | Belge degisince aktif editor once commit edilir, yeni doc hydrate edilir | `__aqCommitActiveDoc`, `__aqSetEditorDoc`, `AQDocTabsState` helpers, `save()` | `S.docs`, `S.curDoc`, `S.doc` | `DocumentTabs` + `EditorHost` | Partial |
| DOI/URL/ISBN lookup | `#doiinp`, `#doiFetchBtn`, `addDOI()` | DOI/URL/ISBN yaz Enter/Cek | `addDOI`, net fetch helpers | Aktif workspace `lib` | `LeftSidebar` search/enter | Partial |
| Library search/filter | `#libsrch`, `#collectionFilterSel`, label filter | Kullanici listeyi filtreler | `rLib`, `setCollectionFilter`, `toggleLabelFilterPanel` | UI filter state, no schema change | `LeftSidebar` local filter + collection shell | Partial |
| Collection manager | `#collectionManageBtn`, `#collectionModal`, `createCollectionFromInput`, `renameCollectionById`, `deleteCollectionById` | Klasor modalinda create/rename/delete | Legacy collection helpers + `save()` | `ws.collections`, `ref.collectionIds` | React "Koleksiyon yonet" legacy command + legacy DOM host | Migrated |
| Manual reference add | `btnAddArticleRef`, `btnAddBookRef`, `btnAddWebsiteRef` | Kaynak turu secilip kunku modal acilir | `openRefMetadataModal` / ref meta save | `ws.lib` | React reference edit modal var ama eski add turleri tam tasinmadi | Partial |
| Bib/RIS/Zotero import | `#bibinp`, `#zoteroinp`, `importBib`, `importZotero` | File input secilir, import parse edilir | Legacy parser/import functions | `ws.lib`, duplicate handling | `LeftSidebar` Bib/RIS button hidden input/legacy command | Partial |
| External bibliography import | `#externalReferenceImportModal` | APA text/DOI/file import | `importExternalReferenceText/File/Doi` | `ws.lib` | Legacy modal DOM host hazir; shell entry bibliography menu uzerinden verilmeli | Partial |
| Batch OA/citation/quality | `#batchOABtn`, `#batchCiteBtn`, `#btnFindDuplicates`, `#btnMetadataHealth` | Kutuphane kalite islemleri | `batchDownloadOA`, `batchFetchCitations`, `openDuplicateReview`, `openMetadataHealthCenter` | `ws.lib`, metadata fields | Sadece gercek legacy modal entry olarak kalmali | Missing |
| Reference cards/context | `rLib()`, `openCardContextMenu`, inline menus | Kart sec, PDF ac, label/collection, context menu | `openRef`, `showLabelMenu`, `toggleReferenceCollection` | `curRef`, `ws.lib`, labels | React cards temel secim ve PDF actions | Partial |
| Used references panel | `#rprefs`, `rRefs()` | Metindeki atiflar kaynakca panelinde gorunur | `AQBibliographyState.syncReferenceViewsForState`, `getUsedRefs`, `formatRef` | Derived from editor citations | React refs tab workspace listesi gosteriyor; used-ref behavior eksik | Missing |
| Notes filters | `#noteFilterType`, `#noteFilterUsage`, `#noteFilterTag`, `#noteFilterRef`, `rNotes()` | Notlar tip/durum/tag/ref ile filtrelenir | `setNoteFilter*`, `AQNotesState.renderNotesHTML` | note view filter runtime | React notes tab basit liste | Partial |
| Manual note add | `#noteta`, `#notetype`, `#notetag`, `#bsn`, `saveNote()` | Not yaz, tip/tag sec, kaydet | `AQNotesState.createManualNote` fallback + `save()` | `S.notes` | `RightPanel` not formu | Partial |
| Notebook detail panel | `#nb-open`, `#notebookDetailModal` | Not defteri detay paneli ac, not edit/sil | notebook detail runtime functions | `S.notebooks`, `S.notes` | Yeni shell'de yok; legacy side panel olarak korunmali | Missing |
| Citation trigger | `#trig`, `/r`, `trigRefBtn`, citation mode buttons | Search, multi-select, inline/footnote citation ekle | `openTrig`, `doTrigRef`, `setCM`, citation runtime | Editor citation spans, bibliography derived state | Legacy trigger DOM host hazir; toolbar davranisi henuz sade picker akisi ile eslestirilecek | Partial |
| Citation style | `#citationStyleSel`, `setCitationStyle` | Style secilir | `setCitationStyle` | Active doc `citationStyle`, bibliography render | React'te selector yok | Missing |
| Bibliography controls | `bibliographyGoBtn`, `bibliographyRefreshBtn`, `bibliographyQuickMenuModal` | Kaynakcaya git/guncelle/reset/dis import/quality | `insRefs`, `refreshBibliographyManual`, `resetBibliographyManual`, `openExternalReferenceImportModal` | doc bibliography fields | React insert bibliography command var; legacy menu eksik | Partial |
| Document outline | `#outlineOpenBtn`, `#docOutlineModal`, `openDocumentOutline` | Anahat modalinda baslik/tablo/sekil ara/git | `openDocumentOutline`, `renderDocumentOutline` | Derived editor content | Legacy modal DOM host hazir; shell entry henuz eklenmedi | Partial |
| Caption manager | `#captionManagerOpenBtn`, `#captionManagerModal` | Tablo/sekil basliklarini yonet | `openCaptionManager` | Editor table/figure metadata | Legacy modal DOM host hazir; shell entry henuz eklenmedi | Partial |
| TOC controls | `#tbTocInsertBtn`, `#tbTocUpdateBtn`, `#tbTocRemoveBtn` | Icindekiler ekle/guncelle/sil | `insertTOC`, `removeTOC` | doc `tocHTML`, editor content | Yeni shell'de yok; legacy quick action olarak kalmali | Missing |
| Table wizard | `#wiz`, `openTableWizard`, `doTable` | APA tablo bilgileri girilir ve eklenir | `doTable` | Editor HTML/model | Legacy modal DOM host hazir; shell entry henuz eklenmedi | Partial |
| Cover modal | `#covermodal`, `insCover`, `doCover` | Kapak formu girilir | `doCover` | doc `coverHTML` | Legacy modal DOM host hazir; shell entry henuz eklenmedi | Partial |
| Find/replace | `toolbarFindInp`, `findReplaceQuickMenuModal`, `findbar` | Bul/değiştir, regex/case, prev/next | `syncToolbarFindQuery`, `findExec`, `findNext`, `replaceCurrent/All` | editor highlight runtime | React `TopToolbar` Find legacy command var | Partial |
| Editor advanced formatting | `fontsel`, `sizesel`, colors, line spacing, paragraph style, lists, indent, page break, image, footnotes, margin notes | Kullanici secimi kaybetmeden editor komutu calisir | `callEditorCommandAndSync`, `callEditorActionAndSync`, AQFootnotes, AQMarginNotes | Editor model/content | React temel format var; ileri menu eksik | Partial |
| Paste popup/table ctxbar | `#aq-paste-popup`, `#aq-table-ctxbar` | Paste/table context UI editor selection'a bagli gorunur | editor/runtime table and paste handlers | Editor model/content | Legacy host icinde korunmali, React yeniden yazmamali | Migrated |
| Literature matrix | `#matrixView`, `matrixToolbar`, matrix runtime | Arama, secili kaynak ekle, fullscreen, cell edit | `AQLiteratureMatrixState`, matrix handlers | `S.literatureMatrix` | Legacy matrix DOM host hazir; React matrix modal halen basit fallback | Partial |
| PDF attach/open | `#lfinp`, `btnPdfUpload`, `hPDFs`, `openRef`, `togglePDF` | PDF secilir/yuklenir, kaynakla acilir | `openPDFDialog/savePDF/loadPDF` via preload and legacy helpers | ref PDF metadata, workspace PDF folder | React PDF upload/open actions + legacy viewer | Partial |
| PDF viewer nav/zoom/search | `#pdfPrevBtn`, `#pdfpg`, `#pdfNextBtn`, `#pdfZoom*`, `#pdfsearchbar` | Sayfa/zoom/search | `pPrev`, `goToPage`, `pNext`, `pZO`, `pZFit`, `pZI`, `togglePdfSearch`, `pdfSearch*` | PDF runtime state | Legacy DOM host | Migrated |
| PDF sidebars | `#pdfthumbs`, `#pdfoutline`, `#pdfannots`, `#pdfrelated` | thumbnails/outline/annotations/related toggle | `toggleThumbs`, `toggleOutline`, `togglePdfAnnotations`, `togglePdfRelated` | PDF runtime UI state | Legacy DOM host | Migrated |
| PDF annotations/highlight | `#hlbar`, `.hlc`, `annotbtn`, `drawbtn`, `pdfRegionBtn`, `hltip` | Highlight, note, free drawing, region capture | `setHLC`, `toggleAnnotMode`, `toggleDrawMode`, `togglePdfRegionCaptureMode`, `doHL`, `saveAnnotsToTab` | ref/pdf annotation data, notes | Legacy DOM host; React only opens viewer | Migrated |
| Annotated PDF export | `exportAnnotatedPdf`, preload `exportAnnotatedPdfNative` | Annotation digest/native annotated export | `exportAnnotatedPdf`, `electronAPI.exportAnnotatedPdfNative` | Export file only | Yeni shell'de entry eksik | Missing |
| Export preview | `#exportPreviewModal`, `openExportPreview`, `refreshExportPreview`, `expPDF` | Preview iframe, refresh, export PDF | legacy export preview + preload export | Export output | Legacy preview DOM host hazir; shell entry henuz dogrudan eklenmedi | Partial |
| Word import | `#wordinp`, `importWordFile` | Word/html/txt sec, decode/convert, insert | `electronAPI.wordToHtml`, import workflow | Editor/doc content | Left/toolbar entry eksik veya legacy input ile korunmali | Partial |
| Sync/settings | `#syncmodal`, `showSyncSettings` | Settings modalinda app info, data safety, sync, page numbers | `getSyncSettings`, `setSyncDir`, `clearSyncDir`, `getAppInfo`, `save()` | app prefs/state | React `FeatureModals` settings | Partial |
| Browser capture settings | `#browserCapture*` fields/buttons | Setup/test/repair/launch/open dir/guide/prefs/queue | browser capture electronAPI functions | capture prefs/queue, app state on incoming | React browser capture modal var but eski controls tam degil | Partial |
| Browser capture incoming | preload listeners, runtime ack | Payload gelir, workspace/ref'e eklenir, ack | `onBrowserCaptureIncoming`, `ackBrowserCapturePayload` | active workspace lib | `App` listener adds ref | Partial |
| Document history | `#docHistoryModal`, `openDocumentHistory`, restore buttons | Snapshot listele/restore | `getDocumentHistory`, `restoreDocumentHistorySnapshot` | restored doc state | `FeatureModals` history | Partial |
| Updates/about | `updateCheckBtn`, `btnDoUpdate`, `updateUrlSaveBtn` | Check/download/set URL/restart | `checkUpdate`, `downloadUpdate`, `setUpdateUrl`, `restartApp`, `getAppInfo` | update config | React settings update section | Partial |

## Migration Rules

1. React'e geri eklenecek her buton once bu dosyada gercek eski fonksiyon/API ile eslestirilmeli.
2. Eski fonksiyon bulunmuyorsa UI calisir gibi gosterilmeyecek; `DisabledWithReason` yazilacak.
3. Editor, PDF viewer ve annotation overlay React component olarak yeniden yazilmayacak.
4. Eski modal DOM'u zaten davranis sahibiyse React sadece o modali acan tek ve sade bir entry saglayacak.
5. React state sadece shell state'i ve eski schema ile uyumlu hafif UI state'i tutacak. Buyuk document HTML/JSON controlled state'e tasinmayacak.
6. Yeni shell tasariminda eski uygulamadaki tum micro buttonlar birebir gorunmek zorunda degil; ancak erisilebilir davranis kaybolmayacak ve duplicate/sahte entry eklenmeyecek.

## Recommended Transfer Order

1. Stabil temel: workspace/doc switch, editor commit-before-switch, autosave/draft, status.
2. Legacy host tamligi: editor aux pages, hidden file inputs, PDF viewer/annotation DOM, legacy modal roots.
3. Sade shell entries: settings, PDF viewer, bibliography menu, insert menu, collection manager, document outline/caption manager.
4. Import/export parity: Word, PDF/DOCX preview, Bib/RIS/CSL/text exports, external reference import.
5. Quality tools: duplicate review, metadata health, batch OA, batch citation.
6. Browser capture/status/history/update detaylari.
