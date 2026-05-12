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

  function getCitationOccurrences(root, options){
    options = options || {};
    var editor = options.editor || null;
    if(editor && editor._aqEngine && editor._docModel){
      // AQ Engine path: scan the custom document model instead of DOM
      var model = editor._docModel.get();
      var seenBySignature = {};
      var rows = [];
      (model.blocks || []).forEach(function(block){
        (block.runs || []).forEach(function(run){
          if(run && run.citation){
            var refIds = String(run.citation.ref || run.citation.id || '').split(',').map(function(id){
              return String(id || '').trim();
            }).filter(Boolean);
            if(!refIds.length) return;
            var signature = refIds.join(',');
            var ordinal = (seenBySignature[signature] || 0) + 1;
            seenBySignature[signature] = ordinal;
            rows.push({
              refIds: refIds,
              signature: signature,
              ordinal: ordinal,
              key: 'ref:' + signature + '#' + ordinal,
              text: String(run.text || '').trim()
            });
          }
        });
      });
      return rows;
    }
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

  function normalizeBibliographyTitle(text){
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/\u00e7/g, 'c')
      .replace(/\u0131/g, 'i')
      .replace(/\u015f/g, 's')
      .replace(/\u011f/g, 'g')
      .replace(/\u00fc/g, 'u')
      .replace(/\u00f6/g, 'o');
  }

  function isBibliographyTitle(text){
    var t = normalizeBibliographyTitle(text);
    return t === 'kaynakca' || t === 'references' || t === 'bibliography' || t === 'kaynaklar';
  }

  function isAQEngineAppendixTitle(text){
    var t = normalizeBibliographyTitle(text);
    return /^ek(?:ler)?(?:[-\s]+[a-z0-9]+)?$/.test(t) || /^appendix(?:[-\s]+[a-z0-9]+)?$/.test(t);
  }

  function blockText(block){
    return (block && block.runs || []).map(function(run){
      return String(run && run.text || '');
    }).join('');
  }

  function findAQEngineAppendixRange(blocks){
    blocks = Array.isArray(blocks) ? blocks : [];
    var start = -1;
    for(var i = 0; i < blocks.length; i++){
      var block = blocks[i];
      if(block && (block._isAppendixHeading || (block.type === 'heading' && isAQEngineAppendixTitle(blockText(block))))){
        start = i;
        break;
      }
    }
    if(start < 0) return { start: -1, end: -1 };
    return { start: start, end: blocks.length };
  }

  function findAQEngineBibliographyRange(blocks){
    blocks = Array.isArray(blocks) ? blocks : [];
    var headingIndex = -1;
    for(var i = 0; i < blocks.length; i++){
      var block = blocks[i];
      if(block && (block._isBibHeading || (block.type === 'heading' && isBibliographyTitle(blockText(block))))){
        headingIndex = i;
        break;
      }
    }
    if(headingIndex < 0) return { headingIndex: -1, start: -1, end: -1 };
    var end = headingIndex + 1;
    while(end < blocks.length){
      var next = blocks[end];
      if(!next) break;
      var cls = String(next.attrs && next.attrs.class || '');
      if(next._isBibEntry || (next.attrs && next.attrs.refId) || /\b(refe|aq-ref-entry)\b/.test(cls)){
        end += 1;
        continue;
      }
      if(!blockText(next).trim() && end === headingIndex + 1){
        end += 1;
        continue;
      }
      break;
    }
    return { headingIndex: headingIndex, start: headingIndex + 1, end: end };
  }

  function aqEngineBlockStartOffset(blocks, blockIdx){
    blocks = Array.isArray(blocks) ? blocks : [];
    var off = 0;
    for(var i = 0; i < blockIdx && i < blocks.length; i++){
      off += blockText(blocks[i]).length + 1;
    }
    return off;
  }

  function aqEngineSelectionInsideRange(editor, range, blocks){
    if(!editor || typeof editor._captureSelection !== 'function' || !range || range.headingIndex < 0) return false;
    try{
      var sel = editor._captureSelection();
      if(!sel || typeof sel.from !== 'number') return false;
      var start = aqEngineBlockStartOffset(blocks, range.headingIndex);
      var end = range.end >= 0 ? aqEngineBlockStartOffset(blocks, range.end) : aqEngineBlockStartOffset(blocks, blocks.length);
      return sel.from >= start && sel.from <= end;
    }catch(_e){
      return false;
    }
  }

  function moveAQEngineSelectionBeforeBibliography(editor, blocks, headingIndex){
    if(!editor || typeof editor._restoreSelection !== 'function' || headingIndex < 0) return false;
    var at = aqEngineBlockStartOffset(blocks, headingIndex);
    try{
      return !!editor._restoreSelection({ from: at, to: at, anchor: at, focus: at });
    }catch(_e){
      return false;
    }
  }

  function buildAQEngineBibliographyHeading(){
    return {
      type: 'heading',
      level: 1,
      pageBreak: true,
      align: 'center',
      runs: [{ text: 'KAYNAK\u00c7A', bold: true }],
      font: { sizePt: 12, weight: '700', style: 'normal' },
      firstLineIndentPx: 0,
      spaceAfterPx: 0,
      _isBibHeading: true
    };
  }

  function buildAQEngineEmptyBibliographyEntry(){
    return {
      type: 'paragraph',
      runs: [{ text: '' }],
      _isBibEntry: true,
      leftIndentPx: 48,
      firstLineIndentPx: -48,
      spaceAfterPx: 0,
      lineHeightFactor: 2.0,
      font: { sizePt: 12, weight: '400', style: 'normal' }
    };
  }

  function applyAQEngineBibliographyEntryStyle(block){
    block.type = block.type || 'paragraph';
    block._isBibEntry = true;
    block.leftIndentPx = 48;
    block.firstLineIndentPx = -48;
    block.spaceAfterPx = 0;
    block.lineHeightFactor = 2.0;
    block.font = { sizePt: 12, weight: '400', style: 'normal' };
    return block;
  }

  function escapeHTML(value){
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function aqEngineBlockToBibliographyHTML(block){
    block = block || {};
    var text = (block.runs || []).map(function(run){
      var out = escapeHTML(run && run.text || '');
      if(run && run.bold) out = '<strong>' + out + '</strong>';
      if(run && run.italic) out = '<em>' + out + '</em>';
      if(run && run.underline) out = '<u>' + out + '</u>';
      return out;
    }).join('');
    if(block._isBibHeading || (block.type === 'heading' && isBibliographyTitle(blockText(block)))){
      return '<h1>KAYNAK\u00c7A</h1>';
    }
    var refId = String(block._refId || (block.attrs && block.attrs.refId) || '').trim();
    return '<p class="refe"' + (refId ? ' data-ref-id="' + escapeHTML(refId) + '"' : '') + '>' + text + '</p>';
  }

  function captureAQEngineBibliographyHTML(editor, doc){
    if(!editor || !editor._aqEngine || !editor._docModel || !doc) return false;
    var model = editor._docModel.get();
    var blocks = (model && Array.isArray(model.blocks)) ? model.blocks : [];
    var range = findAQEngineBibliographyRange(blocks);
    if(range.headingIndex < 0) return false;
    var end = range.end > range.headingIndex ? range.end : blocks.length;
    var html = blocks.slice(range.headingIndex, end).map(aqEngineBlockToBibliographyHTML).join('');
    if(!String(html || '').trim()) return false;
    doc.bibliographyHTML = html;
    doc.bibliographyManual = true;
    return true;
  }

  function replaceAQEngineBibliographyFromHTML(editor, html){
    if(!editor || !editor._aqEngine || !editor._docModel) return false;
    html = String(html || '').trim();
    if(!html) return false;
    var docModel = editor._docModel;
    var model = docModel.get();
    var blocks = (model && Array.isArray(model.blocks)) ? model.blocks : [];
    var parsed = [];
    if(typeof window !== 'undefined' && window.AQEngineCompat && typeof window.AQEngineCompat.htmlToBlocks === 'function'){
      parsed = window.AQEngineCompat.htmlToBlocks(html);
    }
    if(!Array.isArray(parsed) || !parsed.length) return false;
    var hasHeading = parsed.some(function(block){
      return block && (block._isBibHeading || (block.type === 'heading' && isBibliographyTitle(blockText(block))));
    });
    if(!hasHeading) parsed.unshift(buildAQEngineBibliographyHeading());
    var seenHeading = false;
    parsed = parsed.map(function(block){
      block = Object.assign({}, block || {});
      if(!seenHeading && (block._isBibHeading || block.type === 'heading' || isBibliographyTitle(blockText(block)))){
        seenHeading = true;
        return Object.assign(buildAQEngineBibliographyHeading(), block, {
          type: 'heading',
          level: 1,
          pageBreak: true,
          align: 'center',
          runs: [{ text: 'KAYNAK\u00c7A', bold: true }],
          _isBibHeading: true
        });
      }
      return applyAQEngineBibliographyEntryStyle(block);
    });
    var range = findAQEngineBibliographyRange(blocks);
    var appendixRange = findAQEngineAppendixRange(blocks);
    var insertAt = range.headingIndex >= 0 ? range.headingIndex : (appendixRange.start >= 0 ? appendixRange.start : blocks.length);
    var replaceEnd = range.headingIndex >= 0 ? range.end : insertAt;
    docModel.replace(blocks.slice(0, insertAt).concat(parsed).concat(blocks.slice(replaceEnd)));
    if(typeof editor._reflow === 'function') editor._reflow();
    return true;
  }

  function resolveActiveEditor(options){
    options = options || {};
    if(options.editor) return options.editor;
    if(typeof window === 'undefined') return null;
    var core = window.AQEditorCore || null;
    if(core && typeof core.getEditor === 'function'){
      try{
        var coreEditor = core.getEditor();
        if(coreEditor) return coreEditor;
      }catch(_e){}
    }
    var lifecycle = window.AQEditorLifecycle || null;
    if(lifecycle && typeof lifecycle.getEditor === 'function'){
      try{
        var lifecycleEditor = lifecycle.getEditor();
        if(lifecycleEditor) return lifecycleEditor;
      }catch(_e2){}
    }
    return window.editor || null;
  }

  function collectReferenceIdsFromHTML(html){
    var ids = [];
    if(!html) return ids;
    if(typeof document !== 'undefined' && document.createElement){
      var div = document.createElement('div');
      div.innerHTML = String(html || '');
      Array.prototype.forEach.call(div.querySelectorAll('.cit[data-ref],[data-ref]'), function(node){
        String(node.getAttribute('data-ref') || '').split(',').forEach(function(id){
          id = String(id || '').trim();
          if(id) ids.push(id);
        });
      });
      return ids;
    }
    var re = /data-ref=["']([^"']+)["']/gi;
    var match;
    while((match = re.exec(String(html || '')))){
      String(match[1] || '').split(',').forEach(function(id){
        id = String(id || '').trim();
        if(id) ids.push(id);
      });
    }
    return ids;
  }

  function collectAQEngineUsedReferences(editor, options){
    options = options || {};
    if(!editor || !editor._aqEngine || !editor._docModel) return [];
    var findReference = options.findReference || function(){ return null; };
    var refs = [];
    var model = editor._docModel.get();
    (model.blocks || []).forEach(function(block){
      if(block && (block._isBibHeading || block._isBibEntry)) return;
      (block.runs || []).forEach(function(run){
        if(!run || !run.citation) return;
        String(run.citation.ref || run.citation.id || '').split(',').forEach(function(id){
          id = String(id || '').trim();
          if(!id) return;
          var ref = findReference(id);
          if(ref) refs.push(ref);
        });
      });
    });
    if(!refs.length && typeof editor.getHTML === 'function'){
      collectReferenceIdsFromHTML(editor.getHTML()).forEach(function(id){
        var ref = findReference(id);
        if(ref) refs.push(ref);
      });
    }
    if(typeof options.dedupeReferences === 'function') refs = options.dedupeReferences(refs);
    if(typeof options.sortReferences === 'function') refs = options.sortReferences(refs);
    return Array.isArray(refs) ? refs : [];
  }

  function findCitationOccurrence(root, citationKey, options){
    citationKey = String(citationKey || '').trim();
    if(!citationKey) return null;
    var occurrences = getCitationOccurrences(root, options);
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

  function findCitationForReference(root, refId, citationKey, options){
    refId = String(refId || '').trim();
    if(!refId) return null;
    var occurrences = getCitationOccurrences(root, options);
    if(citationKey){
      var linked = findCitationOccurrence(root, citationKey, options);
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
      
      var editor = options.editor || (typeof window !== 'undefined' ? window.editor : null);
      var isAQEngine = !!(editor && editor._aqEngine);
      
      if(pageEl && pageEl.style && pageEl.style.display === 'none' && openFn && !isAQEngine){
        try{ openFn(); }catch(_openErr){}
      }else if(!pageEl && typeof insRefs === 'function' && !isAQEngine){
        try{ insRefs(); }catch(_renderErr){}
      }
      
      var entry = null;
      if(isAQEngine && editor._stageEl){
        entry = editor._stageEl.querySelector('.aq-engine-line[data-ref-id="' + refId.replace(/"/g, '&quot;') + '"]');
      }
      
      if(!entry){
        bodyEl = options.bodyEl || (typeof document !== 'undefined' ? document.getElementById('bibbody') : null);
        entry = bodyEl && typeof bodyEl.querySelector === 'function'
          ? bodyEl.querySelector('.refe[data-ref-id="' + refId.replace(/"/g, '&quot;') + '"]')
          : null;
      }

      if(entry && (attempts > 1 || !openFn || isAQEngine)){
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
    var occurrence = findCitationForReference(root, refId, '', options);
    if(!occurrence) return false;
    if(occurrence.node) return jumpToNode(occurrence.node, options);
    return false;
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
      var refHTML = refs.map(function(ref, idx){
        var refId = String(ref && ref.id || '').trim();
        return '<p class="refe" data-ref-id="' + refId.replace(/"/g, '&quot;') + '" tabindex="0" role="button">' + formatRef(ref, { index: idx + 1 }) + '</p>';
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
        if(typeof options.onChange === 'function'){
          options.onChange(doc, bodyEl);
        }
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

    var editor = resolveActiveEditor(options);
    if(editor && editor._aqEngine && editor._docModel){
      if(doc && doc.bibliographyManual && !options.forceAuto && String(doc.bibliographyHTML || '').trim()){
        replaceAQEngineBibliographyFromHTML(editor, doc.bibliographyHTML);
        if(bodyEl) bodyEl.innerHTML = '';
        if(pageEl && pageEl.style) pageEl.style.display = 'none';
        if(typeof options.onAfterUpdate === 'function'){
          options.onAfterUpdate({
            refs: refs,
            doc: doc,
            generatedHTML: '',
            persistedHTML: String(doc.bibliographyHTML || ''),
            manualHTML: String(doc.bibliographyHTML || '')
          });
        }
        if(typeof options.syncPageLayout === 'function'){
          try{ options.syncPageLayout({ pageEl: pageEl, bodyEl: bodyEl, refs: refs, doc: doc }); }catch(_e){}
        }
        return true;
      }
      updateAQEngineBibliography(editor, refs, options);
      if(bodyEl) bodyEl.innerHTML = '';
      if(pageEl && pageEl.style) pageEl.style.display = 'none';
      if(typeof options.onAfterUpdate === 'function'){
        options.onAfterUpdate({
          refs: refs,
          doc: doc,
          generatedHTML: '',
          persistedHTML: '',
          manualHTML: ''
        });
      }
      if(typeof options.syncPageLayout === 'function'){
        try{ options.syncPageLayout({ pageEl: pageEl, bodyEl: bodyEl, refs: refs, doc: doc }); }catch(_e){}
      }
      return true;
    } else if(editor && editor.state && editor.view){
      if(updateTiptapBibliography(editor, refs, options)){
        // If we successfully updated an internal bibliography section, 
        // we can hide the external bibliography page to avoid duplication.
        if(pageEl && pageEl.style) pageEl.style.display = 'none';
      }
    }

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

    var generatedHTML = '<h1>KAYNAKÇA</h1>' + refs.map(function(ref, idx){
      var refId = String(ref && ref.id || '').trim();
      return '<p class="refe" data-ref-id="' + refId.replace(/"/g, '&quot;') + '" tabindex="0" role="button">' + formatRef(ref, { index: idx + 1 }) + '</p>';
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

  function updateTiptapBibliography(editor, refs, options){
    if(!editor || !editor.state || !editor.view) return false;

    var state = editor.state;
    var doc = state.doc;
    
    // Find "Kaynakça" heading
    var bibHeadingPos = -1;
    var titleMatcher = options.titleMatcher || function(text){
      var t = String(text || '').trim().toLowerCase();
      return t === 'kaynakça' || t === 'references' || t === 'bibliography' || t === 'kaynaklar';
    };

    doc.descendants(function(node, pos){
      if(bibHeadingPos !== -1) return false;
      if(node.type.name === 'heading'){
        var text = node.textContent.trim();
        if(titleMatcher(text)){
          bibHeadingPos = pos;
          return false;
        }
      }
    });

    if(bibHeadingPos === -1) return false;

    var bibHeadingNode = doc.nodeAt(bibHeadingPos);
    var startReplacePos = bibHeadingPos + bibHeadingNode.nodeSize;
    var currentPos = startReplacePos;
    
    // Find consecutive paragraphs with 'refe' class or that follow the heading
    while(currentPos < doc.content.size){
      var node = doc.nodeAt(currentPos);
      if(!node) break;
      if(node.type.name === 'heading') break;
      if(node.type.name === 'paragraph'){
         var cls = node.attrs && node.attrs.class ? String(node.attrs.class) : '';
         // If it's not a reference entry and has content, we assume bibliography section ends
         if(cls.indexOf('refe') === -1 && node.textContent.trim().length > 0){
             break;
         }
      } else if (node.type.name === 'bulletList' || node.type.name === 'orderedList') {
          break;
      }
      currentPos += node.nodeSize;
    }
    var endReplacePos = currentPos;

    // Generate new content
    var formatRef = options.formatRef || function(ref){ return String(ref && ref.id || ''); };
    var refHTML = refs.map(function(ref, idx){
      var refId = String(ref && ref.id || '').trim();
      return '<p class="refe" data-ref-id="' + refId.replace(/"/g, '&quot;') + '">' + formatRef(ref, { index: idx + 1 }) + '</p>';
    }).join('');

    // Optimization: check if content actually changed
    var oldContent = '';
    try {
        oldContent = editor.state.doc.textBetween(startReplacePos, endReplacePos, '\n');
    } catch(e) {}
    
    var newContentText = refs.map(function(ref, idx){ return formatRef(ref, { index: idx + 1 }); }).join('\n').replace(/<[^>]+>/g, '');
    if(oldContent.trim() === newContentText.trim() && (startReplacePos !== endReplacePos || refs.length === 0)){
        return true;
    }

    // Replace content
    editor.commands.insertContentAt({ from: startReplacePos, to: endReplacePos }, refHTML);
    return true;
  }

  function updateAQEngineBibliography(editor, refs, options){
    options = options || {};
    var docModel = editor._docModel;
    if(!docModel) return;

    var model = docModel.get();
    var blocks = (model && Array.isArray(model.blocks)) ? model.blocks : [];
    var range = findAQEngineBibliographyRange(blocks);
    var bibIdx = range.headingIndex;
    var selectionWasInBibliography = aqEngineSelectionInsideRange(editor, range, blocks);

    if(!refs.length){
      if(bibIdx !== -1 && options.keepEmptySection){
        docModel.replace(blocks.slice(0, range.start).concat([buildAQEngineEmptyBibliographyEntry()]).concat(blocks.slice(range.end)));
        if(typeof editor._reflow === 'function') editor._reflow();
        if(selectionWasInBibliography) moveAQEngineSelectionBeforeBibliography(editor, docModel.get().blocks || [], bibIdx);
      }
      return;
    }

    var formatRef = options.formatRef || function(ref){ return String(ref && ref.id || ''); };
    var generatedHTML = refs.map(function(ref, idx){
      var refId = String(ref && ref.id || '').trim();
      return '<p class="refe" data-ref-id="' + refId.replace(/"/g, '&quot;') + '">' + formatRef(ref, { index: idx + 1 }) + '</p>';
    }).join('');

    var newBlocks = [];
    if(typeof window !== 'undefined' && window.AQEngineCompat && typeof window.AQEngineCompat.htmlToBlocks === 'function'){
      newBlocks = window.AQEngineCompat.htmlToBlocks(generatedHTML);
    } else {
      newBlocks = refs.map(function(ref, idx){
        return {
          type: 'paragraph',
          attrs: { refId: String(ref && ref.id || '').trim() },
          _refId: String(ref && ref.id || '').trim(),
          runs: [{ text: formatRef(ref, { index: idx + 1 }).replace(/<[^>]+>/g, '') }]
        };
      });
    }

    newBlocks.forEach(function(b){
      if(!b.type || b.type === 'paragraph'){
        var refId = b._refId || (b.attrs && b.attrs.refId) || '';
        if(refId) b.attrs = Object.assign({}, b.attrs || {}, { refId: refId });
        if(refId) b._refId = refId;
        applyAQEngineBibliographyEntryStyle(b);
      }
    });

    var currentBibBlocks = [];
    if(bibIdx !== -1){
      currentBibBlocks = blocks.slice(range.start, range.end).filter(function(block){
        return block && block._isBibEntry;
      });
    }

    var bibChanged = currentBibBlocks.length !== newBlocks.length;
    if(!bibChanged){
      for(var j = 0; j < newBlocks.length; j++){
        var oldB = currentBibBlocks[j];
        var newB = newBlocks[j];
        var oldText = (oldB.runs || []).map(function(r){ return r.text || ''; }).join('');
        var newText = (newB.runs || []).map(function(r){ return r.text || ''; }).join('');
        var oldRef = oldB._refId || (oldB.attrs && oldB.attrs.refId) || '';
        var newRef = newB._refId || (newB.attrs && newB.attrs.refId) || '';
        if(oldText !== newText || oldRef !== newRef){ bibChanged = true; break; }
      }
    }

    if(!bibChanged) {
      if(selectionWasInBibliography) moveAQEngineSelectionBeforeBibliography(editor, blocks, bibIdx);
      return;
    }

    if(bibIdx === -1){
      var appendixRange = findAQEngineAppendixRange(blocks);
      var insertAt = appendixRange.start >= 0 ? appendixRange.start : blocks.length;
      var selection = typeof editor._captureSelection === 'function' ? editor._captureSelection() : null;
      selectionWasInBibliography = !!(selection && typeof selection.from === 'number' && selection.from >= aqEngineBlockStartOffset(blocks, insertAt));
      docModel.replace(
        blocks.slice(0, insertAt)
          .concat([buildAQEngineBibliographyHeading()])
          .concat(newBlocks)
          .concat(blocks.slice(insertAt))
      );
    } else {
      var heading = Object.assign({}, blocks[bibIdx] || buildAQEngineBibliographyHeading(), {
        type: 'heading',
        level: 1,
        pageBreak: true,
        align: 'center',
        runs: [{ text: 'KAYNAK\u00c7A', bold: true }],
        font: { sizePt: 12, weight: '700', style: 'normal' },
        firstLineIndentPx: 0,
        spaceAfterPx: 0,
        _isBibHeading: true
      });
      var head = blocks.slice(0, bibIdx).concat([heading]);
      var tail = blocks.slice(range.end);
      docModel.replace(head.concat(newBlocks).concat(tail));
    }

    if(typeof editor._reflow === 'function') editor._reflow();
    if(selectionWasInBibliography){
      var nextBlocks = docModel.get().blocks || [];
      var nextRange = findAQEngineBibliographyRange(nextBlocks);
      moveAQEngineSelectionBeforeBibliography(editor, nextBlocks, nextRange.headingIndex);
    }
  }

  function ensureAQEngineBibliographySection(editor, options){
    options = options || {};
    if(!editor || !editor._aqEngine || !editor._docModel) return false;
    var docModel = editor._docModel;
    var blocks = docModel.get().blocks || [];
    var range = findAQEngineBibliographyRange(blocks);
    if(range.headingIndex < 0){
      var appendixRange = findAQEngineAppendixRange(blocks);
      var insertAt = appendixRange.start >= 0 ? appendixRange.start : blocks.length;
      var selection = typeof editor._captureSelection === 'function' ? editor._captureSelection() : null;
      var shouldMoveSelection = !!(selection && typeof selection.from === 'number' && selection.from >= aqEngineBlockStartOffset(blocks, insertAt));
      docModel.replace(
        blocks.slice(0, insertAt)
          .concat([buildAQEngineBibliographyHeading(), buildAQEngineEmptyBibliographyEntry()])
          .concat(blocks.slice(insertAt))
      );
      if(shouldMoveSelection) {
        var nextBlocks = docModel.get().blocks || [];
        var nextRange = findAQEngineBibliographyRange(nextBlocks);
        moveAQEngineSelectionBeforeBibliography(editor, nextBlocks, nextRange.headingIndex);
      }
    }else if(range.start === range.end){
      docModel.replace(blocks.slice(0, range.start).concat([buildAQEngineEmptyBibliographyEntry()]).concat(blocks.slice(range.end)));
      if(aqEngineSelectionInsideRange(editor, range, blocks)) {
        moveAQEngineSelectionBeforeBibliography(editor, docModel.get().blocks || [], range.headingIndex);
      }
    }
    if(typeof editor._reflow === 'function') editor._reflow();
    if(typeof editor.emit === 'function') editor.emit('update');
    return true;
  }

  function getAQEngineCitationStyle(options){
    options = options || {};
    if(options.style) return options.style;
    if(options.styleId) return options.styleId;
    if(root && typeof root.getCurrentCitationStyle === 'function'){
      try{ return root.getCurrentCitationStyle(); }catch(_e){}
    }
    return 'apa7';
  }

  function canonicalAQEngineCitationText(refs, options){
    options = options || {};
    refs = Array.isArray(refs) ? refs.filter(Boolean) : [];
    if(!refs.length) return '';
    var styles = options.citationStyles || (root && root.AQCitationStyles) || null;
    var style = getAQEngineCitationStyle(options);
    if(styles && typeof styles.visibleCitationText === 'function'){
      try{
        var canonical = styles.visibleCitationText(refs, { style: style });
        if(canonical) return canonical;
      }catch(_e){}
    }
    if(styles && typeof styles.formatInlineCitation === 'function' && refs.length === 1){
      try{
        var single = styles.formatInlineCitation(refs[0], { style: style });
        if(single) return single;
      }catch(_e2){}
    }
    if(typeof options.visibleCitationText === 'function'){
      try{ return options.visibleCitationText(refs); }catch(_e3){}
    }
    return '';
  }

  function normalizeAQEngineCitations(editor, options){
    var docModel = editor._docModel;
    if(!docModel) return false;

    var findReference = options.findReference;
    var getVisibleText = options.visibleCitationText;
    
    if(!findReference && typeof window !== 'undefined' && typeof window.findRef === 'function'){
      findReference = function(id){ return window.findRef(id, (window.S && window.S.cur)); };
    }
    if(!getVisibleText && typeof window !== 'undefined'){
      if(window.AQTipTapWordCitation && typeof window.AQTipTapWordCitation.visibleCitationText === 'function'){
        getVisibleText = window.AQTipTapWordCitation.visibleCitationText;
      } else if(typeof window.visibleCitationText === 'function'){
        getVisibleText = window.visibleCitationText;
      }
    }

    if(!findReference || !getVisibleText) return false;

    var model = docModel.get();
    var changed = false;

    (model.blocks || []).forEach(function(block){
      (block.runs || []).forEach(function(run){
        if(run && run.citation && run.citation.mode !== 'textual'){
          var rid = String(run.citation.ref || run.citation.id || '').trim();
          if(!rid) return;

          var refIds = rid.split(',').map(function(id){ return id.trim(); }).filter(Boolean);
          var refs = refIds.map(findReference).filter(Boolean);
          if(!refs.length) return;

          var newText = canonicalAQEngineCitationText(refs, options) || (getVisibleText ? getVisibleText(refs) : '');
          if(newText && run.text !== newText){
            run.text = newText;
            changed = true;
          }
        }
      });
    });

    if(changed && typeof editor._reflow === 'function') editor._reflow();
    return changed;
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
    var activeEditor = resolveActiveEditor(options);

    if(activeEditor && activeEditor._aqEngine && activeEditor._docModel){
      refs = collectAQEngineUsedReferences(activeEditor, options);
      if(citationApi && typeof citationApi.renderReferenceList === 'function'){
        citationApi.renderReferenceList(listEl, refs, {
          getInlineCitationText: options.getInlineCitationText,
          formatReference: options.formatReference,
          escapeJS: options.escapeJS,
          dedupeReferences: options.dedupeReferences,
          sortReferences: options.sortReferences,
          onReferenceClick: options.onReferenceClick
        });
      }
      return refs;
    }

    if(citationApi && typeof citationApi.renderUsedReferenceList === 'function' && options.editorRoot){
      refs = citationApi.renderUsedReferenceList(options.editorRoot, listEl, {
        editor: options.editor || null,
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
      editor: options.editor || null,
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
    var activeEditor = resolveActiveEditor(options);
    if(activeEditor && !options.editor) options.editor = activeEditor;
    var isAQEngine = !!(activeEditor && activeEditor._aqEngine);
    if(isAQEngine && !options.skipCitations){
      normalizeAQEngineCitations(activeEditor, options);
    }
    if(((options.pageEl || options.bodyEl) || isAQEngine) && !options.skipBibliography){
      refs = mergeBibliographyReferences(panelRefs, options);
      updateBibliographySection({
        refs: refs,
        editor: activeEditor || null,
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
    if(!resolved.editor){
      resolved.editor = resolveActiveEditor(options);
    }
    if(!resolved.editorRoot){
      resolved.editorRoot = resolveEditorRoot(resolved);
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
    updateAQEngineBibliography: updateAQEngineBibliography,
    captureAQEngineBibliographyHTML: captureAQEngineBibliographyHTML,
    replaceAQEngineBibliographyFromHTML: replaceAQEngineBibliographyFromHTML,
    ensureAQEngineBibliographySection: ensureAQEngineBibliographySection,
    collectAQEngineUsedReferences: collectAQEngineUsedReferences,
    resolveActiveEditor: resolveActiveEditor,
    resetManualBibliography: resetManualBibliography,
    resetManualBibliographyForState: resetManualBibliographyForState,
    refreshManualBibliography: refreshManualBibliography,
    refreshManualBibliographyForState: refreshManualBibliographyForState,
    openBibliographySection: openBibliographySection,
    openBibliographySectionForState: openBibliographySectionForState,
    jumpToCitationFromBibliography: jumpToCitationFromBibliography,
    normalizeAQEngineCitations: normalizeAQEngineCitations,
    updateTiptapBibliography: updateTiptapBibliography
  };

  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQBibliographyState = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
