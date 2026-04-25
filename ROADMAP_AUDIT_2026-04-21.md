# AcademiQ Roadmap Audit - 2026-04-21

Bu dosya `ROADMAP.md`, `LEAN_UI_PRODUCT_ROADMAP.md`, `WORD_LEVEL_EDITOR_ROADMAP.md` ve `EDITOR_STABILITY_ROADMAP.md` dosyalarinin mevcut kodla karsilastirilmis durumudur.

## Durum Ozeti

### Tamam / ana hatta mevcut

- Lean UI omurgasi: komut paleti, status bar, sekmeli sag panel, F9 panel ac/kapat.
- Editor stabilite omurgasi: merkezi command/focus/selection yolu, toolbar event binding testleri, find/replace hardening.
- APA editor sozlesmesi: H1-H5 stilleri, page layout, page-bottom margin, paragraph split, idempotent layout sync.
- Citation flow: `/r` parenthetical, `/t` narrative citation, citation insertion sonrasi caret devam davranisi.
- Liste sozlesmesi: TipTap list node/command reuse, Enter/Tab/Shift+Tab/Backspace list testleri, list style fallback.
- Autosave/recovery/update safety: crash draft, atomic storage, stale runtime cleanup, update validation.
- Export/paste guardlari: `.docx` only, composite export quality gate, Word/web paste cleanup.
- Browser Capture local-first agent: durable queue, validation, compatibility/lifecycle/status surface.
- PDF annotation temeli: annotation state, annotation digest, notes transfer, annotated PDF export/flatten hardening.
- External bibliography: APA text/BibTeX/RIS/DOI import path, library/source-page sync, APA sort/dedupe pipeline.
- Project backup/restore: `.aqresearch` backup/restore runtime functions and command palette entries.

### Bu turda kapatilan kalici eksik

- `src/lean-ui-shell.js` command registry eksikti; HTML runtime tarafinda bulunan su komutlar source'a tasindi:
  - `backup-project`
  - `restore-project`
  - `open-annotation-digest`
  - `copy-annotation-digest`
  - `annotations-to-notes`
- Bu, build/release sirasinda source inline edilince komut paleti regresyonu olmasini engeller.
- PDF Notlari sag paneline lokal annotation arama eklendi:
  - highlight/not/tum filtreleri
  - annotation metninde arama
  - sonuc sayaci
  - digest/aktarim akisina dokunmadan sadece gorunum filtreleme
  - `buildPdfAnnotationSearchModel` icin regression testleri
- Word import fallback yolu sertlestirildi:
  - Word page-break isaretleri editor `aq-page-break` paragrafina normalize edilir
  - DOM olmayan normalize path'te de `Kaynakca` / `References` basligi H1'e normalize edilir
  - Bu basliktan sonraki paragraflar `refe` olarak isaretlenir
  - Bir sonraki heading'den sonraki normal metin yanlislikla kaynakca entry olmaz
  - Kaynakca hanging-indent/export akisina regression testi eklendi
  - Fallback normalize path'te standalone `br` page-break marker'lari da `aq-page-break` olarak yakalanir
  - Tek tirnakli (`style='...'`) `br` page-break varyanti icin regression coverage eklendi
  - Gizli Word yorum/artifact bloklari (`MsoComment*`, `display:none`, `mso-hide:all`) fallback yolunda da tamamen atilir
  - Word footnote/endnote referanslari (`_ftn/_edn`, `MsoFootnoteReference`, `MsoEndnoteReference`) stabil superscript isaretlerine normalize edilir
  - `tests/fixtures/word-import/pagebreak-comment-smoke.html` ile fixture tabanli smoke coverage eklendi
  - Real-docx benzeri fixture seti eklendi:
    - `tests/fixtures/word-import/real-docx-thesis-chapter.html`
    - `tests/fixtures/word-import/real-docx-endnote-table.html`
    - `tests/fixtures/word-import/real-docx-artifact-cleanup.html`
  - Bu fixture seti icin heading/list/table/page-break/footnote/endnote/bibliography/artifact cleanup tek testte doğrulaniyor
- APA linter atif-kaynakca tutarliligi genisletildi:
  - library/kaynakca tarafinda olup metinde atiflanmamis kaynaklar `uncited_references` olarak uyarilir
  - bu uyarinin aksiyonu citation graph paneline gider
- Buyuk library performansi icin ilk guvenli render window eklendi:
  - filtreleme tum kaynaklar uzerinden calisir
  - sidebar ilk etapta sinirli kart render eder
  - `Daha Fazla Goster` ile limit artar
  - `buildLibraryRenderWindow` icin regression testi eklendi

