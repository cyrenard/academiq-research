/* AQ Engine — Document model
 *
 * Editor's own document model. Replaces TipTap as the source of truth so we
 * can drive layout, selection, and edit operations end-to-end.
 *
 * Shape:
 *   Document = { blocks: Block[] }
 *   Block    = { type, runs: Run[], align?, font?, spaceAfterPx?, ... }
 *   Run      = { text, bold?, italic?, underline?, strike?, color?,
 *                baselineShift?, fontScale?, citation?, footnote?, font? }
 *
 * Offsets are flat character counts across all blocks; consecutive blocks are
 * separated by a +1 "block break" gap. Same convention as engine.paginate so
 * selection offsets line up naturally.
 *
 * Edit ops return a new immutable-ish snapshot (cheap clone) so undo/redo can
 * push them onto a history stack without aliasing.
 */
(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){ module.exports = factory(); return; }
  root.AQEngineDocument = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){

  function cloneRun(r){
    return Object.assign({}, r, {
      // Deep-copy the only nested known objects
      citation: r.citation ? Object.assign({}, r.citation) : null,
      footnote: r.footnote ? Object.assign({}, r.footnote) : null,
      font:     r.font     ? Object.assign({}, r.font)     : null
    });
  }
  function cloneBlock(b){
    // Normalize text-only blocks into runs[] form. The doc model treats
    // runs[] as the source of truth; engine's text-fallback was masking
    // length=0 blocks which sent every locate() to the document's tail.
    var sourceRuns = (b && b.runs && b.runs.length)
      ? b.runs
      : (b && typeof b.text === 'string' ? [{ text: b.text }] : []);
    var out = Object.assign({}, b, {
      runs: sourceRuns.map(cloneRun),
      font: b.font ? Object.assign({}, b.font) : null
    });
    // Drop the legacy `text` property to prevent drift between text + runs.
    if('text' in out) delete out.text;
    return out;
  }
  function cloneDoc(d){
    return { blocks: (d.blocks || []).map(cloneBlock) };
  }

  function blockTextLength(b){
    var n = 0;
    var runs = b.runs || [];
    for(var i = 0; i < runs.length; i++) n += String(runs[i].text || '').length;
    return n;
  }

  // Compute (blockIdx, intraOffset) from a flat doc offset.
  // Each block contributes blockTextLength(b) chars then +1 for the break.
  function locate(doc, off){
    var cursor = 0;
    for(var i = 0; i < doc.blocks.length; i++){
      var len = blockTextLength(doc.blocks[i]);
      if(off <= cursor + len) return { blockIdx: i, intra: off - cursor };
      cursor += len + 1; // block break
    }
    var last = doc.blocks.length - 1;
    return { blockIdx: last, intra: blockTextLength(doc.blocks[last]) };
  }

  // Within a block, find which run contains a given intra-block offset.
  function locateRun(block, intra){
    var runs = block.runs || [];
    var cursor = 0;
    for(var i = 0; i < runs.length; i++){
      var len = String(runs[i].text || '').length;
      if(intra <= cursor + len) return { runIdx: i, intra: intra - cursor };
      cursor += len;
    }
    return { runIdx: runs.length - 1, intra: runs.length ? String(runs[runs.length - 1].text || '').length : 0 };
  }

  function flatLength(doc){
    var n = 0;
    for(var i = 0; i < doc.blocks.length; i++){
      n += blockTextLength(doc.blocks[i]);
      if(i < doc.blocks.length - 1) n += 1;
    }
    return n;
  }

  // Insert plain text at offset. The new text inherits the format of the run
  // immediately preceding the insertion point (Word-like behaviour).
  function insertText(doc, off, text){
    if(!text) return doc;
    var d = cloneDoc(doc);
    var loc = locate(d, off);
    var block = d.blocks[loc.blockIdx];
    var runLoc = locateRun(block, loc.intra);
    var runs = block.runs || (block.runs = []);
    if(!runs.length){
      runs.push({ text: text });
      return d;
    }
    var run = runs[runLoc.runIdx];
    var t = String(run.text || '');
    run.text = t.slice(0, runLoc.intra) + text + t.slice(runLoc.intra);
    return d;
  }

  // Insert a list of blocks at offset. If offset is inside a block, that block
  // is split and the new blocks are sandwiched in between.
  function insertBlocks(doc, off, newBlocks){
    if(!newBlocks || !newBlocks.length) return doc;
    var d = cloneDoc(doc);
    var loc = locate(d, off);
    var block = d.blocks[loc.blockIdx];
    
    // Split current block at loc.intra
    var leftRuns  = sliceRunsLeft(block.runs || [], loc.intra);
    var rightRuns = sliceRunsRight(block.runs || [], loc.intra);
    
    var firstNew = cloneBlock(newBlocks[0]);
    var lastNew  = cloneBlock(newBlocks[newBlocks.length - 1]);
    
    if(newBlocks.length === 1){
      // Single block being inserted: merge its content into the current split block
      block.runs = leftRuns.concat(firstNew.runs, rightRuns);
      if(!block.runs.length) block.runs = [{ text: '' }];
      return d;
    }
    
    // Multiple blocks: 
    // 1. First new block merges its content with the head of the split block
    block.runs = leftRuns.concat(firstNew.runs);
    if(!block.runs.length) block.runs = [{ text: '' }];
    
    // 2. Middle blocks (if any) are inserted as-is
    var middle = newBlocks.slice(1, -1).map(cloneBlock);
    
    // 3. Last new block merges its content with the tail of the split block
    lastNew.runs = lastNew.runs.concat(rightRuns);
    if(!lastNew.runs.length) lastNew.runs = [{ text: '' }];
    
    var toInsert = middle.concat([lastNew]);
    for(var i = 0; i < toInsert.length; i++){
      d.blocks.splice(loc.blockIdx + 1 + i, 0, toInsert[i]);
    }
    
    return d;
  }

  // Delete the half-open range [from, to). Handles spans crossing block breaks
  // by merging the partial blocks at each end.
  function deleteRange(doc, from, to){
    if(from >= to) return doc;
    var d = cloneDoc(doc);
    var locA = locate(d, from);
    var locB = locate(d, to);
    if(locA.blockIdx === locB.blockIdx){
      var b = d.blocks[locA.blockIdx];
      var runs = b.runs || [];
      var newRuns = [];
      var cursor = 0;
      for(var i = 0; i < runs.length; i++){
        var rt = String(runs[i].text || '');
        var rStart = cursor, rEnd = cursor + rt.length;
        if(rEnd <= locA.intra || rStart >= locB.intra){
          newRuns.push(runs[i]);
        }else{
          var keepBefore = (locA.intra > rStart) ? rt.slice(0, locA.intra - rStart) : '';
          var keepAfter  = (locB.intra < rEnd)   ? rt.slice(locB.intra - rStart)    : '';
          var combined = keepBefore + keepAfter;
          if(combined.length){
            var nr = cloneRun(runs[i]); nr.text = combined; newRuns.push(nr);
          }
        }
        cursor = rEnd;
      }
      b.runs = newRuns.length ? newRuns : [{ text: '' }];
      return d;
    }
    // Cross-block: keep [0..locA.intra) of blockA, drop A+1..B-1, append (locB.intra..end) of blockB
    var blockA = d.blocks[locA.blockIdx];
    var blockB = d.blocks[locB.blockIdx];
    blockA.runs = sliceRunsLeft(blockA.runs || [], locA.intra);
    var tailRuns = sliceRunsRight(blockB.runs || [], locB.intra);
    // Tail runs become trailing runs of blockA (merging the two block contents)
    blockA.runs = (blockA.runs || []).concat(tailRuns);
    if(!blockA.runs.length) blockA.runs = [{ text: '' }];
    d.blocks.splice(locA.blockIdx + 1, locB.blockIdx - locA.blockIdx);
    return d;
  }

  function sliceRunsLeft(runs, intra){
    var out = [];
    var cursor = 0;
    for(var i = 0; i < runs.length; i++){
      var rt = String(runs[i].text || '');
      if(cursor + rt.length <= intra){ out.push(runs[i]); cursor += rt.length; continue; }
      var keep = rt.slice(0, intra - cursor);
      if(keep.length){ var nr = cloneRun(runs[i]); nr.text = keep; out.push(nr); }
      break;
    }
    return out;
  }
  function sliceRunsRight(runs, intra){
    var out = [];
    var cursor = 0;
    for(var i = 0; i < runs.length; i++){
      var rt = String(runs[i].text || '');
      var rStart = cursor, rEnd = cursor + rt.length;
      cursor = rEnd;
      if(rEnd <= intra) continue;
      if(rStart >= intra){ out.push(runs[i]); continue; }
      var keep = rt.slice(intra - rStart);
      if(keep.length){ var nr = cloneRun(runs[i]); nr.text = keep; out.push(nr); }
    }
    return out;
  }

  // Split the block at offset into two blocks. The new (second) block inherits
  // type/font from the first.
  function splitBlock(doc, off){
    var d = cloneDoc(doc);
    var loc = locate(d, off);
    var block = d.blocks[loc.blockIdx];
    var left  = sliceRunsLeft(block.runs || [], loc.intra);
    var right = sliceRunsRight(block.runs || [], loc.intra);
    var newBlock = Object.assign({}, cloneBlock(block));
    block.runs = left.length ? left : [{ text: '' }];
    newBlock.runs = right.length ? right : [{ text: '' }];
    // After Enter, default to a body paragraph (don't carry heading attrs)
    if(block.type === 'heading'){
      newBlock.type = 'paragraph';
      newBlock.font = null;
      delete newBlock.level;
      newBlock.spaceAfterPx = 0;
    }
    d.blocks.splice(loc.blockIdx + 1, 0, newBlock);
    return d;
  }

  // Merge block at idx with the previous one; offset returned is the join point.
  function mergeWithPrevious(doc, blockIdx){
    if(blockIdx <= 0 || blockIdx >= doc.blocks.length) return { doc: doc, offset: -1 };
    var d = cloneDoc(doc);
    var prev = d.blocks[blockIdx - 1];
    var cur  = d.blocks[blockIdx];
    var joinIntra = blockTextLength(prev);
    prev.runs = (prev.runs || []).concat(cur.runs || []);
    if(!prev.runs.length) prev.runs = [{ text: '' }];
    d.blocks.splice(blockIdx, 1);
    // Compute global join offset
    var globalOffset = 0;
    for(var i = 0; i < blockIdx - 1; i++) globalOffset += blockTextLength(d.blocks[i]) + 1;
    globalOffset += joinIntra;
    return { doc: d, offset: globalOffset };
  }

  // Apply (or toggle) an inline mark — bold, italic, underline, strike — on a
  // range. Splits runs at the range boundaries and tags the middle slice.
  function applyMarkInRuns(runs, from, to, mark, value){
    var out = [];
    var cursor = 0;
    for(var i = 0; i < runs.length; i++){
      var r = runs[i];
      var rt = String(r.text || '');
      var rStart = cursor, rEnd = cursor + rt.length;
      cursor = rEnd;
      if(rEnd <= from || rStart >= to){ out.push(r); continue; }
      var beforeText = rStart < from ? rt.slice(0, from - rStart) : '';
      var middleText = rt.slice(Math.max(0, from - rStart), Math.min(rt.length, to - rStart));
      var afterText  = rEnd > to ? rt.slice(to - rStart) : '';
      if(beforeText){ var rb = cloneRun(r); rb.text = beforeText; out.push(rb); }
      if(middleText){
        var rm = cloneRun(r); rm.text = middleText;
        if(value) rm[mark] = value; else delete rm[mark];
        out.push(rm);
      }
      if(afterText){ var ra = cloneRun(r); ra.text = afterText; out.push(ra); }
    }
    return mergeAdjacent(out);
  }
  function mergeAdjacent(runs){
    if(runs.length < 2) return runs;
    var out = [runs[0]];
    for(var i = 1; i < runs.length; i++){
      var prev = out[out.length - 1], cur = runs[i];
      if(runsHaveSameFormat(prev, cur)){
        prev.text = String(prev.text || '') + String(cur.text || '');
      }else{
        out.push(cur);
      }
    }
    return out;
  }
  function runsHaveSameFormat(a, b){
    var keys = ['bold','italic','underline','strike','color','highlight','baselineShift','fontScale','href'];
    for(var i = 0; i < keys.length; i++) if(!!a[keys[i]] !== !!b[keys[i]] && a[keys[i]] !== b[keys[i]]) return false;
    return JSON.stringify(a.font || null) === JSON.stringify(b.font || null) &&
           JSON.stringify(a.citation || null) === JSON.stringify(b.citation || null) &&
           JSON.stringify(a.footnote || null) === JSON.stringify(b.footnote || null);
  }
  // Apply a font property (sizePt, family) across a range. Works like
  // applyMark but sets run.font.{prop} instead of run.{mark}.
  function applyFontPropInRuns(runs, from, to, prop, value){
    var out = [];
    var cursor = 0;
    for(var i = 0; i < runs.length; i++){
      var r = runs[i];
      var rt = String(r.text || '');
      var rStart = cursor, rEnd = cursor + rt.length;
      cursor = rEnd;
      if(rEnd <= from || rStart >= to){ out.push(r); continue; }
      var beforeText = rStart < from ? rt.slice(0, from - rStart) : '';
      var middleText = rt.slice(Math.max(0, from - rStart), Math.min(rt.length, to - rStart));
      var afterText  = rEnd > to ? rt.slice(to - rStart) : '';
      if(beforeText){ var rb = cloneRun(r); rb.text = beforeText; out.push(rb); }
      if(middleText){
        var rm = cloneRun(r); rm.text = middleText;
        rm.font = Object.assign({}, rm.font || {});
        if(value) rm.font[prop] = value; else delete rm.font[prop];
        // Clean up empty font object
        if(!Object.keys(rm.font).length) rm.font = null;
        out.push(rm);
      }
      if(afterText){ var ra = cloneRun(r); ra.text = afterText; out.push(ra); }
    }
    return mergeAdjacent(out);
  }
  function applyFontProp(doc, from, to, prop, value){
    if(from >= to) return doc;
    var d = cloneDoc(doc);
    var cursor = 0;
    for(var bi = 0; bi < d.blocks.length; bi++){
      var b = d.blocks[bi];
      var bLen = blockTextLength(b);
      var bStart = cursor, bEnd = cursor + bLen;
      cursor = bEnd + 1;
      if(bEnd <= from) continue;
      if(bStart >= to) break;
      var intraFrom = Math.max(0, from - bStart);
      var intraTo   = Math.min(bLen, to - bStart);
      b.runs = applyFontPropInRuns(b.runs || [], intraFrom, intraTo, prop, value);
    }
    return d;
  }

  function applyMark(doc, from, to, mark, value){
    if(from >= to) return doc;
    var d = cloneDoc(doc);
    var cursor = 0;
    for(var bi = 0; bi < d.blocks.length; bi++){
      var b = d.blocks[bi];
      var bLen = blockTextLength(b);
      var bStart = cursor, bEnd = cursor + bLen;
      cursor = bEnd + 1;
      if(bEnd <= from) continue;
      if(bStart >= to) break;
      var intraFrom = Math.max(0, from - bStart);
      var intraTo   = Math.min(bLen, to - bStart);
      b.runs = applyMarkInRuns(b.runs || [], intraFrom, intraTo, mark, value);
    }
    return d;
  }
  function rangeHasMark(doc, from, to, mark){
    if(from >= to) return false;
    var cursor = 0;
    for(var bi = 0; bi < doc.blocks.length; bi++){
      var b = doc.blocks[bi];
      var bLen = blockTextLength(b);
      var bStart = cursor, bEnd = cursor + bLen;
      cursor = bEnd + 1;
      if(bEnd <= from) continue;
      if(bStart >= to) break;
      var rcur = 0;
      var runs = b.runs || [];
      for(var ri = 0; ri < runs.length; ri++){
        var rt = String(runs[ri].text || '');
        var rStart = bStart + rcur, rEnd = rStart + rt.length;
        rcur += rt.length;
        if(rEnd <= from || rStart >= to) continue;
        if(runs[ri][mark]) return true;
      }
    }
    return false;
  }

  // Block type — paragraph / heading. setBlockType derives font + spacing
  // from heading level so the engine doesn't need type-specific knowledge.
  var HEADING_SIZES_PT = { 1: 18, 2: 16, 3: 14, 4: 13, 5: 12, 6: 12 };
  function setBlockType(doc, blockIdx, type, attrs){
    if(blockIdx < 0 || blockIdx >= doc.blocks.length) return doc;
    var d = cloneDoc(doc);
    var b = d.blocks[blockIdx];
    if(type === 'heading'){
      var level = Math.max(1, Math.min(6, (attrs && attrs.level) || 1));
      b.type = 'heading';
      b.level = level;
      b.font = { sizePt: HEADING_SIZES_PT[level], weight: '700' };
      b.spaceAfterPx = level <= 2 ? 12 : 8;
    }else{
      b.type = 'paragraph';
      delete b.level;
      b.font = null;
      b.spaceAfterPx = 0;
    }
    return d;
  }

  // Find which block contains a given offset (helper for editor commands).
  function blockIndexAt(doc, off){
    return locate(doc, off).blockIdx;
  }
  // Block range covered by [from, to].
  function blocksInRange(doc, from, to){
    var a = blockIndexAt(doc, from);
    var b = blockIndexAt(doc, to);
    if(b < a) { var tmp = a; a = b; b = tmp; }
    return { from: a, to: b };
  }

  // ── Lists ────────────────────────────────────────────────────────────────
  // A block becomes a list item by carrying { list:{ type, level } }.
  function setListType(doc, blockIdx, listType, level){
    if(blockIdx < 0 || blockIdx >= doc.blocks.length) return doc;
    var d = cloneDoc(doc);
    var b = d.blocks[blockIdx];
    if(listType === 'bullet' || listType === 'ordered'){
      b.list = { type: listType, level: Math.max(0, parseInt(level || 0, 10)) };
    }else{
      delete b.list;
    }
    return d;
  }
  function setListTypeForRange(doc, from, to, listType, level){
    var range = blocksInRange(doc, from, to);
    var d = doc;
    for(var i = range.from; i <= range.to; i++) d = setListType(d, i, listType, level);
    return d;
  }
  function changeListLevel(doc, blockIdx, delta){
    if(blockIdx < 0 || blockIdx >= doc.blocks.length) return doc;
    var b = doc.blocks[blockIdx];
    if(!b.list) return doc;
    var newLevel = Math.max(0, Math.min(5, b.list.level + delta));
    if(newLevel === b.list.level) return doc;
    return setListType(doc, blockIdx, b.list.type, newLevel);
  }

  // ── Plain-text view & word boundaries ────────────────────────────────────
  // The doc's flat text representation: block contents separated by a single
  // '\n', so offsets line up with the +1 block-break gap convention.
  function getPlainText(doc){
    return doc.blocks.map(function(b){
      return (b.runs || []).map(function(r){ return String(r.text || ''); }).join('');
    }).join('\n');
  }
  function findWordBoundary(doc, off, direction){
    var t = getPlainText(doc);
    var n = t.length;
    var i = Math.max(0, Math.min(n, off));
    if(direction < 0){
      while(i > 0 && /\s/.test(t.charAt(i - 1))) i--;
      while(i > 0 && /[^\s]/.test(t.charAt(i - 1))) i--;
    }else{
      while(i < n && /\s/.test(t.charAt(i))) i++;
      while(i < n && /[^\s]/.test(t.charAt(i))) i++;
    }
    return i;
  }

  // Public factory
  function createDocument(initialBlocks){
    var doc = { blocks: (initialBlocks && initialBlocks.length) ? initialBlocks.map(cloneBlock) : [{ type:'paragraph', runs:[{ text:'' }] }] };
    var history = [cloneDoc(doc)];
    var future  = [];

    function commit(next){
      doc = next;
      history.push(cloneDoc(next));
      if(history.length > 200) history.shift();
      future.length = 0;
    }
    return {
      get: function(){ return doc; },
      length: function(){ return flatLength(doc); },
      replace: function(blocks){ commit({ blocks: blocks.map(cloneBlock) }); },
      insertText: function(off, text){ commit(insertText(doc, off, text)); },
      insertBlocks: function(off, blocks){ commit(insertBlocks(doc, off, blocks)); },
      deleteRange: function(from, to){ commit(deleteRange(doc, from, to)); },
      splitBlock: function(off){ commit(splitBlock(doc, off)); },
      mergeWithPrevious: function(blockIdx){
        var r = mergeWithPrevious(doc, blockIdx);
        if(r.offset >= 0) commit(r.doc);
        return r.offset;
      },
      applyMark: function(from, to, mark, value){ commit(applyMark(doc, from, to, mark, value)); },
      applyFontProp: function(from, to, prop, value){ commit(applyFontProp(doc, from, to, prop, value)); },
      rangeHasMark: function(from, to, mark){ return rangeHasMark(doc, from, to, mark); },
      setBlockType: function(blockIdx, type, attrs){ commit(setBlockType(doc, blockIdx, type, attrs)); },
      setBlockTypeForRange: function(from, to, type, attrs){
        var range = blocksInRange(doc, from, to);
        var d = doc;
        for(var i = range.from; i <= range.to; i++) d = setBlockType(d, i, type, attrs);
        commit(d);
      },
      blockIndexAt: function(off){ return blockIndexAt(doc, off); },
      findWordBoundary: function(off, dir){ return findWordBoundary(doc, off, dir); },
      getPlainText: function(){ return getPlainText(doc); },
      setListType:         function(blockIdx, type, level){ commit(setListType(doc, blockIdx, type, level)); },
      setListTypeForRange: function(from, to, type, level){ commit(setListTypeForRange(doc, from, to, type, level)); },
      setAlign: function(blockIdx, align){
        if(blockIdx < 0 || blockIdx >= doc.blocks.length) return;
        var d = cloneDoc(doc);
        d.blocks[blockIdx].align = align;
        commit(d);
      },
      setAlignForRange: function(from, to, align){
        var range = blocksInRange(doc, from, to);
        var d = cloneDoc(doc);
        for(var i = range.from; i <= range.to; i++) d.blocks[i].align = align;
        commit(d);
      },
      changeListLevel:     function(blockIdx, delta){ commit(changeListLevel(doc, blockIdx, delta)); },
      blockTextLength:     function(blockIdx){ return blockTextLength(doc.blocks[blockIdx] || { runs: [] }); },
      locate: function(off){ return locate(doc, off); },
      undo: function(){
        if(history.length <= 1) return false;
        future.push(history.pop());
        doc = cloneDoc(history[history.length - 1]);
        return true;
      },
      redo: function(){
        if(!future.length) return false;
        var next = future.pop();
        history.push(next);
        doc = cloneDoc(next);
        return true;
      },
      // Pure helpers exposed for tests
      _internals: { locate: locate, locateRun: locateRun, flatLength: flatLength, insertText: insertText, deleteRange: deleteRange, splitBlock: splitBlock, mergeWithPrevious: mergeWithPrevious }
    };
  }

  return { create: createDocument, _ops: { insertText: insertText, deleteRange: deleteRange, splitBlock: splitBlock, mergeWithPrevious: mergeWithPrevious, locate: locate, flatLength: flatLength } };
});
