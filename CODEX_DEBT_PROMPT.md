# Codex görev brifingi — Tauri/React legacy-JS teknik borç ödemesi (strangler)

## Bağlam (oku, sonra başla)
AcademiQ akademik yazım uygulaması. **İleriye dönük seçilen ürün bu Tauri/React/Rust uygulamasıdır** (native WPF değil) çünkü macOS desteği yaklaşıyor ve WPF yalnızca Windows. React/TS renderer (~25.7k LOC) hâlâ eski vanilla-JS motorunun üstünde bir **kabuk**: `academiq-research.html` (40.310 satır), `src/legacy-runtime.js` (14.835), `src/renderer/components/shell/LegacyCompatibilityHost.tsx` (2.632). Editör motoru **in-house "aq-engine"** (`editor._aqEngine`, `editor._docModel`, `experiments/aq-engine/`), **TipTap DEĞİL** — `AQTipTapWord*` sadece eski isimler.

Kök kuplaj: global `window.S`. Ekip erişimi tipli bir seam'in arkasında topladı: `legacyWin()`, `callLegacy()`, `src/renderer/types/legacy-window.d.ts`. React→legacy yazma: `publishStateToLegacyWindow` (legacy-state-bridge.ts). Phase 2'de bir dış store eklendi: `src/renderer/lib/app-store.ts` (`appStore`, `useAppStore`, `useSyncExternalStore`); App.tsx artık `useAppStore` kullanıyor; çift yönlü senkron korunuyor (forward: `useEffect[appState]→publishStateToLegacyWindow`; reverse: `window.__aqReactSyncFromLegacy`→`appStore.setState`).

## Repo & komutlar
- Yol: `C:\Users\iceti\OneDrive\Masaüstü\academiq-research-2.1.18\.claude\worktrees\migrate-tauri`
- Branch: `debt/strangler` (üstüne devam et; `migrate/tauri-rust`'tan ayrıldı).
- Typecheck: `npx tsc --noEmit` (TEMİZ kalmalı).
- Testler: **`npx vitest run`** (renderer `src/renderer/**/*.test.ts` = vitest, jsdom). DİKKAT: package.json'daki `test` script'i (`node --test tests/*.test.js`) AYRI bir node:test suite'i — onu çalıştırma/karıştırma.
- Şu an yeşil taban: **39 dosya / 590 test**, tsc temiz.

## Demir kurallar (ihlal etme)
1. **Birebir (1:1) sadık port.** Legacy davranışını AYNEN üret: aynı regex'ler, aynı `parseInt`/`String()` zorlamaları, aynı sıralama/yan-etki sırası, aynı Türkçe karakter tuhaflıkları. Legacy bir bug içeriyorsa onu da koru (karakterizasyon = mevcut davranışı dondur, "düzeltme" yapma). Örnek korunması gereken tuhaflıklar: `normalizeRefDoi` sondaki tek harfli `/X`'i atar; `authorSearchText` "Soyad, Ad" için çift boşluk üretir; başlıklar düz `toUpperCase()` (ı→I); `getAppendixTitleText`→`"EK-"+n`; `deleteAQEngineAppendix` `parseInt(blockIndex,10)` kullanır; `normalizeAQAppendixTitle` dotless `ı`'yı katlar ama `İ.toLowerCase()` birleşik noktasını KATLAMAZ.
2. **Her port için vitest karakterizasyon testi** yaz (legacy çıktısını referans alan). tsc temiz + tüm suite yeşil olmadan commit etme.
3. **Hiçbir legacy dosyasını silme** (Phase 5'e kadar). Strangler: yeni TS modülü yaz, çağrı yerini ona bağla, legacy global'i fallback olarak bırak.
4. **EDİTÖRÜ MUTASYONA UĞRATAN aq-engine portlarını CANLI doğrulama olmadan WIRE ETME.** `docModel.replace`/`editorRef._reflow`/`emit('update')` içeren her şey yalnızca gerçek uygulamada (`npm run tauri:dev`) test edilebilir — jsdom'da değil. Bunları sadık port + birim test (mock `editorRef`/`_docModel` + enjekte edilen yan-etki bağımlılıkları) ile hazırla, AMA "insan tarafından tauri:dev'de doğrulanacak" diye işaretle ve TopToolbar/çağrı yerine bağlamayı beklet. (Önceki bir ajan bunu görmezden gelip sadakatsiz, bağlanmamış ölü kod üretti; geri alındı.) Sağlıklı desen örneği zaten mevcut: `src/renderer/lib/aq-engine/appendix-engine-core.ts` (`deleteAQEngineAppendix` portu — yan-etkiler `AppendixDeleteDeps` ile enjekte, çağrı yeri TopToolbar try/catch ile bağlı, legacy global fallback).
5. **Saf (pure) ve durum (state) işlerini önceliklendir** — bunlar tam test edilebilir ve güvenle merge edilebilir. Belirsiz bir şeyde takılırsan, dur ve o slice'ı "insan kararı bekliyor" diye not et.

## Yapılacak işler — öncelik sırasıyla, küçük slice'lar halinde

### A. Güvenli, saf, tam test edilebilir (önce bunları yap, her biri ayrı commit)
1. **Referans veri yardımcıları** legacy'den port + mevcut `src/renderer/lib/reference-format.ts`'e ekle veya komşu modül: `normalizeRefRecord` (3 kullanım), `mergeRefFields` (2), `updateRefSection` saf kısmı (3). legacy-runtime.js'de bul, 1:1 port et, karakterizasyon testleri ekle, çağrı yerlerini (`win.normalizeRefRecord` vb.) TS'e çevir, legacy global'i fallback bırak.
2. **Atıf/kaynakça**: `visibleCitationText` (4 kullanım) ve `setCitationStyle`/`getCurrentDocument` saf kısımları zaten `citation-builder.ts`'de kısmen var — kalan legacy global çağrılarını TS modülüne yönlendir.
3. **quality-surface.ts** (7 `.S` erişimi) ve **spellcheck-controller.ts** (3): `window.S` okumalarını `appStore` selector'larına (`selectWorkspaceLibrary`/`selectReferenceById` ya da yeni eklenecek selector'lar) çevir. Saf seçim mantığını ayır + test et.

### B. Phase 3 — durum store'unu tamamla (window.S okumalarını kes)
Hedef: React'in `legacyWin().S` / `win.S` DOĞRUDAN okumalarını sıfıra indir; her şey `appStore` selector'larından gelsin. En yoğun okuyucular: `editor-adapter.ts` (26), `LegacyCompatibilityHost.tsx` (20), `legacy-doc-helpers.ts` (7), `legacy-state-bridge.ts` (5), `legacy-dom-helpers.ts` (5), `file-import.ts` (4), `external-reference-import.ts` (3). Her dosya için: gereken selector'ları `app-store.ts`'e ekle (saf, test edilebilir), okuma yerlerini selector'a çevir, çift yönlü senkronun korunduğunu doğrula (forward+reverse hook'lar). Yazma yolları (`publishStateToLegacyWindow`) bozulmamalı. Bir slice = bir dosya; her birinde tsc+vitest yeşil.