## Kismi / sertlestirme isteyen alanlar

- Word import fidelity: temel temizlik var, ama Word stillerini bire bir koruma hala uzun soluklu is. Ozellikle tablolar, section break, footnote/endnote ve nested style kaliteleri manuel smoke ister.
- PDF viewer premium hedefi: annotation/export ve lokal annotation search temeli var; crop/figure extractor, side-by-side compare ve OCR henuz tam urun seviyesinde degil.
- APA linter: status/panel omurgasi ve temel tutarlilik kurallari var; daha fazla kural, inline ignore UX ve false-positive azaltma ister.
- Large library performance: render window var; gercek scroll virtualization/sanal listeleme hala ileriki hardening isi.
- Citation graph / source suggestions: panel ve command iskeleti var; OpenAlex/Semantic Scholar tabanli tam deneyim henuz kisitli.

## Bilerek ertelenen yuksek riskli isler

- Track changes / suggestion mode: ProseMirror mark/transaction katmani ister; yazma dongusunu bozma riski yuksek.
- OCR: tesseract worker, bundle boyutu ve performans riski var; opsiyonel ve arka planli tasarlanmali.
- TTS: Web Speech API basit baslar ama UI/state kontrolu ayri polish ister.
- CSL style switching: APA disina cikmak citation/bibliography formatter sozlesmesini genisletir; release oncesi dusuk riskli degil.
- LanguageTool: ag/mahremiyet/rate-limit sorulari var; local/offline tercih edilmeden ana akisa alinmamali.
- Side-by-side PDF compare: iki PDF.js runtime ve scroll sync ciddi performans/senkronizasyon riski tasir.

## Siradaki guvenli is listesi

1. [Tamam] Word import smoke: heading/list/table/bibliography + pagebreak/comment + real-docx benzeri fixture kapsami aktif.
2. [Tamam] PDF annotation search local state uzerinden aktif.
3. [Tamam] APA linter: kaynakcada var/metinde yok + DOI eksik kapsami aktif.
4. [Tamam] Large library render cap ilk faz tamam (kademeli "Daha Fazla Goster").
5. [Tamam] External bibliography parser fixture kapsami artirildi; article/book/web/chapter ve DOI varyasyonlari testte.

## 2026-04-21 Kapanis Dogrulamasi

- `npm test`: 616/616 test gecti.
- `npm run build:dir`: Windows unpacked build basarili.
- Bu turda dusuk riskli roadmap eksikleri kapatildi:
  - APA linter artik metinde atiflanmamis library/kaynakca kayitlarini da raporlar.
  - PDF notlari/annotation aramasi sag panelde ve komut paletinde kullanilabilir.
  - Buyuk kutuphaneler icin ilk render cap eklendi; filtreleme tam liste uzerinden calisir, kart render'i kademeli artar.
  - APA metin parser kitap ve web kaynaklarini `referenceType`, `publisher`, `edition`, `websiteName` alanlarina daha dogru ayirir.
  - APA metin parser `Title. Journal Name.` formatindaki DOI/volume'suz girdileri artik `article` olarak ayirir.
  - Metadata health kontrolu artik kitap/web/makale turlerine gore zorunlu alanlari ayri degerlendirir.
  - PDF annotation paneline review modeli eklendi: highlight/not sayilari, sayfa yayilimi ve filtrelenmis gorunum ayni modelden hesaplanir.
  - PDF annotation digest ciktilari artik toplam highlight/not/sayfa ozetini ve pageGroups verisini tasir.
  - PDF figure/table extractor ilk fazi tamamlandi:
    - PDF toolbar'a bolge sec/yakala butonu eklendi.
    - Komut paletine `capture-pdf-region`, `capture-pdf-page-to-doc`, `capture-pdf-page-download` source registry uzerinden eklendi.
    - Bolge secimi testlenebilir `normalizePdfRegionSelection` modeliyle crop koordinatlarina cevrilir.
    - Yakalanan bolge belgeye figcaption'li sekil olarak eklenebilir veya PNG indirilebilir.
    - Bolge onizleme modalina tur secimi eklendi (`Sekil` / `Tablo`) ve istege bagli ozel caption alani tanimlandi.
    - `AQPdfViewerState.buildPdfRegionCaptureHTML` ile tip bazli ortak HTML uretimi eklendi; eski `buildPdfRegionFigureHTML` uyumlulugu korundu.
    - Bolge onizleme modalina `Nota Ekle` aksiyonu eklendi; yakalanan bolge, sayfa etiketiyle birlikte not paneline tek tikla aktarilabilir.
    - `AQPdfViewerState.buildPdfRegionNoteText` ile bu akis icin stabil ve tip-bilincli not metni uretimi eklendi.
    - `tests/pdf-viewer-state.test.js` icin table/fallback/custom-caption coverage'i eklendi.
  - Word import heading/ref hardening:
    - `References:` / `Kaynakca:` gibi noktalama sonlu basliklar da kaynakca bolumu olarak algilanir.
    - Word section wrapper `div` bloklari paragrafa ezilmek yerine acilir; nested block yapisi korunur.
    - `tests/tiptap-word-io.test.js` icin noktalamali references heading ve Turkce `Kaynakca:` coverage'i eklendi.
  - Kaynak dosya/test coverage guncellendi.
  - Lean UI status bar sayfa sinyali guclendirildi:
    - `sf x/y` formatina gecildi (aktif sayfa / toplam sayfa).
    - Aktif sayfa, editor scroll merkezine gore `aq-page-sheet` katmanindan hesaplanir.
    - `computePageStats` yardimcisi eklendi ve regression testi ile koruma altina alindi.
  - Sayfa gezinme workflow'u guclendirildi:
    - Status bar'daki sayfa pill'ine tiklayinca hedef sayfaya git promptu acilir.
    - Komut paletine `Sayfaya git` komutu eklendi.
    - `Ctrl+G` kisa yolu (editable alan disinda) ayni akisla hedef sayfaya kaydirir.

