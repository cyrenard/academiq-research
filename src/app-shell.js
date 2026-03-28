(function(){
  function safeInit(mod){
    if(mod && typeof mod.init === 'function'){
      try{ mod.init(); }catch(e){ console.warn('App shell init failed:', e); }
    }
  }

  function getState(){
    return window.S || null;
  }

  function getCurrentWorkspaceId(){
    return window.S && window.S.cur;
  }

  function getCurrentDocumentId(){
    return window.S && window.S.curDoc;
  }

  function init(){
    safeInit(window.AQTipTapShell);
    safeInit(window.AQTipTapWordSurface);
    safeInit(window.AQTipTapWordMedia);
    safeInit(window.AQTipTapWordEvents);
    safeInit(window.AQTipTapWordTables);
    safeInit(window.AQEditorShell);
    safeInit(window.AQEditorCore);
    safeInit(window.AQEditorRuntime);
    safeInit(window.AQReferenceManager);
    safeInit(window.AQEditorIntegration);
    safeInit(window.AQCitationRuntime);
    safeInit(window.AQNotes);
    safeInit(window.AQPdfViewer);
  }

  window.AQAppShell = {
    init: init,
    getState: getState,
    getCurrentWorkspaceId: getCurrentWorkspaceId,
    getCurrentDocumentId: getCurrentDocumentId
  };
})();
