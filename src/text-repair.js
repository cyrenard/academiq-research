(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  root.AQTextRepair = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  var badMarkerRE = /[ÃÅÄÂâ�]/g;
  var manualReplacements = [
    [/ÅŸ/g, 'ş'],
    [/Åž/g, 'Ş'],
    [/Ä±/g, 'ı'],
    [/Ä°/g, 'İ'],
    [/ÄŸ/g, 'ğ'],
    [/Äž/g, 'Ğ'],
    [/Ã¼/g, 'ü'],
    [/Ãœ/g, 'Ü'],
    [/Ã¶/g, 'ö'],
    [/Ã–/g, 'Ö'],
    [/Ã§/g, 'ç'],
    [/Ã‡/g, 'Ç'],
    [/â†’/g, '→'],
    [/â†“/g, '↓'],
    [/â†‘/g, '↑'],
    [/âœ“/g, '✓'],
    [/âœ•/g, '✕'],
    [/â–¾/g, '▾'],
    [/Ã—/g, '×'],
    [/Â©/g, '©'],
    [/Â·/g, '·'],
    [/AÃ§/g, 'Aç'],
    [/aÃ§/g, 'aç'],
    [/YazÄ±/g, 'Yazı'],
    [/baÅŸ/g, 'baş'],
    [/BaÅŸ/g, 'Baş'],
    [/GiriÅŸ/g, 'Giriş'],
    [/KaynakÃ§a/g, 'Kaynakça'],
    [/KÃ¼tÃ¼phane/g, 'Kütüphane'],
    [/DÄ±ÅŸa/g, 'Dışa'],
    [/TÃ¼m/g, 'Tüm'],
    [/BÃ¶lÃ¼mÃ¼/g, 'Bölümü'],
    [/deÄŸiÅŸtir/g, 'değiştir'],
    [/DeÄŸiÅŸtir/g, 'Değiştir'],
    [/AtÄ±f/g, 'Atıf'],
    [/AlÄ±ntÄ±/g, 'Alıntı'],
    [/Åekil/g, 'Şekil'],
    [/Åablonu/g, 'Şablonu'],
    [/AraÅŸtÄ±rma/g, 'Araştırma'],
    [/LiteratÃ¼r/g, 'Literatür'],
    [/YazdÄ±r/g, 'Yazdır'],
    [/GÃ¼ncelle/g, 'Güncelle'],
    [/BÃ¼yÃ¼k/g, 'Büyük'],
    [/kÃ¼Ã§Ã¼k/g, 'küçük'],
    [/Ã–nceki/g, 'Önceki'],
    [/KÃ¼Ã§Ã¼lt/g, 'Küçült'],
    [/BÃ¼yÃ¼t/g, 'Büyüt'],
    [/KullanÄ±lan/g, 'Kullanılan'],
    [/SeÃ§/g, 'Seç'],
    [/YÄ±l/g, 'Yıl'],
    [/YayÄ±n/g, 'Yayın'],
    [/SayÄ±/g, 'Sayı'],
    [/Ä°lk/g, 'İlk'],
    [/Ä°ptal/g, 'İptal'],
    [/OluÅŸtur/g, 'Oluştur'],
    [/YÃ¼kleniyor/g, 'Yükleniyor'],
    [/numaralarÄ±nÄ±/g, 'numaralarını'],
    [/gÃ¶ster/g, 'göster'],
    [/SÃ¼tun/g, 'Sütun'],
    [/Ãœniversite/g, 'Üniversite'],
    [/Ã–ÄŸretim Ãœyesi/g, 'Öğretim Üyesi'],
    [/Â¶/g, '¶'],
    [/âš™/g, '⚙'],
    [/â³/g, '⏳'],
    [/âš /g, '⚠']
  ];

  function scoreText(value){
    var text = String(value == null ? '' : value);
    var badCount = (text.match(badMarkerRE) || []).length;
    var goodCount = (text.match(/[çÇğĞıİöÖüÜşŞ→↓↑✓✕×▾]/g) || []).length;
    return goodCount - (badCount * 3);
  }

  function applyManualReplacements(value){
    var next = String(value == null ? '' : value);
    manualReplacements.forEach(function(entry){
      next = next.replace(entry[0], entry[1]);
    });
    next = next.replace(/Â(?=\s|$)/g, '');
    return next;
  }

  function repairText(value){
    var current = String(value == null ? '' : value);
    var best = current;
    for(var i=0;i<3;i++){
      var next = applyManualReplacements(best);
      if(next === best) break;
      if(scoreText(next) < scoreText(best)) break;
      best = next;
    }
    return best;
  }

  function repairNode(node){
    if(!node) return;
    if(node.nodeType === 3){
      var repaired = repairText(node.nodeValue);
      if(repaired !== node.nodeValue) node.nodeValue = repaired;
      return;
    }
    if(node.nodeType !== 1) return;
    ['placeholder', 'title', 'aria-label', 'value'].forEach(function(attr){
      if(!node.hasAttribute || !node.hasAttribute(attr)) return;
      var current = node.getAttribute(attr);
      var repaired = repairText(current);
      if(repaired !== current) node.setAttribute(attr, repaired);
    });
    Array.from(node.childNodes || []).forEach(repairNode);
  }

  function repairDocument(doc){
    if(!doc || !doc.body) return;
    repairNode(doc.body);
  }

  // ──────────────────────────────────────────────────────────────────────
  // init() — previously installed a MutationObserver that ran on every
  // DOM mutation (childList + subtree + characterData) anywhere in the
  // document. That ran *constantly* while the user typed in the editor,
  // every render of the matrix, every PDF page event — burning CPU on a
  // problem that shouldn't exist: the app's source is UTF-8, so labels
  // committed to source never produce mojibake.
  //
  // The remaining real source of mojibake is *imported* data: pasted
  // RTF/Word content, legacy .txt files with cp1254/Windows-1252
  // encoding, certain Crossref/CSL payloads. Those flow through specific
  // import handlers, which can call `AQTextRepair.repairText(value)`
  // directly on the imported string. That is far cheaper than observing
  // the entire DOM at runtime.
  //
  // To preserve safety for any historical document that already shipped
  // with mojibake committed into its persisted HTML, `init()` still runs
  // ONE pass over the document body on boot. After that it's done — the
  // MutationObserver is gone.
  // ──────────────────────────────────────────────────────────────────────
  function init(){
    if(typeof document === 'undefined') return;
    repairDocument(document);
  }

  return {
    repairText: repairText,
    repairDocument: repairDocument,
    init: init
  };
});
