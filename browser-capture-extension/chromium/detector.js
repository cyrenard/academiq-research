(function(){
  if(typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;

  function collectMetaEntries(){
    return Array.prototype.slice.call(document.querySelectorAll('meta')).map(function(meta){
      return {
        name: meta.getAttribute('name') || '',
        property: meta.getAttribute('property') || '',
        content: meta.getAttribute('content') || ''
      };
    });
  }

  function collectAnchors(){
    return Array.prototype.slice.call(document.querySelectorAll('a[href]')).slice(0, 200).map(function(anchor){
      return anchor.href || '';
    }).filter(Boolean);
  }

  function collectJsonLdTexts(){
    return Array.prototype.slice.call(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 24).map(function(node){
      return node && node.textContent ? String(node.textContent) : '';
    }).filter(Boolean);
  }

  function collectEmbedUrls(){
    return Array.prototype.slice.call(document.querySelectorAll('iframe[src],embed[src],object[data]')).slice(0, 40).map(function(node){
      return node.getAttribute('src') || node.getAttribute('data') || '';
    }).filter(Boolean);
  }

  function canonicalUrl(){
    try{
      var link = document.querySelector('link[rel="canonical"][href]');
      return link ? String(link.href || '').trim() : '';
    }catch(_e){
      return '';
    }
  }

  function findMetaContent(metaEntries, names){
    var wanted = (Array.isArray(names) ? names : [names]).map(function(item){
      return String(item || '').toLowerCase();
    });
    for(var i = 0; i < metaEntries.length; i += 1){
      var entry = metaEntries[i] || {};
      var key = String(entry.name || entry.property || '').toLowerCase();
      if(wanted.indexOf(key) >= 0 && entry.content){
        return String(entry.content || '').trim();
      }
    }
    return '';
  }

  function hasJsonLdType(jsonLdTexts, expected){
    var wanted = String(expected || '').toLowerCase();
    if(!wanted) return false;
    for(var i = 0; i < jsonLdTexts.length; i += 1){
      try{
        var payload = JSON.parse(String(jsonLdTexts[i] || '{}'));
        var stack = [payload];
        while(stack.length){
          var node = stack.pop();
          if(!node) continue;
          if(Array.isArray(node)){
            node.forEach(function(item){ stack.push(item); });
            continue;
          }
          if(typeof node !== 'object') continue;
          var type = node['@type'];
          var types = Array.isArray(type) ? type : [type];
          for(var ti = 0; ti < types.length; ti += 1){
            if(String(types[ti] || '').toLowerCase() === wanted) return true;
          }
          if(Array.isArray(node['@graph'])) stack.push(node['@graph']);
          if(node.mainEntity) stack.push(node.mainEntity);
        }
      }catch(_e){}
    }
    return false;
  }

  function parseJsonLdNodes(jsonLdTexts, utils){
    if(utils && typeof utils.parseJsonLdBlocks === 'function'){
      return utils.parseJsonLdBlocks(jsonLdTexts || []);
    }
    var out = [];
    (Array.isArray(jsonLdTexts) ? jsonLdTexts : []).forEach(function(text){
      try{
        var payload = JSON.parse(String(text || ''));
        if(Array.isArray(payload)) out = out.concat(payload);
        else if(payload && Array.isArray(payload['@graph'])) out = out.concat(payload['@graph']);
        else if(payload) out.push(payload);
      }catch(_e){}
    });
    return out.filter(function(node){ return node && typeof node === 'object'; });
  }

  function jsonLdHasType(nodes, wanted){
    var target = String(wanted || '').toLowerCase();
    if(!target) return false;
    return (Array.isArray(nodes) ? nodes : []).some(function(node){
      var raw = node && node['@type'];
      var types = Array.isArray(raw) ? raw : [raw];
      return types.some(function(t){ return String(t || '').toLowerCase() === target; });
    });
  }

  function pickJsonLdValue(nodes, keys){
    var list = Array.isArray(keys) ? keys : [keys];
    for(var i = 0; i < (nodes || []).length; i += 1){
      var node = nodes[i] || {};
      for(var k = 0; k < list.length; k += 1){
        var key = list[k];
        if(node && node[key]){
          var val = node[key];
          if(typeof val === 'string') return val;
          if(val && typeof val === 'object' && val.name) return val.name;
        }
      }
    }
    return '';
  }

  function pickJsonLdAuthors(nodes){
    var out = [];
    (Array.isArray(nodes) ? nodes : []).forEach(function(node){
      if(!node || !node.author) return;
      var authors = Array.isArray(node.author) ? node.author : [node.author];
      authors.forEach(function(author){
        if(!author) return;
        if(typeof author === 'string') out.push(author);
        else if(author.name) out.push(author.name);
      });
    });
    return out.filter(Boolean).slice(0, 12);
  }

  function pickJsonLdPublisher(nodes){
    return pickJsonLdValue(nodes, ['publisher', 'copyrightHolder', 'provider']);
  }

  function inferReferenceType(metaEntries, jsonLdTexts, resolved, jsonLdNodes){
    var ogType = findMetaContent(metaEntries, ['og:type']).toLowerCase();
    if(ogType === 'book' || ogType === 'books.book') return 'book';
    if(findMetaContent(metaEntries, ['citation_book_title', 'book:title', 'book:author', 'citation_isbn'])) return 'book';
    if(jsonLdHasType(jsonLdNodes, 'book')) return 'book';
    if(ogType === 'website' || ogType === 'webpage') return 'website';
    if(jsonLdHasType(jsonLdNodes, 'website') || jsonLdHasType(jsonLdNodes, 'webpage')) return 'website';
    if(resolved && resolved.doi && resolved.doi.found) return 'article';
    if(findMetaContent(metaEntries, ['citation_journal_title', 'citation_doi'])) return 'article';
    if(resolved && resolved.journal && resolved.journal.found) return 'article';
    return 'website';
  }

  function inferWebsiteName(metaEntries, pageUrl, jsonLdNodes){
    var fromMeta = findMetaContent(metaEntries, ['og:site_name', 'application-name']);
    if(fromMeta) return fromMeta;
    var fromJson = pickJsonLdValue(jsonLdNodes, ['name']);
    if(fromJson) return fromJson;
    try{
      var host = String((new URL(String(pageUrl || ''))).hostname || '');
      return host.replace(/^www\./i, '');
    }catch(_e){
      return '';
    }
  }

  function inferPublishedDate(metaEntries, jsonLdNodes){
    var value = findMetaContent(metaEntries, ['article:published_time', 'citation_publication_date', 'citation_date', 'dc.date', 'dc.date.issued', 'date', 'pubdate', 'prism.publicationdate']);
    var match = String(value || '').match(/\b(19|20)\d{2}(?:[-/.](0[1-9]|1[0-2])(?:[-/.](0[1-9]|[12]\d|3[01]))?)?/);
    if(match && match[0]) return String(match[0]).replace(/\./g, '-').replace(/\//g, '-');
    var fromJson = pickJsonLdValue(jsonLdNodes, ['datePublished', 'dateCreated', 'dateModified']);
    if(fromJson){
      var jsonMatch = String(fromJson || '').match(/\b(19|20)\d{2}(?:[-/.](0[1-9]|1[0-2])(?:[-/.](0[1-9]|[12]\d|3[01]))?)?/);
      if(jsonMatch && jsonMatch[0]) return String(jsonMatch[0]).replace(/\./g, '-').replace(/\//g, '-');
    }
    return '';
  }

  function firstText(selectors){
    var list = Array.isArray(selectors) ? selectors : [selectors];
    for(var i = 0; i < list.length; i += 1){
      var node = null;
      try{ node = document.querySelector(list[i]); }catch(_e){ node = null; }
      var text = node && node.textContent ? String(node.textContent).replace(/\s+/g, ' ').trim() : '';
      if(text) return text;
    }
    return '';
  }

  function collectAnchorCandidates(){
    return Array.prototype.slice.call(document.querySelectorAll('a[href]')).slice(0, 260).map(function(anchor){
      return {
        href: anchor.href || '',
        text: anchor.textContent ? String(anchor.textContent).replace(/\s+/g, ' ').trim() : '',
        aria: anchor.getAttribute('aria-label') || '',
        title: anchor.getAttribute('title') || ''
      };
    }).filter(function(item){ return !!item.href; });
  }

  function collectDomAuthors(){
    var selectors = [
      '[class*="author"]',
      '[class*="byline"]',
      '[itemprop="author"]',
      '[rel="author"]',
      '.authors li',
      '.author-name',
      '.article-authors li',
      '[data-test*="author"]'
    ];
    var out = [];
    var seen = {};
    selectors.forEach(function(selector){
      var nodes = [];
      try{
        nodes = Array.prototype.slice.call(document.querySelectorAll(selector)).slice(0, 24);
      }catch(_e){
        nodes = [];
      }
      nodes.forEach(function(node){
        var raw = node && node.textContent ? String(node.textContent).replace(/\s+/g, ' ').trim() : '';
        if(!raw || raw.length < 3 || raw.length > 180) return;
        if(/\b(orcid|affiliation|department|university|email|corresponding)\b/i.test(raw)) return;
        var key = raw.toLowerCase();
        if(seen[key]) return;
        seen[key] = true;
        out.push(raw);
      });
    });
    return out.slice(0, 24);
  }

  function hostnameFromUrl(rawUrl){
    try{
      return String((new URL(String(rawUrl || ''))).hostname || '').toLowerCase();
    }catch(_e){
      return '';
    }
  }

  function detectPublisherFamily(hostname){
    var host = String(hostname || '').toLowerCase();
    if(!host) return '';
    if(/(^|\.)sciencedirect\.com$/.test(host) || /(^|\.)elsevier\.com$/.test(host)) return 'elsevier';
    if(/(^|\.)springer\.com$/.test(host) || /(^|\.)springernature\.com$/.test(host) || /(^|\.)link\.springer\.com$/.test(host)) return 'springer';
    if(/(^|\.)tandfonline\.com$/.test(host)) return 'tandf';
    if(/(^|\.)wiley\.com$/.test(host) || /(^|\.)onlinelibrary\.wiley\.com$/.test(host)) return 'wiley';
    if(/(^|\.)sagepub\.com$/.test(host)) return 'sage';
    if(/(^|\.)nature\.com$/.test(host)) return 'nature';
    if(/(^|\.)ieeexplore\.ieee\.org$/.test(host)) return 'ieee';
    if(/(^|\.)mdpi\.com$/.test(host)) return 'mdpi';
    if(/(^|\.)plos\.org$/.test(host)) return 'plos';
    return '';
  }

  function collectTextBySelectors(selectors, maxItems){
    var out = [];
    var seen = {};
    (Array.isArray(selectors) ? selectors : []).forEach(function(selector){
      var nodes = [];
      try{
        nodes = Array.prototype.slice.call(document.querySelectorAll(selector)).slice(0, 30);
      }catch(_e){
        nodes = [];
      }
      nodes.forEach(function(node){
        var raw = node && node.textContent ? String(node.textContent).replace(/\s+/g, ' ').trim() : '';
        if(!raw || raw.length < 3 || raw.length > 180) return;
        if(/\b(orcid|affiliation|department|university|email|corresponding)\b/i.test(raw)) return;
        var key = raw.toLowerCase();
        if(seen[key]) return;
        seen[key] = true;
        out.push(raw);
      });
    });
    return out.slice(0, Math.max(1, Number(maxItems) || 24));
  }

  function collectPublisherAuthors(pageUrl){
    var family = detectPublisherFamily(hostnameFromUrl(pageUrl));
    var selectorsByFamily = {
      elsevier: [
        '[class*="AuthorGroups"] [class*="author"]',
        '[class*="author-group"] [class*="author"]',
        '[data-testid="author-group"] [data-testid="author-name"]',
        '[data-testid="author-list"] [data-testid="author-name"]',
        'ol.authors li span.content'
      ],
      springer: [
        '.c-article-author-list__item',
        '[data-test="author-name"]',
        '.authors__name',
        '.u-listReset [itemprop="name"]'
      ],
      tandf: [
        '.entryAuthor',
        '.hlFld-ContribAuthor',
        '.author .name',
        '.author .NLM_string-name'
      ],
      wiley: [
        '.author-name',
        '.loa__item .author-name',
        '.article-header__authors .author-name',
        '.article-citation__authors [itemprop="name"]'
      ],
      sage: [
        '.authors .contrib',
        '.authors [itemprop="name"]',
        '.article__authors .author-name'
      ],
      nature: [
        '.c-article-author-list__item',
        '.authors-list__item',
        '.c-author-list__item'
      ],
      ieee: [
        '.authors-info .author-name',
        '.authors-container .author-name',
        '.u-pb-1 .author-name'
      ],
      mdpi: [
        '.art-authors .sciprofiles-link',
        '.art-authors [itemprop="name"]',
        '.art-authors .name'
      ],
      plos: [
        '.author-list .name',
        '.authors [data-js-tooltip="tooltip_trigger"]',
        '.articleinfo .authors [itemprop="name"]'
      ]
    };
    var selectors = selectorsByFamily[family] || [];
    return {
      publisherFamily: family,
      publisherAuthors: collectTextBySelectors(selectors, 24)
    };
  }

  function detectPage(){
    var utils = globalThis.AQBrowserCaptureUtils || null;
    var metaEntries = collectMetaEntries();
    var anchorEntries = collectAnchorCandidates();
    var anchors = anchorEntries.map(function(item){ return item.href; });
    var jsonLdTexts = collectJsonLdTexts();
    var embedUrls = collectEmbedUrls();
    var bodyText = '';
    try{
      bodyText = (document.body && document.body.innerText) ? document.body.innerText.slice(0, 40000) : '';
    }catch(_e){}
    var pageUrl = String(location.href || '');
    var publisherHints = collectPublisherAuthors(pageUrl);
    var canonical = canonicalUrl();
    var domTitle = firstText([
      'meta[name="dc.title"]',
      'meta[name="citation_title"]',
      'article h1',
      'main h1',
      'h1.hlFld-Title',
      '.core-container h1',
      'h1'
    ]);
    var domAbstract = firstText([
      '[class*="abstract"] p',
      '[id*="abstract"] p',
      '.abstractSection p',
      '.hlFld-Abstract p',
      'section[class*="abstract"] p',
      'div[class*="abstract"] p'
    ]);
    var domAuthors = collectDomAuthors();
    var resolved = utils && utils.detectPageMetadata ? utils.detectPageMetadata({
      metaEntries: metaEntries,
      anchorEntries: anchorEntries,
      anchors: anchors,
      embedUrls: embedUrls,
      jsonLdTexts: jsonLdTexts,
      pageUrl: pageUrl,
      canonicalUrl: canonical,
      bodyText: bodyText,
      domTitle: domTitle,
      domAuthors: domAuthors,
      publisherFamily: publisherHints.publisherFamily || '',
      publisherAuthors: publisherHints.publisherAuthors || [],
      domAbstract: domAbstract,
      docTitle: document.title || ''
    }) : null;
    var jsonLdNodes = parseJsonLdNodes(jsonLdTexts, utils);
    var referenceType = inferReferenceType(metaEntries, jsonLdTexts, resolved || {}, jsonLdNodes);
    var publisher = findMetaContent(metaEntries, ['citation_publisher', 'dc.publisher', 'publisher']);
    var edition = findMetaContent(metaEntries, ['book:edition', 'citation_edition']);
    var websiteName = inferWebsiteName(metaEntries, pageUrl, jsonLdNodes);
    var publishedDate = inferPublishedDate(metaEntries, jsonLdNodes);
    if(!publisher){
      publisher = pickJsonLdPublisher(jsonLdNodes) || '';
      if(publisher && typeof publisher === 'object' && publisher.name) publisher = publisher.name;
    }
    if(!edition){
      edition = pickJsonLdValue(jsonLdNodes, ['bookEdition', 'edition']) || '';
    }
    var jsonAuthors = pickJsonLdAuthors(jsonLdNodes);
    if(jsonAuthors.length && !(resolved && resolved.authors && resolved.authors.found)){
      resolved = resolved || {};
      resolved.authors = { value: jsonAuthors.join('; '), source: 'jsonld', confidence: 'medium', found: true };
    }
    var accessedDate = new Date().toISOString().slice(0, 10);
    var doiDetailed = resolved && resolved.doi ? resolved.doi : { value: '', source: 'none', confidence: 'none', found: false };
    var pdfDetailed = resolved && resolved.pdfUrl ? resolved.pdfUrl : { value: '', source: 'none', confidence: 'none', found: false };
    var titleDetailed = resolved && resolved.title ? resolved.title : { value: '', source: 'none', confidence: 'none', found: false };
    var authorsDetailed = resolved && resolved.authors ? resolved.authors : { value: '', source: 'none', confidence: 'none', found: false };
    var journalDetailed = resolved && resolved.journal ? resolved.journal : { value: '', source: 'none', confidence: 'none', found: false };
    var yearDetailed = resolved && resolved.year ? resolved.year : { value: '', source: 'none', confidence: 'none', found: false };
    var abstractDetailed = resolved && resolved.abstract ? resolved.abstract : { value: '', source: 'none', confidence: 'none', found: false };
    return {
      referenceType: referenceType,
      sourcePageUrl: pageUrl,
      pageTitle: document.title || '',
      doi: doiDetailed && doiDetailed.value ? doiDetailed.value : '',
      pdfUrl: pdfDetailed && pdfDetailed.value ? pdfDetailed.value : '',
      detectedTitle: titleDetailed && titleDetailed.value ? titleDetailed.value : (document.title || ''),
      detectedAuthors: authorsDetailed && authorsDetailed.value ? String(authorsDetailed.value).split(';').map(function(item){ return item.trim(); }).filter(Boolean) : [],
      detectedJournal: journalDetailed && journalDetailed.value ? journalDetailed.value : '',
      detectedPublisher: publisher || '',
      detectedWebsiteName: websiteName || '',
      detectedEdition: edition || '',
      detectedPublishedDate: publishedDate || '',
      detectedAccessedDate: accessedDate || '',
      detectedYear: yearDetailed && yearDetailed.value ? yearDetailed.value : '',
      detectedAbstract: abstractDetailed && abstractDetailed.value ? String(abstractDetailed.value).trim() : '',
      detectionMeta: {
        doi: doiDetailed || { value: '', source: 'none', confidence: 'none', found: false },
        pdfUrl: pdfDetailed || { value: '', source: 'none', confidence: 'none', found: false },
        title: titleDetailed || { value: '', source: 'none', confidence: 'none', found: false },
        authors: authorsDetailed || { value: '', source: 'none', confidence: 'none', found: false },
        journal: journalDetailed || { value: '', source: 'none', confidence: 'none', found: false },
        year: yearDetailed || { value: '', source: 'none', confidence: 'none', found: false },
        abstract: abstractDetailed || { value: '', source: 'none', confidence: 'none', found: false }
      }
    };
  }

  chrome.runtime.onMessage.addListener(function(message, _sender, sendResponse){
    if(!message || message.type !== 'AQ_DETECT_CAPTURE') return;
    try{
      sendResponse({ ok: true, payload: detectPage() });
    }catch(error){
      sendResponse({ ok: false, error: error && error.message ? error.message : 'Detection failed' });
    }
    return true;
  });
})();
