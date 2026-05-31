# aq-engine → Word-yakınlığı & APA 7 yazım kalitesi: yol haritası

## Yönelim
**Birincil track = yazım/dizgi sadakati: çıktının Word'deki APA 7 görünümüne yakınlaşması.** İkincil track = yeni özellikler. Karar verildi: aq-engine KORUNUYOR ve geliştirilecek (gerçek sayfalama/reflow'u var; ProseMirror/TipTap bunu yerel yapmaz). Ana referans noktamız **APA 7**.

## Motorun mevcut APA-7 tabanı (ölçüldü — iyi durumda)
- Sayfa: A4, 1" kenar boşluğu (72pt), **çift satır aralığı** (lineHeightFactor 2.0). ✅
- **5 seviyeli APA başlık sistemi** (document.js:651-674): L1 ortalı+bold; L2 sola+bold; L3 italik; L4/L5 0.5" girintili **run-in** (metin aynı satırda); L5 italik. ✅
- Kaynakça stili kancası: `applyAPA7BibliographyEntryStyle` (compat-shim.js:161). 🟡 (asılı girinti doğrula)
- Liste, dipnot, tablo, görsel, track-changes, bul/değiştir, IME, undo/redo. ✅

## Track A — Word/APA-7 yazım kalitesi sadakati (BİRİNCİL)

### Faz 0 — APA-7 "golden belge" doğrulama ağı (önkoşul)
Custom motor, birim-test zayıf. Önce regresyon ağı:
1. **APA-7 golden belge fixtür'leri**: başlık (5 seviye), gövde paragrafı, blok alıntı, kaynakça, tablo/şekil içeren örnek dokümanlar. `docModel` + reflow çıktısının (satır kırılımı, girinti, hizalama, sayfa sayısı) anlık görüntüsünü dondur. jsdom'da çalışan kısımlar + reflow için küçük **WebView (Playwright/Tauri) harness**.
2. Karakterizasyon kuralı: önce mevcut davranışı dondur, düzeltmeyi ayrı etiketli commit'te yap.
3. Mevcut `tests/aq-engine-integration.test.js` (751 satır) tabanını genişlet.

### Faz 1 — APA-7 sadakat denetimi & düzeltmeleri (somut, ölçülen boşluklar)
1. **Başlık sistemi tam APA-7 uyumu:**
   - L1 şu an `tr-TR` ile **ALL CAPS** (document.js:669) — APA 7 = **Title Case** ortalı bold. KARAR: "APA modu" (Title Case) vs "YÖK/Tez modu" (UPPERCASE) — doküman ayarına bağla; varsayılan APA.
   - L4/L5 run-in başlık sonuna **nokta** + Title Case yardımcı; gövde aynı satırda.
   - Title Case fonksiyonu (APA istisna kelimeleri: bağlaç/edat küçük) — `reference-format.ts` başlık mantığıyla tutarlı.
2. **Gövde paragrafı ilk-satır girintisi 0.5" (36px):** şu an girinti yalnız başlıklara atanıyor; gövde varsayılanı 0 → APA ihlali. Yeni paragraf + içe-aktarmada gövdeye 0.5" ilk satır girintisi (blok alıntı, başlık, liste hariç).
3. **Kaynakça:** "Kaynakça/References" ortalı bold; girişler **0.5" asılı girinti**, çift aralık, alfabetik (reference-format zaten sıralıyor). `applyAPA7BibliographyEntryStyle` çıktısını golden'la doğrula/düzelt.
4. **Blok alıntı (40+ kelime):** 0.5" sol girinti, tırnaksız, çift aralık, ilk-satır girintisi yok.
5. **Satır aralığı/boşluk sadakati:** her yerde çift aralık; APA'da paragraflar arası ek boşluk YOK — motorda fazladan boşluk olmadığını doğrula.
6. **Hizalama & satır kırma (Word-fidelity'nin çekirdeği):** APA = sola hizalı, sağ tırağı serbest, **tireleme yok**. Motorun satır-kırma + metin-ölçüm (font metrics) algoritmasının Word'e yakın kırması — en zor ve en değerli kalem; golden + WebView ile ölç.
7. **Dul/yetim & başlıkla-birlikte-tut:** başlık sayfanın son satırı olmasın; paragraf tek satır taşmasın (Word davranışı).
8. **Sayfa öğeleri:** sağ-üst sayfa numarası; (profesyonel) running head; APA başlık sayfası şablonu.
9. **Tablo/şekil APA biçimi:** numara + italik başlık + not satırı.
10. **Font sadakati:** APA-kabul fontları (Times New Roman 12 / Calibri 11 / Arial 11…); seçilen fontun metin-ölçümde doğru kullanılması (kırılmaların Word'le eşleşmesi).

## Track B — Yeni özellikler (İKİNCİL, paralel)
- Tablolarda **hücre birleştir/böl** + kenarlık/gölge + sütun genişliği (colspan/rowspan şu an yok).
- **Yorumlar (comment threads)** — track-changes altyapısını paylaşır.
- **Adlandırılmış stil galerisi** (APA stilleri preset olarak: Başlık 1-5, Gövde, Alıntı, Kaynakça).
- Görsel sarma+caption+resize; Word'den **yapıştırma sadakati**; **denklem (KaTeX)**; son not; tab durakları; tam RTL; erişilebilirlik.

## Çalışma disiplini (her kalem)
1. doc-model değişimi → **golden test** (jsdom). 2. reflow/görsel etki → **WebView senaryosu**. 3. UI 1:1 referans. 4. **Editör mutasyonu canlı `tauri:dev` doğrulaması olmadan merge edilmez.** 5. docx/pdf export'a yansıma. 6. Küçük slice + ayrı commit; tsc + vitest yeşil.

## Önerilen sıra
Faz 0 (APA golden ağı) → A1 başlıklar → A2 gövde girinti → A3 kaynakça → A4 blok alıntı → A5/A6 aralık+satır-kırma → A7 dul/yetim → A8 sayfa öğeleri → A9 tablo/şekil → (paralel) Track B. Faz 0 olmadan başlama: ağ olmadan dizgi düzeltmeleri sessiz regresyon üretir.
