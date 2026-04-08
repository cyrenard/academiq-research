(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQDuplicateDetection = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function normalizeDoi(value){
    var raw = String(value || '').trim();
    if(!raw) return '';
    try{ raw = decodeURIComponent(raw); }catch(_e){}
    raw = raw
      .replace(/^doi:\s*/i, '')
      .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, '')
      .replace(/[)\].,;:]+$/g, '');
    var match = raw.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
    var doi = (match && match[0]) ? match[0] : raw;
    doi = doi
      .replace(/(?:\/|\.)(BIBTEX|RIS|ABSTRACT|FULLTEXT|FULL|PDF|XML|HTML|EPUB)$/i, '')
      .replace(/\/[A-Za-z]$/i, '')
      .replace(/[)\].,;:]+$/g, '')
      .toLowerCase();
    if(!/^10\.\d{4,9}\//i.test(doi)) return '';
    return doi;
  }

  function normalizeTitle(value){
    return String(value || '')
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extractFirstAuthorSurname(ref){
    var authors = (ref && Array.isArray(ref.authors)) ? ref.authors : [];
    if(!authors.length) return '';
    var first = String(authors[0] || '').trim();
    if(!first) return '';
    if(first.indexOf(',') >= 0) return first.split(',')[0].trim().toLowerCase();
    var parts = first.split(/\s+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1].toLowerCase() : '';
  }

  function normalizeYear(value){
    var text = String(value || '').trim();
    if(!text) return '';
    var match = text.match(/\b(19|20)\d{2}\b/);
    return match ? match[0] : text;
  }

  function jaccardSimilarity(a, b){
    var aa = normalizeTitle(a).split(' ').filter(Boolean);
    var bb = normalizeTitle(b).split(' ').filter(Boolean);
    if(!aa.length || !bb.length) return 0;
    var setA = {};
    var setB = {};
    aa.forEach(function(token){ setA[token] = true; });
    bb.forEach(function(token){ setB[token] = true; });
    var intersection = 0;
    var union = 0;
    Object.keys(setA).forEach(function(token){
      if(setB[token]) intersection++;
      union++;
    });
    Object.keys(setB).forEach(function(token){
      if(!setA[token]) union++;
    });
    if(!union) return 0;
    return intersection / union;
  }

  function pdfSignature(ref){
    if(!ref || typeof ref !== 'object') return '';
    if(ref.pdfHash) return String(ref.pdfHash).trim().toLowerCase();
    var source = String(ref.pdfPath || ref.pdfUrl || '').trim().toLowerCase();
    if(!source) return '';
    var parts = source.split(/[\\/]/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : source;
  }

  function pairReasons(a, b){
    var reasons = [];
    var doiA = normalizeDoi(a && a.doi);
    var doiB = normalizeDoi(b && b.doi);
    if(doiA && doiB && doiA === doiB){
      reasons.push({ code:'doi_exact', confidence:1 });
    }

    var titleA = normalizeTitle(a && a.title);
    var titleB = normalizeTitle(b && b.title);
    if(titleA && titleB && titleA === titleB && titleA.length >= 12){
      reasons.push({ code:'title_exact', confidence:0.95 });
    }

    var yearA = normalizeYear(a && a.year);
    var yearB = normalizeYear(b && b.year);
    var authorA = extractFirstAuthorSurname(a);
    var authorB = extractFirstAuthorSurname(b);
    var similarity = jaccardSimilarity(a && a.title, b && b.title);
    if(authorA && authorB && yearA && yearB && authorA === authorB && yearA === yearB && similarity >= 0.62){
      reasons.push({ code:'author_year_similar_title', confidence:Math.min(0.92, similarity) });
    }

    var sigA = pdfSignature(a);
    var sigB = pdfSignature(b);
    if(sigA && sigB && sigA === sigB){
      reasons.push({ code:'pdf_signature', confidence:0.88 });
    }
    return reasons;
  }

  function unionFind(size){
    var parent = [];
    for(var i = 0; i < size; i++) parent[i] = i;
    function find(x){
      while(parent[x] !== x){
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    }
    function join(a, b){
      var pa = find(a);
      var pb = find(b);
      if(pa !== pb) parent[pb] = pa;
    }
    return {
      find: find,
      join: join
    };
  }

  function buildGroupSignature(ids){
    return ids.slice().sort().join('|');
  }

  function detectDuplicateGroups(refs, options){
    options = options || {};
    var list = (Array.isArray(refs) ? refs : []).filter(function(ref){ return ref && ref.id; });
    var dismissedMap = options.dismissedSignatures || {};
    if(list.length < 2) return [];

    var uf = unionFind(list.length);
    var pairMap = {};
    for(var i = 0; i < list.length; i++){
      for(var j = i + 1; j < list.length; j++){
        var reasons = pairReasons(list[i], list[j]);
        if(!reasons.length) continue;
        uf.join(i, j);
        pairMap[i + ':' + j] = reasons;
      }
    }

    var buckets = {};
    for(var k = 0; k < list.length; k++){
      var root = uf.find(k);
      if(!buckets[root]) buckets[root] = [];
      buckets[root].push(k);
    }

    var groups = [];
    Object.keys(buckets).forEach(function(bucketKey){
      var idxs = buckets[bucketKey];
      if(!idxs || idxs.length < 2) return;
      var members = idxs.map(function(idx){ return list[idx]; });
      var ids = members.map(function(member){ return member.id; });
      var signature = buildGroupSignature(ids);
      if(dismissedMap && dismissedMap[signature]) return;

      var reasonCodes = {};
      var confidence = 0;
      for(var ii = 0; ii < idxs.length; ii++){
        for(var jj = ii + 1; jj < idxs.length; jj++){
          var key = idxs[ii] < idxs[jj] ? (idxs[ii] + ':' + idxs[jj]) : (idxs[jj] + ':' + idxs[ii]);
          var reasons = pairMap[key] || [];
          reasons.forEach(function(reason){
            reasonCodes[reason.code] = true;
            if(reason.confidence > confidence) confidence = reason.confidence;
          });
        }
      }

      groups.push({
        signature: signature,
        ids: ids,
        records: members,
        reasons: Object.keys(reasonCodes),
        confidence: confidence || 0.5
      });
    });

    groups.sort(function(a, b){
      if(b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.signature.localeCompare(b.signature);
    });
    return groups;
  }

  function metadataScore(ref){
    if(!ref || typeof ref !== 'object') return 0;
    var score = 0;
    var fields = ['title','year','journal','volume','issue','fp','lp','doi','url','abstract','note','pdfUrl','pdfPath'];
    fields.forEach(function(field){
      if(String(ref[field] || '').trim()) score += 2;
    });
    var authorCount = Array.isArray(ref.authors) ? ref.authors.filter(Boolean).length : 0;
    score += Math.min(8, authorCount * 2);
    var labelCount = Array.isArray(ref.labels) ? ref.labels.filter(Boolean).length : 0;
    score += Math.min(6, labelCount);
    if(ref.pdfData) score += 3;
    return score;
  }

  function pickPrimaryRecord(records){
    var list = (Array.isArray(records) ? records : []).filter(Boolean);
    if(!list.length) return null;
    var sorted = list.slice().sort(function(a, b){
      var scoreDiff = metadataScore(b) - metadataScore(a);
      if(scoreDiff) return scoreDiff;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
    return sorted[0];
  }

  function unionUnique(values){
    var out = [];
    var seen = {};
    (Array.isArray(values) ? values : []).forEach(function(value){
      var key = String(value || '').trim();
      if(!key || seen[key]) return;
      seen[key] = true;
      out.push(value);
    });
    return out;
  }

  function mergeRecords(primary, secondary){
    if(!primary || !secondary || primary === secondary) return primary || secondary || null;
    var merged = primary;
    [
      'title','year','journal','volume','issue','fp','lp','doi','url','pdfUrl','pdfPath',
      'publisher','edition','booktitle','location','language','abstract','note'
    ].forEach(function(field){
      var p = String(merged[field] || '').trim();
      var s = String(secondary[field] || '').trim();
      if(!p && s) merged[field] = secondary[field];
    });
    var pAuthors = Array.isArray(merged.authors) ? merged.authors : [];
    var sAuthors = Array.isArray(secondary.authors) ? secondary.authors : [];
    merged.authors = unionUnique(pAuthors.concat(sAuthors));

    var pLabels = Array.isArray(merged.labels) ? merged.labels : [];
    var sLabels = Array.isArray(secondary.labels) ? secondary.labels : [];
    merged.labels = unionUnique(pLabels.concat(sLabels));

    if(!merged.pdfData && secondary.pdfData) merged.pdfData = secondary.pdfData;
    if(secondary.citationCount != null && merged.citationCount == null) merged.citationCount = secondary.citationCount;
    if(!merged.citationFetchDate && secondary.citationFetchDate) merged.citationFetchDate = secondary.citationFetchDate;
    return merged;
  }

  return {
    normalizeDoi: normalizeDoi,
    normalizeTitle: normalizeTitle,
    extractFirstAuthorSurname: extractFirstAuthorSurname,
    jaccardSimilarity: jaccardSimilarity,
    detectDuplicateGroups: detectDuplicateGroups,
    metadataScore: metadataScore,
    pickPrimaryRecord: pickPrimaryRecord,
    mergeRecords: mergeRecords
  };
});
