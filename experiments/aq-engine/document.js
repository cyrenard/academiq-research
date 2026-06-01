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

  function repairJoinedWordImportText(text){
    var out = String(text || '')
      .replace(/\u00ad/g, '')
      .replace(/[\u200b-\u200d\ufeff]/g, ' ');
    if(!out) return out;
    var nextWords = [
      'birlikte','gelmiştir','görülmektedir','gostermektedir','göstermektedir',
      'yalnızca','yalnizca','öğrenme','ogrenme','iletişim','iletisim','bilgi',
      'üretimi','uretimi','gibi','çeşitli','cesitli','alanlarda','aktif',
      'şekilde','sekilde','kullanılmaya','kullanilmaya','başladığı','basladigi',
      'hayatımızın','hayatimizin','alanına','alanina','giren','bireyler',
      'üzerinde','uzerinde','bilişsel','bilissel','izler','bırakan','birakan',
      'kavram','olarak','ortaya','konmaktadır','konmaktadir','durum','insan',
      'bilişinin','bilisinin','sadece','içsel','icsel','unsurlarla','değil',
      'degil','teknoloji','dışsal','dissal','etkileşim','etkilesim','içerisine',
      'icerisine','girdiğini','girdigini','sayesinde','yoğun','yogun','akışı',
      'akisi','yükünü','yukunu','artırabilmekte','artirabilmekte','düzenleme',
      'duzenleme','yeniden','organize','etme','becerilerinin','önemini','onemini'
    ];
    nextWords.forEach(function(word){
      var escaped = String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp('([0-9A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛûÄäËëÏïÖöÜüÀ-ÖØ-öø-ÿ])(' + escaped + ')(?=\\b)', 'g');
      out = out.replace(re, function(match, prev, next, offset, source){
        var before = source.slice(Math.max(0, offset - 18), offset + 1).toLowerCase();
        if(/\s$/.test(prev)) return match;
        if(/^(da|de|ve|ile|ki|mi|mı|mu|mü)$/i.test(next)) return match;
        if(/(?:https?|doi|www)\.?$/i.test(before)) return match;
        return prev + ' ' + next;
      });
    });
    var letterClass = '0-9A-Za-z\\u00c0-\\u024f\\u1e00-\\u1effÇĞİÖŞÜçğıöşü';
    var chainWords = nextWords.concat([
      '\u00e7e\u015fitli','cesitli','ili\u015fkileri','iliskileri','ili\u015fkiler','iliskiler',
      'bulunabilmektedir','bulunabilmekte','bulunabilir','dijitalle\u015fmenin','dijitallesmenin',
      'yayg\u0131nla\u015fmas\u0131yla','yayginlasmasiyla','teknolojilerin','platformlar',
      'arac\u0131l\u0131\u011f\u0131yla','araciligiyla','kullan\u0131lan','kullanilan',
      'olmaktan','\u00e7\u0131k\u0131p','cikip','ba\u011flamda','baglamda',
      'bireylerin','becerileri','art\u0131rmaktad\u0131r','artirmaktadir',
      'd\u00fczenlenmesi','duzenlenmesi','ili\u015fkiler','iliskiler'
    ]);
    chainWords.sort(function(a,b){ return String(b).length - String(a).length; });
    chainWords.forEach(function(word){
      if(String(word).length < 5) return;
      var escaped = String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp('([' + letterClass + '])(' + escaped + ')(?=[' + letterClass + '])', 'gi');
      out = out.replace(re, function(match, prev, next, offset, source){
        var before = source.slice(Math.max(0, offset - 18), offset + 1).toLowerCase();
        if(/(?:https?|doi|www)\.?$/i.test(before)) return match;
        return prev + ' ' + next;
      });
    });
    chainWords.forEach(function(word){
      if(String(word).length < 5) return;
      var escaped = String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp('([' + letterClass + '])(' + escaped + ')(?=$|[^' + letterClass + '])', 'gi');
      out = out.replace(re, function(match, prev, next, offset, source){
        var before = source.slice(Math.max(0, offset - 18), offset + 1).toLowerCase();
        if(/(?:https?|doi|www)\.?$/i.test(before)) return match;
        return prev + ' ' + next;
      });
    });
    out = out
      .replace(/(^|\s)(\u00e7e\u015fitli|cesitli)\s+leri\s+(bulunabilmektedir|bulunabilmekte|bulunabilir)\b/gi, '$1$2 ili\u015fkileri $3');
    return out
      .replace(/,([A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛûÄäËëÏïÖöÜüÀ-ÖØ-öø-ÿ])/g, ', $1')
      .replace(/;([A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛûÄäËëÏïÖöÜüÀ-ÖØ-öø-ÿ])/g, '; $1')
      .replace(/\.([A-ZÇĞİÖŞÜ])/g, '. $1');
  }

  function cloneRun(r, repairText){
    return Object.assign({}, r, {
      text: repairText ? repairJoinedWordImportText(r && r.text) : String((r && r.text) || ''),
      // Deep-copy the only nested known objects
      citation: r.citation ? Object.assign({}, r.citation) : null,
      footnote: r.footnote ? Object.assign({}, r.footnote) : null,
      crossRef: r.crossRef ? Object.assign({}, r.crossRef) : null,
      font:     r.font     ? Object.assign({}, r.font)     : null
    });
  }
  function cloneBlock(b, repairText){
    // Normalize text-only blocks into runs[] form. The doc model treats
    // runs[] as the source of truth; engine's text-fallback was masking
    // length=0 blocks which sent every locate() to the document's tail.
    var sourceRuns = (b && b.runs && b.runs.length)
      ? b.runs
      : (b && typeof b.text === 'string' ? [{ text: b.text }] : []);
    var out = Object.assign({}, b, {
      runs: sourceRuns.map(function(run){ return cloneRun(run, repairText); }),
      font: b.font ? Object.assign({}, b.font) : null
    });
    // Deep-clone table rows/cells so a committed/undone snapshot never shares
    // cell arrays with the live doc (otherwise a later cell edit would mutate
    // history in place).
    if(Array.isArray(b.rows)){
      out.rows = b.rows.map(function(row){
        return Object.assign({}, row, {
          cells: (row && row.cells ? row.cells : []).map(function(cell){
            return Object.assign({}, cell, {
              runs: (cell && cell.runs ? cell.runs : []).map(function(r){ return cloneRun(r, repairText); })
            });
          })
        });
      });
    }
    // Drop the legacy `text` property to prevent drift between text + runs.
    if('text' in out) delete out.text;
    return out;
  }
  function cloneDoc(d){
    return { blocks: (d.blocks || []).map(cloneBlock) };
  }
  function cloneDocForImport(d){
    return { blocks: (d.blocks || []).map(function(block){ return cloneBlock(block, true); }) };
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

  function getPlainTextFromDoc(doc){
    var out = '';
    for(var i = 0; i < doc.blocks.length; i++){
      var runs = (doc.blocks[i] && doc.blocks[i].runs) || [];
      for(var j = 0; j < runs.length; j++) out += String(runs[j].text || '');
      if(i < doc.blocks.length - 1) out += '\n';
    }
    return out;
  }

  function normalizeCitationLikeText(text){
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function looksLikeCitationText(text){
    var t = normalizeCitationLikeText(text);
    return /^\([^)]+,\s*(?:\d{4}|t\.y\.)\)$/.test(t) || /^\([^)]+,\s*(?:\d{4}|t\.y\.)\)\s*$/.test(String(text || ''));
  }

  function isDuplicateCitationInsert(doc, off, text){
    if(!looksLikeCitationText(text)) return false;
    var normalizedInsert = normalizeCitationLikeText(text);
    if(!normalizedInsert) return false;
    var loc = locate(doc, off);
    var block = doc.blocks[loc.blockIdx];
    if(block){
      var runLoc = locateRun(block, loc.intra);
      var runs = block.runs || [];
      var currentRun = runs[runLoc.runIdx];
      if(currentRun && currentRun.citation && normalizeCitationLikeText(currentRun.text) === normalizedInsert){
        return true;
      }
    }
    var plain = getPlainTextFromDoc(doc);
    var before = normalizeCitationLikeText(plain.slice(Math.max(0, off - normalizedInsert.length - 8), off));
    return before.endsWith(normalizedInsert);
  }

  function collapseDuplicateCitationTextInRun(run){
    var text = String((run && run.text) || '');
    if(!text || text.indexOf(')') < 0) return run;
    var nextText = text.replace(/(\([^)]+,\s*(?:\d{4}|t\.y\.)\))(?:\s*\1)+/g, '$1');
    if(nextText === text) return run;
    var out = cloneRun(run);
    out.text = nextText;
    return out;
  }

  function runCitationKey(run){
    var key = normalizeCitationLikeText(run && run.text);
    return looksLikeCitationText(key) ? key : '';
  }

  function appendRun(out, run){
    if(!run) return;
    if(!String(run.text || '').length) return;
    out.push(run);
  }

  function collapseDuplicateCitationRuns(runs){
    var out = [];
    var lastCitationKey = '';
    var pendingSpace = null;
    for(var i = 0; i < runs.length; i++){
      var cur = runs[i];
      if(!cur) continue;
      var text = String(cur.text || '');
      var key = runCitationKey(cur);
      var isSpace = !!text && /^\s+$/.test(text);
      if(isSpace && lastCitationKey){
        pendingSpace = cur;
        continue;
      }
      if(key && lastCitationKey && key === lastCitationKey){
        pendingSpace = null;
        continue;
      }
      if(pendingSpace){
        appendRun(out, pendingSpace);
        pendingSpace = null;
      }
      appendRun(out, cur);
      if(key) lastCitationKey = key;
      else if(!isSpace) lastCitationKey = '';
    }
    if(pendingSpace) appendRun(out, pendingSpace);
    return out;
  }

  function collapseDuplicateCitationText(doc){
    var d = cloneDoc(doc);
    for(var bi = 0; bi < d.blocks.length; bi++){
      var runs = d.blocks[bi].runs || [];
      for(var ri = 0; ri < runs.length; ri++){
        runs[ri] = collapseDuplicateCitationTextInRun(runs[ri]);
      }
      var out = collapseDuplicateCitationRuns(runs);
      d.blocks[bi].runs = mergeAdjacent(out.length ? out : [{ text:'' }]);
    }
    return d;
  }

  // Insert plain text at offset. The new text inherits the format of the run
  // immediately preceding the insertion point (Word-like behaviour).
  function insertText(doc, off, text){
    if(!text) return doc;
    try{
      if(typeof console !== 'undefined' && (String(text).length > 1 || looksLikeCitationText(text))){
        (typeof window!=='undefined'&&window.__aqCiteDiag)&&console.warn('[AQ-CITE-DIAG] ' + JSON.stringify({
          t: Date.now(),
          event: 'document.insertText',
          off: off,
          text: String(text),
          citationLike: looksLikeCitationText(text)
        }));
      }
    }catch(_diagErr){}
    if(isDuplicateCitationInsert(doc, off, text)) return doc;
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
    if(runLoc.intra === t.length && run && run.citation){
      var next = runs[runLoc.runIdx + 1];
      if(next && !next.citation){
        next.text = text + String(next.text || '');
      }else{
        var plain = cloneRun(run);
        plain.text = text;
        delete plain.citation;
        runs.splice(runLoc.runIdx + 1, 0, plain);
      }
      block.runs = mergeAdjacent(runs);
      return d;
    }
    run.text = t.slice(0, runLoc.intra) + text + t.slice(runLoc.intra);
    return d;
  }

  function insertTextInPlace(doc, off, text){
    if(!text) return doc;
    if(isDuplicateCitationInsert(doc, off, text)) return doc;
    var loc = locate(doc, off);
    var block = doc.blocks[loc.blockIdx];
    if(!block) return doc;
    var runs = block.runs || (block.runs = []);
    if(!runs.length){
      runs.push({ text: text });
      return doc;
    }
    var runLoc = locateRun(block, loc.intra);
    var run = runs[runLoc.runIdx];
    if(!run){
      runs.push({ text: text });
      return doc;
    }
    var t = String(run.text || '');
    if(runLoc.intra === t.length && run.citation){
      var next = runs[runLoc.runIdx + 1];
      if(next && !next.citation){
        next.text = text + String(next.text || '');
      }else{
        var plain = cloneRun(run);
        plain.text = text;
        delete plain.citation;
        runs.splice(runLoc.runIdx + 1, 0, plain);
      }
      block.runs = mergeAdjacent(runs);
      return doc;
    }
    run.text = t.slice(0, runLoc.intra) + text + t.slice(runLoc.intra);
    return doc;
  }

  // Block types that carry inline runs (paragraph, heading) can be merged
  // with neighbors. Other types (image, table, hr) must stay as standalone
  // blocks — merging their (empty) runs into a paragraph would silently
  // drop the image/table.
  function isInlineFlowBlock(b){
    if(!b) return false;
    if(!b.type || b.type === 'paragraph' || b.type === 'heading') return true;
    return false;
  }

  // Insert a list of blocks at offset. If offset is inside a block, that block
  // is split and the new blocks are sandwiched in between. Inline-flow blocks
  // (paragraph/heading) merge their runs with the split block's halves; other
  // blocks (image, table, hr) are inserted as standalone blocks.
  function insertBlocks(doc, off, newBlocks){
    if(!newBlocks || !newBlocks.length) return doc;
    var d = cloneDoc(doc);
    var loc = locate(d, off);
    var orig = d.blocks[loc.blockIdx];

    var leftRuns  = sliceRunsLeft(orig.runs || [], loc.intra);
    var rightRuns = sliceRunsRight(orig.runs || [], loc.intra);

    var clones = newBlocks.map(cloneBlock);
    var insertAt = loc.blockIdx + 1;

    // Step 1: merge first new block into orig if it can flow inline.
    var first = clones[0];
    if(isInlineFlowBlock(first)){
      orig.runs = leftRuns.concat(first.runs || []);
      clones.shift();
    } else {
      // Standalone block — keep orig with leftRuns only.
      orig.runs = leftRuns;
    }
    if(!orig.runs.length) orig.runs = [{ text: '' }];

    // Step 2: merge tail (rightRuns) into the right side.
    if(clones.length === 0){
      // First was merged; append rightRuns into orig directly.
      orig.runs = orig.runs.concat(rightRuns);
      if(!orig.runs.length) orig.runs = [{ text: '' }];
    } else {
      var last = clones[clones.length - 1];
      if(isInlineFlowBlock(last)){
        last.runs = (last.runs || []).concat(rightRuns);
        if(!last.runs.length) last.runs = [{ text: '' }];
      } else if(rightRuns.length){
        // Standalone last block — push rightRuns as a fresh paragraph.
        clones.push({ runs: rightRuns });
      }
    }

    // Step 3: splice the remaining clones after orig.
    for(var i = 0; i < clones.length; i++){
      d.blocks.splice(insertAt + i, 0, clones[i]);
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
      delete newBlock.runInHeading;
      delete newBlock.firstLineIndentPx;
      delete newBlock.align;
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
    var keys = ['bold','italic','underline','strike','color','highlight','baselineShift','fontScale','href','trackInsert','trackDelete'];
    for(var i = 0; i < keys.length; i++) if(!!a[keys[i]] !== !!b[keys[i]] && a[keys[i]] !== b[keys[i]]) return false;
    return JSON.stringify(a.font || null) === JSON.stringify(b.font || null) &&
           JSON.stringify(a.citation || null) === JSON.stringify(b.citation || null) &&
           JSON.stringify(a.footnote || null) === JSON.stringify(b.footnote || null) &&
           JSON.stringify(a.crossRef || null) === JSON.stringify(b.crossRef || null);
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
  function normalizeHeadingLevel(level){
    var n = parseInt(level, 10) || 1;
    return Math.max(1, Math.min(5, n));
  }

  function applyAPA7HeadingStyle(block, level){
    level = normalizeHeadingLevel(level);
    block.type = 'heading';
    block.level = level;
    // APA 7: all heading levels are Title Case (not ALL CAPS). The author types
    // the casing they want; the engine no longer force-uppercases Level 1.
    // (If a user wants UPPERCASE section titles, they apply it themselves.)
    block.font = { sizePt: 12, weight: '700', style: (level === 3 || level === 5) ? 'italic' : 'normal' };
    block.align = level === 1 ? 'center' : 'left';
    block.firstLineIndentPx = (level === 4 || level === 5) ? 48 : 0; // APA 0.5" = 48px
    block.spaceAfterPx = 0;
    block.runInHeading = level === 4 || level === 5;
    return block;
  }

  // Canonical APA 7 bibliography (reference list) entry styling: 0.5" hanging
  // indent (left 48px, first line -48px), double spacing, 12pt regular. Shared
  // by compat-shim.js + tiptap-adapter.js (which delegate here).
  function applyAPA7BibliographyEntryStyle(block){
    block.type = block.type || 'paragraph';
    block._isBibEntry = true;
    block.leftIndentPx = 48;
    block.firstLineIndentPx = -48;
    block.spaceAfterPx = 0;
    block.lineHeightFactor = 2.0;
    block.font = { sizePt: 12, weight: '400', style: 'normal' };
    return block;
  }

  // Canonical APA 7 block quotation styling (quotes of 40+ words): the whole
  // block is indented 0.5" from the left margin, double-spaced, with NO
  // first-line indent and no quotation marks. Toggle off restores a plain body
  // paragraph (the APA first-line indent default then applies again).
  function applyAPA7BlockquoteStyle(block){
    if(!block) return block;
    block.type = 'paragraph';
    block.blockquote = true;
    block.leftIndentPx = 48;       // 0.5" block indent
    block.firstLineIndentPx = 0;   // explicit 0 → no body first-line indent
    block.lineHeightFactor = 2.0;  // double spacing
    return block;
  }
  function clearAPA7BlockquoteStyle(block){
    if(!block) return block;
    delete block.blockquote;
    delete block.leftIndentPx;
    delete block.firstLineIndentPx; // undefined → APA body first-line indent resumes
    delete block.lineHeightFactor;  // undefined → falls back to the doc default (2.0)
    return block;
  }

  // Build an empty `rows × cols` table block (cells carry a single empty run).
  // Shape matches what the engine reflow renders: { type:'table', rows:[{cells:[{runs}]}] }.
  function makeEmptyTable(rows, cols){
    var r = Math.max(1, parseInt(rows, 10) || 3);
    var c = Math.max(1, parseInt(cols, 10) || 3);
    var tableRows = [];
    for(var i = 0; i < r; i++){
      var cells = [];
      for(var j = 0; j < c; j++) cells.push({ runs: [{ text: '' }] });
      tableRows.push({ cells: cells });
    }
    return { type: 'table', rows: tableRows };
  }

  // ── Track changes: accept / reject ─────────────────────────────────────────
  // Runs carry boolean flags `trackInsert` (typed while tracking) and
  // `trackDelete` (deleted while tracking — kept + struck through, not removed).
  // accept → keep insertions (clear flag), drop deletions.
  // reject → drop insertions, keep deletions (clear flag).
  function resolveTrackRuns(runs, mode){
    var out = [];
    (runs || []).forEach(function(run){
      if(!run) return;
      if(run.trackInsert){
        if(mode === 'reject') return;          // undo the insertion
        var ri = Object.assign({}, run); delete ri.trackInsert; out.push(ri);
        return;
      }
      if(run.trackDelete){
        if(mode === 'accept') return;          // apply the deletion
        var rd = Object.assign({}, run); delete rd.trackDelete; out.push(rd);
        return;
      }
      out.push(run);
    });
    if(!out.length) out.push({ text: '' });    // never leave a block with no runs
    return out;
  }
  function resolveTrackChangesInBlocks(blocks, mode){
    (blocks || []).forEach(function(block){
      if(!block) return;
      if(Array.isArray(block.runs)) block.runs = resolveTrackRuns(block.runs, mode);
      if(Array.isArray(block.rows)){
        block.rows.forEach(function(row){
          (row && row.cells ? row.cells : []).forEach(function(cell){
            if(cell) cell.runs = resolveTrackRuns(cell.runs, mode);
          });
        });
      }
    });
    return blocks;
  }
  // Resolve the SINGLE tracked change at flat offset `off` — the contiguous
  // span of runs (within one block) sharing the same trackInsert/trackDelete
  // flag as the run under the offset. Mutates `blocks`; returns true if a change
  // was resolved, false if the offset isn't on a tracked change.
  function resolveTrackChangeAtOffset(blocks, off, mode){
    var loc = locate({ blocks: blocks }, off);
    var block = blocks[loc.blockIdx];
    if(!block || !Array.isArray(block.runs) || !block.runs.length) return false;
    var rl = locateRun(block, loc.intra);
    var runs = block.runs;
    var run = runs[rl.runIdx];
    if(!run || !(run.trackInsert || run.trackDelete)) return false;
    var flag = run.trackInsert ? 'trackInsert' : 'trackDelete';
    var start = rl.runIdx, end = rl.runIdx;
    while(start > 0 && runs[start - 1] && runs[start - 1][flag]) start--;
    while(end < runs.length - 1 && runs[end + 1] && runs[end + 1][flag]) end++;
    var resolved = resolveTrackRuns(runs.slice(start, end + 1), mode);
    block.runs = runs.slice(0, start).concat(resolved).concat(runs.slice(end + 1));
    if(!block.runs.length) block.runs = [{ text: '' }];
    return true;
  }
  function blocksHaveTrackChanges(blocks){
    return (blocks || []).some(function(block){
      if(!block) return false;
      var inRuns = function(runs){ return (runs || []).some(function(r){ return r && (r.trackInsert || r.trackDelete); }); };
      if(Array.isArray(block.runs) && inRuns(block.runs)) return true;
      if(Array.isArray(block.rows)){
        return block.rows.some(function(row){
          return (row && row.cells ? row.cells : []).some(function(cell){ return cell && inRuns(cell.runs); });
        });
      }
      return false;
    });
  }

  function setBlockType(doc, blockIdx, type, attrs){
    if(blockIdx < 0 || blockIdx >= doc.blocks.length) return doc;
    var d = cloneDoc(doc);
    var b = d.blocks[blockIdx];
    if(type === 'heading'){
      applyAPA7HeadingStyle(b, attrs && attrs.level);
    }else{
      b.type = 'paragraph';
      delete b.level;
      delete b.runInHeading;
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
      var prevStyle = b.list && b.list.style;
      b.list = { type: listType, level: Math.max(0, parseInt(level || 0, 10)) };
      if(prevStyle) b.list.style = prevStyle;
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
  function setListStyleForRange(doc, from, to, style){
    var range = blocksInRange(doc, from, to);
    var d = cloneDoc(doc);
    for(var i = range.from; i <= range.to; i++){
      var b = d.blocks[i];
      if(b && b.list){
        if(style){ b.list.style = style; }
        else { delete b.list.style; }
      }
    }
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

  function setLeftIndentForRange(doc, from, to, deltaPx){
    var range = blocksInRange(doc, from, to);
    var d = cloneDoc(doc);
    for(var i = range.from; i <= range.to; i++){
      var b = d.blocks[i];
      if(!b || b.type === 'table' || b.type === 'image' || b.rule) continue;
      var current = Number(b.leftIndentPx || 0);
      var next = Math.max(0, Math.min(216, current + deltaPx));
      if(next > 0) b.leftIndentPx = next;
      else delete b.leftIndentPx;
      if(!b.list && (!b.type || b.type === 'paragraph')){
        b.firstLineIndentPx = next > 0 ? 0 : 48; // APA 0.5" = 48px
      }
    }
    return d;
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
    var doc = collapseDuplicateCitationText({
      blocks: (initialBlocks && initialBlocks.length)
        ? cloneDocForImport({ blocks: initialBlocks }).blocks
        : [{ type:'paragraph', runs:[{ text:'' }] }]
    });
    var history = [cloneDoc(doc)];
    var future  = [];
    var typingTimer = 0;
    var typingDirty = false;

    function commit(next){
      flushTypingHistory();
      var cleaned = collapseDuplicateCitationText(next);
      doc = cleaned;
      history.push(cloneDoc(cleaned));
      if(history.length > 200) history.shift();
      future.length = 0;
    }
    function flushTypingHistory(){
      if(typingTimer) clearTimeout(typingTimer);
      typingTimer = 0;
      if(!typingDirty) return;
      var cleaned = collapseDuplicateCitationText(doc);
      doc = cleaned;
      history.push(cloneDoc(cleaned));
      if(history.length > 200) history.shift();
      future.length = 0;
      typingDirty = false;
    }
    function commitTypingInsert(off, text){
      insertTextInPlace(doc, off, text);
      typingDirty = true;
      future.length = 0;
      if(typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(flushTypingHistory, 900);
    }
    return {
      get: function(){ return doc; },
      length: function(){ return flatLength(doc); },
      replace: function(blocks){
        var nextBlocks = (Array.isArray(blocks) && blocks.length) ? blocks : [{ type:'paragraph', runs:[{ text:'' }] }];
        commit({ blocks: cloneDocForImport({ blocks: nextBlocks }).blocks });
      },
      insertText: function(off, text){
        if(typeof text === 'string' && text.length === 1 && !looksLikeCitationText(text)){
          commitTypingInsert(off, text);
        } else {
          commit(insertText(doc, off, text));
        }
      },
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
      setListStyleForRange: function(from, to, style){ commit(setListStyleForRange(doc, from, to, style)); },
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
      // True when every block in [from,to] is already an APA block quote.
      isBlockquoteForRange: function(from, to){
        var range = blocksInRange(doc, from, to);
        for(var i = range.from; i <= range.to; i++){
          if(!(doc.blocks[i] && doc.blocks[i].blockquote)) return false;
        }
        return range.to >= range.from;
      },
      setBlockquoteForRange: function(from, to, on){
        var range = blocksInRange(doc, from, to);
        var d = cloneDoc(doc);
        for(var i = range.from; i <= range.to; i++){
          if(on) applyAPA7BlockquoteStyle(d.blocks[i]);
          else clearAPA7BlockquoteStyle(d.blocks[i]);
        }
        commit(d);
      },
      // Insert an empty rows×cols table block at offset `off`.
      insertTable: function(off, rows, cols){
        commit(insertBlocks(doc, off, [makeEmptyTable(rows, cols)]));
      },
      hasTrackChanges: function(){ return blocksHaveTrackChanges(doc.blocks); },
      acceptAllTrackChanges: function(){
        if(!blocksHaveTrackChanges(doc.blocks)) return false;
        commit({ blocks: resolveTrackChangesInBlocks(cloneDoc(doc).blocks, 'accept') });
        return true;
      },
      rejectAllTrackChanges: function(){
        if(!blocksHaveTrackChanges(doc.blocks)) return false;
        commit({ blocks: resolveTrackChangesInBlocks(cloneDoc(doc).blocks, 'reject') });
        return true;
      },
      acceptTrackChangeAt: function(off){
        var d = cloneDoc(doc);
        if(!resolveTrackChangeAtOffset(d.blocks, off, 'accept')) return false;
        commit(d); return true;
      },
      rejectTrackChangeAt: function(off){
        var d = cloneDoc(doc);
        if(!resolveTrackChangeAtOffset(d.blocks, off, 'reject')) return false;
        commit(d); return true;
      },
      // Remove the table block containing offset `off`. Returns true if a table
      // was removed (no-op + false when the block at `off` is not a table).
      removeTableAt: function(off){
        var idx = blockIndexAt(doc, off);
        if(idx < 0 || idx >= doc.blocks.length || doc.blocks[idx].type !== 'table') return false;
        var d = cloneDoc(doc);
        d.blocks.splice(idx, 1);
        if(!d.blocks.length) d.blocks.push({ type: 'paragraph', runs: [{ text: '' }] });
        commit(d);
        return true;
      },
      changeListLevel:     function(blockIdx, delta){ commit(changeListLevel(doc, blockIdx, delta)); },
      setLeftIndentForRange: function(from, to, deltaPx){ commit(setLeftIndentForRange(doc, from, to, deltaPx)); },
      blockTextLength:     function(blockIdx){ return blockTextLength(doc.blocks[blockIdx] || { runs: [] }); },
      locate: function(off){ return locate(doc, off); },
      undo: function(){
        flushTypingHistory();
        if(history.length <= 1) return false;
        future.push(history.pop());
        doc = cloneDoc(history[history.length - 1]);
        return true;
      },
      redo: function(){
        flushTypingHistory();
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

  return {
    create: createDocument,
    // Canonical APA 7 heading styling — single source of truth shared by the
    // compat-shim and tiptap-adapter (which delegate here). Loaded first.
    applyAPA7HeadingStyle: applyAPA7HeadingStyle,
    applyAPA7BibliographyEntryStyle: applyAPA7BibliographyEntryStyle,
    applyAPA7BlockquoteStyle: applyAPA7BlockquoteStyle,
    clearAPA7BlockquoteStyle: clearAPA7BlockquoteStyle,
    makeEmptyTable: makeEmptyTable,
    resolveTrackChangesInBlocks: resolveTrackChangesInBlocks,
    resolveTrackChangeAtOffset: resolveTrackChangeAtOffset,
    blocksHaveTrackChanges: blocksHaveTrackChanges,
    normalizeHeadingLevel: normalizeHeadingLevel,
    _ops: { insertText: insertText, deleteRange: deleteRange, splitBlock: splitBlock, mergeWithPrevious: mergeWithPrevious, locate: locate, flatLength: flatLength }
  };
});
