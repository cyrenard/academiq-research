(function(root, factory){
  if(typeof module === 'object' && module.exports){
    module.exports = factory();
  }else{
    root.AQBrowserCaptureUtils = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function asText(value, maxLen){
    if(value == null) return '';
    var text = String(value).trim();
    if(!maxLen || text.length <= maxLen) return text;
    return text.slice(0, maxLen);
  }

  function safeDecodeURIComponent(value){
    var raw = String(value || '');
    try{ return decodeURIComponent(raw); }catch(_e){ return raw; }
  }

  function uniqueList(items, maxItems){
    var seen = {};
    var out = [];
    (Array.isArray(items) ? items : []).forEach(function(item){
      var value = asText(item, 2048);
      var key = value.toLowerCase();
      if(!value || seen[key]) return;
      seen[key] = true;
      out.push(value);
    });
    return typeof maxItems === 'number' ? out.slice(0, maxItems) : out;
  }

  function normalizeDoi(value){
    var doi = asText(value, 512).toLowerCase();
    if(!doi) return '';
    doi = safeDecodeURIComponent(doi)
      .replace(/^doi:\s*/i,'')
      .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'')
      .replace(/\s+/g,'')
      .replace(/[)\].,;:]+$/g,'');
    var match = doi.match(/10\.\d{4,9}\/[-._;()/:a-z0-9]+/i);
    doi = (match && match[0] ? match[0] : doi).toLowerCase();
    doi = doi
      .replace(/(?:\/|\.)(bibtex|ris|abstract|fulltext|full|pdf|xml|html|epub)$/i,'')
      .replace(/\/[a-z]$/i,'')
      .replace(/[)\].,;:]+$/g,'');
    return /^10\.\d{4,9}\//i.test(doi) ? doi : '';
  }

  function normalizeUrl(value){
    var raw = asText(value, 4096);
    if(!/^https?:\/\//i.test(raw)) return '';
    try{
      var parsed = new URL(raw);
      parsed.hash = '';
      return parsed.toString();
    }catch(_e){
      return raw;
    }
  }

  function findDoiInText(text){
    var hay = safeDecodeURIComponent(String(text || ''));
    var match = hay.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
    return normalizeDoi(match && match[0] ? match[0] : '');
  }

  function findMetaContent(metaEntries, names){
    var wanted = (Array.isArray(names) ? names : [names]).map(function(item){ return String(item || '').toLowerCase(); });
    for(var i = 0; i < metaEntries.length; i += 1){
      var entry = metaEntries[i] || {};
      var key = String(entry.name || entry.property || '').toLowerCase();
      if(wanted.indexOf(key) >= 0 && entry.content) return String(entry.content).trim();
    }
    return '';
  }

  function findMetaEntry(metaEntries, names){
    var wanted = (Array.isArray(names) ? names : [names]).map(function(item){ return String(item || '').toLowerCase(); });
    for(var i = 0; i < metaEntries.length; i += 1){
      var entry = metaEntries[i] || {};
      var key = String(entry.name || entry.property || '').toLowerCase();
      if(wanted.indexOf(key) >= 0 && entry.content){
        return {
          key: key,
          content: String(entry.content).trim()
        };
      }
    }
    return null;
  }

  function findMetaContents(metaEntries, names){
    var wanted = (Array.isArray(names) ? names : [names]).map(function(item){ return String(item || '').toLowerCase(); });
    return metaEntries
      .filter(function(entry){
        var key = String((entry && (entry.name || entry.property)) || '').toLowerCase();
        return wanted.indexOf(key) >= 0 && entry && entry.content;
      })
      .map(function(entry){ return String(entry.content).trim(); })
      .filter(Boolean);
  }

  function sourceLabel(source){
    if(source === 'citation_meta') return 'citation meta';
    if(source === 'scholarly_meta') return 'scholarly meta';
    if(source === 'jsonld') return 'JSON-LD';
    if(source === 'doi_url') return 'DOI URL';
    if(source === 'canonical_url') return 'canonical URL';
    if(source === 'page_url') return 'sayfa URL';
    if(source === 'body_text') return 'sayfa metni';
    if(source === 'document_title') return 'sekme basligi';
    if(source === 'page_link') return 'sayfa linki';
    if(source === 'button_link') return 'PDF butonu';
    if(source === 'pdf_page') return 'PDF sayfasi';
    if(source === 'embed_src') return 'gomme kaynak';
    if(source === 'og_meta') return 'Open Graph meta';
    if(source === 'dc_meta') return 'Dublin Core meta';
    if(source === 'dom') return 'sayfa alani';
    return 'algilanamadi';
  }

  function confidenceLabel(confidence){
    if(confidence === 'strong' || confidence === 'high') return 'Guclu';
    if(confidence === 'medium') return 'Orta';
    if(confidence === 'weak' || confidence === 'low') return 'Zayif';
    return 'Yok';
  }

  function withConfidence(score){
    if(score >= 300) return 'strong';
    if(score >= 180) return 'medium';
    if(score >= 80) return 'weak';
    return 'none';
  }

  function buildCandidate(value, options){
    var opts = options && typeof options === 'object' ? options : {};
    var text = opts.normalizer ? opts.normalizer(value) : asText(value, 4096);
    if(!text) return null;
    var score = Number(opts.score || 0);
    return {
      value: text,
      source: String(opts.source || 'none'),
      sourceField: asText(opts.sourceField, 128),
      confidence: withConfidence(score),
      score: score,
      found: true,
      context: asText(opts.context, 240)
    };
  }

  function detection(value, source, confidence){
    var score = confidence === 'strong' ? 320 : (confidence === 'medium' ? 210 : (confidence === 'weak' ? 100 : 0));
    var item = buildCandidate(value, { source: source, score: score });
    if(item) return item;
    return { value: '', source: 'none', sourceField: '', confidence: 'none', score: 0, found: false, context: '' };
  }

  function describeDetection(entry, emptyLabel){
    var item = entry && typeof entry === 'object' ? entry : {};
    if(!item.found || !item.value){
      return emptyLabel || 'Bulunamadi';
    }
    var detail = item.sourceField ? (' (' + item.sourceField + ')') : '';
    return confidenceLabel(item.confidence) + ' - ' + sourceLabel(item.source) + detail;
  }

  function normalizeJsonLdValue(value){
    if(value == null) return '';
    if(typeof value === 'string') return value;
    if(typeof value === 'number') return String(value);
    if(typeof value === 'object'){
      return asText(value['@value'] || value.name || value.headline || value.url || value.contentUrl || value.identifier, 4096);
    }
    return '';
  }

  function parseJsonLdBlocks(jsonLdTexts){
    var nodes = [];
    function visit(value){
      if(!value) return;
      if(Array.isArray(value)){
        value.forEach(visit);
        return;
      }
      if(typeof value !== 'object') return;
      nodes.push(value);
      if(Array.isArray(value['@graph'])) visit(value['@graph']);
      if(value.mainEntity) visit(value.mainEntity);
      if(value.isPartOf) visit(value.isPartOf);
    }
    (Array.isArray(jsonLdTexts) ? jsonLdTexts : []).forEach(function(text){
      try{
        visit(JSON.parse(String(text || '')));
      }catch(_e){}
    });
    return nodes;
  }

  function pickJsonLdAuthors(node){
    var authors = [];
    function readAuthor(item){
      if(!item) return;
      if(Array.isArray(item)){
        item.forEach(readAuthor);
        return;
      }
      if(typeof item === 'string'){
        authors.push(item);
        return;
      }
      if(typeof item === 'object'){
        if(item.name) authors.push(item.name);
        if(item.familyName || item.givenName) authors.push((item.givenName || '') + ' ' + (item.familyName || ''));
        if(item.creator) readAuthor(item.creator);
        if(item.author) readAuthor(item.author);
        if(item.contributor) readAuthor(item.contributor);
        if(item.editor) readAuthor(item.editor);
      }
    }
    readAuthor(node && (node.author || node.creator || node.contributor || node.editor));
    return uniqueList(authors.map(normalizeAuthorName).filter(Boolean), 12);
  }

  function normalizeAuthorName(value){
    var text = asText(value, 256)
      .replace(/\[[^\]]{1,16}\]/g, ' ')
      .replace(/\([^)]{1,20}\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    text = text.replace(/^(?:by|authors?|yazar(?:lar)?|author information)\s*(?:[:\-]\s*)?/i, '').trim();
    text = text.replace(/[,*;|]+$/g, '').trim();
    if(!text || text.length < 2) return '';
    if(/\b(?:orcid|affiliation|department|university|email|corresponding)\b/i.test(text)) return '';
    if(/^\d+$/.test(text)) return '';
    return text;
  }

  function splitPossibleAuthorList(value){
    var text = asText(value, 1024);
    if(!text) return [];
    var normalized = text.replace(/\s+/g, ' ').trim();
    if(!normalized) return [];
    var separators = /;|\u2022|\||\n|\t|(?:\s+and\s+)|(?:\s*&\s*)/i;
    var parts = separators.test(normalized)
      ? normalized.split(/;|\u2022|\||\n|\t|(?:\s+and\s+)|(?:\s*&\s*)/i)
      : [normalized];
    return uniqueList(parts.map(normalizeAuthorName).filter(Boolean), 12);
  }

  function extractMetaAuthorCandidates(metaEntries){
    var rawList = findMetaContents(metaEntries, [
      'citation_author',
      'citation_authors',
      'dc.creator',
      'dc.creator.personalname',
      'dc.contributor',
      'author',
      'article:author',
      'parsely-author',
      'rft.au'
    ]);
    var authors = [];
    rawList.forEach(function(item){
      splitPossibleAuthorList(item).forEach(function(name){ authors.push(name); });
    });
    return uniqueList(authors, 12);
  }

  function extractBodyAuthorCandidates(bodyText){
    var text = String(bodyText || '');
    if(!text) return [];
    var compact = text.replace(/\s+/g, ' ');
    var byline = compact.match(/\b(?:by|authors?)\s*[:\-]?\s*([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'\-.\s]{2,140})/i);
    if(!byline || !byline[1]) return [];
    return splitPossibleAuthorList(byline[1]).slice(0, 6);
  }

  function scoreBodyDoiContext(snippet, index){
    var score = 95;
    var lower = String(snippet || '').toLowerCase();
    if(/doi|article|published|journal|citation/.test(lower)) score += 30;
    if(/abstract|references|bibliography|cited by/.test(lower)) score -= 25;
    if(index < 6000) score += 15;
    return score;
  }

  function collectBodyDoiCandidates(bodyText){
    var text = String(bodyText || '');
    if(!text) return [];
    var regex = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/ig;
    var match;
    var out = [];
    var seen = {};
    while((match = regex.exec(text)) && out.length < 12){
      var doi = normalizeDoi(match[0]);
      if(!doi || seen[doi]) continue;
      seen[doi] = true;
      var start = Math.max(0, match.index - 90);
      var end = Math.min(text.length, match.index + doi.length + 90);
      var snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
      out.push(buildCandidate(doi, {
        source: 'body_text',
        score: scoreBodyDoiContext(snippet, match.index),
        context: snippet
      }));
    }
    return out.filter(Boolean);
  }

  function dedupeCandidates(candidates, normalizer){
    var map = {};
    (Array.isArray(candidates) ? candidates : []).forEach(function(item){
      if(!item || !item.value) return;
      var key = normalizer ? normalizer(item.value) : item.value;
      if(!key) return;
      if(!map[key] || Number(item.score || 0) > Number(map[key].score || 0)){
        map[key] = item;
      }
    });
    return Object.keys(map).map(function(key){ return map[key]; });
  }

  function resolveBestCandidate(candidates, normalizer){
    var list = dedupeCandidates(candidates, normalizer).sort(function(left, right){
      return Number(right.score || 0) - Number(left.score || 0);
    });
    if(!list.length){
      return { value: '', source: 'none', sourceField: '', confidence: 'none', score: 0, found: false, context: '', ambiguous: false };
    }
    var winner = Object.assign({}, list[0]);
    winner.ambiguous = !!(list[1] && Number(list[1].score || 0) === Number(winner.score || 0) && String(list[1].value || '') !== String(winner.value || ''));
    winner.candidates = list;
    return winner;
  }

  function firstText(values){
    for(var i = 0; i < values.length; i += 1){
      var text = asText(values[i], 2048);
      if(text) return text;
    }
    return '';
  }

  function inferPdfUrlFromPageUrl(pageUrl, doi){
    var raw = String(pageUrl || '').trim();
    if(!/^https?:\/\//i.test(raw)) return '';
    try{
      var parsed = new URL(raw);
      var host = String(parsed.hostname || '').toLowerCase();
      var pathname = safeDecodeURIComponent(String(parsed.pathname || ''));
      var normalizedDoi = normalizeDoi(doi || pageUrl);
      if(/(^|\.)tandfonline\.com$/i.test(host) && /^\/doi\/(?:full|abs|epdf)\//i.test(pathname)){
        return parsed.origin + pathname.replace(/^\/doi\/(?:full|abs|epdf)\//i, '/doi/pdf/') + '?needAccess=true';
      }
      if(/(^|\.)tandfonline\.com$/i.test(host) && normalizedDoi){
        return parsed.origin + '/doi/pdf/' + normalizedDoi + '?needAccess=true';
      }
    }catch(_e){}
    return '';
  }

  function extractDoiCandidates(input){
    var source = input && typeof input === 'object' ? input : {};
    var metaEntries = Array.isArray(source.metaEntries) ? source.metaEntries : [];
    var bodyText = String(source.bodyText || '');
    var pageUrl = String(source.pageUrl || '');
    var canonicalUrl = String(source.canonicalUrl || '');
    var jsonLdNodes = parseJsonLdBlocks(source.jsonLdTexts);
    var candidates = [];

    var metaFields = [
      { names: ['citation_doi', 'bepress_citation_doi'], source: 'citation_meta', score: 340 },
      { names: ['prism.doi'], source: 'scholarly_meta', score: 330 },
      { names: ['dc.identifier.doi', 'dc.identifier'], source: 'dc_meta', score: 315 }
    ];
    metaFields.forEach(function(field){
      var entry = findMetaEntry(metaEntries, field.names);
      var doi = normalizeDoi(entry && entry.content);
      if(doi){
        candidates.push(buildCandidate(doi, {
          source: field.source,
          sourceField: entry.key,
          score: field.score
        }));
      }
    });

    jsonLdNodes.forEach(function(node){
      var doi = normalizeDoi(node.doi || node.identifier || '');
      var typeName = asText(node['@type'], 128);
      if(doi){
        candidates.push(buildCandidate(doi, {
          source: 'jsonld',
          sourceField: typeName || 'jsonld',
          score: /scholarlyarticle|article/i.test(typeName) ? 335 : 300
        }));
      }
      if(Array.isArray(node.identifier)){
        node.identifier.forEach(function(identifier){
          var resolved = normalizeDoi(normalizeJsonLdValue(identifier));
          if(resolved){
            candidates.push(buildCandidate(resolved, {
              source: 'jsonld',
              sourceField: typeName || 'jsonld.identifier',
              score: 300
            }));
          }
        });
      }
    });

    var urlCandidates = [
      { value: findDoiInText(pageUrl), source: 'doi_url', score: /^https?:\/\/(?:dx\.)?doi\.org\//i.test(pageUrl) ? 320 : 215, sourceField: 'current_url' },
      { value: findDoiInText(canonicalUrl), source: 'canonical_url', score: canonicalUrl && /^https?:\/\/(?:dx\.)?doi\.org\//i.test(canonicalUrl) ? 310 : 205, sourceField: 'canonical_url' }
    ];
    urlCandidates.forEach(function(item){
      if(item.value){
        candidates.push(buildCandidate(item.value, item));
      }
    });

    collectBodyDoiCandidates(bodyText).forEach(function(item){ candidates.push(item); });
    return resolveBestCandidate(candidates, normalizeDoi);
  }

  function extractPdfCandidates(input){
    var source = input && typeof input === 'object' ? input : {};
    var metaEntries = Array.isArray(source.metaEntries) ? source.metaEntries : [];
    var anchorEntries = Array.isArray(source.anchorEntries) ? source.anchorEntries : [];
    var embedUrls = Array.isArray(source.embedUrls) ? source.embedUrls : [];
    var pageUrl = String(source.pageUrl || '');
    var canonicalUrl = String(source.canonicalUrl || '');
    var jsonLdNodes = parseJsonLdBlocks(source.jsonLdTexts);
    var doiDetection = source.doiDetection && source.doiDetection.value ? source.doiDetection.value : '';
    var candidates = [];

    if(/\.pdf(?:$|[?#])/i.test(pageUrl)){
      candidates.push(buildCandidate(pageUrl, {
        source: 'pdf_page',
        sourceField: 'current_url',
        score: 340,
        normalizer: normalizeUrl
      }));
    }

    var directMatch = findMetaEntry(metaEntries, ['citation_pdf_url', 'pdf_url', 'eprints.document_url', 'wkhealth_pdf_url']);
    var direct = directMatch ? normalizeUrl(directMatch.content) : '';
    if(direct){
      candidates.push(buildCandidate(direct, {
        source: 'citation_meta',
        sourceField: directMatch.key,
        score: 335,
        normalizer: normalizeUrl
      }));
    }

    jsonLdNodes.forEach(function(node){
      var typeName = asText(node['@type'], 128);
      [node.contentUrl, node.url, node.encoding && node.encoding.contentUrl].forEach(function(value){
        var url = normalizeUrl(value);
        if(url && (/\.pdf(?:$|[?#])/i.test(url) || /\/pdf(?:\/|$|\?)/i.test(url))){
          candidates.push(buildCandidate(url, {
            source: 'jsonld',
            sourceField: typeName || 'jsonld',
            score: 275,
            normalizer: normalizeUrl
          }));
        }
      });
    });

    var inferred = inferPdfUrlFromPageUrl(pageUrl, doiDetection);
    if(inferred){
      candidates.push(buildCandidate(inferred, {
        source: 'page_url',
        sourceField: 'page_pattern',
        score: 220,
        normalizer: normalizeUrl
      }));
    }

    if(canonicalUrl && /\.pdf(?:$|[?#])/i.test(canonicalUrl)){
      candidates.push(buildCandidate(canonicalUrl, {
        source: 'canonical_url',
        sourceField: 'canonical_url',
        score: 235,
        normalizer: normalizeUrl
      }));
    }

    embedUrls.forEach(function(url){
      var normalized = normalizeUrl(url);
      if(!normalized) return;
      if(/\.pdf(?:$|[?#])/i.test(normalized) || /\/pdf(?:\/|$|\?)/i.test(normalized)){
        candidates.push(buildCandidate(normalized, {
          source: 'embed_src',
          sourceField: 'embed',
          score: 210,
          normalizer: normalizeUrl
        }));
      }
    });

    anchorEntries.forEach(function(anchor){
      var href = normalizeUrl(anchor && anchor.href);
      var hay = ((anchor && anchor.text) || '') + ' ' + ((anchor && anchor.aria) || '') + ' ' + ((anchor && anchor.title) || '');
      var lowered = hay.toLowerCase();
      if(!href) return;
      if(/\.pdf(?:$|[?#])/i.test(href)){
        candidates.push(buildCandidate(href, {
          source: 'page_link',
          sourceField: 'anchor_href',
          score: /pdf|download|full text/.test(lowered) ? 245 : 215,
          normalizer: normalizeUrl,
          context: hay
        }));
        return;
      }
      if(/\/pdf(?:\/|$|\?)/i.test(href) || /\/epdf(?:\/|$|\?)/i.test(href) || /download.*pdf/i.test(href) || /view.*pdf/i.test(lowered) || /full text pdf|article pdf|download pdf|epdf/.test(lowered)){
        candidates.push(buildCandidate(href, {
          source: /pdf|download|view/.test(lowered) ? 'button_link' : 'page_link',
          sourceField: 'anchor_hint',
          score: /pdf|download|view/.test(lowered) ? 230 : 190,
          normalizer: normalizeUrl,
          context: hay
        }));
      }
    });

    return resolveBestCandidate(candidates, normalizeUrl);
  }

  function extractTitleDetection(input){
    var source = input && typeof input === 'object' ? input : {};
    var metaEntries = Array.isArray(source.metaEntries) ? source.metaEntries : [];
    var jsonLdNodes = parseJsonLdBlocks(source.jsonLdTexts);
    var domTitle = asText(source.domTitle, 2048);
    var docTitle = asText(source.docTitle, 2048);
    var candidates = [];

    var scholarly = findMetaEntry(metaEntries, ['citation_title', 'dc.title']);
    if(scholarly && scholarly.content){
      candidates.push(buildCandidate(scholarly.content, {
        source: scholarly.key === 'dc.title' ? 'dc_meta' : 'scholarly_meta',
        sourceField: scholarly.key,
        score: 330
      }));
    }
    var social = findMetaEntry(metaEntries, ['og:title', 'twitter:title']);
    if(social && social.content){
      candidates.push(buildCandidate(social.content, {
        source: 'og_meta',
        sourceField: social.key,
        score: 220
      }));
    }
    jsonLdNodes.forEach(function(node){
      var typeName = asText(node['@type'], 128);
      var title = firstText([node.headline, node.name]);
      if(title){
        candidates.push(buildCandidate(title, {
          source: 'jsonld',
          sourceField: typeName || 'jsonld',
          score: /scholarlyarticle|article/i.test(typeName) ? 315 : 260
        }));
      }
    });
    if(domTitle){
      candidates.push(buildCandidate(domTitle, {
        source: 'dom',
        sourceField: 'headline',
        score: 200
      }));
    }
    if(docTitle){
      candidates.push(buildCandidate(docTitle, {
        source: 'document_title',
        sourceField: 'document.title',
        score: 110
      }));
    }
    return resolveBestCandidate(candidates, function(value){ return asText(value, 2048).toLowerCase(); });
  }

  function extractAuthors(input){
    var source = input && typeof input === 'object' ? input : {};
    var metaEntries = Array.isArray(source.metaEntries) ? source.metaEntries : [];
    var jsonLdNodes = parseJsonLdBlocks(source.jsonLdTexts);
    var domAuthors = Array.isArray(source.domAuthors) ? source.domAuthors : [];
    var publisherAuthors = Array.isArray(source.publisherAuthors) ? source.publisherAuthors : [];
    var publisherFamily = asText(source.publisherFamily, 64).toLowerCase();
    var bodyText = String(source.bodyText || '');
    var candidates = [];

    var metaAuthors = extractMetaAuthorCandidates(metaEntries);
    if(metaAuthors.length){
      candidates.push(buildCandidate(metaAuthors.join('; '), {
        source: 'scholarly_meta',
        sourceField: 'meta_author',
        score: 340
      }));
    }

    for(var i = 0; i < jsonLdNodes.length; i += 1){
      var jsonLdAuthors = pickJsonLdAuthors(jsonLdNodes[i]);
      if(!jsonLdAuthors.length) continue;
      var item = buildCandidate(jsonLdAuthors.join('; '), {
        source: 'jsonld',
        sourceField: asText(jsonLdNodes[i]['@type'], 128) || 'jsonld',
        score: 305
      });
      if(item){
        item.authorList = jsonLdAuthors.slice();
        candidates.push(item);
      }
    }

    var publisherList = [];
    publisherAuthors.forEach(function(item){
      splitPossibleAuthorList(item).forEach(function(name){ publisherList.push(name); });
    });
    publisherList = uniqueList(publisherList, 12);
    if(publisherList.length){
      candidates.push(buildCandidate(publisherList.join('; '), {
        // Keep source as `dom` for bridge compatibility and encode publisher in sourceField.
        source: 'dom',
        sourceField: publisherFamily ? ('publisher:' + publisherFamily) : 'publisher_author_block',
        score: 325
      }));
    }

    var domList = [];
    domAuthors.forEach(function(item){
      splitPossibleAuthorList(item).forEach(function(name){ domList.push(name); });
    });
    domList = uniqueList(domList, 12);
    if(domList.length){
      candidates.push(buildCandidate(domList.join('; '), {
        source: 'dom',
        sourceField: 'author_block',
        score: 245
      }));
    }

    var bodyAuthors = extractBodyAuthorCandidates(bodyText);
    if(bodyAuthors.length){
      candidates.push(buildCandidate(bodyAuthors.join('; '), {
        source: 'body_text',
        sourceField: 'byline_pattern',
        score: 140
      }));
    }

    var result = resolveBestCandidate(candidates, function(value){
      return asText(value, 2048).toLowerCase();
    });
    if(result && result.found){
      result.authorList = uniqueList(String(result.value || '').split(';').map(function(name){
        return normalizeAuthorName(name);
      }).filter(Boolean), 12);
      return result;
    }
    return detection('', 'none', 'none');
  }

  function extractJournalDetection(input){
    var source = input && typeof input === 'object' ? input : {};
    var metaEntries = Array.isArray(source.metaEntries) ? source.metaEntries : [];
    var jsonLdNodes = parseJsonLdBlocks(source.jsonLdTexts);
    var scholarly = findMetaEntry(metaEntries, ['citation_journal_title', 'citation_conference_title', 'prism.publicationname']);
    if(scholarly && scholarly.content){
      return buildCandidate(scholarly.content, {
        source: 'scholarly_meta',
        sourceField: scholarly.key,
        score: 325
      });
    }
    var dc = findMetaEntry(metaEntries, ['dc.source']);
    if(dc && dc.content){
      return buildCandidate(dc.content, {
        source: 'dc_meta',
        sourceField: dc.key,
        score: 250
      });
    }
    for(var i = 0; i < jsonLdNodes.length; i += 1){
      var node = jsonLdNodes[i];
      var title = firstText([
        node.isPartOf && node.isPartOf.name,
        node.publication && node.publication.name,
        node.publisher && node.publisher.name
      ]);
      if(title){
        return buildCandidate(title, {
          source: 'jsonld',
          sourceField: asText(node['@type'], 128) || 'jsonld',
          score: 240
        });
      }
    }
    var og = findMetaEntry(metaEntries, ['og:site_name']);
    if(og && og.content){
      return buildCandidate(og.content, {
        source: 'og_meta',
        sourceField: og.key,
        score: 140
      });
    }
    return detection('', 'none', 'none');
  }

  function extractYearDetection(input){
    var source = input && typeof input === 'object' ? input : {};
    var metaEntries = Array.isArray(source.metaEntries) ? source.metaEntries : [];
    var bodyText = String(source.bodyText || '');
    var jsonLdNodes = parseJsonLdBlocks(source.jsonLdTexts);
    var metaMatch = findMetaEntry(metaEntries, ['citation_publication_date', 'citation_date', 'dc.date', 'prism.publicationdate']);
    var raw = metaMatch && metaMatch.content ? metaMatch.content : '';
    var match = String(raw || '').match(/\b(19|20)\d{2}\b/);
    if(match && match[0]){
      return buildCandidate(match[0], {
        source: metaMatch.key === 'dc.date' ? 'dc_meta' : 'scholarly_meta',
        sourceField: metaMatch.key,
        score: 315
      });
    }
    for(var i = 0; i < jsonLdNodes.length; i += 1){
      var yearMatch = String(firstText([jsonLdNodes[i].datePublished, jsonLdNodes[i].dateCreated, jsonLdNodes[i].dateModified]) || '').match(/\b(19|20)\d{2}\b/);
      if(yearMatch && yearMatch[0]){
        return buildCandidate(yearMatch[0], {
          source: 'jsonld',
          sourceField: asText(jsonLdNodes[i]['@type'], 128) || 'jsonld',
          score: 290
        });
      }
    }
    var bodyMatch = String(bodyText || '').match(/\b(19|20)\d{2}\b/);
    if(bodyMatch && bodyMatch[0]){
      return buildCandidate(bodyMatch[0], {
        source: 'body_text',
        sourceField: 'body_year',
        score: 95
      });
    }
    return detection('', 'none', 'none');
  }

  function extractAbstractDetection(input){
    var source = input && typeof input === 'object' ? input : {};
    var metaEntries = Array.isArray(source.metaEntries) ? source.metaEntries : [];
    var domAbstract = asText(source.domAbstract, 12000);
    var jsonLdNodes = parseJsonLdBlocks(source.jsonLdTexts);
    var abstractMeta = findMetaContent(metaEntries, ['description', 'dc.description', 'citation_abstract', 'og:description', 'twitter:description']);
    if(abstractMeta){
      return buildCandidate(abstractMeta, {
        source: 'scholarly_meta',
        sourceField: 'abstract_meta',
        score: 230
      });
    }
    for(var i = 0; i < jsonLdNodes.length; i += 1){
      var abstractText = firstText([jsonLdNodes[i].description, jsonLdNodes[i].abstract]);
      if(abstractText){
        return buildCandidate(abstractText, {
          source: 'jsonld',
          sourceField: asText(jsonLdNodes[i]['@type'], 128) || 'jsonld',
          score: 210
        });
      }
    }
    if(domAbstract){
      return buildCandidate(domAbstract, {
        source: 'dom',
        sourceField: 'abstract_block',
        score: 180
      });
    }
    return detection('', 'none', 'none');
  }

  function detectPageMetadata(input){
    var title = extractTitleDetection(input);
    var doi = extractDoiCandidates(input);
    var pdfUrl = extractPdfCandidates(Object.assign({}, input, { doiDetection: doi }));
    var authors = extractAuthors(input);
    var journal = extractJournalDetection(input);
    var year = extractYearDetection(input);
    var abstract = extractAbstractDetection(input);
    return {
      doi: doi,
      pdfUrl: pdfUrl,
      title: title,
      authors: authors,
      journal: journal,
      year: year,
      abstract: abstract
    };
  }

  function detectDoi(metaEntries, bodyText, pageUrl){
    return detectDoiDetailed(metaEntries, bodyText, pageUrl).value;
  }

  function detectDoiDetailed(metaEntries, bodyText, pageUrl){
    return extractDoiCandidates({
      metaEntries: metaEntries,
      bodyText: bodyText,
      pageUrl: pageUrl,
      canonicalUrl: '',
      jsonLdTexts: []
    });
  }

  function detectPdfUrl(metaEntries, anchors, pageUrl){
    return detectPdfUrlDetailed(metaEntries, anchors, pageUrl).value;
  }

  function detectPdfUrlDetailed(metaEntries, anchors, pageUrl){
    var structuredAnchors = (Array.isArray(anchors) ? anchors : []).map(function(item){
      return typeof item === 'string'
        ? { href: item, text: '', aria: '', title: '' }
        : {
            href: item && item.href || '',
            text: item && item.text || '',
            aria: item && item.aria || '',
            title: item && item.title || ''
          };
    });
    return extractPdfCandidates({
      metaEntries: metaEntries,
      anchorEntries: structuredAnchors,
      embedUrls: [],
      pageUrl: pageUrl,
      canonicalUrl: '',
      jsonLdTexts: [],
      doiDetection: extractDoiCandidates({
        metaEntries: metaEntries,
        bodyText: '',
        pageUrl: pageUrl,
        canonicalUrl: '',
        jsonLdTexts: []
      })
    });
  }

  function detectTitle(metaEntries, docTitle){
    return detectTitleDetailed(metaEntries, docTitle).value;
  }

  function detectTitleDetailed(metaEntries, docTitle){
    return extractTitleDetection({
      metaEntries: metaEntries,
      jsonLdTexts: [],
      domTitle: '',
      docTitle: docTitle
    });
  }

  function detectAuthors(metaEntries){
    var details = detectAuthorsDetailed(metaEntries);
    return details.found ? uniqueList(String(details.value || '').split(';').map(function(item){ return item.trim(); }), 12) : [];
  }

  function detectAuthorsDetailed(metaEntries){
    return extractAuthors({ metaEntries: metaEntries, jsonLdTexts: [] });
  }

  function detectJournal(metaEntries){
    return detectJournalDetailed(metaEntries).value;
  }

  function detectJournalDetailed(metaEntries){
    return extractJournalDetection({ metaEntries: metaEntries, jsonLdTexts: [] });
  }

  function detectYear(metaEntries, bodyText){
    return detectYearDetailed(metaEntries, bodyText).value;
  }

  function detectYearDetailed(metaEntries, bodyText){
    return extractYearDetection({ metaEntries: metaEntries, bodyText: bodyText, jsonLdTexts: [] });
  }

  return {
    normalizeDoi: normalizeDoi,
    normalizeUrl: normalizeUrl,
    findDoiInText: findDoiInText,
    findMetaContent: findMetaContent,
    findMetaEntry: findMetaEntry,
    findMetaContents: findMetaContents,
    parseJsonLdBlocks: parseJsonLdBlocks,
    describeDetection: describeDetection,
    sourceLabel: sourceLabel,
    confidenceLabel: confidenceLabel,
    inferPdfUrlFromPageUrl: inferPdfUrlFromPageUrl,
    collectBodyDoiCandidates: collectBodyDoiCandidates,
    resolveBestCandidate: resolveBestCandidate,
    extractDoiCandidates: extractDoiCandidates,
    extractPdfCandidates: extractPdfCandidates,
    extractTitleDetection: extractTitleDetection,
    extractAuthors: extractAuthors,
    extractJournalDetection: extractJournalDetection,
    extractYearDetection: extractYearDetection,
    extractAbstractDetection: extractAbstractDetection,
    detectPageMetadata: detectPageMetadata,
    detectDoi: detectDoi,
    detectDoiDetailed: detectDoiDetailed,
    detectPdfUrl: detectPdfUrl,
    detectPdfUrlDetailed: detectPdfUrlDetailed,
    detectTitle: detectTitle,
    detectTitleDetailed: detectTitleDetailed,
    detectAuthors: detectAuthors,
    detectAuthorsDetailed: detectAuthorsDetailed,
    detectJournal: detectJournal,
    detectJournalDetailed: detectJournalDetailed,
    detectYear: detectYear,
    detectYearDetailed: detectYearDetailed,
    detection: detection
  };
});
