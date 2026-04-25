(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  root.AQPdfAnnotationExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function escapeHTML(value){
    return String(value || '').replace(/[&<>"']/g, function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }

  function sanitizeFilename(value, fallback){
    var name = String(value || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    return (name || fallback || 'annotated-pdf').slice(0, 80);
  }

  function normalizeDimension(value, fallback){
    var n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
  }

  function normalizeNote(note){
    note = note || {};
    return {
      x: Math.max(0, Number(note.x) || 0),
      y: Math.max(0, Number(note.y) || 0),
      w: Math.max(70, Number(note.w) || 160),
      text: String(note.text || '').trim()
    };
  }

  function buildNoteHTML(note){
    var n = normalizeNote(note);
    if(!n.text) return '';
    return '<div class="aq-pdf-note" style="left:' + n.x.toFixed(2) + 'px;top:' + n.y.toFixed(2) + 'px;width:' + n.w.toFixed(2) + 'px;">' + escapeHTML(n.text) + '</div>';
  }

  function buildPageHTML(page){
    page = page || {};
    var width = normalizeDimension(page.width, 842);
    var height = normalizeDimension(page.height, 1191);
    var pageNum = parseInt(page.page, 10) || 1;
    var dataUrl = String(page.dataUrl || '');
    var drawingDataUrl = String(page.drawingDataUrl || '');
    var notes = Array.isArray(page.notes) ? page.notes : [];
    var html = '<section class="aq-pdf-export-page" style="width:' + width + 'px;height:' + height + 'px;">';
    html += '<img class="aq-pdf-page-img" src="' + escapeHTML(dataUrl) + '" alt="Sayfa ' + pageNum + '"/>';
    if(drawingDataUrl){
      html += '<img class="aq-pdf-drawing" src="' + escapeHTML(drawingDataUrl) + '" alt="Çizim"/>';
    }
    html += notes.map(buildNoteHTML).join('');
    html += '</section>';
    return html;
  }

  function buildAnnotatedPdfExportDocument(options){
    options = options || {};
    var title = String(options.title || 'AcademiQ PDF').trim() || 'AcademiQ PDF';
    var pages = Array.isArray(options.pages) ? options.pages : [];
    var body = pages.length
      ? pages.map(buildPageHTML).join('')
      : '<section class="aq-pdf-export-page empty"><p>PDF sayfası bulunamadı.</p></section>';
    return '<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\';"><title>' + escapeHTML(title) + '</title><style>'
      + '@page{size:A4;margin:0;}html,body{margin:0;padding:0;background:#d7dee2;font-family:Arial,sans-serif;}'
      + '.aq-pdf-export-page{position:relative;margin:0 auto;page-break-after:always;break-after:page;background:#fff;overflow:hidden;}'
      + '.aq-pdf-export-page:last-child{page-break-after:auto;break-after:auto;}'
      + '.aq-pdf-export-page.empty{display:flex;align-items:center;justify-content:center;width:842px;height:1191px;color:#445;}'
      + '.aq-pdf-page-img,.aq-pdf-drawing{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;}'
      + '.aq-pdf-drawing{pointer-events:none;}'
      + '.aq-pdf-note{position:absolute;box-sizing:border-box;min-height:26px;padding:6px 8px;border:1.2px solid #b98d28;border-radius:6px;background:rgba(255,248,199,.94);color:#2f2a1a;font-size:10px;line-height:1.35;box-shadow:0 4px 12px rgba(64,48,14,.18);white-space:pre-wrap;word-break:break-word;}'
      + '</style></head><body>' + body + '</body></html>';
  }

  return {
    escapeHTML: escapeHTML,
    sanitizeFilename: sanitizeFilename,
    normalizeNote: normalizeNote,
    buildNoteHTML: buildNoteHTML,
    buildPageHTML: buildPageHTML,
    buildAnnotatedPdfExportDocument: buildAnnotatedPdfExportDocument
  };
});
