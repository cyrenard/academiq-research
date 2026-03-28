(function(root){
  function filterLibraryItems(items, query, activeLabelFilter, options){
    options = options || {};
    var getLabelName = options.getLabelName || function(label){
      return typeof label === 'string' ? label : ((label && label.name) || '');
    };
    var q = String(query || '').toLowerCase();
    return (Array.isArray(items) ? items : []).filter(function(item){
      var haystack = (
        (item.title || '') +
        (Array.isArray(item.authors) ? item.authors.join(' ') : (item.authors || '')) +
        (item.year || '') +
        (item.journal || '')
      ).toLowerCase();
      if(q && !haystack.includes(q)) return false;
      if(activeLabelFilter && !(item.labels || []).some(function(label){
        return getLabelName(label) === activeLabelFilter;
      })) return false;
      return true;
    });
  }

  var api = {
    filterLibraryItems: filterLibraryItems
  };

  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQLibraryState = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
