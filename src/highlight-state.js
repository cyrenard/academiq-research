(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  root.AQHighlightState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function cloneHighlights(list){
    return (Array.isArray(list) ? list : []).map(function(item){
      return {
        page: item.page,
        color: item.color,
        rects: Array.isArray(item.rects) ? item.rects.map(function(rect){
          return {
            x: rect.x,
            y: rect.y,
            w: rect.w,
            h: rect.h
          };
        }) : [],
        text: item.text || ''
      };
    });
  }

  function loadHighlights(ref){
    return cloneHighlights(ref && ref._hlData);
  }

  function persistHighlights(ref, highlights){
    if(!ref) return null;
    var next = cloneHighlights(highlights);
    ref._hlData = next;
    return next;
  }

  function addHighlight(highlights, input){
    var next = cloneHighlights(highlights);
    input = input || {};
    next.push({
      page: input.page,
      color: input.color,
      rects: cloneHighlights([{ rects: input.rects || [] }])[0].rects,
      text: input.text || ''
    });
    return next;
  }

  function removeHighlightAt(highlights, index){
    var next = cloneHighlights(highlights);
    if(index < 0 || index >= next.length){
      return {
        highlights: next,
        removed: null
      };
    }
    var removed = next[index];
    next.splice(index, 1);
    return {
      highlights: next,
      removed: removed
    };
  }

  return {
    cloneHighlights: cloneHighlights,
    loadHighlights: loadHighlights,
    persistHighlights: persistHighlights,
    addHighlight: addHighlight,
    removeHighlightAt: removeHighlightAt
  };
});
