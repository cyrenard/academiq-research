(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory(root || globalThis);
    return;
  }
  if(root){
    root.AQStability = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function(root){
  var MAX_LOG_ENTRIES = 120;
  var state = {
    inited: false,
    entries: []
  };

  function normalizeError(errorLike){
    if(errorLike instanceof Error){
      return {
        name: errorLike.name || 'Error',
        message: errorLike.message || 'Unknown error',
        stack: errorLike.stack || ''
      };
    }
    if(typeof errorLike === 'string'){
      return { name: 'Error', message: errorLike, stack: '' };
    }
    if(errorLike && typeof errorLike === 'object'){
      return {
        name: String(errorLike.name || 'Error'),
        message: String(errorLike.message || JSON.stringify(errorLike)),
        stack: String(errorLike.stack || '')
      };
    }
    return { name: 'Error', message: String(errorLike || 'Unknown error'), stack: '' };
  }

  function capture(scope, errorLike, meta){
    var err = normalizeError(errorLike);
    var entry = {
      ts: Date.now(),
      scope: String(scope || 'runtime'),
      name: err.name,
      message: err.message,
      stack: err.stack,
      meta: meta || null
    };
    state.entries.push(entry);
    if(state.entries.length > MAX_LOG_ENTRIES){
      state.entries.splice(0, state.entries.length - MAX_LOG_ENTRIES);
    }
    if(root && root.console && typeof root.console.warn === 'function'){
      root.console.warn('[AQStability][' + entry.scope + '] ' + entry.message, entry);
    }
    return entry;
  }

  function getRecent(limit){
    var size = Number(limit || MAX_LOG_ENTRIES);
    if(!isFinite(size) || size <= 0) size = MAX_LOG_ENTRIES;
    return state.entries.slice(-size);
  }

  function clear(){
    state.entries.length = 0;
  }

  function safe(scope, fn, fallback){
    try{
      return typeof fn === 'function' ? fn() : fallback;
    }catch(e){
      capture(scope, e);
      return fallback;
    }
  }

  function bindGlobalHandlers(){
    if(!root || typeof root.addEventListener !== 'function') return;
    root.addEventListener('error', function(evt){
      capture('window.error', evt && (evt.error || evt.message) ? (evt.error || evt.message) : evt);
    }, true);
    root.addEventListener('unhandledrejection', function(evt){
      capture('window.unhandledrejection', evt ? evt.reason : null);
    }, true);
  }

  function init(){
    if(state.inited) return;
    state.inited = true;
    bindGlobalHandlers();
  }

  var api = {
    init: init,
    safe: safe,
    capture: capture,
    getRecent: getRecent,
    clear: clear
  };

  return api;
});
