# AcademiQ Research — Tauri + Rust Migrate Planı

> **Branch:** `migrate/tauri-rust`
> **Worktree:** `.claude/worktrees/migrate-tauri`
> **Hedef:** Electron 42 → Tauri 2, Node IPC → Rust komutları, JSON blob storage → SQLite + FTS5, hesaplama-yoğun JS modüllerini Rust'a taşı.
> **Süre tahmini:** 13-15 hafta (tek geliştirici, +1 hafta Faz 0.5 React shell mount için)
> **Felsefe:** aq-engine, Tiptap compat-shim, pdf.js viewer ve React UI **DOKUNULMAZ**. Sadece "host" katmanı (process, IPC, storage, ağ, export, OCR, spell) yeniden yazılır.

---

## 0. Mevcut Durum Özeti (Bağlam)

Codex'in kör başlamaması için kısa envanter:

- **Frontend**: React 19 + Vite + Tailwind 4 + Tiptap (vendored `tiptap-bundle.js`) + kendi yazılım `experiments/aq-engine/` (6201 satır) canvas tabanlı sayfalama motoru.
- **İKİ SHELL VAR — KRİTİK**:
  - **Yeni shell** (hedef): `src/renderer/` — React 19 + TypeScript + Tailwind. Entry: `src/renderer/main.tsx` → `App.tsx`. aq-engine bu shell içinde host edilecek.
  - **Eski shell** (legacy): `src/app-shell.js`, `src/lean-ui-shell.js`, `src/editor-shell.js`, `src/tiptap-shell.js` — vanilla JS, geriye uyumluluk için. Migrasyon sırasında **çıkarılmaz**, ama aq-engine **yeni shell'e** bağlanır.
- **Renderer state/iş modülleri**: `src/*.js` (~80+ modül) — citation, bibliography, library, literature matrix, document state, browser capture, OCR. Vanilla JS, **iki shell tarafından da kullanılıyor**, dokunulmaz.
- **Main process**: `main.js` (2352 satır) — 45 IPC handler, `preload.js` üzerinden `window.electronAPI` ve `window.ocrAPI` köprüsü.
- **Storage**: Tek JSON dosyası (`data:load`/`data:save`/`data:saveDraft`) + workspace başına PDF klasörü + docHistory snapshot dosyaları.
- **Bağımlılıklar**: `nspell` + `dictionary-tr` (spell), `pdf-lib` (PDF annotation), `tesseract.js` (OCR), `vendor/pdf.min.js` + `vendor/pdf.worker.min.js` (viewer), `vendor/mammoth.browser.min.js` (DOCX import), `vendor/html2pdf` (export).
- **Build**: `electron-builder` + NSIS, Windows-only, locale 1055.
- **Test**: `tests/*.test.js` (node:test) + `vitest` renderer testleri + `gate:editor` + `gate:release` script'leri.
- **Ekstra**: `browser-capture-extension/` (Chrome + Firefox), capture-agent Node sidecar mantığı `main.js` içinde.

### Neden Tauri?
- Setup boyutu: ~150 MB → ~15-25 MB
- Idle bellek: 250-400 MB → 80-150 MB
- Soğuk açılış: %40-60 daha hızlı
- Güvenlik: allowlist tabanlı IPC
- SQLite + FTS5 ile kütüphane araması ms ölçeğine düşer

### Neden Rust *her şey* değil?
- **aq-engine**: 6200 satırın %75'i DOM/Canvas/IME'ye bağımlı — Rust'tan dokunamaz.
- **Tiptap compat-shim**: JS API yüzeyi, port anlamsız.
- **pdf.js**: Browser-only zaten.
- **React UI**: WebView2'de aynen çalışır.

---

## 1. Genel Mimari (Hedef Durum)

