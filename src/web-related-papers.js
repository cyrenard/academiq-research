(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQWebRelatedPapers = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function asText(value, maxLen){
    var text = String(value == null ? '' : value).trim();
    if(maxLen && text.length > maxLen) return text.slice(0, maxLen);
    return text;
  }

  function normalizeDoi(value){
    var raw = asText(value, 512);
    if(!raw) return '';
    try{ raw = decodeURIComponent(raw); }catch(_e){}
    raw = raw
      .replace(/^doi:\s*/i, '')
      .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, '')
      .replace(/[)\].,;:]+$/g, '');
    var m = raw.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
    var doi = (m && m[0]) ? m[0] : raw;
    doi = doi
      .replace(/[)\].,;:]+$/g, '')
      .replace(/(?:\/|\.)(BIBTEX|RIS|ABSTRACT|FULLTEXT|FULL|PDF|XML|HTML|EPUB)$/i, '')
      .replace(/\/[A-Z]$/i, '')
      .toLowerCase();
    if(!/^10\.\d{4,9}\//i.test(doi)) return '';
    return doi;
  }

  function normalizeYear(value){
    var text = asText(value, 32);
    if(!text) return '';
    var m = text.match(/\b(19|20)\d{2}\b/);
    return m ? m[0] : text;
  }

  function normalizeTitle(value){
    return asText(value, 2048).replace(/\s+/g, ' ');
  }

  function normalizeAuthors(value){
    if(!Array.isArray(value)) return [];
    return value.map(function(author){
      return asText(author, 256).replace(/\s+/g, ' ');
    }).filter(Boolean);
  }

  function normalizeLabels(value){
    if(!Array.isArray(value)) return [];
    return value.map(function(label){
      if(typeof label === 'string') return asText(label, 120);
      if(label && typeof label === 'object') return asText(label.name || label.tag, 120);
      return '';
    }).filter(Boolean);
  }

  function normalizeTextForMatch(value){
    return asText(value, 4096)
      .toLowerCase()
      .replace(/[“”"'"`´’]/g, ' ')
      .replace(/[^a-z0-9çğıöşü\s-]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenize(value){
    var seen = {};
    var out = [];
    normalizeTextForMatch(value).split(' ').forEach(function(token){
      if(!token || token.length < 3) return;
      if(seen[token]) return;
      seen[token] = true;
      out.push(token);
    });
    return out;
  }

  function overlapRatio(a, b){
    var aa = Array.isArray(a) ? a : [];
    var bb = Array.isArray(b) ? b : [];
    if(!aa.length || !bb.length) return 0;
    var set = {};
    aa.forEach(function(token){ set[token] = true; });
    var hit = 0;
    bb.forEach(function(token){
      if(set[token]) hit += 1;
    });
    return hit / Math.max(aa.length, bb.length);
  }

  function firstAuthorKey(authors){
    var first = Array.isArray(authors) && authors.length ? String(authors[0] || '') : '';
    if(!first) return '';
    if(first.indexOf(',') >= 0) return normalizeTextForMatch(first.split(',')[0]);
    return normalizeTextForMatch(first.split(/\s+/).slice(-1).join(' '));
  }

  function normalizeWebResult(raw, options){
    options = options || {};
    var provider = asText(options.provider || raw && raw.provider || 'web', 64);
    var providerLabel = asText(options.providerLabel || raw && raw.providerLabel || provider, 64);
    return {
      id: asText(raw && raw.id, 320),
      provider: provider || 'web',
      providerLabel: providerLabel || 'Web',
      title: normalizeTitle(raw && raw.title),
      authors: normalizeAuthors(raw && raw.authors),
      year: normalizeYear(raw && raw.year),
      journal: asText(raw && raw.journal, 512),
      volume: asText(raw && raw.volume, 64),
      issue: asText(raw && raw.issue, 64),
      fp: asText(raw && raw.fp, 64),
      lp: asText(raw && raw.lp, 64),
      doi: normalizeDoi(raw && (raw.doi || raw.url)),
      url: asText(raw && raw.url, 2048),
      abstract: asText(raw && (raw.abstract || raw.snippet), 6000),
      labels: normalizeLabels(raw && raw.labels),
      reasons: Array.isArray(raw && raw.reasons) ? raw.reasons.map(function(reason){
        return asText(reason, 120);
      }).filter(Boolean) : []
    };
  }

  function refLikelyMatch(a, b){
    var aa = normalizeWebResult(a || {}, { provider: 'internal' });
    var bb = normalizeWebResult(b || {}, { provider: 'internal' });
    if(aa.doi && bb.doi) return aa.doi === bb.doi;

    var ta = normalizeTextForMatch(aa.title);
    var tb = normalizeTextForMatch(bb.title);
    if(ta && tb && ta === tb) return true;

    var aaFirst = firstAuthorKey(aa.authors);
    var bbFirst = firstAuthorKey(bb.authors);
    if(aaFirst && bbFirst && aa.year && bb.year && aa.year === bb.year){
      var ratio = overlapRatio(tokenize(aa.title), tokenize(bb.title));
      if(aaFirst === bbFirst && ratio >= 0.45) return true;
    }
    return false;
  }

  function findMatchInList(candidate, list){
    var items = Array.isArray(list) ? list : [];
    for(var i = 0; i < items.length; i += 1){
      if(refLikelyMatch(candidate, items[i])) return items[i];
    }
    return null;
  }

  function decideAddToActiveWorkspace(workspaces, activeWorkspaceId, candidate){
    var wss = Array.isArray(workspaces) ? workspaces : [];
    var activeWs = null;
    for(var i = 0; i < wss.length; i += 1){
      if(wss[i] && String(wss[i].id || '') === String(activeWorkspaceId || '')){
        activeWs = wss[i];
        break;
      }
    }
    if(!activeWs && wss.length) activeWs = wss[0];
    if(!activeWs){
      return { action: 'create_new', activeWorkspaceId: String(activeWorkspaceId || '') };
    }
    var activeMatch = findMatchInList(candidate, activeWs.lib || []);
    if(activeMatch){
      return {
        action: 'already_in_workspace',
        activeWorkspaceId: String(activeWs.id || ''),
        existingRef: activeMatch
      };
    }
    for(var wi = 0; wi < wss.length; wi += 1){
      var ws = wss[wi];
      if(!ws || String(ws.id || '') === String(activeWs.id || '')) continue;
      var match = findMatchInList(candidate, ws.lib || []);
      if(match){
        return {
          action: 'attach_existing',
          activeWorkspaceId: String(activeWs.id || ''),
          sourceWorkspaceId: String(ws.id || ''),
          existingRef: match
        };
      }
    }
    return {
      action: 'create_new',
      activeWorkspaceId: String(activeWs.id || '')
    };
  }

  function buildWorkspaceReference(webResult, options){
    options = options || {};
    var result = normalizeWebResult(webResult || {}, options);
    var createId = typeof options.createId === 'function'
      ? options.createId
      : function(){
          return 'ref_' + Date.now() + '_' + Math.random().toString(16).slice(2);
        };
    return {
      id: asText(result.id, 320) || createId(),
      title: result.title,
      authors: result.authors.slice(),
      year: result.year,
      journal: result.journal,
      volume: result.volume,
      issue: result.issue,
      fp: result.fp,
      lp: result.lp,
      doi: result.doi,
      url: result.url,
      abstract: result.abstract,
      note: '',
      labels: result.labels.slice(),
      pdfData: null,
      pdfUrl: '',
      wsId: asText(options.workspaceId, 80)
    };
  }

  function buildSeedKey(ref){
    var normalized = normalizeWebResult(ref || {}, { provider: 'seed' });
    if(normalized.doi) return 'doi:' + normalized.doi;
    var title = normalizeTextForMatch(normalized.title);
    var first = firstAuthorKey(normalized.authors);
    var year = normalized.year || '';
    return 'meta:' + [title, first, year].join('|');
  }

  function dedupeWebResults(items){
    var list = Array.isArray(items) ? items : [];
    var out = [];
    list.forEach(function(item){
      var normalized = normalizeWebResult(item || {}, { provider: item && item.provider });
      var exists = out.some(function(existing){ return refLikelyMatch(existing, normalized); });
      if(!exists) out.push(normalized);
    });
    return out;
  }

  function createCache(ttlMs){
    var ttl = Math.max(5 * 1000, Number(ttlMs) || (8 * 60 * 1000));
    var store = {};
    return {
      get: function(key){
        var k = asText(key, 320);
        if(!k) return null;
        var row = store[k];
        if(!row) return null;
        if((Date.now() - row.at) > ttl){
          delete store[k];
          return null;
        }
        return row.value;
      },
      set: function(key, value){
        var k = asText(key, 320);
        if(!k) return;
        store[k] = { at: Date.now(), value: value };
      },
      clear: function(){
        store = {};
      },
      size: function(){
        return Object.keys(store).length;
      }
    };
  }

  return {
    normalizeDoi: normalizeDoi,
    normalizeWebResult: normalizeWebResult,
    normalizeTextForMatch: normalizeTextForMatch,
    tokenize: tokenize,
    overlapRatio: overlapRatio,
    refLikelyMatch: refLikelyMatch,
    findMatchInList: findMatchInList,
    decideAddToActiveWorkspace: decideAddToActiveWorkspace,
    buildWorkspaceReference: buildWorkspaceReference,
    buildSeedKey: buildSeedKey,
    dedupeWebResults: dedupeWebResults,
    createCache: createCache
  };
});
