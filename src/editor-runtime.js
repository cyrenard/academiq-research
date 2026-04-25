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
    refTimer: null,
    academicTimer: null,
    linkedBound: false
  };

  // Cancel any deferred work scheduled via syncReferenceSectionDeferred /
  // syncAcademicObjectsDeferred / syncTOCDeferred. Exposed primarily for
  // tests so a lingering timer from a previous test cannot land inside a
  // later test's assertion window and trigger its freshly-defined globals.
  function resetPendingTimers(){
    if(state.refTimer){ clearTimeout(state.refTimer); state.refTimer = null; }
    if(state.academicTimer){ clearTimeout(state.academicTimer); state.academicTimer = null; }
    if(state.tocTimer){ clearTimeout(state.tocTimer); state.tocTimer = null; }
  }

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

  function isTokenActive(options){
    if(!options || options.token == null || typeof options.isTokenActive !== 'function'){
      return true;
    }
    try{
      return !!options.isTokenActive(options.token);
    }catch(e){
      return true;
    }
  }

  function ensureEditorWritableState(editorRef){
    var ed = editorRef || getEditor();
    if(!ed) return false;
    try{
      if(typeof ed.setEditable === 'function' && ed.isEditable === false){
        ed.setEditable(true);
      }
    }catch(e){}
    try{
      if(!ed.state || !ed.state.doc || !ed.commands || typeof ed.commands.setContent !== 'function') return false;
      var dom = ed.view && ed.view.dom ? ed.view.dom : null;
      var hasWritableBlock = !!(dom && dom.querySelector && dom.querySelector('p,h1,h2,h3,h4,h5,blockquote,ul,ol,table'));
      var text = String(ed.state.doc.textContent || '').replace(/\u00a0/g, ' ').trim();
      if(!hasWritableBlock && !text){
        ed.commands.setContent('<p></p>', false);
        return true;
      }
    }catch(e){}
    return false;
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

  function syncAcademicObjectsDeferred(delay, target){
    clearTimeout(state.academicTimer);
    state.academicTimer = setTimeout(function(){
      if(root.AQAcademicObjects && typeof root.AQAcademicObjects.normalizeDocument === 'function'){
        safeCall(function(){
          root.AQAcademicObjects.normalizeDocument({
            root: target || (typeof document !== 'undefined' ? document.getElementById('apaed') : null)
          });
        });
      }
    }, parseInt(delay, 10) || 140);
  }

  function cssEscape(value){
    var text = String(value == null ? '' : value);
    if(typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function'){
      try{ return CSS.escape(text); }catch(_e){}
    }
    return text.replace(/(["\\])/g, '\\$1');
  }

  function ensureNotesPanelOpen(){
    var notesBtn = typeof document !== 'undefined' ? document.getElementById('rtypeNotesBtn') : null;
    var refsBtn = typeof document !== 'undefined' ? document.getElementById('rtypeRefsBtn') : null;
    var notesPanel = typeof document !== 'undefined' ? document.getElementById('rpnotes') : null;
    var refsPanel = typeof document !== 'undefined' ? document.getElementById('rprefs') : null;
    if(root.swR && typeof root.swR === 'function'){
      safeCall(function(){ root.swR('notes', notesBtn || null); });
      return true;
    }
    if(notesBtn) notesBtn.classList.add('on');
    if(refsBtn) refsBtn.classList.remove('on');
    if(notesPanel) notesPanel.classList.add('on');
    if(refsPanel) refsPanel.classList.remove('on');
    return !!notesPanel;
  }

  function resolveLinkedMetaFromSelection(editorRef){
    if(!root.AQNoteLinking || typeof root.AQNoteLinking.resolveLinkFromEditorSelection !== 'function'){
      return null;
    }
    return safeCall(function(){
      return root.AQNoteLinking.resolveLinkFromEditorSelection({
        editor: editorRef || getEditor(),
        root: typeof document !== 'undefined' ? document.getElementById('apaed') : null
      });
    }) || null;
  }

  function focusLinkedNoteFallback(meta, options){
    options = options || {};
    var noteId = String(meta && meta.noteId || '').trim();
    if(!noteId || typeof document === 'undefined') return false;
    var notes = root.S && Array.isArray(root.S.notes) ? root.S.notes : [];
    var note = notes.find(function(entry){ return entry && String(entry.id || '') === noteId; }) || null;
    if(!note) return false;
    if(root.S && note.nbId && String(root.S.curNb || '') !== String(note.nbId)){
      root.S.curNb = note.nbId;
      if(typeof root.rNB === 'function') safeCall(root.rNB);
    }
    ensureNotesPanelOpen();
    if(typeof root.rNotes === 'function') safeCall(root.rNotes);
    var list = document.getElementById('notelist');
    if(!list) return false;
    list.querySelectorAll('.nc.note-linked-active').forEach(function(card){
      card.classList.remove('note-linked-active');
    });
    var card = list.querySelector('.nc[data-note-id="' + cssEscape(noteId) + '"]');
    if(!card){
      card = Array.from(list.querySelectorAll('[data-note-id]')).find(function(node){
        return String(node.getAttribute('data-note-id') || '') === noteId;
      });
      card = card && card.closest ? card.closest('.nc') : null;
    }
    if(!card) return false;
    card.classList.add('note-linked-active');
    if(options.scrollIntoView !== false){
      safeCall(function(){
        card.scrollIntoView({ block:'nearest', inline:'nearest', behavior: options.behavior || 'auto' });
      });
    }
    return true;
  }

  function runContentApplyEffects(options){
    options = options || {};
    setTimeout(function(){
      if(options.renderRefs && typeof root.rRefs === 'function'){
        safeCall(root.rRefs);
      }
      ensureEditorWritableState(options.editor || null);
      if(options.normalize !== false){
        if(typeof root.normalizeCitationSpans === 'function'){
          try{ root.normalizeCitationSpans(options.target || undefined); }catch(e){}
        }
      }
      if(options.syncAcademicObjects !== false){
        syncAcademicObjectsDeferred(options.academicDelay, options.target || null);
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
      if(typeof root.refreshDocumentOutlineIfOpen === 'function'){
        safeCall(root.refreshDocumentOutlineIfOpen);
      }
      if(typeof root.refreshCaptionManagerIfOpen === 'function'){
        safeCall(root.refreshCaptionManagerIfOpen);
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
      if(!isTokenActive(options)) return;
      if(typeof options.beforeApply === 'function'){
        safeCall(options.beforeApply);
      }
      if(!isTokenActive(options)) return;
      if(options.normalize !== false && typeof root.normalizeCitationSpans === 'function'){
        try{ root.normalizeCitationSpans(options.target || undefined); }catch(e){}
      }
      if(options.syncAcademicObjects !== false){
        syncAcademicObjectsDeferred(options.academicDelay, options.target || null);
      }
      if(!isTokenActive(options)) return;
      if(options.focusToEnd && typeof options.focusToEndFn === 'function'){
        safeCall(options.focusToEndFn);
      }else if(options.focusSurface && typeof options.focusSurfaceFn === 'function'){
        safeCall(options.focusSurfaceFn);
      }
      if(!isTokenActive(options)) return;
      if(options.syncRefs !== false && typeof root.updateRefSection === 'function'){
        safeCall(function(){ root.updateRefSection(); });
      }
      if(!isTokenActive(options)) return;
      if(options.syncChrome !== false){
        syncEditorChrome();
      }
      ensureEditorWritableState(options.editor || null);
      if(options.layout !== false){
        syncPageLayout();
      }
      if(typeof root.refreshDocumentOutlineIfOpen === 'function'){
        safeCall(root.refreshDocumentOutlineIfOpen);
      }
      if(typeof root.refreshCaptionManagerIfOpen === 'function'){
        safeCall(root.refreshCaptionManagerIfOpen);
      }
      if(!isTokenActive(options)) return;
      if(typeof options.afterLayout === 'function'){
        safeCall(options.afterLayout);
      }
    }, parseInt(options.delay, 10) || 0);
    return true;
  }

  // ── Throttled update pipeline ──
  // Batch deferred work into a single rAF/timer so rapid keystrokes don't
  // queue dozens of overlapping timeouts.
  var _updateToken = 0;
  var _rafPending = false;

  function onEditorUpdate(ctx){
    if(root.__aqDocSwitching) return;
    var editor = ctx && ctx.editor ? ctx.editor : null;
    ensureEditorWritableState(editor);
    // Synchronous – must stay immediate for save indicator & dirty state
    syncEditorChrome();
    // Everything else is deferred into a single batch
    _updateToken++;
    if(_rafPending) return;
    _rafPending = true;
    var raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : function(fn){ setTimeout(fn, 16); };
    raf(function(){
      _rafPending = false;
      var dom = editor && editor.view ? editor.view.dom : null;
      normalizeCitationSpansDeferred(dom, 0);
      syncAcademicObjectsDeferred(220, dom);
      syncPageLayout();
      if(typeof root.refreshDocumentOutlineIfOpen === 'function'){
        safeCall(root.refreshDocumentOutlineIfOpen);
      }
      if(typeof root.refreshCaptionManagerIfOpen === 'function'){
        safeCall(root.refreshCaptionManagerIfOpen);
      }
      syncTOCDeferred(200);
      syncReferenceSectionDeferred(600);
      setTimeout(refreshCitationTrigger, 0);
    });
  }

  function onSelectionUpdate(){
    if(typeof root.updateFmtState === 'function'){
      safeCall(root.updateFmtState);
    }
    setTimeout(refreshCitationTrigger, 0);
    setTimeout(function(){
      var handled = false;
      if(root.AQNotes && typeof root.AQNotes.syncLinkedNoteFromEditorSelection === 'function'){
        var link = safeCall(function(){
          return root.AQNotes.syncLinkedNoteFromEditorSelection({ clearOnUnlinked:true, scrollIntoView:true });
        });
        handled = !!(link && link.noteId);
      }
      if(!handled){
        var meta = resolveLinkedMetaFromSelection(getEditor());
        if(meta && meta.noteId){
          focusLinkedNoteFallback(meta, { scrollIntoView:true, behavior:'auto' });
        }
      }
    }, 0);
  }

  function focus(toEnd){
    if(root.AQEditorCore && typeof root.AQEditorCore.focus === 'function'){
      try{ return !!root.AQEditorCore.focus(!!toEnd); }catch(e){}
    }
    return false;
  }

  function attachSurfaceHandlers(){
    if(state.linkedBound || typeof document === 'undefined') return true;
    var host = document.getElementById('apaed');
    if(!host || !host.addEventListener) return true;
    state.linkedBound = true;
    // The capture-phase click listener that previously lived here resolved
    // linked-note metadata from the current selection on every click. That
    // duplicated the work already performed in `onSelectionUpdate`, and on a
    // bloated paste it walked the entire ancestor chain twice per click,
    // which made the editor unresponsive after large pastes from outside.
    // `onSelectionUpdate` covers the same path; the click handler is dropped.
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
    syncAcademicObjectsDeferred: syncAcademicObjectsDeferred,
    syncTOCDeferred: syncTOCDeferred,
    refreshCitationTrigger: refreshCitationTrigger,
    syncEditorChrome: syncEditorChrome,
    syncCommandUI: syncCommandUI,
    normalizeCitationSpansDeferred: normalizeCitationSpansDeferred,
    runContentApplyEffects: runContentApplyEffects,
    handleMutation: handleMutation,
    runDocumentLoadEffects: runDocumentLoadEffects,
    focus: focus,
    resetPendingTimers: resetPendingTimers
  };
});
