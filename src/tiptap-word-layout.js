(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordLayout = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  var state = {
    timer: null,
    zoom: 100
  };

  function getPageBackgroundHost(page){
    if(!page || typeof page.querySelector !== 'function') return null;
    return page.querySelector('#apapage-bg');
  }

  function renderPageSheets(page, pageCount, options){
    options = options || {};
    var host = getPageBackgroundHost(page);
    if(!host || typeof document === 'undefined') return 0;
    host.innerHTML = '';
    var count = Math.max(1, parseInt(pageCount, 10) || 1);
    var step = parseInt(options.pageStep, 10) || 1155;
    for(var index = 0; index < count; index++){
      var sheet = document.createElement('div');
      sheet.className = 'aq-page-sheet';
      sheet.style.top = (index * step) + 'px';
      host.appendChild(sheet);
    }
    return count;
  }

  function computePageCount(contentHeight, pageContentHeight){
    var content = Math.max(parseInt(contentHeight, 10) || 0, pageContentHeight || 864);
    return Math.max(1, Math.ceil(content / (pageContentHeight || 864)));
  }

  function buildPageNumberTops(pageCount, pageStep, firstTop){
    var count = Math.max(1, parseInt(pageCount, 10) || 1);
    var step = parseInt(pageStep, 10) || 1056;
    var top = parseInt(firstTop, 10) || 48;
    return Array.from({ length: count }, function(_, index){
      return top + index * step;
    });
  }

  function measureBlockHeight(block){
    if(!block) return 0;
    var rectHeight = 0;
    if(typeof block.getBoundingClientRect === 'function'){
      try{ rectHeight = block.getBoundingClientRect().height || 0; }catch(e){}
    }
    return Math.max(
      parseInt(rectHeight, 10) || 0,
      parseInt(block.offsetHeight, 10) || 0,
      parseInt(block.scrollHeight, 10) || 0
    );
  }

  function measureCssLength(page, value, fallback){
    if(!page || typeof document === 'undefined' || !value) return fallback;
    var probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.height = String(value || '');
    probe.style.width = '0';
    page.appendChild(probe);
    var measured = 0;
    try{
      measured = probe.getBoundingClientRect ? probe.getBoundingClientRect().height : 0;
    }catch(e){}
    if(probe.parentNode) probe.parentNode.removeChild(probe);
    return Math.max(parseInt(measured, 10) || 0, parseInt(fallback, 10) || 0);
  }

  function resolvePageMetrics(options){
    options = options || {};
    var page = options.page || null;
    var pageHeight = parseInt(options.pageHeight, 10) || 0;
    var pageTotalHeight = parseInt(options.pageTotalHeight, 10) || 0;
    var pageContentHeight = parseInt(options.pageContentHeight, 10) || 0;
    var pageMargin = parseInt(options.pageMargin, 10) || 0;
    var pageGap = parseInt(options.pageGap, 10) || 0;
    if((!pageHeight || !pageTotalHeight || !pageContentHeight || !pageMargin || !pageGap) && typeof window !== 'undefined' && page){
      var root = document.documentElement;
      var styles = root && window.getComputedStyle ? window.getComputedStyle(root) : null;
      if(styles){
        if(!pageHeight){
          pageHeight = measureCssLength(page, styles.getPropertyValue('--aq-page-height').trim(), 1123);
        }
        if(!pageMargin){
          pageMargin = measureCssLength(page, styles.getPropertyValue('--aq-page-margin').trim(), 96);
        }
        if(!pageGap){
          pageGap = measureCssLength(page, styles.getPropertyValue('--aq-page-gap').trim(), 32);
        }
        if(!pageContentHeight){
          var rawContent = styles.getPropertyValue('--aq-page-content-height').trim();
          pageContentHeight = rawContent
            ? measureCssLength(page, rawContent, Math.max(1, pageHeight - (pageMargin * 2)))
            : Math.max(1, pageHeight - (pageMargin * 2));
        }
      }
    }
    pageHeight = pageHeight || 1123;
    pageMargin = pageMargin || 96;
    pageGap = pageGap || 32;
    pageContentHeight = pageContentHeight || Math.max(1, pageHeight - (pageMargin * 2));
    pageTotalHeight = pageTotalHeight || (pageHeight + pageGap);
    return {
      pageHeight: pageHeight,
      pageTotalHeight: pageTotalHeight,
      pageContentHeight: pageContentHeight,
      pageMargin: pageMargin,
      pageGap: pageGap,
      pageVerticalPadding: parseInt(options.pageVerticalPadding, 10) || (pageMargin * 2)
    };
  }

  function applyPageGaps(editorDom, pageContentHeight, pageTotalHeight){
    var blocks = Array.from(editorDom && editorDom.children || []);
    var visualOffset = 0;
    var rules = [];
    blocks.forEach(function(block, index){
      var height = measureBlockHeight(block);
      if(!height) return;
      var withinPage = visualOffset % pageTotalHeight;
      if(index > 0 && withinPage + height > pageContentHeight){
        var gap = Math.max(0, pageTotalHeight - withinPage);
        rules.push('#apaed .ProseMirror>*:nth-child(' + (index + 1) + '){margin-top:' + gap + 'px!important;}');
        visualOffset += gap;
      }
      visualOffset += height;
    });
    var doc = editorDom.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if(doc){
      var styleEl = doc.getElementById('aq-page-gap-style');
      if(!styleEl){
        styleEl = doc.createElement('style');
        styleEl.id = 'aq-page-gap-style';
        doc.head.appendChild(styleEl);
      }
      styleEl.textContent = rules.join('');
    }
    return Math.max(pageContentHeight, visualOffset);
  }

  function syncPageMetrics(options){
    options = options || {};
    var page = options.page;
    var editorDom = options.editorDom;
    var scrollEl = options.scrollEl || null;
    var showPageNumbers = !!options.showPageNumbers;
    if(!page || !editorDom) return 0;
    var metrics = resolvePageMetrics(options);
    var pageHeight = metrics.pageHeight;
    var pageContentHeight = metrics.pageContentHeight;
    var pageTotalHeight = metrics.pageTotalHeight;
    var pageMargin = metrics.pageMargin;
    var pageGap = metrics.pageGap;
    var pageVerticalPadding = metrics.pageVerticalPadding;
    var editorView = options.editorView || null;
    page.querySelectorAll('.page-break-overlay,.page-number').forEach(function(el){ el.remove(); });
    editorDom.querySelectorAll('.pg-spacer').forEach(function(el){ el.remove(); });
    var visualContentHeight = applyPageGaps(editorDom, pageContentHeight, pageTotalHeight);
    var contentHeight = Math.max(editorDom.scrollHeight || 0, editorDom.offsetHeight || 0, visualContentHeight);
    var pageCount = Math.max(1, Math.ceil(contentHeight / pageTotalHeight));
    var viewportMinHeight = scrollEl ? Math.max(pageTotalHeight, (scrollEl.clientHeight || 0) + 44) : pageTotalHeight;
    page.style.minHeight = Math.max(viewportMinHeight, pageCount * pageTotalHeight, contentHeight + pageVerticalPadding) + 'px';
    renderPageSheets(page, pageCount, {
      pageStep: pageTotalHeight
    });
    page.querySelectorAll('.aq-page-gap-cover').forEach(function(el){ el.remove(); });
    if(showPageNumbers){
      buildPageNumberTops(pageCount, pageTotalHeight, 24).forEach(function(top, index){
        var num = document.createElement('div');
        num.className = 'page-number';
        num.textContent = String(index + 1);
        num.style.top = top + 'px';
        page.appendChild(num);
      });
    }
    return pageCount;
  }

  function applyZoom(page, label, currentZoom, delta){
    var nextZoom = Math.max(50, Math.min(200, (parseInt(currentZoom, 10) || 100) + (parseInt(delta, 10) || 0)));
    if(page){
      page.style.transform = 'scale(' + (nextZoom / 100) + ')';
      page.style.transformOrigin = 'top center';
    }
    if(label) label.textContent = nextZoom + '%';
    return nextZoom;
  }

  function resolveZoomTargets(options){
    options = options || {};
    var doc = options.doc || (typeof document !== 'undefined' ? document : null);
    return {
      page: options.page || (doc ? doc.getElementById('apapage') : null),
      label: options.label || (doc ? doc.getElementById('zoomLbl') : null)
    };
  }

  function changeZoom(options){
    options = options || {};
    state.zoom = applyZoom(options.page, options.label, state.zoom, options.delta);
    return state.zoom;
  }

  function changeZoomUI(options){
    options = options || {};
    var targets = resolveZoomTargets(options);
    return changeZoom({
      page: targets.page,
      label: targets.label,
      delta: options.delta
    });
  }

  function resetZoom(options){
    options = options || {};
    state.zoom = applyZoom(options.page, options.label, 100, 0);
    return state.zoom;
  }

  function resetZoomUI(options){
    options = options || {};
    var targets = resolveZoomTargets(options);
    return resetZoom({
      page: targets.page,
      label: targets.label
    });
  }

  function changeZoomWithFallback(options){
    options = options || {};
    var targets = resolveZoomTargets(options);
    if(targets.page || targets.label){
      return changeZoom({
        page: targets.page,
        label: targets.label,
        delta: options.delta
      });
    }
    var current = parseInt(options.currentZoom, 10) || 100;
    var next = Math.max(50, Math.min(200, current + (parseInt(options.delta, 10) || 0)));
    if(typeof options.applyManual === 'function'){
      options.applyManual(next);
    }
    state.zoom = next;
    return next;
  }

  function editorZoom(options){
    options = options || {};
    return changeZoomWithFallback({
      doc: options.doc || null,
      delta: options.delta,
      currentZoom: options.currentZoom,
      applyManual: options.applyManual
    });
  }

  function runEditorZoom(options){
    options = options || {};
    var doc = options.doc || (typeof document !== 'undefined' ? document : null);
    return editorZoom({
      doc: doc,
      delta: options.delta,
      currentZoom: doc ? parseInt((doc.getElementById('zoomLbl') || {}).textContent, 10) || 100 : 100,
      applyManual: function(next){
        var targets = resolveZoomTargets({ doc: doc });
        if(targets.page){
          targets.page.style.transform = 'scale(' + (next / 100) + ')';
          targets.page.style.transformOrigin = 'top center';
        }
        if(targets.label){
          targets.label.textContent = next + '%';
        }
        if(typeof options.applyManual === 'function'){
          options.applyManual(next);
        }
      }
    });
  }

  function resetZoomWithFallback(options){
    options = options || {};
    var targets = resolveZoomTargets(options);
    if(targets.page || targets.label){
      return resetZoom({
        page: targets.page,
        label: targets.label
      });
    }
    if(typeof options.applyManual === 'function'){
      options.applyManual(100);
    }
    state.zoom = 100;
    return state.zoom;
  }

  function getZoom(){
    return state.zoom;
  }

  function schedulePageSync(options){
    options = options || {};
    clearTimeout(state.timer);
    state.timer = setTimeout(function(){
      syncPageMetrics(options);
      if(typeof options.onSynced === 'function'){
        options.onSynced();
      }
    }, parseInt(options.delay, 10) || 300);
    return true;
  }

  return {
    computePageCount: computePageCount,
    buildPageNumberTops: buildPageNumberTops,
    resolvePageMetrics: resolvePageMetrics,
    applyPageGaps: applyPageGaps,
    renderPageSheets: renderPageSheets,
    syncPageMetrics: syncPageMetrics,
    applyZoom: applyZoom,
    resolveZoomTargets: resolveZoomTargets,
    changeZoom: changeZoom,
    changeZoomUI: changeZoomUI,
    changeZoomWithFallback: changeZoomWithFallback,
    editorZoom: editorZoom,
    runEditorZoom: runEditorZoom,
    resetZoom: resetZoom,
    resetZoomUI: resetZoomUI,
    resetZoomWithFallback: resetZoomWithFallback,
    getZoom: getZoom,
    schedulePageSync: schedulePageSync
  };
});