## Kalan Islerin Gercek Siniri

Asagidaki maddeler tek patch ile "hepsini yap" kategorisinde guvenli degil; editor/PDF runtime davranisini bozma riski tasidiklari icin ayri branch, fixture ve manuel smoke ister:

- Track changes / suggestion mode: ProseMirror transaction ve mark semantigi gerekir.
- OCR: worker, bundle boyutu ve performans yuku nedeniyle opsiyonel arka plan mimarisi ister.
- Side-by-side PDF compare: ikinci PDF.js runtime, scroll sync ve bellek kontrolu ister.
- Tam CSL style switching: APA 7 disi formatter sozlesmesi ve export dogrulamasi ister.
- LanguageTool entegrasyonu: gizlilik, ag erisimi ve rate-limit karari verilmeden ana akisa alinmamali.
- Figure/table extractor: PDF koordinat sistemi, crop/export ve annotation katmanlariyla birlikte tasarlanmali.

## Release Oncesi Manuel Smoke

1. App'i temiz build'den ac.
2. `/r` ve `/t` ile atif ekle, ayni satirda yazmaya devam et.
3. Kaynakca guncelle; disaridan eklenen kaynaklar alfabetik kalsin.
4. Word import yap; rastgele CSS/MSO metni editor'e dusmesin.
5. PDF annotation olustur, notlara aktar, annotated PDF export dene.
6. `.aqresearch` backup al ve test kopyasinda restore et.
7. App'i kapat/ac; autosave ve capture queue kaybolmasin.

## 2026-04-21 Ek CSL Adimi

- Komut paletine citation style switching komutlari eklendi:
  - `Atif stilini degistir` (picker)
  - `Atif stilini siradaki stile gecir`
  - Stil bazli hizli komutlar: `Atif stili: APA 7 / MLA / Chicago AD / IEEE / Harvard`
- Style degistirme akisi mevcut `setCitationStyle` pipeline'ina baglandi; inline citation + bibliography refresh mevcut runtime davranisiyla ayni kaldi.
- Status bar APA pill'i aktif citation style etiketini yansitacak sekilde guncellendi (or. `IEEE kontrol`).
- `tests/lean-ui-shell.test.js` icin style helper + status style label regression kapsami eklendi.

## 2026-04-21 Ek PDF Compare Faz 1

- PDF viewer icin yan yana karsilastirma ilk faz eklendi:
  - komut paleti: `PDF karsilastirma modunu ac/kapat`
  - komut paleti: `Karsilastirma icin ikinci PDF sec`
  - aktif sekme + secilen ikinci sekme blob iframe ile yan yana goruntulenir.
- Karsilastirma secim modeli testlenebilir hale getirildi:
  - `buildPdfCompareCandidates`
  - `resolvePdfCompareSelection`
  - `buildPdfCompareStatus`
- Legacy runtime guvenlikleri:
  - panel kapanisinda compare mode temiz kapatilir (blob URL revoke)
  - sekme kapaninca compare hedefi yeniden degerlenir
  - fullscreen degisimi compare modunda gorunum yeniler, normal render yolunu bozmaz
