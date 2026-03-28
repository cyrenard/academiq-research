(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordBridge = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  function getContentApi(options){
    return options && options.contentApi ? options.contentApi : null;
  }

  function getDocumentApi(options){
    return options && options.documentApi ? options.documentApi : null;
  }

  function getRuntimeApi(options){
    return options && options.runtimeApi ? options.runtimeApi : null;
  }

  function getCurrentEditorHTML(options){
    options = options || {};
    var contentApi = getContentApi(options);
    if(contentApi && typeof contentApi.getEditorHTML === 'function'){
      return contentApi.getEditorHTML({
        documentApi: getDocumentApi(options),
        editor: options.editor || null,
        shell: options.shell || null,
        host: options.host || null
      });
    }
    var documentApi = getDocumentApi(options);
    if(documentApi && typeof documentApi.getEditorHTML === 'function'){
      return documentApi.getEditorHTML({
        editor: options.editor || null,
        shell: options.shell || null,
        host: options.host || null
      });
    }
    var editor = options.editor || null;
    if(editor && typeof editor.getHTML === 'function'){
      return editor.getHTML();
    }
    var shell = options.shell || null;
    if(shell && typeof shell.getHTML === 'function'){
      return shell.getHTML();
    }
    var host = options.host || null;
    return host ? (host.innerHTML || '<p></p>') : '<p></p>';
  }

  function setCurrentEditorHTML(options){
    options = options || {};
    var contentApi = getContentApi(options);
    if(contentApi && typeof contentApi.setEditorHTML === 'function'){
      return !!contentApi.setEditorHTML({
        documentApi: getDocumentApi(options),
        editor: options.editor || null,
        shell: options.shell || null,
        host: options.host || null,
        html: String(options.html || '<p></p>')
      });
    }
    var documentApi = getDocumentApi(options);
    if(documentApi && typeof documentApi.setEditorHTML === 'function'){
      return !!documentApi.setEditorHTML({
        editor: options.editor || null,
        shell: options.shell || null,
        host: options.host || null,
        html: String(options.html || '<p></p>')
      });
    }
    var editor = options.editor || null;
    if(editor && editor.commands && typeof editor.commands.setContent === 'function'){
      editor.commands.setContent(String(options.html || '<p></p>'));
      return true;
    }
    var shell = options.shell || null;
    if(shell && typeof shell.setHTML === 'function'){
      shell.setHTML(String(options.html || '<p></p>'));
      return true;
    }
    var host = options.host || null;
    if(host){
      host.innerHTML = String(options.html || '<p></p>');
      return true;
    }
    return false;
  }

  function runEditorMutationEffects(options){
    options = options || {};
    var contentApi = getContentApi(options);
    if(contentApi && typeof contentApi.runMutationEffects === 'function'){
      if(contentApi.runMutationEffects({
        target: options.target || null,
        normalize: options.normalize !== false,
        layout: options.layout !== false,
        syncChrome: !!options.syncChrome,
        syncTOC: !!options.syncTOC,
        syncRefs: !!options.syncRefs,
        refreshTrigger: !!options.refreshTrigger,
        onApplied: typeof options.onApplied === 'function' ? options.onApplied : null,
        afterLayout: typeof options.afterLayout === 'function' ? options.afterLayout : null
      })) return true;
    }
    var runtimeApi = getRuntimeApi(options);
    if(runtimeApi && typeof runtimeApi.runContentApplyEffects === 'function'){
      runtimeApi.runContentApplyEffects({
        target: options.target || null,
        normalize: options.normalize !== false,
        layout: options.layout !== false,
        syncChrome: !!options.syncChrome,
        syncTOC: !!options.syncTOC,
        syncRefs: !!options.syncRefs,
        refreshTrigger: !!options.refreshTrigger,
        onApplied: typeof options.onApplied === 'function' ? options.onApplied : null,
        afterLayout: typeof options.afterLayout === 'function' ? options.afterLayout : null
      });
      return true;
    }
    if(options.normalize !== false && typeof options.normalizeCitationSpans === 'function'){
      options.normalizeCitationSpans(options.target);
    }
    if(options.layout !== false && typeof options.updatePageHeight === 'function'){
      options.updatePageHeight();
    }
    if(options.syncChrome){
      if(typeof options.syncStatus === 'function') options.syncStatus();
      if(typeof options.save === 'function') options.save();
    }
    if(options.syncTOC && typeof options.syncTOCNow === 'function') options.syncTOCNow();
    if(options.syncRefs && typeof options.syncRefsNow === 'function') options.syncRefsNow();
    if(options.refreshTrigger && typeof options.refreshTriggerNow === 'function') options.refreshTriggerNow();
    if(typeof options.onApplied === 'function') options.onApplied();
    if(typeof options.afterLayout === 'function') options.afterLayout();
    return true;
  }

  function applyCurrentEditorHTML(options){
    options = options || {};
    var contentApi = getContentApi(options);
    if(contentApi && typeof contentApi.applyEditorHTML === 'function'){
      contentApi.applyEditorHTML({
        documentApi: getDocumentApi(options),
        editor: options.editor || null,
        shell: options.shell || null,
        host: options.host || null,
        html: String(options.html || '<p></p>'),
        normalizeCitationSpans: options.normalizeCitationSpans || null,
        updatePageHeight: options.updatePageHeight || null,
        normalize: options.normalize !== false,
        layout: options.layout !== false,
        syncChrome: !!options.syncChrome,
        syncTOC: !!options.syncTOC,
        syncRefs: !!options.syncRefs,
        refreshTrigger: !!options.refreshTrigger,
        onApplied: typeof options.onApplied === 'function' ? options.onApplied : null,
        afterLayout: typeof options.afterLayout === 'function' ? options.afterLayout : null
      });
      return true;
    }
    var nextHTML = String(options.html || '<p></p>');
    setCurrentEditorHTML({
      contentApi: contentApi,
      documentApi: getDocumentApi(options),
      editor: options.editor || null,
      shell: options.shell || null,
      host: options.host || null,
      html: nextHTML
    });
    return runEditorMutationEffects({
      contentApi: contentApi,
      runtimeApi: getRuntimeApi(options),
      target: options.editor && options.editor.view ? options.editor.view.dom : null,
      normalize: options.normalize !== false,
      layout: options.layout !== false,
      syncChrome: !!options.syncChrome,
      syncTOC: !!options.syncTOC,
      syncRefs: !!options.syncRefs,
      refreshTrigger: !!options.refreshTrigger,
      onApplied: typeof options.onApplied === 'function' ? options.onApplied : null,
      afterLayout: typeof options.afterLayout === 'function' ? options.afterLayout : null,
      normalizeCitationSpans: options.normalizeCitationSpans || null,
      updatePageHeight: options.updatePageHeight || null,
      syncStatus: options.syncStatus || null,
      save: options.save || null,
      syncTOCNow: options.syncTOCNow || null,
      syncRefsNow: options.syncRefsNow || null,
      refreshTriggerNow: options.refreshTriggerNow || null
    });
  }

  function ensureEditableRoot(options){
    options = options || {};
    var documentApi = getDocumentApi(options);
    if(documentApi && typeof documentApi.ensureEditableContent === 'function'){
      if(documentApi.ensureEditableContent({
        editor: options.editor || null,
        html: options.html,
        sanitizeHTML: options.sanitizeHTML || null
      })) return true;
    }
    var editor = options.editor || null;
    if(!editor || !editor.commands || typeof editor.commands.setContent !== 'function') return false;
    var sanitizeHTML = typeof options.sanitizeHTML === 'function'
      ? options.sanitizeHTML
      : function(value){ return String(value || ''); };
    var html = sanitizeHTML(options.html != null ? options.html : (typeof editor.getHTML === 'function' ? editor.getHTML() : '')).trim();
    var emptyHTML = html
      .replace(/<p>\s*(<br\s*\/?>|\u00a0|&nbsp;|\s)*<\/p>/gi,'')
      .replace(/<blockquote>\s*(<br\s*\/?>|\u00a0|&nbsp;|\s)*<\/blockquote>/gi,'')
      .replace(/<[^>]+>/g,'')
      .replace(/\s+/g,'');
    if(!html || html === '<p></p>' || !emptyHTML){
      editor.commands.setContent('<p></p>', false);
      return true;
    }
    return false;
  }

  return {
    getCurrentEditorHTML: getCurrentEditorHTML,
    setCurrentEditorHTML: setCurrentEditorHTML,
    runEditorMutationEffects: runEditorMutationEffects,
    applyCurrentEditorHTML: applyCurrentEditorHTML,
    ensureEditableRoot: ensureEditableRoot
  };
});