```
┌─────────────────── Tauri Window (WebView2) ───────────────────┐
│  src/renderer/ — React 19 + TS + Tailwind (YENİ SHELL)        │
│  ├─ main.tsx → App.tsx                                        │
│  ├─ aq-engine (JS, DEĞİŞMEZ) — React komponenti içinden mount │
│  ├─ Tiptap compat-shim (JS, DEĞİŞMEZ)                         │
│  ├─ pdf.js viewer (JS, DEĞİŞMEZ)                              │
│  └─ window.electronAPI (TS shim — invoke wrapper)             │
│  Eski shell'ler (app-shell.js, lean-ui-shell.js, vb.)         │
│  yan yana kalır ama YENİ özellik almaz.                       │
└──────────────────────────┬────────────────────────────────────┘
                           │ tauri::invoke (JSON)
┌──────────────────────────▼────────────────────────────────────┐
│  Tauri Rust Core (src-tauri/)                                 │
│  ├─ commands::data     (SQLite + FTS5)                        │
│  ├─ commands::pdf      (lopdf / pdfium-render)                │
│  ├─ commands::spell    (spellbook)                            │
│  ├─ commands::ocr      (tesseract-rs veya sidecar)            │
│  ├─ commands::net      (reqwest)                              │
│  ├─ commands::export   (printpdf + docx-rs)                   │
│  ├─ commands::backup   (tokio::fs + zip)                      │
│  └─ commands::capture  (sidecar köprüsü)                      │
└──────────────────────────┬────────────────────────────────────┘
                           │ stdio / unix socket
┌──────────────────────────▼────────────────────────────────────┐
│  capture-agent (Node sidecar, geçici)                         │
│  Chrome/Firefox extension WebSocket köprüsü                   │
└───────────────────────────────────────────────────────────────┘
```

**Kritik prensip**: `window.electronAPI` imzası aynı kalacak. Renderer içindeki ~80 modül `electronAPI.foo(...)` çağırmaya devam edecek. Sadece preload yerine ince bir TS shim olacak:

```ts
// src/tauri-api.ts (yeni)
import { invoke } from '@tauri-apps/api/core';
export const electronAPI = {
  data: { load: () => invoke('data_load'), save: (j) => invoke('data_save', { json: j }), ... },
  pdf:  { save: (refId, buf, ws) => invoke('pdf_save', { refId, buf, ws }), ... },
  ...
};
window.electronAPI = electronAPI;
```

Bu sayede `src/`'de **tek satır JS değişmeden** çalışır.

---

## 2. Faz Faz Plan

Her faz: **Hedef → Yapılacak işler → Acceptance kriterleri → Risk**.

### Faz 0 — PoC & Karar Doğrulama (1 hafta) — ✅ DONE 2026-05-17

**Hedef**: Geçişin teknik olarak mümkün olduğunu kanıtla. "Fail-fast" engelleri şimdi bul.

