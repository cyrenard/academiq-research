(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  root.AQPdfTabsState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function cloneOcrPageItems(input){
    var source = input && typeof input === 'object' ? input : {};
    var out = {};
    Object.keys(source).forEach(function(pageKey){
      var items = source[pageKey];
      out[pageKey] = Array.isArray(items) ? items.slice() : [];
    });
    return out;
  }

  function cloneOcrPageMeta(input){
    var source = input && typeof input === 'object' ? input : {};
    var out = {};
    Object.keys(source).forEach(function(pageKey){
      var entry = source[pageKey];
      if(!entry || typeof entry !== 'object'){
        out[pageKey] = {
          status: '',
          attempts: 0,
          failures: 0,
          lastError: '',
          updatedAt: 0
        };
        return;
      }
      out[pageKey] = {
        status: String(entry.status || '').trim(),
        attempts: Math.max(0, parseInt(entry.attempts, 10) || 0),
        failures: Math.max(0, parseInt(entry.failures, 10) || 0),
        lastError: String(entry.lastError || '').trim(),
        updatedAt: Math.max(0, Number(entry.updatedAt) || 0)
      };
    });
    return out;
  }

  function cloneTab(tab){
    return Object.assign({}, tab, {
      hlData: Array.isArray(tab && tab.hlData) ? tab.hlData.slice() : [],
      annots: Array.isArray(tab && tab.annots) ? tab.annots.slice() : [],
      ocrPageItems: cloneOcrPageItems(tab && tab.ocrPageItems),
      ocrPageMeta: cloneOcrPageMeta(tab && tab.ocrPageMeta),
      ocrLastAt: Math.max(0, Number(tab && tab.ocrLastAt) || 0)
    });
  }

  function getWorkspaceTabs(tabs, workspaceId){
    return (Array.isArray(tabs) ? tabs : []).filter(function(tab){
      return tab && (!tab.wsId || tab.wsId === workspaceId);
    });
  }

  function addPdfTab(state, input, deps){
    state = state || {};
    input = input || {};
    deps = deps || {};
    var tabs = Array.isArray(state.tabs) ? state.tabs.slice() : [];
    var existing = input.refId
      ? tabs.find(function(tab){ return tab && tab.refId === input.refId; })
      : null;
    if(existing){
      return {
        tabs: tabs,
        activeTabId: existing.id,
        action: 'switch-existing',
        activeTab: cloneTab(existing)
      };
    }
    var createTabId = typeof deps.createTabId === 'function'
      ? deps.createTabId
      : function(){ return 'tab_' + Date.now(); };
    var refAnnots = typeof deps.getReferenceAnnots === 'function'
      ? deps.getReferenceAnnots(input.refId)
      : null;
    var tab = {
      id: createTabId(),
      title: String(input.title || 'PDF').substring(0, 40),
      refId: input.refId || null,
      wsId: input.workspaceId || null,
      pdfData: input.pdfData,
      scrollPos: 0,
      hlData: [],
      annots: Array.isArray(refAnnots) ? refAnnots.slice() : [],
      ocrPageItems: {},
      ocrPageMeta: {},
      ocrLastAt: 0
    };
    tabs.push(tab);
    return {
      tabs: tabs,
      activeTabId: tab.id,
      action: 'add',
      activeTab: cloneTab(tab)
    };
  }

  function saveActiveTabState(state, snapshot){
    state = state || {};
    snapshot = snapshot || {};
    var tabs = Array.isArray(state.tabs) ? state.tabs.slice() : [];
    if(!state.activeTabId){
      return { tabs: tabs, activeTabId: state.activeTabId || null };
    }
    var found = false;
    tabs = tabs.map(function(tab){
      if(!tab || tab.id !== state.activeTabId) return tab;
      found = true;
      return Object.assign({}, tab, {
        scrollPos: typeof snapshot.scrollPos === 'number' ? snapshot.scrollPos : (tab.scrollPos || 0),
        hlData: Array.isArray(snapshot.hlData) ? snapshot.hlData.slice() : (Array.isArray(tab.hlData) ? tab.hlData.slice() : []),
        annots: Array.isArray(snapshot.annots) ? snapshot.annots.slice() : (Array.isArray(tab.annots) ? tab.annots.slice() : []),
        ocrPageItems: snapshot.ocrPageItems
          ? cloneOcrPageItems(snapshot.ocrPageItems)
          : cloneOcrPageItems(tab.ocrPageItems),
        ocrPageMeta: snapshot.ocrPageMeta
          ? cloneOcrPageMeta(snapshot.ocrPageMeta)
          : cloneOcrPageMeta(tab.ocrPageMeta),
        ocrLastAt: Number.isFinite(Number(snapshot.ocrLastAt))
          ? Math.max(0, Number(snapshot.ocrLastAt))
          : Math.max(0, Number(tab.ocrLastAt) || 0)
      });
    });
    return {
      tabs: tabs,
      activeTabId: found ? state.activeTabId : null
    };
  }

  function switchPdfTab(state, tabId){
    state = state || {};
    if(!tabId || tabId === state.activeTabId){
      return {
        tabs: Array.isArray(state.tabs) ? state.tabs.slice() : [],
        activeTabId: state.activeTabId || null,
        activeTab: null,
        action: 'noop'
      };
    }
    var tabs = Array.isArray(state.tabs) ? state.tabs.slice() : [];
    var tab = tabs.find(function(entry){ return entry && entry.id === tabId; }) || null;
    return {
      tabs: tabs,
      activeTabId: tab ? tabId : (state.activeTabId || null),
      activeTab: tab ? cloneTab(tab) : null,
      action: tab ? 'switch' : 'noop'
    };
  }

  function closePdfTab(state, tabId){
    state = state || {};
    var tabs = Array.isArray(state.tabs) ? state.tabs.slice() : [];
    var idx = tabs.findIndex(function(tab){ return tab && tab.id === tabId; });
    if(idx === -1){
      return {
        tabs: tabs,
        activeTabId: state.activeTabId || null,
        nextTabId: null,
        closedTab: null,
        workspaceTabs: getWorkspaceTabs(tabs, state.workspaceId),
        action: 'noop'
      };
    }
    var closedTab = tabs[idx];
    tabs.splice(idx, 1);
    var workspaceTabs = getWorkspaceTabs(tabs, state.workspaceId);
    var activeTabId = state.activeTabId || null;
    var nextTabId = null;
    var action = 'closed-inactive';
    if(tabId === activeTabId){
      if(workspaceTabs.length){
        nextTabId = workspaceTabs[0].id;
        action = 'closed-active-switch';
      }else{
        activeTabId = null;
        action = 'closed-last-workspace';
      }
    }
    return {
      tabs: tabs,
      activeTabId: activeTabId,
      nextTabId: nextTabId,
      closedTab: cloneTab(closedTab),
      workspaceTabs: workspaceTabs.map(cloneTab),
      action: action
    };
  }

  function switchWorkspaceTabs(state){
    state = state || {};
    var tabs = Array.isArray(state.tabs) ? state.tabs.slice() : [];
    var workspaceTabs = getWorkspaceTabs(tabs, state.workspaceId);
    var found = workspaceTabs.find(function(tab){ return tab.id === state.activeTabId; }) || null;
    if(found){
      return {
        tabs: tabs,
        activeTabId: state.activeTabId || null,
        workspaceTabs: workspaceTabs.map(cloneTab),
        nextTabId: null,
        action: 'keep-active'
      };
    }
    return {
      tabs: tabs,
      activeTabId: null,
      workspaceTabs: workspaceTabs.map(cloneTab),
      nextTabId: workspaceTabs.length ? workspaceTabs[0].id : null,
      action: workspaceTabs.length ? 'switch-first' : 'clear'
    };
  }

  return {
    getWorkspaceTabs: getWorkspaceTabs,
    addPdfTab: addPdfTab,
    saveActiveTabState: saveActiveTabState,
    switchPdfTab: switchPdfTab,
    closePdfTab: closePdfTab,
    switchWorkspaceTabs: switchWorkspaceTabs
  };
});
