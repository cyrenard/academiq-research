(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordDocument = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  function resolveBlankHTML(blankHTML){
    if(typeof blankHTML === 'function'){
      return String(blankHTML() || '<p></p>');
    }
    return String(blankHTML || '<p></p>');
  }

  function escapeAttr(text){
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildImageHTML(src, alt){
    return '<div style="text-align:left;margin:12px 0;text-indent:0"><img src="' + String(src || '') + '" style="max-width:100%;height:auto;border:1px solid var(--b);border-radius:4px;" alt="' + escapeAttr(alt || '') + '"/></div><p><br></p>';
  }

  function buildExportDocHTML(edHTML){
    return '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><meta name="ProgId" content="Word.Document"><meta name="Generator" content="AcademiQ Research"><style>@page WordSection1{size:595pt 842pt;margin:72pt 72pt 72pt 72pt;}div.WordSection1{page:WordSection1;}body{font-family:"Times New Roman",serif;font-size:12pt;line-height:2;margin:0;}h1{font-size:12pt;font-weight:bold;text-align:center;margin:0;text-indent:0;}h2{font-size:12pt;font-weight:bold;text-align:left;margin:0;text-indent:0;}h3{font-size:12pt;font-weight:bold;font-style:italic;margin:0;text-indent:0;}h4{font-size:12pt;font-weight:bold;margin:0;text-indent:.5in;}h5{font-size:12pt;font-weight:bold;font-style:italic;margin:0;text-indent:.5in;}p{margin:0;text-indent:.5in;mso-pagination:none;}.ni{text-indent:0;}.cit{color:#000;border:none;white-space:normal;}.cit-gap{display:none!important;}.refe{text-indent:-.5in;padding-left:.5in;margin:0;}blockquote{padding-left:.5in;text-indent:0;margin:0;}table{width:100%;border-collapse:collapse;font-size:12pt;page-break-inside:auto;}thead{display:table-header-group;}tr,img{page-break-inside:avoid;}th{border-top:1.5px solid #000;border-bottom:1px solid #000;padding:4px 8px;}td{padding:4px 8px;}.toc-delete,.img-toolbar,.img-resize-handle,.aq-page-sheet,.page-break-overlay,.page-number{display:none!important;}</style></head><body><div class="WordSection1">' + String(edHTML || '') + '</div></body></html>';
  }

  function stripLegacyEditorArtifacts(html){
    return String(html || '')
      .replace(/<div[^>]*class="page-break[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<div[^>]*class="page-top-spacer[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<div[^>]*class="aq-page-sheet[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<div[^>]*class="page-break-overlay[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<div[^>]*class="page-number[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<hr[^>]*class="pg-spacer"[^>]*\/?>/gi, '')
      .replace(/<div[^>]*class="pg-spacer"[^>]*>[\s\S]*?<\/div>/gi, '');
  }

  function prepareLoadedHTML(html, blankHTML){
    var cleaned = stripLegacyEditorArtifacts(html);
    cleaned = String(cleaned || '').trim();
    return cleaned || String(blankHTML || '<p></p>');
  }

  function getEditorHTML(options){
    options = options || {};
    var editor = options.editor || null;
    if(editor && typeof editor.getHTML === 'function'){
      return editor.getHTML();
    }
    var shell = options.shell || null;
    if(shell && typeof shell.getHTML === 'function'){
      return shell.getHTML();
    }
    var host = options.host || (typeof document !== 'undefined' ? document.getElementById('apaed') : null);
    return host ? (host.innerHTML || '<p></p>') : '<p></p>';
  }

  function setEditorHTML(options){
    options = options || {};
    var html = String(options.html || '<p></p>');
    var editor = options.editor || null;
    if(editor && editor.commands && typeof editor.commands.setContent === 'function'){
      editor.commands.setContent(html);
      return true;
    }
    var shell = options.shell || null;
    if(shell && typeof shell.setHTML === 'function'){
      shell.setHTML(html);
      return true;
    }
    var host = options.host || (typeof document !== 'undefined' ? document.getElementById('apaed') : null);
    if(host){
      host.innerHTML = html;
      return true;
    }
    return false;
  }

  function ensureEditableContent(options){
    options = options || {};
    var editor = options.editor || null;
    if(!editor || !editor.commands || typeof editor.commands.setContent !== 'function') return false;
    var sanitizeHTML = typeof options.sanitizeHTML === 'function'
      ? options.sanitizeHTML
      : function(value){ return String(value || ''); };
    var html = sanitizeHTML(options.html != null ? options.html : (typeof editor.getHTML === 'function' ? editor.getHTML() : '')).trim();
    var emptyHTML = html
      .replace(/<p>\s*(<br\s*\/?>|\u00a0|&nbsp;|\s)*<\/p>/gi, '')
      .replace(/<blockquote>\s*(<br\s*\/?>|\u00a0|&nbsp;|\s)*<\/blockquote>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, '');
    if(!html || html === '<p></p>' || !emptyHTML){
      editor.commands.setContent('<p></p>', false);
      return true;
    }
    return false;
  }

  function commitActiveDocument(options){
    options = options || {};
    var state = options.state || null;
    var currentDocId = options.currentDocId;
    var blankHTML = String(options.blankHTML || '<p></p>');
    if(!state || !state.docs || !currentDocId){
      return blankHTML;
    }
    var html = typeof options.getHTML === 'function' ? options.getHTML() : blankHTML;
    if(typeof options.commitState === 'function'){
      html = options.commitState(state, html, { sanitize:options.sanitizeHTML });
      return html || blankHTML;
    }
    var sanitizeHTML = typeof options.sanitizeHTML === 'function'
      ? options.sanitizeHTML
      : function(value){ return String(value || ''); };
    html = sanitizeHTML(html);
    var current = state.docs.find(function(doc){ return doc && doc.id === currentDocId; });
    if(current) current.content = html;
    state.doc = html;
    return html || blankHTML;
  }

  function commitEditorDocument(options){
    options = options || {};
    var blankHTML = String(options.blankHTML || '<p></p>');
    if(options.isSwitching || !options.state || !options.state.docs || !options.currentDocId){
      return blankHTML;
    }
    return commitActiveDocument({
      state: options.state,
      currentDocId: options.currentDocId,
      blankHTML: blankHTML,
      getHTML: options.getHTML,
      sanitizeHTML: options.sanitizeHTML,
      commitState: options.commitState
    });
  }

  function commitEditorDocumentWithState(options){
    options = options || {};
    var documentStateApi = options.documentStateApi || null;
    return commitEditorDocument({
      isSwitching: !!options.isSwitching,
      state: options.state || null,
      currentDocId: options.currentDocId,
      blankHTML: options.blankHTML || '<p></p>',
      getHTML: options.getHTML,
      sanitizeHTML: options.sanitizeHTML,
      commitState: documentStateApi && typeof documentStateApi.commitActiveDoc === 'function'
        ? documentStateApi.commitActiveDoc
        : (options.commitState || null)
      });
  }

  function commitEditorDocumentFromContext(options){
    options = options || {};
    return commitEditorDocumentWithState({
      isSwitching: !!options.isSwitching,
      state: options.state || null,
      currentDocId: options.currentDocId,
      blankHTML: resolveBlankHTML(options.blankHTML),
      getHTML: typeof options.getHTML === 'function'
        ? options.getHTML
        : function(){
            return getEditorHTML({
              editor: options.editor || null,
              shell: options.shell || null,
              host: options.host || null
            });
          },
      sanitizeHTML: options.sanitizeHTML || null,
      documentStateApi: options.documentStateApi || null,
      commitState: options.commitState || null
    });
  }

  function setActiveDocument(options){
    options = options || {};
    var blankHTML = String(options.blankHTML || '<p></p>');
    var sanitizeHTML = typeof options.sanitizeHTML === 'function'
      ? options.sanitizeHTML
      : function(value){ return String(value || ''); };
    var html = sanitizeHTML(options.html || blankHTML);
    var editor = options.editor || null;
    if(editor && editor.commands && typeof editor.commands.setContent === 'function'){
      try{
        editor.commands.setContent(html, false);
      }catch(e){
        return blankHTML;
      }
      if(typeof options.afterSet === 'function'){
        options.afterSet(editor && editor.view ? editor.view.dom : null, html);
      }
      return html;
    }
    setEditorHTML({
      editor: null,
      shell: options.shell || null,
      host: options.host || null,
      html: html
    });
    if(typeof options.afterSet === 'function'){
      options.afterSet(options.host || null, html);
    }
    return html;
  }

  function loadDocument(options){
    options = options || {};
    var blankHTML = String(options.blankHTML || '<p></p>');
    var html = prepareLoadedHTML(options.html || blankHTML, blankHTML);

    if(typeof options.beforeSet === 'function'){
      options.beforeSet(html);
    }

    function finalize(target, appliedHTML){
      if(typeof options.runLoadEffects === 'function'){
        options.runLoadEffects({
          target: target || null,
          html: appliedHTML || html,
          beforeApply: options.beforeApply || null,
          focusToEnd: !!options.focusAtEnd && !!options.editor,
          focusToEndFn: options.focusToEndFn || null,
          focusSurface: !!options.focusAtEnd && !options.editor,
          focusSurfaceFn: options.focusSurfaceFn || null,
          afterLayout: options.afterLayout || null
        });
        return true;
      }

      if(typeof options.beforeApply === 'function'){
        options.beforeApply();
      }
      if(typeof options.normalize === 'function'){
        options.normalize(target || undefined);
      }
      if(options.focusAtEnd && options.editor && typeof options.focusToEndFn === 'function'){
        options.focusToEndFn();
      }else if(options.focusAtEnd && !options.editor && typeof options.focusSurfaceFn === 'function'){
        options.focusSurfaceFn();
      }
      if(typeof options.syncRefs === 'function'){
        options.syncRefs();
      }
      if(typeof options.syncChrome === 'function'){
        options.syncChrome();
      }
      if(typeof options.syncLayout === 'function'){
        options.syncLayout();
      }
      if(typeof options.afterLayout === 'function'){
        options.afterLayout();
      }
      return true;
    }

    return setActiveDocument({
      html: html,
      blankHTML: blankHTML,
      sanitizeHTML: options.sanitizeHTML,
      editor: options.editor || null,
      shell: options.shell || null,
      host: options.host || null,
      afterSet: function(target, appliedHTML){
        finalize(target || options.host || null, appliedHTML || html);
      }
    });
  }

  function loadEditorDocument(options){
    options = options || {};
    var blankHTML = String(options.blankHTML || '<p></p>');
    return loadDocument({
      html: options.html || blankHTML,
      blankHTML: blankHTML,
      sanitizeHTML: options.sanitizeHTML,
      editor: options.editor || null,
      shell: options.shell || null,
      host: options.host || null,
      beforeSet: function(nextHTML){
        if(typeof options.beforeSet === 'function'){
          options.beforeSet(nextHTML);
        }
      },
      beforeApply: function(){
        if(typeof options.beforeApply === 'function'){
          options.beforeApply();
        }
      },
      runLoadEffects: options.runLoadEffects || null,
      focusAtEnd: !!options.focusAtEnd,
      focusToEndFn: options.focusToEndFn || null,
      focusSurfaceFn: options.focusSurfaceFn || null,
      normalize: options.normalize || null,
      syncRefs: options.syncRefs || null,
      syncChrome: options.syncChrome || null,
      syncLayout: options.syncLayout || null,
      afterLayout: options.afterLayout || null
    });
  }

  function loadEditorDocumentWithState(options){
    options = options || {};
    var runtimeApi = options.runtimeApi || null;
    return loadEditorDocument({
      html: options.html || options.blankHTML || '<p></p>',
      blankHTML: options.blankHTML || '<p></p>',
      sanitizeHTML: options.sanitizeHTML,
      editor: options.editor || null,
      shell: options.shell || null,
      host: options.host || null,
      beforeSet: function(nextHTML){
        if(typeof options.beforeSet === 'function'){
          options.beforeSet(nextHTML);
        }
      },
      beforeApply: function(){
        if(typeof options.beforeApply === 'function'){
          options.beforeApply();
        }
      },
      runLoadEffects: runtimeApi && typeof runtimeApi.runDocumentLoadEffects === 'function'
        ? runtimeApi.runDocumentLoadEffects
        : (options.runLoadEffects || null),
      focusAtEnd: !!options.focusAtEnd,
      focusToEndFn: options.focusToEndFn || null,
      focusSurfaceFn: options.focusSurfaceFn || null,
      normalize: options.normalize || null,
      syncRefs: options.syncRefs || null,
      syncChrome: options.syncChrome || null,
      syncLayout: options.syncLayout || null,
      afterLayout: options.afterLayout || null
    });
  }

  function loadEditorDocumentFromContext(options){
    options = options || {};
    var blankHTML = resolveBlankHTML(options.blankHTML);
    return loadEditorDocumentWithState({
      html: options.html || blankHTML,
      blankHTML: blankHTML,
      sanitizeHTML: options.sanitizeHTML || null,
      editor: options.editor || null,
      shell: options.shell || null,
      host: options.host || null,
      runtimeApi: options.runtimeApi || null,
      beforeSet: function(nextHTML){
        if(typeof options.setSwitching === 'function'){
          options.setSwitching(true, nextHTML);
        }
        if(typeof options.setSuppressSave === 'function'){
          options.setSuppressSave(true, nextHTML);
        }
        if(typeof options.beforeSet === 'function'){
          options.beforeSet(nextHTML);
        }
      },
      beforeApply: function(){
        if(typeof options.setSuppressSave === 'function'){
          options.setSuppressSave(false);
        }
        if(typeof options.setSwitching === 'function'){
          options.setSwitching(false);
        }
        if(typeof options.ensureEditableRoot === 'function'){
          options.ensureEditableRoot();
        }
        if(typeof options.beforeApply === 'function'){
          options.beforeApply();
        }
      },
      focusAtEnd: !!options.focusAtEnd,
      focusToEndFn: options.focusToEndFn || null,
      focusSurfaceFn: options.focusSurfaceFn || null,
      normalize: options.normalize || null,
      syncRefs: options.syncRefs || null,
      syncChrome: options.syncChrome || null,
      syncLayout: typeof options.syncLayout === 'function'
        ? options.syncLayout
        : function(){
            var runtimeApi = options.runtimeApi || null;
            if(runtimeApi && typeof runtimeApi.syncPageLayout === 'function'){
              runtimeApi.syncPageLayout();
              return;
            }
            if(typeof options.updatePageHeight === 'function'){
              options.updatePageHeight();
            }
          },
      afterLayout: options.afterLayout || null
    });
  }

  function focusEditor(options){
    options = options || {};
    var editor = options.editor || null;
    var surface = options.surface || null;
    var pos = options.pos || 'end';
    if(editor && editor.commands && typeof editor.commands.focus === 'function'){
      try{ editor.commands.focus(pos); return true; }catch(e){}
    }
    if(surface && typeof surface.focus === 'function'){
      if(surface.focus({ toEnd: pos === 'end' })) return true;
    }
    var host = options.host || (typeof document !== 'undefined' ? document.getElementById('apaed') : null);
    if(host && typeof host.focus === 'function'){
      try{ host.focus(); return true; }catch(e){}
    }
    return false;
  }

  function insertHTML(options){
    options = options || {};
    var editor = options.editor || null;
    var html = String(options.html || '');
    if(editor && editor.chain){
      try{
        if(typeof options.beforeEditorInsert === 'function') options.beforeEditorInsert();
        editor.chain().focus().insertContent(html, { parseOptions:{ preserveWhitespace:false } }).run();
        if(typeof options.afterEditorInsert === 'function'){
          setTimeout(options.afterEditorInsert, 0);
        }
        return true;
      }catch(e){}
    }
    var host = options.host || (typeof document !== 'undefined' ? document.getElementById('apaed') : null);
    if(!host || typeof document === 'undefined') return false;
    host.focus();
    var ok = false;
    try{
      var savedRange = options.savedRangeRef && options.savedRangeRef.current;
      if(savedRange){
        try{
          var selSaved = window.getSelection();
          selSaved.removeAllRanges();
          selSaved.addRange(savedRange);
        }catch(e){}
        options.savedRangeRef.current = null;
      }
      var sel = window.getSelection();
      if(!sel || !sel.rangeCount || !host.contains(sel.anchorNode)){
        var range = document.createRange();
        range.selectNodeContents(host);
        range.collapse(false);
        sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      ok = document.execCommand('insertHTML', false, html);
    }catch(e){}
    if(!ok) host.insertAdjacentHTML('beforeend', html);
    if(typeof options.afterDomInsert === 'function') options.afterDomInsert(host);
    return true;
  }

  return {
    buildImageHTML: buildImageHTML,
    buildExportDocHTML: buildExportDocHTML,
    stripLegacyEditorArtifacts: stripLegacyEditorArtifacts,
    prepareLoadedHTML: prepareLoadedHTML,
    getEditorHTML: getEditorHTML,
    setEditorHTML: setEditorHTML,
    ensureEditableContent: ensureEditableContent,
    commitActiveDocument: commitActiveDocument,
    commitEditorDocument: commitEditorDocument,
    commitEditorDocumentWithState: commitEditorDocumentWithState,
    commitEditorDocumentFromContext: commitEditorDocumentFromContext,
    setActiveDocument: setActiveDocument,
    loadDocument: loadDocument,
    loadEditorDocument: loadEditorDocument,
    loadEditorDocumentWithState: loadEditorDocumentWithState,
    loadEditorDocumentFromContext: loadEditorDocumentFromContext,
    focusEditor: focusEditor,
    insertHTML: insertHTML
  };
});
