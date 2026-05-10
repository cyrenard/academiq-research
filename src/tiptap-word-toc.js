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

  function normalizeTitle(text){
    var compact = String(text || '').replace(/\s+/g, ' ').trim();
    try{ return compact.toLocaleLowerCase('tr-TR'); }
    catch(_e){ return compact.toLowerCase(); }
  }

  function isSkippedHeadingText(text){
    var normalized = normalizeTitle(text)
      .replace(/\u00e7/g, 'c')
      .replace(/\u0131/g, 'i')
      .replace(/\u0130/g, 'i');
    return !normalized
      || normalized === 'icindekiler'
      || normalized === 'içindekiler'
      || normalized === 'kaynakca'
      || normalized === 'kaynakça'
      || /^ek(?:ler)?(?:[-\s]+\w+)?$/.test(normalized)
      || /^appendix(?:[-\s]+\w+)?$/.test(normalized);
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
      if(isSkippedHeadingText(text)) return;
      if(!heading.id) heading.id = idFactory(realIdx);
      var indent = (level - 1) * 24;
      var pageNum = heading.pageNumber ? Math.max(1, parseInt(heading.pageNumber, 10) || 1) : Math.max(1, Math.floor((heading.offsetTop || 0) / pageContentHeight) + 1);
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
    if(!div || typeof div.querySelector !== 'function' || typeof div.insertAdjacentHTML !== 'function'){
      return replaceTOCString(fullHTML, tocHTML);
    }
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

  function runsText(runs){
    return (Array.isArray(runs) ? runs : []).map(function(run){ return run && run.text ? String(run.text) : ''; }).join('').trim();
  }

  function collectAQEngineHeadings(editor, deps){
    deps = deps || {};
    if(!editor || !editor._docModel || typeof editor._docModel.get !== 'function') return [];
    var model = editor._docModel.get() || {};
    var blocks = Array.isArray(model.blocks) ? model.blocks : [];
    var layout = editor._aqLayout || null;
    var pageByBlock = {};
    if(layout && Array.isArray(layout.pages)){
      layout.pages.forEach(function(page, pageIdx){
        (page.lines || []).forEach(function(line){
          var blockIndex = Number(line && line.blockIndex);
          if(!Number.isFinite(blockIndex)) return;
          if(!pageByBlock[blockIndex]) pageByBlock[blockIndex] = pageIdx + 1;
        });
      });
    }
    return blocks.map(function(block, index){
      if(!block || block.type !== 'heading') return null;
      if(block._isBibHeading || block._isAppendixHeading) return null;
      var text = runsText(block.runs);
      if(isSkippedHeadingText(text)) return null;
      var level = Math.max(1, Math.min(5, parseInt(block.level, 10) || 1));
      return {
        tagName: 'H' + level,
        textContent: text,
        id: block._tocId || ('aq-hdg-' + index),
        pageNumber: pageByBlock[index] || 1,
        offsetTop: ((pageByBlock[index] || 1) - 1) * (deps.pageTotalHeight || deps.pageContentHeight || 864),
        blockIndex: index
      };
    }).filter(Boolean);
  }

  function buildAQEngineTOCHTML(editor, deps){
    var headings = collectAQEngineHeadings(editor, deps || {});
    if(!headings.length) return '';
    return buildTOCHTML(null, headings, deps || {});
  }

  function removeTOCFromHTML(fullHTML){
    if(!hasDOM()){
      return removeTOCString(fullHTML);
    }
    var div = document.createElement('div');
    if(!div || typeof div.querySelector !== 'function'){
      return removeTOCString(fullHTML);
    }
    div.innerHTML = fullHTML || '';
    var toc = div.querySelector('.toc-container');
    if(!toc) return null;
    toc.remove();
    return normalizeHTML(div.innerHTML);
  }

  function scrollToHeading(editorRoot, idx){
    if(!editorRoot || typeof editorRoot.querySelector !== 'function') return false;
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
    if(!editorRoot || typeof editorRoot.querySelectorAll !== 'function') return false;
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

  function autoUpdateTOC(deps, _retries){
    deps = deps || {};
    _retries = (_retries || 0);
    clearTimeout(state.timer);
    state.timer = setTimeout(function(){
      var editorRoot = typeof deps.getEditorRoot === 'function' ? deps.getEditorRoot() : null;
      if(!editorRoot || typeof editorRoot.querySelector !== 'function' || typeof editorRoot.querySelectorAll !== 'function') return;
      if(!editorRoot.querySelector('.toc-container')) return;
      var headings = editorRoot.querySelectorAll('h1,h2,h3,h4,h5');
      if(!headings.length) return;
      if(typeof deps.isEditorFocused === 'function' && deps.isEditorFocused() && _retries < 20){
        autoUpdateTOC(deps, _retries + 1);
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
    collectAQEngineHeadings: collectAQEngineHeadings,
    buildAQEngineTOCHTML: buildAQEngineTOCHTML,
    replaceTOCInHTML: replaceTOCInHTML,
    removeTOCFromHTML: removeTOCFromHTML,
    scrollToHeading: scrollToHeading,
    handleDocumentClick: handleDocumentClick,
    insertTOC: insertTOC,
    removeTOC: removeTOC,
    autoUpdateTOC: autoUpdateTOC
  };
});
