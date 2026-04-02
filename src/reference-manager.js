(function(){
  function call(name, args, fallback){
    try{
      if(typeof window[name] === 'function') return window[name].apply(window, args || []);
    }catch(e){}
    return fallback;
  }

  function getWorkspaceId(){
    return window.S && window.S.cur;
  }

  function getLibrary(workspaceId){
    try{
      return call('cLib', [workspaceId != null ? workspaceId : getWorkspaceId()], []).slice();
    }catch(e){
      return [];
    }
  }

  function findReference(id, workspaceId){
    return call('findRef', [id, workspaceId != null ? workspaceId : getWorkspaceId()], null);
  }

  function sortReferences(refs){
    return call('sortLib', [Array.isArray(refs) ? refs.slice() : []], Array.isArray(refs) ? refs.slice() : []);
  }

  function dedupeReferences(refs){
    return call('dedupeRefs', [Array.isArray(refs) ? refs.slice() : []], Array.isArray(refs) ? refs.slice() : []);
  }

  function filterReferences(query, workspaceId){
    return call('filterRefsForQuery', [getLibrary(workspaceId), query || ''], []);
  }

  function referenceKey(ref){
    if(!ref) return '';
    return call('refKey', [ref], 'id:' + (ref.id || ''));
  }

  function getInlineCitation(ref){
    return call('getInlineCitationText', [ref], '');
  }

  function formatReference(ref){
    return call('apa7', [ref], '');
  }

  function getUsedReferences(){
    return call('getUsedRefs', [], []);
  }

  function buildBibliographyHTML(refs){
    var sorted = sortReferences(dedupeReferences(refs || []));
    if(!sorted.length) return '';
    return '<h1>Kaynakça</h1>' + sorted.map(function(ref){
      return '<p class="refe">' + formatReference(ref) + '</p>';
    }).join('');
  }

  function syncReferenceSection(){
    return call('updateRefSection', [], undefined);
  }

  window.AQReferenceManager = {
    getWorkspaceId: getWorkspaceId,
    getLibrary: getLibrary,
    findReference: findReference,
    sortReferences: sortReferences,
    dedupeReferences: dedupeReferences,
    filterReferences: filterReferences,
    referenceKey: referenceKey,
    getInlineCitation: getInlineCitation,
    formatReference: formatReference,
    getUsedReferences: getUsedReferences,
    buildBibliographyHTML: buildBibliographyHTML,
    syncReferenceSection: syncReferenceSection
  };
})();
