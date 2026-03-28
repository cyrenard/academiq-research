(function(root){
  function buildPersistedState(state, options){
    options = options || {};
    var serialize = options.serialize || function(value){ return value; };
    return serialize(state, options);
  }

  function buildPDFCacheMap(workspaces){
    var out = {};
    (Array.isArray(workspaces) ? workspaces : []).forEach(function(ws){
      (ws && Array.isArray(ws.lib) ? ws.lib : []).forEach(function(ref){
        if(ref && ref.id && ref.pdfData) out[ref.id] = ref.pdfData;
      });
    });
    return out;
  }

  function applyPDFCacheMap(workspaces, cacheMap){
    (Array.isArray(workspaces) ? workspaces : []).forEach(function(ws){
      (ws && Array.isArray(ws.lib) ? ws.lib : []).forEach(function(ref){
        if(ref && ref.id && cacheMap && cacheMap[ref.id]) ref.pdfData = cacheMap[ref.id];
      });
    });
    return workspaces;
  }

  var api = {
    buildPersistedState: buildPersistedState,
    buildPDFCacheMap: buildPDFCacheMap,
    applyPDFCacheMap: applyPDFCacheMap
  };

  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQSyncState = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
