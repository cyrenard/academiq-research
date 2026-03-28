(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  root.AQTipTapWordCitation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function normalizeRefs(refs, deps){
    var list = Array.isArray(refs) ? refs.filter(Boolean).slice() : [];
    if(deps && typeof deps.dedupeReferences === 'function'){
      list = deps.dedupeReferences(list);
    }
    if(deps && typeof deps.sortReferences === 'function'){
      list = deps.sortReferences(list);
    }
    return list;
  }

  function escapeJS(value){
    return String(value || '').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  }

  function buildReferenceListHTML(refs, deps){
    deps = deps || {};
    var getInlineCitationText = typeof deps.getInlineCitationText === 'function' ? deps.getInlineCitationText : function(){ return ''; };
    var formatReference = typeof deps.formatReference === 'function' ? deps.formatReference : function(){ return ''; };
    var esc = typeof deps.escapeJS === 'function' ? deps.escapeJS : escapeJS;
    return normalizeRefs(refs, deps).map(function(ref){
      return '<div class="ri"><div class="ricite">' + getInlineCitationText(ref) + '</div><div class="rifull">' + formatReference(ref) + '</div><div class="riacts"><button class="rib" onclick="cpStr(\'' + esc(formatReference(ref)) + '\')">Kopyala</button><button class="rib" onclick="openRef(\'' + ref.id + '\')">PDF</button></div></div>';
    }).join('');
  }

  function renderReferenceList(container, refs, deps){
    var html = normalizeRefs(refs, deps).length
      ? buildReferenceListHTML(refs, deps)
      : '<div style="color:var(--txt3);font-size:12px;padding:14px;text-align:center;">Metinde atıf yok.</div>';
    if(container) container.innerHTML = html;
    return html;
  }

  function renderUsedReferenceList(editorRoot, container, deps){
    var refs = collectUsedReferences(editorRoot, deps);
    renderReferenceList(container, refs, deps);
    return refs;
  }

  function collectUsedReferences(editorRoot, deps){
    deps = deps || {};
    if(!editorRoot || typeof editorRoot.querySelectorAll !== 'function') return [];
    var rawIds = Array.from(editorRoot.querySelectorAll('.cit'))
      .map(function(node){
        return node && node.dataset ? node.dataset.ref : '';
      })
      .filter(Boolean);
    var refs = [];
    rawIds.forEach(function(rid){
      String(rid || '').split(',').forEach(function(id){
        id = String(id || '').trim();
        if(!id) return;
        var ref = typeof deps.findReference === 'function' ? deps.findReference(id) : null;
        if(ref) refs.push(ref);
      });
    });
    return normalizeRefs(refs, deps);
  }

  function copyNoteCitation(noteId, deps){
    deps = deps || {};
    var notes = Array.isArray(deps.notes) ? deps.notes : [];
    var note = notes.find(function(item){ return item && item.id == noteId; });
    if(!note) return false;
    var ref = typeof deps.findReference === 'function' ? deps.findReference(note.rid) : null;
    if(!ref) return false;
    if(typeof deps.copyText === 'function' && typeof deps.getInlineCitationText === 'function'){
      deps.copyText(deps.getInlineCitationText(ref));
      return true;
    }
    return false;
  }

  function cleanupSlashRArtifacts(options){
    options = options || {};
    var editor = options.editor || null;
    var root = options.root || (editor && editor.view ? editor.view.dom : null);
    var domState = options.domState || null;
    if(editor && (!options.root || options.root === editor.view.dom)){
      var html = editor.getHTML();
      var cleaned = domState && typeof domState.cleanupCitationHTML === 'function'
        ? domState.cleanupCitationHTML(html)
        : String(html || '')
            .replace(/(?:\s|&nbsp;|&#160;)*\/r[^<\s]*(?=(?:\s|&nbsp;|&#160;)*<span class="cit")/g,'')
            .replace(/(?:\s|&nbsp;|&#160;)*\/r(?=<\/p>)/g,'')
            .replace(/<p>\s*\/r[^<]*<\/p>/gi,'<p></p>')
            .replace(/>\/r([^<]*)</g,'><');
      if(cleaned !== html){
        editor.commands.setContent(cleaned, false);
        if(typeof options.onChanged === 'function') options.onChanged();
        return true;
      }
    }
    if(root && domState && typeof domState.cleanupSlashRTextNodes === 'function'){
      domState.cleanupSlashRTextNodes(root);
    }
    return false;
  }

  function buildVisibleCitationFallback(ref, deps){
    var authors = Array.isArray(ref && ref.authors) ? ref.authors : [];
    var formatAuthor = typeof deps.formatAuthor === 'function'
      ? deps.formatAuthor
      : function(value){ return String(value || ''); };
    var lastNames = authors
      .map(formatAuthor)
      .filter(Boolean)
      .map(function(author){
        return String(author || '').split(',')[0].trim();
      });
    var authorPart = lastNames.length === 0
      ? 'Bilinmeyen'
      : lastNames.length === 1
        ? lastNames[0]
        : lastNames.length === 2
          ? lastNames[0] + ' & ' + lastNames[1]
          : lastNames[0] + ' vd.';
    return authorPart + ', ' + ((ref && ref.year) || 't.y.');
  }

  function visibleCitationText(refs, deps){
    deps = deps || {};
    var citationState = deps.citationState || null;
    if(citationState && typeof citationState.visibleCitationText === 'function'){
      return citationState.visibleCitationText(refs, {
        formatAuthor: deps.formatAuthor,
        dedupeReferences: deps.dedupeReferences,
        sortReferences: deps.sortReferences
      });
    }
    var list = normalizeRefs(refs, deps);
    if(!list.length) return '';
    if(list.length === 1 && typeof deps.getInlineCitationText === 'function'){
      return deps.getInlineCitationText(list[0]);
    }
    return '(' + list.map(function(ref){
      var text = typeof deps.getInlineCitationText === 'function' ? deps.getInlineCitationText(ref) : '';
      if(!text){
        text = buildVisibleCitationFallback(ref, deps);
        return String(text || '').replace(/^\(|\)$/g,'');
      }
      return String(text || '').replace(/^\(|\)$/g,'');
    }).join('; ') + ')';
  }

  function resolveRoot(root, deps){
    deps = deps || {};
    if(root) return root;
    if(deps.root) return deps.root;
    if(deps.editor && deps.editor.view) return deps.editor.view.dom || null;
    if(deps.host) return deps.host;
    return null;
  }

  function normalizeCitationSpans(root, deps){
    deps = deps || {};
    var domState = deps.domState || null;
    root = resolveRoot(root, deps);
    if(!root || !domState || typeof domState.normalizeCitationSpans !== 'function') return false;
    domState.normalizeCitationSpans(root, {
      findReference: deps.findReference,
      dedupeReferences: deps.dedupeReferences,
      visibleCitationText: deps.visibleCitationText
    });
    return true;
  }

  function cleanupEditorArtifacts(options){
    options = options || {};
    var editor = options.editor || null;
    var root = resolveRoot(options.root, {
      editor: editor,
      host: options.host || null
    });
    if(cleanupSlashRArtifacts({
      editor: editor,
      root: root,
      domState: options.domState || null,
      onChanged: options.onChanged || null
    })) return true;
    if(root && options.domState && typeof options.domState.cleanupSlashRTextNodes === 'function'){
      options.domState.cleanupSlashRTextNodes(root);
      return true;
    }
    return false;
  }

  function syncEditorCitationSpans(options){
    options = options || {};
    return normalizeCitationSpans(options.root, {
      editor: options.editor || null,
      host: options.host || null,
      root: options.root || null,
      domState: options.domState || null,
      findReference: options.findReference,
      dedupeReferences: options.dedupeReferences,
      visibleCitationText: options.visibleCitationText
    });
  }

  function insertCitationIntoEditor(refs, deps){
    deps = deps || {};
    var editor = deps.editor || null;
    if(!editor || !Array.isArray(refs) || !refs.length) return false;
    var buildCitationHTML = typeof deps.buildCitationHTML === 'function' ? deps.buildCitationHTML : function(){ return ''; };
    var list = normalizeRefs(refs, deps);
    if(!list.length) return false;
    var state = editor.state;
    var pos = state.selection.from;
    var textBefore = state.doc.textBetween(Math.max(0, pos - 48), pos, '');
    var match = textBefore.match(/\/r[^\s]*$/);
    var chain = editor.chain().focus();
    var triggerRange = deps.triggerRange || null;
    if(triggerRange && triggerRange.from >= 0 && triggerRange.to >= triggerRange.from){
      chain.deleteRange({ from: triggerRange.from, to: triggerRange.to });
    }else if(match){
      chain.deleteRange({ from: pos - match[0].length, to: pos });
    }
    chain.insertContent(buildCitationHTML(list), { parseOptions:{ preserveWhitespace:false } }).run();
    if(typeof deps.setTriggerRange === 'function'){
      deps.setTriggerRange(null);
    }
    setTimeout(function(){
      if(typeof deps.normalizeCitationSpans === 'function') deps.normalizeCitationSpans();
      if(typeof deps.cleanupSlashRArtifacts === 'function') deps.cleanupSlashRArtifacts();
    }, 0);
    return true;
  }

  return {
    buildReferenceListHTML: buildReferenceListHTML,
    renderReferenceList: renderReferenceList,
    renderUsedReferenceList: renderUsedReferenceList,
    collectUsedReferences: collectUsedReferences,
    copyNoteCitation: copyNoteCitation,
    cleanupSlashRArtifacts: cleanupSlashRArtifacts,
    cleanupEditorArtifacts: cleanupEditorArtifacts,
    visibleCitationText: visibleCitationText,
    resolveRoot: resolveRoot,
    normalizeCitationSpans: normalizeCitationSpans,
    syncEditorCitationSpans: syncEditorCitationSpans,
    insertCitationIntoEditor: insertCitationIntoEditor
  };
});
