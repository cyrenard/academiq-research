(function(root){
  function getCurrentDocument(docs, currentDocId){
    var list = Array.isArray(docs) ? docs : [];
    return list.find(function(doc){
      return doc && doc.id === currentDocId;
    }) || null;
  }

  function getCurrentDocumentFromState(state, currentDocId){
    return getCurrentDocument(state && state.docs, currentDocId);
  }

  function syncBibliographyHTML(fullHTML, refs, options){
    options = options || {};
    var formatRef = options.formatRef || function(ref){ return String(ref || ''); };
    var blankDoc = options.blankDoc || '<p></p>';
    var html = String(fullHTML || blankDoc);
    var div = (options.createContainer || defaultCreateContainer)(html);
    var bibliographyTitle = options.bibliographyTitle || 'Kaynakça';
    var titleMatcher = options.titleMatcher || function(text){
      return text === 'Kaynakça' || text === 'Kaynakça';
    };
    var heading = Array.from(div.querySelectorAll('h1')).find(function(node){
      return titleMatcher((node.textContent || '').trim());
    });

    refs = Array.isArray(refs) ? refs : [];

    if(!refs.length){
      if(heading) removeReferenceNodesAfter(heading);
    }else{
      var refHTML = refs.map(function(ref){
        return '<p class="refe">' + formatRef(ref) + '</p>';
      }).join('');
      if(!heading){
        div.insertAdjacentHTML('beforeend', '<h1>' + bibliographyTitle + '</h1>' + refHTML);
      }else{
        removeReferenceNodesAfter(heading);
        heading.insertAdjacentHTML('afterend', refHTML);
      }
    }

    return div.innerHTML || blankDoc;
  }

  function removeReferenceNodesAfter(node){
    var current = node.nextSibling;
    while(current){
      var next = current.nextSibling;
      if(current.nodeType === 1 && current.classList && current.classList.contains('refe')){
        current.remove();
      }
      current = next;
    }
  }

  function defaultCreateContainer(html){
    if(typeof document !== 'undefined' && document.createElement){
      var div = document.createElement('div');
      div.innerHTML = html;
      return div;
    }
    throw new Error('createContainer is required outside the browser');
  }

  function bindBibliographySurface(options){
    options = options || {};
    var bodyEl = options.bodyEl || null;
    if(!bodyEl || bodyEl.__aqBound) return false;
    bodyEl.__aqBound = true;
    if(typeof bodyEl.setAttribute === 'function'){
      bodyEl.setAttribute('contenteditable', 'true');
      bodyEl.setAttribute('spellcheck', 'true');
    }
    if(typeof bodyEl.addEventListener === 'function'){
      bodyEl.addEventListener('input', function(){
        var doc = typeof options.getCurrentDocument === 'function' ? options.getCurrentDocument() : null;
        if(!doc) return;
        doc.bibliographyHTML = bodyEl.innerHTML;
        doc.bibliographyManual = !!String(bodyEl.textContent || '').trim();
        if(typeof options.onChange === 'function') options.onChange(doc, bodyEl);
      });
    }
    return true;
  }

  function bindBibliographySurfaceForState(options){
    options = options || {};
    return bindBibliographySurface({
      bodyEl: options.bodyEl || null,
      getCurrentDocument: function(){
        return getCurrentDocumentFromState(options.state || null, options.currentDocId);
      },
      onChange: options.onChange
    });
  }

  function updateBibliographySection(options){
    options = options || {};
    var refs = Array.isArray(options.refs) ? options.refs : [];
    var pageEl = options.pageEl || null;
    var bodyEl = options.bodyEl || null;
    var doc = options.doc || null;
    var formatRef = options.formatRef || function(ref){ return String(ref || ''); };
    var forceAuto = !!options.forceAuto;
    var ownerDoc = bodyEl && bodyEl.ownerDocument ? bodyEl.ownerDocument : (typeof document !== 'undefined' ? document : null);
    var priorActive = ownerDoc ? ownerDoc.activeElement : null;
    var restorePriorFocus = !!(
      priorActive &&
      priorActive !== bodyEl &&
      !(bodyEl && typeof bodyEl.contains === 'function' && bodyEl.contains(priorActive))
    );

    if(!pageEl || !bodyEl) return false;
    if(typeof options.bindSurface === 'function') options.bindSurface();

    var generatedHTML = '<h1>Kaynakça</h1>' + refs.map(function(ref){
      return '<p class="refe">' + formatRef(ref) + '</p>';
    }).join('');
    var persistedHTML = doc ? String(doc.bibliographyHTML || '').trim() : '';
    var manualHTML = doc && doc.bibliographyManual && !forceAuto ? String(doc.bibliographyHTML || '').trim() : '';

    if(!refs.length){
      if(persistedHTML){
        bodyEl.innerHTML = persistedHTML;
        if(pageEl.style) pageEl.style.display = 'block';
      }else{
        bodyEl.innerHTML = '';
        if(pageEl.style) pageEl.style.display = 'none';
        if(doc){
          doc.bibliographyHTML = '';
          doc.bibliographyManual = false;
        }
      }
    }else{
      bodyEl.innerHTML = manualHTML || generatedHTML;
      if(pageEl.style) pageEl.style.display = 'block';
      if(doc && (!doc.bibliographyManual || forceAuto)){
        doc.bibliographyHTML = generatedHTML;
        doc.bibliographyManual = false;
      }
    }

    if(typeof options.onAfterUpdate === 'function'){
      options.onAfterUpdate({
        refs: refs,
        doc: doc,
        generatedHTML: generatedHTML,
        persistedHTML: persistedHTML,
        manualHTML: manualHTML
      });
    }
    if(restorePriorFocus && priorActive && typeof priorActive.focus === 'function'){
      try{ priorActive.focus({ preventScroll:true }); }
      catch(e){
        try{ priorActive.focus(); }catch(e2){}
      }
    }
    return true;
  }

  function renderReferencePanel(options){
    options = options || {};
    var citationApi = options.citationApi || null;
    var refs = Array.isArray(options.refs) ? options.refs : null;
    var listEl = options.listEl || null;

    if(citationApi && typeof citationApi.renderUsedReferenceList === 'function' && options.editorRoot){
      refs = citationApi.renderUsedReferenceList(options.editorRoot, listEl, {
        findReference: options.findReference,
        getInlineCitationText: options.getInlineCitationText,
        formatReference: options.formatReference,
        escapeJS: options.escapeJS,
        dedupeReferences: options.dedupeReferences,
        sortReferences: options.sortReferences
      });
      return Array.isArray(refs) ? refs : [];
    }

    refs = Array.isArray(refs) ? refs : [];
    if(citationApi && typeof citationApi.renderReferenceList === 'function'){
      citationApi.renderReferenceList(listEl, refs, {
        getInlineCitationText: options.getInlineCitationText,
        formatReference: options.formatReference,
        escapeJS: options.escapeJS,
        dedupeReferences: options.dedupeReferences,
        sortReferences: options.sortReferences
      });
      return refs;
    }

    return refs;
  }

  function syncBibliographyUI(options){
    options = options || {};
    var refs = renderReferencePanel(options);
    refs = Array.isArray(refs) ? refs : [];
    if(typeof options.sortReferences === 'function'){
      refs = options.sortReferences(refs);
    }
    if(typeof options.dedupeReferences === 'function'){
      refs = options.sortReferences
        ? options.sortReferences(options.dedupeReferences(refs))
        : options.dedupeReferences(refs);
    }
    updateBibliographySection({
      refs: refs,
      pageEl: options.pageEl || null,
      bodyEl: options.bodyEl || null,
      doc: options.doc || null,
      forceAuto: !!options.forceAuto,
      formatRef: options.formatRef,
      bindSurface: options.bindSurface,
      onAfterUpdate: options.onAfterUpdate
    });
    return refs;
  }

  function syncReferenceViews(options){
    options = options || {};
    var refs = renderReferencePanel(options);
    if((options.pageEl || options.bodyEl) && !options.skipBibliography){
      refs = Array.isArray(refs) ? refs : [];
      if(typeof options.sortReferences === 'function'){
        refs = options.sortReferences(refs);
      }
      if(typeof options.dedupeReferences === 'function'){
        refs = options.sortReferences
          ? options.sortReferences(options.dedupeReferences(refs))
          : options.dedupeReferences(refs);
      }
      updateBibliographySection({
        refs: refs,
        pageEl: options.pageEl || null,
        bodyEl: options.bodyEl || null,
        doc: options.doc || null,
        forceAuto: !!options.forceAuto,
        formatRef: options.formatRef,
        bindSurface: options.bindSurface,
        onAfterUpdate: options.onAfterUpdate
      });
    }
    return Array.isArray(refs) ? refs : [];
  }

  function resetManualBibliography(doc){
    if(!doc) return false;
    doc.bibliographyHTML = '';
    doc.bibliographyManual = false;
    return true;
  }

  function resetManualBibliographyForState(state, currentDocId){
    return resetManualBibliography(getCurrentDocumentFromState(state, currentDocId));
  }

  function resolveEditorRoot(options){
    options = options || {};
    if(options.editorRoot) return options.editorRoot;
    var host = options.host || null;
    var surfaceApi = options.surfaceApi || null;
    if(surfaceApi && typeof surfaceApi.getEditorRoot === 'function'){
      var root = surfaceApi.getEditorRoot(host || null);
      if(root) return root;
    }
    var editor = options.editor || null;
    if(editor && editor.view && editor.view.dom){
      return editor.view.dom;
    }
    return host || null;
  }

  function resolveStateSyncOptions(options){
    options = options || {};
    var resolved = Object.assign({}, options);
    if(!resolved.doc){
      resolved.doc = getCurrentDocumentFromState(options.state || null, options.currentDocId);
    }
    if(!resolved.editorRoot){
      resolved.editorRoot = resolveEditorRoot(options);
    }
    return resolved;
  }

  function syncReferenceViewsForState(options){
    return syncReferenceViews(resolveStateSyncOptions(options));
  }

  function refreshManualBibliography(options){
    options = resolveStateSyncOptions(options);
    var doc = options.doc || null;
    var syncReferenceViewsFn = typeof options.syncReferenceViews === 'function'
      ? options.syncReferenceViews
      : syncReferenceViews;

    if(typeof syncReferenceViewsFn === 'function'){
      syncReferenceViewsFn({
        editorRoot: options.editorRoot || null,
        listEl: options.listEl || null,
        pageEl: options.pageEl || null,
        bodyEl: options.bodyEl || null,
        doc: doc || null,
        citationApi: options.citationApi || null,
        findReference: options.findReference,
        getInlineCitationText: options.getInlineCitationText,
        formatReference: options.formatReference,
        escapeJS: options.escapeJS,
        dedupeReferences: options.dedupeReferences,
        sortReferences: options.sortReferences,
        forceAuto: true,
        formatRef: options.formatRef,
        bindSurface: options.bindSurface,
        onAfterUpdate: options.onAfterUpdate
      });
      return true;
    }

    if(typeof options.updateReferenceSection === 'function'){
      options.updateReferenceSection(true);
      return true;
    }

    return false;
  }

  function refreshManualBibliographyForState(options){
    return refreshManualBibliography(resolveStateSyncOptions(options));
  }

  function openBibliographySection(options){
    options = options || {};
    var handled = false;

    if(typeof options.refreshBibliography === 'function'){
      options.refreshBibliography();
      handled = true;
    }else{
      handled = refreshManualBibliography(options) || handled;
    }

    var pageEl = options.pageEl || null;
    if(pageEl && typeof pageEl.scrollIntoView === 'function'){
      var defer = typeof options.defer === 'function'
        ? options.defer
        : function(fn){
            if(typeof setTimeout === 'function') setTimeout(fn, 0);
            else fn();
          };
      defer(function(){
        pageEl.scrollIntoView({
          behavior: options.behavior || 'smooth',
          block: options.block || 'start'
        });
      });
      handled = true;
    }

    return handled;
  }

  function openBibliographySectionForState(options){
    return openBibliographySection(resolveStateSyncOptions(options));
  }

  var api = {
    getCurrentDocument: getCurrentDocument,
    getCurrentDocumentFromState: getCurrentDocumentFromState,
    resolveEditorRoot: resolveEditorRoot,
    syncBibliographyHTML: syncBibliographyHTML,
    bindBibliographySurface: bindBibliographySurface,
    bindBibliographySurfaceForState: bindBibliographySurfaceForState,
    renderReferencePanel: renderReferencePanel,
    syncBibliographyUI: syncBibliographyUI,
    syncReferenceViews: syncReferenceViews,
    syncReferenceViewsForState: syncReferenceViewsForState,
    updateBibliographySection: updateBibliographySection,
    resetManualBibliography: resetManualBibliography,
    resetManualBibliographyForState: resetManualBibliographyForState,
    refreshManualBibliography: refreshManualBibliography,
    refreshManualBibliographyForState: refreshManualBibliographyForState,
    openBibliographySection: openBibliographySection,
    openBibliographySectionForState: openBibliographySectionForState
  };

  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQBibliographyState = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
