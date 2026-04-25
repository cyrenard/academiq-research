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

  function getCitationOccurrences(root){
    if(!root || typeof root.querySelectorAll !== 'function') return [];
    var seenBySignature = {};
    var rows = [];
    Array.prototype.forEach.call(root.querySelectorAll('.cit'), function(node){
      if(!node) return;
      var refIds = String(node.getAttribute('data-ref') || '').split(',').map(function(id){
        return String(id || '').trim();
      }).filter(Boolean);
      if(!refIds.length) return;
      var signature = refIds.join(',');
      var ordinal = (seenBySignature[signature] || 0) + 1;
      seenBySignature[signature] = ordinal;
      rows.push({
        node: node,
        refIds: refIds,
        signature: signature,
        ordinal: ordinal,
        key: 'ref:' + signature + '#' + ordinal,
        text: String(node.textContent || '').trim()
      });
    });
    return rows;
  }

  function findCitationOccurrence(root, citationKey){
    citationKey = String(citationKey || '').trim();
    if(!citationKey) return null;
    var occurrences = getCitationOccurrences(root);
    if(citationKey.indexOf('ref:') === 0){
      var raw = citationKey.slice(4);
      var parts = raw.split('#');
      var signature = String(parts[0] || '').trim();
      var ordinal = parseInt(parts[1], 10);
      if(!signature || !Number.isFinite(ordinal)) return null;
      return occurrences.find(function(row){
        return row.signature === signature && row.ordinal === ordinal;
      }) || null;
    }
    return null;
  }

  function findCitationForReference(root, refId, citationKey){
    refId = String(refId || '').trim();
    if(!refId) return null;
    var occurrences = getCitationOccurrences(root);
    if(citationKey){
      var linked = findCitationOccurrence(root, citationKey);
      if(linked && linked.refIds.indexOf(refId) >= 0) return linked;
    }
    return occurrences.find(function(row){
      return row.refIds.indexOf(refId) >= 0;
    }) || null;
  }

  function jumpToNode(node, options){
    options = options || {};
    if(!node || typeof node.scrollIntoView !== 'function') return false;
    try{
      var scroller = options.scroller || (typeof document !== 'undefined' ? document.getElementById('escroll') : null);
      if(scroller && typeof scroller.scrollTo === 'function' && typeof node.getBoundingClientRect === 'function'){
        var nodeRect = node.getBoundingClientRect();
        var scrollRect = scroller.getBoundingClientRect();
        var targetTop = scroller.scrollTop + (nodeRect.top - scrollRect.top) - Math.max(24, (scrollRect.height - nodeRect.height) / 2);
        scroller.scrollTo({ top: Math.max(0, targetTop), behavior: options.behavior || 'smooth' });
      }else{
        node.scrollIntoView({
          behavior: options.behavior || 'smooth',
          block: options.block || 'center',
          inline: 'nearest'
        });
      }
    }catch(_e){}
    try{
      if(node.classList) node.classList.add('aq-citation-jump');
      setTimeout(function(){
        if(node && node.classList) node.classList.remove('aq-citation-jump');
      }, 1250);
    }catch(_e2){}
    return true;
  }

  function jumpToBibliographyEntry(refId, options){
    options = options || {};
    refId = String(refId || '').trim();
    if(!refId) return false;
    var openFn = typeof options.openBibliography === 'function' ? options.openBibliography : null;
    var attempts = 0;
    var scrollAttempt = function(){
      attempts += 1;
      var pageEl = options.pageEl || (typeof document !== 'undefined' ? document.getElementById('bibpage') : null);
      var bodyEl = options.bodyEl || (typeof document !== 'undefined' ? document.getElementById('bibbody') : null);
      if(pageEl && pageEl.style && pageEl.style.display === 'none' && openFn){
        try{ openFn(); }catch(_openErr){}
      }else if(!pageEl && typeof insRefs === 'function'){
        try{ insRefs(); }catch(_renderErr){}
      }
      bodyEl = options.bodyEl || (typeof document !== 'undefined' ? document.getElementById('bibbody') : null);
      var entry = bodyEl && typeof bodyEl.querySelector === 'function'
        ? bodyEl.querySelector('.refe[data-ref-id="' + refId.replace(/"/g, '&quot;') + '"]')
        : null;
      if(entry && (attempts > 1 || !openFn)){
        return jumpToNode(entry, options);
      }
      if(attempts < 12){
        setTimeout(scrollAttempt, attempts < 3 ? 90 : 50);
      }
      return false;
    };
    return scrollAttempt();
  }

  function jumpToCitationForRef(refId, options){
    options = options || {};
    refId = String(refId || '').trim();
    if(!refId) return false;
    var root = options.editorRoot || options.root || (typeof document !== 'undefined' ? document.getElementById('apaed') : null);
    var occurrence = findCitationForReference(root, refId, '');
    if(!occurrence) return false;
    return jumpToNode(occurrence.node, options);
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
        var refId = String(ref && ref.id || '').trim();
        return '<p class="refe" data-ref-id="' + refId.replace(/"/g, '&quot;') + '" tabindex="0" role="button">' + formatRef(ref) + '</p>';
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
      bodyEl.addEventListener('click', function(event){
        var target = event && event.target ? (event.target.nodeType === 3 ? event.target.parentElement : event.target) : null;
        var entry = target && target.closest ? target.closest('.refe[data-ref-id]') : null;
        if(!entry) return;
        if(typeof event.preventDefault === 'function') event.preventDefault();
        if(typeof event.stopPropagation === 'function') event.stopPropagation();
        if(typeof options.onReferenceClick === 'function'){
          options.onReferenceClick(entry.getAttribute('data-ref-id') || '', entry, event);
        }
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
      onChange: options.onChange,
      onReferenceClick: options.onReferenceClick
    });
  }

  function updateBibliographySection(options){
    options = options || {};
    var refs = Array.isArray(options.refs) ? options.refs : [];
    var pageEl = options.pageEl || null;
    var bodyEl = options.bodyEl || null;
    var doc = options.doc || null;
    var formatRef = options.formatRef || function(ref){ return String(ref || ''); };
    var hasExternalBibliographyRefs = !!(doc && Array.isArray(doc.bibliographyExtraRefIds) && doc.bibliographyExtraRefIds.length);
    var forceAuto = !!options.forceAuto || hasExternalBibliographyRefs;
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
      var refId = String(ref && ref.id || '').trim();
      return '<p class="refe" data-ref-id="' + refId.replace(/"/g, '&quot;') + '" tabindex="0" role="button">' + formatRef(ref) + '</p>';
    }).join('');
    var persistedHTML = doc ? String(doc.bibliographyHTML || '').trim() : '';
    var manualHTML = doc && doc.bibliographyManual && !forceAuto ? String(doc.bibliographyHTML || '').trim() : '';

    if(!refs.length){
      var showManualOnly = !!(doc && doc.bibliographyManual && persistedHTML);
      if(showManualOnly){
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
    if(typeof options.syncPageLayout === 'function'){
      try{
        options.syncPageLayout({
          pageEl: pageEl,
          bodyEl: bodyEl,
          refs: refs,
          doc: doc
        });
      }catch(_e){}
    }
    if(restorePriorFocus && priorActive && typeof priorActive.focus === 'function'){
      try{ priorActive.focus({ preventScroll:true }); }
      catch(e){
        try{ priorActive.focus(); }catch(e2){}
      }
    }
    return true;
  }

  function mergeBibliographyReferences(refs, options){
    options = options || {};
    var list = Array.isArray(refs) ? refs.slice() : [];
    var extras = [];
    if(Array.isArray(options.extraReferences)){
      extras = options.extraReferences;
    }else if(typeof options.getExtraReferences === 'function'){
      extras = options.getExtraReferences() || [];
    }
    if(Array.isArray(extras) && extras.length){
      list = list.concat(extras.filter(Boolean));
    }
    if(typeof options.dedupeReferences === 'function'){
      list = options.dedupeReferences(list);
    }
    if(typeof options.sortReferences === 'function'){
      list = options.sortReferences(list);
    }
    return Array.isArray(list) ? list : [];
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
        sortReferences: options.sortReferences,
        onReferenceClick: options.onReferenceClick
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
        sortReferences: options.sortReferences,
        onReferenceClick: options.onReferenceClick
      });
      return refs;
    }

    return refs;
  }

  function syncBibliographyUI(options){
    options = options || {};
    var refs = renderReferencePanel(options);
    refs = mergeBibliographyReferences(refs, options);
    updateBibliographySection({
      refs: refs,
      pageEl: options.pageEl || null,
      bodyEl: options.bodyEl || null,
      doc: options.doc || null,
      forceAuto: !!options.forceAuto,
      formatRef: options.formatRef,
      bindSurface: options.bindSurface,
      onAfterUpdate: options.onAfterUpdate,
      syncPageLayout: options.syncPageLayout
    });
    return refs;
  }

  function syncReferenceViews(options){
    options = options || {};
    var panelRefs = renderReferencePanel(options);
    var refs = panelRefs;
    if((options.pageEl || options.bodyEl) && !options.skipBibliography){
      refs = mergeBibliographyReferences(panelRefs, options);
      updateBibliographySection({
        refs: refs,
        pageEl: options.pageEl || null,
        bodyEl: options.bodyEl || null,
        doc: options.doc || null,
        forceAuto: !!options.forceAuto,
        formatRef: options.formatRef,
        bindSurface: options.bindSurface,
        onReferenceClick: options.onReferenceClick,
        onAfterUpdate: options.onAfterUpdate,
        syncPageLayout: options.syncPageLayout
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
        extraReferences: options.extraReferences,
        getExtraReferences: options.getExtraReferences,
        forceAuto: true,
        formatRef: options.formatRef,
        bindSurface: options.bindSurface,
        onAfterUpdate: options.onAfterUpdate,
        syncPageLayout: options.syncPageLayout
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

  function jumpToCitationFromBibliography(refId, options){
    options = options || {};
    if(!options.jumpToCitation) return false;
    return !!options.jumpToCitation(refId, options);
  }

  var api = {
    getCurrentDocument: getCurrentDocument,
    getCurrentDocumentFromState: getCurrentDocumentFromState,
    getCitationOccurrences: getCitationOccurrences,
    findCitationOccurrence: findCitationOccurrence,
    findCitationForReference: findCitationForReference,
    jumpToBibliographyEntry: jumpToBibliographyEntry,
    jumpToCitationForRef: jumpToCitationForRef,
    resolveEditorRoot: resolveEditorRoot,
    syncBibliographyHTML: syncBibliographyHTML,
    bindBibliographySurface: bindBibliographySurface,
    bindBibliographySurfaceForState: bindBibliographySurfaceForState,
    renderReferencePanel: renderReferencePanel,
    mergeBibliographyReferences: mergeBibliographyReferences,
    syncBibliographyUI: syncBibliographyUI,
    syncReferenceViews: syncReferenceViews,
    syncReferenceViewsForState: syncReferenceViewsForState,
    updateBibliographySection: updateBibliographySection,
    resetManualBibliography: resetManualBibliography,
    resetManualBibliographyForState: resetManualBibliographyForState,
    refreshManualBibliography: refreshManualBibliography,
    refreshManualBibliographyForState: refreshManualBibliographyForState,
    openBibliographySection: openBibliographySection,
    openBibliographySectionForState: openBibliographySectionForState,
    jumpToCitationFromBibliography: jumpToCitationFromBibliography
  };

  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQBibliographyState = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
