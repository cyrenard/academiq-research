(function(){
  if(typeof console !== 'undefined'){ console.log('[AQ] editor-core loaded') }
  var state = {
    initialized: false,
    ready: false,
    mode: 'unknown',
    selectionBookmark: null,
    lastScrollTop: 0
  };

  function qs(id){ return document.getElementById(id); }

  function getLifecycle(){
    return window.AQEditorLifecycle || null;
  }

  function getShell(){
    return window.AQEditorShell || null;
  }

  function getTipTapShell(){
    return window.AQTipTapShell || null;
  }

  function getWordSurface(){
    return window.AQTipTapWordSurface || null;
  }

  function getEditor(){
    var lifecycle = getLifecycle();
    if(lifecycle && typeof lifecycle.getEditor === 'function'){
      return lifecycle.getEditor();
    }
    return window.editor || null;
  }

  function getContentRoot(){
    var editor = getEditor();
    if(editor && editor.view && editor.view.dom) return editor.view.dom;
    var surface = getWordSurface();
    if(surface && typeof surface.getMount === 'function'){
      var mount = surface.getMount();
      if(mount) return mount;
    }
    var shell = getTipTapShell();
    if(shell && typeof shell.getMountEl === 'function'){
      var mount = shell.getMountEl();
      if(mount) return mount;
    }
    return qs('apaed');
  }

  function getScrollSurface(){
    var shell = getShell();
    if(shell && typeof shell.getScrollEl === 'function'){
      var scrollEl = shell.getScrollEl();
      if(scrollEl) return scrollEl;
    }
    return qs('escroll');
  }

  function syncShell(){
    var shell = getShell();
    if(shell && typeof shell.syncLayout === 'function'){
      try{ shell.syncLayout(); }catch(e){}
    }
  }

  function ensureReady(){
    var lifecycle = getLifecycle();
    var instance = lifecycle && typeof lifecycle.ensureInitialized === 'function'
      ? lifecycle.ensureInitialized()
      : getEditor();
    state.initialized = true;
    state.ready = !!instance;
    state.mode = getEditor() ? 'tiptap' : 'missing';
    syncShell();
    return instance;
  }

  function saveScroll(){
    var scrollEl = getScrollSurface();
    state.lastScrollTop = scrollEl ? scrollEl.scrollTop : 0;
    return state.lastScrollTop;
  }

  function restoreScroll(top, delays){
    var scrollEl = getScrollSurface();
    var nextTop = typeof top === 'number' ? top : state.lastScrollTop;
    if(!scrollEl) return nextTop;
    (Array.isArray(delays) && delays.length ? delays : [0,16,48,120]).forEach(function(ms){
      setTimeout(function(){
        try{ scrollEl.scrollTop = nextTop; }catch(e){}
      }, ms);
    });
    state.lastScrollTop = nextTop;
    return nextTop;
  }

  function captureSelection(){
    var editor = getEditor();
    if(editor && editor.state && editor.state.selection){
      state.selectionBookmark = {
        type: 'pm',
        from: editor.state.selection.from,
        to: editor.state.selection.to
      };
      return state.selectionBookmark;
    }
    var sel = window.getSelection && window.getSelection();
    if(sel && sel.rangeCount){
      try{
        state.selectionBookmark = {
          type: 'dom',
          range: sel.getRangeAt(0).cloneRange()
        };
        return state.selectionBookmark;
      }catch(e){}
    }
    state.selectionBookmark = null;
    return null;
  }

  function restoreSelection(bookmark, options){
    var target = bookmark || state.selectionBookmark;
    var focusAtEnd = !!(options && options.focusAtEnd);
    var editor = getEditor();
    if(target && target.type === 'pm' && editor && editor.chain){
      try{
        var chain = editor.chain().focus();
        if(target.from >= 0 && target.to >= target.from){
          chain.setTextSelection({ from: target.from, to: target.to });
        }else if(focusAtEnd){
          chain.focus('end');
        }
        chain.run();
        return true;
      }catch(e){}
    }
    if(target && target.type === 'dom' && target.range){
      try{
        var sel = window.getSelection();
        if(sel){
          sel.removeAllRanges();
          sel.addRange(target.range);
          return true;
        }
      }catch(e){}
    }
    return focus(focusAtEnd);
  }

  function focus(toEnd){
    ensureReady();
    var editor = getEditor();
    if(editor && editor.chain){
      try{
        var chain = editor.chain().focus();
        if(toEnd) chain.focus('end');
        chain.run();
        return true;
      }catch(e){}
    }
    if(typeof window.focusEditorSurface === 'function'){
      try{
        window.focusEditorSurface(!!toEnd);
        return true;
      }catch(e){}
    }
    var surface = getWordSurface();
    var focusable = surface && typeof surface.getEditorDom === 'function'
      ? surface.getEditorDom()
      : null;
    if(!focusable){
      var shell = getTipTapShell();
      focusable = shell && typeof shell.getFocusableEl === 'function'
        ? shell.getFocusableEl()
        : null;
    }
    var root = focusable || getContentRoot();
    if(root && typeof root.focus === 'function'){
      try{ root.focus({ preventScroll:true }); return true; }catch(e){}
      try{ root.focus(); return true; }catch(e){}
    }
    return false;
  }

  function releaseFocus(){
    try{
      if(document.activeElement && typeof document.activeElement.blur === 'function'){
        document.activeElement.blur();
      }
    }catch(e){}
    try{
      if(document.body){
        if(!document.body.hasAttribute('tabindex')) document.body.setAttribute('tabindex','-1');
        document.body.focus({ preventScroll:true });
      }
    }catch(e){}
  }

  function withPreservedSelection(fn, options){
    var scrollTop = saveScroll();
    var bookmark = captureSelection();
    try{
      return fn ? fn() : undefined;
    }finally{
      restoreSelection(bookmark, options || {});
      restoreScroll(scrollTop);
    }
  }

  function setContent(html, focusAtEnd){
    var restoreTop = saveScroll();
    if(typeof window.__aqSetEditorDoc === 'function'){
      window.__aqSetEditorDoc(html, !!focusAtEnd);
      if(!focusAtEnd){
        restoreScroll(restoreTop, [0, 16, 64, 140]);
      }
      syncShell();
      return true;
    }
    return false;
  }

  function getContent(){
    var editor = getEditor();
    if(editor && typeof editor.getHTML === 'function'){
      return editor.getHTML();
    }
    var surface = getWordSurface();
    if(surface && typeof surface.getHost === 'function'){
      var host = surface.getHost();
      if(host) return host.innerHTML || '';
    }
    var shell = getTipTapShell();
    if(shell && typeof shell.getHTML === 'function'){
      return shell.getHTML();
    }
    var root = qs('apaed');
    return root ? root.innerHTML : '';
  }

  function insertHTML(html){
    var editor = getEditor();
    if(editor && editor.chain){
      editor.chain().insertContent(html, { parseOptions:{ preserveWhitespace:false } }).run();
      return true;
    }
    if(typeof window.iHTML === 'function'){
      window.iHTML(html);
      return true;
    }
    return false;
  }

  function init(){
    ensureReady();
    window.__aqEditorArchitectureV1 = true;
    // Ensure the editor content root is above overlays to receive clicks
    var rootEl = getContentRoot();
    if(rootEl && rootEl.style){
      rootEl.style.position = rootEl.style.position || 'relative';
      // Give editor content a reasonably high stacking context
      rootEl.style.zIndex = rootEl.style.zIndex || '60';
    }
    // Debug: log clicks to verify events reach editor root
    if(rootEl){
      try{
        rootEl.addEventListener('mousedown', function(){ console.log('[AQ] Editor root clicked (mousedown)'); }, true);
        rootEl.addEventListener('keydown', function(e){ console.log('[AQ] Editor root keydown', e.key); }, true);
      }catch(_e){}
    }
    // Try to focus the editor root to enable typing immediately
    setTimeout(function(){
      try{
        if(rootEl && typeof rootEl.focus === 'function') rootEl.focus({ preventScroll:true });
      }catch(e){}
    }, 0);
    // Ensure the editor root is clearly above overlays in stacking context
    if(rootEl && rootEl.style){
      rootEl.style.zIndex = '1000';
    }
    // Ensure the root is focusable programmatically
    if(rootEl && typeof rootEl.setAttribute === 'function' && rootEl.getAttribute('tabindex') == null){
      rootEl.setAttribute('tabindex','-1');
    }
    // Lightweight visible debug banner to verify patch is active
    try{
      if(typeof document !== 'undefined' && !document.getElementById('aq-debug-banner')){
        var b = document.createElement('div');
        b.id = 'aq-debug-banner';
        b.style.position = 'fixed';
        b.style.bottom = '8px';
        b.style.right = '12px';
        b.style.background = 'rgba(0,0,0,0.75)';
        b.style.color = '#fff';
        b.style.padding = '6px 10px';
        b.style.borderRadius = '6px';
        b.style.fontFamily = 'Arial, sans-serif';
        b.style.zIndex = '99999';
        b.textContent = 'AQ Patch Active';
        document.body.appendChild(b);
      }
    }catch(e){}
    return rootEl;
  }

  window.AQEditorCore = {
    init: init,
    ensureReady: ensureReady,
    getEditor: getEditor,
    getContentRoot: getContentRoot,
    getScrollSurface: getScrollSurface,
    syncShell: syncShell,
    saveScroll: saveScroll,
    restoreScroll: restoreScroll,
    captureSelection: captureSelection,
    restoreSelection: restoreSelection,
    withPreservedSelection: withPreservedSelection,
    focus: focus,
    releaseFocus: releaseFocus,
    setContent: setContent,
    getContent: getContent,
    insertHTML: insertHTML,
    getState: function(){
      return {
        initialized: state.initialized,
        ready: state.ready,
        mode: state.mode,
        lastScrollTop: state.lastScrollTop
      };
    }
  };
})();
