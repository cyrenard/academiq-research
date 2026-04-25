(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordFind = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  var state = {
    timer: null
  };

  function debugLog(event, meta){
    try{
      var scope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
      if(!scope || !scope.AQ_DEBUG_FIND) return;
      if(typeof console !== 'undefined' && console && typeof console.info === 'function'){
        console.info('[aq-find]', event, meta || {});
      }
    }catch(_e){}
  }

  function getElements(doc){
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if(!doc) return {};
    return {
      bar: doc.getElementById('findbar'),
      findInput: doc.getElementById('findinp'),
      replaceInput: doc.getElementById('replaceinp'),
      count: doc.getElementById('findcount')
    };
  }

  function toggleBar(options){
    options = options || {};
    var els = getElements(options.doc);
    if(!els.bar) return false;
    if(els.bar.style.display === 'none'){
      els.bar.style.display = 'block';
      if(els.findInput){
        if(typeof els.findInput.focus === 'function') els.findInput.focus();
        if(typeof els.findInput.select === 'function') els.findInput.select();
      }
      if(typeof options.onOpened === 'function') options.onOpened(els);
      return true;
    }
    if(typeof options.onClose === 'function') options.onClose(els);
    return false;
  }

  function closeBar(options){
    options = options || {};
    var els = getElements(options.doc);
    if(!els.bar) return false;
    els.bar.style.display = 'none';
    if(typeof options.clearHighlights === 'function') options.clearHighlights();
    if(typeof options.onClosed === 'function') options.onClosed(els);
    if(els.count) els.count.textContent = '--';
    return true;
  }

  function resetSearchState(searchState){
    searchState = searchState || {};
    searchState.matches = [];
    searchState.index = -1;
    searchState.editorRanges = [];
    return searchState;
  }

  function clearHighlights(options){
    options = options || {};
    clearEditorVisualHighlight(options.doc || null);
    clearEditorVisualOverlay(options.doc || null);
    var host = options.host || null;
    if(!host || typeof host.querySelectorAll !== 'function') return false;
    host.querySelectorAll('.find-hl').forEach(function(mark){
      var parent = mark.parentNode;
      if(!parent) return;
      while(mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      if(typeof parent.normalize === 'function') parent.normalize();
    });
    return true;
  }

  function isSearchableTextNode(node){
    if(!node || typeof node.textContent !== 'string' || !node.textContent) return false;
    var parent = node.parentElement || node.parentNode || null;
    if(!parent || !parent.classList) return true;
    if(parent.classList.contains('pg-spacer') || parent.classList.contains('find-hl')) return false;
    return true;
  }

  function collectTextSegments(options){
    options = options || {};
    var doc = options.doc || (typeof document !== 'undefined' ? document : null);
    var host = options.host || null;
    if(!doc || !host || typeof doc.createTreeWalker !== 'function') return [];
    var walker = doc.createTreeWalker(host, (options.nodeFilterShowText || (typeof NodeFilter !== 'undefined' ? NodeFilter.SHOW_TEXT : 4)), null, false);
    var segments = [];
    var offset = 0;
    while(walker.nextNode()){
      var node = walker.currentNode;
      if(!isSearchableTextNode(node)) continue;
      var text = String(node.textContent || '');
      if(!text) continue;
      segments.push({
        node: node,
        text: text,
        start: offset,
        end: offset + text.length
      });
      offset += text.length;
    }
    return segments;
  }

  function collectEditorTextSegments(editor){
    var segments = [];
    var offset = 0;
    if(!editor || !editor.state || !editor.state.doc || typeof editor.state.doc.descendants !== 'function'){
      return segments;
    }
    editor.state.doc.descendants(function(node, pos){
      if(!node || !node.isText || typeof node.text !== 'string' || !node.text) return;
      var text = String(node.text || '');
      segments.push({
        text: text,
        start: offset,
        end: offset + text.length,
        from: pos,
        to: pos + text.length
      });
      offset += text.length;
    });
    return segments;
  }

  function buildEditorSearchBuffer(editor){
    var text = '';
    var positions = [];
    var lastTo = null;
    if(!editor || !editor.state || !editor.state.doc || typeof editor.state.doc.descendants !== 'function'){
      return { text: text, positions: positions };
    }
    editor.state.doc.descendants(function(node, pos){
      if(!node || !node.isText || typeof node.text !== 'string' || !node.text) return;
      if(lastTo != null && typeof pos === 'number' && pos > lastTo){
        text += '\n';
        positions.push(null);
      }
      var nodeText = String(node.text || '');
      for(var i = 0; i < nodeText.length; i++){
        text += nodeText.charAt(i);
        positions.push(pos + i);
      }
      lastTo = pos + nodeText.length;
    });
    return { text: text, positions: positions };
  }

  function buildSearchText(segments){
    return (Array.isArray(segments) ? segments : []).map(function(segment){
      return segment && typeof segment.text === 'string' ? segment.text : '';
    }).join('');
  }

  function findMatchesInText(text, re){
    var matches = [];
    if(!text || !re) return matches;
    re.lastIndex = 0;
    var match;
    while((match = re.exec(text)) !== null){
      if(!match[0] || match[0].length === 0){
        re.lastIndex++;
        continue;
      }
      matches.push({
        start: match.index,
        end: match.index + match[0].length
      });
    }
    return matches;
  }

  function locateSegmentPosition(segments, absoluteOffset){
    var list = Array.isArray(segments) ? segments : [];
    for(var i = 0; i < list.length; i++){
      var segment = list[i];
      if(!segment) continue;
      if(absoluteOffset < segment.end){
        return {
          node: segment.node,
          offset: Math.max(0, absoluteOffset - segment.start)
        };
      }
    }
    if(!list.length) return null;
    var last = list[list.length - 1];
    return {
      node: last.node,
      offset: String(last.text || '').length
    };
  }

  function createRangeFromMatch(doc, segments, match){
    if(!doc || typeof doc.createRange !== 'function' || !match) return null;
    var start = locateSegmentPosition(segments, match.start);
    var end = locateSegmentPosition(segments, Math.max(match.start, match.end - 1));
    if(!start || !end || !start.node || !end.node) return null;
    var range = doc.createRange();
    try{
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset + 1);
      return range;
    }catch(_e){
      return null;
    }
  }

  function createEditorRangeFromMatch(segments, match){
    if(!match) return null;
    var start = locateSegmentPosition(segments, match.start);
    var end = locateSegmentPosition(segments, Math.max(match.start, match.end - 1));
    if(!start || !end || !start.node || !end.node) return null;
    var startOffset = Math.max(0, match.start - start.node.start);
    var endOffset = Math.max(0, Math.max(match.start, match.end - 1) - end.node.start);
    var from = start.node.from + startOffset;
    var to = end.node.from + endOffset + 1;
    if(typeof from !== 'number' || typeof to !== 'number' || to < from) return null;
    return { from: from, to: to };
  }

  function buildEditorSearchRanges(editor, query, useRegex, caseSensitive){
    if(!editor || !query) return [];
    var buffer = buildEditorSearchBuffer(editor);
    if(!buffer || !buffer.text) return [];
    var re;
    try{
      re = buildSearchRegExp(query, useRegex, caseSensitive);
    }catch(_e){
      return [];
    }
    if(!re) return [];
    return findMatchesInText(buffer.text, re).map(function(match){
      var startIndex = match.start;
      var endIndex = Math.max(match.start, match.end - 1);
      var from = buffer.positions[startIndex];
      var toBase = buffer.positions[endIndex];
      if(from == null || toBase == null) return null;
      var to = toBase + 1;
      if(typeof from !== 'number' || typeof to !== 'number' || to < from) return null;
      return { from: from, to: to };
    }).filter(Boolean);
  }

  function clearEditorVisualHighlight(doc){
    var targetDoc = doc || (typeof document !== 'undefined' ? document : null);
    try{
      if(targetDoc && targetDoc.defaultView && targetDoc.defaultView.CSS && targetDoc.defaultView.CSS.highlights){
        targetDoc.defaultView.CSS.highlights.delete('aq-find-active');
      }else if(typeof CSS !== 'undefined' && CSS && CSS.highlights){
        CSS.highlights.delete('aq-find-active');
      }
    }catch(_e){}
  }

  function clearEditorVisualOverlay(doc){
    var targetDoc = doc || (typeof document !== 'undefined' ? document : null);
    if(!targetDoc || typeof targetDoc.getElementById !== 'function') return;
    var overlay = targetDoc.getElementById('aq-find-active-overlay');
    if(overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  function resolveDomPoint(view, pos, bias){
    if(!view || typeof view.domAtPos !== 'function' || typeof pos !== 'number') return null;
    try{
      var resolved = view.domAtPos(pos, bias || 0);
      if(!resolved || !resolved.node) return null;
      if(resolved.node.nodeType === 3){
        return { node: resolved.node, offset: resolved.offset };
      }
      var childIndex = resolved.offset;
      if((bias || 0) < 0) childIndex = Math.max(0, resolved.offset - 1);
      var child = resolved.node.childNodes && resolved.node.childNodes[childIndex] ? resolved.node.childNodes[childIndex] : null;
      while(child && child.nodeType !== 3){
        child = ((bias || 0) < 0) ? child.lastChild : child.firstChild;
      }
      if(child && child.nodeType === 3){
        return {
          node: child,
          offset: ((bias || 0) < 0) ? String(child.textContent || '').length : 0
        };
      }
    }catch(_e){}
    return null;
  }

  function applyEditorVisualHighlight(editor, range){
    if(!editor || !editor.view || !range) return false;
    var view = editor.view;
    var doc = view.dom && view.dom.ownerDocument ? view.dom.ownerDocument : (typeof document !== 'undefined' ? document : null);
    clearEditorVisualHighlight(doc);
    try{
      var win = doc && doc.defaultView ? doc.defaultView : null;
      var HighlightCtor = win && typeof win.Highlight === 'function'
        ? win.Highlight
        : (typeof Highlight === 'function' ? Highlight : null);
      var cssHighlights = win && win.CSS && win.CSS.highlights
        ? win.CSS.highlights
        : (typeof CSS !== 'undefined' && CSS ? CSS.highlights : null);
      if(!HighlightCtor || !cssHighlights || !doc || typeof doc.createRange !== 'function') return false;
      var start = resolveDomPoint(view, range.from, 1);
      var end = resolveDomPoint(view, range.to, -1);
      if(!start || !end) return false;
      var domRange = doc.createRange();
      domRange.setStart(start.node, start.offset);
      domRange.setEnd(end.node, end.offset);
      cssHighlights.set('aq-find-active', new HighlightCtor(domRange));
      return true;
    }catch(_e){
      return false;
    }
  }

  function applyEditorVisualOverlay(editor, range){
    if(!editor || !editor.view || !range || typeof range.from !== 'number' || typeof range.to !== 'number') return false;
    var view = editor.view;
    if(typeof view.coordsAtPos !== 'function') return false;
    var doc = view.dom && view.dom.ownerDocument ? view.dom.ownerDocument : (typeof document !== 'undefined' ? document : null);
    if(!doc) return false;
    clearEditorVisualOverlay(doc);
    try{
      var start = view.coordsAtPos(range.from);
      var end = view.coordsAtPos(Math.max(range.from + 1, range.to));
      if(!start || !end) return false;
      var host = doc.getElementById('aq-tiptap-content') || view.dom.parentNode || view.dom;
      if(!host || typeof host.getBoundingClientRect !== 'function') return false;
      var hostRect = host.getBoundingClientRect();
      var overlay = doc.createElement('div');
      overlay.id = 'aq-find-active-overlay';
      overlay.style.position = 'absolute';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '6';
      overlay.style.borderRadius = '4px';
      overlay.style.background = 'rgba(255,214,10,.34)';
      overlay.style.boxShadow = '0 0 0 1px rgba(201,154,0,.28)';
      overlay.style.top = Math.max(0, start.top - hostRect.top) + 'px';
      overlay.style.left = Math.max(0, start.left - hostRect.left) + 'px';
      overlay.style.height = Math.max(16, start.bottom - start.top) + 'px';
      overlay.style.width = Math.max(18, end.left - start.left) + 'px';
      host.appendChild(overlay);
      return true;
    }catch(_e){
      return false;
    }
  }

  function wrapRangeWithMark(doc, range){
    if(!doc || !range) return null;
    var mark = doc.createElement('mark');
    mark.className = 'find-hl';
    try{
      var fragment = range.extractContents();
      if(!fragment || !fragment.childNodes || fragment.childNodes.length === 0) return null;
      mark.appendChild(fragment);
      range.insertNode(mark);
      return mark;
    }catch(_e){
      return null;
    }
  }

  function replaceEditorRanges(editor, ranges, replacement){
    if(!editor || !editor.view || !editor.state || !editor.state.tr || !Array.isArray(ranges) || !ranges.length){
      debugLog('replaceEditorRanges.skip', {
        hasEditor: !!editor,
        hasView: !!(editor && editor.view),
        rangeCount: Array.isArray(ranges) ? ranges.length : 0
      });
      return false;
    }
    try{
      var tr = editor.state.tr;
      var sorted = ranges.slice().sort(function(a, b){ return b.from - a.from; });
      sorted.forEach(function(range){
        if(!range || typeof range.from !== 'number' || typeof range.to !== 'number' || range.to < range.from) return;
        tr = tr.insertText(String(replacement || ''), range.from, range.to);
      });
      if(!tr.docChanged){
        debugLog('replaceEditorRanges.noChange', { rangeCount: sorted.length, replacement: replacement });
        return false;
      }
      editor.view.dispatch(tr.scrollIntoView());
      debugLog('replaceEditorRanges.dispatched', { rangeCount: sorted.length, replacement: replacement });
      return true;
    }catch(_e){
      debugLog('replaceEditorRanges.error', { message: _e && _e.message ? _e.message : String(_e) });
      return false;
    }
  }

  function syncEditorFromHost(editor, host){
    if(!editor || !editor.commands || typeof editor.commands.setContent !== 'function' || !host) return false;
    try{
      editor.commands.setContent(String(host.innerHTML || '<p></p>'), false);
      return true;
    }catch(_e){
      return false;
    }
  }

  function findBoundaryTextNode(root, fromEnd){
    if(!root) return null;
    var doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if(!doc || typeof doc.createTreeWalker !== 'function') return null;
    var walker = doc.createTreeWalker(root, (typeof NodeFilter !== 'undefined' ? NodeFilter.SHOW_TEXT : 4), null, false);
    var nodes = [];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    if(!nodes.length) return null;
    return fromEnd ? nodes[nodes.length - 1] : nodes[0];
  }

  function resolveEditorRangeFromMark(mark, editor){
    if(mark && mark.__aqEditorRange && typeof mark.__aqEditorRange.from === 'number' && typeof mark.__aqEditorRange.to === 'number'){
      return {
        from: mark.__aqEditorRange.from,
        to: mark.__aqEditorRange.to
      };
    }
    if(!mark || !editor || !editor.view || typeof editor.view.posAtDOM !== 'function') return null;
    var firstText = findBoundaryTextNode(mark, false);
    var lastText = findBoundaryTextNode(mark, true);
    if(!firstText || !lastText) return null;
    try{
      var from = editor.view.posAtDOM(firstText, 0);
      var to = editor.view.posAtDOM(lastText, String(lastText.textContent || '').length);
      if(typeof from !== 'number' || typeof to !== 'number' || to < from) return null;
      return { from: from, to: to };
    }catch(_e){
      return null;
    }
  }

  function highlightActive(options){
    options = options || {};
    var searchState = options.state || { matches:[], index:-1 };
    var matches = Array.isArray(searchState.matches) ? searchState.matches : [];
    var index = parseInt(searchState.index, 10);
    var editor = options.editor || searchState.editor || null;
    var countEl = options.countEl || null;
    var focusEditor = options.focusEditor !== false;
    var shouldScroll = options.scrollIntoView !== false;
    var shouldSelect = options.selectRange !== false;
    matches.forEach(function(mark, i){
      if(mark && typeof mark.className === 'string'){
        mark.className = i === index ? 'find-hl find-hl-active' : 'find-hl';
      }
    });
    var activeRange = Array.isArray(searchState.editorRanges) ? searchState.editorRanges[index] : null;
    if(activeRange && editor){
      applyEditorVisualHighlight(editor, activeRange);
      applyEditorVisualOverlay(editor, activeRange);
      if(focusEditor && editor.chain){
        try{
          editor.chain().focus().setTextSelection({ from:activeRange.from, to:activeRange.to }).run();
        }catch(_e){
          try{ editor.commands.setTextSelection(activeRange); }catch(_e2){}
        }
      }else if(shouldSelect && editor.view && editor.state && editor.state.selection && editor.state.tr){
        try{
          var SelectionCtor = editor.state.selection.constructor;
          var nextSelection = SelectionCtor && typeof SelectionCtor.create === 'function'
            ? SelectionCtor.create(editor.state.doc, activeRange.from, activeRange.to)
            : null;
          if(nextSelection){
            editor.view.dispatch(editor.state.tr.setSelection(nextSelection).scrollIntoView());
          }
        }catch(_e3){}
      }
    }
    if(shouldScroll && matches[index] && typeof matches[index].scrollIntoView === 'function'){
      matches[index].scrollIntoView({ behavior:'smooth', block:'center' });
    }
    if(countEl) countEl.textContent = matches.length ? (index + 1) + '/' + matches.length : '--';
    return matches.length > 0;
  }

  function executeSearch(options){
    options = options || {};
    var doc = options.doc || (typeof document !== 'undefined' ? document : null);
    var host = options.host || (doc ? doc.getElementById('apaed') : null);
    var countEl = options.countEl || (doc ? doc.getElementById('findcount') : null);
    var searchState = options.state || { matches:[], index:-1 };
    var editor = options.editor || null;
    var query = options.query != null ? String(options.query) : String((doc && doc.getElementById('findinp') || {}).value || '');
    var useRegex = options.useRegex != null ? !!options.useRegex : !!((doc && doc.getElementById('findregex') || {}).checked);
    var caseSensitive = options.caseSensitive != null ? !!options.caseSensitive : !!((doc && doc.getElementById('findcase') || {}).checked);
    clearHighlights({ host: host });
    resetSearchState(searchState);
    searchState.editor = editor || null;
    if(!query){
      if(countEl) countEl.textContent = '--';
      return [];
    }
    var re;
    try{
      re = buildSearchRegExp(query, useRegex, caseSensitive);
    }catch(e){
      if(countEl) countEl.textContent = 'Hata';
      return [];
    }
    if(editor && editor.state && editor.state.doc && typeof editor.state.doc.descendants === 'function'){
      searchState.editorRanges = buildEditorSearchRanges(editor, query, useRegex, caseSensitive);
      searchState.matches = searchState.editorRanges.map(function(range){
        return {
          __aqEditorRange: range
        };
      });
      if(countEl) countEl.textContent = searchState.matches.length ? searchState.matches.length + ' sonuc' : 'Yok';
      if(searchState.matches.length){
        searchState.index = 0;
        highlightActive({
          state: searchState,
          countEl: countEl,
          editor: editor,
          focusEditor: false,
          scrollIntoView: true,
          selectRange: true
        });
      }
      return searchState.matches;
    }
    if(!re || !doc || !host || typeof doc.createTreeWalker !== 'function'){
      if(countEl) countEl.textContent = 'Yok';
      return [];
    }
    var segments = collectTextSegments({
      doc: doc,
      host: host,
      nodeFilterShowText: options.nodeFilterShowText
    });
    var text = buildSearchText(segments);
    var matches = findMatchesInText(text, re);
    for(var i = matches.length - 1; i >= 0; i--){
      var matchMeta = matches[i];
      var editorRange = Array.isArray(searchState.editorRanges) ? (searchState.editorRanges[i] || null) : null;
      var range = createRangeFromMatch(doc, segments, matchMeta);
      var mark = wrapRangeWithMark(doc, range);
      if(mark){
        if(editorRange) mark.__aqEditorRange = editorRange;
        searchState.matches.unshift(mark);
      }
    }
    if(countEl) countEl.textContent = searchState.matches.length ? searchState.matches.length + ' sonuç' : 'Yok';
    if(searchState.matches.length){
      searchState.index = 0;
      highlightActive({ state: searchState, countEl: countEl });
    }
    return searchState.matches;
  }

  function findNext(options){
    options = options || {};
    var searchState = options.state || { matches:[], index:-1 };
    if(!searchState.matches || !searchState.matches.length) return false;
    searchState.index = (searchState.index + 1) % searchState.matches.length;
    return highlightActive({ state: searchState, countEl: options.countEl || null });
  }

  function findPrev(options){
    options = options || {};
    var searchState = options.state || { matches:[], index:-1 };
    if(!searchState.matches || !searchState.matches.length) return false;
    searchState.index = (searchState.index - 1 + searchState.matches.length) % searchState.matches.length;
    return highlightActive({ state: searchState, countEl: options.countEl || null });
  }

  function replaceCurrent(options){
    options = options || {};
    var searchState = options.state || { matches:[], index:-1 };
    if(!searchState.matches || !searchState.matches.length || searchState.index < 0 || searchState.index >= searchState.matches.length){
      return false;
    }
    var replacement = String(options.replacement != null ? options.replacement : '');
    var mark = searchState.matches[searchState.index];
    if(!mark || !mark.parentNode || !(options.doc || (typeof document !== 'undefined' ? document : null))) return false;
    var doc = options.doc || document;
    var editor = options.editor || null;
    var editorRange = resolveEditorRangeFromMark(mark, editor);
    if(editorRange && editor && editor.chain){
      try{
        var replaced = !!editor.chain().focus().insertContentAt({ from:editorRange.from, to:editorRange.to }, replacement).run();
        if(!replaced) return false;
        resetSearchState(searchState);
        if(typeof options.onMutate === 'function') options.onMutate();
        if(typeof options.onAfterReplace === 'function') options.onAfterReplace();
        return true;
      }catch(_e){}
    }
    var textNode = doc.createTextNode(replacement);
    mark.parentNode.replaceChild(textNode, mark);
    if(textNode.parentNode && typeof textNode.parentNode.normalize === 'function') textNode.parentNode.normalize();
    searchState.matches.splice(searchState.index, 1);
    var countEl = options.countEl || null;
    if(searchState.matches.length === 0){
      searchState.index = -1;
      if(countEl) countEl.textContent = '0 sonuç';
    }else{
      if(searchState.index >= searchState.matches.length) searchState.index = 0;
      highlightActive({ state: searchState, countEl: countEl });
    }
    if(typeof options.onMutate === 'function') options.onMutate();
    if(typeof options.onAfterReplace === 'function') options.onAfterReplace();
    return true;
  }

  function replaceAll(options){
    options = options || {};
    var searchState = options.state || { matches:[], index:-1 };
    if(!searchState.matches || !searchState.matches.length || !(options.doc || (typeof document !== 'undefined' ? document : null))){
      return 0;
    }
    var replacement = String(options.replacement != null ? options.replacement : '');
    var doc = options.doc || document;
    var count = searchState.matches.length;
    for(var i = searchState.matches.length - 1; i >= 0; i--){
      var mark = searchState.matches[i];
      if(!mark || !mark.parentNode) continue;
      var textNode = doc.createTextNode(replacement);
      mark.parentNode.replaceChild(textNode, mark);
      if(textNode.parentNode && typeof textNode.parentNode.normalize === 'function') textNode.parentNode.normalize();
    }
    resetSearchState(searchState);
    var countEl = options.countEl || null;
    if(countEl) countEl.textContent = count + ' değiştirildi';
    if(typeof options.onMutate === 'function') options.onMutate(count);
    return count;
  }

  function closeSearchUI(options){
    options = options || {};
    var searchState = options.state || { matches:[], index:-1 };
    closeBar({
      doc: options.doc,
      clearHighlights: options.clearHighlights,
      onClosed: function(els){
        resetSearchState(searchState);
        if(typeof options.onClosed === 'function') options.onClosed(els, searchState);
      }
    });
    return true;
  }

  function replaceCurrent(options){
    options = options || {};
    var searchState = options.state || { matches:[], index:-1 };
    if(!searchState.matches || !searchState.matches.length || searchState.index < 0 || searchState.index >= searchState.matches.length){
      return false;
    }
    var replacement = String(options.replacement != null ? options.replacement : '');
    var mark = searchState.matches[searchState.index];
    if(!mark || !(options.doc || (typeof document !== 'undefined' ? document : null))) return false;
    var doc = options.doc || document;
    var host = options.host || null;
    var editor = options.editor || null;
    var editorRanges = Array.isArray(searchState.editorRanges) ? searchState.editorRanges : [];
    if((!editorRanges.length || !editorRanges[searchState.index]) && editor && options.query){
      editorRanges = buildEditorSearchRanges(editor, options.query, !!options.useRegex, !!options.caseSensitive);
      searchState.editorRanges = editorRanges;
    }
    var editorRange = editorRanges[searchState.index] || resolveEditorRangeFromMark(mark, editor);
    debugLog('replaceCurrent.start', {
      query: options.query || '',
      replacement: replacement,
      index: searchState.index,
      matchCount: searchState.matches.length,
      editorRange: editorRange || null
    });
    if(editorRange && replaceEditorRanges(editor, [editorRange], replacement)){
      clearHighlights({ host: host });
      resetSearchState(searchState);
      if(typeof options.onMutate === 'function') options.onMutate();
      if(typeof options.onAfterReplace === 'function') options.onAfterReplace();
      return true;
    }
    if(!mark.parentNode) return false;
    var textNode = doc.createTextNode(replacement);
    mark.parentNode.replaceChild(textNode, mark);
    if(textNode.parentNode && typeof textNode.parentNode.normalize === 'function') textNode.parentNode.normalize();
    clearHighlights({ host: host });
    syncEditorFromHost(editor, host);
    resetSearchState(searchState);
    var countEl = options.countEl || null;
    if(countEl) countEl.textContent = '0 sonuc';
    if(typeof options.onMutate === 'function') options.onMutate();
    if(typeof options.onAfterReplace === 'function') options.onAfterReplace();
    return true;
  }

  function replaceAll(options){
    options = options || {};
    var searchState = options.state || { matches:[], index:-1 };
    if(!searchState.matches || !searchState.matches.length || !(options.doc || (typeof document !== 'undefined' ? document : null))){
      return 0;
    }
    var replacement = String(options.replacement != null ? options.replacement : '');
    var doc = options.doc || document;
    var count = searchState.matches.length;
    var host = options.host || null;
    var editor = options.editor || null;
    if(editor){
      var ranges = Array.isArray(searchState.editorRanges) ? searchState.editorRanges.slice() : [];
      if((!ranges.length) && options.query){
        ranges = buildEditorSearchRanges(editor, options.query, !!options.useRegex, !!options.caseSensitive);
        searchState.editorRanges = ranges.slice();
      }
      ranges = ranges.length ? ranges : searchState.matches.map(function(mark){
        return resolveEditorRangeFromMark(mark, editor);
      });
      ranges = ranges.filter(Boolean).sort(function(a,b){ return b.from - a.from; });
      debugLog('replaceAll.start', {
        query: options.query || '',
        replacement: replacement,
        matchCount: searchState.matches.length,
        rangeCount: ranges.length
      });
      if(ranges.length && replaceEditorRanges(editor, ranges, replacement)){
        clearHighlights({ host: host });
        resetSearchState(searchState);
        var editorCountEl = options.countEl || null;
        if(editorCountEl) editorCountEl.textContent = count + ' degistirildi';
        if(typeof options.onMutate === 'function') options.onMutate(count);
        if(typeof options.onAfterReplace === 'function') options.onAfterReplace(count);
        return count;
      }
    }
    for(var i = searchState.matches.length - 1; i >= 0; i--){
      var mark = searchState.matches[i];
      if(!mark || !mark.parentNode) continue;
      var textNode = doc.createTextNode(replacement);
      mark.parentNode.replaceChild(textNode, mark);
      if(textNode.parentNode && typeof textNode.parentNode.normalize === 'function') textNode.parentNode.normalize();
    }
    clearHighlights({ host: host });
    syncEditorFromHost(editor, host);
    resetSearchState(searchState);
    var countEl = options.countEl || null;
    if(countEl) countEl.textContent = count + ' degistirildi';
    if(typeof options.onMutate === 'function') options.onMutate(count);
    if(typeof options.onAfterReplace === 'function') options.onAfterReplace(count);
    return count;
  }

  function closeSearchWithState(options){
    options = options || {};
    return closeSearchUI({
      doc: options.doc,
      state: options.state,
      clearHighlights: function(){
        return clearHighlights({
          host: options.host || getElements(options.doc).host || null
        });
      },
      onClosed: options.onClosed
    });
  }

  function toggleSearchUI(options){
    options = options || {};
    var opened = toggleBar({
      doc: options.doc,
      onOpened: options.onOpened,
      onClose: function(){
        closeSearchUI(options);
      }
    });
    if(opened) return true;
    closeSearchUI(options);
    return false;
  }

  function toggleSearchWithState(options){
    options = options || {};
    return toggleSearchUI({
      doc: options.doc,
      state: options.state,
      clearHighlights: function(){
        return clearHighlights({
          host: options.host || null
        });
      },
      onOpened: options.onOpened,
      onClosed: options.onClosed
    });
  }

  function buildSearchRegExp(query, useRegex, caseSensitive){
    var source = String(query || '');
    var flags = caseSensitive ? 'g' : 'gi';
    if(!source) return null;
    return useRegex
      ? new RegExp(source, flags)
      : new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  }

  function scheduleFind(options){
    options = options || {};
    clearTimeout(state.timer);
    state.timer = setTimeout(function(){
      if(typeof options.onExec === 'function') options.onExec();
    }, parseInt(options.delay, 10) || 200);
    return true;
  }

  function bindInputs(options){
    options = options || {};
    var els = getElements(options.doc);
    if(els.findInput && !els.findInput.__aqFindBound){
      els.findInput.__aqFindBound = true;
      els.findInput.addEventListener('input', function(){
        scheduleFind({
          delay: options.delay,
          onExec: options.onExec
        });
      });
      els.findInput.addEventListener('keydown', function(e){
        if(e.key === 'Enter'){
          e.preventDefault();
          if(e.shiftKey){
            if(typeof options.onPrev === 'function') options.onPrev();
          }else{
            if(typeof options.onNext === 'function') options.onNext();
          }
        }
        if(e.key === 'Escape'){
          e.preventDefault();
          if(typeof options.onClose === 'function') options.onClose();
        }
      });
    }
    if(els.replaceInput && !els.replaceInput.__aqFindBound){
      els.replaceInput.__aqFindBound = true;
      els.replaceInput.addEventListener('keydown', function(e){
        if(e.key === 'Escape'){
          e.preventDefault();
          if(typeof options.onClose === 'function') options.onClose();
        }
      });
    }
    return true;
  }

  function executeSearchWithState(options){
    options = options || {};
    var doc = options.doc || (typeof document !== 'undefined' ? document : null);
    var els = getElements(doc);
    return executeSearch({
      doc: doc,
      host: options.host || (doc ? doc.getElementById('apaed') : null),
      countEl: options.countEl || els.count || null,
      state: options.state || { matches:[], index:-1 },
      editor: options.editor || null,
      query: options.query,
      useRegex: options.useRegex,
      caseSensitive: options.caseSensitive
    });
  }

  function navigateSearch(options){
    options = options || {};
    var doc = options.doc || (typeof document !== 'undefined' ? document : null);
    var els = getElements(doc);
    var next = options.forward !== false;
    return next
      ? findNext({
          state: options.state || { matches:[], index:-1 },
          countEl: options.countEl || els.count || null,
          editor: options.editor || null
        })
      : findPrev({
          state: options.state || { matches:[], index:-1 },
          countEl: options.countEl || els.count || null,
          editor: options.editor || null
        });
  }

  function replaceSearchWithState(options){
    options = options || {};
    var doc = options.doc || (typeof document !== 'undefined' ? document : null);
    var els = getElements(doc);
    var replacement = options.replacement != null
      ? String(options.replacement)
      : String((els.replaceInput || {}).value || '');
    if(options.all){
      return replaceAll({
        doc: doc,
        host: options.host || (doc ? doc.getElementById('apaed') : null),
        state: options.state || { matches:[], index:-1 },
        editor: options.editor || null,
        query: options.query,
        useRegex: options.useRegex,
        caseSensitive: options.caseSensitive,
        replacement: replacement,
        countEl: options.countEl || els.count || null,
        onMutate: options.onMutate,
        onAfterReplace: options.onAfterReplace
      });
    }
    return replaceCurrent({
      doc: doc,
      host: options.host || (doc ? doc.getElementById('apaed') : null),
      state: options.state || { matches:[], index:-1 },
      editor: options.editor || null,
      query: options.query,
      useRegex: options.useRegex,
      caseSensitive: options.caseSensitive,
      replacement: replacement,
      countEl: options.countEl || els.count || null,
      onMutate: options.onMutate,
      onAfterReplace: options.onAfterReplace
    });
  }

  function bindSearchUI(options){
    options = options || {};
    return bindInputs({
      doc: options.doc,
      delay: options.delay,
      onExec: function(){
        return executeSearchWithState(options);
      },
      onPrev: function(){
        return navigateSearch({
          doc: options.doc,
          state: options.state,
          countEl: options.countEl,
          forward: false
        });
      },
      onNext: function(){
        return navigateSearch({
          doc: options.doc,
          state: options.state,
          countEl: options.countEl,
          forward: true
        });
      },
      onClose: function(){
        return closeSearchWithState(options);
      }
    });
  }

  return {
    getElements: getElements,
    toggleBar: toggleBar,
    closeBar: closeBar,
    resetSearchState: resetSearchState,
    clearHighlights: clearHighlights,
    collectTextSegments: collectTextSegments,
    buildSearchText: buildSearchText,
    buildSearchRegExp: buildSearchRegExp,
    findMatchesInText: findMatchesInText,
    scheduleFind: scheduleFind,
    bindInputs: bindInputs,
    highlightActive: highlightActive,
    executeSearch: executeSearch,
    findNext: findNext,
    findPrev: findPrev,
    replaceCurrent: replaceCurrent,
    replaceAll: replaceAll,
    closeSearchUI: closeSearchUI,
    closeSearchWithState: closeSearchWithState,
    toggleSearchUI: toggleSearchUI,
    toggleSearchWithState: toggleSearchWithState,
    executeSearchWithState: executeSearchWithState,
    navigateSearch: navigateSearch,
    replaceSearchWithState: replaceSearchWithState,
    bindSearchUI: bindSearchUI
  };
});
