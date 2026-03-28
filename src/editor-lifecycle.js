(function(root, factory){
  var api = factory(root);
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  root.AQEditorLifecycle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root){
  var state = {
    initialized: false,
    initializing: false,
    initCalls: 0,
    lastMode: 'unknown'
  };

  function getEditor(){
    return root.editor || null;
  }

  function isReady(){
    return !!getEditor();
  }

  function resolveInitFn(options){
    options = options || {};
    if(typeof options.initFn === 'function') return options.initFn;
    if(typeof root.initTipTapEditor === 'function') return root.initTipTapEditor;
    return null;
  }

  function initTipTap(options){
    if(getEditor()){
      state.initialized = true;
      state.lastMode = 'tiptap';
      return getEditor();
    }
    if(state.initializing) return getEditor();
    var initFn = resolveInitFn(options);
    if(typeof initFn !== 'function'){
      state.lastMode = 'missing-init';
      return null;
    }
    state.initializing = true;
    state.initCalls += 1;
    try{
      initFn();
    }finally{
      state.initializing = false;
    }
    state.initialized = true;
    state.lastMode = getEditor() ? 'tiptap' : 'unknown';
    return getEditor();
  }

  function ensureInitialized(options){
    if(getEditor()) return getEditor();
    return initTipTap(options);
  }

  function loadCurrentDocument(options){
    options = options || {};
    if(typeof options.getHTML !== 'function' || typeof options.applyDocument !== 'function'){
      return false;
    }
    setTimeout(function(){
      try{
        options.applyDocument(options.getHTML());
      }catch(e){}
    }, parseInt(options.delay, 10) || 0);
    return true;
  }

  function bootstrap(options){
    options = options || {};
    ensureInitialized(options);
    loadCurrentDocument(options);
    return getEditor();
  }

  function getState(){
    return {
      initialized: state.initialized,
      initializing: state.initializing,
      initCalls: state.initCalls,
      ready: isReady(),
      mode: state.lastMode
    };
  }

  function init(options){
    return ensureInitialized(options);
  }

  return {
    init: init,
    initTipTap: initTipTap,
    ensureInitialized: ensureInitialized,
    loadCurrentDocument: loadCurrentDocument,
    bootstrap: bootstrap,
    getEditor: getEditor,
    isReady: isReady,
    getState: getState
  };
});
