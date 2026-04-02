(function(){
  function noop() {}

  function qs(id){ return document.getElementById(id); }

  function getEditor(){
    if(window.AQEditorCore && typeof window.AQEditorCore.getEditor === 'function'){
      var coreEditor = window.AQEditorCore.getEditor();
      if(coreEditor) return coreEditor;
    }
    if(window.AQEditorLifecycle && typeof window.AQEditorLifecycle.ensureInitialized === 'function'){
      try{
        var ensured = window.AQEditorLifecycle.ensureInitialized();
        var surface = window.AQTipTapWordSurface || null;
        var host = surface && typeof surface.getHost === 'function' ? surface.getHost() : document.getElementById('apaed');
        if(ensured && ensured !== host) return ensured;
      }catch(e){}
    }
    if(window.AQEditorLifecycle && typeof window.AQEditorLifecycle.getEditor === 'function'){
      return window.AQEditorLifecycle.getEditor();
    }
    return window.editor || null;
  }

  function getScrollEl(){
    if(window.AQEditorCore && typeof window.AQEditorCore.getScrollSurface === 'function'){
      var surface = window.AQEditorCore.getScrollSurface();
      if(surface) return surface;
    }
    return qs('escroll');
  }

  function getTriggerBox(){
    return qs('trig');
  }

  function getTriggerInput(){
    return qs('tgs');
  }

  function getEditorHost(){
    const surface = window.AQTipTapWordSurface || null;
    return surface && typeof surface.getHost === 'function'
      ? surface.getHost()
      : qs('apaed');
  }

  function getReferenceManager(){
    return window.AQReferenceManager || null;
  }

  function normalizeCitationRefs(refs){
    var list = Array.isArray(refs) ? refs.filter(Boolean) : [];
    if(typeof window.dedupeRefs === 'function'){
      try{ list = window.dedupeRefs(list); }catch(e){}
    }
    if(typeof window.sortLib === 'function'){
      try{ list = window.sortLib(list); }catch(e){}
    }
    return list;
  }

  function getCitationLabel(refs){
    var list = normalizeCitationRefs(refs);
    if(!list.length) return '';
    if(list.length === 1 && typeof window.getInlineCitationText === 'function'){
      return window.getInlineCitationText(list[0]);
    }
    if(typeof window.visibleCitationText === 'function'){
      return window.visibleCitationText(list);
    }
    return list.map(function(ref){
      return typeof window.getInlineCitationText === 'function'
        ? window.getInlineCitationText(ref).replace(/^\(|\)$/g, '')
        : '';
    }).filter(Boolean).join('; ');
  }

  function escHTML(value){
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeLocator(rawTag){
    var tag = String(rawTag || '').trim();
    if(!tag || /^genel$/i.test(tag)) return '';
    var compact = tag.replace(/\s+/g, ' ').trim();
    if(/^(p|pp)\.\s*\d+/i.test(compact)) return compact;
    var pageMarker = compact.match(/^(s|sayfa)\.?\s*(.+)$/i);
    if(pageMarker){
      var pValue = String(pageMarker[2] || '').trim();
      if(!pValue) return '';
      return /\d+\s*[-–]\s*\d+/.test(pValue) ? ('pp. ' + pValue) : ('p. ' + pValue);
    }
    if(/^\d+\s*[-–]\s*\d+$/.test(compact)) return 'pp. ' + compact;
    if(/^\d+$/.test(compact)) return 'p. ' + compact;
    return compact;
  }

  function normalizeLocatorSafe(rawTag){
    var tag = String(rawTag || '').trim();
    if(!tag || /^genel$/i.test(tag)) return '';
    var compact = tag.replace(/\s+/g, ' ').trim();
    if(/^(p|pp)\.\s*\d+/i.test(compact)) return compact;
    var pageMarker = compact.match(/^(s|sayfa)\.?\s*(.+)$/i);
    if(pageMarker){
      var pValue = String(pageMarker[2] || '').trim();
      if(!pValue) return '';
      return /\d+\s*[\-\u2013]\s*\d+/.test(pValue) ? ('pp. ' + pValue) : ('p. ' + pValue);
    }
    if(/^\d+\s*[\-\u2013]\s*\d+$/.test(compact)) return 'pp. ' + compact;
    if(/^\d+$/.test(compact)) return 'p. ' + compact;
    return normalizeLocator(rawTag);
  }

  function stripOuterQuotes(text){
    var t = String(text || '').trim();
    if(!t) return '';
    if((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'")){
      return t.slice(1, -1).trim();
    }
    if((t[0] === '“' && t[t.length - 1] === '”') || (t[0] === '‘' && t[t.length - 1] === '’')){
      return t.slice(1, -1).trim();
    }
    return t;
  }

  function splitQuoteParagraphs(text){
    var normalized = stripOuterQuotes(String(text || '').replace(/\r\n?/g, '\n')).trim();
    if(!normalized) return [];
    var blocks = normalized.split(/\n{2,}/).map(function(part){
      return String(part || '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
    if(blocks.length) return blocks;
    return [normalized.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()].filter(Boolean);
  }

  function ensureFinalSentencePunctuation(text){
    var t = String(text || '').trim();
    if(!t) return '';
    if(/[.!?\u2026]["')\]]*$/.test(t)) return t;
    return t + '.';
  }

  function buildAPA7BlockQuoteHTML(quoteSource, refId, citationCore, locator){
    var paragraphs = splitQuoteParagraphs(quoteSource);
    if(!paragraphs.length) return '';
    var citeText = String(citationCore || '').replace(/^\(|\)$/g, '').trim() || 'Bilinmeyen, t.y.';
    if(locator) citeText += ', ' + locator;
    var safeRefId = escHTML(refId);
    var citationHTML = '<span class="cit" data-ref="' + safeRefId + '" contenteditable="false">(' + escHTML(citeText) + ')</span>';
    var lastIndex = paragraphs.length - 1;
    paragraphs[lastIndex] = ensureFinalSentencePunctuation(paragraphs[lastIndex]);
    return '<blockquote>' + paragraphs.map(function(paragraph, index){
      var firstClass = index === 0 ? ' class="ni"' : '';
      var citationTail = index === lastIndex ? (' ' + citationHTML) : '';
      return '<p' + firstClass + '>' + escHTML(paragraph) + citationTail + '</p>';
    }).join('') + '</blockquote>';
  }

  function isTypingTarget(target){
    if(!target) return false;
    if(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return true;
    if(target.isContentEditable) return true;
    if(target.closest){
      var surface = window.AQTipTapWordSurface || null;
      var editorDom = surface && typeof surface.getEditorDom === 'function' ? surface.getEditorDom() : null;
      if(editorDom && (target === editorDom || editorDom.contains(target))) return true;
      if(target.closest('[contenteditable="true"]')) return true;
    }
    return false;
  }

  function getEditorIntegration(){
    return window.AQEditorIntegration || null;
  }

  function getEditorShell(){
    return window.AQEditorShell || null;
  }

  function getAnchorRect(){
    const ed = getEditor();
    let rect = { left:24, bottom:140 };
    try{
      if(ed && ed.view){
        const sel = window.getSelection();
        if(sel && sel.rangeCount) rect = sel.getRangeAt(0).getBoundingClientRect();
        else rect = ed.view.dom.getBoundingClientRect();
      }
    }catch(e){}
    return rect;
  }

  function currentQuery(){
    const ed = getEditor();
    if(ed){
      const state = ed.state;
      if(!state) return null;
      const pos = state.selection.from;
      const txt = state.doc.textBetween(Math.max(0,pos-128),pos,' ',' ');
      const m = txt.match(/\/r(?:\s*([^\n\r]*))?$/i);
      if(!m) return null;
      return {
        query: (m[1] || '').trim(),
        full: m[0],
        from: Math.max(0,pos-m[0].length),
        to: pos
      };
    }
    const sel = window.getSelection();
    if(!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if(!node || node.nodeType !== 3) return null;
    const txt2 = node.textContent.substring(0, range.startOffset);
    const m2 = txt2.match(/\/r(?:\s*([^\n\r]*))?$/i);
    if(!m2) return null;
    return {
      query: (m2[1] || '').trim(),
      full: m2[0],
      domRange: range.cloneRange()
    };
  }

  function getResults(query){
    const q = query || '';
    try{
      const rm = getReferenceManager();
      const list = rm && typeof rm.filterReferences === 'function'
        ? rm.filterReferences(q)
        : (window.filterRefsForQuery ? window.filterRefsForQuery(window.cLib ? window.cLib() : [], q) : []);
      return list
        .filter(Boolean)
        .filter(function(ref, idx, arr){
          const key = rm && typeof rm.referenceKey === 'function'
            ? (rm.referenceKey(ref) || ('id:'+ref.id))
            : (window.refKey ? (window.refKey(ref) || ('id:'+ref.id)) : ('id:'+ref.id));
          return arr.findIndex(function(r){
            const rk = rm && typeof rm.referenceKey === 'function'
              ? (rm.referenceKey(r) || ('id:'+r.id))
              : (window.refKey ? (window.refKey(r) || ('id:'+r.id)) : ('id:'+r.id));
            return rk === key;
          }) === idx;
        });
    }catch(e){
      return [];
    }
  }

  function focusEditorWithoutScroll(){
    if(window.AQEditorCore && typeof window.AQEditorCore.focus === 'function'){
      try{ if(window.AQEditorCore.focus(false)) return; }catch(e){}
    }
    const ei = getEditorIntegration();
    if(ei && typeof ei.focusEditor === 'function'){
      try{ if(ei.focusEditor(false)) return; }catch(e){}
    }
    const ed = getEditor();
    if(ed && ed.view && ed.view.dom && typeof ed.view.dom.focus === 'function'){
      try{ ed.view.dom.focus({ preventScroll:true }); return; }catch(e){}
      try{ ed.view.dom.focus(); return; }catch(e){}
    }
    if(window.focusEditorSurface){
      try{ window.focusEditorSurface(false); }catch(e){}
    }
  }

  function releaseEditorFocus(){
    if(window.AQEditorCore && typeof window.AQEditorCore.releaseFocus === 'function'){
      try{ window.AQEditorCore.releaseFocus(); return; }catch(e){}
    }
    const ei = getEditorIntegration();
    if(ei && typeof ei.releaseFocus === 'function'){
      try{ ei.releaseFocus(); return; }catch(e){}
    }
    try{
      if(document.activeElement && typeof document.activeElement.blur === 'function'){
        document.activeElement.blur();
      }
    }catch(e){}
    try{
      if(document.body){
        if(!document.body.hasAttribute('tabindex')) document.body.setAttribute('tabindex','-1');
        document.body.focus({ preventScroll:true });
      }
    }catch(e){}
  }

  function restoreEditorInteraction(preservedTop){
    runtime.cancelScrollGuard();
    setTimeout(function(){
      focusEditorWithoutScroll();
    }, 0);
  }

  function captureEditorSelectionBookmark(){
    if(window.AQEditorCore && typeof window.AQEditorCore.captureSelection === 'function'){
      try{
        return window.AQEditorCore.captureSelection();
      }catch(e){}
    }
    return null;
  }

  function restoreEditorSelectionBookmark(bookmark){
    if(!bookmark) return false;
    if(window.AQEditorCore && typeof window.AQEditorCore.restoreSelection === 'function'){
      try{
        return !!window.AQEditorCore.restoreSelection(bookmark, { focusAtEnd:false });
      }catch(e){}
    }
    return false;
  }

  function captureEditorCaretPos(){
    var ed = getEditor();
    if(ed && ed.state && ed.state.selection){
      return ed.state.selection.from;
    }
    return null;
  }

  function getEditorDocSize(editorRef){
    var ed = editorRef || getEditor();
    if(!ed || !ed.state || !ed.state.doc || !ed.state.doc.content) return null;
    if(typeof ed.state.doc.content.size === 'number') return ed.state.doc.content.size;
    return null;
  }

  function restoreEditorCaretPos(pos){
    var ed = getEditor();
    if(!ed || !ed.state || !ed.chain) return false;
    var target = parseInt(pos, 10);
    if(!target || target < 0){
      target = ed.state.selection ? ed.state.selection.from : 1;
    }
    var maxPos = (ed.state.doc && ed.state.doc.content && typeof ed.state.doc.content.size === 'number')
      ? ed.state.doc.content.size
      : target;
    target = Math.max(1, Math.min(target, maxPos));
    try{
      ed.chain().focus().setTextSelection({ from: target, to: target }).run();
      return true;
    }catch(e){}
    try{
      ed.chain().focus().setTextSelection(target).run();
      return true;
    }catch(e){}
    return false;
  }

  function deferReferenceSectionSync(preservedTop, options){
    options = options || {};
    if(options.syncToken != null && runtime && typeof runtime.isActiveSyncCycle === 'function' && !runtime.isActiveSyncCycle(options.syncToken)){
      return false;
    }
    if(typeof preservedTop === 'number') runtime.setScrollTop(preservedTop);
    else runtime.saveScroll();
    if(window.AQEditorRuntime && typeof window.AQEditorRuntime.runContentApplyEffects === 'function'){
      window.AQEditorRuntime.runContentApplyEffects({
        normalize:false,
        layout:false,
        syncChrome:true,
        renderRefs:true,
        syncRefs:true,
        refreshTrigger:false
      });
    }else{
      if(typeof window.rRefs === 'function'){
        try{ window.rRefs(); }catch(e){}
      }
      if(typeof window.save === 'function'){
        try{ window.save(); }catch(e){}
      }
      if(typeof window.scheduleRefSectionSync === 'function'){
        try{ window.scheduleRefSectionSync(); }catch(e){}
      }
    }
    if(options.restoreFocus){
      if(runtime && typeof runtime.queueSyncTask === 'function'){
        runtime.queueSyncTask(0, options.syncToken, function(){ focusEditorWithoutScroll(); });
      }else{
        setTimeout(function(){ focusEditorWithoutScroll(); }, 0);
      }
    }
    if(options.selectionBookmark){
      if(runtime && typeof runtime.queueSyncTask === 'function'){
        runtime.queueSyncTask(0, options.syncToken, function(){ restoreEditorSelectionBookmark(options.selectionBookmark); });
      }else{
        setTimeout(function(){ restoreEditorSelectionBookmark(options.selectionBookmark); }, 0);
      }
    }
    return true;
  }

  function syncLegacyState(){
    window.trigOn = !!runtime.state.open;
    window.trigIdx = runtime.state.open ? runtime.state.activeIndex : -1;
    window.trigSelected = runtime.state.selectedIds.slice();
  }

  const runtime = {
    state: {
      open: false,
      query: '',
      selectedIds: [],
      activeIndex: 0,
      keyboardMode: 'query',
      scrollTop: 0,
      preserveScrollOnNextRefSync: false,
      lastRange: null,
      results: [],
      originalUpdateRefSection: null,
      originalScheduleRefSectionSync: null,
      scrollGuard: null,
      syncToken: 0,
      syncTimers: []
    },

    publicApi: {
      init: function(){ runtime.init(); },
      openFromSlash: function(query){ runtime.openFromSlash(query); },
      close: function(skipFocus){ runtime.close(skipFocus); },
      refreshFromEditor: function(){ runtime.refreshFromEditor(); },
      handleKeydown: function(event){ return runtime.handleKeydown(event); },
      insertSelection: function(id){ return runtime.insertSelection(id); },
      syncReferenceSection: function(){ return runtime.syncReferenceSection(); },
      insertNoteCitation: function(id){ return runtime.insertNoteCitation(id); }
    },

    saveScroll: function(){
      const ei = getEditorIntegration();
      if(ei && typeof ei.saveScroll === 'function'){
        runtime.state.scrollTop = ei.saveScroll();
        return;
      }
      const sc = getScrollEl();
      runtime.state.scrollTop = sc ? sc.scrollTop : 0;
    },

    setScrollTop: function(top){
      runtime.state.scrollTop = typeof top === 'number' ? top : runtime.state.scrollTop;
    },

    clearPendingSyncTimers: function(){
      if(!Array.isArray(runtime.state.syncTimers)) runtime.state.syncTimers = [];
      runtime.state.syncTimers.forEach(function(timerId){
        try{ clearTimeout(timerId); }catch(e){}
      });
      runtime.state.syncTimers = [];
    },

    beginSyncCycle: function(){
      runtime.clearPendingSyncTimers();
      runtime.state.syncToken = (parseInt(runtime.state.syncToken, 10) || 0) + 1;
      return runtime.state.syncToken;
    },

    isActiveSyncCycle: function(token){
      if(token == null) return true;
      return token === runtime.state.syncToken;
    },

    queueSyncTask: function(delay, token, fn){
      var ms = Math.max(0, parseInt(delay, 10) || 0);
      var timerId = null;
      timerId = setTimeout(function(){
        runtime.state.syncTimers = (runtime.state.syncTimers || []).filter(function(id){
          return id !== timerId;
        });
        if(!runtime.isActiveSyncCycle(token)) return;
        try{
          fn();
        }catch(e){}
      }, ms);
      runtime.state.syncTimers.push(timerId);
      return timerId;
    },

    cancelScrollGuard: function(){
      if(runtime.state.scrollGuard && runtime.state.scrollGuard.cleanup){
        try{ runtime.state.scrollGuard.cleanup(); }catch(e){}
      }
      runtime.state.scrollGuard = null;
    },

    restoreScroll: function(delays, token){
      const sc = getScrollEl();
      const top = runtime.state.scrollTop;
      if(!sc) return;
      if(token != null && !runtime.isActiveSyncCycle(token)) return;
      runtime.cancelScrollGuard();
      const guard = { cancelled:false, handlers:[] };
      runtime.state.scrollGuard = guard;
      const cancel = function(){
        guard.cancelled = true;
        guard.handlers.forEach(function(entry){
          try{ entry.target.removeEventListener(entry.type, entry.fn, entry.opts); }catch(e){}
        });
        guard.handlers = [];
        if(runtime.state.scrollGuard === guard) runtime.state.scrollGuard = null;
      };
      const onUserIntent = function(){ cancel(); };
      [
        [window,'wheel',true],
        [window,'pointerdown',true],
        [window,'touchstart',true],
        [window,'keydown',true]
      ].forEach(function(spec){
        var target = spec[0], type = spec[1], opts = spec[2];
        target.addEventListener(type, onUserIntent, opts);
        guard.handlers.push({ target:target, type:type, fn:onUserIntent, opts:opts });
      });
      guard.cleanup = cancel;
      const d = Array.isArray(delays) && delays.length ? delays : [0,24,80];
      d.forEach(function(ms){
        setTimeout(function(){
          if(token != null && !runtime.isActiveSyncCycle(token)){
            cancel();
            return;
          }
          if(guard.cancelled) return;
          if(Math.abs((sc.scrollTop || 0) - top) <= 1) return;
          try{ sc.scrollTop = top; }catch(e){}
        }, ms);
      });
      setTimeout(cancel, (d[d.length-1] || 0) + 120);
    },

    renderSelectionLabel: function(){
      const el = qs('tgsel');
      if(!el) return;
      if(runtime.state.selectedIds.length){
        el.textContent = runtime.state.selectedIds.length + ' seçili · Enter ekle';
        el.style.display = 'inline';
      }else{
        el.textContent = '0 seçili';
        el.style.display = 'none';
      }
      syncLegacyState();
    },

    ensureActiveItemVisible: function(){
      const list = qs('tgl');
      if(!list) return;
      const active = list.querySelector('.tgi.on');
      if(!active) return;
      const pad = 6;
      const itemTop = active.offsetTop;
      const itemBottom = itemTop + active.offsetHeight;
      const viewTop = list.scrollTop;
      const viewBottom = viewTop + list.clientHeight;
      if(itemTop < viewTop + pad){
        list.scrollTop = Math.max(0, itemTop - pad);
      }else if(itemBottom > viewBottom){
        list.scrollTop = Math.max(0, itemBottom - list.clientHeight + pad);
      }
    },

    renderList: function(){
      const list = qs('tgl');
      const hint = qs('tgq');
      const inp = getTriggerInput();
      if(hint) hint.textContent = runtime.state.query ? '"' + runtime.state.query + '"' : 'tüm kaynaklar';
      if(inp){
        inp.value = runtime.state.query;
        inp.readOnly = true;
        inp.disabled = true;
        inp.tabIndex = -1;
        inp.style.pointerEvents = 'none';
      }
      if(!list) return;
      runtime.state.results = getResults(runtime.state.query);
      if(runtime.state.activeIndex >= runtime.state.results.length){
        runtime.state.activeIndex = Math.max(0, runtime.state.results.length - 1);
      }
      if(!runtime.state.results.length){
        list.innerHTML = '<div class="tge">' + ((window.cLib && window.cLib().length) ? 'Eşleşme yok.' : 'Kütüphaneye kaynak ekleyin.') + '</div>';
        runtime.renderSelectionLabel();
        syncLegacyState();
        return;
      }
      list.innerHTML = '';
      runtime.state.results.forEach(function(ref, index){
        const div = document.createElement('div');
        const selected = runtime.state.selectedIds.indexOf(ref.id) >= 0;
        const active = index === runtime.state.activeIndex;
        const authors = Array.isArray(ref.authors) ? ref.authors : (ref.authors ? [ref.authors] : []);
        const authorLine = authors.map(function(a){ return String(a || '').trim(); }).filter(Boolean).join('; ') || 'Bilinmeyen';
        div.className = 'tgi' + (active ? ' on' : '') + (selected ? ' sel' : '');
        div.dataset.refId = ref.id;
        div.innerHTML =
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<span style="width:14px;height:14px;border:1px solid '+(selected?'var(--acc)':'var(--b)')+';border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;color:var(--acc);flex-shrink:0">' + (selected ? '✓' : '') + '</span>' +
            '<div><div class="tgia">' + authorLine + ' (' + (ref.year || 't.y.') + ')</div><div class="tgit">' + ((ref.title || '').substring(0,72)) + '</div></div>' +
          '</div>' +
          '<div class="tgic" style="padding-left:20px">→ ' + (window.getInlineCitationText ? window.getInlineCitationText(ref) : '') + '</div>';
        div.addEventListener('mousedown', function(e){
          e.preventDefault();
          e.stopPropagation();
        });
        div.addEventListener('click', function(e){
          e.preventDefault();
          e.stopPropagation();
          runtime.insertSelection(ref.id);
        });
        list.appendChild(div);
      });
      runtime.ensureActiveItemVisible();
      runtime.renderSelectionLabel();
      syncLegacyState();
    },

    openFromSlash: function(query){
      runtime.saveScroll();
      runtime.state.open = true;
      runtime.state.query = query || '';
      runtime.state.selectedIds = [];
      runtime.state.activeIndex = 0;
      runtime.state.keyboardMode = 'query';
      const box = getTriggerBox();
      let rect = getAnchorRect();
      if(box){
        const shell = getEditorShell();
        if(shell && typeof shell.positionPopup === 'function'){
          shell.positionPopup(box, rect);
        }else{
          box.style.top = Math.min(rect.bottom + 8, window.innerHeight - 320) + 'px';
          box.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - 420)) + 'px';
        }
        box.classList.add('show');
      }
      runtime.renderList();
      syncLegacyState();
      focusEditorWithoutScroll();
      runtime.restoreScroll();
    },

    repositionPopup: function(){
      if(!runtime.state.open) return;
      const box = getTriggerBox();
      if(!box) return;
      const shell = getEditorShell();
      if(shell && typeof shell.positionPopup === 'function'){
        shell.positionPopup(box, getAnchorRect());
      }
    },

    close: function(skipFocus){
      runtime.state.open = false;
      runtime.state.query = '';
      runtime.state.selectedIds = [];
      runtime.state.activeIndex = 0;
      runtime.state.keyboardMode = 'query';
      const box = getTriggerBox();
      if(box) box.classList.remove('show');
      const inp = getTriggerInput();
      if(inp){
        inp.disabled = false;
        inp.readOnly = false;
        inp.style.pointerEvents = '';
      }
      syncLegacyState();
      if(!skipFocus) focusEditorWithoutScroll();
    },

    refreshFromEditor: function(){
      const found = currentQuery();
      if(!found){
        if(runtime.state.open) runtime.close(true);
        return;
      }
      window.editorTrigRange = found.from != null ? { from: found.from, to: found.to } : null;
      if(!runtime.state.open) runtime.openFromSlash(found.query);
      else{
        runtime.state.query = found.query;
        runtime.state.keyboardMode = 'query';
        runtime.renderList();
        runtime.repositionPopup();
      }
      syncLegacyState();
    },

    toggleSelected: function(id){
      const idx = runtime.state.selectedIds.indexOf(id);
      if(idx >= 0) runtime.state.selectedIds.splice(idx, 1);
      else runtime.state.selectedIds.push(id);
      runtime.state.keyboardMode = 'navigate';
      runtime.renderList();
      syncLegacyState();
    },

    getActiveRef: function(){
      const ref = runtime.state.results[runtime.state.activeIndex];
      return ref || null;
    },

    insertHTMLWithCitationGuard: function(html, preservedTop, options){
      options = options || {};
      if(!html) return false;
      runtime.setScrollTop(typeof preservedTop === 'number' ? preservedTop : (getScrollEl() ? getScrollEl().scrollTop : 0));
      var inserted = false;
      var editorRef = getEditor();
      var sizeBefore = getEditorDocSize(editorRef);
      if(window.AQEditorCore && typeof window.AQEditorCore.restoreSelection === 'function'){
        try{ window.AQEditorCore.restoreSelection(null, { focusAtEnd:false }); }catch(e){}
      }
      if(editorRef && editorRef.chain){
        try{
          inserted = !!editorRef.chain().focus().insertContent(html, { parseOptions:{ preserveWhitespace:false } }).run();
        }catch(e){}
      }
      var sizeAfter = getEditorDocSize(editorRef);
      if(inserted && sizeBefore != null && sizeAfter != null && sizeAfter <= sizeBefore){
        inserted = false;
      }
      if(!inserted && editorRef && editorRef.chain){
        try{
          inserted = !!editorRef.chain().focus('end').insertContent(html, { parseOptions:{ preserveWhitespace:false } }).run();
        }catch(e){}
      }
      if(!inserted && editorRef && editorRef.commands && typeof editorRef.commands.insertContent === 'function'){
        try{
          editorRef.commands.insertContent(html, { parseOptions:{ preserveWhitespace:false } });
          sizeAfter = getEditorDocSize(editorRef);
          inserted = !(sizeBefore != null && sizeAfter != null && sizeAfter <= sizeBefore);
        }catch(e){}
      }
      if(!inserted && window.iHTML){
        try{
          window.iHTML(html);
          inserted = true;
        }catch(e){}
      }
      if(!inserted){
        return false;
      }
      var bookmark = captureEditorSelectionBookmark();
      var caretPos = captureEditorCaretPos();
      if(window.cleanupSlashRArtifacts) window.cleanupSlashRArtifacts();
      if(options.forceAuto){
        var syncToken = runtime.beginSyncCycle();
        [0, 90, 220].forEach(function(ms, index){
          runtime.queueSyncTask(ms, syncToken, function(){
            if(typeof window.rRefs === 'function'){
              try{ window.rRefs(); }catch(e){}
            }
            runtime.syncReferenceSection(runtime.state.scrollTop, {
              restoreFocus: index === 0,
              restoreScroll: options.restoreScroll !== false && index === 0,
              forceAuto: true,
              selectionBookmark: bookmark,
              caretPos: caretPos,
              syncToken: syncToken
            });
          });
        });
      }else{
        var deferredSyncToken = runtime.beginSyncCycle();
        deferReferenceSectionSync(runtime.state.scrollTop, {
          restoreFocus:true,
          restoreScroll: options.restoreScroll !== false,
          selectionBookmark: bookmark,
          syncToken: deferredSyncToken
        });
      }
      restoreEditorInteraction();
      return true;
    },

    insertSelection: function(forcedId){
      const ids = forcedId ? [forcedId] : (runtime.state.selectedIds.length ? runtime.state.selectedIds.slice() : []);
      const finalIds = ids.length ? ids : (runtime.getActiveRef() ? [runtime.getActiveRef().id] : []);
      if(!finalIds.length) return;
      const preservedTop = getScrollEl() ? getScrollEl().scrollTop : runtime.state.scrollTop;
      runtime.setScrollTop(preservedTop);
      const refs = normalizeCitationRefs(finalIds.map(function(id){
        const rm = getReferenceManager();
        if(rm && typeof rm.findReference === 'function') return rm.findReference(id, window.S && window.S.cur);
        if(window.findRef) return window.findRef(id, window.S && window.S.cur);
        return null;
      }).filter(Boolean));
      if(!refs.length) return;
      if(window.buildCitationHTML){
        const html = window.buildCitationHTML(refs);
        const ed = getEditor();
        if(ed && ed.chain){
          const chain = ed.chain();
          const trigRange = window.editorTrigRange;
          let fallbackRange = null;
          if((!trigRange || trigRange.from == null || trigRange.to == null) && ed.state && ed.state.selection){
            const pos = ed.state.selection.from;
            const txt = ed.state.doc.textBetween(Math.max(0, pos - 128), pos, ' ', ' ');
            const m = txt.match(/\/r(?:\s*([^\n\r]*))?$/i);
            if(m){
              fallbackRange = {
                from: Math.max(0, pos - m[0].length),
                to: pos
              };
            }
          }
          const delRange = (trigRange && trigRange.from >= 0 && trigRange.to >= trigRange.from) ? trigRange : fallbackRange;
          if(delRange && delRange.from >= 0 && delRange.to >= delRange.from){
            chain.deleteRange({ from: delRange.from, to: delRange.to });
          }
          chain.insertContent(html, { parseOptions:{ preserveWhitespace:false } }).run();
          window.editorTrigRange = null;
        }else{
          const ei = getEditorIntegration();
          if(ei && typeof ei.insertHTML === 'function'){
            ei.insertHTML(html);
          }
        }
      }
      const caretPos = captureEditorCaretPos();
      const bookmark = captureEditorSelectionBookmark();
      const syncToken = runtime.beginSyncCycle();
      runtime.close(true);
      window.__aqCitationSyncInProgress = true;
      setTimeout(function(){ window.__aqCitationSyncInProgress = false; }, 900);
      if(window.AQEditorRuntime && typeof window.AQEditorRuntime.runContentApplyEffects === 'function'){
        window.AQEditorRuntime.runContentApplyEffects({
          normalize:false,
          layout:false,
          syncChrome:true,
          renderRefs:true,
          syncRefs:false,
          refreshTrigger:false
        });
      }else{
        if(typeof window.rRefs === 'function'){
          try{ window.rRefs(); }catch(e){}
        }
        if(typeof window.save === 'function'){
          try{ window.save(); }catch(e){}
        }
      }
      [0, 90, 220].forEach(function(ms, index){
        runtime.queueSyncTask(ms, syncToken, function(){
          if(typeof window.rRefs === 'function'){
            try{ window.rRefs(); }catch(e){}
          }
          runtime.syncReferenceSection(preservedTop, {
            restoreScroll:index === 0,
            restoreFocus:false,
            forceAuto:true,
            caretPos: caretPos,
            selectionBookmark: bookmark,
            syncToken: syncToken
          });
          restoreEditorCaretPos(caretPos);
          restoreEditorSelectionBookmark(bookmark);
        });
      });
    },

    insertNoteCitation: function(noteId){
      const notes = window.S && Array.isArray(window.S.notes) ? window.S.notes : [];
      const note = notes.find(function(x){ return x && x.id == noteId; });
      if(!note) return false;
      const rm = getReferenceManager();
      const ref = rm && typeof rm.findReference === 'function'
        ? rm.findReference(note.rid, window.S && window.S.cur)
        : (window.findRef ? window.findRef(note.rid, window.S && window.S.cur) : null);
      if(!ref) return false;
      let html = '';
      const quoteSource = String(note.q || note.txt || '').trim();
      if(quoteSource){
        const citeRaw = rm && typeof rm.getInlineCitation === 'function'
          ? rm.getInlineCitation(ref)
          : (window.getInlineCitationText ? window.getInlineCitationText(ref) : '');
        const citeText = String(citeRaw || '').replace(/^\(|\)$/g,'') || 'Bilinmeyen, t.y.';
        const locator = normalizeLocatorSafe(note.tag);
        html = buildAPA7BlockQuoteHTML(quoteSource, ref.id, citeText, locator);
      }else if(window.buildCitationHTML){
        html = window.buildCitationHTML([ref]);
      }else{
        return false;
      }
      return runtime.insertHTMLWithCitationGuard(
        html,
        getScrollEl() ? getScrollEl().scrollTop : runtime.state.scrollTop,
        { restoreScroll:false, forceAuto:true }
      );
    },

    syncReferenceSection: function(preservedTop, options){
      options = options || {};
      if(options.syncToken != null && !runtime.isActiveSyncCycle(options.syncToken)){
        return false;
      }
      var bookmark = options.selectionBookmark || captureEditorSelectionBookmark();
      var caretPos = options.caretPos != null ? options.caretPos : captureEditorCaretPos();
      if(typeof preservedTop === 'number') runtime.setScrollTop(preservedTop);
      else runtime.saveScroll();
      runtime.state.preserveScrollOnNextRefSync = options.restoreScroll !== false;
      if(typeof window.rRefs === 'function'){
        try{ window.rRefs(); }catch(e){}
      }
      if(typeof window.updateRefSection === 'function'){
        try{ window.updateRefSection(!!options.forceAuto); }catch(e){}
      }else{
        runtime.state.preserveScrollOnNextRefSync = false;
      }
      if(bookmark){
        [0, 24, 96].forEach(function(ms){
          runtime.queueSyncTask(ms, options.syncToken, function(){
            restoreEditorCaretPos(caretPos);
            restoreEditorSelectionBookmark(bookmark);
          });
        });
      }
      if(options.restoreScroll !== false){
        runtime.restoreScroll([0,24], options.syncToken);
      }
      if(options.restoreFocus){
        [0, 24, 96].forEach(function(ms){
          runtime.queueSyncTask(ms, options.syncToken, function(){
            restoreEditorCaretPos(caretPos);
          });
        });
      }
      return true;
    },

    installReferenceSyncGuard: function(){
      if(runtime.state.originalUpdateRefSection || typeof window.updateRefSection !== 'function') return;
      runtime.state.originalUpdateRefSection = window.updateRefSection;
      window.updateRefSection = function(){
        const shouldRestore = !!runtime.state.preserveScrollOnNextRefSync;
        const sc = getScrollEl();
        const top = shouldRestore
          ? (typeof runtime.state.scrollTop === 'number' ? runtime.state.scrollTop : (sc ? sc.scrollTop : 0))
          : null;
        try{
          return runtime.state.originalUpdateRefSection.apply(this, arguments);
        }finally{
          if(shouldRestore){
            runtime.state.preserveScrollOnNextRefSync = false;
            runtime.state.scrollTop = top;
            runtime.restoreScroll([0,24]);
          }
        }
      };
    },

    installDeferredReferenceSyncGuard: function(){
      if(runtime.state.originalScheduleRefSectionSync || typeof window.scheduleRefSectionSync !== 'function') return;
      runtime.state.originalScheduleRefSectionSync = window.scheduleRefSectionSync;
      window.scheduleRefSectionSync = function(){
        if(typeof window.rRefs === 'function'){
          try{ window.rRefs(); }catch(e){}
        }
        try{
          return runtime.state.originalScheduleRefSectionSync.apply(this, arguments);
        }catch(e){}
      };
    },

    handleKeydown: function(event){
      if(!runtime.state.open) return false;
      if(event.ctrlKey || event.metaKey || event.altKey) return false;
      const key = event.key;
      const isSpace = key === ' ' || event.code === 'Space' || key === 'Spacebar' || event.keyCode === 32 || event.which === 32;
      if(key === 'ArrowDown'){
        runtime.state.keyboardMode = 'navigate';
        runtime.state.activeIndex = Math.min(runtime.state.activeIndex + 1, Math.max(0, runtime.state.results.length - 1));
        runtime.renderList();
      }else if(key === 'ArrowUp'){
        runtime.state.keyboardMode = 'navigate';
        runtime.state.activeIndex = Math.max(runtime.state.activeIndex - 1, 0);
        runtime.renderList();
      }else if(isSpace){
        if(runtime.state.keyboardMode !== 'navigate' && isTypingTarget(event.target)) return false;
        const active = runtime.getActiveRef();
        if(active) runtime.toggleSelected(active.id);
      }else if(key === 'Enter'){
        runtime.insertSelection();
      }else if(key === 'Escape'){
        runtime.close(true);
      }else{
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      if(typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      return true;
    },

    init: function(){
      runtime.installReferenceSyncGuard();
      runtime.installDeferredReferenceSyncGuard();
      window.__aqCitationRuntimeV1 = true;
      window.openTrig = function(q){ runtime.openFromSlash(q); };
      window.renderTrig = function(q){
        runtime.state.query = q || '';
        runtime.renderList();
      };
      window.filterTrig = function(q){
        runtime.state.query = q || '';
        runtime.renderList();
      };
      window.checkTrig = function(){ runtime.refreshFromEditor(); };
      window.closeTrig = function(){ runtime.close(); };
      window.doTrigRef = function(){
        runtime.saveScroll();
        if(getEditor()){
          if(window.ensureEditableRoot) window.ensureEditableRoot();
          getEditor().chain().focus().insertContent('/r').run();
        }else{
          if(window.focusEditorSurface) window.focusEditorSurface(true);
          document.execCommand('insertText', false, '/r');
        }
        setTimeout(function(){
          runtime.restoreScroll();
          var ed = getEditor();
          if(ed && ed.state && ed.state.selection){
            var pos = ed.state.selection.from;
            window.editorTrigRange = { from: Math.max(0, pos - 2), to: pos };
            runtime.openFromSlash('');
          }else{
            runtime.refreshFromEditor();
          }
        },0);
      };
      window.insertCitation = function(id){ runtime.insertSelection(id); };
      window.insCiteNote = function(id){ return runtime.insertNoteCitation(id); };
      syncLegacyState();

      const box = getTriggerBox();
      if(box){
        box.addEventListener('mousedown', function(e){ e.stopPropagation(); }, true);
        box.addEventListener('click', function(e){ e.stopPropagation(); }, true);
      }
      const inp = getTriggerInput();
      if(inp){
        inp.readOnly = true;
        inp.disabled = true;
        inp.tabIndex = -1;
        ['keydown','keyup','input','mousedown','click'].forEach(function(type){
          inp.addEventListener(type, function(e){
            e.stopPropagation();
            if(typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
          }, true);
        });
      }
      const sc = getScrollEl();
      if(sc){
        sc.addEventListener('wheel', function(){
          runtime.cancelScrollGuard();
        }, { passive:true });
        sc.addEventListener('touchmove', function(){
          runtime.cancelScrollGuard();
        }, { passive:true });
        sc.addEventListener('scroll', function(){
          runtime.cancelScrollGuard();
          if(runtime.state.open) runtime.repositionPopup();
        }, { passive:true });
      }
      window.addEventListener('resize', function(){
        if(runtime.state.open) runtime.repositionPopup();
      });
      document.addEventListener('mousedown', function(event){
        if(!runtime.state.open) return;
        const box = getTriggerBox();
        const host = getEditorHost();
        const target = event.target;
        if(box && target && box.contains(target)) return;
        if(host && target && host.contains(target)) return;
        runtime.close(true);
      });

      window.addEventListener('keydown', function(event){
        runtime.handleKeydown(event);
      }, true);
      window.addEventListener('keyup', function(event){
        if(!runtime.state.open) return;
        const key = event.key;
        const isSpace = key === ' ' || event.code === 'Space' || key === 'Spacebar' || event.keyCode === 32 || event.which === 32;
        if(isSpace || key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === 'Escape'){
          event.preventDefault();
          event.stopPropagation();
          if(typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        }
      }, true);
    }
  };

  window.AQCitationRuntime = runtime.publicApi;
})();
