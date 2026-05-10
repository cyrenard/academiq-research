/* AQ Engine — Selection layer (Step 1 of editor mode)
 *
 * Provides:
 *   • Document offset model (anchor + focus, both global doc offsets)
 *   • Mouse hit-testing: click → docOffset. Click+drag selects range.
 *   • Double-click selects word, triple-click selects line.
 *   • Keyboard navigation: arrows (with shift to extend), Home/End, Ctrl+A.
 *   • Visual: highlight rects under each line that intersects the range.
 *   • Caret: 1px vertical bar at focus position with CSS blink.
 *
 * Read-only for now — text input is a separate later phase.
 */
(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){ module.exports = factory(); return; }
  root.AQEngineSelection = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){

  // Inject CSS for highlight + caret once.
  var STYLE_ID = 'aq-engine-selection-style';
  var CARET_HEIGHT_PX = 16; // 12pt at 96dpi.
  function ensureStyle(doc){
    if(doc.getElementById(STYLE_ID)) return;
    var s = doc.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.aq-engine-page { user-select:none; }',
      '.aq-sel-rect { position:absolute; background:rgba(26,68,128,.22); pointer-events:none; z-index:1; }',
      '.aq-sel-caret { position:absolute; width:1px; background:#1d1b16; pointer-events:none; z-index:3; animation:aq-sel-blink 1s step-end infinite; }',
      '@keyframes aq-sel-blink { 50% { opacity:0; } }',
      '.aq-engine-line { z-index:2; }'
    ].join('\n');
    doc.head.appendChild(s);
  }

  // Locate which item within a line a given x falls into. Accounts for the
  // line's rendered X (which differs from line.x for right/center align) and
  // any extraSpace (justify) padded to whitespace items.
  function hitTestLine(lineEl, clientX){
    var line = lineEl._aqLine;
    if(!line) return null;
    var lineRect = lineEl.getBoundingClientRect();
    var localX = clientX - lineRect.left;
    if(localX < 0) return { offset: line.offsetStart, x: 0 };

    var extra = lineEl._aqExtraSpace || 0;
    var acc = 0;
    var lastValidOffset = line.offsetStart;
    for(var i = 0; i < line.items.length; i++){
      var it = line.items[i];
      var itemWidth = it.width + (it.space ? extra : 0);
      if(localX <= acc + itemWidth){
        // Click is inside this item — measure within text to find char offset
        var inItem = localX - acc;
        var charOffset = pickCharOffset(it, inItem);
        return { offset: it.offsetStart + charOffset, x: acc + charPrefixWidth(it, charOffset) };
      }
      acc += itemWidth;
      lastValidOffset = it.offsetEnd;
    }
    return { offset: lastValidOffset, x: acc };
  }

  // Approximate char offset within an item given a local x. Uses a simple
  // proportional first guess + measureText refinement (binary search).
  function pickCharOffset(item, x){
    if(!item.text || x <= 0) return 0;
    if(x >= item.width) return item.text.length;
    // Binary search for tightest fit
    var engine = window.AQEngine || root.AQEngine;
    var ctx = engine ? engine._measureCtx() : null;
    if(!ctx) return Math.round((x / item.width) * item.text.length);
    var fontStr = '';
    if(item.font){
      var size = (item.font.sizePt || 12) * 96 / 72;
      fontStr = (item.font.style || 'normal') + ' ' + (item.font.weight || '400') + ' ' + size + 'px ' + (item.font.family || 'serif');
    }
    ctx.font = fontStr;
    var lo = 0, hi = item.text.length, best = 0;
    while(lo <= hi){
      var mid = (lo + hi) >> 1;
      var w = ctx.measureText(item.text.slice(0, mid)).width;
      if(w <= x){ best = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    // Snap to nearest char boundary for natural feel
    if(best < item.text.length){
      var wA = ctx.measureText(item.text.slice(0, best)).width;
      var wB = ctx.measureText(item.text.slice(0, best + 1)).width;
      if((x - wA) > (wB - x)) best++;
    }
    return best;
  }

  function charPrefixWidth(item, charOffset){
    if(!item.text || charOffset <= 0) return 0;
    if(charOffset >= item.text.length) return item.width;
    var engine = window.AQEngine || root.AQEngine;
    var ctx = engine ? engine._measureCtx() : null;
    if(!ctx) return (charOffset / item.text.length) * item.width;
    var size = (item.font.sizePt || 12) * 96 / 72;
    ctx.font = (item.font.style || 'normal') + ' ' + (item.font.weight || '400') + ' ' + size + 'px ' + (item.font.family || 'serif');
    return ctx.measureText(item.text.slice(0, charOffset)).width;
  }

  // Find page element at clientY (Iterates container's page children)
  function pageElAtPoint(container, clientY){
    var pages = container.querySelectorAll('.aq-engine-page');
    if(!pages.length) return null;
    for(var i = 0; i < pages.length; i++){
      var r = pages[i].getBoundingClientRect();
      if(clientY >= r.top && clientY <= r.bottom) return pages[i];
    }
    // Fallback: nearest page by vertical distance
    var best = null, bestDist = Infinity;
    for(var j = 0; j < pages.length; j++){
      var rr = pages[j].getBoundingClientRect();
      var d = clientY < rr.top ? rr.top - clientY : (clientY > rr.bottom ? clientY - rr.bottom : 0);
      if(d < bestDist){ best = pages[j]; bestDist = d; }
    }
    return best;
  }

  // Find line element on page at clientY. Lines are absolute-positioned.
  function lineElAtPoint(pageEl, clientY){
    var lines = pageEl.querySelectorAll('.aq-engine-line');
    var best = null, bestDist = Infinity;
    for(var i = 0; i < lines.length; i++){
      var r = lines[i].getBoundingClientRect();
      if(clientY >= r.top && clientY <= r.bottom) return lines[i];
      var d = clientY < r.top ? r.top - clientY : clientY - r.bottom;
      if(d < bestDist){ best = lines[i]; bestDist = d; }
    }
    return best; // nearest if no exact hit
  }

  function pointToOffset(container, clientX, clientY){
    var pageEl = pageElAtPoint(container, clientY);
    if(!pageEl) return null;
    var lineEl = lineElAtPoint(pageEl, clientY);
    if(!lineEl) return null;
    var hit = hitTestLine(lineEl, clientX);
    if(!hit) return null;
    return { offset: hit.offset, lineEl: lineEl, x: hit.x };
  }

  // ── Selection state ───────────────────────────────────────────────────────
  function createSelection(opts){
    var doc = opts.doc || document;
    var container = opts.container;
    if(!container) throw new Error('AQEngineSelection: container required');
    ensureStyle(doc);

    var anchor = 0, focus = 0;
    var dragging = false;
    var listeners = [];
    var overlayPagePool = []; // per-page overlay containers for selection rects

    function getPageOverlay(pageEl){
      var o = pageEl.querySelector(':scope > .aq-sel-overlay');
      if(o) return o;
      o = doc.createElement('div');
      o.className = 'aq-sel-overlay';
      o.style.position = 'absolute';
      o.style.inset = '0';
      o.style.pointerEvents = 'none';
      pageEl.appendChild(o);
      return o;
    }

    function clearVisuals(){
      var pages = container.querySelectorAll('.aq-engine-page');
      for(var i = 0; i < pages.length; i++){
        var o = pages[i].querySelector(':scope > .aq-sel-overlay');
        if(o) o.innerHTML = '';
      }
    }

    function paintSelection(){
      clearVisuals();
      var lo = Math.min(anchor, focus);
      var hi = Math.max(anchor, focus);
      var collapsed = (lo === hi);

      var pages = container.querySelectorAll('.aq-engine-page');
      for(var p = 0; p < pages.length; p++){
        var pageEl = pages[p];
        var overlay = getPageOverlay(pageEl);
        var lineEls = pageEl.querySelectorAll('.aq-engine-line');
        for(var li = 0; li < lineEls.length; li++){
          var lineEl = lineEls[li];
          var line = lineEl._aqLine; if(!line) continue;
          var lStart = line.offsetStart, lEnd = line.offsetEnd;
          // Caret: only at the focus offset
          if(collapsed && focus >= lStart && focus <= lEnd){
            var caretX = offsetToLineX(lineEl, focus);
            var caret = doc.createElement('div');
            var lineTop = parseFloat(lineEl.style.top) || 0;
            var lineHeight = parseFloat(lineEl.style.height) || CARET_HEIGHT_PX;
            var caretTop = lineTop + Math.max(0, (lineHeight - CARET_HEIGHT_PX) / 2);
            caret.className = 'aq-sel-caret';
            caret.style.left = (lineEl._aqRenderedX + caretX) + 'px';
            caret.style.top  = caretTop + 'px';
            caret.style.height = CARET_HEIGHT_PX + 'px';
            overlay.appendChild(caret);
          }
          // Highlight rect
          if(!collapsed && hi > lStart && lo < lEnd){
            var fromX = offsetToLineX(lineEl, Math.max(lo, lStart));
            var toX   = offsetToLineX(lineEl, Math.min(hi, lEnd));
            if(toX < fromX) { var t = fromX; fromX = toX; toX = t; }
            var rect = doc.createElement('div');
            rect.className = 'aq-sel-rect';
            rect.style.left = (lineEl._aqRenderedX + fromX) + 'px';
            rect.style.top  = (parseFloat(lineEl.style.top) || 0) + 'px';
            rect.style.width  = Math.max(2, toX - fromX) + 'px';
            rect.style.height = lineEl.style.height;
            overlay.appendChild(rect);
          }
        }
      }
    }

    // Inverse hit test: where (in line-local x) does a given offset land?
    function offsetToLineX(lineEl, off){
      var line = lineEl._aqLine; if(!line) return 0;
      var extra = lineEl._aqExtraSpace || 0;
      var acc = 0;
      for(var i = 0; i < line.items.length; i++){
        var it = line.items[i];
        var itemWidth = it.width + (it.space ? extra : 0);
        if(off <= it.offsetEnd){
          var localOff = off - it.offsetStart;
          if(localOff <= 0) return acc;
          if(localOff >= it.text.length) return acc + itemWidth;
          return acc + charPrefixWidth(it, localOff);
        }
        acc += itemWidth;
      }
      return acc;
    }

    function setRange(a, f){
      anchor = a; focus = f;
      paintSelection();
      emit();
    }
    function emit(){
      var ev = { anchor: anchor, focus: focus, isCollapsed: anchor === focus };
      for(var i = 0; i < listeners.length; i++) try{ listeners[i](ev); }catch(e){ console.error(e); }
    }

    // ── Mouse handlers ──────────────────────────────────────────────────────
    var lastClickTime = 0, clickCount = 0, lastClickPos = 0;
    function onMouseDown(e){
      if(e.button !== 0) return;
      
      // Force focus on the input capture textarea if it exists
      var ta = doc.querySelector('textarea.aq-input-capture');
      if(ta && typeof ta.focus === 'function'){
        try { ta.focus({ preventScroll: true }); } catch(_e){ ta.focus(); }
      }

      var hit = pointToOffset(container, e.clientX, e.clientY);
      if(!hit) return;
      e.preventDefault();
      
      var now = Date.now();
      var samePos = Math.abs(hit.offset - lastClickPos) <= 2;
      if(samePos && (now - lastClickTime) < 380) clickCount++;
      else clickCount = 1;
      lastClickTime = now; lastClickPos = hit.offset;

      if(clickCount === 2){
        // Word selection
        var range = expandToWord(hit.offset, hit.lineEl);
        setRange(range.from, range.to);
        return;
      }
      if(clickCount >= 3){
        // Line selection
        var line = hit.lineEl._aqLine;
        setRange(line.offsetStart, line.offsetEnd);
        return;
      }

      anchor = focus = hit.offset;
      dragging = true;
      paintSelection();
      emit();
    }
    function onMouseMove(e){
      if(!dragging) return;
      var hit = pointToOffset(container, e.clientX, e.clientY);
      if(!hit) return;
      focus = hit.offset;
      paintSelection();
      emit();
    }
    function onMouseUp(){
      dragging = false;
    }

    // Expand offset to word boundaries by reading neighbour chars from the
    // item's text. Stops at whitespace.
    function expandToWord(off, lineEl){
      var line = lineEl._aqLine;
      var items = line.items;
      // Find the item containing off
      var hostItem = null;
      for(var i = 0; i < items.length; i++){
        if(off >= items[i].offsetStart && off <= items[i].offsetEnd){ hostItem = items[i]; break; }
      }
      if(!hostItem || hostItem.space) return { from: off, to: off };
      var localOff = off - hostItem.offsetStart;
      var text = hostItem.text;
      var s = localOff, e = localOff;
      while(s > 0 && /\S/.test(text.charAt(s - 1))) s--;
      while(e < text.length && /\S/.test(text.charAt(e))) e++;
      return { from: hostItem.offsetStart + s, to: hostItem.offsetStart + e };
    }

    // ── Keyboard handlers ───────────────────────────────────────────────────
    function getAllLines(){
      var out = [];
      var pages = container.querySelectorAll('.aq-engine-page');
      for(var p = 0; p < pages.length; p++){
        var lines = pages[p].querySelectorAll('.aq-engine-line');
        for(var l = 0; l < lines.length; l++) out.push(lines[l]);
      }
      return out;
    }
    function lineForOffset(off){
      var lines = getAllLines();
      for(var i = 0; i < lines.length; i++){
        var L = lines[i]._aqLine;
        if(off >= L.offsetStart && off <= L.offsetEnd) return { lineEl: lines[i], idx: i, all: lines };
      }
      // Fallback: clamp to last line
      return { lineEl: lines[lines.length - 1], idx: lines.length - 1, all: lines };
    }
    function onKeyDown(e){
      var lo = Math.min(anchor, focus), hi = Math.max(anchor, focus);
      var extend = e.shiftKey;
      var handled = true;
      switch(e.key){
        case 'ArrowLeft':
          focus = Math.max(0, focus - 1);
          if(!extend) anchor = focus;
          break;
        case 'ArrowRight':
          focus = focus + 1;
          if(!extend) anchor = focus;
          break;
        case 'ArrowUp': {
          var info = lineForOffset(focus);
          if(info.idx > 0){
            var newLineEl = info.all[info.idx - 1];
            var x = offsetToLineX(info.lineEl, focus);
            focus = lineXToOffset(newLineEl, x);
            if(!extend) anchor = focus;
          }
          break;
        }
        case 'ArrowDown': {
          var info2 = lineForOffset(focus);
          if(info2.idx < info2.all.length - 1){
            var newLineEl2 = info2.all[info2.idx + 1];
            var x2 = offsetToLineX(info2.lineEl, focus);
            focus = lineXToOffset(newLineEl2, x2);
            if(!extend) anchor = focus;
          }
          break;
        }
        case 'Home': {
          var infoH = lineForOffset(focus);
          focus = infoH.lineEl._aqLine.offsetStart;
          if(!extend) anchor = focus;
          break;
        }
        case 'End': {
          var infoE = lineForOffset(focus);
          focus = infoE.lineEl._aqLine.offsetEnd;
          if(!extend) anchor = focus;
          break;
        }
        case 'a':
          if(e.ctrlKey || e.metaKey){
            var allLines = getAllLines();
            if(allLines.length){
              anchor = allLines[0]._aqLine.offsetStart;
              focus  = allLines[allLines.length - 1]._aqLine.offsetEnd;
            }
          } else handled = false;
          break;
        default:
          handled = false;
      }
      if(handled){
        e.preventDefault();
        paintSelection();
        scrollCaretIntoView();
        emit();
      }
    }

    function scrollCaretIntoView(){
      // Find the caret element we just painted and ensure it's visible
      // within the scrollable container or its scrollable ancestor.
      var caret = container.querySelector('.aq-sel-caret');
      if(!caret) return;
      // The container may not itself scroll — find nearest scrollable ancestor
      var scroller = container;
      while(scroller && scroller !== doc.body){
        var oy = scroller.scrollHeight > scroller.clientHeight;
        var cs = scroller.ownerDocument.defaultView.getComputedStyle(scroller);
        if(oy && (cs.overflowY === 'auto' || cs.overflowY === 'scroll')) break;
        scroller = scroller.parentElement;
      }
      if(!scroller) scroller = container;
      var caretRect = caret.getBoundingClientRect();
      var scrRect = scroller.getBoundingClientRect();
      var pad = 24;
      if(caretRect.top < scrRect.top + pad){
        scroller.scrollTop -= (scrRect.top + pad - caretRect.top);
      } else if(caretRect.bottom > scrRect.bottom - pad){
        scroller.scrollTop += (caretRect.bottom - (scrRect.bottom - pad));
      }
    }

    function lineXToOffset(lineEl, x){
      var line = lineEl._aqLine;
      var extra = lineEl._aqExtraSpace || 0;
      var acc = 0;
      for(var i = 0; i < line.items.length; i++){
        var it = line.items[i];
        var itemWidth = it.width + (it.space ? extra : 0);
        if(x <= acc + itemWidth){
          var charOff = pickCharOffset(it, x - acc);
          return it.offsetStart + charOff;
        }
        acc += itemWidth;
      }
      return line.offsetEnd;
    }

    function attach(){
      container.tabIndex = 0;
      container.style.outline = 'none';
      container.addEventListener('mousedown', onMouseDown);
      doc.addEventListener('mousemove', onMouseMove);
      doc.addEventListener('mouseup',   onMouseUp);
      container.addEventListener('keydown', onKeyDown);
    }
    function detach(){
      container.removeEventListener('mousedown', onMouseDown);
      doc.removeEventListener('mousemove', onMouseMove);
      doc.removeEventListener('mouseup',   onMouseUp);
      container.removeEventListener('keydown', onKeyDown);
    }

    return {
      attach: attach,
      detach: detach,
      setRange: setRange,
      getRange: function(){ return { anchor: anchor, focus: focus, from: Math.min(anchor,focus), to: Math.max(anchor,focus) }; },
      onChange: function(fn){ listeners.push(fn); },
      repaint: paintSelection,
      // Public keyboard handler — input layer can forward arrow / Home / End
      // / Ctrl+A keys here when the hidden capture textarea owns focus.
      handleKey: onKeyDown
    };
  }

  return { create: createSelection, pointToOffset: pointToOffset };
});
