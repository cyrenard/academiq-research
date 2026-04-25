(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordLayout = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  var APA_MARGIN_PX = 96; // 1 inch @ 96dpi
  var MIN_PAGE_GAP_PX = 24;

  var state = {
    timer: null,
    zoom: 100,
    pageSize: 'A4',
    pageMargins: {
      top: APA_MARGIN_PX,
      right: APA_MARGIN_PX,
      bottom: APA_MARGIN_PX,
      left: APA_MARGIN_PX
    },
    widowOrphan: {
      enabled: true,
      minLines: 2,
      lineHeightPx: 32
    }
  };

  function safeGetElementById(doc, id){
    if(!doc || typeof doc.getElementById !== 'function') return null;
    try{
      return doc.getElementById(id);
    }catch(e){
      return null;
    }
  }

  function getPageBackgroundHost(page){
    if(!page || typeof page.querySelector !== 'function') return null;
    return page.querySelector('#apapage-bg,#bibpage-bg,#tocpage-bg,#coverpage-bg');
  }

  function renderPageSheets(page, pageCount, options){
    options = options || {};
    var host = getPageBackgroundHost(page);
    var doc = options.doc || (page && page.ownerDocument) || (typeof document !== 'undefined' ? document : null);
    if(!host || !doc || typeof doc.createElement !== 'function') return 0;
    host.innerHTML = '';
    var count = Math.max(1, parseInt(pageCount, 10) || 1);
    var step = parseInt(options.pageStep, 10) || 1155;
    for(var index = 0; index < count; index++){
      var sheet = doc.createElement('div');
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
    var pageMarginTop = parseInt(options.pageMarginTop, 10) || 0;
    var pageMarginBottom = parseInt(options.pageMarginBottom, 10) || 0;
    var pageGap = parseInt(options.pageGap, 10) || 0;
    if((!pageHeight || !pageTotalHeight || !pageContentHeight || !pageMargin || !pageGap || !pageMarginTop || !pageMarginBottom) && typeof window !== 'undefined' && page){
      var root = document.documentElement;
      var styles = root && window.getComputedStyle ? window.getComputedStyle(root) : null;
      if(styles){
        if(!pageHeight){
          pageHeight = measureCssLength(page, styles.getPropertyValue('--aq-page-height').trim(), 1123);
        }
        if(!pageMargin){
          pageMargin = measureCssLength(page, styles.getPropertyValue('--aq-page-margin').trim(), 96);
        }
        if(!pageMarginTop){
          pageMarginTop = measureCssLength(
            page,
            styles.getPropertyValue('--aq-page-margin-top').trim() || styles.getPropertyValue('--aq-page-margin').trim(),
            pageMargin || 96
          );
        }
        if(!pageMarginBottom){
          pageMarginBottom = measureCssLength(
            page,
            styles.getPropertyValue('--aq-page-margin-bottom').trim() || styles.getPropertyValue('--aq-page-margin').trim(),
            pageMargin || 96
          );
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
    pageMargin = pageMargin || APA_MARGIN_PX;
    if(pageMargin < APA_MARGIN_PX) pageMargin = APA_MARGIN_PX;
    pageMarginTop = pageMarginTop || pageMargin || state.pageMargins.top || APA_MARGIN_PX;
    pageMarginBottom = pageMarginBottom || pageMargin || state.pageMargins.bottom || APA_MARGIN_PX;
    if(pageMarginTop < APA_MARGIN_PX) pageMarginTop = APA_MARGIN_PX;
    if(pageMarginBottom < APA_MARGIN_PX) pageMarginBottom = APA_MARGIN_PX;
    pageMargin = Math.max(pageMargin, pageMarginTop, pageMarginBottom);
    pageGap = pageGap || 32;
    if(pageGap < MIN_PAGE_GAP_PX) pageGap = MIN_PAGE_GAP_PX;
    var maxContentHeight = Math.max(1, pageHeight - (pageMarginTop + pageMarginBottom));
    pageContentHeight = pageContentHeight || maxContentHeight;
    if(pageContentHeight > maxContentHeight) pageContentHeight = maxContentHeight;
    pageTotalHeight = pageTotalHeight || (pageHeight + pageGap);
    if(pageTotalHeight < (pageHeight + pageGap)) pageTotalHeight = pageHeight + pageGap;
    return {
      pageHeight: pageHeight,
      pageTotalHeight: pageTotalHeight,
      pageContentHeight: pageContentHeight,
      pageMargin: pageMargin,
      pageMarginTop: pageMarginTop,
      pageMarginBottom: pageMarginBottom,
      pageGap: pageGap,
      pageVerticalPadding: parseInt(options.pageVerticalPadding, 10) || (pageMarginTop + pageMarginBottom)
    };
  }

  function canForcePageBreakBefore(block, blockHeight, pageContentHeight, remainingSpace, options){
    options = options || {};
    if(!block || !block.nodeName) return false;
    var tag = String(block.nodeName || '').toUpperCase();
    var height = Math.max(1, parseInt(blockHeight, 10) || measureBlockHeight(block));
    var pageLimit = Math.max(1, parseInt(pageContentHeight, 10) || 0);
    var remain = Math.max(0, parseInt(remainingSpace, 10) || 0);
    var widowOrphan = options.widowOrphan || state.widowOrphan || {};
    var widowEnabled = widowOrphan.enabled !== false;
    var lineHeightPx = Math.max(12, parseInt(widowOrphan.lineHeightPx, 10) || 32);
    var minLines = Math.max(1, parseInt(widowOrphan.minLines, 10) || 2);
    var breakThreshold = Math.max(96, lineHeightPx * minLines);
    // Keep APA page top/bottom margins stable across pages by default.
    // Avoid introducing huge bottom gaps: only push paragraph-like blocks when
    // the remaining space is small (roughly a few lines).
    if(tag === 'P' || tag === 'LI' || tag === 'UL' || tag === 'OL'){
      var pageMarginPx = APA_MARGIN_PX;
      // APA wants a full 1-inch bottom margin; do not let paragraph-like
      // blocks creep into that reserve space after they render.
      var reserveAfter = Math.max(lineHeightPx * 2, pageMarginPx);
      return (remain - height) < reserveAfter;
    }
    if(/^H[1-6]$/.test(tag)) return true;
    if(tag === 'TABLE' || tag === 'FIGURE' || tag === 'IMG' || tag === 'BLOCKQUOTE' || tag === 'PRE') return true;
    if(block.classList){
      if(
        block.classList.contains('aq-table-block') ||
        block.classList.contains('aq-figure-block') ||
        block.classList.contains('aq-avoid-break') ||
        block.classList.contains('aq-keep-group')
      ){
        return true;
      }
    }
    return false;
  }

  // Parse previously injected margin-top values so we can subtract them from
  // offsetHeight measurements (which don't include margin) — prevents feedback loop.
  function parsePreviousGaps(doc){
    var gaps = {};
    var styleEl = doc ? safeGetElementById(doc, 'aq-page-gap-style') : null;
    if(!styleEl || !styleEl.textContent) return gaps;
    var re = /nth-child\((\d+)\)\{margin-top:(\d+)px/g;
    var m;
    while((m = re.exec(styleEl.textContent)) !== null){
      gaps[parseInt(m[1], 10)] = parseInt(m[2], 10);
    }
    return gaps;
  }

  function resolveLayoutEditor(){
    if(typeof window !== 'undefined' && window.editor && window.editor.chain) return window.editor;
    if(typeof globalThis !== 'undefined' && globalThis.editor && globalThis.editor.chain) return globalThis.editor;
    return null;
  }

  function isAutoSplitParagraphBlock(block){
    if(!block || !block.nodeName) return false;
    if(String(block.nodeName || '').toUpperCase() !== 'P') return false;
    if(block.classList && block.classList.contains('aq-page-break')) return false;
    return true;
  }

  function measureRangeHeight(view, fromPos, toPos){
    if(!view || typeof view.domAtPos !== 'function' || typeof document === 'undefined' || !document.createRange) return 0;
    try{
      var start = view.domAtPos(fromPos);
      var end = view.domAtPos(toPos);
      if(!start || !end || !start.node || !end.node) return 0;
      var range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      var rect = range.getBoundingClientRect ? range.getBoundingClientRect() : null;
      if(!rect) return 0;
      return Math.max(0, parseInt(rect.height, 10) || 0, parseInt(rect.bottom - rect.top, 10) || 0);
    }catch(_e){
      return 0;
    }
  }

  function findSplitPosForBlock(view, block, contentFrom, contentTo, remainingSpace, doc){
    var low = Math.max(contentFrom + 1, 0);
    var high = Math.max(low, contentTo - 1);
    var best = null;
    while(low <= high){
      var mid = Math.floor((low + high) / 2);
      var measured = measureRangeHeight(view, contentFrom, mid);
      if(measured > 0 && measured <= remainingSpace){
        best = mid;
        low = mid + 1;
      }else{
        high = mid - 1;
      }
    }
    if(best == null) return null;
    var snap = best;
    var safety = 0;
    while(snap > contentFrom + 1 && safety < 48){
      var prev = doc && typeof doc.textBetween === 'function' ? String(doc.textBetween(snap - 1, snap, '', '') || '') : '';
      if(/[\s\u00a0]/.test(prev)) return snap;
      snap--;
      safety++;
    }
    return best;
  }

  function maybeAutoSplitOverflowParagraph(editorDom, pageContentHeight, pageTotalHeight, editorView){
    var editor = resolveLayoutEditor();
    if(!editorDom || !editorView || !editorView.state || !editorView.state.doc || !editor || !editor.chain) return false;
    var blocks = Array.from(editorDom && editorDom.children || []);
    var visualOffset = 0;
    for(var index = 0; index < blocks.length; index++){
      var block = blocks[index];
      var height = measureBlockHeight(block);
      if(!height) continue;
      var withinPage = Math.max(0, visualOffset) % pageTotalHeight;
      if(index > 0 && withinPage + height > pageContentHeight && isAutoSplitParagraphBlock(block)){
        var remaining = Math.max(0, pageContentHeight - withinPage);
        try{
          var startPos = editorView.posAtDOM(block, 0);
          var nodePos = Math.max(0, (parseInt(startPos, 10) || 0) - 1);
          var resolved = editorView.state.doc.resolve(nodePos);
          var node = (resolved && resolved.nodeAfter) || editorView.state.doc.nodeAt(nodePos);
          if(!node || !node.type || node.type.name !== 'paragraph' || node.nodeSize <= 2) continue;
          var contentFrom = nodePos + 1;
          var contentTo = nodePos + node.nodeSize - 1;
          var splitPos = findSplitPosForBlock(editorView, block, contentFrom, contentTo, remaining, editorView.state.doc);
          if(splitPos != null){
            var html = '<p class="aq-page-break" data-indent-mode="none"><br></p>';
            if(editor.chain().focus().insertContentAt(splitPos, html).run()){
              return true;
            }
          }
        }catch(_e){}
      }
      visualOffset += height;
    }
    return false;
  }

  function isHeadingBlock(block){
    if(!block || !block.nodeName) return false;
    return /^H[1-6]$/.test(String(block.nodeName).toUpperCase());
  }

  function applyPageGaps(editorDom, pageContentHeight, pageTotalHeight, options){
    options = options || {};
    var doc = editorDom.ownerDocument || (typeof document !== 'undefined' ? document : null);
    var prevGaps = parsePreviousGaps(doc);
    var blocks = Array.from(editorDom && editorDom.children || []);
    var visualOffset = 0;
    var rules = [];
    var widowOrphan = options.widowOrphan || state.widowOrphan || {};
    var keepWithNext = widowOrphan.keepWithNext !== false;
    var lineHeightPx = Math.max(12, parseInt(widowOrphan.lineHeightPx, 10) || 32);
    var orphanMinLines = Math.max(1, parseInt(widowOrphan.minLines, 10) || 2);
    blocks.forEach(function(block, index){
      // nth-child is 1-based. Recompute gap needs from block heights instead
      // of subtracting previous CSS margins; block measurements do not include
      // margins, and subtracting old gaps can erase still-valid page breaks.
      var height = measureBlockHeight(block);
      if(!height) return;
      var withinPage = Math.max(0, visualOffset) % pageTotalHeight;
      var pushed = false;
      if(index > 0 && withinPage + height > pageContentHeight){
        var remaining = Math.max(0, pageContentHeight - withinPage);
        if(canForcePageBreakBefore(block, height, pageContentHeight, remaining, options)){
          var gap = Math.max(0, pageTotalHeight - withinPage);
          rules.push('#apaed .ProseMirror>*:nth-child(' + (index + 1) + '){margin-top:' + gap + 'px!important;}');
          visualOffset += gap;
          pushed = true;
        }
      }
      // Keep-with-next for headings: if a heading fits on the current page but
      // the next block would be orphaned (zero or insufficient follow-up lines
      // on this page), push the heading to the next page together with the
      // following content.
      if(!pushed && keepWithNext && isHeadingBlock(block)){
        var next = blocks[index + 1];
        if(next){
          var nextHeight = measureBlockHeight(next);
          var afterHeading = withinPage + height;
          var spaceAfter = Math.max(0, pageContentHeight - afterHeading);
          var minFollowUp = Math.max(lineHeightPx * orphanMinLines, Math.min(nextHeight, lineHeightPx * 2));
          if(afterHeading <= pageContentHeight && spaceAfter < minFollowUp){
            var gapKwn = Math.max(0, pageTotalHeight - withinPage);
            rules.push('#apaed .ProseMirror>*:nth-child(' + (index + 1) + '){margin-top:' + gapKwn + 'px!important;}');
            visualOffset += gapKwn;
          }
        }
      }
      visualOffset += height;
    });
    var doc = editorDom.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if(doc){
      var styleEl = safeGetElementById(doc, 'aq-page-gap-style');
      if(!styleEl && typeof doc.createElement === 'function'){
        styleEl = doc.createElement('style');
        styleEl.id = 'aq-page-gap-style';
        if(doc.head && typeof doc.head.appendChild === 'function'){
          doc.head.appendChild(styleEl);
        }else if(typeof doc.appendChild === 'function'){
          doc.appendChild(styleEl);
        }
      }
      var newCss = rules.join('');
      if(styleEl.textContent !== newCss){
        styleEl.textContent = newCss;
      }
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
    var pageMarginTop = metrics.pageMarginTop;
    var pageMarginBottom = metrics.pageMarginBottom;
    var pageGap = metrics.pageGap;
    var pageVerticalPadding = metrics.pageVerticalPadding;
    var isProseMirrorFlow = !!(editorDom && editorDom.classList && typeof editorDom.classList.contains === 'function' && editorDom.classList.contains('ProseMirror'));
    // Keep physical page gaps visible in live editing (A4 page boundaries).
    // We still disable ProseMirror masks below to avoid clipping.
    var effectivePageGap = pageGap;
    var pageStep = pageHeight + effectivePageGap;
    var editorView = options.editorView || null;
    var doc = options.doc || editorDom.ownerDocument || page.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if(typeof page.querySelectorAll === 'function'){
      page.querySelectorAll('.page-break-overlay,.page-number,.aq-margin-mask').forEach(function(el){ el.remove(); });
    }
    if(typeof editorDom.querySelectorAll === 'function'){
      editorDom.querySelectorAll('.pg-spacer').forEach(function(el){ el.remove(); });
    }
    if(maybeAutoSplitOverflowParagraph(editorDom, pageContentHeight, pageTotalHeight, editorView)){
      return 0;
    }
    var visualContentHeight = applyPageGaps(editorDom, pageContentHeight, pageStep, {
      widowOrphan: options.widowOrphan || state.widowOrphan,
      pageMargin: pageMargin,
      pageMarginTop: pageMarginTop,
      pageMarginBottom: pageMarginBottom
    });
    var contentHeight = Math.max(editorDom.scrollHeight || 0, editorDom.offsetHeight || 0, visualContentHeight);
    var pageCount = Math.max(1, Math.ceil(contentHeight / pageStep));
    var viewportMinHeight = scrollEl ? Math.max(pageStep, (scrollEl.clientHeight || 0) + 44) : pageStep;
    page.style.minHeight = Math.max(viewportMinHeight, pageCount * pageStep, contentHeight + pageVerticalPadding) + 'px';
    renderPageSheets(page, pageCount, {
      doc: doc,
      pageStep: pageStep
    });
    if(typeof page.querySelectorAll === 'function'){
      page.querySelectorAll('.aq-page-gap-cover').forEach(function(el){ el.remove(); });
    }
    if(doc && typeof doc.createElement === 'function'){
      for(var p = 0; p < pageCount - 1; p++){
        var overlay = doc.createElement('div');
        overlay.className = 'page-break-overlay';
        overlay.style.top = (p * pageStep + pageHeight) + 'px';
        overlay.style.height = effectivePageGap + 'px';
        page.appendChild(overlay);
      }
        var maskLayer = doc && typeof doc.getElementById === 'function' ? doc.getElementById('aq-mask-layer') : null;
        if(maskLayer){
          maskLayer.innerHTML = '';
          if(maskLayer.style) maskLayer.style.display = isProseMirrorFlow ? 'none' : '';
          if(!isProseMirrorFlow){
            for(var m = 0; m < pageCount; m++){
              var topMask = doc.createElement('div');
              topMask.className = 'aq-margin-mask';
              topMask.style.top = (m * pageStep) + 'px';
              topMask.style.height = pageMarginTop + 'px';
              topMask.style.left = '0';
              topMask.style.width = '100%';
              maskLayer.appendChild(topMask);

              var bottomMask = doc.createElement('div');
              bottomMask.className = 'aq-margin-mask';
              bottomMask.style.top = (m * pageStep + pageHeight - pageMarginBottom) + 'px';
              bottomMask.style.height = pageMarginBottom + 'px';
              bottomMask.style.left = '0';
              bottomMask.style.width = '100%';
              maskLayer.appendChild(bottomMask);
            }
          }
        }
      if(showPageNumbers){
        buildPageNumberTops(pageCount, pageStep, 24).forEach(function(top, index){
          var num = doc.createElement('div');
          num.className = 'page-number';
          num.textContent = String(index + 1);
          num.style.top = top + 'px';
          page.appendChild(num);
        });
      }
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
      page: options.page || safeGetElementById(doc, 'apapage'),
      label: options.label || safeGetElementById(doc, 'zoomLbl')
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
    var label = safeGetElementById(doc, 'zoomLbl');
    return editorZoom({
      doc: doc,
      delta: options.delta,
      currentZoom: parseInt((label || {}).textContent, 10) || 100,
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

  // ── Page size presets ──
  var PAGE_SIZES = {
    A4:     { width:'21cm',     height:'29.7cm',   label:'A4' },
    Letter: { width:'21.59cm',  height:'27.94cm',  label:'Letter' },
    Legal:  { width:'21.59cm',  height:'35.56cm',  label:'Legal' },
    A5:     { width:'14.8cm',   height:'21cm',     label:'A5' }
  };

  function getPageSizes(){ return PAGE_SIZES; }

  function setPageSize(preset, options){
    options = options || {};
    var size = PAGE_SIZES[preset];
    if(!size) return false;
    var root = typeof document !== 'undefined' ? document.documentElement : null;
    if(!root) return false;
    root.style.setProperty('--aq-page-width', size.width);
    root.style.setProperty('--aq-page-height', size.height);
    state.pageSize = preset;
    // Recalculate page metrics
    schedulePageSync({
      delay: 50,
      page: options.page || safeGetElementById(typeof document !== 'undefined' ? document : null, 'apapage'),
      editorDom: options.editorDom,
      scrollEl: options.scrollEl,
      showPageNumbers: options.showPageNumbers
    });
    return true;
  }

  function getPageSize(){
    return state.pageSize || 'A4';
  }

  function normalizeMarginPx(value, fallback){
    if(value == null || value === '') return Math.max(APA_MARGIN_PX, parseInt(fallback, 10) || APA_MARGIN_PX);
    if(typeof value === 'number'){
      return Math.max(APA_MARGIN_PX, Math.round(value));
    }
    var text = String(value).trim().toLowerCase();
    if(!text) return Math.max(APA_MARGIN_PX, parseInt(fallback, 10) || APA_MARGIN_PX);
    var match = text.match(/^(\d+(?:\.\d+)?)(px|pt|in|cm|mm)?$/);
    if(!match){
      return Math.max(APA_MARGIN_PX, parseInt(fallback, 10) || APA_MARGIN_PX);
    }
    var amount = parseFloat(match[1]) || 0;
    var unit = match[2] || 'px';
    var px = amount;
    if(unit === 'pt') px = amount * (96 / 72);
    else if(unit === 'in') px = amount * 96;
    else if(unit === 'cm') px = amount * (96 / 2.54);
    else if(unit === 'mm') px = amount * (96 / 25.4);
    return Math.max(APA_MARGIN_PX, Math.round(px));
  }

  function setPageMargins(margins, options){
    options = options || {};
    var root = typeof document !== 'undefined' ? document.documentElement : null;
    if(!root) return false;
    var current = state.pageMargins || {
      top: APA_MARGIN_PX,
      right: APA_MARGIN_PX,
      bottom: APA_MARGIN_PX,
      left: APA_MARGIN_PX
    };
    margins = margins || {};
    var top = normalizeMarginPx(margins.top, current.top);
    var right = normalizeMarginPx(margins.right, current.right);
    var bottom = normalizeMarginPx(margins.bottom, current.bottom);
    var left = normalizeMarginPx(margins.left, current.left);
    var unified = Math.max(top, right, bottom, left);
    root.style.setProperty('--aq-page-margin-top', top + 'px');
    root.style.setProperty('--aq-page-margin-right', right + 'px');
    root.style.setProperty('--aq-page-margin-bottom', bottom + 'px');
    root.style.setProperty('--aq-page-margin-left', left + 'px');
    root.style.setProperty('--aq-page-margin', unified + 'px');
    root.style.setProperty('--aq-page-content-height', 'calc(var(--aq-page-height) - ' + top + 'px - ' + bottom + 'px)');
    state.pageMargins = { top:top, right:right, bottom:bottom, left:left };
    schedulePageSync({
      delay: parseInt(options.delay, 10) || 50,
      page: options.page || safeGetElementById(typeof document !== 'undefined' ? document : null, 'apapage'),
      editorDom: options.editorDom,
      scrollEl: options.scrollEl,
      showPageNumbers: options.showPageNumbers
    });
    return true;
  }

  function getPageMargins(){
    return Object.assign({}, state.pageMargins || {
      top: APA_MARGIN_PX,
      right: APA_MARGIN_PX,
      bottom: APA_MARGIN_PX,
      left: APA_MARGIN_PX
    });
  }

  function setWidowOrphanControl(options){
    options = options || {};
    state.widowOrphan = {
      enabled: options.enabled !== false,
      minLines: Math.max(1, parseInt(options.minLines, 10) || (state.widowOrphan && state.widowOrphan.minLines) || 2),
      lineHeightPx: Math.max(12, parseInt(options.lineHeightPx, 10) || (state.widowOrphan && state.widowOrphan.lineHeightPx) || 32)
    };
    return getWidowOrphanControl();
  }

  function getWidowOrphanControl(){
    return Object.assign({}, state.widowOrphan || {
      enabled: true,
      minLines: 2,
      lineHeightPx: 32
    });
  }

  function setPageLayout(options){
    options = options || {};
    if(options.size){
      setPageSize(options.size, options);
    }
    if(options.margins){
      setPageMargins(options.margins, options);
    }
    if(options.widowOrphan){
      setWidowOrphanControl(options.widowOrphan);
    }
    schedulePageSync({
      delay: parseInt(options.delay, 10) || 60,
      page: options.page || safeGetElementById(typeof document !== 'undefined' ? document : null, 'apapage'),
      editorDom: options.editorDom,
      scrollEl: options.scrollEl,
      showPageNumbers: options.showPageNumbers,
      widowOrphan: state.widowOrphan
    });
    return true;
  }

  // ── Paragraph spacing ──
  function setParagraphSpacing(before, after){
    var root = typeof document !== 'undefined' ? document.documentElement : null;
    if(!root) return false;
    if(before != null) root.style.setProperty('--aq-paragraph-spacing-before', before + 'pt');
    if(after != null) root.style.setProperty('--aq-paragraph-spacing-after', after + 'pt');
    return true;
  }

  // ── Explicit page break ──
  function insertPageBreak(editor){
    if(!editor || !editor.chain) return false;
    editor.chain().focus().setHardBreak().run();
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
    schedulePageSync: schedulePageSync,
    PAGE_SIZES: PAGE_SIZES,
    getPageSizes: getPageSizes,
    setPageLayout: setPageLayout,
    setPageSize: setPageSize,
    getPageSize: getPageSize,
    setPageMargins: setPageMargins,
    getPageMargins: getPageMargins,
    setWidowOrphanControl: setWidowOrphanControl,
    getWidowOrphanControl: getWidowOrphanControl,
    setParagraphSpacing: setParagraphSpacing,
    insertPageBreak: insertPageBreak
  };
});
