(function(){
  function openReference(id){
    if(typeof window.openRef === 'function') return window.openRef(id);
  }

  function toggle(){
    if(typeof window.togglePDF === 'function') return window.togglePDF();
  }

  function download(id){
    if(typeof window.downloadPDF === 'function') return window.downloadPDF(id);
  }

  function searchNext(){
    if(typeof window.pdfSearchNext === 'function') return window.pdfSearchNext();
  }

  function searchPrev(){
    if(typeof window.pdfSearchPrev === 'function') return window.pdfSearchPrev();
  }

  function addAnnotation(pageNum, x, y){
    if(typeof window.addPdfAnnot === 'function') return window.addPdfAnnot(pageNum, x, y);
  }

  window.AQPdfViewer = {
    init: function(){},
    openReference: openReference,
    toggle: toggle,
    download: download,
    searchNext: searchNext,
    searchPrev: searchPrev,
    addAnnotation: addAnnotation
  };
})();
