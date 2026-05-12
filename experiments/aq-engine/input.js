/* AQ Engine — Input layer (text + IME)
 *
 * Strategy: a hidden <textarea> sits near the caret and stays focused. All
 * text input — including IME composition (Turkish dead keys like ^ a, ı/İ
 * dotless, etc.) — flows through it. We translate browser input/composition
 * events into AQEngineDocument operations, then trigger a re-render.
 *
 * Why a hidden textarea instead of contentEditable on the stage?
 *   1. Browser's contentEditable would fight our absolute-positioned line
 *      boxes and try to manage its own selection / caret.
 *   2. Hidden textarea gives us perfect IME (compositionstart/update/end)
 *      across browsers without a custom composition pipeline.
 *   3. CodeMirror, Monaco, ProseMirror all use this pattern.
 */
(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){ module.exports = factory(); return; }
  root.AQEngineInput = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){

  function blockTextLength(b){
    var n = 0;
    var runs = (b && b.runs) || [];
    for(var i = 0; i < runs.length; i++) n += String(runs[i].text || '').length;
    return n;
  }

  function createInput(opts){
    var container = opts.container;                       // the stage element
    var doc = opts.doc;                                   // AQEngineDocument
    // selection is rebuilt on every reflow, so accept either a direct ref
    // (legacy) or a getter (preferred). We always read latest via getSel().
    var getSel = opts.selectionRef || function(){ return opts.selection; };
    var onChanged = opts.onChanged || function(){};

    if(!container || !doc || !getSel()) throw new Error('AQEngineInput: container, doc, selection(Ref) required');

    // ── Hidden capture textarea ────────────────────────────────────────────
    var ta = document.createElement('textarea');
    ta.className = 'aq-input-capture';
    ta.setAttribute('autocapitalize', 'off');
    ta.setAttribute('autocomplete',   'off');
    ta.setAttribute('autocorrect',    'off');
    ta.setAttribute('spellcheck',     'false');
    ta.setAttribute('aria-hidden',    'true');
    ta.style.cssText = [
      'position:fixed',
      'top:0', 'left:0',
      'width:1px', 'height:1px',
      'opacity:0.01',
      'pointer-events:none',
      'border:0',
      'padding:0',
      'margin:0',
      'outline:0',
      'resize:none',
      'overflow:hidden',
      'z-index:10000',
      'transform:translateZ(0)'
    ].join(';');
    document.body.appendChild(ta);

    var composing = false;
    var compositionStartOffset = -1; // offset where the IME composition started
    // Pending inline marks for the next insertText when selection is collapsed.
    // Mirrors Word's "press Ctrl+B then type → that text is bold". Cleared on
    // any non-insert action (cursor move, click, Enter, delete, etc.).
    var pendingMarks = {};
    var trigRefreshTimer = 0;
    function clearPending(){ pendingMarks = {}; reflectPending(); }
    function setPending(mark, value){ pendingMarks[mark] = !!value; reflectPending(); }
    function hasPending(){ for(var k in pendingMarks) if(pendingMarks[k] !== undefined) return true; return false; }
    function isTrackChangesEnabled(){
      try{
        var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
        if(root && root.AQTipTapWordCommands && typeof root.AQTipTapWordCommands.isTrackChangesEnabled === 'function'){
          return !!root.AQTipTapWordCommands.isTrackChangesEnabled();
        }
        return !!(root && root.__aqTrackChangesState && root.__aqTrackChangesState.enabled);
      }catch(_e){}
      return false;
    }
    function markTrackedDeletion(from, to){
      from = Math.max(0, Number(from || 0));
      to = Math.max(from, Number(to || from));
      if(to <= from) return false;
      doc.applyMark(from, to, 'trackDelete', true);
      return true;
    }
    function reflectPending(){
      // Surface pending state via a CSS class on the body so demo can style
      // toolbar buttons with the pending hint.
      document.body.dataset.aqPendingBold      = !!pendingMarks.bold;
      document.body.dataset.aqPendingItalic    = !!pendingMarks.italic;
      document.body.dataset.aqPendingUnderline = !!pendingMarks.underline;
    }

    // ── Edit operations ────────────────────────────────────────────────────
    function r(){ return getSel().getRange(); }

    function normalizeBibliographyTitleText(text){
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

    function blockText(block){
      return ((block && block.runs) || []).map(function(run){ return String(run && run.text || ''); }).join('');
    }

    function isBibliographyHeadingBlock(block){
      var t = normalizeBibliographyTitleText(blockText(block));
      return !!(block && (block._isBibHeading || (block.type === 'heading' && (t === 'kaynakca' || t === 'references' || t === 'bibliography' || t === 'kaynaklar'))));
    }

    function isBibliographyEntryBlock(block){
      var cls = String(block && block.attrs && block.attrs.class || '');
      return !!(block && (block._isBibEntry || (block.attrs && block.attrs.refId) || /\b(refe|aq-ref-entry)\b/.test(cls)));
    }

    function findBibliographyHeadingIndex(blocks){
      blocks = Array.isArray(blocks) ? blocks : [];
      for(var i = 0; i < blocks.length; i++){
        if(isBibliographyHeadingBlock(blocks[i])) return i;
      }
      return -1;
    }

    function blockStartOffset(blockIdx){
      var blocks = doc.get().blocks || [];
      var off = 0;
      for(var i = 0; i < blockIdx && i < blocks.length; i++){
        off += blockTextLength(blocks[i]) + 1;
      }
      return off;
    }

    function markManualBibliographyEditSoon(){
      if(typeof window === 'undefined') return;
      setTimeout(function(){
        try{
          var state = window.S || {};
          var docs = Array.isArray(state.docs) ? state.docs : [];
          var current = docs.find(function(item){ return item && item.id === state.curDoc; }) || null;
          if(current && window.AQBibliographyState && typeof window.AQBibliographyState.captureAQEngineBibliographyHTML === 'function'){
            window.AQBibliographyState.captureAQEngineBibliographyHTML(window.editor || null, current);
            if(typeof window.save === 'function') window.save();
          }
        }catch(_e){}
      }, 0);
    }

    function routeTypingBeforeBibliographyIfNeeded(at){
      var d = doc.get();
      var blocks = d.blocks || [];
      var loc = doc.locate(at);
      var block = blocks[loc.blockIdx];
      var isBibliographyEntry = isBibliographyEntryBlock(block);
      if(!isBibliographyHeadingBlock(block) && !isBibliographyEntry) return at;
      var headingIdx = isBibliographyHeadingBlock(block) ? loc.blockIdx : findBibliographyHeadingIndex(blocks);
      if(headingIdx < 0) return at;
      var blank = { type:'paragraph', runs:[{ text:'' }], firstLineIndentPx:36, font:{ sizePt:12, weight:'400', style:'normal' } };
      doc.replace(blocks.slice(0, headingIdx).concat([blank]).concat(blocks.slice(headingIdx)));
      onChanged();
      var nextAt = blockStartOffset(headingIdx);
      getSel().setRange(nextAt, nextAt);
      return nextAt;
    }

    function citationRunBoundsAtOffset(off){
      var d = doc.get();
      var cursor = 0;
      for(var bi = 0; bi < d.blocks.length; bi++){
        var block = d.blocks[bi] || {};
        var runs = block.runs || [];
        var intra = 0;
        for(var ri = 0; ri < runs.length; ri++){
          var run = runs[ri] || {};
          var text = String(run.text || '');
          var start = cursor + intra;
          var end = start + text.length;
          if(run.citation && off >= start && off <= end){
            return { from: start, to: end };
          }
          intra += text.length;
        }
        cursor += intra + 1;
      }
      return null;
    }

    function expandRangeToCitationRuns(from, to){
      var lo = Math.min(from, to);
      var hi = Math.max(from, to);
      var left = citationRunBoundsAtOffset(lo);
      var right = citationRunBoundsAtOffset(Math.max(lo, hi - 1));
      if(left && lo > left.from && lo < left.to) lo = left.from;
      if(right && hi > right.from && hi < right.to) hi = right.to;
      return { from: lo, to: hi };
    }

    function deleteCitationRunIfAtBoundary(offset, direction){
      var bounds = citationRunBoundsAtOffset(offset);
      if(!bounds) return false;
      if(direction === 'backward' && offset <= bounds.from) return false;
      if(direction === 'forward' && offset >= bounds.to) return false;
      if(isTrackChangesEnabled()) markTrackedDeletion(bounds.from, bounds.to);
      else doc.deleteRange(bounds.from, bounds.to);
      onChanged();
      getSel().setRange(bounds.from, bounds.from);
      scheduleTrigRefresh();
      return true;
    }

    function doInsertText(text){
      if(!text) return;
      try{
        (typeof window!=='undefined'&&window.__aqCiteDiag)&&console.warn('[AQ-CITE-DIAG] ' + JSON.stringify({
          t: Date.now(),
          event: 'input.doInsertText',
          text: String(text),
          inputLength: String(text).length,
          range: r()
        }));
      }catch(_diagErr){}
      if(isCitationTransactionBlocked() && String(text).length > 1){
        try{ (typeof window!=='undefined'&&window.__aqCiteDiag)&&console.warn('[AQ-CITE-DIAG] ' + JSON.stringify({ t: Date.now(), event: 'input.blockedByCitationTransaction', text: String(text) })); }catch(_e){}
        ta.value = '';
        return;
      }
      if(shouldSuppressPostCitationInput(text)){
        try{ (typeof window!=='undefined'&&window.__aqCiteDiag)&&console.warn('[AQ-CITE-DIAG] ' + JSON.stringify({ t: Date.now(), event: 'input.suppressedPostCitation', text: String(text) })); }catch(_e2){}
        ta.value = '';
        return;
      }
      var range = r();
      var tracking = isTrackChangesEnabled();
      if(range.from !== range.to){
        var expandedDelete = expandRangeToCitationRuns(range.from, range.to);
        if(tracking) markTrackedDeletion(expandedDelete.from, expandedDelete.to);
        else doc.deleteRange(expandedDelete.from, expandedDelete.to);
        range = { from: expandedDelete.from, to: expandedDelete.from };
      }
      var at = Math.min(range.from, range.to);
      if(range.from === range.to) at = routeTypingBeforeBibliographyIfNeeded(at);
      var locForManual = doc.locate(at);
      var blockForManual = (doc.get().blocks || [])[locForManual.blockIdx];
      var manualBibliographyEdit = isBibliographyEntryBlock(blockForManual) && !isBibliographyHeadingBlock(blockForManual);
      if(range.from === range.to){
        var citationBounds = citationRunBoundsAtOffset(at);
        if(citationBounds && at < citationBounds.to){
          at = citationBounds.to;
        }
      }
      doc.insertText(at, text);
      var newOff = at + text.length;
      if(doc.rangeHasMark && doc.rangeHasMark(at, newOff, 'citation')){
        doc.applyMark(at, newOff, 'citation', false);
      }
      if(tracking) doc.applyMark(at, newOff, 'trackInsert', true);
      // Apply pending marks to just the inserted range so Ctrl+B → typing
      // produces bold characters without changing surrounding text.
      if(hasPending()){
        for(var k in pendingMarks){
          if(pendingMarks[k] !== undefined){
            doc.applyMark(at, newOff, k, pendingMarks[k]);
          }
        }
      }
      onChanged();
      if(manualBibliographyEdit) markManualBibliographyEditSoon();
      getSel().setRange(newOff, newOff);

      scheduleTrigRefresh();
    }

    function normalizeSuppressedInput(text){
      return String(text || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr');
    }

    function shouldSuppressPostCitationInput(text){
      if(typeof window === 'undefined') return false;
      var normalized = normalizeSuppressedInput(text);
      if(!normalized) return false;
      var lastCitation = normalizeSuppressedInput(window.__aqLastCitationText || '');
      if(normalized.length > 1 && lastCitation && (normalized === lastCitation || normalized.indexOf(lastCitation) >= 0 || lastCitation.indexOf(normalized) >= 0)){
        window.__aqSuppressNextInputUntil = Date.now() + 250;
        return true;
      }
      var persistentItems = Array.isArray(window.__aqLastCitationSuppressTexts) ? window.__aqLastCitationSuppressTexts : [];
      var matchesPersistentCitationPayload = persistentItems.some(function(item){
        item = normalizeSuppressedInput(item);
        return item && normalized.length > 1 && (normalized === item || normalized.indexOf(item) >= 0 || item.indexOf(normalized) >= 0);
      });
      if(matchesPersistentCitationPayload){
        window.__aqSuppressNextInputUntil = Date.now() + 250;
        return true;
      }
      if(Date.now() > (window.__aqSuppressNextInputUntil || 0)) return false;
      var items = Array.isArray(window.__aqSuppressNextInputTexts) ? window.__aqSuppressNextInputTexts : [];
      var looksLikeCapturedAutocomplete = normalized.length > 1;
      var matchesCitationPayload = items.some(function(item){
        item = normalizeSuppressedInput(item);
        return item && normalized.length > 1 && (normalized === item || item.indexOf(normalized) >= 0 || normalized.indexOf(item) >= 0);
      });
      if(!looksLikeCapturedAutocomplete && !matchesCitationPayload) return false;
      window.__aqSuppressNextInputUntil = Date.now() + 250;
      return true;
    }

    function isCitationTransactionBlocked(){
      if(typeof window === 'undefined') return false;
      return !!window.__aqCitationTransactionActive || Date.now() < (window.__aqCitationInputBlockedUntil || 0);
    }

    function isSinglePrintableKey(e){
      return !!(e && typeof e.key === 'string' && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey);
    }

    function shouldBlockInputEvent(e){
      if(!isCitationTransactionBlocked()) return false;
      var data = e && typeof e.data === 'string' ? e.data : '';
      var value = String(ta.value || '');
      var payload = data || value;
      return String(payload || '').length > 1;
    }

    function scheduleTrigRefresh(){
      if(isCitationTransactionBlocked()) return;
      if(trigRefreshTimer) clearTimeout(trigRefreshTimer);
      trigRefreshTimer = setTimeout(function(){
        trigRefreshTimer = 0;
        if(isCitationTransactionBlocked()) return;
        try {
          if(window.AQCitationRuntime && typeof window.AQCitationRuntime.refreshFromEditor === 'function'){
            window.AQCitationRuntime.refreshFromEditor();
          } else if(typeof window.checkTrig === 'function'){
            window.checkTrig();
          }
        } catch(_e){}
      }, 350);
    }

    function doSplitBlock(){
      clearPending();
      var range = r();
      if(range.from !== range.to) doc.deleteRange(range.from, range.to);
      var at = Math.min(range.from, range.to);
      // Enter on an empty list item — exit the list instead of creating
      // another empty bullet.
      var loc = doc.locate(at);
      var block = doc.get().blocks[loc.blockIdx];
      if(isBibliographyHeadingBlock(block) || isBibliographyEntryBlock(block)){
        var nextAt = routeTypingBeforeBibliographyIfNeeded(at);
        getSel().setRange(nextAt, nextAt);
        scheduleTrigRefresh();
        return;
      }
      var manualBibliographySplit = isBibliographyEntryBlock(block);
      if(block && block.list && blockTextLength(block) === 0){
        doc.setListType(loc.blockIdx, null);
        onChanged();
        getSel().setRange(at, at);
        scheduleTrigRefresh();
        return;
      }
      doc.splitBlock(at);
      var newOff = at + 1;
      onChanged();
      if(manualBibliographySplit) markManualBibliographyEditSoon();
      getSel().setRange(newOff, newOff);
      scheduleTrigRefresh();
    }

    function doDeleteBackward(){
      clearPending();
      var range = r();
      var manualBibliographyEdit = false;
      if(range.from !== range.to){
        var expandedDelete = expandRangeToCitationRuns(range.from, range.to);
        var lo = expandedDelete.from;
        var delLoc = doc.locate(lo);
        manualBibliographyEdit = isBibliographyEntryBlock((doc.get().blocks || [])[delLoc.blockIdx]);
        if(isTrackChangesEnabled()) markTrackedDeletion(expandedDelete.from, expandedDelete.to);
        else doc.deleteRange(expandedDelete.from, expandedDelete.to);
        onChanged();
        if(manualBibliographyEdit) markManualBibliographyEditSoon();
        getSel().setRange(lo, lo);
        scheduleTrigRefresh();
        return;
      }
      if(range.from <= 0) return;
      if(deleteCitationRunIfAtBoundary(range.from, 'backward')) return;
      var loc = doc.locate(range.from);
      var blockLen = blockTextLength(doc.get().blocks[loc.blockIdx]);
      manualBibliographyEdit = isBibliographyEntryBlock((doc.get().blocks || [])[loc.blockIdx]);
      if(loc.intra === 0 && loc.blockIdx > 0){
        // Caret at very start of a block → merge with previous
        var newOff = doc.mergeWithPrevious(loc.blockIdx);
        onChanged();
        if(manualBibliographyEdit) markManualBibliographyEditSoon();
        if(newOff >= 0) getSel().setRange(newOff, newOff);
        scheduleTrigRefresh();
        return;
      }
      // Otherwise just delete one char back
      if(isTrackChangesEnabled()) markTrackedDeletion(range.from - 1, range.from);
      else doc.deleteRange(range.from - 1, range.from);
      onChanged();
      if(manualBibliographyEdit) markManualBibliographyEditSoon();
      getSel().setRange(range.from - 1, range.from - 1);
      scheduleTrigRefresh();
    }

    function doDeleteForward(){
      clearPending();
      var range = r();
      var manualBibliographyEdit = false;
      if(range.from !== range.to){
        var expandedDelete = expandRangeToCitationRuns(range.from, range.to);
        var lo = expandedDelete.from;
        var delLoc = doc.locate(lo);
        manualBibliographyEdit = isBibliographyEntryBlock((doc.get().blocks || [])[delLoc.blockIdx]);
        if(isTrackChangesEnabled()) markTrackedDeletion(expandedDelete.from, expandedDelete.to);
        else doc.deleteRange(expandedDelete.from, expandedDelete.to);
        onChanged();
        if(manualBibliographyEdit) markManualBibliographyEditSoon();
        getSel().setRange(lo, lo);
        scheduleTrigRefresh();
        return;
      }
      var docLen = doc.length();
      if(range.from >= docLen) return;
      if(deleteCitationRunIfAtBoundary(range.from, 'forward')) return;
      var loc = doc.locate(range.from);
      var block = doc.get().blocks[loc.blockIdx];
      manualBibliographyEdit = isBibliographyEntryBlock(block);
      var blockLen = blockTextLength(block);
      if(loc.intra >= blockLen && loc.blockIdx < doc.get().blocks.length - 1){
        // Caret at very end of a block → merge next block back
        var newOff = doc.mergeWithPrevious(loc.blockIdx + 1);
        onChanged();
        if(manualBibliographyEdit) markManualBibliographyEditSoon();
        if(newOff >= 0) getSel().setRange(newOff, newOff);
        scheduleTrigRefresh();
        return;
      }
      if(isTrackChangesEnabled()) markTrackedDeletion(range.from, range.from + 1);
      else doc.deleteRange(range.from, range.from + 1);
      onChanged();
      if(manualBibliographyEdit) markManualBibliographyEditSoon();
      getSel().setRange(range.from, range.from);
      scheduleTrigRefresh();
    }

    // ── Event wiring ───────────────────────────────────────────────────────
    function focusCapture(){
      if(!ta) return;
      try { ta.focus({ preventScroll: true }); } catch(_e){ ta.focus(); }
    }

    function scheduleFocusCapture(){
      clearPending();
      setTimeout(focusCapture, 0);
    }

    // Toggle superscript/subscript. These use two marks together:
    //   super → baselineShift = 4, fontScale = 0.7
    //   sub   → baselineShift = -2, fontScale = 0.7
    function toggleSuperSub(mode){
      var range = r();
      if(range.from === range.to) return; // pending super/sub not supported yet
      var shift = (mode === 'super') ? 4 : -2;
      var hasIt = doc.rangeHasMark(range.from, range.to, 'baselineShift');
      if(hasIt){
        // Remove super/sub
        doc.applyMark(range.from, range.to, 'baselineShift', false);
        doc.applyMark(range.from, range.to, 'fontScale', false);
      } else {
        doc.applyMark(range.from, range.to, 'baselineShift', shift);
        doc.applyMark(range.from, range.to, 'fontScale', 0.7);
      }
      onChanged();
      getSel().setRange(range.anchor, range.focus);
    }

    // Toggle an inline mark over the current selection. If collapsed,
    // set a pending mark so the next typed characters inherit that format.
    function toggleMark(mark){
      var range = r();
      if(range.from === range.to){
        // Collapsed: toggle pending mark for next insertText
        // Probe the character just before caret to determine current state
        var probe = Math.max(0, range.from - 1);
        var current = (range.from > 0) ? doc.rangeHasMark(probe, range.from, mark) : false;
        // If there's already a pending value for this mark, toggle that instead
        if(pendingMarks[mark] !== undefined) current = pendingMarks[mark];
        setPending(mark, !current);
        return;
      }
      var has = doc.rangeHasMark(range.from, range.to, mark);
      doc.applyMark(range.from, range.to, mark, !has);
      onChanged();
      getSel().setRange(range.anchor, range.focus);
    }

    // Focus the textarea on any pointer interaction with the stage.
    // Defer so selection's own pointer/mouse handlers can update the range first.
    container.addEventListener('pointerdown', scheduleFocusCapture, true);
    container.addEventListener('mousedown', scheduleFocusCapture);
    container.addEventListener('click', scheduleFocusCapture, true);

    // (No auto-refocus on focusin: would steal focus from intentionally
    // focused UI like paste dialogs / formatting popovers.)

    ta.addEventListener('compositionstart', function(){
      if(isCitationTransactionBlocked()){
        ta.value = '';
        return;
      }
      composing = true;
      compositionStartOffset = r().from;
      ta.value = '';
    });

    ta.addEventListener('compositionend', function(e){
      composing = false;
      if(isCitationTransactionBlocked()){
        ta.value = '';
        return;
      }
      var text = e.data || ta.value;
      ta.value = '';
      if(text) doInsertText(text);
    });

    // For non-IME plain key inputs, the textarea fires 'input' with the typed
    // chars. We also handle the case where some IMEs deliver via 'input'
    // without compositionend (rare).
    ta.addEventListener('input', function(e){
      try{
        (typeof window!=='undefined'&&window.__aqCiteDiag)&&console.warn('[AQ-CITE-DIAG] ' + JSON.stringify({
          t: Date.now(),
          event: 'textarea.input',
          data: e && e.data,
          inputType: e && e.inputType,
          value: ta.value,
          composing: composing,
          range: r()
        }));
      }catch(_diagErr){}
      if(composing) return; // wait for compositionend to commit
      if(shouldBlockInputEvent(e)){
        ta.value = '';
        if(e && typeof e.preventDefault === 'function') e.preventDefault();
        return;
      }
      var text = '';
      if(e && typeof e.data === 'string' && e.data.length){
        text = e.data;
        if(/^insert/i.test(String(e.inputType || '')) && text.length > 1 && shouldSuppressPostCitationInput(text)){
          ta.value = '';
          if(e && typeof e.preventDefault === 'function') e.preventDefault();
          return;
        }
        if(/^insertText$/i.test(String(e.inputType || '')) && text.length > 1){
          text = text.slice(-1);
        }
      }else{
        text = ta.value;
        if(e && /^insert/i.test(String(e.inputType || '')) && text.length > 1){
          text = text.slice(-1);
        }
      }
      ta.value = '';
      if(text) doInsertText(text);
    });

    ta.addEventListener('keydown', function(e){
      try{
        if(e && (e.key === ' ' || e.key === 'Enter' || e.key === 'Backspace' || e.key === '/' || String(e.key || '').toLowerCase() === 'r')){
          (typeof window!=='undefined'&&window.__aqCiteDiag)&&console.warn('[AQ-CITE-DIAG] ' + JSON.stringify({
            t: Date.now(),
            event: 'textarea.keydown',
            key: e.key,
            code: e.code,
            value: ta.value,
            range: r(),
            blocked: isCitationTransactionBlocked()
          }));
        }
      }catch(_diagErr){}
      if(isCitationTransactionBlocked() && !isSinglePrintableKey(e)){
        ta.value = '';
        if(e && typeof e.preventDefault === 'function') e.preventDefault();
        if(e && typeof e.stopPropagation === 'function') e.stopPropagation();
        if(e && typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        return;
      }
      if(composing) return;
      var key = e.key;
      var ctrl = e.ctrlKey || e.metaKey;

      // Undo / redo
      if(ctrl && (key === 'z' || key === 'Z')){
        e.preventDefault();
        var ok = e.shiftKey ? doc.redo() : doc.undo();
        if(ok) onChanged();
        return;
      }
      if(ctrl && (key === 'y' || key === 'Y')){
        e.preventDefault();
        if(doc.redo()) onChanged();
        return;
      }
      // Let Ctrl+A / Ctrl+C / Ctrl+X bubble to selection.js, which handles
      // selection nav. For text-affecting actions we handle here.
      if(ctrl && (key === 'a' || key === 'A')){
        e.preventDefault();
        var len = doc.length();
        getSel().setRange(0, len);
        return;
      }
      // Inline format toggles — bold/italic/underline/strike/super/sub
      var markKey = null;
      if(ctrl && (key === 'b' || key === 'B') && !e.shiftKey) markKey = 'bold';
      else if(ctrl && (key === 'i' || key === 'I')) markKey = 'italic';
      else if(ctrl && (key === 'u' || key === 'U')) markKey = 'underline';
      else if(ctrl && e.shiftKey && (key === 'x' || key === 'X')) markKey = 'strike';
      if(markKey){
        e.preventDefault();
        toggleMark(markKey);
        return;
      }
      // Superscript: Ctrl+Shift+= (or Ctrl+.)  Subscript: Ctrl+=  (or Ctrl+,)
      if(ctrl && (key === '.' || key === ',')){
        e.preventDefault();
        var isSup = (key === '.');
        toggleSuperSub(isSup ? 'super' : 'sub');
        return;
      }
      // Block type — Ctrl+0 = paragraph, Ctrl+1..6 = heading level N
      if(ctrl && /^[0-6]$/.test(key)){
        e.preventDefault();
        var lvl = parseInt(key, 10);
        var range = r();
        if(lvl === 0) doc.setBlockTypeForRange(range.from, range.to, 'paragraph');
        else          doc.setBlockTypeForRange(range.from, range.to, 'heading', { level: lvl });
        onChanged();
        getSel().setRange(range.anchor, range.focus);
        return;
      }
      if(ctrl && (key === 'c' || key === 'C')){
        // copy: handled by browser via 'copy' event below
        return;
      }
      if(ctrl && (key === 'x' || key === 'X')){
        // cut: handled by 'cut' event
        return;
      }

      // Word-level edit: Ctrl+Backspace/Delete
      if(ctrl && key === 'Backspace'){
        e.preventDefault();
        var rng = r();
        if(rng.from !== rng.to){ doDeleteBackward(); return; }
        var wordStart = doc.findWordBoundary(rng.from, -1);
        if(wordStart < rng.from){
          doc.deleteRange(wordStart, rng.from);
          onChanged();
          getSel().setRange(wordStart, wordStart);
        }
        return;
      }
      if(ctrl && key === 'Delete'){
        e.preventDefault();
        var rng2 = r();
        if(rng2.from !== rng2.to){ doDeleteForward(); return; }
        var wordEnd = doc.findWordBoundary(rng2.from, 1);
        if(wordEnd > rng2.from){
          doc.deleteRange(rng2.from, wordEnd);
          onChanged();
          getSel().setRange(rng2.from, rng2.from);
        }
        return;
      }
      // Word-level navigation: Ctrl+ArrowLeft / ArrowRight (with optional Shift)
      if(ctrl && (key === 'ArrowLeft' || key === 'ArrowRight')){
        e.preventDefault();
        var rng3 = r();
        var dir = (key === 'ArrowLeft') ? -1 : 1;
        var newFocus = doc.findWordBoundary(rng3.focus, dir);
        var newAnchor = e.shiftKey ? rng3.anchor : newFocus;
        getSel().setRange(newAnchor, newFocus);
        return;
      }

      // Tab / Shift+Tab in a list block — change nesting level
      if(key === 'Tab'){
        var rangeT = r();
        var locT = doc.locate(rangeT.from);
        var blkT = doc.get().blocks[locT.blockIdx];
        if(blkT && blkT.list){
          e.preventDefault();
          doc.changeListLevel(locT.blockIdx, e.shiftKey ? -1 : 1);
          onChanged();
          getSel().setRange(rangeT.anchor, rangeT.focus);
          return;
        }
      }

      switch(key){
        case 'Backspace':       e.preventDefault(); doDeleteBackward(); return;
        case 'Delete':          e.preventDefault(); doDeleteForward();  return;
        case 'Enter':           e.preventDefault(); doSplitBlock();     return;
        case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown':
        case 'Home': case 'End':
          clearPending();
          // Let selection layer handle navigation directly
          var sel = getSel();
          if(sel && sel.handleKey){
            sel.handleKey(e); // selection.handleKey calls preventDefault if it handles
          }
          // If selection didn't handle (no handleKey), still preventDefault to
          // stop the textarea from scrolling.
          if(!e.defaultPrevented) e.preventDefault();
          return;
      }
    });

    // ── Clipboard ──────────────────────────────────────────────────────────
    function getSelectedText(){
      var range = r();
      if(range.from === range.to) return '';
      // Walk blocks and extract text in [from, to)
      var d = doc.get();
      var out = '';
      var cursor = 0;
      for(var i = 0; i < d.blocks.length; i++){
        var b = d.blocks[i];
        var bLen = blockTextLength(b);
        var bStart = cursor, bEnd = cursor + bLen;
        if(bEnd <= range.from){ cursor = bEnd + 1; continue; }
        if(bStart >= range.to) break;
        var localStart = Math.max(0, range.from - bStart);
        var localEnd   = Math.min(bLen, range.to - bStart);
        var blockText = (b.runs || []).map(function(rn){ return String(rn.text || ''); }).join('');
        out += blockText.slice(localStart, localEnd);
        cursor = bEnd + 1;
        if(bEnd >= range.to) break;
        if(cursor - 1 >= range.from && cursor - 1 < range.to) out += '\n';
      }
      return out;
    }

    ta.addEventListener('copy', function(e){
      var t = getSelectedText();
      if(!t) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', t);
    });
    ta.addEventListener('cut', function(e){
      var t = getSelectedText();
      if(!t) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', t);
      var range = r();
      if(isTrackChangesEnabled()) markTrackedDeletion(range.from, range.to);
      else doc.deleteRange(range.from, range.to);
      onChanged();
      getSel().setRange(range.from, range.from);
    });
    ta.addEventListener('paste', function(e){
      var text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
      if(!text) return;
      e.preventDefault();
      // Honor newlines: split into lines, insert with splitBlock between
      var lines = text.split(/\r\n|\r|\n/);
      for(var i = 0; i < lines.length; i++){
        if(i > 0) doSplitBlock();
        if(lines[i]) doInsertText(lines[i]);
      }
    });

    // Position the textarea near the caret so IME UI (composition popup)
    // appears in the right place. Called after each render.
    function syncCapturePosition(){
      var caret = container.querySelector('.aq-sel-caret');
      if(!caret) return;
      var caretRect = caret.getBoundingClientRect();
      // textarea is fixed-positioned; align its top-left to caret in viewport
      ta.style.left = caretRect.left + 'px';
      ta.style.top  = caretRect.top  + 'px';
    }

    function clearCapture(){
      composing = false;
      compositionStartOffset = -1;
      ta.value = '';
      clearPending();
    }

    // ── Public API for programmatic editing (toolbar, citation dialog, etc.) ──
    function insertAtCaret(text, marks){
      var range = r();
      if(range.from !== range.to) doc.deleteRange(range.from, range.to);
      var at = Math.min(range.from, range.to);
      doc.insertText(at, text);
      var end = at + text.length;
      doc.applyMark(at, end, 'citation', false);
      if(marks){
        for(var k in marks){
          if(marks[k] !== undefined) doc.applyMark(at, end, k, marks[k]);
        }
      }
      onChanged();
      getSel().setRange(end, end);
    }

    function applyMarkToSelection(mark, value){
      var range = r();
      if(range.from === range.to) return;
      doc.applyMark(range.from, range.to, mark, value);
      onChanged();
      getSel().setRange(range.anchor, range.focus);
    }

    function applyFontPropToSelection(prop, value){
      var range = r();
      if(range.from === range.to) return;
      doc.applyFontProp(range.from, range.to, prop, value);
      onChanged();
      getSel().setRange(range.anchor, range.focus);
    }
    
    // Initial focus
    setTimeout(focusCapture, 100);

    return {
      focus: focusCapture,
      attach: function(){ focusCapture(); },
      clearCapture: clearCapture,
      syncCapturePosition: syncCapturePosition,
      insertAtCaret: insertAtCaret,
      applyMarkToSelection: applyMarkToSelection,
      applyFontPropToSelection: applyFontPropToSelection,
      toggleMark: toggleMark,
      splitBlock: doSplitBlock,
      deleteBackward: doDeleteBackward,
      deleteForward: doDeleteForward,
      getRange: function(){ return r(); },
      destroy: function(){
        if(trigRefreshTimer) clearTimeout(trigRefreshTimer);
        trigRefreshTimer = 0;
        if(ta.parentNode) ta.parentNode.removeChild(ta);
      }
    };
  }

  return { create: createInput };
});
