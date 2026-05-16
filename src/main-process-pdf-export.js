function sanitizeExportHTML(html){
  var source = String(html || '');
  if(!source) return '';
  return source
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>[\s\S]*?<\/embed>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
}

function looksLikeFullHTML(html){
  return /<html[\s>]/i.test(String(html || '')) && /<\/html>/i.test(String(html || ''));
}

function apaExportOverrideCSS(){
  return [
    '@page{size:A4;margin:2.54cm;}',
    'html,body{margin:0!important;padding:0!important;background:#fff!important;color:#000!important;font-family:"Times New Roman",Times,serif!important;font-size:12pt!important;line-height:24pt!important;mso-line-height-rule:exactly;}',
    'main.aq-export-root,.aq-export-root{width:100%!important;max-width:none!important;color:#000!important;font-family:"Times New Roman",Times,serif!important;font-size:12pt!important;line-height:24pt!important;}',
    '.aq-export-root *{font-family:"Times New Roman",Times,serif!important;font-size:12pt;}',
    '.aq-export-root p{margin:0!important;line-height:24pt!important;text-indent:.5in!important;orphans:3;widows:3;color:#000!important;}',
    '.aq-export-root p[data-indent-mode="none"],.aq-export-root p.ni,.aq-export-root p.indent-none,.aq-export-root .ni,.aq-export-root .indent-none{text-indent:0!important;}',
    '.aq-export-root p[data-indent-mode="first-line"],.aq-export-root p.indent-first-line{text-indent:.5in!important;}',
    'h1,h2,h3,h4,h5,.aq-export-root h1,.aq-export-root h2,.aq-export-root h3,.aq-export-root h4,.aq-export-root h5{margin:0!important;font-family:"Times New Roman",Times,serif!important;font-size:12pt!important;line-height:24pt!important;color:#000!important;break-after:avoid-page;page-break-after:avoid;}',
    'h1,.aq-export-root h1{text-align:center!important;font-weight:bold!important;font-style:normal!important;text-indent:0!important;}',
    'h2,.aq-export-root h2{text-align:left!important;font-weight:bold!important;font-style:normal!important;text-indent:0!important;}',
    'h3,.aq-export-root h3{text-align:left!important;font-weight:bold!important;font-style:italic!important;text-indent:0!important;}',
    'h4,.aq-export-root h4{text-align:left!important;font-weight:bold!important;font-style:normal!important;text-indent:.5in!important;}',
    'h5,.aq-export-root h5{text-align:left!important;font-weight:bold!important;font-style:italic!important;text-indent:.5in!important;}',
    '.aq-export-root blockquote{margin:0!important;padding-left:.5in!important;text-indent:0!important;line-height:24pt!important;break-inside:avoid;page-break-inside:avoid;}',
    '.aq-export-root blockquote p{text-indent:0!important;}',
    '.aq-export-root .refe,.aq-export-root .aq-ref-entry{margin:0!important;padding-left:.5in!important;text-indent:-.5in!important;line-height:24pt!important;color:#000!important;break-inside:avoid;page-break-inside:avoid;}',
    '.aq-export-root .cit,.aq-export-root [data-citation],.aq-export-root [data-ref]{color:#000!important;border:none!important;background:transparent!important;text-decoration:none!important;white-space:normal!important;}',
    '.aq-export-root a{color:#000!important;text-decoration:none!important;}',
    '.aq-export-root .cit-gap{display:none!important;}',
    '.aq-export-root ul,.aq-export-root ol{margin:0 0 0 .5in!important;padding:0!important;line-height:24pt!important;}',
    '.aq-export-root li{margin:0!important;line-height:24pt!important;text-indent:0!important;color:#000!important;}',
    '.aq-export-root table{width:100%!important;border-collapse:collapse!important;font-size:12pt!important;margin:6pt 0!important;break-inside:avoid;page-break-inside:auto;}',
    '.aq-export-root .aq-table-label,.aq-export-root .aq-figure-placeholder{margin:0!important;text-indent:0!important;text-align:left!important;font-weight:bold!important;}',
    '.aq-export-root .aq-table-title,.aq-export-root .aq-figure-caption{margin:0 0 6pt 0!important;text-indent:0!important;text-align:left!important;font-style:italic!important;}',
    '.aq-export-root th{border-top:1.5px solid #000!important;border-bottom:1px solid #000!important;padding:4px 8px!important;font-weight:bold!important;line-height:24pt!important;}',
    '.aq-export-root td{padding:4px 8px!important;line-height:24pt!important;vertical-align:top!important;}',
    '[data-editor-only],[data-export-ignore="true"],.img-toolbar,.img-resize-handle,.aq-page-sheet,.page-break-overlay,.page-number,.toc-delete,.aq-fn-store,.aq-mn-store,.fn-back-btn,.fn-del-btn{display:none!important;}'
  ].join('');
}

function injectApaExportCSS(html){
  var source = String(html || '');
  var tag = '<style id="aq-main-export-apa-override">' + apaExportOverrideCSS() + '</style>';
  if(/<\/head>/i.test(source)) return source.replace(/<\/head>/i, tag + '</head>');
  if(/<html[\s>]/i.test(source)) return source.replace(/<html([^>]*)>/i, '<html$1><head>' + tag + '</head>');
  return source;
}

function wrapExportHTMLDocument(contentHTML){
   return '<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: blob: file:; style-src \'unsafe-inline\'; font-src data:;"><title>AcademiQ Export</title><style>' + apaExportOverrideCSS() + '</style></head><body><main class="aq-export-root">' + String(contentHTML || '') + '</main></body></html>';
}

function buildExportHTML(options){
  var source = sanitizeExportHTML(options && (options.exportHTML || options.html) ? (options.exportHTML || options.html) : '');
  if(!source) return wrapExportHTMLDocument('<p></p>');
  return looksLikeFullHTML(source) ? injectApaExportCSS(source) : wrapExportHTMLDocument(source);
}

function buildPrintToPDFOptions(options){
  var src = options && typeof options === 'object' ? options : {};
  var showPageNumbers = src.showPageNumbers !== false;
  var marginMode = String(src.marginMode || '').toLowerCase();
  var margins = marginMode === 'none'
    ? { top:0, right:0, bottom:0, left:0 }
    : {
        top:showPageNumbers ? 0.7 : 0.4,
        right:0.4,
        bottom:0.4,
        left:0.4
      };
  return {
    printBackground:true,
    pageSize:'A4',
    landscape:false,
    preferCSSPageSize:true,
    displayHeaderFooter:showPageNumbers,
    headerTemplate:showPageNumbers
      ? '<div style="width:100%;font-family:Times New Roman,serif;font-size:10px;color:#000;text-align:right;padding-right:18px;"><span class="pageNumber"></span></div>'
      : '<div></div>',
    footerTemplate:'<div></div>',
    margins:margins
  };
}

module.exports = {
  sanitizeExportHTML,
  looksLikeFullHTML,
  wrapExportHTMLDocument,
  buildExportHTML,
  buildPrintToPDFOptions
};
