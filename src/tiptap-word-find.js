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
    return searchState;
  }

  function clearHighlights(options){
    options = options || {};
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

  function highlightActive(options){
    options = options || {};
    var searchState = options.state || { matches:[], index:-1 };
    var matches = Array.isArray(searchState.matches) ? searchState.matches : [];
    var index = parseInt(searchState.index, 10);
    var countEl = options.countEl || null;
    matches.forEach(function(mark, i){
      if(mark) mark.className = i === index ? 'find-hl find-hl-active' : 'find-hl';
    });
    if(matches[index] && typeof matches[index].scrollIntoView === 'function'){
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
    var query = options.query != null ? String(options.query) : String((doc && doc.getElementById('findinp') || {}).value || '');
    var useRegex = options.useRegex != null ? !!options.useRegex : !!((doc && doc.getElementById('findregex') || {}).checked);
    var caseSensitive = options.caseSensitive != null ? !!options.caseSensitive : !!((doc && doc.getElementById('findcase') || {}).checked);
    clearHighlights({ host: host });
    resetSearchState(searchState);
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
    if(!re || !doc || !host || typeof doc.createTreeWalker !== 'function'){
      if(countEl) countEl.textContent = 'Yok';
      return [];
    }
    var walker = doc.createTreeWalker(host, (options.nodeFilterShowText || (typeof NodeFilter !== 'undefined' ? NodeFilter.SHOW_TEXT : 4)), null, false);
    var textNodes = [];
    while(walker.nextNode()){
      var node = walker.currentNode;
      if(node.parentElement && node.parentElement.classList &&
        (node.parentElement.classList.contains('pg-spacer') || node.parentElement.classList.contains('find-hl'))){
        continue;
      }
      textNodes.push(node);
    }
    for(var i = textNodes.length - 1; i >= 0; i--){
      var textNode = textNodes[i];
      var text = textNode.textContent;
      var match;
      var parts = [];
      re.lastIndex = 0;
      while((match = re.exec(text)) !== null){
        if(match[0].length === 0){
          re.lastIndex++;
          continue;
        }
        parts.push({ start: match.index, end: match.index + match[0].length });
      }
      if(!parts.length) continue;
      for(var p = parts.length - 1; p >= 0; p--){
        var part = parts[p];
        textNode.splitText(part.end);
        var matchNode = textNode.splitText(part.start);
        var mark = doc.createElement('mark');
        mark.className = 'find-hl';
        matchNode.parentNode.replaceChild(mark, matchNode);
        mark.appendChild(matchNode);
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
          countEl: options.countEl || els.count || null
        })
      : findPrev({
          state: options.state || { matches:[], index:-1 },
          countEl: options.countEl || els.count || null
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
        state: options.state || { matches:[], index:-1 },
        replacement: replacement,
        countEl: options.countEl || els.count || null,
        onMutate: options.onMutate
      });
    }
    return replaceCurrent({
      doc: doc,
      state: options.state || { matches:[], index:-1 },
      replacement: replacement,
      countEl: options.countEl || els.count || null,
      onMutate: options.onMutate
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
    buildSearchRegExp: buildSearchRegExp,
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
