(function(root){
  function blankDoc(){
    return '<p></p>';
  }

  function sanitizeDocHTML(html){
    html = String(html || '');
    html = html.replace(/<div[^>]*class="page-break[^"]*"[^>]*>[\s\S]*?<\/div>/gi,'');
    html = html.replace(/<div[^>]*class="page-top-spacer[^"]*"[^>]*>[\s\S]*?<\/div>/gi,'');
    html = html.replace(/<div[^>]*class="page-break-overlay[^"]*"[^>]*>[\s\S]*?<\/div>/gi,'');
    html = html.replace(/<div[^>]*class="page-number[^"]*"[^>]*>[\s\S]*?<\/div>/gi,'');
    html = html.replace(/<hr[^>]*class="pg-spacer"[^>]*\/?>/gi,'');
    html = html.replace(/<div[^>]*class="pg-spacer"[^>]*>[\s\S]*?<\/div>/gi,'');
    html = html.replace(/<hr[^>]*class="find-hl[^"]*"[^>]*\/?>/gi,'');
    html = html.replace(/<mark[^>]*class="find-hl[^"]*"[^>]*>([\s\S]*?)<\/mark>/gi,'$1');
    html = html.replace(/<button[^>]*class="toc-delete"[^>]*>[\s\S]*?<\/button>/gi,'');
    html = html.replace(/<div[^>]*class="img-toolbar"[^>]*>[\s\S]*?<\/div>/gi,'');
    html = html.replace(/<div[^>]*class="img-resize-handle"[^>]*>[\s\S]*?<\/div>/gi,'');
    html = html.replace(/<p><\/p>/gi,'<p></p>');
    return html.trim() || blankDoc();
  }

  function commitActiveDoc(state, html, options){
    options = options || {};
    var sanitize = options.sanitize || sanitizeDocHTML;
    var nextState = state || {};
    var cleanHTML = sanitize(html);
    nextState.doc = cleanHTML;
    if(Array.isArray(nextState.docs) && nextState.curDoc){
      var current = nextState.docs.find(function(doc){ return doc && doc.id === nextState.curDoc; });
      if(current) current.content = cleanHTML;
    }
    return cleanHTML;
  }

  var api = {
    blankDoc: blankDoc,
    sanitizeDocHTML: sanitizeDocHTML,
    commitActiveDoc: commitActiveDoc
  };

  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQDocumentState = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
