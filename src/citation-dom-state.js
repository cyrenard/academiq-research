(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  root.AQCitationDOMState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function cleanupCitationHTML(html){
    return String(html || '')
      .replace(/(?:\s|&nbsp;|&#160;)*\/[rt][^<\s]*(?=(?:\s|&nbsp;|&#160;)*<span class="cit")/g,'')
      .replace(/(?:\s|&nbsp;|&#160;)*\/[rt](?=<\/p>)/g,'')
      .replace(/<p>\s*\/[rt][^<]*<\/p>/gi,'<p></p>')
      .replace(/<span class="cit-gap">[\s\S]*?<\/span>/gi,'')
      .replace(/>\/[rt]([^<]*)</g,'><');
  }

  function cleanupTextNodeValue(value){
    return String(value || '')
      .replace(/(?:^|\s)\/[rt][^\s]*/g,' ')
      .replace(/\s{2,}/g,' ');
  }

  function cleanupSlashRTextNodes(root){
    if(!root || typeof root.ownerDocument === 'undefined' || !root.ownerDocument) return;
    var view = root.ownerDocument.defaultView || {};
    var NodeFilterRef = view.NodeFilter || { SHOW_TEXT:4 };
    if(typeof root.ownerDocument.createTreeWalker !== 'function') return;
    var walker = root.ownerDocument.createTreeWalker(root, NodeFilterRef.SHOW_TEXT, null);
    var nodes = [];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function(node){
      if(!node || !node.nodeValue) return;
      if(node.parentNode && node.parentNode.classList && node.parentNode.classList.contains('cit')) return;
      var next = node.nextSibling;
      var prev = node.previousSibling;
      var nearCitation = (next && next.nodeType === 1 && next.classList && next.classList.contains('cit'))
        || (prev && prev.nodeType === 1 && prev.classList && prev.classList.contains('cit'));
      if(nearCitation || /\/[rt][^\s]*/.test(node.nodeValue)){
        node.nodeValue = cleanupTextNodeValue(node.nodeValue);
      }
    });
  }

  function stabilizeCitationText(text){
    return String(text || '').replace(/,\s+(?=(?:\d{4}[a-z]?|t\.y\.)\b)/gi, ',\u00A0');
  }

  function normalizeCitationSpans(root, deps){
    if(!root || typeof root.querySelectorAll !== 'function') return;
    var findReference = deps && typeof deps.findReference === 'function' ? deps.findReference : function(){ return null; };
    var dedupeReferences = deps && typeof deps.dedupeReferences === 'function' ? deps.dedupeReferences : function(refs){ return Array.isArray(refs) ? refs : []; };
    var getVisibleText = deps && typeof deps.visibleCitationText === 'function' ? deps.visibleCitationText : function(){ return ''; };
    Array.from(root.querySelectorAll('.cit')).forEach(function(node){
      // Textual citations (Yazar (Yıl) format) must not be overwritten with inline format
      if(node.getAttribute('data-mode') === 'textual') return;
      var rid = String(node.getAttribute('data-ref') || '').trim();
      if(!rid) return;
      var refs = dedupeReferences(rid.split(',').map(function(id){
        return findReference(String(id || '').trim());
      }).filter(Boolean));
      if(!refs.length) return;
      node.textContent = stabilizeCitationText(getVisibleText(refs));
      var next = node.nextSibling;
      if(next && next.nodeType === 1 && next.classList && next.classList.contains('cit-gap')){
        if(next.parentNode && typeof next.parentNode.removeChild === 'function'){
          next.parentNode.removeChild(next);
        }
        next = node.nextSibling;
      }
      var hasLeadingSpace = !!(next && next.nodeType === 3 && /^\s/.test(String(next.nodeValue || '')));
      if(!hasLeadingSpace && node.parentNode && typeof node.parentNode.insertBefore === 'function'){
        var ownerDoc = root.ownerDocument || null;
        if(ownerDoc && typeof ownerDoc.createTextNode === 'function'){
          node.parentNode.insertBefore(ownerDoc.createTextNode(' '), next || null);
        }
      }
    });
  }

  return {
    cleanupCitationHTML: cleanupCitationHTML,
    cleanupTextNodeValue: cleanupTextNodeValue,
    cleanupSlashRTextNodes: cleanupSlashRTextNodes,
    stabilizeCitationText: stabilizeCitationText,
    normalizeCitationSpans: normalizeCitationSpans
  };
});
