(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  root.AQAnnotationState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function normalizeAnnotation(annotation){
    annotation = annotation || {};
    return {
      page: parseInt(annotation.page, 10) || 1,
      x: Number(annotation.x) || 0,
      y: Number(annotation.y) || 0,
      w: Number(annotation.w) || 0,
      h: Number(annotation.h) || 0,
      text: String(annotation.text || '')
    };
  }

  function cloneAnnotations(list){
    return (Array.isArray(list) ? list : []).map(normalizeAnnotation);
  }

  function createAnnotation(input){
    input = input || {};
    return normalizeAnnotation({
      page: input.page,
      x: input.x,
      y: input.y,
      w: input.w == null ? 140 : input.w,
      h: input.h == null ? 30 : input.h,
      text: input.text || ''
    });
  }

  function collectAnnotationsFromElements(elements, deps){
    deps = deps || {};
    var getText = typeof deps.getText === 'function'
      ? deps.getText
      : function(el){
          if(!el) return '';
          var body = typeof el.querySelector === 'function' ? el.querySelector('.pdf-annot-body') : null;
          return body ? (body.value || body.innerText || '') : (el.innerText || '');
        };
    return Array.from(elements || []).map(function(el){
      return normalizeAnnotation({
        page: el && el.dataset ? el.dataset.page : 1,
        x: el && el.style ? parseFloat(el.style.left) : 0,
        y: el && el.style ? parseFloat(el.style.top) : 0,
        w: el ? (el.offsetWidth || 0) : 0,
        h: el ? (el.offsetHeight || 0) : 0,
        text: getText(el)
      });
    });
  }

  function persistTabAnnotations(tab, annotations){
    if(!tab) return null;
    tab.annots = cloneAnnotations(annotations);
    return tab.annots;
  }

  function persistReferenceAnnotations(ref, annotations){
    if(!ref) return null;
    ref._annots = cloneAnnotations(annotations);
    return ref._annots;
  }

  return {
    normalizeAnnotation: normalizeAnnotation,
    cloneAnnotations: cloneAnnotations,
    createAnnotation: createAnnotation,
    collectAnnotationsFromElements: collectAnnotationsFromElements,
    persistTabAnnotations: persistTabAnnotations,
    persistReferenceAnnotations: persistReferenceAnnotations
  };
});
