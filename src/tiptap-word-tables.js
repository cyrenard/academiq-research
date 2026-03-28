(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordTables = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  var state = {
    initialized: false,
    selectedTable: null,
    button: null
  };

  function getSurface(){
    return typeof window !== 'undefined' ? (window.AQTipTapWordSurface || null) : null;
  }

  function getHost(){
    var surface = getSurface();
    return surface && typeof surface.getHost === 'function' ? surface.getHost() : null;
  }

  function getPage(){
    return typeof document !== 'undefined' ? document.getElementById('apapage') : null;
  }

  function getScroll(){
    return typeof document !== 'undefined' ? document.getElementById('escroll') : null;
  }

  function syncEditorState(){
    if(typeof window === 'undefined') return;
    if(window.AQEditorRuntime && typeof window.AQEditorRuntime.runContentApplyEffects === 'function'){
      window.AQEditorRuntime.runContentApplyEffects({
        normalize:false,
        layout:true,
        syncChrome:true,
        syncTOC:false,
        syncRefs:false,
        refreshTrigger:false
      });
      return;
    }
    if(typeof window.uSt === 'function') window.uSt();
    if(typeof window.save === 'function') window.save();
    if(typeof window.updatePageHeight === 'function') window.updatePageHeight();
  }

  function ensureButton(){
    if(state.button) return state.button;
    var existing = typeof document !== 'undefined' ? document.getElementById('tblDelBtn') : null;
    if(existing){
      state.button = existing;
      return existing;
    }
    var page = getPage();
    if(!page) return null;
    var button = document.createElement('button');
    button.id = 'tblDelBtn';
    button.textContent = 'Tabloyu Sil';
    button.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      removeSelectedTable();
    });
    page.appendChild(button);
    state.button = button;
    return button;
  }

  function hideButton(){
    if(state.button) state.button.style.display = 'none';
    state.selectedTable = null;
  }

  function removeSelectedTable(){
    var host = getHost();
    if(!state.selectedTable || !host || !host.contains(state.selectedTable)){
      hideButton();
      return;
    }
    var prev = state.selectedTable.previousElementSibling;
    state.selectedTable.remove();
    while(prev && prev.classList && prev.classList.contains('ni')){
      var nextPrev = prev.previousElementSibling;
      prev.remove();
      prev = nextPrev;
    }
    hideButton();
    syncEditorState();
  }

  function positionButton(table){
    var button = ensureButton();
    var page = getPage();
    if(!button || !page || !table) return;
    var pageRect = page.getBoundingClientRect();
    var tableRect = table.getBoundingClientRect();
    button.style.display = 'block';
    button.style.top = (tableRect.top - pageRect.top - 28) + 'px';
    button.style.left = (tableRect.right - pageRect.left - 90) + 'px';
  }

  function bindTableSelection(){
    var host = getHost();
    if(!host) return;
    host.addEventListener('click', function(e){
      var table = e.target && e.target.closest ? e.target.closest('table') : null;
      if(table && host.contains(table)){
        state.selectedTable = table;
        positionButton(table);
        return;
      }
      hideButton();
    });
  }

  function bindScrollHide(){
    var scroll = getScroll();
    if(!scroll) return;
    scroll.addEventListener('scroll', hideButton);
  }

  function init(){
    if(state.initialized) return true;
    state.initialized = true;
    window.__aqTipTapWordTablesV1 = true;
    ensureButton();
    bindTableSelection();
    bindScrollHide();
    return true;
  }

  return {
    init: init,
    hideButton: hideButton
  };
});
