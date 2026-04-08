(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQNoteLinking = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  var NOTE_ATTRS = ['data-note-id', 'data-note-ref', 'data-note-page', 'data-note-type', 'data-note-nb'];

  function asText(value, maxLen){
    var text = String(value == null ? '' : value).trim();
    if(maxLen && text.length > maxLen) return text.slice(0, maxLen);
    return text;
  }

  function escapeAttr(value){
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function compactPage(value){
    var text = asText(value, 80).replace(/\s+/g, ' ').trim();
    return text;
  }

  function buildLinkMetadata(input){
    var source = input || {};
    var noteId = asText(source.noteId || source.id, 160);
    if(!noteId) return null;
    var referenceId = asText(source.referenceId || source.rid || source.refId || '', 160);
    var page = compactPage(source.page || source.tag || source.sourcePage || '');
    var noteType = asText(source.noteType || source.type || '', 80);
    var notebookId = asText(source.notebookId || source.nbId || '', 160);
    return {
      noteId: noteId,
      referenceId: referenceId,
      page: page,
      noteType: noteType,
      notebookId: notebookId
    };
  }

  function metadataToAttrs(meta){
    if(!meta || !meta.noteId) return {};
    var attrs = {
      'data-note-id': meta.noteId
    };
    if(meta.referenceId) attrs['data-note-ref'] = meta.referenceId;
    if(meta.page) attrs['data-note-page'] = meta.page;
    if(meta.noteType) attrs['data-note-type'] = meta.noteType;
    if(meta.notebookId) attrs['data-note-nb'] = meta.notebookId;
    return attrs;
  }

  function attrsToString(attrs){
    var keys = Object.keys(attrs || {});
    if(!keys.length) return '';
    return keys.map(function(key){
      var value = asText(attrs[key], 400);
      if(!value) return '';
      return ' ' + key + '="' + escapeAttr(value) + '"';
    }).filter(Boolean).join('');
  }

  function stripKnownAttrsFromTag(tag){
    var out = String(tag || '');
    NOTE_ATTRS.forEach(function(attr){
      var rx = new RegExp('\\s' + attr + '="[^"]*"', 'gi');
      out = out.replace(rx, '');
    });
    return out;
  }

  function applyAttrsToTag(openTag, attrs){
    var baseTag = stripKnownAttrsFromTag(openTag);
    var attrText = attrsToString(attrs);
    if(!attrText) return baseTag;
    if(/\/>$/.test(baseTag)) return baseTag.replace(/\/>$/, attrText + '/>');
    return baseTag.replace(/>$/, attrText + '>');
  }

  function decorateNoteInsertionHTML(html, linkInput){
    var content = String(html || '');
    if(!content.trim()) return content;
    var meta = buildLinkMetadata(linkInput);
    if(!meta || !meta.noteId) return content;
    var attrs = metadataToAttrs(meta);
    if(!Object.keys(attrs).length) return content;
    var out = content;
    var touched = false;
    if(/<p[\s>]/i.test(content)){
      out = out.replace(/<p(?:\s[^>]*)?>/gi, function(openTag){
        touched = true;
        return applyAttrsToTag(openTag, attrs);
      });
    }
    if(/<blockquote[\s>]/i.test(out)){
      out = out.replace(/<blockquote(?:\s[^>]*)?>/gi, function(openTag){
        touched = true;
        return applyAttrsToTag(openTag, attrs);
      });
    }
    if(/<span[^>]*class=(["'])[^"']*\bcit\b[^"']*\1/i.test(out)){
      out = out.replace(/<span(?:\s[^>]*)?>/gi, function(openTag){
        if(!/\bclass\s*=\s*(["'])[^"']*\bcit\b[^"']*\1/i.test(openTag)) return openTag;
        touched = true;
        return applyAttrsToTag(openTag, attrs);
      });
    }
    if(touched) return out;
    return '<p' + attrsToString(attrs) + '>' + out + '</p>';
  }

  function stripNoteLinkAttributes(html){
    var out = String(html || '');
    NOTE_ATTRS.forEach(function(attr){
      var rx = new RegExp('\\s' + attr + '="[^"]*"', 'gi');
      out = out.replace(rx, '');
    });
    return out;
  }

  function resolveLinkFromAttrs(attrs){
    if(!attrs || typeof attrs !== 'object') return null;
    var meta = buildLinkMetadata({
      noteId: attrs['data-note-id'] || attrs.noteId || attrs.noteid || '',
      referenceId: attrs['data-note-ref'] || attrs.noteRef || attrs.referenceId || '',
      page: attrs['data-note-page'] || attrs.notePage || attrs.page || '',
      noteType: attrs['data-note-type'] || attrs.noteType || attrs.type || '',
      notebookId: attrs['data-note-nb'] || attrs.noteNotebook || attrs.nbId || ''
    });
    return meta;
  }

  function elementAttrsToObject(element){
    if(!element || typeof element.getAttribute !== 'function') return null;
    return {
      'data-note-id': element.getAttribute('data-note-id'),
      'data-note-ref': element.getAttribute('data-note-ref'),
      'data-note-page': element.getAttribute('data-note-page'),
      'data-note-type': element.getAttribute('data-note-type'),
      'data-note-nb': element.getAttribute('data-note-nb')
    };
  }

  function resolveLinkFromDOMNode(startNode, root){
    var node = startNode || null;
    var rootNode = root || null;
    while(node){
      var element = null;
      if(node.nodeType === 1){
        element = node;
      }else if(node.parentElement){
        element = node.parentElement;
      }else if(node.parentNode && node.parentNode.nodeType === 1){
        element = node.parentNode;
      }
      if(!element) break;
      var meta = resolveLinkFromAttrs(elementAttrsToObject(element));
      if(meta && meta.noteId) return meta;
      if(element.querySelector){
        var scope = element.closest
          ? (element.closest('p,blockquote,li,td,th,h1,h2,h3,h4,h5,div') || element)
          : element;
        var scopedCitation = scope.querySelector && scope.querySelector('.cit[data-note-id]');
        var scopedMeta = resolveLinkFromAttrs(elementAttrsToObject(scopedCitation));
        if(scopedMeta && scopedMeta.noteId) return scopedMeta;
      }
      if(rootNode && element === rootNode) break;
      node = element.parentNode;
    }
    return null;
  }

  function resolveLinkFromDOMSelection(selection, root){
    var sel = selection || null;
    if(!sel) return null;
    var anchor = sel.anchorNode || null;
    if(!anchor && typeof sel.getRangeAt === 'function' && sel.rangeCount){
      try{ anchor = sel.getRangeAt(0).startContainer; }catch(_e){}
    }
    if(!anchor) return null;
    return resolveLinkFromDOMNode(anchor, root || null);
  }

  function resolveLinkFromEditorSelection(input){
    input = input || {};
    var editor = input.editor || null;
    if(editor && editor.state && editor.state.selection && editor.state.selection.$from){
      var $from = editor.state.selection.$from;
      var maxDepth = typeof $from.depth === 'number' ? $from.depth : -1;
      for(var depth = maxDepth; depth >= 0; depth -= 1){
        var node = null;
        if(typeof $from.node === 'function'){
          try{ node = $from.node(depth); }catch(_e){}
        }
        if(!node || !node.attrs) continue;
        var meta = resolveLinkFromAttrs(node.attrs);
        if(meta && meta.noteId) return meta;
      }
      var marks = [];
      if(typeof $from.marks === 'function'){
        try{ marks = marks.concat($from.marks() || []); }catch(_e){}
      }
      if($from.nodeBefore && Array.isArray($from.nodeBefore.marks)){
        marks = marks.concat($from.nodeBefore.marks);
      }
      if($from.nodeAfter && Array.isArray($from.nodeAfter.marks)){
        marks = marks.concat($from.nodeAfter.marks);
      }
      for(var i = 0; i < marks.length; i += 1){
        var mark = marks[i];
        var markMeta = resolveLinkFromAttrs(mark && mark.attrs ? mark.attrs : null);
        if(markMeta && markMeta.noteId) return markMeta;
      }
    }
    var selection = input.selection || (typeof window !== 'undefined' && typeof window.getSelection === 'function' ? window.getSelection() : null);
    return resolveLinkFromDOMSelection(selection, input.root || null);
  }

  function isSameLink(a, b){
    if(!a || !b) return false;
    return String(a.noteId || '') === String(b.noteId || '');
  }

  return {
    buildLinkMetadata: buildLinkMetadata,
    metadataToAttrs: metadataToAttrs,
    decorateNoteInsertionHTML: decorateNoteInsertionHTML,
    stripNoteLinkAttributes: stripNoteLinkAttributes,
    resolveLinkFromAttrs: resolveLinkFromAttrs,
    resolveLinkFromDOMNode: resolveLinkFromDOMNode,
    resolveLinkFromDOMSelection: resolveLinkFromDOMSelection,
    resolveLinkFromEditorSelection: resolveLinkFromEditorSelection,
    isSameLink: isSameLink
  };
});
