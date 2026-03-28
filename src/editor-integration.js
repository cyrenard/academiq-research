(function(){
  function getEditor(){
    if(window.AQEditorCore && typeof window.AQEditorCore.getEditor === 'function'){
      var coreEditor = window.AQEditorCore.getEditor();
      if(coreEditor) return coreEditor;
    }
    if(window.AQEditorLifecycle && typeof window.AQEditorLifecycle.ensureInitialized === 'function'){
      try{
        var ensured = window.AQEditorLifecycle.ensureInitialized();
        var surface = window.AQTipTapWordSurface || null;
        var host = surface && typeof surface.getHost === 'function' ? surface.getHost() : document.getElementById('apaed');
        if(ensured && ensured !== host) return ensured;
      }catch(e){}
    }
    if(window.AQEditorLifecycle && typeof window.AQEditorLifecycle.getEditor === 'function'){
      return window.AQEditorLifecycle.getEditor();
    }
    return window.editor || null;
  }

  function getScrollEl(){
    if(window.AQEditorCore && typeof window.AQEditorCore.getScrollSurface === 'function'){
      var coreScroll = window.AQEditorCore.getScrollSurface();
      if(coreScroll) return coreScroll;
    }
    if(window.AQEditorShell && typeof window.AQEditorShell.getScrollEl === 'function'){
      var shellScroll = window.AQEditorShell.getScrollEl();
      if(shellScroll) return shellScroll;
    }
    return document.getElementById('escroll');
  }

  function saveScroll(){
    if(window.AQEditorCore && typeof window.AQEditorCore.saveScroll === 'function'){
      return window.AQEditorCore.saveScroll();
    }
    var sc = getScrollEl();
    return sc ? sc.scrollTop : 0;
  }

  function restoreScroll(top){
    if(window.AQEditorCore && typeof window.AQEditorCore.restoreScroll === 'function'){
      window.AQEditorCore.restoreScroll(top, [0]);
      return;
    }
    var sc = getScrollEl();
    if(!sc) return;
    try{ sc.scrollTop = top; }catch(e){}
  }

  function focusEditor(toEnd){
    if(window.AQEditorCore && typeof window.AQEditorCore.focus === 'function'){
      return !!window.AQEditorCore.focus(!!toEnd);
    }
    if(typeof window.focusEditorSurface === 'function'){
      try{ window.focusEditorSurface(!!toEnd); return true; }catch(e){}
    }
    var ed = getEditor();
    if(ed && ed.chain){
      try{
        var chain = ed.chain().focus();
        if(toEnd) chain.focus('end');
        chain.run();
        return true;
      }catch(e){}
    }
    return false;
  }

  function releaseFocus(){
    if(window.AQEditorCore && typeof window.AQEditorCore.releaseFocus === 'function'){
      window.AQEditorCore.releaseFocus();
      return;
    }
    try{
      if(document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
    }catch(e){}
    try{
      if(document.body){
        if(!document.body.hasAttribute('tabindex')) document.body.setAttribute('tabindex','-1');
        document.body.focus({ preventScroll:true });
      }
    }catch(e){}
  }

  function insertHTML(html){
    if(window.AQEditorCore && typeof window.AQEditorCore.insertHTML === 'function'){
      return !!window.AQEditorCore.insertHTML(html);
    }
    var ed = getEditor();
    if(ed && ed.chain){
      ed.chain().insertContent(html, { parseOptions:{ preserveWhitespace:false } }).run();
      return true;
    }
    if(typeof window.iHTML === 'function'){
      window.iHTML(html);
      return true;
    }
    return false;
  }

  function preserveScroll(callback, delays){
    if(window.AQEditorCore && typeof window.AQEditorCore.saveScroll === 'function' && typeof window.AQEditorCore.restoreScroll === 'function'){
      var saved = window.AQEditorCore.saveScroll();
      var resultCore = callback ? callback() : undefined;
      window.AQEditorCore.restoreScroll(saved, Array.isArray(delays) && delays.length ? delays : [0,16,40]);
      return resultCore;
    }
    var top = saveScroll();
    var result = callback ? callback() : undefined;
    (Array.isArray(delays) && delays.length ? delays : [0,16,40]).forEach(function(ms){
      setTimeout(function(){ restoreScroll(top); }, ms);
    });
    return result;
  }

  window.AQEditorIntegration = {
    init: function(){
      if(window.AQEditorCore && typeof window.AQEditorCore.init === 'function'){
        window.AQEditorCore.init();
      }
    },
    getEditor: getEditor,
    getScrollEl: getScrollEl,
    saveScroll: saveScroll,
    restoreScroll: restoreScroll,
    focusEditor: focusEditor,
    releaseFocus: releaseFocus,
    insertHTML: insertHTML,
    preserveScroll: preserveScroll
  };
})();
