(function(){
  function reportInitError(scope, err){
    if(window.AQStability && typeof window.AQStability.capture === 'function'){
      window.AQStability.capture(scope, err);
    }
  }

  function safeInit(name, mod){
    if(mod && typeof mod.init === 'function'){
      try{
        mod.init();
      }catch(e){
        reportInitError('init.' + name, e);
        console.warn('App shell init failed (' + name + '):', e);
      }
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
    safeInit('AQTipTapShell', window.AQTipTapShell);
    safeInit('AQTipTapWordSurface', window.AQTipTapWordSurface);
    safeInit('AQTipTapWordMedia', window.AQTipTapWordMedia);
    safeInit('AQTipTapWordEvents', window.AQTipTapWordEvents);
    safeInit('AQTipTapWordTables', window.AQTipTapWordTables);
    safeInit('AQEditorShell', window.AQEditorShell);
    safeInit('AQEditorCore', window.AQEditorCore);
    safeInit('AQEditorRuntime', window.AQEditorRuntime);
    safeInit('AQReferenceManager', window.AQReferenceManager);
    safeInit('AQEditorIntegration', window.AQEditorIntegration);
    safeInit('AQCitationRuntime', window.AQCitationRuntime);
    safeInit('AQNotes', window.AQNotes);
    safeInit('AQLiteratureMatrix', window.AQLiteratureMatrix);
    safeInit('AQPdfViewer', window.AQPdfViewer);
  }

  window.AQAppShell = {
    init: init,
    getState: getState,
    getCurrentWorkspaceId: getCurrentWorkspaceId,
    getCurrentDocumentId: getCurrentDocumentId
  };
})();
