# RESUME / HANDOFF — AcademiQ (Tauri/React go-forward)

> Bu dosya bilinçli olarak repoya commit'lenir. Amaç: makine formatlansa /
> oturum sıfırlansa bile kaldığımız yerden devam edebilmek. Asıl güvence
> **bunun GitHub'a push'lanmış olması** (yerel disk ≠ yedek, OneDrive ≠ güvenilir
> yedek). Son güncelleme: 2026-06-03.

## 0) Format sonrası 0→çalışır akış
1. Araçları kur: git, Node (LTS), Rust + `cargo`/Tauri ön-koşulları.
2. `git clone https://github.com/cyrenard/academiq-research.git`
3. Çalışma dalı: **`editor/word-parity`** (her şeyi içeren entegrasyon dalı).
   - `git switch editor/word-parity`
   - (paralel debt işi için) `git worktree add ../debt debt/phase3-statestore`
4. `npm install`
5. Doğrula: `npx tsc --noEmit` (0 hata) + `npx vitest run` (tümü yeşil olmalı).
6. Çalıştır: `npm run tauri:dev`.

## 1) Dal haritası (ÖNEMLİ)
- **`editor/word-parity`** = GO-FORWARD. İçinde: APA-7 editör dizgisi, tablolar,
  appendix, track-changes, **comments**, **atıf-bul (citation finder)** + Gemini'nin
  strangler `win.S→appStore` migration'ı (merge edildi).
- **`debt/phase3-statestore`** = Gemini'nin teknik-borç dalı (notes/notebooks +
  research-matrix portları + doc-engine port HARİTASI). word-parity'e periyodik merge edilir.
- `origin/main` = eski beta tabanı; word-parity ondan çok ileride.

> ⚠️ Push durumu: bu dallar uzun süre **push'lanmamıştı** (upstream yok). Format
> riskinden ötürü push edilmeleri gerekti — eğer GitHub'da `editor/word-parity`
> görüyorsan güvendesin; görmüyorsan en güncel yer yereldi.

## 2) Mimari kısa notlar
- Editör motoru "aq-engine": `experiments/aq-engine/*.js` (UMD script-tag; engine.js
  reflow/pagination, document.js doc-model, compat-shim.js köprü). Bunlara dokunan
  değişiklik **tam reload** ister (HMR yetmez).
- APA başlık/bib/blok-alıntı stili TEK kanonik kaynak: `document.js`
  (`applyAPA7HeadingStyle` vb.); compat-shim + tiptap-adapter delege eder.
- React state: `src/renderer/lib/app-store.ts` (`appStore.getState/setState`,
  `useAppStore`). `setState` write-through ile `window.S`'e yazar (legacy-runtime.js
  hâlâ onu okur). Legacy→React: `window.__aqReactSyncFromLegacy` (OTOMATİK DEĞİL).
- Ağ: `window.electronAPI.netFetchJSON(url, opts)` → `{ok,data,error}` (CORS bypass).
- Engine köprüsü: `window.__aqEngineComments` (seçim/clipboard/comment/setCaret).

## 3) Atıf-bul (citation finder) — durum
Konum: `src/renderer/lib/citation-finder/{query,ranking,sentence-match,search}.ts`
+ `components/shell/CitationFinderModal.tsx` + tetik `components/shell/CommentsFeature.tsx`
(sağ-tık "Atıf bul"). Saf çekirdek + enjekte edilebilir `fetchJSON` ile test edilir
(`*.test.ts`, ~25 test). AI YOK (etik: kullanıcı orijinal cümleyi doğrular).
- Kaynaklar: Crossref (topikal `query=`), Semantic Scholar, OpenAlex (ters-indeks abstract).
- Çeviri: MyMemory TR→EN + akademik terim sözlüğü (`TERM_GLOSSARY`).
- Sıralama: `scoreCandidate` = 0.3 rel + 0.3 termCoverage + 0.2 cite + infl + 0.1 qual + recency + OA.
- `termCoverage` = `weightedOverlapScore` (öbek=4>uzun=2>kısa, tire normalize).
- Abstract backfill: `fetchOpenAlexAbstractByDoi` (Crossref abstract'sızsa doldur).
- `filterByCoverage` floor 0.15 + güvenlik ağı (<5 konu-içi → hepsini koru).
- Modal: "İlgi %N" rozeti, OA/quartile, destekleyen cümle, ZORUNLU "Doğruladım" checkbox.
- ERTELENEN (V2): AI/embedding cross-dil cümle eşleştirme; OA tam-metin cümle çıkarımı.

## 4) Teknik borç (strangler) — durum
- Mekanik `win.S` okuma taşıması BİTTİ. Kalan `win.S` kullanımları indirgenemez dikiş
  (legacy nesnesini kalıcılık için mutasyon, legacy-owned doc/matrix okuma).
- Gemini porte etti: notes/notebooks, research-matrix (mutasyon sonrası sync).
- KALAN: **doc-engine** (docs/curDoc/track-changes) hâlâ `src/legacy-runtime.js`
  (~14.6k satır) içinde. Port HARİTASI çıkarıldı (`DOC_ENGINE_PORT_MAP.md`), uygulama
  insan onayı bekliyor — tek hamlede değil, dilim dilim.
- Gemini prompt'u: `GEMINI_DOMAIN_PORT_PROMPT.md`.

## 5) Çalışma disiplini (kullanıcı kuralları)
- Editör mutasyonu **canlı `tauri:dev` doğrulaması olmadan güvenilmez** sayılır.
- Küçük slice / ayrı commit; her commit `tsc --noEmit` + `vitest` yeşil.
- Paralel ajanlar (Gemini/Codex) aynı worktree'de iş bırakabilir → SADECE kendi
  dosyalarını `git add` et, `git add -A` kullanma.
- Push/release sadece kullanıcı açıkça isteyince. Kimlik bilgisi GİRME.
- DOKUNMA bölgeleri (paralel sahipli): `citation-finder/**`, `CitationFinderModal`,
  `CommentsFeature`, `aq-engine/**` editör tarafı için; debt ajanı bunlara dokunmaz.

## 6) Açık doğrulama borcu
`editor/word-parity`'de çok commit canlıda toplu doğrulanmadı. Kullanıcı onayladı:
APA dizgi, ref sidebar, appendix ekle/sil, tablo ekle/sil, comments, atıf-bul ÇALIŞIYOR.
Doğrulanmamış: track-changes bulk+current; atıf-bul V2 iyileştirmeleri (backfill/filtre/rozet).