**Yapılacaklar**:
1. `src-tauri/` iskeleti oluştur (`cargo install tauri-cli && cargo tauri init`).
2. Mevcut `dist/renderer` build'ini Tauri'nin `frontendDist`'ine bağla.
3. Geçici minimal `window.electronAPI` mock — `data:load` boş JSON döner, gerisi no-op.
4. **Dört smoke test** (manuel + otomatize):
   - [ ] aq-engine boş doc + 10 sayfalık örnek doc render ediyor mu (`tests/aq-engine-integration.test.js` baseline'ı çalıştır)
   - [ ] Türkçe IME: ğ, ş, ı, i, ö, ü, ç giriyor mu (dead-key + non-dead-key)
   - [ ] pdf.js worker `vendor/pdf.worker.min.js` WebView2'de yükleniyor mu (CSP + worker-src dahil)
   - [ ] Tiptap compat-shim → aq-engine geçişi (legacy çağrı: `editor.chain().focus().toggleBold().run()`)

**Acceptance**:
- 4 smoke test PASS.
- WebView2 versiyonu Win10 22H2'de minimum sürüm gereksinimi netleşmiş.

**GEÇ/KAL kapısı**: Herhangi biri FAIL ise Electron'da kal, planı iptal et.

**Risk**: Düşük (yatırım az). Sürpriz çıkarsa erken iptal sağlıklı.

---

### Faz 0.5 — aq-engine'i React Shell'e Mount (1 hafta) — **KRİTİK** — ✅ DONE 2026-05-17

**Hedef**: aq-engine şu an `src/app-shell.js` / `src/editor-shell.js` / `src/tiptap-shell.js` (legacy vanilla JS shell'ler) tarafından host ediliyor. Yeni `src/renderer/` (React + TS + Tailwind) shell'i içine taşı. Tauri açılışta DOĞRUDAN bu yeni shell'i render edecek.

**Neden bu faz var?** Tauri build'i `src/renderer/` Vite çıktısını yükleyecek. Eğer aq-engine hâlâ eski shell'e bağlıysa, Tauri shell'inde editor BOŞ açılır. Faz 1'deki IPC parity testleri yanlış zeminde koşar.

**Yapılacaklar**:
1. `src/renderer/components/Editor/` altında React komponenti oluştur (`AQEngineEditor.tsx`):
   - `useEffect` içinde `window.AQEngine.create(...)` çağır
   - DOM ref'ini engine'in render container'ı olarak ver
   - Cleanup: unmount'ta engine'i dispose et
2. `experiments/aq-engine/*.js` script'lerini Vite'a entegre et. İki yol:
   - **A** (önerilen): `index.html`'de `<script>` tag'leri olarak yükle (mevcut yöntem). React komponenti `window.AQEngine`'i bekler.
   - **B**: `import` statement'larıyla Vite bundle'a sok. Engine UMD pattern'i ([engine.js:51-54](experiments/aq-engine/engine.js)) zaten destekliyor, ama load order önemli.
   - **A**'yı seç — load order bozmamak için.
3. Tiptap compat-shim entegrasyonu: `src/renderer/lib/editor.ts` — `editor.chain().focus()...` çağrılarını yeni component'ten erişilebilir kıl.
4. `src/renderer/App.tsx` içine editor route'unu ekle. Mevcut `App.tsx`'in zaten ne yaptığını oku, dokunulması gereken minimum yer neresi tespit et.
5. **Eski shell'ler kalır** — `src/app-shell.js`, `src/editor-shell.js`, vb. silinmez. Sadece Tauri build'i `index.html` yerine `src/renderer/index.html`'i kullanır.
6. Vite config (`vite.config.js`): Tauri build'i için `root: 'src/renderer'`, `outDir: '../../dist/renderer'`.

**Acceptance**:
- [ ] `npm run dev:renderer` → `http://127.0.0.1:5173` açılıyor, React shell yükleniyor.
- [ ] React shell'in içinde aq-engine boş bir doc render ediyor.
- [ ] Türkçe yazılabiliyor, Tiptap compat-shim çağrıları çalışıyor.
- [ ] `tests/aq-engine-integration.test.js`'in 54 case'i React shell altında PASS.
- [ ] Eski Electron build (`npm start`) hâlâ eski shell ile açılıyor — bozulmadı.

**Risk**: Orta. Eski shell ile yeni shell arasındaki bağımlılık zinciri (state modülleri, doc-tabs-state, citation-state, vb.) `window.*` global'leri üzerinden konuşuyor. Yeni React shell de bu global'lere bağlı olduğu için load order kritik.

---

### Faz 1 — Tauri Shell + IPC Parity (2 hafta) — ✅ DONE 2026-05-17

**Hedef**: 45 IPC handler'ı Tauri command'larına 1-1 port. Davranış sıfır değişiklik.

**IPC envanteri** (main.js'den):

| Kategori | Handler'lar | Rust karşılığı |
|---|---|---|
| Window | `window:minimize/toggleMaximize/close` | `tauri::WebviewWindow` |
| Data | `data:load/save/saveDraft` | `tokio::fs` (Faz 2'de SQLite) |
| PDF storage | `pdf:save/load/exists/delete/showInExplorer/deleteWorkspaceFolder/syncAll/download` | `tokio::fs` + `reqwest` |
| Dialog | `dialog:openPDF` | `tauri-plugin-dialog` |
| Word import | `word:toHtml` | Geçici JS shim (mammoth tarayıcıda) veya `mammoth-rs` |
| Network | `net:fetch-json/text` | `reqwest` |
| Export | `export:pdf/docx`, `pdf:exportAnnotated` | **GEÇİCİ STUB** (Faz 5) |
| Sync | `sync:getSettings/setSyncDir/clearSyncDir` | `tokio::fs` + settings JSON |
| Backup | `backup:create/restore` | `tokio::fs` + `zip` |
| Browser capture | 12 handler (`browserCapture:*`) | **GEÇİCİ STUB** (Faz 6) |
| Doc history | `docHistory:get/restore` | `tokio::fs` |
| Update | `update:check/download/setUrl/restart` | `tauri-plugin-updater` |
| OCR | `ocr:recognize` | **GEÇİCİ JS shim** (Faz 4) |
| Local AI | `localMatrixAssistant:getStatus/rankCandidates/composeCells` | `reqwest` (HTTP LLM) |
| App | `app:openExternalUrl/getInfo`, `renderer:probeError` | Tauri shell plugin |

**Yapılacaklar**:
1. `src-tauri/src/commands/` altında modüller (`window.rs`, `data.rs`, `pdf.rs`, `net.rs`, vb.).
2. `src/tauri-api.ts` shim — `window.electronAPI` imzasını birebir kopyala.
3. `preload.js`'i siler — yerine shim TS Vite bundle'a girer.
4. CSP politikası `tauri.conf.json` üzerinde (pdf.js worker, blob: URL'leri, vb. izinleri tek tek belirle).
5. **`tests/ipc-parity.test.js`** yeni: Electron build vs Tauri build için aynı 45 çağrıyı yap, return tipini karşılaştır.

**Acceptance**:
- 45/45 IPC parity testi PASS (export ve browserCapture geçici stub kabul).
- Renderer kodu **değişmeden** açılıyor.
- Mevcut `tests/*.test.js` ve `vitest` Tauri build'inde PASS.

**Risk**: Orta — CSP & worker yükleme tuzakları, dosya yolu (forward vs backslash) farklılıkları.

---

### Faz 2 — SQLite + FTS5 Data Layer (2 hafta) — ✅ DONE 2026-05-17

**Hedef**: Tek JSON blob'tan ilişkisel SQLite'a geç. Library araması FTS5 ile.

**Yapılacaklar**:
1. `sqlx` (compile-time check) + `rusqlite` (bundled FTS5) ekle.
2. Şema (`src-tauri/migrations/0001_init.sql`):
   ```sql
   CREATE TABLE documents (id, title, body_json, created_at, updated_at);
   CREATE TABLE revisions (id, doc_id, snapshot_json, created_at);
   CREATE TABLE tabs (id, doc_id, position, active);
   CREATE TABLE library_items (id, title, authors, year, doi, abstract, pdf_path, ...);
   CREATE VIRTUAL TABLE library_fts USING fts5(title, authors, abstract, content=library_items);
   CREATE TABLE citations (id, doc_id, library_id, mode, ...);
   CREATE TABLE bibliography_entries (id, doc_id, library_id, csl_json);
   CREATE TABLE annotations (id, ref_id, page, type, data_json);
   CREATE TABLE highlights (id, ref_id, page, range_json, color);
   CREATE TABLE kv (key PRIMARY KEY, value);
   ```
3. **Migration kodu** (`commands/data.rs::migrate_legacy_json`):
   - İlk açılışta `userData/data.json` varsa oku
   - Tablolara dağıt
   - `data.json` → `data.json.bak.<timestamp>` taşı
   - `kv` tablosuna `migration_version=1` yaz
4. `src/document-state.js`, `src/library-state.js`, `src/bibliography-state.js`, `src/citation-state.js`, `src/annotation-state.js`, `src/highlight-state.js` — `electronAPI.data.load/save` çağrılarını incele. Çoğu zaten "tek blob" düşünüyor; tek tek `docs:save(id, body)` gibi granuler API'ye geçilebilir.
5. **Geri uyumluluk**: ilk sürümde `electronAPI.data.load()` hala tek blob render eder (Rust tarafı tabloları birleştirip JSON döner). Faz 2'nin amacı **disk şemasını değiştirmek**; renderer API'sini değiştirmek opsiyonel.

**Acceptance**:
- Mevcut `data.json`'lu kullanıcı SQLite'a geçiyor, hiçbir veri kaybı yok.
- Library araması (1000+ entry'de) <50ms.
- `tests/data-migration.test.js` yeni: synthetic legacy JSON → SQLite round-trip.

**Risk**: Orta. Veri kaybı riski → backup ZORUNLU, `data.json.bak` her zaman tutulsun.

---

### Faz 3 — PDF Storage + Annotation Rust Tarafı (1 hafta)

**Hedef**: Workspace-bazlı PDF dosya yönetimini Rust'a al, annotation yazımı için pdf-lib'i değiştir.

**Yapılacaklar**:
1. `pdf:save/load/exists/delete` → `tokio::fs` (zaten Faz 1'de yapıldı, burada cilalanır).
2. **Annotation yazma**: `src/local-ocr.js` ve diğer "PDF'e text/highlight yaz" akışları `pdf-lib` (JS) kullanıyor. → `lopdf` veya `pdfium-render` Rust komutuna geç. API:
   ```rust
   #[tauri::command]
   async fn pdf_apply_annotations(ref_id: String, ws: String, annotations: Vec<Annotation>) -> Result<()>
   ```
3. PDF metadata (sayfa sayısı, başlık, yazar) cache → SQLite `library_items` tablosuna.
4. pdf.js viewer aynen kalır.

**Acceptance**:
- 100+ sayfa PDF'te annotation yazma <2s (Electron baseline ile karşılaştır).
- pdf-lib bağımlılığı `package.json`'dan kaldırılabilir.

**Risk**: Düşük.

---

### Faz 4 — Spell + OCR + Network (2 hafta)

**Hedef**: Hesaplama-yoğun JS modüllerini Rust'a taşı.

#### 4a. Spell (3 gün)
- `nspell` → `spellbook` (Hunspell uyumlu, 10-50× hızlı).
- `dictionary-tr` `.aff`/`.dic` dosyaları aynen kullanılır (`scripts/sync-dictionary.js` Rust binary'sine bundle eder).
- API:
  ```rust
  #[tauri::command]
  fn spell_check(text: String) -> Vec<SpellIssue>
  #[tauri::command]
  fn spell_suggest(word: String) -> Vec<String>
  ```
- Mevcut `SpellcheckPanel` ([commit 64545c9](../../../commit/64545c9)) UI'ı değişmez.

#### 4b. OCR (4 gün)
- Seçenek A: `tesseract-rs` (native binding, 2-3× hızlı, 50MB binary).
- Seçenek B: `tesseract.js` Web Worker olarak kalmaya devam (sıfır iş).
- **Öneri**: Önce B'de bırak, ölç, gerek varsa A'ya geç. `tesseract.js` zaten worker'da, ana thread'i bloklamaz.

#### 4c. Network (3 gün)
- `net:fetch-json/text` zaten Faz 1'de `reqwest`'e geçti. Burada cilalanır:
  - HTTP/2, connection pooling
  - CrossRef/DOI/PubMed rate limiting
  - Etag/cache

**Acceptance**:
- Spell: 10K kelimelik dokümanda hata listesi <100ms.
- OCR: baseline ile aynı veya hızlı.
- Network: 100 concurrent fetch'te memory <50MB.

**Risk**: Düşük.

---

### Faz 5 — Export: PDF & DOCX (2 hafta) — **YÜKSEK RİSK**

**Hedef**: Electron'un `webContents.printToPDF` API'si gitti. PDF üretimi Rust tarafında.

#### 5a. PDF Export (10 gün)
**Sorun**: Mevcut akış `webContents.printToPDF` ile WebView'ı bastırıyor. Tauri'de bu yok.

**Seçenekler**:
1. **aq-engine layout → printpdf** (önerilen):
   - aq-engine zaten `paginate()` ile sayfa-bazlı layout üretiyor ([experiments/aq-engine/engine.js:353](experiments/aq-engine/engine.js)).
   - Layout JSON'unu Rust'a gönder.
   - Rust'ta `printpdf` veya `pdf-writer` ile font dosyalarını embed et, line/span'ları çiz.
   - **Kritik**: Font metrics tutarlılığı. Renderer Canvas.measureText kullanıyor, Rust ttf-parser kullanmalı. Test: aynı 100 paragraflık doc → Canvas ve ttf-parser ölçümleri ±0.5px içinde olmalı.
2. **Headless chromium sidecar**: `chromiumoxide`. +100MB binary. Yapma.
3. **WebView2 print**: header/footer kontrolü yok, kabul edilemez.

**Plan**:
- (1)'i seç.
- `src-tauri/src/commands/export.rs::export_pdf(doc_id) -> Vec<u8>`
- aq-engine layout JSON'unu serialize et (zaten internal struct'lar var).
- Times New Roman + Arial + Calibri TTF'lerini binary'ye bundle.
- APA header/footer (running head + page number) Rust tarafında.

#### 5b. DOCX Export (4 gün)
- Mevcut [src/docx-export.js](src/docx-export.js) tarayıcıda çalışıyor — JS olarak kalabilir.
- **Öneri**: JS'de bırak, dokunma. Rust port'u +1 hafta kazanç ~0.

**Acceptance**:
- 50 sayfa APA dokümanı export → PDF byte-byte değil ama görsel olarak baseline ile aynı (manuel inceleme).
- Mevcut [scripts/export-quality-gate.js](scripts/export-quality-gate.js) PASS.

**Risk**: **Yüksek**. Font metrics sapması yaşanırsa Faz 5 1-2 hafta uzar.

---

### Faz 6 — Browser Capture Sidecar (2 hafta) — **YÜKSEK RİSK**

**Hedef**: Chrome/Firefox extension köprüsünü Tauri'de yeniden kur.

**Mevcut yapı**:
- `browser-capture-extension/chromium/` ve `/firefox/` — extension kodu.
- `src/main-process-browser-capture*.js` (5 dosya) — Node'da çalışan capture-agent + queue dispatcher + WebSocket köprüsü.
- 12 IPC handler renderer ↔ main.

**Plan**:
1. capture-agent JS modüllerini ayrı bir Node binary'ye bundle et (`pkg` veya `nexe`).
2. Tauri sidecar olarak çalıştır ([tauri-bundler sidecar docs]).
3. Rust ↔ sidecar: stdio JSON-RPC (her satır bir mesaj).
4. Renderer ↔ Rust köprüsü `electronAPI.browserCapture.*` aynı imza.
5. Extension manifestlerinde port/URL değişmez.

**Alternatif** (yapma): capture-agent'ı tam Rust port — 4 hafta ek iş, sıfır kullanıcı kazancı.

**Acceptance**:
- Chrome extension'dan capture → app'te görünme akışı çalışıyor.
- Firefox aynı.
- Workspace yaratma + ack akışı çalışıyor.

**Risk**: Yüksek. Extension protokolü dokümante değil — kod okuma + reverse gerekecek.

---

### Faz 7 — Updater + Signing + Release Pipeline (1 hafta)

**Yapılacaklar**:
1. `tauri-plugin-updater` ekle, mevcut `update:check/download/setUrl/restart` API'siyle wrap et.
2. `tauri.conf.json::bundle::windows` — NSIS template, mevcut [package.json](package.json) `build` parametrelerini taşı:
   - `productName: "AcademiQ Research"`
   - `language: 1055`
   - `oneClick: false`
   - `allowToChangeInstallationDirectory: true`
   - icon, shortcut name
3. Code signing: EV cert varsa imzala, yoksa SmartScreen reputation süresi (yeni binary için 1-2 hafta).
4. Build script: `scripts/build-tauri.js` (eski [build-win.js](scripts/build-win.js)'in Tauri muadili).
5. `scripts/release-gate.js` ve `scripts/editor-stability-gate.js` Tauri build'i kontrol edecek şekilde adapte.

**Acceptance**:
- `npm run build` → NSIS installer üretir.
- Eski sürümden auto-update → yeni sürüm sorunsuz açılır, kullanıcı verisi taşınır.

**Risk**: Orta — code signing trafiği yeni binary olduğu için SmartScreen'i tekrar "öğretmek" gerek.

---

### Faz 8 — Dual-Run & Cutover (1-2 hafta)

**Hedef**: 1-2 hafta paralel kullanım, ardından Electron sürümünü emekli et.

**Yapılacaklar**:
1. Electron sürümünü `legacy-electron` branch'inde dondur.
2. Tauri build'ini `beta` kanalında 1.24.0-beta.X olarak yayınla.
3. **Kıyas testleri** (otomatize):
   - Aynı `data.json` her iki build'de aç → render diffini al
   - 54 case [tests/aq-engine-integration.test.js](tests/aq-engine-integration.test.js) iki build'de de PASS
   - 10 farklı doc için PDF export çıktı boyutu ve sayfa sayısı eşleşmeli
4. Telemetri: crash report, "compatibility" event.
5. 2 haftalık dual-run sonunda crash rate <Electron baseline + %10 → cutover.
6. 1.24.0 stable yayını.

**Acceptance**:
- Beta'da 2 hafta sıfır kritik regresyon.
- Kullanıcı verisi tek seferlik migration sırasında **sıfır** kayıp.

**Risk**: Düşük (Tauri tarafı zaten Faz 0-7'de test edildi). En büyük risk: kullanıcının bilgi gerektirmeden update alması.

---

## 3. Risk Özeti

| Risk | Olasılık | Etki | Azaltma |
|---|---|---|---|
| PDF export font metrics sapması | Orta | Yüksek | Faz 5 prototip, ±0.5px gate |
| Türkçe IME WebView2'de bozulur | Düşük | Yüksek | Faz 0 gate (geç/kal) |
| capture-agent sidecar protokol bug'ları | Yüksek | Orta | İlk sürüm Node sidecar, prod'da Rust'a port etme |
| Auto-update v1.23 → v1.24 kullanıcıyı kırar | Orta | Yüksek | Manuel migration butonu fallback |
| SQLite migration veri kaybı | Düşük | Kritik | `data.json.bak` her zaman tutulur, rollback komutu |
| WebView2 versiyonu eski Windows'ta yok | Düşük | Orta | Bootstrapper installer (Evergreen) |

---

## 4. Yapma Listesi (Anti-Pattern)

- **aq-engine'i Rust'a portlama**: 6200 satırın %75'i DOM bağımlı, kazanç %21, risk yüksek.
- **Tiptap compat-shim'i kaldırma**: legacy çağrılar [src/](src/)'de yüzlerce yerde, refactor risk yüksek.
- **macOS/Linux'e aynı anda genişleme**: +4-6 hafta. Önce Windows stabilize.
- **Tek seferde production release**: dual-run zorunlu.
- **`pdf-lib`'i hemen kaldırma**: Faz 3 sonuna kadar tut, çakışma olmasın.
- **Renderer API'sini birinci sürümde değiştirme**: `electronAPI` aynı imza kalsın, sonra v2 yap.

---

## 5. Codex İçin Notlar

**Birinci öncelik**: Bu plan **iskelet**. Codex bir faza başlamadan önce o fazdaki dosyaların **mevcut hâlini** okumalı (özellikle `main.js`, `preload.js`, ilgili `src/*-state.js` dosyaları). IPC imzasını birebir kopyalamak için renderer çağrı sitelerini grep'lemeli:

```bash
grep -rn "electronAPI\." src/ | sort -u
grep -rn "ocrAPI\." src/ | sort -u
```

**İkinci öncelik**: Her faz `migrate-plan.md`'deki acceptance kriterleri sağlanmadan kapanmaz. Acceptance kriterleri otomatize test olarak yazılmalı (`tests/migration-phase-N.test.js` gibi).

**Üçüncü öncelik**: Hiçbir faz `experiments/aq-engine/` veya `vendor/`'a dokunmaz. Eğer dokunmak gerektiği hissedildiyse plan yeniden gözden geçirilmeli — yanlış soyutlamadan kaynaklanıyor olabilir.

**Dördüncü öncelik**: Her fazın sonunda:
1. `git commit` (faz başlığıyla)
2. `npm test && npm run test:renderer` PASS
3. `migrate-plan.md`'ye o fazın "Done" işareti

---

## 6. Faz 0 Başlangıç Checklist'i

```
[ ] cargo install tauri-cli@^2
[ ] cd <worktree> && cargo tauri init
    - frontendDist: ../dist/renderer
    - devUrl: http://127.0.0.1:5173 (Vite)
    - identifier: com.academiq.research
[ ] src-tauri/tauri.conf.json düzenle:
    - bundle.windows: NSIS, ico, locale 1055
    - app.security.csp: pdf.js worker için worker-src 'self' blob:
    - app.windows: title "AcademiQ Research"
[ ] preload.js davranışını taklit eden src/tauri-api.ts iskelet
[ ] npm run dev:renderer && cargo tauri dev
[ ] 4 smoke test manuel olarak doğrula
[ ] tests/smoke-tauri.test.js otomatik PASS
[ ] Karar: GEÇ / KAL
```

---

## 7. Versiyonlama

- Tüm migrate çalışması `migrate/tauri-rust` branch'inde.
- Her faz kendi alt branch'i (`migrate/tauri-rust/phase-0-poc`, `phase-1-ipc`, ...).
- Faz sonu → `migrate/tauri-rust`'a merge.
- Production cutover → `main`'e merge + 1.24.0 tag.

---

**Son söz**: Bu plan deterministik değil. Faz 0 ya da Faz 5'te beklenmedik bir engele çarpılırsa plan yeniden değerlendirilmeli. **Hiçbir faz, kullanıcıyı bozarak ilerletilmemeli.**