### C. macOS hazırlığı (saf denetim + guard)
Windows'a özgü varsayımları tara ve platform-guard ekle (davranışı Windows'ta değiştirmeden): `window.electronAPI?.netFetchJSON` (DOI/metadata fetch native bridge — macOS/Tauri karşılığı doğrulanmalı), path ayraçları/`\\` varsayımları, `windows` crate kullanımları (Rust tarafı zaten `#[cfg(target_os="windows")]` ile gated — ocr.rs; bozma). CI'da macOS job zaten var (`.github/workflows/ci.yml`) ama gerçek macOS build çalıştırılmadı; varsayımları kodda işaretle.

### D. aq-engine portları — SADIK PORT + BİRİM TEST, ama WIRE ETME (insan tauri:dev'de doğrulayacak)
`appendix-engine-core.ts` desenini izle. Sıradaki adaylar (hepsi editör mutasyonu → canlı doğrulama şart): `captureEditorListStyleSelection` (4 `callLegacy`), `restoreEditorListStyleSelection` (2), `runEditorMutationEffects` (5), `updateAQEngineAppendices` (1), `toggleTrackChangesMode` (1). Her biri için: yan-etkiler enjekte edilen bir çekirdek modül + mock editör ile birim test + "PENDING tauri:dev verification" notu. Çağrı yerine BAĞLAMA — ayrı bir bağlama adımını insan onayına bırak.

## Çıktı formatı (rapor)
Her slice için: (1) hangi legacy fonksiyon(lar), satır no; (2) oluşturulan/değişen TS dosyaları; (3) korunan legacy tuhaflıkları; (4) eklenen test sayısı; (5) `npx tsc --noEmit` + `npx vitest run` sonucu (dosya/test sayısı); (6) commit hash; (7) "insan doğrulaması gerekiyor mu?" (D grubu = EVET). Belirsizlik/karar gereken her yerde DUR ve sor — sadakatsiz tahmin yapma.
