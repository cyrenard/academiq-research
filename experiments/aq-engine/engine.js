/* AQ Custom Layout Engine — experimental
 *
 * Goal: Word-like pagination from scratch. We control:
 *   1. Font metrics (Canvas measureText)
 *   2. Line-breaking (greedy first-fit, word-aware)
 *   3. Page layout (APA-compliant: A4, 1in margins, double spacing)
 *   4. DOM render (absolute-positioned line boxes per page)
 *
 * Units: all internal math in CSS pixels (1in = 96 CSS px).
 * Inputs accept points (1pt = 96/72 px) for typography ergonomics.
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

  // ── Tokenization ───────────────────────────────────────────────────────────
  // Split text into atomic break candidates: non-space tokens (words) and
  // whitespace tokens (glue). Whitespace at line ends is discarded.
  function tokenizeText(text){
    var tokens = [];
    var re = /\S+|\s+/g;
    var m;
    while((m = re.exec(text)) !== null){
      tokens.push({ text: m[0], space: /^\s/.test(m[0]) });
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
        out.push({
          text: seg,
          space: /^\s/.test(seg),
          font: font,
          decoration: run.underline ? 'underline' : (run.strike ? 'line-through' : null),
          color: run.color || null,
          highlight: run.highlight || null,
          href: run.href || null,
          baselineShift: run.baselineShift || 0,
          fontScale: run.fontScale || 1,
          citation: run.citation || null,
          footnote: run.footnote || null,
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
      var m = measureText(tok.text, f);
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

    function newPage(){ return { lines: [] }; }

    var INDENT_PER_LEVEL_PX = 28;
    var MARKER_GUTTER_PX    = 24;
    var orderedCounters = {}; // per-level counters for ordered lists
    var prevListSig     = null;

    for(var b = 0; b < blocks.length; b++){
      var block = blocks[b];
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
        var imgW = Math.min(block.width || contentWidthPx, contentWidthPx);
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
          var sig = 'ordered@' + listLevel;
          orderedCounters[listLevel] = (prevListSig === sig ? (orderedCounters[listLevel] || 0) : 0) + 1;
          markerText = orderedCounters[listLevel] + '.';
          // Reset deeper levels when this level advances
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
      var lines = breakParagraphIntoLines(block, blockContentWidth, blockFont, docOffset);

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
    container.innerHTML = '';
    container.style.background = '#f6f1e7';
    container.style.padding = '32px 0';
    container.style.minHeight = '100vh';

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
      pageEl.style.margin = '0 auto ' + opts.pageGapPx + 'px';
      pageEl.style.boxSizing = 'border-box';
      pageEl.style.fontFamily = opts.baseFont.family;

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
          imgEl.style.pointerEvents = 'none';
          imgEl.draggable = false;
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

        // Table row
        if(line.table){
          var rowEl = document.createElement('div');
          rowEl.className = 'aq-engine-table-row';
          rowEl.style.position = 'absolute';
          rowEl.style.top  = (layout.marginTopPx + line.y) + 'px';
          rowEl.style.left = line.x + 'px';
          rowEl.style.width = line.width + 'px';
          rowEl.style.height = line.height + 'px';
          rowEl.style.display = 'flex';
          rowEl.style.borderBottom = '1px solid #bbb';
          if(line.isHeader){
            rowEl.style.fontWeight = '700';
            rowEl.style.borderBottom = '2px solid #333';
          }
          for(var ci = 0; ci < line.numCols; ci++){
            var cellEl = document.createElement('div');
            cellEl.style.width = line.colWidth + 'px';
            cellEl.style.padding = line.cellPad + 'px';
            cellEl.style.boxSizing = 'border-box';
            cellEl.style.borderRight = (ci < line.numCols - 1) ? '1px solid #ccc' : 'none';
            cellEl.style.overflow = 'hidden';
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
        lineEl.style.color = '#1d1b16';

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

        // List marker — drawn outside the line content area, non-interactive
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
          marker.textContent = line.markerText;
          pageEl.appendChild(marker);
        }

        for(var i = 0; i < renderItems.length; i++){
          var it = renderItems[i];
          var span = document.createElement('span');
          span.style.font = fontShorthand(it.font);
          if(it.decoration) span.style.textDecoration = it.decoration;
          if(it.color) span.style.color = it.color;
          if(it.highlight) span.style.backgroundColor = it.highlight;
          if(it.href){
            span.style.color = span.style.color || '#1a0dab';
            span.style.textDecoration = 'underline';
            span.style.cursor = 'pointer';
            span.dataset.href = it.href;
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
          if(it.citation){
            span.className = 'cit aq-cit';
            span.style.cursor = 'pointer';
            if(it.citation.ref)    span.dataset.ref    = it.citation.ref;
            if(it.citation.id)     span.dataset.id     = it.citation.id;
            if(it.citation.mode)   span.dataset.mode   = it.citation.mode;
            if(it.citation.noteId) span.dataset.noteId = it.citation.noteId;
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
