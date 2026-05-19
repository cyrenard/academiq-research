/* AQ Custom Layout Engine
 * ════════════════════════════════════════════════════════════════════════
 * Despite the `experiments/` path, this is LIVE production code — the
 * canvas-based editor that replaced TipTap in AcademiQ Research. The
 * `experiments/` name is historical and should not be removed without a
 * coordinated load-order migration (see index.html script tags 2–7).
 *
 * Goal: Word-like pagination from scratch. We control:
 *   1. Font metrics       — Canvas measureText
 *   2. Line-breaking      — greedy first-fit, word-aware
 *   3. Page layout        — APA-compliant: A4, 1in margins, double spacing
 *   4. DOM render         — absolute-positioned line boxes per page
 *
 * SYSTEM LAYOUT (all in experiments/aq-engine/, ~6150 lines total)
 * ────────────────────────────────────────────────────────────────────────
 *   engine.js          (this file, ~1040 lines)
 *                        — pagination + font metrics + DOM render
 *                        — exports window.AQEngine
 *   document.js        (~900 lines)
 *                        — document model: blocks/runs/marks
 *                        — exports window.AQEngineDocument
 *   selection.js       (~520 lines)
 *                        — hit testing, caret, keyboard navigation
 *                        — exports window.AQEngineSelection
 *   input.js           (~1100 lines)
 *                        — hidden textarea, IME (Turkish dead keys),
 *                          clipboard, undo/redo bridge
 *                        — exports window.AQEngineInput
 *   tiptap-adapter.js  (~630 lines)
 *                        — converts TipTap (ProseMirror) JSON → engine blocks
 *                        — exports window.AQEngineTipTapAdapter
 *   compat-shim.js     (~1960 lines)
 *                        — TipTap-API drop-in so legacy code still calls
 *                          editor.commands.*, editor.chain().*, etc.
 *                        — exports window.AQEngineCompat
 *
 * KNOWN GAPS
 * ────────────────────────────────────────────────────────────────────────
 *   • <br> (Shift+Enter hard line break) is partially supported — the
 *     tiptap-adapter maps <br> nodes to a forced break flag on the run,
 *     but the line-breaker treats them as regular word boundaries
 *     rather than guaranteed splits. See `tiptap-adapter.js` for the
 *     existing TODO marker.
 *
 * Units: all internal math in CSS pixels (1in = 96 CSS px).
 * Inputs accept points (1pt = 96/72 px) for typography ergonomics.
 *
 * Test coverage: tests/aq-engine-integration.test.js (54 cases,
 *   runs under `npm test`, not `npm run test:renderer`).
 */
