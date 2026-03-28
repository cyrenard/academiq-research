(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordIO = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  function looksLikeHTML(text){
    return /<\/?[a-z][\s\S]*>/i.test(String(text || ''));
  }

  function normalizeImportHTML(text, formatPlainTextAPA){
    var value = String(text || '');
    if(looksLikeHTML(value)) return value;
    if(typeof formatPlainTextAPA === 'function') return formatPlainTextAPA(value || '');
    return '<p>' + value.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
  }

  function applyImportedHTML(options){
    options = options || {};
    var editor = options.editor || null;
    var html = String(options.html || '');
    if(typeof options.cleanPastedHTML === 'function'){
      html = options.cleanPastedHTML(html || '');
    }
    if(editor && editor.commands && typeof editor.commands.setContent === 'function'){
      editor.commands.setContent(html || '<p></p>', false);
      if(typeof window !== 'undefined' && window.AQEditorRuntime && typeof window.AQEditorRuntime.runContentApplyEffects === 'function'){
        window.AQEditorRuntime.runContentApplyEffects({
          target: editor && editor.view ? editor.view.dom : null,
          normalize: true,
          layout: true,
          syncChrome: true,
          syncTOC: false,
          syncRefs: false,
          refreshTrigger: false,
          onApplied: options.afterEditorImport
        });
        return true;
      }
      if(typeof options.afterEditorImport === 'function'){
        setTimeout(options.afterEditorImport, 0);
      }
      return true;
    }
    if(typeof options.setCurrentEditorHTML === 'function'){
      options.setCurrentEditorHTML(html || '<p></p>');
      if(typeof window !== 'undefined' && window.AQEditorRuntime && typeof window.AQEditorRuntime.runContentApplyEffects === 'function'){
        window.AQEditorRuntime.runContentApplyEffects({
          normalize: false,
          layout: true,
          syncChrome: true,
          syncTOC: false,
          syncRefs: false,
          refreshTrigger: false,
          onApplied: options.afterDomImport
        });
        return true;
      }
      if(typeof options.afterDomImport === 'function'){
        options.afterDomImport();
      }
      return true;
    }
    return false;
  }

  function buildPrintablePageClone(page){
    if(!page || typeof page.cloneNode !== 'function') return null;
    var clone = page.cloneNode(true);
    clone.querySelectorAll('.aq-page-sheet,.page-break-overlay,.page-number,.img-toolbar,.img-resize-handle,.toc-delete').forEach(function(el){ el.remove(); });
    clone.style.boxShadow = 'none';
    clone.style.margin = '0';
    clone.style.padding = '2.54cm';
    clone.style.width = '21cm';
    clone.style.minHeight = 'auto';
    clone.style.background = '#fff';
    clone.style.border = 'none';
    clone.style.borderRadius = '0';
    return clone;
  }

  function buildPDFExportOptions(){
    return {
      margin:[0,0,0,0],
      filename:'makale.pdf',
      image:{type:'jpeg',quality:0.99},
      html2canvas:{scale:3,useCORS:true,backgroundColor:'#ffffff',letterRendering:true,scrollX:0,scrollY:0},
      jsPDF:{unit:'pt',format:'a4',orientation:'portrait'},
      pagebreak:{mode:['css','legacy'],avoid:['blockquote','table','tr','img','h1','h2','h3','h4','h5','.toc-container']}
    };
  }

  return {
    looksLikeHTML: looksLikeHTML,
    normalizeImportHTML: normalizeImportHTML,
    applyImportedHTML: applyImportedHTML,
    buildPrintablePageClone: buildPrintablePageClone,
    buildPDFExportOptions: buildPDFExportOptions
  };
});
