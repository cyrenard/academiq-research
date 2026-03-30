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

  function hasDOM(){
    return typeof document !== 'undefined' && !!document.createElement;
  }

  function normalizeHTML(html){
    return String(html || '').trim() || '<p></p>';
  }

  function replaceTOCString(fullHTML, tocHTML){
    var html = String(fullHTML || '');
    if(TOC_PATTERN.test(html)){
      return normalizeHTML(html.replace(TOC_PATTERN, tocHTML));
    }
    return normalizeHTML(tocHTML + html);
  }

  function removeTOCString(fullHTML){
    var html = String(fullHTML || '');
    if(!TOC_PATTERN.test(html)) return null;
    return normalizeHTML(html.replace(TOC_PATTERN, ''));
  }

  function buildTOCHTML(editorRoot, headings, deps){
    deps = deps || {};
    var pageContentHeight = deps.pageTotalHeight || deps.pageContentHeight || 864;
    var idFactory = typeof deps.idFactory === 'function' ? deps.idFactory : function(index){ return 'hdg-' + index; };
    var html = '<div class="toc-container" data-aq-toc="1">';
    html += '<h1 style="text-align:center;font-weight:bold;color:#000;font-family:&quot;Times New Roman&quot;,Times,serif;font-size:12pt;line-height:2;margin:0 0 8px 0;">İçindekiler</h1>';
    var realIdx = 0;
    Array.from(headings || []).forEach(function(heading){
      var level = parseInt(String(heading.tagName || '').charAt(1), 10);
      var text = String(heading.textContent || '').trim();
      if(!text || text === 'İçindekiler' || text === 'Kaynakça') return;
      if(!heading.id) heading.id = idFactory(realIdx);
      var indent = (level - 1) * 24;
      var pageNum = Math.max(1, Math.floor((heading.offsetTop || 0) / pageContentHeight) + 1);
      html += '<p class="ni toc-entry" style="position:relative;word-break:normal;text-indent:0;padding-left:' + indent + 'px;cursor:pointer;margin:0;color:#000;background:transparent;border:none;box-shadow:none;font-family:&quot;Times New Roman&quot;,Times,serif;font-size:12pt;line-height:2;text-decoration:none;display:block;" data-toc-idx="' + realIdx + '" data-target-id="' + heading.id + '"><span class="toc-text-wrap" style="display:block;word-break:normal;overflow-wrap:break-word;padding-right:32px;"><span class="toc-text" style="display:inline;">' + text + '</span></span><span class="toc-dots" style="position:absolute;bottom:0;left:0;right:28px;overflow:hidden;white-space:nowrap;display:none;" aria-hidden="true"></span><span class="toc-page" style="position:absolute;right:0;bottom:0;background:#fff;padding-left:4px;white-space:nowrap;">' + pageNum + '</span></p>';
      realIdx++;
    });
    html += '</div>';
    return html;
  }

  function replaceTOCInHTML(fullHTML, tocHTML){
    if(!hasDOM()){
      return replaceTOCString(fullHTML, tocHTML);
    }
    var div = document.createElement('div');
    div.innerHTML = fullHTML || '';
    var existing = div.querySelector('.toc-container');
    if(existing){
      var temp = document.createElement('div');
      temp.innerHTML = tocHTML;
      existing.replaceWith(temp.firstChild);
    }else{
      div.insertAdjacentHTML('afterbegin', tocHTML);
    }
    return normalizeHTML(div.innerHTML);
  }

  function removeTOCFromHTML(fullHTML){
    if(!hasDOM()){
      return removeTOCString(fullHTML);
    }
    var div = document.createElement('div');
    div.innerHTML = fullHTML || '';
    var toc = div.querySelector('.toc-container');
    if(!toc) return null;
    toc.remove();
    return normalizeHTML(div.innerHTML);
  }

  function scrollToHeading(editorRoot, idx){
    if(!editorRoot) return false;
    var entry = editorRoot.querySelector('.toc-entry[data-toc-idx="' + idx + '"]');
    var targetId = entry && entry.dataset ? entry.dataset.targetId : '';
    var target = targetId ? editorRoot.querySelector('#' + targetId) : null;
    if(!target) return false;
    target.scrollIntoView({ behavior:'smooth', block:'center' });
    target.style.background = 'rgba(179,131,58,.2)';
    setTimeout(function(){ target.style.background = ''; }, 1500);
    return true;
  }

  function handleDocumentClick(event, deps){
    deps = deps || {};
    var target = event && event.target;
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
    var headings = editorRoot.querySelectorAll('h1,h2,h3,h4,h5');
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
      var headings = editorRoot.querySelectorAll('h1,h2,h3,h4,h5');
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