- Ek hardening:
  - compare icin opsiyonel `scroll senkron` komutu eklendi (`PDF karsilastirma scroll senkronu ac/kapat`)
  - sync denemesi iframe erisimine bagli oldugu icin best-effort tasarlandi; erisim yoksa sessiz fallback yapar, runtime'i bozmaz
  - `normalizeScrollRatio` / `scrollTopFromRatio` ile scroll esleme modeli test kapsamina alindi

## 2026-04-21 Ek OCR Faz 1

- OCR yuksek riskli worker entegrasyonuna girmeden once `text-layer` ihtiyac sinyali eklendi:
  - PDF acildiginda arka planda ilk 3 sayfada metin katmani taranir.
  - Sonuc `pdfreadstats` aktivite etiketine yansitilir (`OCR tarama`, `OCR gerekli`).
  - Metin katmani yoksa kullaniciya tek seferlik uyarı verilir.
- Komut paleti OCR akisina iki komut eklendi:
  - `PDF OCR ihtiyacini tara`
  - `PDF OCR durumunu goster`
- Bu faz OCR engine calistirmaz; yalnizca guvenli tespit ve durum gorunurlugu saglar.

## 2026-04-21 Ek APA Linter Hardening

- Linter false-positive azaltma:
  - `missing_bibliography_page` uyarisÄ± artik sadece metinde gercek atif varken tetiklenir.
  - Tekil "library'de kalmis bir kaynak" durumlari icin `uncited_references` uyarisi bastirilir; uyari daha anlamli yogunluklarda acilir.
  - Okunabilirlik metriÄŸi DOI/URL ve parenthetical citation kalabaligini metinden temizleyerek hesaplanir.
  - Editor okunabilirlik metni, `Kaynakca/References/Bibliography` basligindan sonraki bolumu disarida birakir.
  - Uzun paragraf + atif yok sinyali eklendi:
    - Linter artik uzun (3+ cumle veya 85+ kelime) ve atifsiz paragraflari `long_paragraph_without_citation` olarak raporlar.
    - Kisa/icerik olarak zayif paragraflar bu kurala dahil edilmez.
    - Suggest panelinde bu durum icin "Atif kapsamini guclendir" aksiyonu eklendi.
- Ignore UX sertlestirildi:
  - Linter yoksayma tokenlari belge bazinda (`doc:<id>::<code>`) saklanabilir hale geldi.
  - Eski global code tabanli ignore kayitlariyla geri uyumluluk korunur.
  - Linter paneline "bu belgede yoksayilanlari sifirla" aksiyonu eklendi.
- Test kapsamÄ±:
  - `tests/lean-ui-shell.test.js` icin readability sanitize, doc-scoped ignore, bibliography warning gating ve uncited-warning threshold testleri eklendi.

## 2026-04-21 Ek Library Render Hardening

- Buyuk library listeleri icin mevcut kademeli render korunurken filtreli gorunum UX'i iyilestirildi:
  - Arama / etiket / koleksiyon filtresi aktifken render penceresi tek seferde tum eslesen kayitlari gosterir (`forceFullRender`).
  - Filtreli listede gereksiz `Daha Fazla Goster` adimi kaldirilmis olur; performans korumasi filtresiz buyuk listede aynen devam eder.
- `src/library-state.js` + runtime fallback fonksiyonu guncellendi.
- `tests/library-state.test.js` icin `forceFullRender` regression testi eklendi.

## 2026-04-22 Ek Track Review Paneli (TTS haric tamamlayici adim)

- Lean UI sag panele yeni `Inceleme` sekmesi eklendi:
  - track changes acik/kapali durumu
  - bekleyen oneri sayisi
  - ekleme/silme ozetleri
  - onceki/sonraki oneri gezintisi
  - seciliyi kabul/geri al
  - tumunu kabul/geri al
- Komut paletine `Inceleme panelini ac` komutu eklendi.
- Oneriler paneli, bekleyen track changes oldugunda `Inceleme onerilerini sonlandir` aksiyonu onerir.
- Regression kapsam:
  - `buildSuggestionModel` track-review aksiyonu testi
  - `buildTrackChangesPanelModel` normalize/fallback testi

## 2026-04-22 Ek LanguageTool Hardening

- Dil kontrolu hata durumunda tekrar deneme davranisi sertlestirildi:
  - ard arda hata sayisina gore artan cooldown (8s, 16s, 32s, 60s cap)
  - ayni metinde hata halinde gereksiz sik tekrar denemelerin engellenmesi
  - basarili kontrolde hata sayaç/cooldown sifirlama
