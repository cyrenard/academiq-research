(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  root.AQNotebookState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function ensureNotebooks(notebooks, currentNotebookId){
    var list = Array.isArray(notebooks) ? notebooks.slice() : [];
    if(!list.length){
      list = [{ id:'nb1', name:'Genel Notlar' }];
    }
    var current = currentNotebookId && list.some(function(nb){ return nb && nb.id === currentNotebookId; })
      ? currentNotebookId
      : list[0].id;
    return {
      notebooks: list,
      currentNotebookId: current
    };
  }

  function addNotebook(state, input){
    state = ensureNotebooks(state && state.notebooks, state && state.currentNotebookId);
    input = input || {};
    var name = String(input.name || '').trim();
    if(!name){
      return {
        notebooks: state.notebooks,
        currentNotebookId: state.currentNotebookId,
        createdNotebook: null
      };
    }
    var notebook = {
      id: input.id,
      name: name
    };
    var next = state.notebooks.concat([notebook]);
    return {
      notebooks: next,
      currentNotebookId: notebook.id,
      createdNotebook: notebook
    };
  }

  function deleteNotebook(state, notebookId){
    state = ensureNotebooks(state && state.notebooks, state && state.currentNotebookId);
    var next = state.notebooks.filter(function(nb){ return nb && nb.id !== notebookId; });
    if(!next.length){
      next = [{ id:'nb1', name:'Genel Notlar' }];
    }
    var current = state.currentNotebookId === notebookId ? next[0].id : state.currentNotebookId;
    return ensureNotebooks(next, current);
  }

  function selectNotebook(state, notebookId){
    state = ensureNotebooks(state && state.notebooks, state && state.currentNotebookId);
    return ensureNotebooks(state.notebooks, notebookId);
  }

  function renameNotebook(state, notebookId, newName){
    state = ensureNotebooks(state && state.notebooks, state && state.currentNotebookId);
    var trimmed = String(newName || '').trim();
    if(!trimmed){
      return state;
    }
    return {
      notebooks: state.notebooks.map(function(nb){
        if(!nb || nb.id !== notebookId) return nb;
        return Object.assign({}, nb, { name: trimmed });
      }),
      currentNotebookId: state.currentNotebookId
    };
  }

  function buildNotebookViewModel(state){
    state = ensureNotebooks(state && state.notebooks, state && state.currentNotebookId);
    return state.notebooks.map(function(nb){
      return {
        id: nb.id,
        name: nb.name,
        active: nb.id === state.currentNotebookId,
        deletable: state.notebooks.length > 1
      };
    });
  }

  return {
    ensureNotebooks: ensureNotebooks,
    addNotebook: addNotebook,
    deleteNotebook: deleteNotebook,
    selectNotebook: selectNotebook,
    renameNotebook: renameNotebook,
    buildNotebookViewModel: buildNotebookViewModel
  };
});
