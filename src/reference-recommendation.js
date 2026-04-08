(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQReferenceRecommendation = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function uniq(arr){
    var out = [];
    var seen = {};
    (arr || []).forEach(function(item){
      var key = String(item || '').trim().toLowerCase();
      if(!key || seen[key]) return;
      seen[key] = true;
      out.push(String(item || '').trim());
    });
    return out;
  }

  function tokenize(text){
    return uniq(String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u00c0-\u024f]+/g, ' ')
      .split(/\s+/)
      .filter(function(token){
        return token && token.length >= 3;
      }));
  }

  function overlapCount(a, b){
    var set = {};
    (a || []).forEach(function(token){ set[token] = true; });
    var score = 0;
    (b || []).forEach(function(token){
      if(set[token]) score++;
    });
    return score;
  }

  function noteTextForRef(notes, refId){
    var list = Array.isArray(notes) ? notes : [];
    return list
      .filter(function(note){ return note && String(note.rid || '') === String(refId || ''); })
      .map(function(note){
        return [
          note.txt || '',
          note.q || '',
          note.comment || '',
          note.tag || '',
          note.noteType || ''
        ].join(' ');
      })
      .join(' ');
  }

  function makeReasons(queryOverlap, contextOverlap, noteOverlap, tagOverlap, recentUsed){
    var reasons = [];
    if(queryOverlap > 0) reasons.push('query eşleşmesi');
    if(contextOverlap > 0) reasons.push('paragraf bağlamı');
    if(noteOverlap > 0) reasons.push('not örtüşmesi');
    if(tagOverlap > 0) reasons.push('etiket örtüşmesi');
    if(recentUsed) reasons.push('yakın kullanım');
    return reasons;
  }

  function scoreReference(ref, options){
    options = options || {};
    var queryTokens = tokenize(options.query || '');
    var contextTokens = tokenize(options.contextText || '');
    var refTokens = tokenize([
      ref && ref.title,
      ref && ref.journal,
      (ref && Array.isArray(ref.authors) ? ref.authors.join(' ') : ''),
      ref && ref.abstract,
      ref && ref.note
    ].join(' '));
    var tagTokens = tokenize(Array.isArray(ref && ref.labels) ? ref.labels.join(' ') : '');
    var noteTokens = tokenize(noteTextForRef(options.notes, ref && ref.id));

    var queryOverlap = overlapCount(queryTokens, refTokens);
    var contextOverlap = overlapCount(contextTokens, refTokens);
    var noteOverlap = overlapCount(contextTokens.concat(queryTokens), noteTokens);
    var tagOverlap = overlapCount(contextTokens.concat(queryTokens), tagTokens);

    var recentSet = {};
    (Array.isArray(options.recentRefIds) ? options.recentRefIds : []).forEach(function(id){
      recentSet[String(id || '')] = true;
    });
    var recentUsed = !!recentSet[String(ref && ref.id || '')];

    var score = 0;
    score += queryOverlap * 8;
    score += contextOverlap * 5;
    score += noteOverlap * 4;
    score += tagOverlap * 3;
    if(recentUsed) score += 2;
    if(ref && ref.citationCount != null){
      score += Math.min(3, Math.log10(Number(ref.citationCount) + 1));
    }

    return {
      ref: ref,
      score: score,
      reasons: makeReasons(queryOverlap, contextOverlap, noteOverlap, tagOverlap, recentUsed)
    };
  }

  function rankForCitationContext(refs, options){
    var list = (Array.isArray(refs) ? refs : []).filter(Boolean);
    return list
      .map(function(ref){ return scoreReference(ref, options); })
      .sort(function(a, b){
        if(b.score !== a.score) return b.score - a.score;
        return String((a.ref && a.ref.title) || '').localeCompare(String((b.ref && b.ref.title) || ''), 'tr', { sensitivity: 'base' });
      });
  }

  function relatedPapers(targetRef, refs, options){
    options = options || {};
    if(!targetRef) return [];
    var all = (Array.isArray(refs) ? refs : []).filter(function(ref){
      return ref && ref.id && ref.id !== targetRef.id;
    });
    var baseTitleTokens = tokenize(targetRef.title || '');
    var baseAuthors = tokenize((Array.isArray(targetRef.authors) ? targetRef.authors.join(' ') : ''));
    var baseTags = tokenize((Array.isArray(targetRef.labels) ? targetRef.labels.join(' ') : ''));
    var baseNotes = tokenize(noteTextForRef(options.notes, targetRef.id));

    return all.map(function(ref){
      var titleTokens = tokenize(ref.title || '');
      var authors = tokenize((Array.isArray(ref.authors) ? ref.authors.join(' ') : ''));
      var tags = tokenize((Array.isArray(ref.labels) ? ref.labels.join(' ') : ''));
      var notes = tokenize(noteTextForRef(options.notes, ref.id));
      var titleOverlap = overlapCount(baseTitleTokens, titleTokens);
      var authorOverlap = overlapCount(baseAuthors, authors);
      var tagOverlap = overlapCount(baseTags, tags);
      var noteOverlap = overlapCount(baseNotes, notes);
      var score = titleOverlap * 6 + authorOverlap * 5 + tagOverlap * 4 + noteOverlap * 3;
      var reasons = [];
      if(titleOverlap) reasons.push('benzer başlık');
      if(authorOverlap) reasons.push('benzer yazar');
      if(tagOverlap) reasons.push('benzer etiket');
      if(noteOverlap) reasons.push('not örtüşmesi');
      return { ref: ref, score: score, reasons: reasons };
    }).filter(function(item){
      return item.score > 0;
    }).sort(function(a, b){
      if(b.score !== a.score) return b.score - a.score;
      return String((a.ref && a.ref.title) || '').localeCompare(String((b.ref && b.ref.title) || ''), 'tr', { sensitivity: 'base' });
    });
  }

  return {
    tokenize: tokenize,
    rankForCitationContext: rankForCitationContext,
    relatedPapers: relatedPapers
  };
});
