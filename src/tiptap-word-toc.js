(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  root.AQTipTapWordTOC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  var state = {
    timer: null
  };

  var TOC_PATTERN = /<div\b[^>]*class=(["'])[^"'<>]*\btoc-container\b[^"'<>]*\1[^>]*>[\s\S]*?<\/div>/i;
  var TOC_PATTERN_ALL = /<div\b[^>]*class=(["'])[^"'<>]*\btoc-container\b[^"'<>]*\1[^>]*>[\s\S]*?<\/div>/gi;
  var TOC_ENTRY_PATTERN_ALL = /<p\b[^>]*class=(["'])[^"'<>]*\btoc-entry\b[^"'<>]*\1[^>]*>[\s\S]*?<\/p>/gi;
  var TOC_SPAN_PATTERN_ALL = /<span\b[^>]*class=(["'])[^"'<>]*\btoc-(?:text|dots|page)\b[^"'<>]*\1[^>]*>[\s\S]*?<\/span>/gi;

  function hasDOM(){
    return typeof document !== 'undefined' && !!document.createElement;
  }

  function normalizeHTML(html){
    return String(html || '').trim() || '<p></p>';
  }

  function stripTOCArtifacts(fullHTML){
    var html = String(fullHTML || '');
    html = html.replace(TOC_PATTERN_ALL, '');
    html = html.replace(TOC_ENTRY_PATTERN_ALL, '');
    html = html.replace(TOC_SPAN_PATTERN_ALL, '');
    return html;
  }

  function isIgnoredHeadingText(text){
    var normalized = String(text || '').trim().toLowerCase();
    return !normalized || normalized === 'i\u00e7indekiler' || normalized === 'i\u0307\u00e7indekiler' || normalized === 'kaynak\u00e7a';
  }

  function collectContentHeadings(editorRoot){
    if(!editorRoot || typeof editorRoot.querySelectorAll !== 'function') return [];
    return Array.from(editorRoot.querySelectorAll('h1,h2,h3,h4,h5')).filter(function(heading){
      return !isIgnoredHeadingText(heading && heading.textContent);
    });
  }

  function replaceTOCString(fullHTML, tocHTML){
    var html = stripTOCArtifacts(fullHTML);
    return normalizeHTML(tocHTML + html);
  }

  function removeTOCString(fullHTML){
    var html = String(fullHTML || '');
    if(!TOC_PATTERN.test(html)) return null;
    return normalizeHTML(stripTOCArtifacts(html));
  }

  function buildTOCHTML(editorRoot, headings, deps){
    deps = deps || {};
    var pageTotalHeight = deps.pageTotalHeight || 1155;
    var idFactory = typeof deps.idFactory === 'function' ? deps.idFactory : function(index){ return 'hdg-' + index; };
    var levelIndentMap = { 1:0, 2:36, 3:72, 4:108, 5:144 };
    function normalizeLevel(level){
      var parsed = parseInt(level, 10);
      if(!Number.isFinite(parsed)) return 1;
      if(parsed < 1) return 1;
      if(parsed > 5) return 5;
      return parsed;
    }
    function computeLeader(text, level){
      var compact = String(text || '').replace(/\s+/g, ' ').trim();
      var depthPenalty = (normalizeLevel(level) - 1) * 6;
      var count = 130 - Math.min(compact.length, 72) - depthPenalty;
      count = Math.max(44, Math.min(170, count));
      return new Array(count + 1).join('.');
    }
    var items = Array.isArray(headings) ? headings : Array.from(headings || []);
    if(!items.length) items = collectContentHeadings(editorRoot);

    var html = '<div class="toc-container" data-aq-toc="1">';
    html += '<h1 style="text-align:center;font-weight:bold;color:#000;font-family:&quot;Times New Roman&quot;,Times,serif;font-size:12pt;line-height:2;margin:0 0 8px 0;">\u0130\u00e7indekiler</h1>';
    items.forEach(function(heading, index){
      var level = normalizeLevel(String(heading.tagName || '').charAt(1));
      var text = String(heading.textContent || '').trim();
      if(isIgnoredHeadingText(text)) return;
      if(!heading.id) heading.id = idFactory(index);
      var indent = Object.prototype.hasOwnProperty.call(levelIndentMap, level) ? levelIndentMap[level] : 0;
      var pageNum = Math.max(1, Math.floor((heading.offsetTop || 0) / pageTotalHeight) + 1);
      var leader = computeLeader(text, level);
      html += '<p class="ni toc-entry" style="position:relative;word-break:normal;text-indent:0;padding-left:' + indent + 'px;cursor:pointer;margin:0;color:#000;background:transparent;border:none;box-shadow:none;font-family:&quot;Times New Roman&quot;,Times,serif;font-size:12pt;line-height:2;" data-toc-idx="' + index + '" data-heading-idx="' + index + '" data-target-id="' + heading.id + '" data-heading-text="' + text.replace(/"/g,'&quot;') + '" data-toc-level="' + level + '"><span class="toc-text-wrap" style="display:block;word-break:normal;overflow-wrap:break-word;padding-right:32px;"><span class="toc-text" style="display:inline;">' + text + '</span></span><span class="toc-dots" style="position:absolute;bottom:0;left:0;right:28px;overflow:hidden;white-space:nowrap;display:none;" aria-hidden="true"></span><span class="toc-page" style="position:absolute;right:0;bottom:0;background:#fff;padding-left:4px;white-space:nowrap;">' + pageNum + '</span></p>';
    });
    html += '</div>';
    return html;
  }

  function replaceTOCInHTML(fullHTML, tocHTML){
    if(!hasDOM() || typeof document.createElement !== 'function'){
      return replaceTOCString(fullHTML, tocHTML);
    }
    var div = document.createElement('div');
    if(!div || typeof div.querySelector !== 'function'){
      return replaceTOCString(fullHTML, tocHTML);
    }
    div.innerHTML = fullHTML || '';
    Array.from(div.querySelectorAll('.toc-container,.toc-entry')).forEach(function(node){ node.remove(); });
    div.insertAdjacentHTML('afterbegin', tocHTML);
    return normalizeHTML(div.innerHTML);
  }

  function removeTOCFromHTML(fullHTML){
    if(!hasDOM() || typeof document.createElement !== 'function'){
      return removeTOCString(fullHTML);
    }
    var div = document.createElement('div');
    if(!div || typeof div.querySelector !== 'function'){
      return removeTOCString(fullHTML);
    }
    div.innerHTML = fullHTML || '';
    var toRemove = Array.from(div.querySelectorAll('.toc-container,.toc-entry'));
    if(!toRemove.length) return null;
    toRemove.forEach(function(node){ node.remove(); });
    return normalizeHTML(div.innerHTML);
  }

  function resolveTargetHeading(editorRoot, idx){
    if(!editorRoot) return null;
    var entry = editorRoot.querySelector('.toc-entry[data-toc-idx="' + idx + '"]');
    var headingIdx = entry && entry.dataset ? parseInt(entry.dataset.headingIdx, 10) : parseInt(idx, 10);
    var headings = collectContentHeadings(editorRoot);
    if(Number.isFinite(headingIdx) && headings[headingIdx]) return headings[headingIdx];
    var targetId = entry && entry.dataset ? entry.dataset.targetId : '';
    return targetId ? editorRoot.querySelector('#' + targetId) : null;
  }

  function scrollToHeading(editorRoot, idx){
    if(!editorRoot) return false;
    var target = resolveTargetHeading(editorRoot, idx);
    if(!target) return false;

    var scrollEl = (typeof document !== 'undefined' && document && typeof document.getElementById === 'function')
      ? (document.getElementById('escroll') || (editorRoot.closest && editorRoot.closest('#escroll')))
      : null;

    if(scrollEl && typeof scrollEl.scrollTo === 'function'){
      var scrollRect = scrollEl.getBoundingClientRect();
      var targetRect = target.getBoundingClientRect();
      var nextTop = Math.max(0, scrollEl.scrollTop + (targetRect.top - scrollRect.top) - 36);
      scrollEl.scrollTo({ top: nextTop, behavior:'smooth' });
    }else{
      target.scrollIntoView({ behavior:'smooth', block:'center' });
    }

    target.style.background = 'rgba(179,131,58,.2)';
    setTimeout(function(){ target.style.background = ''; }, 1500);
    return true;
  }

  function handleDocumentClick(event, deps){
    deps = deps || {};
    var target = event && event.target;
    if(target && target.nodeType === 3) target = target.parentElement;
    var entry = target && target.closest ? target.closest('.toc-entry') : null;
    if(!entry) return false;
    if(typeof event.preventDefault === 'function') event.preventDefault();
    if(typeof deps.scrollToHeading === 'function'){
      deps.scrollToHeading(entry.dataset ? entry.dataset.tocIdx : undefined);
      return true;
    }
    var editorRoot = typeof deps.getEditorRoot === 'function' ? deps.getEditorRoot() : null;
    return scrollToHeading(editorRoot, entry.dataset ? entry.dataset.tocIdx : undefined);
  }

  function applyHTML(nextHTML, deps){
    deps = deps || {};
    if(typeof deps.applyHTML === 'function'){
      deps.applyHTML(nextHTML || '<p></p>');
    }
    if(typeof deps.afterApply === 'function'){
      deps.afterApply();
    }
  }

  function insertTOC(deps){
    deps = deps || {};
    var editorRoot = typeof deps.getEditorRoot === 'function' ? deps.getEditorRoot() : null;
    if(!editorRoot) return false;
    var headings = collectContentHeadings(editorRoot);
    if(!headings.length){
      if(typeof deps.onNoHeadings === 'function') deps.onNoHeadings();
      return false;
    }
    var tocHTML = buildTOCHTML(editorRoot, headings, deps);
    var nextHTML = replaceTOCInHTML(typeof deps.getHTML === 'function' ? deps.getHTML() : '', tocHTML);
    applyHTML(nextHTML, deps);
    if(typeof deps.onUpdated === 'function') deps.onUpdated();
    return true;
  }

  function removeTOC(deps){
    deps = deps || {};
    var nextHTML = removeTOCFromHTML(typeof deps.getHTML === 'function' ? deps.getHTML() : '');
    if(nextHTML === null) return false;
    applyHTML(nextHTML, deps);
    if(typeof deps.onUpdated === 'function') deps.onUpdated();
    return true;
  }

  function autoUpdateTOC(deps){
    deps = deps || {};
    clearTimeout(state.timer);
    state.timer = setTimeout(function(){
      var editorRoot = typeof deps.getEditorRoot === 'function' ? deps.getEditorRoot() : null;
      if(!editorRoot || !editorRoot.querySelector('.toc-container')) return;
      var headings = collectContentHeadings(editorRoot);
      if(!headings.length) return;
      if(typeof deps.isEditorFocused === 'function' && deps.isEditorFocused()){
        autoUpdateTOC(deps);
        return;
      }
      var tocHTML = buildTOCHTML(editorRoot, headings, deps);
      var nextHTML = replaceTOCInHTML(typeof deps.getHTML === 'function' ? deps.getHTML() : '', tocHTML);
      applyHTML(nextHTML, deps);
      if(typeof deps.onUpdated === 'function') deps.onUpdated();
    }, deps.delay || 1500);
    return true;
  }

  return {
    buildTOCHTML: buildTOCHTML,
    replaceTOCInHTML: replaceTOCInHTML,
    removeTOCFromHTML: removeTOCFromHTML,
    scrollToHeading: scrollToHeading,
    handleDocumentClick: handleDocumentClick,
    insertTOC: insertTOC,
    removeTOC: removeTOC,
    autoUpdateTOC: autoUpdateTOC
  };
});
