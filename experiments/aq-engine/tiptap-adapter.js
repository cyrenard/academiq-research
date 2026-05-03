/* AQ Engine — TipTap doc adapter
 *
 * Converts a TipTap (ProseMirror) document JSON into engine blocks.
 * Top-level nodes → blocks. Inline marks → run flags.
 *
 * Mark mapping:
 *   bold/strong   → run.bold
 *   italic/em     → run.italic
 *   underline     → run.underline
 *   strike        → run.strike
 *   subscript     → baselineShift -4, fontScale 0.75
 *   superscript   → baselineShift +6, fontScale 0.75
 *   textStyle     → font.color, font.family, font.size (from attrs)
 */
(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){ module.exports = factory(); return; }
  root.AQEngineTipTapAdapter = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){

  var HEADING_SIZES_PT = { 1: 18, 2: 16, 3: 14, 4: 13, 5: 12, 6: 12 };

  function flattenInlineToRuns(nodes){
    var runs = [];
    if(!nodes || !nodes.length) return runs;
    for(var i = 0; i < nodes.length; i++){
      var n = nodes[i];
      if(!n) continue;
      if(n.type === 'text'){
        var marks = n.marks || [];
        var run = { text: String(n.text || '') };
        var fontOverride = null;
        for(var m = 0; m < marks.length; m++){
          var mk = marks[m];
          var t = mk.type || mk.name;
          var attrs = mk.attrs || {};
          if(t === 'bold' || t === 'strong') run.bold = true;
          else if(t === 'italic' || t === 'em') run.italic = true;
          else if(t === 'underline') run.underline = true;
          else if(t === 'strike') run.strike = true;
          else if(t === 'subscript'){ run.baselineShift = -4; run.fontScale = 0.75; }
          else if(t === 'superscript'){ run.baselineShift = 6; run.fontScale = 0.75; }
          else if(t === 'citation'){
            // AcademiQ citation Mark: text span styled as a clickable citation.
            // We propagate semantic attrs so the renderer (or future selection
            // layer) can wire click-to-jump-to-bibliography behaviour.
            run.citation = {
              ref:    attrs['data-ref']   || null,
              id:     attrs['data-id']    || null,
              mode:   attrs['data-mode']  || null,
              noteId: attrs['data-note-id'] || null
            };
            // Visual styling — AcademiQ citations are a distinct accent colour.
            if(!run.color) run.color = '#1a4480';
          }
          else if(t === 'textStyle'){
            fontOverride = fontOverride || {};
            if(attrs.color) run.color = attrs.color;
            if(attrs.fontFamily) fontOverride.family = attrs.fontFamily;
            if(attrs.fontSize){
              var sz = parseFloat(String(attrs.fontSize).replace(/[^0-9.]/g, ''));
              if(sz){
                // If unit is px, convert to pt; assume pt otherwise.
                fontOverride.sizePt = /px/i.test(String(attrs.fontSize)) ? sz * 72 / 96 : sz;
              }
            }
          }
        }
        if(fontOverride) run.font = fontOverride;
        runs.push(run);
      }else if(n.type === 'hardBreak'){
        // Render as a forced line break: a token with isBreak flag will be
        // honored by the engine. For now we emit a newline character that
        // the engine treats as a regular space; full break support is TODO.
        runs.push({ text: '\n' });
      }else if(n.type === 'footnoteRef'){
        // AcademiQ inline atom — display as superscript number.
        var attrs = n.attrs || {};
        var fnId = attrs.fnId || attrs['data-fn-id'] || '?';
        runs.push({
          text: String(fnId),
          baselineShift: 6,
          fontScale: 0.75,
          color: '#1a4480',
          footnote: { fnId: fnId, fnType: attrs.fnType || 'footnote' }
        });
      }else if(n.type === 'image'){
        // Inline image — we treat it as an atom run; its actual rendering will
        // be wired by the renderer when atom support lands. For now emit a
        // placeholder so layout doesn't crash on docs that contain images.
        var attrs = n.attrs || {};
        runs.push({
          text: '🖼',
          atom: { kind: 'image', src: attrs.src || '', width: attrs.width || '70%', align: attrs.align || 'left' }
        });
      }else if(n.content){
        // Recurse into nested inline containers (rare in default schema).
        var nested = flattenInlineToRuns(n.content);
        for(var k = 0; k < nested.length; k++) runs.push(nested[k]);
      }
    }
    return runs;
  }

  function nodeToBlock(node){
    if(!node) return null;
    var type = node.type;
    var attrs = node.attrs || {};

    if(type === 'paragraph'){
      var runs = flattenInlineToRuns(node.content || []);
      if(!runs.length) runs = [{ text: '' }];
      return {
        runs: runs,
        spaceAfterPx: 0,
        align: attrs.textAlign || 'left'
      };
    }

    if(type === 'heading'){
      var level = parseInt(attrs.level, 10) || 1;
      var sizePt = HEADING_SIZES_PT[level] || 14;
      var runs = flattenInlineToRuns(node.content || []);
      if(!runs.length) runs = [{ text: '' }];
      // APA-ish: headings are bold, no paragraph indent, with vertical spacing.
      return {
        type: 'heading',
        level: level,
        runs: runs,
        font: { sizePt: sizePt, weight: '700' },
        spaceAfterPx: level <= 2 ? 12 : 8,
        align: attrs.textAlign || 'left'
      };
    }

    if(type === 'blockquote'){
      var inner = (node.content || [])
        .map(nodeToBlock)
        .filter(Boolean);
      // Inherit a left indent for each inner block; engine supports firstLineIndentPx
      // but here we want a hanging-style indent — emit blocks as-is for now and
      // mark them; renderer ignores it but inline indent could be added later.
      for(var i = 0; i < inner.length; i++){
        inner[i].leftIndentPx = (inner[i].leftIndentPx || 0) + 36;
      }
      return inner;
    }

    if(type === 'bulletList' || type === 'orderedList'){
      var items = node.content || [];
      var listType = (type === 'orderedList') ? 'ordered' : 'bullet';
      var listLevel = attrs.level ? parseInt(attrs.level, 10) - 1 : 0;
      var blocks = [];
      for(var idx = 0; idx < items.length; idx++){
        var li = items[idx];
        var firstChild = (li.content || [])[0];
        if(firstChild){
          var b = nodeToBlock(firstChild);
          if(b){
            var arr = Array.isArray(b) ? b : [b];
            // Set proper list property so engine renders bullet/number marker
            if(arr[0]){
              arr[0].list = { type: listType, level: listLevel };
              arr[0].firstLineIndentPx = 0; // engine handles indent via list level
            }
            blocks = blocks.concat(arr);
          }
          // Subsequent paragraphs in the list item: also mark as list items
          for(var c = 1; c < (li.content || []).length; c++){
            var nb = nodeToBlock(li.content[c]);
            if(nb){
              var nbArr = Array.isArray(nb) ? nb : [nb];
              for(var j = 0; j < nbArr.length; j++){
                nbArr[j].list = { type: listType, level: listLevel };
                nbArr[j].firstLineIndentPx = 0;
              }
              blocks = blocks.concat(nbArr);
            }
          }
        }
      }
      return blocks;
    }

    if(type === 'table'){
      var rows = [];
      var tableContent = node.content || [];
      var isFirst = true;
      for(var tr = 0; tr < tableContent.length; tr++){
        var rowNode = tableContent[tr];
        if(rowNode.type !== 'tableRow') continue;
        var cells = [];
        var rowCells = rowNode.content || [];
        for(var tc = 0; tc < rowCells.length; tc++){
          var cellNode = rowCells[tc];
          // Each cell has content[] of paragraphs; flatten first paragraph's runs
          var cellPara = (cellNode.content || [])[0];
          var cellRuns = cellPara ? flattenInlineToRuns(cellPara.content || []) : [{ text: '' }];
          if(!cellRuns.length) cellRuns = [{ text: '' }];
          cells.push({ runs: cellRuns });
        }
        rows.push({ cells: cells });
      }
      return { type: 'table', rows: rows, headerRow: true };
    }

    if(type === 'horizontalRule'){
      return { runs: [{ text: '' }], rule: true };
    }

    // Unknown / unsupported block: skip gracefully.
    return null;
  }

  function convertDoc(doc){
    if(!doc) return [];
    var top = doc.content || (doc.type === 'doc' ? [] : [doc]);
    var blocks = [];
    for(var i = 0; i < top.length; i++){
      var b = nodeToBlock(top[i]);
      if(!b) continue;
      if(Array.isArray(b)) blocks = blocks.concat(b);
      else blocks.push(b);
    }
    return blocks;
  }

  // ── Export: engine blocks → TipTap JSON ──────────────────────────────────
  function runsToTipTapContent(runs){
    var content = [];
    for(var i = 0; i < runs.length; i++){
      var run = runs[i];
      var text = String(run.text || '');
      if(!text) continue;

      // Footnote atoms
      if(run.footnote){
        content.push({
          type: 'footnoteRef',
          attrs: { fnId: run.footnote.fnId, fnType: run.footnote.fnType || 'footnote' }
        });
        continue;
      }

      var marks = [];
      if(run.bold) marks.push({ type: 'bold' });
      if(run.italic) marks.push({ type: 'italic' });
      if(run.underline) marks.push({ type: 'underline' });
      if(run.strike) marks.push({ type: 'strike' });
      if(run.baselineShift && run.baselineShift > 0) marks.push({ type: 'superscript' });
      if(run.baselineShift && run.baselineShift < 0) marks.push({ type: 'subscript' });
      if(run.citation){
        var cAttrs = {};
        if(run.citation.ref) cAttrs['data-ref'] = run.citation.ref;
        if(run.citation.id) cAttrs['data-id'] = run.citation.id;
        if(run.citation.mode) cAttrs['data-mode'] = run.citation.mode;
        if(run.citation.noteId) cAttrs['data-note-id'] = run.citation.noteId;
        marks.push({ type: 'citation', attrs: cAttrs });
      }
      if(run.href) marks.push({ type: 'link', attrs: { href: run.href } });

      // textStyle for color, fontFamily, fontSize
      var tsAttrs = {};
      if(run.color && (!run.citation)) tsAttrs.color = run.color;
      if(run.highlight) tsAttrs.backgroundColor = run.highlight;
      if(run.font){
        if(run.font.family) tsAttrs.fontFamily = run.font.family;
        if(run.font.sizePt) tsAttrs.fontSize = run.font.sizePt + 'pt';
      }
      if(Object.keys(tsAttrs).length) marks.push({ type: 'textStyle', attrs: tsAttrs });

      var node = { type: 'text', text: text };
      if(marks.length) node.marks = marks;
      content.push(node);
    }
    return content;
  }

  function blockToTipTapNode(block){
    if(!block) return null;

    // Image block
    if(block.type === 'image'){
      return {
        type: 'image',
        attrs: { src: block.src || '', alt: block.alt || '', width: block.width || null }
      };
    }

    // Table block
    if(block.type === 'table' && block.rows){
      var tableContent = [];
      for(var tr = 0; tr < block.rows.length; tr++){
        var cells = block.rows[tr].cells || [];
        var rowContent = [];
        for(var tc = 0; tc < cells.length; tc++){
          var cellContent = runsToTipTapContent(cells[tc].runs || []);
          var cellType = (tr === 0 && block.headerRow) ? 'tableHeader' : 'tableCell';
          rowContent.push({ type: cellType, content: [{ type: 'paragraph', content: cellContent }] });
        }
        tableContent.push({ type: 'tableRow', content: rowContent });
      }
      return { type: 'table', content: tableContent };
    }

    var content = runsToTipTapContent(block.runs || []);
    if(!content.length) content = []; // empty paragraph is valid in TipTap

    var attrs = {};
    if(block.align && block.align !== 'left') attrs.textAlign = block.align;

    // Heading
    if(block.type === 'heading'){
      attrs.level = block.level || 1;
      return { type: 'heading', attrs: attrs, content: content };
    }

    // List item — wrapped in bulletList/orderedList at the doc level
    // We return a special marker so the doc-level exporter can group them.
    if(block.list){
      return {
        _listType: block.list.type,
        _listLevel: block.list.level || 0,
        type: 'paragraph',
        attrs: attrs,
        content: content
      };
    }

    // Regular paragraph
    var node = { type: 'paragraph', content: content };
    if(Object.keys(attrs).length) node.attrs = attrs;
    return node;
  }

  function exportToTipTap(blocks){
    var doc = { type: 'doc', content: [] };
    var i = 0;
    while(i < blocks.length){
      var block = blocks[i];
      var node = blockToTipTapNode(block);
      if(!node){ i++; continue; }

      // Group consecutive list blocks into bulletList/orderedList
      if(node._listType){
        var listType = (node._listType === 'ordered') ? 'orderedList' : 'bulletList';
        var listContent = [];
        while(i < blocks.length){
          var b = blocks[i];
          var n = blockToTipTapNode(b);
          if(!n || !n._listType || n._listType !== node._listType) break;
          // Wrap paragraph in listItem
          var paraNode = { type: 'paragraph', content: n.content || [] };
          if(n.attrs && Object.keys(n.attrs).length) paraNode.attrs = n.attrs;
          listContent.push({ type: 'listItem', content: [paraNode] });
          i++;
        }
        doc.content.push({ type: listType, content: listContent });
        continue;
      }

      doc.content.push(node);
      i++;
    }
    return doc;
  }

  return {
    convertDoc: convertDoc,
    exportToTipTap: exportToTipTap,
    nodeToBlock: nodeToBlock,
    flattenInlineToRuns: flattenInlineToRuns
  };
});
