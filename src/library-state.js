(function(root){
  function filterLibraryItems(items, query, activeLabelFilter, options){
    options = options || {};
    var collectionFilter = String(options.collectionFilter || 'all').trim();
    var getLabelName = options.getLabelName || function(label){
      return typeof label === 'string' ? label : ((label && label.name) || '');
    };
    var q = String(query || '').toLowerCase();
    return (Array.isArray(items) ? items : []).filter(function(item){
      var haystack = (
        (item.title || '') +
        (Array.isArray(item.authors) ? item.authors.join(' ') : (item.authors || '')) +
        (item.year || '') +
        (item.journal || '') +
        (item.publisher || '') +
        (item.websiteName || '') +
        (item.referenceType || '')
      ).toLowerCase();
      if(q && !haystack.includes(q)) return false;
      if(activeLabelFilter && !(item.labels || []).some(function(label){
        return getLabelName(label) === activeLabelFilter;
      })) return false;
      if(collectionFilter && collectionFilter !== 'all'){
        var collections = Array.isArray(item.collectionIds) ? item.collectionIds : [];
        if(collections.indexOf(collectionFilter) < 0) return false;
      }
      return true;
    });
  }

  function buildLibraryRenderWindow(items, options){
    options = options || {};
    var list = Array.isArray(items) ? items : [];
    var defaultLimit = Number(options.defaultLimit || 260) || 260;
    var forceFullRender = !!options.forceFullRender;
    var limit = Number(options.limit || defaultLimit) || defaultLimit;
    if(forceFullRender) limit = list.length || defaultLimit;
    limit = Math.max(20, Math.min(limit, 2000));
    var rendered = Math.min(list.length, limit);
    return {
      total: list.length,
      limit: limit,
      rendered: rendered,
      hasMore: rendered < list.length,
      nextLimit: Math.min(list.length, limit + defaultLimit),
      items: list.slice(0, rendered)
    };
  }

  var api = {
    filterLibraryItems: filterLibraryItems,
    buildLibraryRenderWindow: buildLibraryRenderWindow
  };

  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQLibraryState = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
