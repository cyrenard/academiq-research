(function(root){
  function blankDoc(){
    return '<p></p>';
  }

  function normalizeDoc(doc, index, sanitize){
    doc = doc || {};
    var citationStyle = String(doc.citationStyle || '').trim().toLowerCase();
    if(!citationStyle) citationStyle = 'apa7';
    return {
      id: doc.id || ('doc' + (index + 1)),
      name: String(doc.name || ('Belge ' + (index + 1))).trim(),
      content: sanitize(doc.content || blankDoc()),
      bibliographyHTML: typeof doc.bibliographyHTML === 'string' ? doc.bibliographyHTML : '',
      bibliographyManual: !!doc.bibliographyManual,
      coverHTML: typeof doc.coverHTML === 'string' ? doc.coverHTML : '',
      tocHTML: typeof doc.tocHTML === 'string' ? doc.tocHTML : '',
      citationStyle: citationStyle
    };
  }

  function normalizeWorkspace(ws, index){
    ws = ws || {};
    return {
      id: ws.id || ('ws' + (index + 1)),
      name: String(ws.name || ('Çalışma Alanı ' + (index + 1))).trim(),
      lib: Array.isArray(ws.lib) ? ws.lib.slice() : [],
      docId: ws.docId || ''
    };
  }

  function ensureWorkspaceDocsState(state, options){
    options = options || {};
    var uid = options.uid || function(){ return 'doc-' + Date.now(); };
    var sanitize = options.sanitize || function(html){ return html || blankDoc(); };
    var next = state || {};
    next.wss = Array.isArray(next.wss) ? next.wss.map(normalizeWorkspace) : [normalizeWorkspace(null, 0)];
    next.docs = Array.isArray(next.docs) ? next.docs.map(function(doc, index){
      return normalizeDoc(doc, index, sanitize);
    }) : [];

    var docsById = {};
    next.docs.forEach(function(doc){
      docsById[doc.id] = doc;
    });

    var claimedDocIds = {};
    next.wss.forEach(function(ws, index){
      var linked = ws.docId && docsById[ws.docId] && !claimedDocIds[ws.docId] ? docsById[ws.docId] : null;
      if(!linked){
        linked = {
          id: uid(),
          name: ws.name || ('Belge ' + (index + 1)),
          content: sanitize(index === 0 ? (next.doc || blankDoc()) : blankDoc()),
          bibliographyHTML: '',
          bibliographyManual: false,
          coverHTML: '',
          tocHTML: '',
          citationStyle: 'apa7'
        };
        next.docs.push(linked);
        docsById[linked.id] = linked;
      }
      linked.name = ws.name;
      linked.content = sanitize(linked.content || blankDoc());
      ws.docId = linked.id;
      claimedDocIds[linked.id] = true;
    });

    next.docs = next.docs.filter(function(doc){
      return doc && claimedDocIds[doc.id];
    });

    if(!next.cur || !next.wss.some(function(ws){ return ws.id === next.cur; })){
      next.cur = next.wss[0].id;
    }
    var currentWs = next.wss.find(function(ws){ return ws.id === next.cur; }) || next.wss[0];
    if(currentWs){
      next.curDoc = currentWs.docId;
      var currentDoc = next.docs.find(function(doc){ return doc.id === currentWs.docId; });
      next.doc = sanitize((currentDoc && currentDoc.content) || next.doc || blankDoc());
    }

    return currentWs || null;
  }

  function addWorkspaceWithDocState(state, workspace, options){
    options = options || {};
    var uid = options.uid || function(){ return 'doc-' + Date.now(); };
    var sanitize = options.sanitize || function(html){ return html || blankDoc(); };
    var next = state || {};
    var wsInput = workspace || {};
    var wsName = String(wsInput.name || '').trim();
    if(!wsName) return null;

    next.wss = Array.isArray(next.wss) ? next.wss.slice() : [];
    next.docs = Array.isArray(next.docs) ? next.docs.slice() : [];

    var doc = {
      id: uid(),
      name: wsName,
      content: sanitize(blankDoc()),
      bibliographyHTML: '',
      bibliographyManual: false,
      coverHTML: '',
      tocHTML: '',
      citationStyle: 'apa7'
    };
    var ws = {
      id: wsInput.id || uid(),
      name: wsName,
      lib: Array.isArray(wsInput.lib) ? wsInput.lib.slice() : [],
      docId: doc.id
    };

    next.docs.push(doc);
    next.wss.push(ws);
    next.cur = ws.id;
    next.curDoc = doc.id;
    next.doc = doc.content;

    return { workspace: ws, doc: doc };
  }

  function deleteWorkspaceWithDocState(state, workspaceId, options){
    options = options || {};
    var sanitize = options.sanitize || function(html){ return html || blankDoc(); };
    var next = state || {};
    if(!Array.isArray(next.wss) || next.wss.length <= 1) return null;
    var workspace = next.wss.find(function(entry){ return entry && entry.id === workspaceId; });
    if(!workspace) return null;

    next.wss = next.wss.filter(function(entry){ return entry && entry.id !== workspaceId; });
    next.docs = (Array.isArray(next.docs) ? next.docs : []).filter(function(doc){
      return doc && doc.id !== workspace.docId;
    });

    if(!next.cur || next.cur === workspaceId || !next.wss.some(function(ws){ return ws.id === next.cur; })){
      next.cur = next.wss[0].id;
    }

    return switchWorkspaceState(next, next.cur, { sanitize: sanitize });
  }

  function switchWorkspaceState(state, workspaceId, options){
    options = options || {};
    var sanitize = options.sanitize || function(html){ return html || blankDoc(); };
    var next = state || {};
    if(!Array.isArray(next.wss) || !workspaceId) return null;
    var workspace = next.wss.find(function(entry){ return entry && entry.id === workspaceId; });
    if(!workspace) return null;
    var doc = (Array.isArray(next.docs) ? next.docs : []).find(function(entry){
      return entry && entry.id === workspace.docId;
    });
    if(!doc) return null;
    doc.content = sanitize(doc.content || blankDoc());
    doc.name = workspace.name;
    next.cur = workspace.id;
    next.curDoc = doc.id;
    next.doc = doc.content;
    return { workspace: workspace, doc: doc };
  }

  function createDocState(state, name, options){
    options = options || {};
    var uid = options.uid || function(){ return 'doc-' + Date.now(); };
    var sanitize = options.sanitize || function(html){ return html || blankDoc(); };
    var next = state || {};
    var trimmed = String(name || '').trim();
    if(!trimmed) return null;
    var doc = {
      id: uid(),
      name: trimmed,
      content: sanitize(blankDoc()),
      bibliographyHTML: '',
      bibliographyManual: false,
      coverHTML: '',
      tocHTML: '',
      citationStyle: 'apa7'
    };
    next.docs = Array.isArray(next.docs) ? next.docs.slice() : [];
    next.docs.push(doc);
    next.curDoc = doc.id;
    next.doc = doc.content;
    return doc;
  }

  function switchDocState(state, docId, options){
    options = options || {};
    var sanitize = options.sanitize || function(html){ return html || blankDoc(); };
    var next = state || {};
    if(!Array.isArray(next.docs) || !docId) return null;
    var doc = next.docs.find(function(entry){ return entry && entry.id === docId; });
    if(!doc) return null;
    doc.content = sanitize(doc.content || blankDoc());
    next.curDoc = docId;
    next.doc = doc.content;
    return doc;
  }

  function deleteDocState(state, docId, options){
    options = options || {};
    var sanitize = options.sanitize || function(html){ return html || blankDoc(); };
    var next = state || {};
    if(!Array.isArray(next.docs) || next.docs.length <= 1) return null;
    var remaining = next.docs.filter(function(doc){ return doc && doc.id !== docId; });
    if(remaining.length === next.docs.length) return null;
    next.docs = remaining;
    if(next.curDoc === docId || !remaining.some(function(doc){ return doc.id === next.curDoc; })){
      next.curDoc = remaining[0].id;
    }
    var current = remaining.find(function(doc){ return doc.id === next.curDoc; }) || remaining[0];
    if(current){
      current.content = sanitize(current.content || blankDoc());
      next.doc = current.content;
    }
    return current || null;
  }

  var api = {
    blankDoc: blankDoc,
    ensureWorkspaceDocsState: ensureWorkspaceDocsState,
    addWorkspaceWithDocState: addWorkspaceWithDocState,
    deleteWorkspaceWithDocState: deleteWorkspaceWithDocState,
    switchWorkspaceState: switchWorkspaceState,
    createDocState: createDocState,
    switchDocState: switchDocState,
    deleteDocState: deleteDocState
  };

  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQDocTabsState = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
