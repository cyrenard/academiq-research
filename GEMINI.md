# AcademiQ Research - Editor Stability & AQEngine Rules

Bu dosya, AQEngine (özel layout motoru) ve editör stabilitesi için kritik olan kuralları ve yapılan fixleri içerir. Yeni özellik eklerken bu kurallara uyulmalıdır.

## AQEngine (Experimental) Kuralları

1.  **Selection & Hit-Testing**:
    *   `selection.js` içindeki `pageElAtPoint` her zaman bir sayfa döndürmelidir. Sayfalar arası boşluklara tıklandığında dahi "en yakın sayfa" fallback mekanizması çalışmalıdır. Bu, editörün odaklanamama sorununu (unresponsive click) engeller.
2.  **Focus Management (Hidden Input)**:
    *   AQEngine, yazma işlemini yakalamak için gizli bir `textarea` (`aq-input-capture`) kullanır.
    *   Editöre herhangi bir tıklama (mousedown) anında bu `textarea`'ya **zorunlu focus** verilmelidir.
    *   `tiptap-word-surface.js` içindeki `focus` metodu, eğer AQEngine aktifse her zaman bu gizli inputu hedeflemelidir.
3.  **Z-Index Stacking**:
    *   Editör yüzeyi (`aq-engine-stage`) ve ana kabuğu (`#aq-tiptap-shell`), diğer UI overlay'lerinin altında kalmamalıdır.
    *   Editörün tıklanabilir kalması için `z-index` değerleri ve `pointer-events: auto` kuralları korunmalıdır.
4.  **Repaint Sync**:
    *   Her `reflow` (layout güncellemesi) işleminden sonra `selection.repaint()` ve `input.syncCapturePosition()` çağrılmalıdır. Aksi takdirde imleç (caret) kaybolur ve yazı yazılamaz.

## Bilinen Sorunlar ve Çözümler
*   **Editör Tıklanmıyor/Yazılmıyor**: Genelde bir overlay katmanının (`modal-bg`, `trig` vb.) üstte kalmasından veya focus'un çalınmasından kaynaklanır. `compat-shim.js` içindeki `stageEl` z-index değerini kontrol edin.
