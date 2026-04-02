(function(root){
  function stripDangerousTagsAndAttrs(html){
    var next = String(html || '');
    next = next.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
    next = next.replace(/<(?:iframe|object|embed|base|meta)[^>]*?>[\s\S]*?<\/(?:iframe|object|embed|base|meta)>/gi, '');
    next = next.replace(/<(?:iframe|object|embed|base|meta)[^>]*\/?>/gi, '');
    next = next.replace(/\s+on[a-z-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    next = next.replace(/\s+(?:href|src|xlink:href|formaction)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, '');
    return next;
  }

  function sanitizeDom(html){
    if(typeof document === 'undefined' || !document.createElement) return html;
    try{
      var root = document.createElement('div');
      root.innerHTML = html;
      root.querySelectorAll('script,iframe,object,embed,base,meta[http-equiv]').forEach(function(node){ node.remove(); });
      root.querySelectorAll('*').forEach(function(node){
        Array.from(node.attributes || []).forEach(function(attr){
          var name = String(attr.name || '').toLowerCase();
          var value = String(attr.value || '');
          if(/^on/.test(name)){
            node.removeAttribute(attr.name);
            return;
          }
          if((name === 'href' || name === 'src' || name === 'xlink:href' || name === 'formaction') && /^\s*javascript:/i.test(value)){
            node.removeAttribute(attr.name);
            return;
          }
          if(name === 'style' && /(expression\s*\(|javascript:|url\s*\(\s*['"]?\s*javascript:)/i.test(value)){
            node.removeAttribute(attr.name);
          }
        });
      });
      return root.innerHTML;
    }catch(_e){
      return html;
    }
  }

  function blankDoc(){
    return '<p></p>';
  }

  function sanitizeDocHTML(html){
    html = String(html || '');
    html = stripDangerousTagsAndAttrs(html);
    html = sanitizeDom(html);
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
