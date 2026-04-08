(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQZoteroIntegration = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function normalizeFormat(fileName){
    var name = String(fileName || '').trim().toLowerCase();
    if(name.endsWith('.bib')) return 'bibtex';
    if(name.endsWith('.ris') || name.endsWith('.enw')) return 'ris';
    if(name.endsWith('.json') || name.endsWith('.csljson')) return 'csljson';
    return '';
  }

  function parseExport(fileName, text, deps){
    deps = deps || {};
    var parseBibTeX = deps.parseBibTeX;
    var parseRIS = deps.parseRIS;
    var parseCSLJSON = deps.parseCSLJSON;
    var format = normalizeFormat(fileName);
    if(format === 'bibtex'){
      if(typeof parseBibTeX !== 'function') throw new Error('BibTeX parser missing');
      return parseBibTeX(text);
    }
    if(format === 'ris'){
      if(typeof parseRIS !== 'function') throw new Error('RIS parser missing');
      return parseRIS(text);
    }
    if(format === 'csljson'){
      if(typeof parseCSLJSON !== 'function') throw new Error('CSL JSON parser missing');
      return parseCSLJSON(text);
    }
    throw new Error('Unsupported Zotero export format');
  }

  function createDirectSyncAdapter(transport){
    transport = transport || null;
    return {
      isAvailable: function(){
        return !!(transport && typeof transport.pullLibrary === 'function');
      },
      pullLibrary: function(context){
        if(!transport || typeof transport.pullLibrary !== 'function'){
          return Promise.reject(new Error('Direct Zotero sync is not configured'));
        }
        return Promise.resolve(transport.pullLibrary(context || {}));
      }
    };
  }

  return {
    normalizeFormat: normalizeFormat,
    parseExport: parseExport,
    createDirectSyncAdapter: createDirectSyncAdapter
  };
});
