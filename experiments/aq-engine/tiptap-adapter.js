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

  function normalizeHeadingLevel(level){
    var n = parseInt(level, 10) || 1;
    return Math.max(1, Math.min(5, n));
  }

  function uppercaseAPAHeadingRuns(runs){
    if(!Array.isArray(runs)) return;
    runs.forEach(function(run){
      if(!run || typeof run.text !== 'string') return;
      try{ run.text = run.text.toLocaleUpperCase('tr-TR'); }
      catch(_e){ run.text = run.text.toUpperCase(); }
    });
  }

  function applyAPA7HeadingStyle(block, level){
    level = normalizeHeadingLevel(level);
    // Canonical APA 7 heading styling lives in document.js
    // (window.AQEngineDocument, loaded first by index.html). Single source of
    // truth — delegate so the rules exist in exactly one place.
    if(typeof window !== 'undefined' && window.AQEngineDocument && typeof window.AQEngineDocument.applyAPA7HeadingStyle === 'function'){
      return window.AQEngineDocument.applyAPA7HeadingStyle(block, level);
    }
    return block;
  }

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

  function addClass(attrs, className){
    if(!attrs || !className) return attrs;
    var current = String(attrs.class || '').trim();
    var parts = current ? current.split(/\s+/) : [];
    String(className).split(/\s+/).forEach(function(part){
      if(part && parts.indexOf(part) < 0) parts.push(part);
    });
    attrs.class = parts.join(' ');
    return attrs;
  }

  function normalizeSemanticTitle(text){
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

  function runsText(runs){
    return (runs || []).map(function(run){ return String(run && run.text || ''); }).join('');
  }

  function repairWordImportTextBoundaries(text){
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

  function parseImageWidth(value){
    if(value === null || value === undefined || value === '') return null;
    var raw = String(value).trim();
    if(/%$/.test(raw)) return raw;
    var n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function findCitationRef(id){
    var refId = String(id || '').trim();
    if(!refId) return null;
    try{
      if(root.AQReferenceManager && typeof root.AQReferenceManager.findReference === 'function'){
        var managed = root.AQReferenceManager.findReference(refId, root.S && root.S.cur);
        if(managed) return managed;
      }
    }catch(_e){}
    try{
      if(typeof root.findRef === 'function') return root.findRef(refId, root.S && root.S.cur);
    }catch(_e2){}
    return null;
  }

  function canonicalCitationText(attrs, fallbackText){
    var refIds = String((attrs && (attrs['data-ref'] || attrs.ref)) || '').split(',').map(function(id){
      return String(id || '').trim();
    }).filter(Boolean);
    if(!refIds.length || !root.AQCitationStyles) return fallbackText;
    var refs = refIds.map(findCitationRef).filter(Boolean);
    if(!refs.length) return fallbackText;
    var styleId = 'apa7';
    try{
      if(typeof root.getCurrentCitationStyle === 'function') styleId = root.getCurrentCitationStyle() || 'apa7';
    }catch(_styleErr){}
    try{
      if(attrs && attrs['data-mode'] === 'textual' && typeof root.AQCitationStyles.formatInlineCitation === 'function'){
        return root.AQCitationStyles.formatInlineCitation(refs[0], { style: styleId, mode: 'textual' }) || fallbackText;
      }
      if(typeof root.AQCitationStyles.visibleCitationText === 'function'){
        return root.AQCitationStyles.visibleCitationText(refs, { style: styleId }) || fallbackText;
      }
      if(typeof root.AQCitationStyles.formatInlineCitation === 'function'){
        return root.AQCitationStyles.formatInlineCitation(refs[0], { style: styleId }) || fallbackText;
      }
    }catch(_formatErr){}
    return fallbackText;
  }

  function flattenInlineToRuns(nodes){
    var runs = [];
    if(!nodes || !nodes.length) return runs;
    for(var i = 0; i < nodes.length; i++){
      var n = nodes[i];
      if(!n) continue;
      if(n.type === 'text'){
        var marks = n.marks || [];
        var run = { text: repairWordImportTextBoundaries(n.text || '') };
        var fontOverride = null;
        for(var m = 0; m < marks.length; m++){
          var mk = marks[m];
          var t = mk.type || mk.name;
          var attrs = mk.attrs || {};
          if(t === 'bold' || t === 'strong') run.bold = true;
          else if(t === 'italic' || t === 'em') run.italic = true;
          else if(t === 'underline') run.underline = true;
          else if(t === 'strike') run.strike = true;
          else if(t === 'trackInsert') run.trackInsert = true;
          else if(t === 'trackDelete') run.trackDelete = true;
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
            run.text = canonicalCitationText(attrs, run.text);
          }
          else if(t === 'crossRef'){
            run.crossRef = {
              refType: attrs.refType || attrs['data-ref-type'] || 'heading',
              refId: attrs.refId || attrs['data-ref-id'] || '',
              refLabel: attrs.refLabel || attrs['data-ref-label'] || '',
              display: attrs.display || attrs['data-ref-display'] || 'context'
            };
            run.href = '#' + run.crossRef.refId;
            if(!run.color) run.color = '#1a0dab';
          }
          else if(t === 'link'){
            run.href = attrs.href || '';
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
        // ⚠ KNOWN GAP — Shift+Enter / <br> hard line break
        //
        // Importing TipTap hardBreak as '\n' corrupts later typing: the
        // engine's tokenizer (engine.js line-breaker) splits on '\n' so a
        // space typed near it appears to wrap to the next line. As a
        // safe-but-lossy workaround we skip the hardBreak entirely, which
        // makes trailing <p><br></p> boilerplate (eg. table insert) round-
        // trip as a clean empty paragraph but discards intentional in-
        // paragraph line breaks.
        //
        // Proper fix requires: (1) a Run.forcedBreak flag on the document
        // model, (2) line-breaker support that always emits a line break
        // at a forcedBreak boundary, (3) editor cursor + selection logic
        // that treats forcedBreak as a single grapheme. See engine.js
        // SYSTEM LAYOUT header for the file map. Tracked.
      }else if(n.type === 'footnoteRef'){
        // AcademiQ inline atom — display as superscript number.
        var attrs = n.attrs || {};
        var fnId = attrs.fnId || attrs['data-fn-id'] || '?';
        runs.push({
          text: '1',
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
    var starts = /^(birlikte|gelmi\u015ftir|gelmistir|g\u00f6r\u00fclmektedir|gorulmektedir|gostermektedir|yaln\u0131zca|yalnizca|\u00f6\u011frenme|ogrenme|ileti\u015fim|iletisim|bilgi|\u00fcretimi|uretimi|gibi|\u00e7e\u015fitli|cesitli|alanlarda|aktif|\u015fekilde|sekilde|kullan\u0131lmaya|kullanilmaya|ba\u015flad\u0131\u011f\u0131|basladigi|hayat\u0131m\u0131z\u0131n|hayatimizin|alan\u0131na|alanina|giren|bireyler|\u00fczerinde|uzerinde|bili\u015fsel|bilissel|izler|b\u0131rakan|birakan|kavram|olarak|ortaya|konmaktad\u0131r|konmaktadir|durum|insan|bili\u015finin|bilisinin|sadece|i\u00e7sel|icsel|unsurlarla|de\u011fil|degil|teknoloji|d\u0131\u015fsal|dissal|etkile\u015fim|etkilesim|i\u00e7erisine|icerisine|girdi\u011fini|girdigini|sayesinde|yo\u011fun|yogun|ak\u0131\u015f\u0131|akisi|y\u00fck\u00fcn\u00fc|yukunu|art\u0131rabilmekte|artirabilmekte|d\u00fczenleme|duzenleme|yeniden|organize|etme|becerilerinin|\u00f6nemini|onemini|ili\u015fkileri|iliskileri|ili\u015fkiler|iliskiler|bulunabilmektedir|bulunabilmekte|bulunabilir|dijitalle\u015fmenin|dijitallesmenin|yayg\u0131nla\u015fmas\u0131yla|yayginlasmasiyla|teknolojilerin|platformlar|arac\u0131l\u0131\u011f\u0131yla|araciligiyla|kullan\u0131lan|kullanilan|olmaktan|\u00e7\u0131k\u0131p|cikip|ba\u011flamda|baglamda|bireylerin|becerileri|art\u0131rmaktad\u0131r|artirmaktadir|d\u00fczenlenmesi|duzenlenmesi)\b/i;
    var letter = /[0-9A-Za-z\u00c0-\u024f\u1e00-\u1eff\u00c7\u011e\u0130\u00d6\u015e\u00dc\u00e7\u011f\u0131\u00f6\u015f\u00fc]/;
    for(var r = 0; r < runs.length - 1; r++){
      var left = runs[r];
      var right = runs[r + 1];
      if(!left || !right || typeof left.text !== 'string' || typeof right.text !== 'string') continue;
      if(/\s$/.test(left.text) || /^\s/.test(right.text)) continue;
      if(!letter.test(left.text.slice(-1)) || !letter.test(right.text.charAt(0))) continue;
      if(starts.test(String(right.text || '').toLocaleLowerCase('tr-TR'))) right.text = ' ' + right.text;
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
      var block = {
        runs: runs,
        spaceAfterPx: 0,
        align: attrs.textAlign || 'left'
      };
      if(attrs.refId){
        block.attrs = Object.assign({}, block.attrs || {}, { refId: attrs.refId });
        block._refId = attrs.refId;
        applyAPA7BibliographyEntryStyle(block);
      }
      if(attrs.class && String(attrs.class).indexOf('refe') >= 0){
        applyAPA7BibliographyEntryStyle(block);
      }
      return block;
    }

    if(type === 'heading'){
      var level = normalizeHeadingLevel(attrs.level);
      var runs = flattenInlineToRuns(node.content || []);
      if(!runs.length) runs = [{ text: '' }];
      var text = normalizeSemanticTitle(runsText(runs));
      var className = String(attrs.class || '');
      var block = {
        type: 'heading',
        level: level,
        runs: runs,
        align: attrs.textAlign || null
      };
      applyAPA7HeadingStyle(block, level);
      if(attrs.textAlign) block.align = attrs.textAlign;
      if(className.indexOf('bib-title') >= 0 || text === 'kaynakca' || text === 'references' || text === 'bibliography'){
        block._isBibHeading = true;
        block.pageBreak = true;
        block.align = 'center';
        block.runs = [{ text: 'KAYNAK\u00c7A', bold: true }];
      }
      if(className.indexOf('appendix-title') >= 0 || /^ek(?:ler)?(?:[-\s]+[a-z0-9]+)?$/.test(text) || /^appendix(?:[-\s]+[a-z0-9]+)?$/.test(text)){
        block._isAppendixHeading = true;
        block._appendixId = attrs.appendixId || '';
        block.pageBreak = true;
        block.align = 'center';
      }
      return block;
    }

    if(type === 'image'){
      return {
        type: 'image',
        src: attrs.src || '',
        alt: attrs.alt || '',
        width: parseImageWidth(attrs.width || attrs['data-width']),
        align: attrs.align || attrs['data-align'] || 'center',
        attrs: attrs.refId ? { refId: attrs.refId } : {}
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
      return { type: 'table', rows: rows, headerRow: true, attrs: attrs.refId ? { refId: attrs.refId } : {} };
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
      if(run.trackInsert) marks.push({ type: 'trackInsert' });
      if(run.trackDelete) marks.push({ type: 'trackDelete' });
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
      if(run.crossRef){
        marks.push({ type: 'crossRef', attrs: {
          refType: run.crossRef.refType || 'heading',
          refId: run.crossRef.refId || '',
          refLabel: run.crossRef.refLabel || '',
          display: run.crossRef.display || 'context'
        } });
      } else if(run.href) marks.push({ type: 'link', attrs: { href: run.href } });

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
      var imageAttrs = { src: block.src || '', alt: block.alt || '', width: block.width || null };
      if(block.align) imageAttrs.align = block.align;
      if(block._refId || (block.attrs && block.attrs.refId)) imageAttrs.refId = block._refId || block.attrs.refId;
      return {
        type: 'image',
        attrs: imageAttrs
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
      var tableNode = { type: 'table', content: tableContent };
      if(block._refId || (block.attrs && block.attrs.refId)) tableNode.attrs = { refId: block._refId || block.attrs.refId };
      return tableNode;
    }

    var content = runsToTipTapContent(block.runs || []);
    if(!content.length) content = []; // empty paragraph is valid in TipTap

    var attrs = {};
    if(block.align && block.align !== 'left') attrs.textAlign = block.align;
    if(block._refId || (block.attrs && block.attrs.refId)) attrs.refId = block._refId || block.attrs.refId;
    if(block._isBibEntry) addClass(attrs, 'refe aq-ref-entry');
    if(block._isBibHeading) addClass(attrs, 'bib-title aq-export-page-break-before');
    if(block._isAppendixHeading){
      addClass(attrs, 'appendix-title aq-export-page-break-before');
      if(block._appendixId) attrs.appendixId = block._appendixId;
    }

    // Heading
    if(block.type === 'heading'){
      attrs.level = normalizeHeadingLevel(block.level);
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
