(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AQPlainCitationLinking = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  var YEAR_RE = '(?:19|20)\\d{2}[a-z]?|t\\.y\\.';

  function normalizeText(value){
    return String(value == null ? '' : value)
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function fold(value){
    return normalizeText(value)
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeYear(value){
    var text = String(value == null ? '' : value).trim().toLocaleLowerCase('tr-TR');
    var m = text.match(/((?:19|20)\d{2})([a-z])?/i);
    if(m) return { year: m[1], suffix: m[2] || '' };
    if(/t\.?\s*y\.?/i.test(text)) return { year: 't.y.', suffix: '' };
    return { year: '', suffix: '' };
  }

  function splitAuthors(value){
    if(Array.isArray(value)) return value.map(normalizeText).filter(Boolean);
    var text = normalizeText(value);
    if(!text) return [];
    return text.split(/\s*(?:;|\band\b|\bve\b|&)\s*/i).map(normalizeText).filter(Boolean);
  }

  function firstSurnameFromAuthor(author){
    var text = normalizeText(author);
    if(!text) return '';
    if(text.indexOf(',') >= 0) return normalizeText(text.split(',')[0]);
    var parts = text.split(/\s+/).filter(Boolean);
    if(!parts.length) return '';
    var particles = { de:1, del:1, van:1, von:1, der:1, den:1 };
    if(parts.length >= 2 && particles[parts[parts.length - 2].toLowerCase()]){
      return parts.slice(parts.length - 2).join(' ');
    }
    return parts[parts.length - 1];
  }

  function firstSurnameFromCitationName(value){
    var text = normalizeText(value)
      .replace(/\bet\s+al\.?/ig, '')
      .replace(/\bvd\.?/ig, '')
      .replace(/\bve\s+diğerleri\b/ig, '')
      .replace(/\band\s+others\b/ig, '')
      .trim();
    text = text.split(/\s*(?:&|\bve\b|\band\b)\s*/i)[0] || text;
    text = text.split(',')[0] || text;
    return firstSurnameFromAuthor(text) || text;
  }

  function referenceKey(ref){
    if(!ref) return null;
    var authors = splitAuthors(ref.authors && ref.authors.length ? ref.authors : ref.author);
    if(!authors.length && ref.firstAuthor) authors = [ref.firstAuthor];
    if(!authors.length) return null;
    var yearInfo = normalizeYear(ref.year || ref.publishedDate || ref.date || ref.issued);
    if(!yearInfo.year) return null;
    return {
      surname: fold(firstSurnameFromAuthor(authors[0])),
      year: yearInfo.year,
      suffix: yearInfo.suffix,
      ref: ref
    };
  }

  function buildReferenceIndex(references){
    var index = {};
    (Array.isArray(references) ? references : []).forEach(function(ref){
      var key = referenceKey(ref);
      if(!key || !key.surname || !key.year) return;
      var id = key.surname + '|' + key.year;
      if(!index[id]) index[id] = [];
      index[id].push(ref);
    });
    return index;
  }

  function parseParentheticalEntry(raw){
    var text = normalizeText(raw);
    var yearMatch = text.match(new RegExp('(' + YEAR_RE + ')', 'i'));
    if(!yearMatch) return null;
    var beforeYear = normalizeText(text.slice(0, yearMatch.index));
    beforeYear = beforeYear.replace(/[,;:\s]+$/g, '');
    var surname = firstSurnameFromCitationName(beforeYear);
    var year = normalizeYear(yearMatch[1]);
    if(!surname || !year.year) return null;
    return {
      raw: text,
      surname: surname,
      normalizedSurname: fold(surname),
      year: year.year,
      suffix: year.suffix
    };
  }

  function detectParenthetical(text, out){
    var re = /\(([^()]{3,260})\)/g;
    var match;
    while((match = re.exec(text))){
      var inner = match[1];
      if(!(new RegExp(YEAR_RE, 'i')).test(inner)) continue;
      var entries = inner.split(/\s*;\s*/).map(parseParentheticalEntry).filter(Boolean);
      if(!entries.length) continue;
      out.push({
        mode: 'inline',
        text: match[0],
        from: match.index,
        to: match.index + match[0].length,
        entries: entries
      });
    }
  }

  function detectNarrative(text, out){
    var re = new RegExp(
      "(^|[^\\p{L}\\p{N}])([\\p{Lu}ÇĞİÖŞÜ][\\p{L}'’.-]{1,40}(?:\\s+(?:et\\s+al\\.?|vd\\.?|ve|and|&)\\s*[\\p{Lu}ÇĞİÖŞÜ]?[\\p{L}'’.-]{0,40})?)\\s*\\((" + YEAR_RE + ")\\)",
      'gu'
    );
    var match;
    while((match = re.exec(text))){
      var prefix = match[1] || '';
      var name = match[2] || '';
      var year = normalizeYear(match[3] || '');
      var start = match.index + prefix.length;
      var raw = text.slice(start, re.lastIndex);
      var surname = firstSurnameFromCitationName(name);
      if(!surname || !year.year) continue;
      out.push({
        mode: 'textual',
        text: raw,
        from: start,
        to: re.lastIndex,
        entries: [{
          raw: raw,
          surname: surname,
          normalizedSurname: fold(surname),
          year: year.year,
          suffix: year.suffix
        }]
      });
    }
  }

  function overlaps(a, b){
    return a.from < b.to && b.from < a.to;
  }

  function detectPlainCitations(text){
    var value = String(text || '');
    var found = [];
    detectParenthetical(value, found);
    detectNarrative(value, found);
    found.sort(function(a, b){ return a.from - b.from || b.to - a.to; });
    var deduped = [];
    found.forEach(function(item){
      if(deduped.some(function(prev){ return overlaps(prev, item); })) return;
      deduped.push(item);
    });
    return deduped;
  }

  function matchOccurrence(occurrence, references){
    var index = buildReferenceIndex(references);
    var refIds = [];
    var ambiguous = [];
    var missing = [];
    (occurrence.entries || []).forEach(function(entry){
      var matches = index[(entry.normalizedSurname || fold(entry.surname)) + '|' + entry.year] || [];
      if(entry.suffix){
        var exactSuffix = matches.filter(function(ref){
          return normalizeYear(ref.year || ref.publishedDate || ref.date || ref.issued).suffix === entry.suffix;
        });
        if(exactSuffix.length) matches = exactSuffix;
      }
      if(matches.length === 1 && matches[0].id){
        refIds.push(String(matches[0].id));
      }else if(matches.length > 1){
        ambiguous.push({ entry: entry, matches: matches });
      }else{
        missing.push(entry);
      }
    });
    var uniqueRefIds = Array.from(new Set(refIds));
    var complete = uniqueRefIds.length === (occurrence.entries || []).length && !ambiguous.length && !missing.length;
    return {
      occurrence: occurrence,
      refIds: uniqueRefIds,
      complete: complete,
      ambiguous: ambiguous,
      missing: missing,
      confidence: complete ? 0.95 : (uniqueRefIds.length ? 0.55 : 0)
    };
  }

  function blockText(block){
    return (block && Array.isArray(block.runs) ? block.runs : [])
      .map(function(run){ return String(run && run.text || ''); })
      .join('');
  }

  function getAQBlocks(editor){
    if(!editor || !editor._docModel || typeof editor._docModel.get !== 'function') return [];
    var model = editor._docModel.get() || {};
    return Array.isArray(model.blocks) ? model.blocks : [];
  }

  function isBibliographyHeadingText(text){
    return /^(kaynak[cç]a|kaynaklar|references?|bibliography)\s*:?$/i.test(normalizeText(text));
  }

  function looksLikeReferenceLine(text){
    var value = normalizeText(text);
    if(value.length < 24) return false;
    if(!/((?:19|20)\d{2}|t\.?\s*y\.?)/i.test(value)) return false;
    if(/\b(doi|https?:\/\/|journal|dergi|press|yay[ıi]n|publisher)\b/i.test(value)) return true;
    return /^[\p{Lu}ÇĞİÖŞÜ][\p{L}ÇĞİÖŞÜçğıöşü'’.-]+,\s*(?:[\p{Lu}ÇĞİÖŞÜ]\.|[\p{L}ÇĞİÖŞÜçğıöşü'’.-]+).*?\((?:19|20)\d{2}[a-z]?\)\./u.test(value);
  }

  function looksLikeHeadingCandidate(text){
    var value = normalizeText(text);
    if(!value || value.length < 3 || value.length > 90) return false;
    if(/[\.;,]$/.test(value)) return false;
    if(/((?:19|20)\d{2}|doi|https?:\/\/)/i.test(value)) return false;
    var words = value.split(/\s+/).filter(Boolean);
    if(words.length > 12) return false;
    if(/^\d+(\.\d+)*\.?\s+\p{L}/u.test(value)) return true;
    if(isBibliographyHeadingText(value)) return true;
    if(value === value.toLocaleUpperCase('tr-TR') && words.length >= 1) return true;
    return /^(giriş|introduction|yöntem|method|methods|bulgular|findings|tartışma|discussion|sonuç|conclusion|özet|abstract|ek|appendix)\b/i.test(value);
  }

  function analyzeImportedDocument(editor, references){
    references = references || currentWorkspaceReferences();
    var blocks = getAQBlocks(editor);
    var textBlocks = blocks.map(function(block, index){
      return { index: index, text: blockText(block), block: block };
    }).filter(function(item){ return normalizeText(item.text); });
    var inBibliography = false;
    var bibliographyLines = [];
    var headingCandidates = [];
    textBlocks.forEach(function(item){
      var text = normalizeText(item.text);
      if(isBibliographyHeadingText(text)){
        inBibliography = true;
        headingCandidates.push(item);
        return;
      }
      if(inBibliography || looksLikeReferenceLine(text)){
        if(looksLikeReferenceLine(text)) bibliographyLines.push(item);
      }
      if(!item.block || item.block.type !== 'heading'){
        if(looksLikeHeadingCandidate(text)) headingCandidates.push(item);
      }
    });
    var matches = scanAQEngine(editor, references);
    return {
      plainCitationSummary: summarizeMatches(matches),
      plainCitationMatches: matches,
      bibliographyLines: bibliographyLines,
      bibliographyText: bibliographyLines.map(function(item){ return item.text; }).join('\n'),
      headingCandidates: headingCandidates.slice(0, 24),
      headingCandidateCount: headingCandidates.length,
      blockCount: textBlocks.length
    };
  }

  function scanAQEngine(editor, references){
    if(!editor || !editor._aqEngine || !editor._docModel || typeof editor._docModel.get !== 'function') return [];
    var model = editor._docModel.get() || {};
    var results = [];
    var offset = 0;
    var inBibliography = false;
    (model.blocks || []).forEach(function(block, blockIndex){
      var len = typeof editor._docModel.blockTextLength === 'function'
        ? editor._docModel.blockTextLength(blockIndex)
        : blockText(block).length;
      var textForBlock = blockText(block);
      if(block && (block._isBibHeading || isBibliographyHeadingText(textForBlock))){
        inBibliography = true;
        offset += len + 1;
        return;
      }
      if(block && block._isAppendixHeading) inBibliography = false;
      if(inBibliography || (block && (block._isBibEntry || block._isAppendixHeading))){
        offset += len + 1;
        return;
      }
      var runOffset = offset;
      (block.runs || []).forEach(function(run){
        var text = String(run && run.text || '');
        if(text && !(run && run.citation)){
          detectPlainCitations(text).forEach(function(occ){
            var globalOcc = Object.assign({}, occ, {
              from: runOffset + occ.from,
              to: runOffset + occ.to,
              blockIndex: blockIndex
            });
            results.push(matchOccurrence(globalOcc, references));
          });
        }
        runOffset += text.length;
      });
      offset += len + 1;
    });
    return results;
  }

  function linkMatchedOccurrence(editor, match){
    if(!editor || !editor._aqEngine || !editor._docModel || !match || !match.complete || !match.refIds.length) return false;
    if(typeof editor._docModel.applyMark !== 'function') return false;
    editor._docModel.applyMark(match.occurrence.from, match.occurrence.to, 'citation', {
      ref: match.refIds.join(','),
      mode: match.occurrence.mode === 'textual' ? 'textual' : 'inline',
      linkedFromPlainCitation: true
    });
    return true;
  }

  function linkRange(editor, occurrence, refIds, mode){
    if(!editor || !editor._aqEngine || !editor._docModel || !occurrence || !refIds || !refIds.length) return false;
    if(typeof editor._docModel.applyMark !== 'function') return false;
    editor._docModel.applyMark(occurrence.from, occurrence.to, 'citation', {
      ref: Array.from(new Set(refIds.map(function(id){ return String(id || '').trim(); }).filter(Boolean))).join(','),
      mode: mode || (occurrence.mode === 'textual' ? 'textual' : 'inline'),
      linkedFromPlainCitation: true
    });
    afterMutation(editor);
    return true;
  }

  function afterMutation(editor){
    if(editor && typeof editor._reflow === 'function') editor._reflow();
    if(typeof window !== 'undefined'){
      try{
        if(typeof window.updateRefSection === 'function') window.updateRefSection(true);
        if(typeof window.save === 'function') window.save();
        if(window.AQEditorRuntime && typeof window.AQEditorRuntime.runContentApplyEffects === 'function'){
          window.AQEditorRuntime.runContentApplyEffects({ normalize:false, layout:false, syncChrome:true, syncRefs:true });
        }
        if(editor && typeof editor.emit === 'function') editor.emit('update');
      }catch(_e){}
    }
  }

  function citationRunAtOffset(editor, offset){
    if(!editor || !editor._aqEngine || !editor._docModel || typeof editor._docModel.get !== 'function') return null;
    var model = editor._docModel.get() || {};
    var cursor = 0;
    for(var bi = 0; bi < (model.blocks || []).length; bi++){
      var block = model.blocks[bi] || {};
      var blockStart = cursor;
      var runCursor = blockStart;
      var runs = Array.isArray(block.runs) ? block.runs : [];
      for(var ri = 0; ri < runs.length; ri++){
        var run = runs[ri] || {};
        var text = String(run.text || '');
        var start = runCursor;
        var end = start + text.length;
        if(offset >= start && offset <= end && run.citation){
          return {
            blockIndex: bi,
            runIndex: ri,
            from: start,
            to: end,
            text: text,
            citation: Object.assign({}, run.citation)
          };
        }
        runCursor = end;
      }
      var len = typeof editor._docModel.blockTextLength === 'function'
        ? editor._docModel.blockTextLength(bi)
        : blockText(block).length;
      cursor += len + 1;
    }
    return null;
  }

  function unlinkCitationAtOffset(editor, offset){
    var hit = citationRunAtOffset(editor, offset);
    if(!hit || !editor || !editor._docModel || typeof editor._docModel.applyMark !== 'function') return false;
    editor._docModel.applyMark(hit.from, hit.to, 'citation', false);
    afterMutation(editor);
    return true;
  }

  function deleteCitationAtOffset(editor, offset){
    var hit = citationRunAtOffset(editor, offset);
    if(!hit || !editor || !editor._docModel || typeof editor._docModel.deleteRange !== 'function') return false;
    editor._docModel.deleteRange(hit.from, hit.to);
    afterMutation(editor);
    return true;
  }

  function findPlainMatchAtOffset(editor, references, offset){
    var matches = scanAQEngine(editor, references);
    return matches.find(function(match){
      var occ = match && match.occurrence;
      return occ && offset >= occ.from && offset <= occ.to;
    }) || null;
  }

  function currentWorkspaceReferences(root){
    root = root || (typeof window !== 'undefined' ? window : null);
    var state = root && root.S;
    if(!state) return [];
    var wsId = state.cur;
    var wss = Array.isArray(state.wss) ? state.wss : [];
    var ws = wss.find(function(item){ return item && item.id === wsId; }) || wss[0];
    return ws && Array.isArray(ws.lib) ? ws.lib : [];
  }

  function referenceTitle(ref){
    if(!ref) return 'Kaynak';
    var title = normalizeText(ref.title || ref.shortTitle || ref.doi || ref.url || ref.id);
    return title || 'Kaynak';
  }

  function toast(message, tone){
    if(typeof window === 'undefined') return;
    if(typeof window.setDst === 'function') window.setDst(message, tone || 'ok');
  }

  function linkHighConfidence(editor, references, options){
    options = options || {};
    references = references || currentWorkspaceReferences(options.root);
    var matches = scanAQEngine(editor, references);
    var linkable = matches.filter(function(item){ return item.complete; });
    linkable.sort(function(a, b){ return b.occurrence.from - a.occurrence.from; });
    var linked = 0;
    linkable.forEach(function(item){
      if(linkMatchedOccurrence(editor, item)) linked++;
    });
    if(linked) afterMutation(editor);
    return {
      scanned: matches.length,
      linked: linked,
      ambiguous: matches.filter(function(item){ return item.ambiguous.length; }).length,
      missing: matches.filter(function(item){ return item.missing.length; }).length,
      matches: matches
    };
  }

  function summarizeMatches(matches){
    var list = Array.isArray(matches) ? matches : [];
    var complete = list.filter(function(item){ return item && item.complete; }).length;
    var ambiguous = list.filter(function(item){ return item && item.ambiguous && item.ambiguous.length; }).length;
    var missing = list.filter(function(item){ return item && item.missing && item.missing.length; }).length;
    return {
      scanned: list.length,
      complete: complete,
      ambiguous: ambiguous,
      missing: missing,
      unresolved: ambiguous + missing,
      linkable: complete
    };
  }

  function scoreCandidate(ref){
    ref = ref || {};
    var score = 0;
    if(ref.doi) score += 5;
    if(ref.title) score += 3;
    if(ref.journal || ref.publisher) score += 2;
    if(Array.isArray(ref.authors) && ref.authors.length) score += 2;
    if(ref.year) score += 1;
    if(ref.pdfUrl || ref.pdfFile || ref.hasPdf) score += 1;
    return score;
  }

  function uniqueCandidateRefs(refs){
    var seen = {};
    return (Array.isArray(refs) ? refs : []).filter(function(ref){
      var id = String(ref && (ref.id || ref.doi || ref.title) || '');
      if(!id || seen[id]) return false;
      seen[id] = true;
      return true;
    }).sort(function(a, b){
      return scoreCandidate(b) - scoreCandidate(a) || referenceTitle(a).localeCompare(referenceTitle(b), 'tr');
    });
  }

  function ensureModal(){
    if(typeof document === 'undefined') return null;
    var bg = document.getElementById('plainCitationLinkModal');
    if(bg) return bg;
    bg = document.createElement('div');
    bg.id = 'plainCitationLinkModal';
    bg.className = 'modal-bg';
    bg.innerHTML =
      '<div class="modal aq-legacy-modal-lg plain-citation-link-modal" role="dialog" aria-modal="true">'+
        '<div class="flex items-start justify-between gap-4">'+
          '<div>'+
            '<div class="aq-modal-kicker">Atıf Bağlama</div>'+
            '<h2 class="mt-1 text-xl font-semibold text-aq-ink">Düz Atıfları Kaynaklara Bağla</h2>'+
            '<p id="plainCitationLinkSummary" class="mt-2 text-sm text-aq-muted"></p>'+
          '</div>'+
          '<button type="button" class="mbtn s" data-pcl-close>Kapat</button>'+
        '</div>'+
        '<div class="mt-4 flex flex-wrap gap-2">'+
          '<button type="button" class="mbtn p" data-pcl-bulk>Güvenli Eşleşmeleri Bağla</button>'+
          '<button type="button" class="mbtn s" data-pcl-refresh>Yenile</button>'+
        '</div>'+
        '<div id="plainCitationLinkList" class="mt-4 max-h-[58vh] space-y-3 overflow-auto pr-1"></div>'+
      '</div>';
    document.body.appendChild(bg);
    bg.addEventListener('mousedown', function(event){
      if(event.target === bg) closeReviewModal();
    });
    bg.addEventListener('click', function(event){
      var target = event.target;
      if(!target || !target.closest) return;
      if(target.closest('[data-pcl-close]')) closeReviewModal();
      if(target.closest('[data-pcl-refresh]')) openReviewModal();
      if(target.closest('[data-pcl-bulk]')){
        var editor = getActiveEditor();
        var result = linkHighConfidence(editor, currentWorkspaceReferences(), { root: window });
        toast(result.linked ? (result.linked + ' düz atıf bağlandı.') : 'Bağlanacak güvenli eşleşme yok.', result.linked ? 'ok' : '');
        openReviewModal();
      }
      var linkBtn = target.closest('[data-pcl-link]');
      if(linkBtn){
        var idx = Number(linkBtn.getAttribute('data-pcl-link') || '-1');
        var select = bg.querySelector('[data-pcl-select="' + idx + '"]');
        var refId = select ? String(select.value || '') : '';
        var match = getLastReviewMatches()[idx];
        if(refId && match && linkRange(getActiveEditor(), match.occurrence, [refId], match.occurrence.mode === 'textual' ? 'textual' : 'inline')){
          toast('Atıf kaynağa bağlandı.', 'ok');
          openReviewModal();
        }
      }
    });
    return bg;
  }

  var lastReviewMatches = [];
  function getLastReviewMatches(){ return lastReviewMatches || []; }

  function getActiveEditor(){
    if(typeof window === 'undefined') return null;
    return (typeof window.getActiveEditorInstance === 'function' ? window.getActiveEditorInstance() : null) || window.editor || null;
  }

  function renderReviewModal(matches){
    var bg = ensureModal();
    if(!bg) return;
    lastReviewMatches = matches || [];
    var list = bg.querySelector('#plainCitationLinkList');
    var summary = bg.querySelector('#plainCitationLinkSummary');
    var counts = summarizeMatches(lastReviewMatches);
    var complete = counts.complete;
    var ambiguous = counts.ambiguous;
    var missing = counts.missing;
    if(summary) summary.textContent = lastReviewMatches.length
      ? (lastReviewMatches.length + ' düz atıf bulundu · ' + complete + ' güvenli · ' + ambiguous + ' belirsiz · ' + missing + ' kaynaksız')
      : 'Belgede bağlanacak düz APA atıfı bulunamadı.';
    if(!list) return;
    if(!lastReviewMatches.length){
      list.innerHTML = '<div class="rounded-xl border border-aq-line bg-aq-panel p-5 text-sm text-aq-muted">Bağlanacak düz atıf yok.</div>';
      return;
    }
    list.innerHTML = lastReviewMatches.map(function(match, index){
      var occ = match.occurrence || {};
      var candidates = [];
      if(match.complete){
        candidates = match.refIds.map(function(id){
          return currentWorkspaceReferences().find(function(ref){ return String(ref.id) === String(id); });
        }).filter(Boolean);
      }else if(match.ambiguous.length){
        candidates = match.ambiguous.reduce(function(all, group){
          return all.concat(group.matches || []);
        }, []);
      }
      candidates = uniqueCandidateRefs(candidates);
      var options = candidates.map(function(ref){
        var meta = [ref.year, ref.journal || ref.publisher, ref.doi ? 'DOI' : ''].filter(Boolean).join(' · ');
        var label = referenceTitle(ref).slice(0, 88) + (meta ? ' — ' + meta : '');
        return '<option value="' + escapeAttr(ref.id || '') + '">' + escapeHtml(label.slice(0, 130)) + '</option>';
      }).join('');
      var status = match.complete ? 'Güvenli' : (match.ambiguous.length ? 'Belirsiz' : 'Kaynak yok');
      var tone = match.complete ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : (match.ambiguous.length ? 'text-amber-700 border-amber-200 bg-amber-50' : 'text-red-700 border-red-200 bg-red-50');
      return '<article class="rounded-xl border border-aq-line bg-white p-4 shadow-sm">'+
        '<div class="flex items-start justify-between gap-3">'+
          '<div class="min-w-0">'+
            '<div class="mb-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ' + tone + '">' + status + '</div>'+
            '<div class="font-serif text-base text-aq-ink">' + escapeHtml(occ.text || '') + '</div>'+
            '<div class="mt-1 text-xs text-aq-muted">Konum: ' + Number(occ.from || 0) + '–' + Number(occ.to || 0) + '</div>'+
          '</div>'+
          (options
            ? '<div class="flex shrink-0 items-center gap-2"><select data-pcl-select="' + index + '" class="h-9 max-w-[320px] rounded-lg border border-aq-line bg-white px-2 text-sm">' + options + '</select><button type="button" class="mbtn p" data-pcl-link="' + index + '">Bağla</button></div>'
            : '<span class="text-xs text-aq-muted">Önce kaynak ekle veya DOI ile eşleştir.</span>')+
        '</div>'+
      '</article>';
    }).join('');
  }

  function openReviewModal(editor, references){
    editor = editor || getActiveEditor();
    references = references || currentWorkspaceReferences();
    var matches = scanAQEngine(editor, references);
    renderReviewModal(matches);
    var bg = ensureModal();
    if(bg) bg.classList.add('show');
    return matches;
  }

  function closeReviewModal(){
    var bg = typeof document !== 'undefined' ? document.getElementById('plainCitationLinkModal') : null;
    if(bg) bg.classList.remove('show');
  }

  function ensureImportCleanupModal(){
    if(typeof document === 'undefined') return null;
    var bg = document.getElementById('wordImportCleanupModal');
    if(bg) return bg;
    if(!document.getElementById('wordImportCleanupModalStyle')){
      var style = document.createElement('style');
      style.id = 'wordImportCleanupModalStyle';
      style.textContent = [
        '#wordImportCleanupModal .wic-modal{width:min(820px,92vw);max-height:86vh;overflow:auto;border:1px solid rgba(28,37,51,.12);border-radius:18px;background:rgba(255,255,255,.96);box-shadow:0 28px 70px rgba(15,23,42,.22);padding:22px;}',
        '#wordImportCleanupModal .wic-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;}',
        '#wordImportCleanupModal .wic-kicker{font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#7a8797;}',
        '#wordImportCleanupModal .wic-title{margin:4px 0 0;font-size:20px;line-height:1.2;font-weight:700;color:#172033;}',
        '#wordImportCleanupModal .wic-summary{margin:8px 0 0;max-width:560px;font-size:13px;line-height:1.5;color:#667485;}',
        '#wordImportCleanupModal .wic-chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px;}',
        '#wordImportCleanupModal .wic-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(28,37,51,.12);border-radius:999px;background:#fff;padding:5px 9px;font-size:11px;font-weight:650;color:#405064;}',
        '#wordImportCleanupModal .wic-chip strong{color:#172033;font-weight:750;}',
        '#wordImportCleanupModal .wic-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px;}',
        '#wordImportCleanupModal .wic-card{display:flex;min-height:176px;flex-direction:column;justify-content:space-between;border:1px solid rgba(28,37,51,.12);border-radius:16px;background:#fff;padding:16px;box-shadow:0 10px 28px rgba(15,23,42,.06);}',
        '#wordImportCleanupModal .wic-card[data-disabled="true"]{background:#fbfaf8;color:#7a8797;}',
        '#wordImportCleanupModal .wic-card-kicker{font-size:10px;font-weight:750;letter-spacing:.16em;text-transform:uppercase;color:#7a8797;}',
        '#wordImportCleanupModal .wic-card-value{margin-top:8px;font-size:24px;line-height:1;font-weight:800;color:#172033;}',
        '#wordImportCleanupModal .wic-card-title{margin-top:8px;font-size:14px;font-weight:750;color:#172033;}',
        '#wordImportCleanupModal .wic-card-detail{margin:7px 0 0;font-size:12px;line-height:1.45;color:#667485;}',
        '#wordImportCleanupModal .wic-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:18px;border-top:1px solid rgba(28,37,51,.08);padding-top:14px;}',
        '#wordImportCleanupModal .wic-hint{font-size:12px;line-height:1.4;color:#667485;}',
        '#wordImportCleanupModal .wic-card .mbtn{flex:0 0 auto;width:100%;margin-top:14px;}',
        '@media (max-width:760px){#wordImportCleanupModal .wic-grid{grid-template-columns:1fr;}#wordImportCleanupModal .wic-head{flex-direction:column;}#wordImportCleanupModal .wic-head .mbtn{width:100%;}}'
      ].join('');
      document.head.appendChild(style);
    }
    bg = document.createElement('div');
    bg.id = 'wordImportCleanupModal';
    bg.className = 'modal-bg';
    bg.innerHTML =
      '<div class="modal wic-modal word-import-cleanup-modal" role="dialog" aria-modal="true">'+
        '<div class="wic-head">'+
          '<div>'+
            '<div class="wic-kicker">Word import</div>'+
            '<h2 class="wic-title">İçe aktarım temizliği</h2>'+
            '<p id="wordImportCleanupSummary" class="wic-summary"></p>'+
            '<div id="wordImportCleanupChips" class="wic-chips"></div>'+
          '</div>'+
          '<button type="button" class="mbtn s" data-wic-close>Kapat</button>'+
        '</div>'+
        '<div id="wordImportCleanupCards" class="wic-grid"></div>'+
        '<div class="wic-actions">'+
          '<div class="wic-hint">Belge içeriği değiştirilmez; yalnızca içe aktarımdan sonra bakılacak işleri toplar.</div>'+
          '<button type="button" class="mbtn s" data-wic-later>Şimdilik geç</button>'+
        '</div>'+
      '</div>';
    document.body.appendChild(bg);
    bg.addEventListener('mousedown', function(event){
      if(event.target === bg) closeImportCleanupModal();
    });
    bg.addEventListener('click', function(event){
      var target = event.target;
      if(!target || !target.closest) return;
      if(target.closest('[data-wic-close]') || target.closest('[data-wic-later]')) closeImportCleanupModal();
      if(target.closest('[data-wic-citations]')){
        closeImportCleanupModal();
        openReviewModal();
      }
      if(target.closest('[data-wic-bib]')){
        var analysis = getLastImportAnalysis();
        openExternalReferenceImportWithText(analysis && analysis.bibliographyText || '');
        closeImportCleanupModal();
      }
      if(target.closest('[data-wic-outline]')){
        openDocumentOutlineSurface();
        closeImportCleanupModal();
      }
    });
    return bg;
  }

  var lastImportAnalysis = null;
  function getLastImportAnalysis(){ return lastImportAnalysis; }

  function renderImportCleanupModal(analysis){
    var bg = ensureImportCleanupModal();
    if(!bg) return;
    lastImportAnalysis = analysis || null;
    var summary = bg.querySelector('#wordImportCleanupSummary');
    var chips = bg.querySelector('#wordImportCleanupChips');
    var cards = bg.querySelector('#wordImportCleanupCards');
    var plain = analysis && analysis.plainCitationSummary || {};
    var bibCount = analysis && analysis.bibliographyLines ? analysis.bibliographyLines.length : 0;
    var headingCount = analysis ? Number(analysis.headingCandidateCount || 0) : 0;
    var scanned = Number(plain.scanned || 0);
    var linkable = Number(plain.linkable || 0);
    var unresolved = Number(plain.unresolved || 0);
    if(summary){
      summary.textContent = scanned || bibCount || headingCount
        ? 'İçe aktarılan belge için güvenli kontrol hazır. Atıf, kaynakça ve başlık adaylarını tek tek onaylayabilirsin.'
        : 'Belgede ek temizlik gerektiren belirgin bir şey bulunmadı.';
    }
    if(chips){
      chips.innerHTML =
        '<span class="wic-chip"><strong>' + scanned + '</strong> düz atıf</span>'+
        '<span class="wic-chip"><strong>' + bibCount + '</strong> kaynakça satırı</span>'+
        '<span class="wic-chip"><strong>' + headingCount + '</strong> başlık adayı</span>';
    }
    if(!cards) return;
    cards.innerHTML =
      cleanupCardHTML({
        kicker: 'Atıf eşleme',
        title: 'Düz APA atıfları',
        value: scanned,
        detail: linkable + ' güvenli bağlanabilir · ' + unresolved + ' elle kontrol',
        button: 'Atıfları gözden geçir',
        attr: 'data-wic-citations',
        disabled: !scanned
      })+
      cleanupCardHTML({
        kicker: 'Kaynakça import',
        title: 'Kaynakça satırları',
        value: bibCount,
        detail: bibCount ? 'Dışarıdan kaynakça ekleme modalına hazır metin olarak aktarılır.' : 'Kaynakça satırı algılanmadı.',
        button: 'Kaynakçayı aktar',
        attr: 'data-wic-bib',
        disabled: !bibCount
      })+
      cleanupCardHTML({
        kicker: 'Belge yapısı',
        title: 'Başlık adayları',
        value: headingCount,
        detail: headingCount ? 'Belge anahatında yapı kontrolü yap.' : 'Başlık adayı algılanmadı.',
        button: 'Anahatı aç',
        attr: 'data-wic-outline',
        disabled: !headingCount
      });
  }

  function cleanupCardHTML(item){
    return '<article class="wic-card" data-disabled="' + (item.disabled ? 'true' : 'false') + '">'+
      '<div>'+
        '<div class="wic-card-kicker">' + escapeHtml(item.kicker || '') + '</div>'+
        '<div class="wic-card-value">' + escapeHtml(item.value) + '</div>'+
        '<div class="wic-card-title">' + escapeHtml(item.title) + '</div>'+
        '<p class="wic-card-detail">' + escapeHtml(item.detail) + '</p>'+
      '</div>'+
      '<div>'+
        '<button type="button" class="mbtn ' + (item.disabled ? 's' : 'p') + '" ' + item.attr + ' ' + (item.disabled ? 'disabled title="Bu belgede uygun aday yok."' : '') + '>' + escapeHtml(item.button) + '</button>'+
      '</div>'+
    '</article>';
  }

  function openImportCleanupModal(editor, references){
    editor = editor || getActiveEditor();
    references = references || currentWorkspaceReferences();
    var analysis = analyzeImportedDocument(editor, references);
    renderImportCleanupModal(analysis);
    var bg = ensureImportCleanupModal();
    if(bg) bg.classList.add('show');
    return analysis;
  }

  function closeImportCleanupModal(){
    var bg = typeof document !== 'undefined' ? document.getElementById('wordImportCleanupModal') : null;
    if(bg) bg.classList.remove('show');
  }

  function openExternalReferenceImportWithText(text){
    if(typeof document === 'undefined') return false;
    var modal = document.getElementById('externalReferenceImportModal');
    var input = document.getElementById('externalReferenceTextInput');
    if(input && 'value' in input) input.value = String(text || '');
    if(modal) modal.classList.add('show');
    if(input && typeof input.focus === 'function') setTimeout(function(){ input.focus(); }, 30);
    return !!modal;
  }

  function openDocumentOutlineSurface(){
    if(typeof document === 'undefined') return false;
    var modal = document.getElementById('docOutlineModal');
    if(modal){
      modal.classList.add('show');
      return true;
    }
    if(typeof window !== 'undefined' && window.AQLeanShell && typeof window.AQLeanShell.openSidePanel === 'function'){
      window.AQLeanShell.openSidePanel('outline');
      return true;
    }
    return false;
  }

  function ensureContextMenu(){
    if(typeof document === 'undefined') return null;
    var menu = document.getElementById('plainCitationContextMenu');
    if(menu) return menu;
    if(!document.getElementById('plainCitationContextMenuStyle')){
      var style = document.createElement('style');
      style.id = 'plainCitationContextMenuStyle';
      style.textContent = [
        '#plainCitationContextMenu{background:#fff;border:1px solid rgba(17,24,39,.12);border-radius:12px;box-shadow:0 18px 45px rgba(15,23,42,.16);padding:6px;color:#172033;font:12px/1.3 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
        '#plainCitationContextMenu button{display:block;width:100%;border:0;background:transparent;border-radius:8px;padding:8px 10px;text-align:left;color:#172033;font:inherit;cursor:pointer;}',
        '#plainCitationContextMenu button:hover{background:#f4f6f8;}',
        '#plainCitationContextMenu button.danger{color:#9f1d1d;}',
        '#plainCitationContextMenu button.danger:hover{background:#fff1f1;}'
      ].join('');
      document.head.appendChild(style);
    }
    menu = document.createElement('div');
    menu.id = 'plainCitationContextMenu';
    menu.className = 'aq-context-menu plain-citation-context-menu';
    menu.style.position = 'fixed';
    menu.style.zIndex = '99999';
    menu.style.display = 'none';
    menu.style.minWidth = '220px';
    menu.innerHTML =
      '<button type="button" data-pcc-action="link">Kaynağa bağla</button>'+
      '<button type="button" data-pcc-action="change">Kaynağı değiştir</button>'+
      '<button type="button" data-pcc-action="unlink">Bağlantıyı kaldır</button>'+
      '<button type="button" data-pcc-action="delete" class="danger">Atıfı sil</button>';
    document.body.appendChild(menu);
    menu.addEventListener('mousedown', function(event){ event.preventDefault(); event.stopPropagation(); });
    menu.addEventListener('click', function(event){
      var btn = event.target && event.target.closest ? event.target.closest('[data-pcc-action]') : null;
      if(!btn) return;
      event.preventDefault();
      event.stopPropagation();
      var state = menu.__aqContextState || {};
      var action = btn.getAttribute('data-pcc-action');
      if(action === 'link' || action === 'change'){
        openSingleLinkModal(state.match || null, state.citation || null);
      }else if(action === 'unlink'){
        if(unlinkCitationAtOffset(getActiveEditor(), state.offset)) toast('Atıf bağlantısı kaldırıldı.', 'ok');
      }else if(action === 'delete'){
        if(deleteCitationAtOffset(getActiveEditor(), state.offset)) toast('Atıf silindi.', 'ok');
      }
      hideContextMenu();
    });
    return menu;
  }

  function hideContextMenu(){
    var menu = typeof document !== 'undefined' ? document.getElementById('plainCitationContextMenu') : null;
    if(menu) menu.style.display = 'none';
  }

  function escapeHtml(value){
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(value){ return escapeHtml(value); }

  function offsetFromEvent(event){
    var target = event && event.target;
    if(!target || !target.closest) return null;
    var node = target.closest('[data-offset-start][data-offset-end]');
    if(!node && typeof document !== 'undefined' && typeof document.elementsFromPoint === 'function'){
      var stack = document.elementsFromPoint(event.clientX || 0, event.clientY || 0);
      node = stack.find(function(item){
        return item && item.matches && item.matches('[data-offset-start][data-offset-end]');
      }) || stack.map(function(item){
        return item && item.closest ? item.closest('[data-offset-start][data-offset-end]') : null;
      }).find(Boolean);
    }
    if(!node) return null;
    var start = Number(node.getAttribute('data-offset-start') || '0');
    var end = Number(node.getAttribute('data-offset-end') || '0');
    if(!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return Math.max(start, Math.min(end, start + Math.floor(Math.max(0, end - start) / 2)));
  }

  function showEditorContextMenu(event){
    if(!event || event.defaultPrevented) return;
    var target = event.target;
    if(!target || !target.closest) return;
    if(target.closest('#pdfpanel, #pdfctxmenu, input, textarea, select, button, .modal-bg')) return;
    var editor = getActiveEditor();
    if(!editor || !editor._aqEngine) return;
    var offset = offsetFromEvent(event);
    if(offset == null) return;
    var refs = currentWorkspaceReferences();
    var citation = citationRunAtOffset(editor, offset);
    var match = citation ? null : findPlainMatchAtOffset(editor, refs, offset);
    if(!citation && !match) return;
    var menu = ensureContextMenu();
    if(!menu) return;
    event.preventDefault();
    event.stopPropagation();
    menu.__aqContextState = { offset: offset, citation: citation, match: match };
    var linkBtn = menu.querySelector('[data-pcc-action="link"]');
    var changeBtn = menu.querySelector('[data-pcc-action="change"]');
    var unlinkBtn = menu.querySelector('[data-pcc-action="unlink"]');
    var deleteBtn = menu.querySelector('[data-pcc-action="delete"]');
    if(linkBtn) linkBtn.style.display = match ? 'block' : 'none';
    if(changeBtn) changeBtn.style.display = citation ? 'block' : 'none';
    if(unlinkBtn) unlinkBtn.style.display = citation ? 'block' : 'none';
    if(deleteBtn) deleteBtn.style.display = citation ? 'block' : 'none';
    menu.style.left = Math.min(event.clientX || 0, window.innerWidth - 240) + 'px';
    menu.style.top = Math.min(event.clientY || 0, window.innerHeight - 160) + 'px';
    menu.style.display = 'block';
  }

  function openSingleLinkModal(match, citation){
    var refs = currentWorkspaceReferences();
    var occurrence = match && match.occurrence;
    if(!occurrence && citation){
      occurrence = { from: citation.from, to: citation.to, text: citation.text, mode: citation.citation && citation.citation.mode || 'inline' };
    }
    if(!occurrence) return;
    var fakeMatch = match || { occurrence: occurrence, ambiguous: [{ matches: refs }], refIds: [], complete: false, missing: [] };
    renderReviewModal([fakeMatch]);
    var bg = ensureModal();
    if(bg) bg.classList.add('show');
  }

  function installContextMenu(){
    if(typeof document === 'undefined') return false;
    if(document.__aqPlainCitationContextInstalled) return true;
    document.__aqPlainCitationContextInstalled = true;
    document.addEventListener('contextmenu', showEditorContextMenu, true);
    document.addEventListener('mousedown', function(event){
      var target = event.target;
      if(target && target.closest && target.closest('#plainCitationContextMenu')) return;
      hideContextMenu();
    }, true);
    return true;
  }

  if(typeof window !== 'undefined'){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installContextMenu, { once:true });
    else installContextMenu();
  }

  if(typeof window !== 'undefined'){
    window.addEventListener('aq:word-import-complete', function(){
      var editor = getActiveEditor();
      var analysis = analyzeImportedDocument(editor, currentWorkspaceReferences());
      var plain = analysis && analysis.plainCitationSummary || {};
      if((plain.scanned || 0) || (analysis.bibliographyLines && analysis.bibliographyLines.length) || (analysis.headingCandidateCount || 0)){
        openImportCleanupModal(editor, currentWorkspaceReferences());
      }
    });
  }

  return {
    detectPlainCitations: detectPlainCitations,
    matchOccurrence: matchOccurrence,
    scanAQEngine: scanAQEngine,
    linkMatchedOccurrence: linkMatchedOccurrence,
    linkRange: linkRange,
    citationRunAtOffset: citationRunAtOffset,
    unlinkCitationAtOffset: unlinkCitationAtOffset,
    deleteCitationAtOffset: deleteCitationAtOffset,
    findPlainMatchAtOffset: findPlainMatchAtOffset,
    analyzeImportedDocument: analyzeImportedDocument,
    linkHighConfidence: linkHighConfidence,
    summarizeMatches: summarizeMatches,
    openReviewModal: openReviewModal,
    closeReviewModal: closeReviewModal,
    openImportCleanupModal: openImportCleanupModal,
    closeImportCleanupModal: closeImportCleanupModal,
    installContextMenu: installContextMenu,
    _internals: {
      fold: fold,
      normalizeYear: normalizeYear,
      firstSurnameFromAuthor: firstSurnameFromAuthor,
      firstSurnameFromCitationName: firstSurnameFromCitationName,
      referenceKey: referenceKey
    }
  };
});
