# Editor Recovery Notu (A4 + Pagination)

Bu not, editör davranışı tekrar bozulursa uygulanacak referans çözümü sabitlemek için eklendi.

## Sabit Kalacak Doğru Yaklaşım

1. A4 metrikleri tek kaynaktan yönetilecek:
   - `--aq-page-width`, `--aq-page-height`, `--aq-page-margin`, `--aq-page-gap`
   - `--aq-page-content-width`, `--aq-page-content-height`
2. Yazı alanı sadece content surface içinde kalacak:
   - `#aq-tiptap-shell` / `#aq-tiptap-body` / `#aq-tiptap-content`
   - `pointer-events` sahipliği shell yerine content tarafında.
3. Pagination metriği runtime’da CSS’ten ölçülecek:
   - `resolvePageMetrics(...)`
4. Sayfa geçişi blok seviyesinde gap ile yapılacak:
   - `applyPageGaps(...)` ile taşan blok bir sonraki sayfa başlangıcına alınacak.
5. Sayfa sheet arka planları `pageTotalHeight` adımıyla render edilecek:
   - `renderPageSheets(...)`
6. Legacy spacer/overlay kırıkları kullanılmayacak:
   - `.pg-spacer`, `.aq-page-break-widget`, eski overlay hackleri aktif akışta olmayacak.

## Bozulursa Uygulanacak Kontrol Sırası

1. Global CSS değişkenlerini doğrula (`academiq-research.html`).
2. Shell/content ayrımını doğrula (`src/tiptap-shell.js` ve sayfadaki override CSS).
3. `syncPageMetrics -> resolvePageMetrics -> applyPageGaps -> renderPageSheets` zincirini doğrula (`src/tiptap-word-layout.js`).
4. Eski fallback’in yeni akışı ezmediğini doğrula (`updatePageHeight` override noktaları).
5. Test:
   - Metin sayfalar arası görsel boşluğa düşmemeli.
   - Yazı sadece 1 inç iç sınırlar içinde akmalı.
   - 2. sayfa ve sonrası ilk sayfa ile aynı kenar boşluğu davranışında olmalı.

## Referans Dosyalar

- `academiq-research.html`
- `src/tiptap-shell.js`
- `src/tiptap-word-layout.js`
- `src/editor-shell.js`
- `src/editor-core.js`
- `src/citation-runtime.js`

