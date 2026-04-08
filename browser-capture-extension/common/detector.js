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
      domAbstract: domAbstract,
      docTitle: document.title || ''
    }) : null;
    var doiDetailed = resolved && resolved.doi ? resolved.doi : { value: '', source: 'none', confidence: 'none', found: false };
    var pdfDetailed = resolved && resolved.pdfUrl ? resolved.pdfUrl : { value: '', source: 'none', confidence: 'none', found: false };
    var titleDetailed = resolved && resolved.title ? resolved.title : { value: '', source: 'none', confidence: 'none', found: false };
    var authorsDetailed = resolved && resolved.authors ? resolved.authors : { value: '', source: 'none', confidence: 'none', found: false };
    var journalDetailed = resolved && resolved.journal ? resolved.journal : { value: '', source: 'none', confidence: 'none', found: false };
    var yearDetailed = resolved && resolved.year ? resolved.year : { value: '', source: 'none', confidence: 'none', found: false };
    var abstractDetailed = resolved && resolved.abstract ? resolved.abstract : { value: '', source: 'none', confidence: 'none', found: false };
    return {
      sourcePageUrl: pageUrl,
      pageTitle: document.title || '',
      doi: doiDetailed && doiDetailed.value ? doiDetailed.value : '',
      pdfUrl: pdfDetailed && pdfDetailed.value ? pdfDetailed.value : '',
      detectedTitle: titleDetailed && titleDetailed.value ? titleDetailed.value : (document.title || ''),
      detectedAuthors: authorsDetailed && authorsDetailed.value ? String(authorsDetailed.value).split(';').map(function(item){ return item.trim(); }).filter(Boolean) : [],
      detectedJournal: journalDetailed && journalDetailed.value ? journalDetailed.value : '',
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
