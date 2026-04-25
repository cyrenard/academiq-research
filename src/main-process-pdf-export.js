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

function wrapExportHTMLDocument(contentHTML){
   return '<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: blob: file:; style-src \'unsafe-inline\'; font-src data:;"><title>AcademiQ Export</title><style>@page{size:A4;margin:2.54cm;}html,body{margin:0;padding:0;background:#fff;color:#000;font-family:"Times New Roman",Times,serif;font-size:12pt;line-height:24pt;}main.aq-export-root{width:100%;}p{margin:0;text-indent:.5in;}p[data-indent-mode="none"],p.ni,p.indent-none{text-indent:0;}p[data-indent-mode="first-line"],p.indent-first-line{text-indent:.5in;}h1,h2,h3,h4,h5{margin:0;line-height:24pt;break-after:avoid-page;page-break-after:avoid;}h1{text-align:center;font-size:12pt;font-weight:bold;text-indent:0;}h2{text-align:left;font-size:12pt;font-weight:bold;text-indent:0;}h3{text-align:left;font-size:12pt;font-weight:bold;font-style:italic;text-indent:0;}h4{text-align:left;font-size:12pt;font-weight:bold;text-indent:.5in;}h5{text-align:left;font-size:12pt;font-weight:bold;font-style:italic;text-indent:.5in;}blockquote{margin:0;padding-left:.5in;text-indent:0;break-inside:avoid;page-break-inside:avoid;}blockquote p{text-indent:0;}ul,ol{margin:0 0 0 .5in;padding:0;}li{margin:0;text-indent:0;}table{width:100%;border-collapse:collapse;font-size:12pt;page-break-inside:auto;break-inside:avoid;}thead{display:table-header-group;}tr,img{page-break-inside:avoid;break-inside:avoid;}th{border-top:1.5px solid #000;border-bottom:1px solid #000;padding:4px 8px;font-weight:bold;}td{padding:4px 8px;vertical-align:top;}.refe,.aq-ref-entry{margin:0;text-indent:-.5in;padding-left:.5in;break-inside:avoid;page-break-inside:avoid;}.aq-keep-group,.aq-avoid-break{break-inside:avoid;page-break-inside:avoid;}.aq-keep-with-next{break-after:avoid-page;page-break-after:avoid;}.cit-gap{display:none!important;}[data-editor-only],[data-export-ignore="true"],.img-toolbar,.img-resize-handle,.aq-page-sheet,.page-break-overlay,.page-number,.toc-delete,.aq-fn-store,.aq-mn-store,.fn-back-btn,.fn-del-btn{display:none!important;}</style></head><body><main class="aq-export-root">' + String(contentHTML || '') + '</main></body></html>';
}

function buildExportHTML(options){
  var source = sanitizeExportHTML(options && options.exportHTML ? options.exportHTML : '');
  if(!source) return wrapExportHTMLDocument('<p></p>');
  return looksLikeFullHTML(source) ? source : wrapExportHTMLDocument(source);
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