(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){ module.exports = factory(); return; }
  root.AQEngine = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){

  var PT_TO_PX = 96 / 72;            // 1pt = 1.333... px @ 96dpi
  var DEFAULT_OPTS = {
    pageSize: { widthPt: 595.276, heightPt: 841.89 }, // A4 @ 72dpi
    margins:  { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 }, // APA 1 inch
    lineHeightFactor: 2.0,           // APA double-spacing
    baseFont: { family: '"Times New Roman", Times, serif', sizePt: 12, weight: '400', style: 'normal' },
    pageGapPx: 32,                   // visual gap between pages
    backgroundColor: '#ffffff',
    pageShadow: '0 24px 54px rgba(42,29,12,.12)'
  };

  // ── Font metrics & text measurement ────────────────────────────────────────
  // Single canvas reused across measurements; measureText is O(text length)
  // but the GPU-accelerated text layout makes this very fast in practice.
  var _measureCanvas = null;
  var _measureCtx = null;
  function getMeasureCtx(){
    if(_measureCtx) return _measureCtx;
    _measureCanvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    if(!_measureCanvas) return null;
    _measureCtx = _measureCanvas.getContext('2d');
    return _measureCtx;
  }

  function fontShorthand(spec){
    var s = spec || {};
    var style = s.style || 'normal';
    var weight = s.weight || '400';
    var size = (s.sizePt || 12) * PT_TO_PX;
    var family = s.family || 'serif';
    return style + ' ' + weight + ' ' + size + 'px ' + family;
  }

  function measureText(text, fontSpec){
    var ctx = getMeasureCtx();
    if(!ctx) return { width: 0, ascent: 0, descent: 0 };
    ctx.font = fontShorthand(fontSpec);
    var m = ctx.measureText(text || '');
    var ascent = m.actualBoundingBoxAscent || (fontSpec.sizePt || 12) * PT_TO_PX * 0.8;
    var descent = m.actualBoundingBoxDescent || (fontSpec.sizePt || 12) * PT_TO_PX * 0.2;
    return { width: m.width || 0, ascent: ascent, descent: descent };
  }

  var _textMeasureCache = new Map();
  function measureTextCached(text, fontSpec){
    var key = fontShorthand(fontSpec) + '\u0001' + String(text || '');
    var hit = _textMeasureCache.get(key);
    if(hit) return hit;
    var measured = measureText(text, fontSpec);
    if(_textMeasureCache.size > 8000) _textMeasureCache.clear();
    _textMeasureCache.set(key, measured);
    return measured;
  }

  // ── Ordered list marker formatting ────────────────────────────────────────
  function toAlpha(n){
    // 1 → 'a', 26 → 'z', 27 → 'aa'
    if(n < 1) return String(n);
    var out = '';
    while(n > 0){
      var rem = (n - 1) % 26;
      out = String.fromCharCode(97 + rem) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }
  function toRoman(n){
    if(n < 1 || n > 3999) return String(n);
    var pairs = [
      [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
      [100, 'c'],  [90, 'xc'],  [50, 'l'],  [40, 'xl'],
      [10, 'x'],   [9, 'ix'],   [5, 'v'],   [4, 'iv'],
      [1, 'i']
    ];
    var out = '';
    for(var i = 0; i < pairs.length; i++){
      while(n >= pairs[i][0]){ out += pairs[i][1]; n -= pairs[i][0]; }
    }
    return out;
  }
  function formatOrderedMarker(n, style){
    switch(style){
      case 'lower-alpha': return toAlpha(n);
      case 'upper-alpha': return toAlpha(n).toUpperCase();
      case 'lower-roman': return toRoman(n);
      case 'upper-roman': return toRoman(n).toUpperCase();
      default:            return String(n);
    }
  }

  // ── Tokenization ───────────────────────────────────────────────────────────
  // Split text into atomic break candidates: non-space tokens (words) and
  // whitespace tokens (glue). Whitespace at line ends is discarded.
  function tokenizeText(text){
    var tokens = [];
    var re = /\S+|\s+/g;
    var m;
    while((m = re.exec(text)) !== null){
      tokens.push({ text: /^\s/.test(m[0]) ? ' ' : m[0], space: /^\s/.test(m[0]) });
    }
    return tokens;
  }

  // Tokenize a list of runs preserving their font spec, so a paragraph can
  // mix italic/bold/sub etc. Each token carries the font of its source run
  // and the absolute document offset where it starts (block start + intra-run
  // offset). The offsets feed the Selection layer's hit testing.
  function tokenizeRuns(runs, baseFont, blockStartOffset){
    var out = [];
    var cursor = blockStartOffset || 0;
    for(var r = 0; r < runs.length; r++){
      var run = runs[r] || {};
      if(run.isBreak){
        out.push({ isBreak: true, offsetStart: cursor, offsetEnd: cursor + 1 });
        cursor += 1;
        continue;
      }
      if(!run.text) { cursor += 0; continue; }
      var font = Object.assign({}, baseFont, run.font || {});
      if(run.bold)   font.weight = '700';
      if(run.italic) font.style  = 'italic';
      var text = String(run.text);
      if(text === '\n'){
        out.push({ isBreak: true, offsetStart: cursor, offsetEnd: cursor + 1 });
        cursor += 1;
        continue;
      }
      var re = /\S+|\s+/g;
      var m;
      var localCursor = cursor;
      while((m = re.exec(text)) !== null){
        var seg = m[0];
        var isSpace = /^\s/.test(seg);
        out.push({
          text: isSpace ? ' ' : seg,
          space: isSpace,
          font: font,
          decoration: run.underline ? 'underline' : (run.strike ? 'line-through' : null),
          color: run.color || null,
          highlight: run.highlight || null,
          href: run.href || null,
          baselineShift: run.baselineShift || 0,
          fontScale: run.fontScale || 1,
          citation: run.citation || null,
          footnote: run.footnote || null,
          crossRef: run.crossRef || null,
          trackInsert: !!run.trackInsert,
          trackDelete: !!run.trackDelete,
          offsetStart: localCursor + m.index,
          offsetEnd:   localCursor + m.index + seg.length
        });
      }
      cursor += text.length;
    }
    return out;
  }

  // ── Line breaking (greedy first-fit) ───────────────────────────────────────
  // Word-aware greedy: if the next word doesn't fit on the current line, close
  // the current line and start a new one. Multi-run friendly — items within
  // a single line can carry different fonts/decorations.
  function breakParagraphIntoLines(paragraph, maxWidthPx, baseFont, blockStartOffset){
    var pBaseFont = Object.assign({}, baseFont, paragraph.font || {});
    var runs;
    if(Array.isArray(paragraph.runs) && paragraph.runs.length){
      runs = paragraph.runs;
    }else{
      runs = [{ text: paragraph.text || '' }];
    }
    var tokens = tokenizeRuns(runs, pBaseFont, blockStartOffset || 0);
    var lines = [];
    var cur = { items: [], width: 0, ascent: 0, descent: 0 };
    var pendingSpace = null;

    function tokenWidth(tok){
      var f = tok.font;
      if(tok.fontScale && tok.fontScale !== 1){
        f = Object.assign({}, f, { sizePt: f.sizePt * tok.fontScale });
      }
      var m = measureTextCached(tok.text, f);
      return { width: m.width, ascent: m.ascent, descent: m.descent, font: f };
    }

    function pushItem(tok, m){
      cur.items.push({
        text: tok.text,
        width: m.width,
        space: tok.space,
        font: m.font,
        decoration: tok.decoration,
        color: tok.color,
        highlight: tok.highlight,
        href: tok.href,
        baselineShift: tok.baselineShift,
        citation: tok.citation,
        footnote: tok.footnote,
        crossRef: tok.crossRef,
        trackInsert: !!tok.trackInsert,
        trackDelete: !!tok.trackDelete,
        offsetStart: tok.offsetStart,
        offsetEnd: tok.offsetEnd
      });
      cur.width += m.width;
      if(m.ascent  > cur.ascent)  cur.ascent  = m.ascent;
      if(m.descent > cur.descent) cur.descent = m.descent;
    }

    for(var i = 0; i < tokens.length; i++){
      var tok = tokens[i];
      if(tok.isBreak){
        lines.push(cur);
        cur = { items: [], width: 0, ascent: 0, descent: 0 };
        pendingSpace = null;
        continue;
      }
      if(tok.space){
        if(cur.items.length === 0) continue;
        pendingSpace = tok;
        continue;
      }
      var m = tokenWidth(tok);
      var sp = pendingSpace ? tokenWidth(pendingSpace) : null;
      var addWidth = (sp ? sp.width : 0) + m.width;

      if(cur.items.length > 0 && cur.width + addWidth > maxWidthPx){
        lines.push(cur);
        cur = { items: [], width: 0, ascent: 0, descent: 0 };
        pendingSpace = null;
        sp = null;
        addWidth = m.width;
      }

      if(pendingSpace && cur.items.length > 0){
        pushItem(pendingSpace, sp);
        pendingSpace = null;
      }
      pushItem(tok, m);
    }
    if(cur.items.length > 0) lines.push(cur);
    // An empty paragraph still occupies one line — otherwise the block
    // produces zero lines and the user has no surface to click into.
    if(lines.length === 0){
      lines.push({ items: [], width: 0, ascent: 0, descent: 0, _empty: true });
    }
    return lines;
  }

  function blockLayoutCacheKey(block, blockFont, width, docOffset){
    var runs = Array.isArray(block.runs) && block.runs.length ? block.runs : [{ text: block.text || '' }];
    var runKey = runs.map(function(run){
      run = run || {};
      return [
        run.text || '',
        run.bold ? 1 : 0,
        run.italic ? 1 : 0,
        run.underline ? 1 : 0,
        run.strike ? 1 : 0,
        run.color || '',
        run.highlight || '',
        run.href || '',
        run.baselineShift || 0,
        run.fontScale || 1,
        run.trackInsert ? 1 : 0,
        run.trackDelete ? 1 : 0,
        run.citation ? (run.citation.ref || run.citation.id || JSON.stringify(run.citation)) : '',
        run.footnote ? (run.footnote.fnId || JSON.stringify(run.footnote)) : '',
        run.crossRef ? (run.crossRef.refId || JSON.stringify(run.crossRef)) : '',
        run.font ? JSON.stringify(run.font) : ''
      ].join('\u0002');
    }).join('\u0003');
    return [
      width,
      docOffset,
      block.type || 'paragraph',
      block.level || '',
      block.align || '',
      block.list ? JSON.stringify(block.list) : '',
      block.firstLineIndentPx || 0,
      block.leftIndentPx || 0,
      block.lineHeightFactor || '',
      JSON.stringify(blockFont || {}),
      runKey
    ].join('\u0004');
  }

  function cloneLines(lines){
    return (lines || []).map(function(line){
      var out = Object.assign({}, line);
      out.items = (line.items || []).map(function(item){ return Object.assign({}, item, { font: item.font ? Object.assign({}, item.font) : item.font }); });
      return out;
    });
  }

  // ── Pagination ─────────────────────────────────────────────────────────────
  // Walk lines top-to-bottom; when y + lineHeight would exceed the page's
  // bottom margin, close the current page and start a new one. Per APA, lines
  // are not split mid-line; only the page boundary moves.
  function paginate(blocks, opts){
    var pageWidthPx  = opts.pageSize.widthPt  * PT_TO_PX;
    var pageHeightPx = opts.pageSize.heightPt * PT_TO_PX;
    var ml = opts.margins.leftPt   * PT_TO_PX;
    var mr = opts.margins.rightPt  * PT_TO_PX;
    var mt = opts.margins.topPt    * PT_TO_PX;
    var mb = opts.margins.bottomPt * PT_TO_PX;
    var contentWidthPx  = pageWidthPx  - ml - mr;
    var contentHeightPx = pageHeightPx - mt - mb;
    var baseLineHeightPx = (opts.baseFont.sizePt * PT_TO_PX) * (opts.lineHeightFactor || 1);

    var pages = [];
    var page = newPage();
    var y = 0;
    var docOffset = 0;        // running absolute offset across all blocks
    var lineCache = opts._lineCache || (opts._lineCache = new Map());

    function newPage(){ return { lines: [] }; }

    function resolveBlockWidth(value, fallback){
      if(value === null || value === undefined || value === '') return fallback;
      if(typeof value === 'string' && /%$/.test(value.trim())){
        var pct = parseFloat(value);
        return Number.isFinite(pct) && pct > 0 ? fallback * Math.min(pct, 100) / 100 : fallback;
      }
      var n = parseFloat(value);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    }

    var INDENT_PER_LEVEL_PX = 18;
    var MARKER_GUTTER_PX    = 2;
    var orderedCounters = {}; // per-level counters for ordered lists
    var prevListSig     = null;

    for(var b = 0; b < blocks.length; b++){
      var block = blocks[b];

      // ── Explicit Page Break ──
      if(block.pageBreak){
        if(page.lines.length > 0){
          pages.push(page);
          page = newPage();
          y = 0;
        }
      }

      var blockFont = Object.assign({}, opts.baseFont, block.font || {});
      var lineHeightPx = (blockFont.sizePt * PT_TO_PX) * (block.lineHeightFactor || opts.lineHeightFactor || 1);
      // ── Horizontal rule ──
      if(block.rule){
        block._offsetStart = docOffset;
        block._offsetEnd   = docOffset;
        var ruleH = 20;
        if(y + ruleH > contentHeightPx){ pages.push(page); page = newPage(); y = 0; }
        page.lines.push({
          y: y, x: ml, width: contentWidthPx, height: ruleH,
          rule: true, blockIndex: b, pageIndex: pages.length,
          offsetStart: docOffset, offsetEnd: docOffset
        });
        y += ruleH;
        docOffset += 1;
        continue;
      }

      // ── Image block: occupies a single "line" with image dimensions ──
      if(block.type === 'image'){
        block._offsetStart = docOffset;
        block._offsetEnd   = docOffset; // image has 0 text length
        var imgW = Math.min(resolveBlockWidth(block.width, contentWidthPx), contentWidthPx);
        var imgH = block.height ? (block.height * (imgW / (block.width || imgW))) : (imgW * 0.6);
        if(y + imgH > contentHeightPx){
          pages.push(page); page = newPage(); y = 0;
        }
        var imgX = ml;
        if(block.align === 'center') imgX = ml + (contentWidthPx - imgW) / 2;
        else if(block.align === 'right') imgX = ml + contentWidthPx - imgW;
        page.lines.push({
          y: y, x: imgX, width: imgW, height: imgH,
          image: true, src: block.src, alt: block.alt || '',
          refId: (block.attrs && block.attrs.refId) || block._refId || null,
          blockIndex: b, pageIndex: pages.length,
          offsetStart: docOffset, offsetEnd: docOffset
        });
        y += imgH + (block.spaceAfterPx || 0);
        docOffset += 1; // +1 for block break
        continue;
      }

      // ── Table block: render as a grid of cells ──
      if(block.type === 'table' && block.rows){
        block._offsetStart = docOffset;
        var tableRows = block.rows;
        var numCols = 0;
        for(var tr = 0; tr < tableRows.length; tr++){
          numCols = Math.max(numCols, (tableRows[tr].cells || []).length);
        }
        var colWidth = numCols > 0 ? contentWidthPx / numCols : contentWidthPx;
        var cellPad = 4;  // px padding inside cells
        var borderH = 1;  // border height
        var tableOffsetStart = docOffset;

        for(var tr = 0; tr < tableRows.length; tr++){
          var cells = tableRows[tr].cells || [];
          // Measure each cell's text height
          var rowHeight = baseLineHeightPx;
          var cellLines = [];
          for(var tc = 0; tc < numCols; tc++){
            var cell = cells[tc] || { runs: [{ text: '' }] };
            var cellRuns = cell.runs || [{ text: '' }];
            var cellTextLen = 0;
            for(var cr = 0; cr < cellRuns.length; cr++) cellTextLen += String(cellRuns[cr].text || '').length;
            var cl = breakParagraphIntoLines({ runs: cellRuns }, colWidth - cellPad * 2, opts.baseFont, docOffset);
            cellLines.push({ lines: cl, textLen: cellTextLen });
            var ch = cl.length * baseLineHeightPx + cellPad * 2;
            if(ch > rowHeight) rowHeight = ch;
            docOffset += cellTextLen + 1; // +1 per cell break
          }
          // Page break if row doesn't fit
          if(y + rowHeight > contentHeightPx){
            pages.push(page); page = newPage(); y = 0;
          }
          page.lines.push({
            y: y, x: ml, width: contentWidthPx, height: rowHeight,
            table: true, rowIndex: tr, numCols: numCols, colWidth: colWidth,
            cellPad: cellPad, cellLines: cellLines, isHeader: (tr === 0 && block.headerRow),
            isFirstRow: tr === 0,
            isLastRow: tr === tableRows.length - 1,
            tableBlockIndex: b,
            tableRowIndex: tr,
            refId: (block.attrs && block.attrs.refId) || block._refId || null,
            blockIndex: b, pageIndex: pages.length,
            offsetStart: tableOffsetStart, offsetEnd: docOffset
          });
          y += rowHeight + borderH;
        }
        block._offsetEnd = docOffset - 1;
        y += (block.spaceAfterPx || 0);
        continue;
      }

      // Compute total text length in block so we can advance docOffset.
      var blockTextLen = 0;
      var blockRuns = (Array.isArray(block.runs) && block.runs.length) ? block.runs : [{ text: block.text || '' }];
      for(var rr = 0; rr < blockRuns.length; rr++) blockTextLen += String(blockRuns[rr].text || '').length;
      block._offsetStart = docOffset;
      block._offsetEnd   = docOffset + blockTextLen;

      // List marker + indent computation
      var listLevel  = block.list ? block.list.level : 0;
      var leftIndentPx = block.list ? (listLevel + 1) * INDENT_PER_LEVEL_PX + MARKER_GUTTER_PX : (block.leftIndentPx || 0);
      var blockContentWidth = contentWidthPx - leftIndentPx;
      var markerText = null;
      if(block.list){
        if(block.list.type === 'ordered'){
          // Reset numbering when leaving an ordered chain or its level changes
          var sig = 'ordered@' + listLevel + '@' + (block.list.style || 'decimal');
          orderedCounters[listLevel] = (prevListSig === sig ? (orderedCounters[listLevel] || 0) : 0) + 1;
          var n = orderedCounters[listLevel];
          var style = block.list.style || (
            // Default cascade — Word-style: 1, a, i for unset styles.
            listLevel === 0 ? 'decimal' :
            listLevel === 1 ? 'lower-alpha' :
            'lower-roman'
          );
          markerText = formatOrderedMarker(n, style) + '.';
          for(var lv in orderedCounters) if(parseInt(lv,10) > listLevel) delete orderedCounters[lv];
          prevListSig = sig;
        }else{
          markerText = (listLevel % 2 === 0) ? '•' : '◦';
          prevListSig = 'bullet@' + listLevel;
        }
      }else{
        orderedCounters = {};
        prevListSig = null;
      }
      block._markerText = markerText;
      block._leftIndentPx = leftIndentPx;
      var cacheKey = blockLayoutCacheKey(block, blockFont, blockContentWidth, docOffset);
      var cachedLines = lineCache.get(cacheKey);
      var lines = cachedLines ? cloneLines(cachedLines) : breakParagraphIntoLines(block, blockContentWidth, blockFont, docOffset);
      if(!cachedLines){
        if(lineCache.size > 2000) lineCache.clear();
        lineCache.set(cacheKey, cloneLines(lines));
      }

      // Widow/orphan: if only 1 line of a multi-line paragraph fits on the
      // current page, push the whole paragraph to next page.
      if(lines.length >= 2){
        var linesThatFitNow = Math.floor((contentHeightPx - y) / lineHeightPx);
        if(linesThatFitNow <= 1 && linesThatFitNow < lines.length){
          pages.push(page); page = newPage(); y = 0;
        }
      }

      for(var li = 0; li < lines.length; li++){
        if(y + lineHeightPx > contentHeightPx){
          pages.push(page); page = newPage(); y = 0;
        }
        var line = lines[li];
        var isLastLineOfBlock = (li === lines.length - 1);
        var isFirstLineOfBlock = (li === 0);
        var lineOffsetStart = line.items.length ? line.items[0].offsetStart : docOffset;
        var lineOffsetEnd   = line.items.length ? line.items[line.items.length-1].offsetEnd : lineOffsetStart;
        page.lines.push({
          y: y,
          x: ml + leftIndentPx + (isFirstLineOfBlock ? (block.firstLineIndentPx || 0) : 0),
          width: blockContentWidth,
          height: lineHeightPx,
          align: block.align || 'left',
          items: line.items,
          font: line.font,
          isLastLineOfBlock: isLastLineOfBlock,
          isFirstLineOfBlock: isFirstLineOfBlock,
          blockIndex: b,
          blockType: block.type || 'paragraph',
          headingLevel: block.type === 'heading' ? (block.level || (block.attrs && block.attrs.level) || 1) : 0,
          isAppendixHeading: !!block._isAppendixHeading,
          appendixId: block._appendixId || null,
          refId: (block.attrs && block.attrs.refId) || block._refId || null,
          pageIndex: pages.length,
          offsetStart: lineOffsetStart,
          offsetEnd: lineOffsetEnd,
          markerText: (isFirstLineOfBlock ? markerText : null),
          markerX: ml + listLevel * INDENT_PER_LEVEL_PX
        });
        y += lineHeightPx;
      }
      // Paragraph spacing after (default APA: 0)
      y += (block.spaceAfterPx || 0);
      // Advance global doc offset past this block. We add 1 for the
      // implicit paragraph break, so cross-block selections behave naturally.
      docOffset = block._offsetEnd + 1;
    }
    if(page.lines.length > 0) pages.push(page);

    return {
      pages: pages,
      pageWidthPx: pageWidthPx,
      pageHeightPx: pageHeightPx,
      marginTopPx: mt,
      marginLeftPx: ml,
      contentWidthPx: contentWidthPx,
      contentHeightPx: contentHeightPx
    };
  }

  // ── DOM render ─────────────────────────────────────────────────────────────
  function renderToDOM(layout, container, opts){
    opts = opts || {};
    var pageRange = opts.renderPageRange || null;
    function shouldRenderPage(pageIndex){
      if(!pageRange) return true;
      return pageIndex >= pageRange.from && pageIndex <= pageRange.to;
    }
    container.innerHTML = '';
    // Transparent so the host scroller's own background shows between pages —
    // avoids the "bridge band" effect when stage gradient differs from #escroll.
    container.style.background = 'transparent';
    container.style.padding = '32px 0';
    container.style.minHeight = '100vh';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.minWidth = layout.pageWidthPx + 'px';

    for(var p = 0; p < layout.pages.length; p++){
      var page = layout.pages[p];
      var pageEl = document.createElement('div');
      pageEl.className = 'aq-engine-page';
      pageEl.dataset.pageIndex = p;
      pageEl._aqPage = page;       // layout reference for selection/hit testing
      pageEl.style.position = 'relative';
      pageEl.style.width  = layout.pageWidthPx  + 'px';
      pageEl.style.height = layout.pageHeightPx + 'px';
      pageEl.style.background = opts.backgroundColor;
      pageEl.style.boxShadow = opts.pageShadow;
      pageEl.style.margin = '0 0 ' + opts.pageGapPx + 'px';
      pageEl.style.boxSizing = 'border-box';
      pageEl.style.fontFamily = opts.baseFont.family;
      if(!shouldRenderPage(p)){
        pageEl.dataset.virtualized = 'true';
        container.appendChild(pageEl);
        continue;
      }

      // Margin guides (debug)
      if(opts.showMarginGuides){
        var guide = document.createElement('div');
        guide.style.position = 'absolute';
        guide.style.left   = layout.marginLeftPx + 'px';
        guide.style.top    = layout.marginTopPx + 'px';
        guide.style.width  = layout.contentWidthPx + 'px';
        guide.style.height = layout.contentHeightPx + 'px';
        guide.style.outline = '1px dashed rgba(0,80,160,.18)';
        guide.style.pointerEvents = 'none';
        pageEl.appendChild(guide);
      }

      for(var li = 0; li < page.lines.length; li++){
        var line = page.lines[li];

        // Image line — render an <img> element instead of text spans
        if(line.image){
          var imgEl = document.createElement('img');
          imgEl.src = line.src;
          imgEl.alt = line.alt || '';
          imgEl.style.position = 'absolute';
          imgEl.style.top  = (layout.marginTopPx + line.y) + 'px';
          imgEl.style.left = line.x + 'px';
          imgEl.style.width  = line.width + 'px';
          imgEl.style.height = line.height + 'px';
          imgEl.style.objectFit = 'contain';
          imgEl.style.pointerEvents = 'auto';
          imgEl.style.cursor = 'pointer';
          imgEl.draggable = false;
          imgEl.className = 'aq-engine-image';
          imgEl.dataset.blockIndex = line.blockIndex;
          if(line.refId) imgEl.dataset.refId = line.refId;
          pageEl.appendChild(imgEl);
          continue;
        }

        // Horizontal rule
        if(line.rule){
          var hrEl = document.createElement('hr');
          hrEl.style.position = 'absolute';
          hrEl.style.top  = (layout.marginTopPx + line.y + line.height / 2) + 'px';
          hrEl.style.left = line.x + 'px';
          hrEl.style.width = line.width + 'px';
          hrEl.style.border = 'none';
          hrEl.style.borderTop = '1px solid #999';
          hrEl.style.margin = '0';
          pageEl.appendChild(hrEl);
          continue;
        }

        // Table row — APA 7: only horizontal borders (top of header, bottom of
        // header, bottom of table). No vertical lines, no inter-row borders.
        if(line.table){
          var rowEl = document.createElement('div');
          rowEl.className = 'aq-engine-table-row';
          rowEl.style.position = 'absolute';
          rowEl.style.top  = (layout.marginTopPx + line.y) + 'px';
          rowEl.style.left = line.x + 'px';
          rowEl.style.width = line.width + 'px';
          rowEl.style.height = line.height + 'px';
          rowEl.style.display = 'flex';
          rowEl.style.borderTop = '';
          rowEl.style.borderBottom = '';
          rowEl.dataset.tableBlockIndex = line.tableBlockIndex;
          rowEl.dataset.tableRowIndex   = line.tableRowIndex;
          if(line.refId) rowEl.dataset.refId = line.refId;
          if(line.isFirstRow){
            rowEl.style.borderTop = '1.5px solid #000';
          }
          if(line.isHeader){
            rowEl.style.fontWeight = '700';
            rowEl.style.borderBottom = '1px solid #000';
          }
          if(line.isLastRow){
            rowEl.style.borderBottom = '1.5px solid #000';
          }
          for(var ci = 0; ci < line.numCols; ci++){
            var cellEl = document.createElement('div');
            cellEl.style.width = line.colWidth + 'px';
            cellEl.style.padding = line.cellPad + 'px';
            cellEl.style.boxSizing = 'border-box';
            cellEl.style.borderRight = 'none';
            cellEl.style.overflow = 'hidden';
            cellEl.className = 'aq-engine-table-cell';
            cellEl.dataset.tableBlockIndex = line.tableBlockIndex;
            cellEl.dataset.tableRowIndex   = line.tableRowIndex;
            cellEl.dataset.tableColIndex   = ci;
            cellEl.style.fontSize = (opts.baseFont.sizePt * PT_TO_PX) + 'px';
            cellEl.style.lineHeight = (opts.baseFont.sizePt * PT_TO_PX * (opts.lineHeightFactor || 1)) + 'px';
            cellEl.style.fontFamily = opts.baseFont.family;
            // Render cell text from cellLines
            var cl = line.cellLines[ci];
            if(cl){
              for(var cli = 0; cli < cl.lines.length; cli++){
                var cLine = cl.lines[cli];
                for(var cii = 0; cii < cLine.items.length; cii++){
                  var cit = cLine.items[cii];
                  var cspan = document.createElement('span');
                  cspan.style.font = fontShorthand(cit.font);
                  if(cit.decoration) cspan.style.textDecoration = cit.decoration;
                  if(cit.color) cspan.style.color = cit.color;
                  cspan.textContent = cit.text;
                  cellEl.appendChild(cspan);
                }
                if(cli < cl.lines.length - 1){
                  cellEl.appendChild(document.createElement('br'));
                }
              }
            }
            rowEl.appendChild(cellEl);
          }
          pageEl.appendChild(rowEl);
          continue;
        }

        var lineEl = document.createElement('div');
        lineEl.className = 'aq-engine-line';
        lineEl.style.position = 'absolute';
        lineEl.style.top   = (layout.marginTopPx + line.y) + 'px';
        lineEl.style.height = line.height + 'px';
        lineEl.style.lineHeight = line.height + 'px';
        lineEl.style.whiteSpace = 'pre';
        lineEl.style.overflow = 'visible';
        lineEl.style.color = '#1d1b16';
        if(line.isAppendixHeading && line.isFirstLineOfBlock){
          lineEl.className += ' aq-appendix-heading-hit';
          lineEl.dataset.appendixBlockIndex = line.blockIndex;
          if(line.appendixId) lineEl.dataset.appendixId = line.appendixId;
        }

        // Drop trailing whitespace from the line for measurement and render.
        var renderItems = line.items.slice();
        while(renderItems.length && renderItems[renderItems.length - 1].space){
          renderItems.pop();
        }
        var trimmedWidth = 0;
        for(var ti = 0; ti < renderItems.length; ti++) trimmedWidth += renderItems[ti].width;

        var align = line.align || 'left';
        // Last line of a justified paragraph falls back to left (Word behaviour).
        if(align === 'justify' && line.isLastLineOfBlock) align = 'left';

        var slack = Math.max(0, line.width - trimmedWidth);
        var offsetX = 0;
        var extraSpace = 0;

        if(align === 'right')        offsetX = slack;
        else if(align === 'center')  offsetX = slack / 2;
        else if(align === 'justify'){
          // Distribute slack evenly across internal whitespace runs only.
          // Items 0..N-1 may include trailing whitespace already dropped;
          // count the space tokens that remain *between* words.
          var spaceCount = 0;
          for(var si = 0; si < renderItems.length; si++){
            if(renderItems[si].space) spaceCount++;
          }
          if(spaceCount > 0) extraSpace = slack / spaceCount;
        }

        lineEl.style.left  = (line.x + offsetX) + 'px';
        lineEl.style.width = (line.width - offsetX) + 'px';
        // Store layout info on the DOM line for hit testing / selection paint
        lineEl._aqLine = line;
        lineEl._aqRenderedX = line.x + offsetX;
        lineEl._aqExtraSpace = extraSpace;
        lineEl.dataset.lineOffsetStart = line.offsetStart;
        lineEl.dataset.lineOffsetEnd   = line.offsetEnd;
        lineEl.dataset.blockIndex      = line.blockIndex;
        if(line.refId) lineEl.dataset.refId = line.refId;
        if(line.blockType) lineEl.dataset.blockType = line.blockType;
        if(line.headingLevel) {
          lineEl.dataset.refType = 'heading';
          lineEl.dataset.headingLevel = String(line.headingLevel);
        }

        // List marker — drawn outside the line content area, non-interactive.
        // Mirror the layout of the surrounding lineEl exactly so the marker
        // glyph rests on the same baseline as the line text. Using the same
        // line-height/height + textAlign:right yields baseline parity for any
        // character whose baseline is the natural typographic baseline; bullet
        // glyphs ("•", "◦") sit a touch higher in their em-box than letters,
        // so we offset them downward to compensate.
        if(line.markerText){
          var marker = document.createElement('div');
          marker.className = 'aq-list-marker';
          marker.style.position = 'absolute';
          marker.style.top  = (layout.marginTopPx + line.y) + 'px';
          marker.style.left = line.markerX + 'px';
          marker.style.width = (line.x - line.markerX - 4) + 'px';
          marker.style.height = line.height + 'px';
          marker.style.lineHeight = line.height + 'px';
          marker.style.font = fontShorthand(line.font);
          marker.style.color = '#1d1b16';
          marker.style.textAlign = 'right';
          marker.style.userSelect = 'none';
          marker.style.pointerEvents = 'none';
          // The marker box is line.height tall but the line text rests on the
          // baseline (~80% from top). Push the marker down to land on that
          // baseline.
          marker.style.paddingTop = '6px';
          marker.textContent = line.markerText;
          pageEl.appendChild(marker);
        }

        for(var i = 0; i < renderItems.length; i++){
          var it = renderItems[i];
          var span = document.createElement('span');
          span.style.display = 'inline-block';
          span.style.whiteSpace = 'pre';
          span.style.font = fontShorthand(it.font);
          if(it.decoration) span.style.textDecoration = it.decoration;
          if(it.color) span.style.color = it.color;
          if(it.highlight) span.style.backgroundColor = it.highlight;
          if(it.trackInsert){
            span.className = (span.className ? span.className + ' ' : '') + 'aq-track-insert';
            span.style.color = span.style.color || '#1f7a4d';
            span.style.textDecoration = span.style.textDecoration || 'underline';
            span.style.backgroundColor = span.style.backgroundColor || 'rgba(46,160,96,.10)';
          }
          if(it.trackDelete){
            span.className = (span.className ? span.className + ' ' : '') + 'aq-track-delete';
            span.style.color = '#a33a35';
            span.style.textDecoration = 'line-through';
            span.style.backgroundColor = span.style.backgroundColor || 'rgba(201,72,66,.10)';
          }
          if(it.href){
            span.style.color = span.style.color || '#1a0dab';
            span.style.textDecoration = 'underline';
            span.style.cursor = 'pointer';
            span.dataset.href = it.href;
          }
          if(it.crossRef){
            span.className = 'aq-cross-ref';
            span.dataset.refType = it.crossRef.refType || 'heading';
            span.dataset.refId = it.crossRef.refId || '';
            span.dataset.refLabel = it.crossRef.refLabel || '';
            span.dataset.refDisplay = it.crossRef.display || 'context';
          }
          if(it.baselineShift){
            span.style.position = 'relative';
            span.style.top = (-it.baselineShift) + 'px';
          }
          if(it.space && extraSpace){
            // Stretch a whitespace token by adding margin-right; keep its glyph
            // intact for proper kerning + selection.
            span.style.marginRight = extraSpace + 'px';
          }
          span.dataset.offsetStart = it.offsetStart;
          span.dataset.offsetEnd = it.offsetEnd;
          if(it.citation){
            span.className = 'aq-cit';
            span.style.color = 'inherit';
            span.style.cursor = 'text';
            span.style.pointerEvents = 'none';
            if(it.citation.ref)    span.dataset.aqRef    = it.citation.ref;
            if(it.citation.id)     span.dataset.aqId     = it.citation.id;
            if(it.citation.mode)   span.dataset.aqMode   = it.citation.mode;
            if(it.citation.noteId) span.dataset.aqNoteId = it.citation.noteId;
          }
          if(it.footnote){
            span.className = 'aq-fn-ref';
            span.style.cursor = 'pointer';
            span.dataset.fnId   = it.footnote.fnId;
            span.dataset.fnType = it.footnote.fnType || 'footnote';
          }
          span.textContent = it.text;
          lineEl.appendChild(span);
        }
        if(line.isAppendixHeading && line.isFirstLineOfBlock){
          var delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'aq-appendix-delete-btn';
          delBtn.textContent = 'Eki sil';
          delBtn.title = 'Eki sil';
          delBtn.dataset.blockIndex = String(line.blockIndex);
          if(line.appendixId) delBtn.dataset.appendixId = line.appendixId;
          delBtn.style.position = 'absolute';
          delBtn.style.right = '0';
          delBtn.style.top = '1px';
          delBtn.style.border = '1px solid rgba(178,88,88,.45)';
          delBtn.style.background = 'rgba(255,255,255,.92)';
          delBtn.style.color = '#8f2e2e';
          delBtn.style.borderRadius = '999px';
          delBtn.style.padding = '2px 9px';
          delBtn.style.font = '10px/1.2 Arial, sans-serif';
          delBtn.style.cursor = 'pointer';
          delBtn.style.opacity = '0';
          delBtn.style.pointerEvents = 'none';
          delBtn.style.transition = 'opacity .16s ease';
          lineEl.addEventListener('mouseenter', function(){ var btn = this.querySelector('.aq-appendix-delete-btn'); if(btn){ btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; } });
          lineEl.addEventListener('mouseleave', function(){ var btn = this.querySelector('.aq-appendix-delete-btn'); if(btn){ btn.style.opacity = '0'; btn.style.pointerEvents = 'none'; } });
          delBtn.addEventListener('click', function(ev){
            ev.preventDefault();
            ev.stopPropagation();
            var detail = {
              blockIndex: parseInt(this.dataset.blockIndex || '-1', 10),
              appendixId: this.dataset.appendixId || ''
            };
            var handled = false;
            try{
              var activeEditor = typeof window.getActiveEditorInstance === 'function'
                ? window.getActiveEditorInstance()
                : (window.editor || null);
              if(typeof window.deleteAQEngineAppendix === 'function'){
                handled = !!window.deleteAQEngineAppendix(activeEditor, detail.appendixId, detail.blockIndex);
              }
              if(!handled && activeEditor && activeEditor._aqEngine && activeEditor._docModel && typeof activeEditor._docModel.get === 'function' && typeof activeEditor._docModel.replace === 'function'){
                var model = activeEditor._docModel.get() || {};
                var blocks = Array.isArray(model.blocks) ? model.blocks.slice() : [];
                var start = -1;
                for(var bi = 0; bi < blocks.length; bi++){
                  if(blocks[bi] && blocks[bi]._isAppendixHeading && ((detail.appendixId && blocks[bi]._appendixId === detail.appendixId) || (!detail.appendixId && bi === detail.blockIndex))){
                    start = bi;
                    break;
                  }
                }
                if(start < 0 && detail.blockIndex >= 0 && blocks[detail.blockIndex] && blocks[detail.blockIndex]._isAppendixHeading) start = detail.blockIndex;
                if(start >= 0){
                  var end = start + 1;
                  while(end < blocks.length && !(blocks[end] && blocks[end]._isAppendixHeading)) end++;
                  blocks.splice(start, end - start);
                  var appendixIndex = 0;
                  var currentAppendixId = '';
                  for(var ri = 0; ri < blocks.length; ri++){
                    var block = blocks[ri];
                    if(!block) continue;
                    if(block._isAppendixHeading){
                      appendixIndex++;
                      currentAppendixId = 'appendix-' + appendixIndex;
                      block._appendixId = currentAppendixId;
                      block.runs = [{ text: 'EK-' + appendixIndex, bold: true }];
                    }else if(block._isAppendixEntry || block._appendixId){
                      block._appendixId = currentAppendixId || block._appendixId || 'appendix-' + Math.max(1, appendixIndex || 1);
                    }
                  }
                  activeEditor._docModel.replace(blocks);
                  if(typeof activeEditor._reflow === 'function') activeEditor._reflow();
                  if(typeof activeEditor.emit === 'function') activeEditor.emit('update');
                  var state = window.S || {};
                  var docs = Array.isArray(state.docs) ? state.docs : [];
                  var doc = docs.find(function(item){ return item && item.id === state.curDoc; }) || docs[0] || null;
                  if(doc && String(doc.appendicesHTML || '').trim()){
                    try{
                      var div = document.createElement('div');
                      div.innerHTML = String(doc.appendicesHTML || '');
                      var target = detail.appendixId ? div.querySelector('[data-appendix-id="' + String(detail.appendixId).replace(/"/g, '') + '"]') : null;
                      if(!target){
                        var appendixBlocks = div.querySelectorAll('.appendix-block');
                        var n = parseInt(String(detail.appendixId || '').replace(/\D+/g, ''), 10);
                        if(n && appendixBlocks[n - 1]) target = appendixBlocks[n - 1];
                      }
                      if(target && target.parentNode) target.parentNode.removeChild(target);
                      var remaining = Array.prototype.slice.call(div.querySelectorAll('.appendix-block'));
                      remaining.forEach(function(blockEl, idx){
                        var next = idx + 1;
                        blockEl.setAttribute('data-appendix-id', 'appendix-' + next);
                        var heading = blockEl.querySelector('h1.appendix-title') || blockEl.querySelector('h1');
                        if(heading) heading.textContent = 'EK-' + next;
                      });
                      doc.appendicesHTML = div.innerHTML;
                    }catch(_htmlDeleteError){}
                  }
                  if(typeof window.save === 'function') window.save();
                  handled = true;
                }
              }
            }catch(_directDeleteError){}
            if(handled) return;
            try{
              document.dispatchEvent(new CustomEvent('aq-delete-appendix', { bubbles: true, detail: detail }));
              container.dispatchEvent(new CustomEvent('aq-delete-appendix', { bubbles: true, detail: detail }));
            }catch(_e){}
          });
          lineEl.appendChild(delBtn);
        }
        pageEl.appendChild(lineEl);
      }

      // Header: running head (left) + page number (right) — APA 7 style
      var headerEl = document.createElement('div');
      headerEl.className = 'aq-engine-header';
      headerEl.style.position = 'absolute';
      headerEl.style.top = '24px';
      headerEl.style.left = layout.marginLeftPx + 'px';
      headerEl.style.right = (layout.pageWidthPx - layout.marginLeftPx - layout.contentWidthPx) + 'px';
      headerEl.style.display = 'flex';
      headerEl.style.justifyContent = 'space-between';
      headerEl.style.font = (opts.baseFont.sizePt * PT_TO_PX) + 'px/1 ' + opts.baseFont.family;
      headerEl.style.color = '#1d1b16';
      headerEl.style.pointerEvents = 'none';
      var headLeft = document.createElement('span');
      headLeft.textContent = opts.runningHead || '';
      headLeft.style.textTransform = 'uppercase';
      headLeft.style.fontSize = (opts.baseFont.sizePt * PT_TO_PX) + 'px';
      var headRight = document.createElement('span');
      headRight.textContent = String(p + 1);
      headRight.style.fontSize = (opts.baseFont.sizePt * PT_TO_PX) + 'px';
      headerEl.appendChild(headLeft);
      headerEl.appendChild(headRight);
      pageEl.appendChild(headerEl);

      container.appendChild(pageEl);
    }
  }

  // ── Public engine ──────────────────────────────────────────────────────────
  function createEngine(userOpts){
    var opts = Object.assign({}, DEFAULT_OPTS, userOpts || {});
    opts.pageSize = Object.assign({}, DEFAULT_OPTS.pageSize, (userOpts || {}).pageSize || {});
    opts.margins  = Object.assign({}, DEFAULT_OPTS.margins,  (userOpts || {}).margins  || {});
    opts.baseFont = Object.assign({}, DEFAULT_OPTS.baseFont, (userOpts || {}).baseFont || {});

    var blocks = [];
    var lastLayout = null;

    return {
      setContent: function(b){ blocks = Array.isArray(b) ? b : []; },
      layout: function(){ lastLayout = paginate(blocks, opts); return lastLayout; },
      getPages: function(){ return lastLayout ? lastLayout.pages : []; },
      render: function(container, renderOpts){
        if(!lastLayout) this.layout();
        renderToDOM(lastLayout, container, Object.assign({}, opts, renderOpts || {}));
      },
      setOptions: function(next){
        Object.assign(opts, next || {});
        if(next && next.pageSize) opts.pageSize = Object.assign({}, opts.pageSize, next.pageSize);
        if(next && next.margins)  opts.margins  = Object.assign({}, opts.margins,  next.margins);
        if(next && next.baseFont) opts.baseFont = Object.assign({}, opts.baseFont, next.baseFont);
      },
      getOptions: function(){ return opts; },
      // Expose internals for testing / future hybrid integration
      _internals: { measureText: measureText, breakParagraphIntoLines: breakParagraphIntoLines, paginate: paginate }
    };
  }

  return {
    create: createEngine,
    paginate: paginate,
    renderToDOM: renderToDOM,
    PT_TO_PX: PT_TO_PX,
    measureText: measureText,
    _measureCtx: getMeasureCtx
  };
});
