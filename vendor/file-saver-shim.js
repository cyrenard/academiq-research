;(function(global){
  if(global && typeof global.saveAs === 'function') return;
  function saveAs(blob, filename){
    if(!blob) return;
    var name = filename || 'download';
    var url = URL.createObjectURL(blob);
    try{
      var link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.rel = 'noopener';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(function(){
        try{ document.body.removeChild(link); }catch(_e){}
      }, 0);
    } finally {
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1200);
    }
  }
  global.saveAs = saveAs;
})(typeof window !== 'undefined' ? window : globalThis);