- Regression kapsam:
  - `computeGrammarErrorCooldownMs` fonksiyonu test kapsami

## 2026-04-22 Ek OCR Faz 2 Hardening

- OCR runtime sertlestirmeleri:
  - sayfa bazli OCR durum/deneme meta modeli eklendi (`queued/running/success/failed/skipped`)
  - gecici hata kodlari icin sinirli retry (timeout/network/rate-limit/5xx)
  - otomatik OCR'da sayfa bazli deneme limiti (kapasite asimi durumunda sayfayi atla)
  - calisan OCR akisina iptal destegi (`cancelPdfOcrRun`)
  - sadece basarisiz sayfalari yeniden deneme akisi (`runPdfOcrRetryFailedNow`)
- OCR sekme gecisi dayanikliligi:
  - `pdf-tabs-state` clone/save yoluna `ocrPageItems`, `ocrPageMeta`, `ocrLastAt` eklendi
  - sekme degisiminde OCR cache/metasi korunur, tekrar tarama baskisi azalir
- Komut paleti OCR komutlari:
  - `PDF OCR basarisiz sayfalari tekrar dene`
  - `PDF OCR islemini iptal et`
- Regression kapsam:
  - `tests/pdf-tabs-state.test.js` icin OCR cache+meta persist testleri
  - `tests/pdf-viewer-state.test.js` icin OCR cancelled/skipped durum etiketleri

## 2026-04-22 Ek Kaynakca Cikti Formatlari (Roadmap 6.2)

- Kaynakca disa aktarimlari genisletildi:
  - `APA TXT`
  - `Chicago TXT`
  - `Vancouver TXT` (mevcut IEEE numerik formatter fallback'i uzerinden)
  - `CSL-JSON`
- Export menusu bu formatlari runtime tarafinda garantili olusturacak sekilde harden edildi:
  - statik buton varsa handler baglar
  - buton eksikse dinamik olusturur
- Komut paleti tarafina yeni quick command'lar eklendi:
  - `Kaynakcayi APA TXT olarak disa aktar`
  - `Kaynakcayi Chicago TXT olarak disa aktar`
  - `Kaynakcayi Vancouver TXT olarak disa aktar`
  - `Kaynakcayi CSL-JSON olarak disa aktar`
- Bu akis icin yeni saf (testlenebilir) modul:
  - `src/bibliography-export.js`
  - stil normalize, style-aware formatlama, CSL-JSON mapleme
- Regression kapsam:
  - `tests/bibliography-export.test.js`
  - `tests/ui-event-bindings.test.js` (yeni export button binding yolu)

## 2026-04-22 Ek Track Changes Dokuman Bazli Kalicilik

- Track changes modu artik dokuman bazinda saklanir (`doc.trackChangesEnabled`):
  - dokuman/workspace degisince aktif inceleme modu dogru sekilde geri yuklenir
  - yeni dokuman varsayilan olarak track kapali acilir
- Runtime hardening:
  - `setTrackChangesMode` artik `options` kabul eder:
    - `persistDoc`
    - `saveState`
    - `silent`
  - capture refresh / history restore / ilk yukleme akislarinda track mode sessiz senkronlanir
- State schema genisletmesi:
  - `normalizeDoc` artik `trackChangesEnabled` alanini normalize eder
  - eski dokumanlar geri uyumlu olarak `false` alir
- Regression kapsam:
  - `tests/state-schema.test.js` icin `trackChangesEnabled` default/preserve testleri eklendi

## 2026-04-22 Ek Citation Graph Gorsel Katman (Roadmap 2.3 hardening)

- Sag paneldeki `Atif` sekmesi artik yalniz metinsel liste degil; belge-merkezli mini SVG ag gosterimi de uretir.
- Yeni model/fonksiyonlar:
  - `buildCitationGraphSvgModel`
  - `renderCitationGraphSvg`
- Ag davranisi:
  - merkez dugum: `Belge`
  - bagli kaynaklar, eksik baglantilar ve kullanilmayan kaynaklar farkli tonlarda gosterilir
  - paneli kalabaliklastirmamak icin dugumler caplenir; artan kayitlar `+N` ozet metniyle belirtilir
- Regression kapsam:
  - `tests/lean-ui-shell.test.js`
    - `buildCitationGraphSvgModel creates capped radial nodes and hidden counters`
    - `renderCitationGraphSvg returns a safe inline svg graph payload`
