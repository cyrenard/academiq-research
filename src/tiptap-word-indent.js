(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordIndent = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  var SPECIAL_ANCESTOR_TYPES = {
    blockquote:true,
    listItem:true,
    tableCell:true,
    tableHeader:true
  };

  var SPECIAL_PARAGRAPH_CLASS_TOKENS = {
    ni:true,
    'indent-none':true,
    refe:true,
    'reference-entry':true,
    'bibliography-entry':true,
    'figure-caption':true,
    'fig-caption':true,
    'table-caption':true,
    'table-note':true,
    'abstract-line':true,
    'keywords-line':true
  };

  function sanitizeIndentMode(value){
    return value === 'none' ? 'none' : 'first-line';
  }

  function classTokens(value){
    return String(value || '')
      .toLowerCase()
      .split(/\s+/)
      .map(function(token){ return token.trim(); })
      .filter(Boolean);
  }

  function hasSpecialParagraphClass(className){
    var tokens = classTokens(className);
    for(var i = 0; i < tokens.length; i++){
      if(SPECIAL_PARAGRAPH_CLASS_TOKENS[tokens[i]]) return true;
    }
    return false;
  }

  function stripIndentClasses(className){
    if(!className) return null;
    var stripped = String(className)
      .replace(/\b(indent-first-line|indent-none)\b/g, '')
      .trim()
      .replace(/\s+/g, ' ');
    return stripped || null;
  }

  function parseIndentModeFromStyle(styleText){
    var style = String(styleText || '');
    var match = style.match(/text-indent\s*:\s*([^;]+)/i);
    if(!match) return null;
    var value = String(match[1] || '').trim().toLowerCase();
    if(!value) return null;
    if(value === '0' || value === '0px' || value === '0in' || value === '0em' || value === '0pt'){
      return 'none';
    }
    if(value.indexOf('-') === 0){
      return 'none';
    }
    return null;
  }

  function parseIndentModeFromElement(el){
    if(!el || typeof el.getAttribute !== 'function') return 'first-line';
    var attr = el.getAttribute('data-indent-mode');
    if(attr === 'none' || attr === 'first-line') return attr;
    var className = String(el.getAttribute('class') || '');
    if(hasSpecialParagraphClass(className)) return 'none';
    var fromStyle = parseIndentModeFromStyle(el.getAttribute('style') || '');
    return fromStyle || 'first-line';
  }

  function getParagraphDepth($pos){
    if(!$pos || typeof $pos.depth !== 'number' || typeof $pos.node !== 'function') return -1;
    for(var depth = $pos.depth; depth >= 0; depth--){
      var node = $pos.node(depth);
      if(node && node.type && node.type.name === 'paragraph') return depth;
    }
    return -1;
  }

  function hasSpecialAncestor($pos){
    if(!$pos || typeof $pos.depth !== 'number' || typeof $pos.node !== 'function') return false;
    var paragraphDepth = getParagraphDepth($pos);
    if(paragraphDepth < 0) return false;
    for(var depth = paragraphDepth - 1; depth >= 0; depth--){
      var node = $pos.node(depth);
      var typeName = node && node.type ? node.type.name : '';
      if(SPECIAL_ANCESTOR_TYPES[typeName]) return true;
    }
    return false;
  }

  function hasPreviousSiblingHeading(options){
    options = options || {};
    if(options.previousSiblingType === 'heading') return true;
    var $pos = options.$pos || null;
    if(!$pos && options.doc && Number.isFinite(options.pos) && typeof options.doc.resolve === 'function'){
      try{ $pos = options.doc.resolve(options.pos); }catch(_e){ $pos = null; }
    }
    if(!$pos || typeof $pos.node !== 'function' || typeof $pos.index !== 'function') return false;
    var paragraphDepth = getParagraphDepth($pos);
    if(paragraphDepth < 1) return false;
    var parentDepth = paragraphDepth - 1;
    var parent = $pos.node(parentDepth);
    if(!parent || typeof parent.child !== 'function') return false;
    var index = $pos.index(paragraphDepth);
    if(!Number.isFinite(index) || index <= 0) return false;
    var previous = parent.child(index - 1);
    return !!(previous && previous.type && previous.type.name === 'heading');
  }

  function isSpecialParagraphContext(options){
    options = options || {};
    var node = options.node || null;
    var $pos = options.$pos || null;
    if(!$pos && options.doc && Number.isFinite(options.pos) && typeof options.doc.resolve === 'function'){
      try{ $pos = options.doc.resolve(options.pos); }catch(_e){ $pos = null; }
    }

    if(!node && $pos){
      var depth = getParagraphDepth($pos);
      if(depth >= 0) node = $pos.node(depth);
    }

    var className = String((node && node.attrs && (node.attrs.class || node.attrs.className)) || '');
    if(hasSpecialParagraphClass(className)) return true;
    if(hasSpecialAncestor($pos)) return true;
    if(hasPreviousSiblingHeading({ $pos:$pos, doc:options.doc, pos:options.pos, previousSiblingType:options.previousSiblingType })){
      return true;
    }
    return false;
  }

  function resolveParagraphIndentMode(options){
    return isSpecialParagraphContext(options) ? 'none' : 'first-line';
  }

  function normalizeParagraphIndentation(options){
    options = options || {};
    var doc = options.doc || null;
    if(!doc || typeof doc.descendants !== 'function') return { changed:false, updates:[] };
    var updates = [];
    doc.descendants(function(node, pos){
      if(!node || !node.type || node.type.name !== 'paragraph') return;
      var expected = resolveParagraphIndentMode({ doc:doc, pos:pos, node:node });
      var current = sanitizeIndentMode(node.attrs && node.attrs.indentMode);
      if(current !== expected){
        updates.push({
          pos:pos,
          attrs:Object.assign({}, node.attrs || {}, { indentMode:expected })
        });
      }
    });
    if(typeof options.applyUpdate === 'function' && updates.length){
      updates.forEach(function(update){ options.applyUpdate(update); });
    }
    return { changed:updates.length > 0, updates:updates };
  }

  return {
    sanitizeIndentMode:sanitizeIndentMode,
    stripIndentClasses:stripIndentClasses,
    parseIndentModeFromStyle:parseIndentModeFromStyle,
    parseIndentModeFromElement:parseIndentModeFromElement,
    getParagraphDepth:getParagraphDepth,
    hasSpecialParagraphClass:hasSpecialParagraphClass,
    hasSpecialAncestor:hasSpecialAncestor,
    hasPreviousSiblingHeading:hasPreviousSiblingHeading,
    isSpecialParagraphContext:isSpecialParagraphContext,
    resolveParagraphIndentMode:resolveParagraphIndentMode,
    normalizeParagraphIndentation:normalizeParagraphIndentation
  };
});
