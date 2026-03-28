(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory(globalThis);
    return;
  }
  root.AQEditorRuntime = factory(root);
})(typeof window !== 'undefined' ? window : globalThis, function(root){
  'use strict';

  var state = {
    initialized: false,
    tocTimer: null,
    refTimer: null
  };

  function getEditor(){
    if(root.AQEditorCore && typeof root.AQEditorCore.getEditor === 'function'){
      return root.AQEditorCore.getEditor();
    }
    return root.editor || null;
  }

  function safeCall(fn){
    try{ return typeof fn === 'function' ? fn() : undefined; }catch(e){}
    return undefined;
  }

  function syncPageLayout(){
    if(typeof root.updatePageHeight === 'function'){
      safeCall(root.updatePageHeight);
    }
  }

function syncReferenceSectionDeferred(delay){
  clearTimeout(state.refTimer);
  state.refTimer = setTimeout(function(){
    if(typeof root.updateRefSection === 'function'){
      safeCall(function(){ root.updateRefSection(); });
      return;
    }
    if(typeof root.scheduleRefSectionSync === 'function'){
      safeCall(root.scheduleRefSectionSync);
    }
  }, parseInt(delay, 10) || 400);
}

  function syncTOCDeferred(delay){
    clearTimeout(state.tocTimer);
    state.tocTimer = setTimeout(function(){
      if(typeof root.autoUpdateTOC === 'function'){
        safeCall(root.autoUpdateTOC);
      }
    }, parseInt(delay, 10) || 120);
  }

  function refreshCitationTrigger(){
    if(root.AQCitationRuntime && typeof root.AQCitationRuntime.refreshFromEditor === 'function'){
      safeCall(root.AQCitationRuntime.refreshFromEditor);
      return true;
    }
    if(typeof root.checkTrig === 'function'){
      safeCall(root.checkTrig);
      return true;
    }
    return false;
  }

  function syncEditorChrome(){
    if(typeof root.uSt === 'function'){
      safeCall(root.uSt);
    }
    if(typeof root.save === 'function'){
      safeCall(root.save);
    }
    return true;
  }

  function syncCommandUI(){
    syncEditorChrome();
    if(typeof root.updateFmtState === 'function'){
      safeCall(root.updateFmtState);
    }
    return true;
  }

  function normalizeCitationSpansDeferred(target, delay){
    setTimeout(function(){
      if(typeof root.normalizeCitationSpans === 'function'){
        try{ root.normalizeCitationSpans(target || undefined); }catch(e){}
      }
    }, parseInt(delay, 10) || 0);
    return true;
  }

  function runContentApplyEffects(options){
    options = options || {};
    setTimeout(function(){
      if(options.renderRefs && typeof root.rRefs === 'function'){
        safeCall(root.rRefs);
      }
      if(options.normalize !== false){
        if(typeof root.normalizeCitationSpans === 'function'){
          try{ root.normalizeCitationSpans(options.target || undefined); }catch(e){}
        }
      }
      if(options.layout !== false){
        syncPageLayout();
      }
      if(options.syncChrome){
        syncEditorChrome();
      }
      if(options.syncTOC){
        syncTOCDeferred(options.tocDelay);
      }
      if(options.syncRefs){
        syncReferenceSectionDeferred(options.refDelay);
      }
      if(options.refreshTrigger){
        setTimeout(refreshCitationTrigger, 0);
      }
      if(typeof options.onApplied === 'function'){
        options.onApplied();
      }
      if(typeof options.afterLayout === 'function'){
        options.afterLayout();
      }
    }, parseInt(options.delay, 10) || 0);
    return true;
  }

  function handleMutation(){
    if(root.__aqDocSwitching) return false;
    syncEditorChrome();
    syncPageLayout();
    return true;
  }

  function runDocumentLoadEffects(options){
    options = options || {};
    setTimeout(function(){
      if(typeof options.beforeApply === 'function'){
        safeCall(options.beforeApply);
      }
      if(options.normalize !== false && typeof root.normalizeCitationSpans === 'function'){
        try{ root.normalizeCitationSpans(options.target || undefined); }catch(e){}
      }
      if(options.focusToEnd && typeof options.focusToEndFn === 'function'){
        safeCall(options.focusToEndFn);
      }else if(options.focusSurface && typeof options.focusSurfaceFn === 'function'){
        safeCall(options.focusSurfaceFn);
      }
      if(options.syncRefs !== false && typeof root.updateRefSection === 'function'){
        safeCall(function(){ root.updateRefSection(); });
      }
      if(options.syncChrome !== false){
        syncEditorChrome();
      }
      if(options.layout !== false){
        syncPageLayout();
      }
      if(typeof options.afterLayout === 'function'){
        safeCall(options.afterLayout);
      }
    }, parseInt(options.delay, 10) || 0);
    return true;
  }

  function onEditorUpdate(ctx){
    if(root.__aqDocSwitching) return;
    syncEditorChrome();
    normalizeCitationSpansDeferred(ctx && ctx.editor && ctx.editor.view ? ctx.editor.view.dom : null, 0);
    syncPageLayout();
    syncTOCDeferred();
    syncReferenceSectionDeferred();
    setTimeout(refreshCitationTrigger, 0);
  }

  function onSelectionUpdate(){
    if(typeof root.updateFmtState === 'function'){
      safeCall(root.updateFmtState);
    }
    setTimeout(refreshCitationTrigger, 0);
  }

  function focus(toEnd){
    if(root.AQEditorCore && typeof root.AQEditorCore.focus === 'function'){
      try{ return !!root.AQEditorCore.focus(!!toEnd); }catch(e){}
    }
    return false;
  }

  function attachSurfaceHandlers(){
    return true;
  }

  function init(){
    state.initialized = true;
    root.__aqEditorRuntimeV2 = true;
    attachSurfaceHandlers();
    syncPageLayout();
    return true;
  }

  return {
    init: init,
    onEditorUpdate: onEditorUpdate,
    onSelectionUpdate: onSelectionUpdate,
    syncPageLayout: syncPageLayout,
    syncReferenceSectionDeferred: syncReferenceSectionDeferred,
    syncTOCDeferred: syncTOCDeferred,
    refreshCitationTrigger: refreshCitationTrigger,
    syncEditorChrome: syncEditorChrome,
    syncCommandUI: syncCommandUI,
    normalizeCitationSpansDeferred: normalizeCitationSpansDeferred,
    runContentApplyEffects: runContentApplyEffects,
    handleMutation: handleMutation,
    runDocumentLoadEffects: runDocumentLoadEffects,
    focus: focus
  };
});
