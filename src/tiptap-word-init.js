(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordInit = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  function ensureCitationRuntimeReady(attempt){
    var tries = parseInt(attempt, 10) || 0;
    if(typeof window === 'undefined') return;
    if(window.AQCitationRuntime && typeof window.AQCitationRuntime.init === 'function'){
      try{ window.AQCitationRuntime.init(); }catch(e){}
      return;
    }
    if(tries >= 5) return;
    setTimeout(function(){
      ensureCitationRuntimeReady(tries + 1);
    }, 80);
  }

  function enableFallbackEditable(edEl, html){
    if(!edEl) return null;
    var shell = window.AQTipTapShell || null;
    var mountEl = shell && typeof shell.getMountEl === 'function' ? shell.getMountEl() : null;
    var target = mountEl || edEl;
    if(html && !String(target.innerHTML || '').trim()){
      target.innerHTML = String(html);
    }
    target.setAttribute('contenteditable', 'true');
    target.setAttribute('spellcheck', 'false');
    target.setAttribute('autocorrect', 'off');
    target.setAttribute('autocomplete', 'off');
    target.setAttribute('autocapitalize', 'off');
    target.classList.add('ProseMirror');
    window.editor = null;
    return null;
  }

  function init(){
    if(typeof window === 'undefined') return null;
    if(!window.TipTap){
      console.warn('TipTap bundle not loaded');
      return enableFallbackEditable(document.getElementById('apaed'), '<p></p>');
    }
    var T = window.TipTap;
    var factory = window.AQTipTapWordEditor;
    var pasteMod = window.AQTipTapWordPaste || null;
    var edEl = document.getElementById('apaed');
    var tiptapShell = window.AQTipTapShell || null;
    if(tiptapShell && typeof tiptapShell.init === 'function') tiptapShell.init();
    var existingHTML = tiptapShell && typeof tiptapShell.getHTML === 'function'
      ? tiptapShell.getHTML()
      : (edEl ? edEl.innerHTML : '<p></p>');
    // Extract footnote and margin-note stores before TipTap parses the HTML
    if(window.AQFootnotes && typeof window.AQFootnotes.hookSetHTML === 'function'){
      existingHTML = window.AQFootnotes.hookSetHTML(existingHTML);
    }
    if(window.AQMarginNotes && typeof window.AQMarginNotes.hookSetHTML === 'function'){
      existingHTML = window.AQMarginNotes.hookSetHTML(existingHTML);
    }
    var mountEl = tiptapShell && typeof tiptapShell.getMountEl === 'function'
      ? tiptapShell.getMountEl()
      : null;
    if(!mountEl){
      console.error('TipTap shell mount missing');
      return enableFallbackEditable(edEl, existingHTML || '<p></p>');
    }
    var shellEl = tiptapShell && typeof tiptapShell.getShellEl === 'function'
      ? tiptapShell.getShellEl()
      : null;
    if(edEl && shellEl && shellEl.parentElement === edEl && edEl.children && edEl.children.length > 1){
      Array.prototype.slice.call(edEl.children).forEach(function(child){
        if(child !== shellEl) child.remove();
      });
    }

    // ── Shared event callbacks ────────────────────────────────────────────
    var _onUpdate = function(ctx){
      if(window.AQEditorRuntime && typeof window.AQEditorRuntime.onEditorUpdate === 'function'){
        window.AQEditorRuntime.onEditorUpdate(ctx);
        return;
      }
      if(window.__aqDocSwitching) return;
      if(typeof window.uSt === 'function') window.uSt();
      if(typeof window.save === 'function') window.save();
      if(typeof window.normalizeCitationSpans === 'function'){
        setTimeout(function(){ window.normalizeCitationSpans(ctx.editor.view.dom); }, 0);
      }
      if(typeof window.updatePageHeight === 'function') window.updatePageHeight();
      if(typeof window.autoUpdateTOC === 'function') window.autoUpdateTOC();
      setTimeout(function(){
        if(typeof window.checkTrig === 'function') window.checkTrig();
      }, 0);
      clearTimeout(window._refTimer);
      window._refTimer = setTimeout(function(){
        var edDom = ctx.editor.view.dom;
        var isAQEngine = !!(ctx.editor && ctx.editor._aqEngine);
        var refH1 = isAQEngine ? true : Array.from(edDom.querySelectorAll('h1')).find(function(h){
          return h.textContent.trim() === 'Kaynakça';
        });
        if(refH1 && typeof window.scheduleRefSectionSync === 'function') window.scheduleRefSectionSync();
      }, isAQEngine ? 500 : 2000);
    };
    var _onSelectionUpdate = function(){
      if(window.AQEditorRuntime && typeof window.AQEditorRuntime.onSelectionUpdate === 'function'){
        window.AQEditorRuntime.onSelectionUpdate();
        return;
      }
      if(typeof window.updateFmtState === 'function') window.updateFmtState();
      setTimeout(function(){
        if(typeof window.checkTrig === 'function') window.checkTrig();
      }, 0);
    };

    try{
      // ── AQ Engine path — use custom engine if available ────────────────
      // Mount in a dedicated host inside #escroll, completely bypassing the
      // legacy #apapage shell (its pagination/mask/observer layers conflict
      // with the engine's own pagination).
      if(window.AQEngineCompat && window.AQEngine && window.AQEngineDocument){
        var scrollEl = document.getElementById('escroll');
        if(!scrollEl) throw new Error('escroll missing');
        // Hide every legacy page wrapper so it cannot intercept clicks or
        // run its observers against engine output.
        ['coverpage','tocpage','apapage','bibpage','appendixpage'].forEach(function(id){
          var legacyEl = document.getElementById(id);
          if(legacyEl) legacyEl.style.display = 'none';
        });
        // Stop legacy pagination calls dead.
        window.__aqEngineActive = true;
        // The engine page is fixed-width (A4 = 794px); when the scroll area is
        // narrower than that (eg. side panels open) we still need the page to
        // be centered horizontally and overflow visible/scrollable rather than
        // clipped to one side.
        scrollEl.style.alignItems = 'center';
        scrollEl.style.overflowX = 'auto';
        // Build/locate the engine host.
        var engineHost = document.getElementById('aq-engine-host');
        if(!engineHost){
          engineHost = document.createElement('div');
          engineHost.id = 'aq-engine-host';
          engineHost.style.cssText = 'position:relative;width:100%;display:flex;flex-direction:column;align-items:center;';
          scrollEl.appendChild(engineHost);
        } else {
          engineHost.style.display = '';
          engineHost.style.cssText = 'position:relative;width:100%;display:flex;flex-direction:column;align-items:center;';
          engineHost.innerHTML = '';
        }
        edEl.removeAttribute('contenteditable');
        window.editor = window.AQEngineCompat.createEditor({
          element: engineHost,
          content: existingHTML || '<p></p>',
          onUpdate: _onUpdate,
          onSelectionUpdate: _onSelectionUpdate
        });
      }
      // ── TipTap path — original ────────────────────────────────────────
      else {
      if(!factory || typeof factory.createEditor !== 'function'){
        console.error('TipTap word editor module missing');
        return enableFallbackEditable(edEl, existingHTML || '<p></p>');
      }
      edEl.removeAttribute('contenteditable');
      mountEl.innerHTML = '';
      window.editor = factory.createEditor(T, {
        element: mountEl,
        content: existingHTML || '<p></p>',
        hooks: {
          cleanPastedHTML: pasteMod && typeof pasteMod.cleanPastedHTML === 'function' ? pasteMod.cleanPastedHTML : window.cleanPastedHTML,
          formatPlainTextAPA: pasteMod && typeof pasteMod.formatPlainTextAPA === 'function' ? pasteMod.formatPlainTextAPA : window.formatPlainTextAPA,
          placeholder: 'Yazmaya başlayın...',
          onMutate: function(){
            if(window.AQEditorRuntime && typeof window.AQEditorRuntime.handleMutation === 'function'){
              window.AQEditorRuntime.handleMutation();
              return;
            }
            if(typeof window.uSt === 'function') window.uSt();
            if(typeof window.save === 'function') window.save();
            if(typeof window.updatePageHeight === 'function') window.updatePageHeight();
          }
        },
        onUpdate: _onUpdate,
        onSelectionUpdate: _onSelectionUpdate
      });
      } // end else (TipTap path)
      // Init footnotes module
      if(window.AQFootnotes && typeof window.AQFootnotes.init === 'function'){
        window.AQFootnotes.init();
      }
      // Init margin notes module
      if(window.AQMarginNotes && typeof window.AQMarginNotes.init === 'function'){
        window.AQMarginNotes.init();
      }
      // Citation trigger runtime powers `/r` insertion and slash detection.
      // Keep it explicitly initialized with the editor surface bootstrap.
      ensureCitationRuntimeReady(0);
      if(window.editor && typeof window.editor.setEditable === 'function'){
        try{ window.editor.setEditable(true); }catch(e){}
      }
      try{
        if(typeof window.setLineSpacing === 'function'){
          window.setLineSpacing('2');
        }else if(window.AQTipTapWordCommands && typeof window.AQTipTapWordCommands.applyLineSpacing === 'function'){
          window.AQTipTapWordCommands.applyLineSpacing('2');
        }
      }catch(e){}
      if(window.AQTipTapWordEvents && typeof window.AQTipTapWordEvents.init === 'function'){
        window.AQTipTapWordEvents.init();
      }else{
      }
      if(window.AQTipTapWordEvents && typeof window.AQTipTapWordEvents.applySurfaceAttributes === 'function'){
        window.AQTipTapWordEvents.applySurfaceAttributes(edEl);
        if(mountEl && mountEl !== edEl) window.AQTipTapWordEvents.applySurfaceAttributes(mountEl);
      }
      if(window.AQTipTapWordEvents && typeof window.AQTipTapWordEvents.watchSurface === 'function'){
        window.AQTipTapWordEvents.watchSurface();
      }
      if(typeof ResizeObserver !== 'undefined'){
        try{
          var _roTimer = null;
          new ResizeObserver(function(){
            clearTimeout(_roTimer);
            _roTimer = setTimeout(function(){
              if(typeof window.updatePageHeight === 'function') window.updatePageHeight();
            }, 200);
          }).observe(window.editor.view.dom);
        }catch(e){}
      }
      return window.editor;
    }catch(e){
      console.error('TipTap init failed:', e);
      return enableFallbackEditable(edEl, existingHTML || '<p></p>');
    }
  }

  return {
    init: init
  };
});
