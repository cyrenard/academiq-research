(function(root, factory){
  var webApi = root && root.AQWebRelatedPapers
    ? root.AQWebRelatedPapers
    : (typeof require === 'function' ? require('./web-related-papers.js') : null);
  var api = factory(webApi || {});
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQWebRelatedDiscovery = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(webApi){
  function asText(value, maxLen){
    var text = String(value == null ? '' : value).trim();
    if(maxLen && text.length > maxLen) return text.slice(0, maxLen);
    return text;
  }

  function tokenize(value){
    if(webApi && typeof webApi.tokenize === 'function'){
      return webApi.tokenize(value);
    }
    return asText(value, 4096).toLowerCase().split(/\W+/).filter(function(token){
      return token && token.length >= 3;
    });
  }

  function overlapRatio(a, b){
    if(webApi && typeof webApi.overlapRatio === 'function'){
      return webApi.overlapRatio(a, b);
    }
    var aa = Array.isArray(a) ? a : [];
    var bb = Array.isArray(b) ? b : [];
    if(!aa.length || !bb.length) return 0;
    var set = {};
    aa.forEach(function(token){ set[token] = true; });
    var hit = 0;
    bb.forEach(function(token){ if(set[token]) hit += 1; });
    return hit / Math.max(aa.length, bb.length);
  }

  function firstAuthorLastName(authors){
    if(!Array.isArray(authors) || !authors.length) return '';
    var first = String(authors[0] || '').trim();
    if(!first) return '';
    if(first.indexOf(',') >= 0) return first.split(',')[0].trim();
    var parts = first.split(/\s+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }

  function openAlexAbstractToText(invertedIndex){
    if(!invertedIndex || typeof invertedIndex !== 'object') return '';
    var tokens = [];
    Object.keys(invertedIndex).forEach(function(token){
      var positions = Array.isArray(invertedIndex[token]) ? invertedIndex[token] : [];
      positions.forEach(function(pos){
        tokens.push({ pos: Number(pos), token: token });
      });
    });
    tokens.sort(function(a, b){ return a.pos - b.pos; });
    return tokens.map(function(row){ return row.token; }).join(' ').trim();
  }

  function parseOpenAlexAuthors(work){
    var rows = Array.isArray(work && work.authorships) ? work.authorships : [];
    return rows.map(function(row){
      return asText(row && row.author && row.author.display_name, 256);
    }).filter(Boolean);
  }

  function stripHtml(value){
    return asText(value, 12000)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function mapOpenAlexWork(work, seedRef){
    if(!work || typeof work !== 'object') return null;
    var title = asText(work.display_name || work.title, 2000);
    var authors = parseOpenAlexAuthors(work);
    var year = String(work.publication_year || '').trim();
    var journal = asText(
      work && work.primary_location && work.primary_location.source && work.primary_location.source.display_name,
      512
    ) || asText(work && work.host_venue && work.host_venue.display_name, 512);
    var doi = asText(work.doi, 256).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
    var url = asText(
      work && work.primary_location && work.primary_location.landing_page_url,
      2048
    ) || asText(work.id, 2048);
    var abstractText = asText(work.abstract, 12000)
      || openAlexAbstractToText(work.abstract_inverted_index || null);
    var reasons = [];
    var seedTitleTokens = tokenize(seedRef && seedRef.title);
    var itemTitleTokens = tokenize(title);
    var seedAuthorTokens = tokenize((seedRef && seedRef.authors || []).join(' '));
    var itemAuthorTokens = tokenize(authors.join(' '));
    var titleOverlap = overlapRatio(seedTitleTokens, itemTitleTokens);
    var authorOverlap = overlapRatio(seedAuthorTokens, itemAuthorTokens);
    if(titleOverlap > 0) reasons.push('OpenAlex baslik benzerligi');
    if(authorOverlap > 0) reasons.push('OpenAlex yazar benzerligi');
    if(!reasons.length) reasons.push('OpenAlex related');
    return {
      id: asText(work.id, 320),
      provider: 'openalex',
      providerLabel: 'OpenAlex',
      title: title,
      authors: authors,
      year: year,
      journal: journal,
      doi: doi,
      url: url,
      abstract: asText(abstractText, 6000),
      reasons: reasons
    };
  }

  function mapCrossrefItem(item, seedRef){
    if(!item || typeof item !== 'object') return null;
    var titleList = Array.isArray(item.title) ? item.title : [];
    var title = asText(titleList[0], 2000);
    var authors = (Array.isArray(item.author) ? item.author : []).map(function(author){
      var family = asText(author && author.family, 120);
      var given = asText(author && author.given, 120);
      if(family && given) return family + ', ' + given;
      return family || given;
    }).filter(Boolean);
    var year = '';
    var dateParts = item && (item.issued || item.published_print || item.published_online);
    if(dateParts && Array.isArray(dateParts['date-parts']) && Array.isArray(dateParts['date-parts'][0])){
      year = String(dateParts['date-parts'][0][0] || '').trim();
    }
    var journal = asText((Array.isArray(item['container-title']) ? item['container-title'][0] : item['container-title']), 512);
    var url = asText(item.URL, 2048);
    var doi = asText(item.DOI, 256);
    var abstractText = stripHtml(item.abstract);
    var reasons = [];
    var seedTitleTokens = tokenize(seedRef && seedRef.title);
    var itemTitleTokens = tokenize(title);
    if(overlapRatio(seedTitleTokens, itemTitleTokens) > 0){
      reasons.push('Crossref baslik benzerligi');
    } else {
      reasons.push('Crossref oneri');
    }
    return {
      id: asText(item.DOI || item.URL || title, 320),
      provider: 'crossref',
      providerLabel: 'Crossref',
      title: title,
      authors: authors,
      year: year,
      journal: journal,
      doi: doi,
      url: url,
      abstract: asText(abstractText, 6000),
      reasons: reasons
    };
  }

  function buildSearchQuery(seedRef){
    var ref = webApi && typeof webApi.normalizeWebResult === 'function'
      ? webApi.normalizeWebResult(seedRef || {}, { provider: 'seed' })
      : (seedRef || {});
    var title = asText(ref.title || '', 800);
    var titleTokens = tokenize(title).slice(0, 8);
    var firstAuthor = firstAuthorLastName(ref.authors || []);
    var parts = titleTokens.slice();
    if(firstAuthor) parts.push(firstAuthor);
    if(ref.year) parts.push(String(ref.year));
    return parts.join(' ').trim();
  }

  function toOpenAlexWorkApiURL(rawId){
    var oid = asText(rawId, 512);
    if(!oid) return '';
    var id = oid;
    if(/^https?:\/\/api\.openalex\.org\/works\//i.test(oid)){
      return oid;
    }
    var m = oid.match(/openalex\.org\/(W\d+)/i);
    if(m && m[1]){
      id = m[1];
    }else if(!/^W\d+$/i.test(oid)){
      id = oid;
    }
    return 'https://api.openalex.org/works/' + encodeURIComponent(id);
  }

  async function discoverFromOpenAlex(seedRef, fetchJSON, options){
    var limit = Math.max(3, Math.min(Number(options && options.limit) || 8, 12));
    var out = [];
    var seen = {};
    function push(work){
      var mapped = mapOpenAlexWork(work, seedRef);
      if(!mapped || !mapped.title) return;
      var key = (mapped.doi ? 'doi:' + mapped.doi.toLowerCase() : ('title:' + mapped.title.toLowerCase().trim()));
      if(seen[key]) return;
      seen[key] = true;
      out.push(mapped);
    }

    var doi = webApi && typeof webApi.normalizeDoi === 'function'
      ? webApi.normalizeDoi(seedRef && seedRef.doi)
      : asText(seedRef && seedRef.doi, 256);
    if(doi){
      try{
        var seedWork = await fetchJSON('https://api.openalex.org/works/doi:' + encodeURIComponent(doi) + '?mailto=academiq@example.com', {
          timeoutMs: 9000
        });
        var relatedIds = Array.isArray(seedWork && seedWork.related_works) ? seedWork.related_works : [];
        var fetchRelatedIds = relatedIds.slice(0, limit);
        var relatedRows = await Promise.all(fetchRelatedIds.map(function(relatedId){
          var oid = asText(relatedId, 200);
          if(!oid) return null;
          var workUrl = toOpenAlexWorkApiURL(oid);
          if(!workUrl) return null;
          return fetchJSON(workUrl + (workUrl.indexOf('?') >= 0 ? '&' : '?') + 'mailto=academiq@example.com', { timeoutMs: 9000 }).catch(function(){ return null; });
        }));
        relatedRows.forEach(push);
      }catch(_e){}
    }

    if(out.length < limit){
      var query = buildSearchQuery(seedRef);
      if(query){
        try{
          var searchData = await fetchJSON(
            'https://api.openalex.org/works?search=' + encodeURIComponent(query) + '&per-page=' + String(limit) + '&mailto=academiq@example.com',
            { timeoutMs: 9000 }
          );
          var rows = Array.isArray(searchData && searchData.results) ? searchData.results : [];
          rows.forEach(push);
        }catch(_e){}
      }
    }
    return out.slice(0, limit);
  }

  async function discoverFromCrossref(seedRef, fetchJSON, options){
    var limit = Math.max(3, Math.min(Number(options && options.limit) || 8, 10));
    var query = buildSearchQuery(seedRef);
    if(!query) return [];
    try{
      var data = await fetchJSON(
        'https://api.crossref.org/works?rows=' + String(limit) + '&mailto=academiq@example.com&query.bibliographic=' + encodeURIComponent(query),
        { timeoutMs: 9000 }
      );
      var items = Array.isArray(data && data.message && data.message.items) ? data.message.items : [];
      return items.map(function(item){ return mapCrossrefItem(item, seedRef); }).filter(Boolean).slice(0, limit);
    }catch(_e){
      return [];
    }
  }

  async function discoverWebRelated(seedRef, options){
    options = options || {};
    var fetchJSON = options.fetchJSON;
    if(typeof fetchJSON !== 'function') throw new Error('fetchJSON dependency is required');
    var limit = Math.max(3, Math.min(Number(options.limit) || 8, 12));
    var normalizedSeed = webApi && typeof webApi.normalizeWebResult === 'function'
      ? webApi.normalizeWebResult(seedRef || {}, { provider: 'seed', providerLabel: 'Seed' })
      : (seedRef || {});

    var openAlexRows = await discoverFromOpenAlex(normalizedSeed, fetchJSON, { limit: limit });
    var rows = openAlexRows.slice();
    if(rows.length < Math.min(4, limit)){
      var crossrefRows = await discoverFromCrossref(normalizedSeed, fetchJSON, { limit: limit });
      rows = rows.concat(crossrefRows);
    }

    var deduped = webApi && typeof webApi.dedupeWebResults === 'function'
      ? webApi.dedupeWebResults(rows)
      : rows;
    var seedDoi = webApi && typeof webApi.normalizeDoi === 'function'
      ? webApi.normalizeDoi(normalizedSeed.doi)
      : asText(normalizedSeed.doi, 256).toLowerCase();
    var filtered = deduped.filter(function(item){
      if(!item || !item.title) return false;
      if(seedDoi && item.doi && String(item.doi).toLowerCase() === seedDoi) return false;
      return true;
    }).slice(0, limit);
    return {
      items: filtered,
      fetchedAt: Date.now()
    };
  }

  return {
    openAlexAbstractToText: openAlexAbstractToText,
    mapOpenAlexWork: mapOpenAlexWork,
    mapCrossrefItem: mapCrossrefItem,
    buildSearchQuery: buildSearchQuery,
    discoverWebRelated: discoverWebRelated
  };
});
