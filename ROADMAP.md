# AcademiQ Research — Feature Roadmap

**Tek runtime dosyası:** `academiq-research.html` (src/*.js legacy runtime dosyaları **çalışma zamanında yüklenmez**; sadece tiptap-bundle, pdf.min, file-saver-shim, mammoth, html2pdf, pdf-viewer-state, pdf-annotation-export dış yüklenir).

**UI felsefesi:** Toolbar'a yeni buton **eklenmez**. Tüm yeni özellikler 3 konteynerden birine girer:
1. **Komut paleti** (Cmd+K / Ctrl+K)
2. **Status bar** (editör altı, pasif gösterim)
3. **Sekmeli sağ yan panel** (F9 ile aç/kapa, tek sekme görünür)

Context menü & inline işaretleme de serbest (zaten mevcut pattern).

---

## Faz 0 — Altyapı (önce bu 3'ü yap)

### 0.1 Komut paleti
**Amaç:** Yeni eylemlerin %70'i sadece buradan erişilebilir. Toolbar büyümesin.

**Implementasyon:**
- `academiq-research.html` içinde yeni `<div id="cmdpal" class="cmdpal-bg">` modal (mevcut `.modal-bg` pattern'i gibi)
- Kısayol: `Ctrl+K` / `Cmd+K` global listener, input type=text + sonuç listesi
- Command registry: `var AQCommands = [{id,title,keywords,section,icon,run:function(){}}]`
- Fuzzy match (basit: substring + kelime başlangıcı ağırlığı). Harici kütüphane gerekmez
- Çıkış: ESC / Click outside. Enter → `cmd.run()`
- Kategori ayracı: "Kaynaklar", "PDF", "Belge", "Görünüm", "Ayarlar"

**Örnek registry girişleri (başlangıç):**
```
{id:'focus-mode',title:'Odak modu',keywords:['zen','focus'],section:'Görünüm',run:toggleFocusMode}
{id:'open-outline',title:'Başlık haritası (Outline)',section:'Görünüm',run:openSidePanel.bind(null,'outline')}
{id:'apa-lint',title:'APA uyumluluk taraması',section:'Belge',run:runApaLinter}
{id:'find-duplicates',title:'Yinelenen kaynakları tara',section:'Kaynaklar',run:openDuplicateScan}
{id:'change-csl',title:'Alıntı stilini değiştir...',section:'Belge',run:openCslPicker}
```

**Sözleşme:** Yeni özellik gelecekse **önce komut olarak kaydet**, sonra UI düşün.

**Dokunulacak yerler:**
- CSS: yeni `.cmdpal-*` stilleri (mevcut `.modal` pattern baz alınabilir)
- JS: yeni global `window.AQCommands` array + `openCmdPalette()`, `closeCmdPalette()`
- Kısayol bind: mevcut keydown dinleyicileri ara (`keydown` grep), oraya enjekte

---

### 0.2 Status bar
**Amaç:** Pasif bilgi kanalı — sayaçlar, durumlar, tek tık drill-down.

**Layout:** Editörün altında 24px sabit yükseklikte şerit. Monospace veya `var(--fm)`. Warm-cream paletine oturacak renkler:
- `background: rgba(255,251,243,.92)`
- `border-top: 1px solid rgba(214,202,184,.6)`
- `font-size:10px; color:var(--txt2)`

**Bölümler (soldan sağa):**
```
[sayfa 3/12]  [1 247 kelime]  [APA ✓]  [ⓘ 2 uyarı]  [okunabilirlik 58]  [● kaydedildi]
```

Her segment tıklanabilir:
- Sayfa → sayfa atlama popup
- APA/uyarı → yan panel linter sekmesini aç
- Okunabilirlik → detay modal
- Kayıt rozeti → versiyon geçmişi

**Dokunulacak yerler:**
- DOM: `#ctr` altına `<div id="statusbar">` (etb'den sonra)
- JS: `updateStatusBar()` fonksiyonu, editör update'lerinde (ProseMirror `onUpdate`, ref ekleme/çıkarma) tetikle
- `curRef`, `AQCommands`, sayfa sayısı mevcut state'lerden okunur

---

### 0.3 Sağ yan panel (sekmeli)
**Amaç:** Tüm "bu belgeye dair" ek görünümler tek konteynerde.

**Davranış:**
- Default **kapalı**
- F9 veya komut paleti ile aç
- Üstte dikey ikon şeridi (thumbnail/outline/annots PDF viewer'ında var, aynı pattern)
- Sekmeler: `outline`, `linter`, `citegraph`, `suggest`, `history`
- Aynı anda **1 sekme** görünür
- Genişlik: 280px default, drag ile resize (mevcut `#pdfresize` pattern)

**DOM:**
```html
<div id="aqSidePanel" class="aq-side-panel" style="display:none">
  <div class="aq-side-tabs">
    <button data-tab="outline" title="Başlık haritası">☰</button>
    <button data-tab="linter"  title="APA linter">✓</button>
    <button data-tab="citegraph" title="Atıf grafiği">⇄</button>
    <button data-tab="suggest" title="Kaynak önerileri">★</button>
    <button data-tab="history" title="Versiyon">⟲</button>
  </div>
  <div class="aq-side-body">
    <div data-tab-content="outline"></div>
    <div data-tab-content="linter"></div>
    ...
  </div>
</div>
```

**Dokunulacak yerler:**
- Layout: `#ctr` flex içine sağdan giren panel (mevcut PDF panel resize pattern'ini taklit et)
- API: `openSidePanel(tabId)`, `closeSidePanel()`, `setSidePanelTab(id)`
- Komut paletine her sekme için kayıt

---

## Faz 1 — Yazım deneyimi

### 1.1 Outline panel (H1/H2/H3 navigator)
- Yan panel sekmesi: `outline`
- ProseMirror doc'unu walk et, heading node'larını çıkar → hiyerarşik liste
- Tıkla → cursor'ı o heading'e götür, view scroll
- Drag & drop ile bölüm sırası değiştir (ileri faz; önce sadece navigate)
- **Veri kaynağı:** editor state, mevcut `ensureScopedCurrentDoc` / `__aqCommitActiveDoc` pattern'inden aktif doc ID

### 1.2 Focus / Zen modu
- Aktif paragraf dışında tüm içeriği `opacity:0.35`
- CSS: `body.aq-focus .ProseMirror p:not(.aq-focus-active){opacity:.35}`
- Selection change → aktif paragrafı işaretle
- Komut paleti + `Ctrl+Shift+F`

### 1.3 Track changes (suggestion mode)
- Insert/delete'leri markup olarak sakla (`<ins data-author>`, `<del data-author>`)
- Üst bar'da **aktif modda** ince şerit: `İnceleme modu · 3 öneri · [Tümünü kabul] [Kapat]`
- Çıkınca şerit kaybolur, toolbar'a ikon eklenmez
- ProseMirror mark olarak suggestionInsert, suggestionDelete

### 1.4 CSL stil değiştirme
- Komut paleti: "Stili değiştir: APA 7 / Chicago / IEEE / Vancouver"
- CSL-JSON şablonları veya basit interpolasyon engine
- Kaynakça render fonksiyonunu (mevcut APA formatter) çoklu stile genişlet

---

## Faz 2 — Referans & veri

### 2.1 DOI / ISBN yapıştır
- `liblist` alanına paste dinleyicisi. Regex: `10\.\d{4,9}/[-._;()/:A-Z0-9]+`
- Eşleşirse Crossref (`https://api.crossref.org/works/{doi}`) fetch, metadata → yeni ref
- ISBN için OpenLibrary veya Google Books API
- **UI yok** — paste'ten sonra toast: "Kaynak eklendi: ..."

### 2.2 Duplicate detection
- Komut paleti: "Yinelenenleri tara"
- Fuzzy: normalize(title) + author surname + year
- Jaro-Winkler veya basit Levenshtein (kısa stringlerde iyi)
- Modal: yan yana 2 kart, "Birleştir / Ayrı tut / Atla"

### 2.3 Citation graph
- Yan panel sekmesi: `citegraph`
- Seçili `curRef`'in referanslarını (varsa) ve kütüphanedeki o kaynağa atıf yapanları görselleştir
- Basit SVG: merkezde current, çevresinde node'lar, edge'ler
- Veri: OpenAlex API (`https://api.openalex.org/works/doi:{doi}`) → `referenced_works`, `cited_by_count`
- **Cache** et (ref.id → result map)

### 2.4 Etiket & renk sistemi
- `ref.tags = ['thesis','empirical']`, `ref.colorDot = '#b6873f'`
- `lcard` sağ tık menüsüne "Etiket ekle" / "Renk ata"
- Kart sol kenarında 3px renk şeridi
- Komut paletinden "Etikete göre filtrele: thesis"

### 2.5 Okuma durumu
- `ref.readStatus = 'todo' | 'reading' | 'done'`
- Kart köşesinde 6px nokta (yeşil/turuncu/gri)
- Context menü toggle

### 2.6 Öneri kaynaklar (bağlamsal)
- Yan panel sekmesi: `suggest`
- Cursor'ın olduğu paragrafı OpenAlex / Semantic Scholar'a gönder (query olarak kritik 2-3 terim)
- Sonuç: 5 aday kaynak, "Kütüphaneye ekle" butonu (yeni minimalist `.related-act` stilimizi kullan)

---

## Faz 3 — PDF viewer

### 3.1 Highlight → not bağlantısı
- Seçim sağ tık → "Not olarak sakla"
- Not listesine (`#notelist`) yeni kart, PDF'teki highlight'a `data-note-id` ile bağlı
- Not kartına tıkla → PDF o sayfaya scroll + highlight flash
- Mevcut `pdf-annotation-export` altyapısı baz alınabilir

### 3.2 Side-by-side PDF compare
- Komut paleti: "İkinci PDF'i yan aç"
- `#pdfscroll` alanı ikiye bölünür (flex). İki ayrı pdfjs instance
- Senkron scroll opsiyonu (checkbox, status bar köşesinde)

### 3.3 Anotasyon full-text search
- Üstteki mevcut arama kutusuna scope dropdown: "Belge / Kütüphane / Anotasyonlar"
- Anotasyonlarda seçili: tüm ref'lerin `ref.annotations[]` içinde full-text

### 3.4 OCR
- PDF açılırken text layer yoksa (pdfjs `getTextContent` boş) background tesseract.js fetch
- `tesseract.js` worker'ı, her sayfayı canvas → OCR → text layer inject
- **Buton yok**, otomatik. Status bar: "OCR: sf 3/12"

### 3.5 TTS
- Seçim sağ tık → "Sesli oku"
- Web Speech API (`window.speechSynthesis`), tr-TR / en-US voice
- Status bar'da durdur/duraklat mini kontrol

### 3.6 Fullscreen scroll smoothness ✅
Faz 0'da hallettik — `content-visibility:auto`, GPU layer.

---

## Faz 4 — Kalite kontrolü

### 4.1 APA linter (inline + panel)
**Kurallar:**
- Kaynakçada olup yazıda atıflanmamış referans
- Yazıda atıflanıp kaynakçada olmayan
- DOI eksik (dergi makalesi için)
- Yıl eksik (t.y. değil, tamamen boş)
- "vb./ve diğ." yerine APA 7: & veya "et al."
- 3+ cümlelik paragraf, hiç atıf yok → dikkat (informational, severity low)

**Gösterim:**
- İnline: paragrafın sol kenarında 2px sarı/kırmızı çizgi (severity)
- Hover: tooltip kural adı
- Yan panel sekmesi: `linter` — kural listesi, tıkla → editörde o konuma git
- Status bar'da `APA ✓` veya `ⓘ 3 uyarı`

### 4.2 Okunabilirlik
- Flesch-Kincaid TR/EN
- Ortalama cümle uzunluğu
- Pasif cümle oranı (basit heuristic: "-ıldı / -ildi" sonları TR, "was/were + VpastPart" EN)
- Status bar: `58` — tıkla → detay modal

### 4.3 LanguageTool entegrasyonu
- Local veya `api.languagetool.org` (rate limited, kullanıcıya uyarı)
- Dalgalı altı çizgi, zaten browser spellcheck tarzı
- Sağ tık → öneri listesi

### 4.4 Atıf-kaynakça tutarlılık paneli
- 4.1'in alt grubu, ayrı panel değil

---

## Faz 5 — Performans & UX polish

### 5.1 Komut paleti ✅ (Faz 0)

### 5.2 Klavye cheat sheet
- `?` basınca modal, tüm AQCommands'dan kısayolu olanlar tablo
- `AQCommands` kaydında `shortcut:'Ctrl+Shift+F'` alanı

### 5.3 Auto-save rozeti
- Status bar sağ: `●` (kaydediliyor — turuncu), `✓` (kaydedildi — yeşil)
- Commit pattern'i mevcut `__aqCommitActiveDoc`

### 5.4 Versiyon geçmişi
- Yan panel sekmesi: `history`
- Her N kelimede veya N saniyede snapshot (throttle)
- Timeline: `18 Mar 14:32 · +247 kelime · giriş bölümü`
- Tıkla → diff modal (mevcut `docHistoryModal` zaten var, genişlet)

---

## Faz 6 — Veri çıkarma

### 6.1 Figure & tablo extractor
- PDF viewer sağ tık (sayfa üzerinde) → "Şekli seç" → drag-to-crop → PNG kaydet
- Canvas region'ı `toBlob`

### 6.2 Citation export formatları
- Mevcut export menüsünde **tek dropdown**: APA plain / BibTeX / RIS / CSL-JSON / Vancouver / Chicago
- Buton çoğalmasın

### 6.3 .aqresearch proje backup
- File menüde "Backup projesi" / "Restore"
- JSZip (zaten mevcut mu kontrol et, yoksa küçük shim yaz)
- İçerik: tüm workspace JSON + `ref.pdfData` blob'ları + notes + annotations

---

## Kaldırılan / dondurulan

- ❌ Dark mode / tema sistemi — mevcut warm-cream korunuyor
- ⏸ Overleaf bridge — ileri faz (API auth karmaşıklığı)
- ⏸ Web paylaşılabilir preview — backend gerektirir

---

## Anchors / mevcut kodda dokunulacak önemli yerler

| Amaç | Dosya:Satır (yaklaşık) | Not |
|---|---|---|
| Runtime file | `academiq-research.html` | **Tek** runtime. src/*.js yok |
| Ana process | `main.js:1991-2006` | HTML load path |
| Kütüphane card menü | `ensureInlineCardMenu` ~13700 | Context menu ekle |
| Referans liste menü | `showLabelMenu` ~5841 | Context menu ekle |
| Sidebar ref menü | `showSidebarRefMenu` ~13537 | Context menu ekle |
| PDF related render | `renderPdfRelatedPanel` ~11034 | Recursion guard `__pdfRelatedSyncing` var |
| Ana related render | `renderRelatedPapers` ~15145 | Override pattern kur |
| Web related runtime | `webRelatedRuntime` | Öneri sistemi burada |
| PDF scroll container | `#pdfscroll` CSS 1113 | Smoothness fix uygulandı |
| APA editor | `#apaed .ProseMirror` | ProseMirror core |
| Paste pipeline | `createApaPasteExtension` ~20976 | Word normalize burada |
| Word clean | `AQTipTapWordPaste.cleanPastedHTML` ~25218 | MSO artifact temizliği |
| Word normalize | `AQTipTapWordIO.normalizeWordHtml` | DOM normalize |
| Modal pattern | `.modal-bg` / `.modal` CSS | Yeni modal'lar için baz |
| Context menu pattern | `.ctxi` + `hideCtx()` | Inline menü standardı |
| İnline kart menü | `.lcard-inline-action` | Sidebar kart menü sınıfı |
| Tool state toggle | `updatePdfToolState` ~6355 | Yeni panel butonları buraya |
| Pagination (sorun kaynağı) | `_updateLineSplits` | Dokunma — hassas |

---

## Sıralı yol haritası (takip listesi)

**Sprint 1 — Altyapı (1-2 gün)**
- [ ] Komut paleti DOM + fuzzy matcher + registry
- [ ] Status bar DOM + updateStatusBar() + 5 default segment
- [ ] Sağ yan panel iskeleti + 5 boş sekme + F9 bind
- [ ] `AQCommands` global, Faz 0 testleri

**Sprint 2 — Yazım + referans temel**
- [ ] Outline paneli (1.1)
- [ ] DOI paste (2.1)
- [ ] Duplicate detection (2.2)
- [ ] Focus modu (1.2)

**Sprint 3 — Kalite + öneri**
- [ ] APA linter kuralları + inline işaretleme (4.1)
- [ ] Okunabilirlik (4.2)
- [ ] Öneri kaynaklar sekmesi (2.6)

**Sprint 4 — PDF gelişmiş**
- [ ] Highlight → not bağı (3.1)
- [ ] Anotasyon search (3.3)
- [ ] Figure extractor (6.1)

**Sprint 5 — Polish**
- [ ] Versiyon geçmişi (5.4)
- [ ] Cheat sheet (5.2)
- [ ] Export format dropdown (6.2)
- [ ] .aqresearch backup (6.3)

**Sprint 6 — İleri (opsiyonel)**
- [ ] Citation graph (2.3)
- [ ] Side-by-side PDF (3.2)
- [ ] Track changes (1.3)
- [ ] CSL stil değiştirme (1.4)
- [ ] OCR (3.4)
- [ ] TTS (3.5)
- [ ] LanguageTool (4.3)

---

## Codex için çalışma kuralları

1. **Her özellik önce `AQCommands`'a kayıt olarak eklensin**, sonra UI
2. **Yeni toolbar butonu önerme** — reddedilmeli
3. **`src/*.js`'e yazma** — runtime kullanmıyor. Her şey `academiq-research.html` içine
4. **`_updateLineSplits` / pagination clone sistemine dokunma** — ghost text hatasının kaynağı, hassas
5. **Context menu eklerken 3 yere birden**: `showLabelMenu`, `ensureInlineCardMenu`, `showSidebarRefMenu`
6. **Recursion guard pattern**: PDF-related ile main-related arasındaki gibi, karşılıklı çağıran render fonksiyonlarında modül-scope bool flag kullan
7. **Warm-cream paleti koru**: yeni renkler `--acc`, `--txt2`, `rgba(35,59,73,*)`, `rgba(214,202,184,*)` familyasından
8. **Yeni özellik → status bar'a tek rakam/ikon yansısın** mümkünse

---

_Son güncelleme: 2026-04-18_
