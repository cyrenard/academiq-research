(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordFocus = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  function restoreScroll(sc, top, delays){
    if(!sc) return;
    delays.forEach(function(ms){
      setTimeout(function(){
        if(Math.abs((sc.scrollTop || 0) - top) <= 1) return;
        try{ sc.scrollTop = top; }catch(e){}
      }, ms);
    });
  }

  function focusEditorSurface(options){
    options = options || {};
    var editor = options.editor || null;
    if(!editor) return false;
    var sc = typeof options.getScrollEl === 'function' ? options.getScrollEl() : null;
    var top = sc ? sc.scrollTop : 0;
    var delays = Array.isArray(options.restoreDelays) && options.restoreDelays.length
      ? options.restoreDelays
      : [0,24];

    if(typeof options.ensureEditableRoot === 'function'){
      options.ensureEditableRoot();
    }

    var html = typeof options.getHTML === 'function'
      ? options.getHTML()
      : (typeof editor.getHTML === 'function' ? editor.getHTML() : '');
    var sanitized = typeof options.sanitizeHTML === 'function'
      ? options.sanitizeHTML(html || '')
      : String(html || '');
    sanitized = String(sanitized || '').trim();

    if(!sanitized || sanitized === '<p></p>' || sanitized === '<p><br></p>'){
      if(editor.commands && typeof editor.commands.setContent === 'function'){
        editor.commands.setContent('<p></p>', false);
      }
    }

    try{
      if(editor.view && editor.view.dom && typeof editor.view.dom.focus === 'function'){
        try{ editor.view.dom.focus({ preventScroll:true }); }catch(ex){ editor.view.dom.focus(); }
      }
      if(options.toEnd){
        var endPos = (editor.state && editor.state.doc && editor.state.doc.content)
          ? editor.state.doc.content.size
          : 0;
        if(editor.commands && typeof editor.commands.setTextSelection === 'function'){
          editor.commands.setTextSelection(endPos);
        }else if(editor.commands && typeof editor.commands.focus === 'function'){
          editor.commands.focus('end');
        }
      }
    }catch(e){
      if(editor.commands && typeof editor.commands.focus === 'function'){
        editor.commands.focus(options.toEnd ? 'end' : undefined);
      }
    }

    if(sc && options.preserveScroll !== false && Math.abs((sc.scrollTop || 0) - top) > 1){
      restoreScroll(sc, top, delays);
    }
    return true;
  }

  function focusWithFallback(options){
    return focusEditorSurface(options);
  }

  return {
    focusEditorSurface: focusEditorSurface,
    focusWithFallback: focusWithFallback
  };
});
