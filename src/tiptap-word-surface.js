(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordSurface = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  function getShell(){
    return typeof window !== 'undefined' ? (window.AQTipTapShell || null) : null;
  }

  function getHost(){
    var shell = getShell();
    return shell && typeof shell.getHostEl === 'function' ? shell.getHostEl() : null;
  }

  function getBody(){
    var shell = getShell();
    return shell && typeof shell.getBodyEl === 'function' ? shell.getBodyEl() : null;
  }

  function getMount(){
    var shell = getShell();
    return shell && typeof shell.getMountEl === 'function' ? shell.getMountEl() : null;
  }

  function getEditorDom(){
    var shell = getShell();
    if(shell && typeof shell.getFocusableEl === 'function'){
      var focusable = shell.getFocusableEl();
      if(focusable) return focusable;
    }
    if(typeof document !== 'undefined'){
      return document.querySelector('#aq-tiptap-content .ProseMirror') || getMount() || getHost();
    }
    return null;
  }

  function contains(node){
    var host = getHost();
    return !!(host && node && host.contains(node));
  }

  function query(selector){
    var host = getHost();
    return host ? host.querySelector(selector) : null;
  }

  function queryAll(selector){
    var host = getHost();
    return host ? Array.from(host.querySelectorAll(selector)) : [];
  }

  function focus(options){
    var editorDom = getEditorDom();
    var toEnd = !!(options && options.toEnd);
    if(typeof window !== 'undefined' && window.editor && window.editor.chain){
      try{
        var chain = window.editor.chain().focus();
        if(toEnd) chain.focus('end');
        chain.run();
        return true;
      }catch(e){}
    }
    if(editorDom && typeof editorDom.focus === 'function'){
      try{ editorDom.focus({ preventScroll:true }); return true; }catch(e){}
      try{ editorDom.focus(); return true; }catch(e){}
    }
    return false;
  }

  function getText(){
    if(typeof window !== 'undefined' && window.editor && typeof window.editor.getText === 'function'){
      return window.editor.getText();
    }
    var host = getHost();
    return host ? (host.innerText || '') : '';
  }

  return {
    getHost:getHost,
    getBody:getBody,
    getMount:getMount,
    getEditorDom:getEditorDom,
    contains:contains,
    query:query,
    queryAll:queryAll,
    focus:focus,
    getText:getText
  };
});
