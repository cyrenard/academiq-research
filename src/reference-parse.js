(function(root){
  /**
   * Normalize DOI-ish strings into canonical DOI form.
   * @param {string} value
   * @returns {string}
   */
  function normalizeDoi(value){
    var raw = String(value || '').trim();
    if(!raw) return '';
    try{ raw = decodeURIComponent(raw); }catch(e){}
    raw = raw
      .replace(/^doi:\s*/i, '')
      .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, '')
      .replace(/[)\].,;:]+$/g, '');
    var m = raw.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
    var doi = (m && m[0]) ? m[0] : raw;
    doi = doi
      .replace(/(?:\/|\.)(BIBTEX|RIS|ABSTRACT|FULLTEXT|FULL|PDF|XML|HTML|EPUB)$/i, '')
      .replace(/\/[A-Za-z]$/i, '')
      .replace(/[)\].,;:]+$/g, '')
      .toLowerCase();
    if(!/^10\.\d{4,9}\//i.test(doi)) return '';
    return doi;
  }

  function normalizeYear(value){
    var text = String(value || '').trim();
    if(!text) return '';
    var match = text.match(/\b(19|20)\d{2}\b/);
    return match ? match[0] : text;
  }

  function defaultIdFactory(){
    if(root && typeof root.uid === 'function') return root.uid();
    return 'ref_' + Date.now() + '_' + Math.random().toString(16).slice(2);
  }

  function splitTagValues(raw){
    return String(raw || '')
      .split(/[;,|]/)
      .map(function(tag){ return String(tag || '').trim(); })
      .filter(Boolean);
  }

  function parseBibFileField(fileField){
    var raw = String(fileField || '').trim();
    if(!raw) return '';
    var chunks = raw.split(';').filter(Boolean);
    for(var i = 0; i < chunks.length; i++){
      var part = chunks[i];
      var pipeParts = part.split(':').filter(Boolean);
      for(var j = 0; j < pipeParts.length; j++){
        var candidate = String(pipeParts[j] || '').trim();
        if(/\.pdf(\?.*)?$/i.test(candidate)) return candidate;
      }
      if(/\.pdf(\?.*)?$/i.test(part)) return String(part).trim();
    }
    return '';
  }

  /**
   * Parse BibTeX into normalized reference records.
   * @param {string} text
   * @param {{createId?:Function, workspaceId?:string}} [options]
   * @returns {Array<object>}
   */
  function parseBibTeX(text, options){
    options = options || {};
    var createId = typeof options.createId === 'function' ? options.createId : defaultIdFactory;
    var wsId = options.workspaceId || null;
    var entries = [];
    var re = /@(\w+)\s*\{([^,]*),\s*([\s\S]*?)\n\s*\}/g;
    var m;
    while((m = re.exec(String(text || ''))) !== null){
      var fields = {};
      var body = m[3];
      var fr = /(\w+)\s*=\s*[\{"]([^}"]*)[\}"]/g;
      var fm;
      while((fm = fr.exec(body)) !== null){
        fields[fm[1].toLowerCase()] = fm[2]
          .replace(/[\{\}]/g, '')
          .replace(/\\&/g, '&')
          .replace(/\\\"/g, '"')
          .replace(/\\'/g, "'")
          .trim();
      }
      var authors = String(fields.author || '')
        .split(/\s+and\s+/i)
        .map(function(author){ return author.trim(); })
        .filter(Boolean);
      var pages = String(fields.pages || '').replace(/--/g, '-');
      var fp = '';
      var lp = '';
      if(pages.indexOf('-') >= 0){
        var parts = pages.split('-');
        fp = String(parts[0] || '').trim();
        lp = String(parts[parts.length - 1] || '').trim();
      }else{
        fp = pages.trim();
      }

      entries.push({
        id: createId(),
        title: String(fields.title || '').replace(/\s+/g, ' ').trim(),
        authors: authors,
        year: normalizeYear(fields.year || ''),
        journal: String(fields.journal || fields.booktitle || '').replace(/\s+/g, ' ').trim(),
        volume: String(fields.volume || '').trim(),
        issue: String(fields.number || '').trim(),
        fp: fp,
        lp: lp,
        doi: normalizeDoi(fields.doi || fields.url || ''),
        url: String(fields.url || '').trim(),
        abstract: String(fields.abstract || fields.annotation || '').trim(),
        note: String(fields.note || '').trim(),
        labels: splitTagValues(fields.keywords || fields.tags || ''),
        pdfPath: parseBibFileField(fields.file || fields.bdsk_file_1 || ''),
        pdfData: null,
        pdfUrl: null,
        wsId: wsId
      });
    }
    return entries;
  }

  /**
   * Parse RIS into normalized reference records.
   * @param {string} text
   * @param {{createId?:Function, workspaceId?:string}} [options]
   * @returns {Array<object>}
   */
  function parseRIS(text, options){
    options = options || {};
    var createId = typeof options.createId === 'function' ? options.createId : defaultIdFactory;
    var wsId = options.workspaceId || null;
    var entries = [];
    var blocks = String(text || '').split(/^ER\s*-/m);
    blocks.forEach(function(block){
      if(!block.trim()) return;
      var fields = {};
      var authors = [];
      block.split('\n').forEach(function(line){
        var m = line.match(/^([A-Z][A-Z0-9])\s*-\s*(.*)/);
        if(!m) return;
        var tag = m[1].trim();
        var val = m[2].trim();
        if(tag === 'AU' || tag === 'A1') authors.push(val);
        else if(tag === 'TI' || tag === 'T1') fields.title = val;
        else if(tag === 'PY' || tag === 'Y1') fields.year = val;
        else if(tag === 'JO' || tag === 'JF' || tag === 'T2') fields.journal = fields.journal || val;
        else if(tag === 'VL') fields.volume = val;
        else if(tag === 'IS') fields.issue = val;
        else if(tag === 'SP') fields.fp = val;
        else if(tag === 'EP') fields.lp = val;
        else if(tag === 'DO') fields.doi = val;
        else if(tag === 'UR') fields.url = val;
        else if(tag === 'AB' || tag === 'N2') fields.abstract = fields.abstract ? (fields.abstract + ' ' + val) : val;
        else if(tag === 'KW') fields.keywords = (fields.keywords || []).concat([val]);
        else if(tag === 'L1') fields.pdfPath = fields.pdfPath || val;
      });
      if(!fields.title && !authors.length) return;
      entries.push({
        id: createId(),
        title: String(fields.title || '').replace(/\s+/g, ' ').trim(),
        authors: authors.map(function(author){ return String(author || '').replace(/\s+/g, ' ').trim(); }).filter(Boolean),
        year: normalizeYear(fields.year || ''),
        journal: String(fields.journal || '').replace(/\s+/g, ' ').trim(),
        volume: String(fields.volume || '').trim(),
        issue: String(fields.issue || '').trim(),
        fp: String(fields.fp || '').trim(),
        lp: String(fields.lp || '').trim(),
        doi: normalizeDoi(fields.doi || fields.url || ''),
        url: String(fields.url || '').trim(),
        abstract: String(fields.abstract || '').trim(),
        labels: (fields.keywords || []).map(function(tag){ return String(tag || '').trim(); }).filter(Boolean),
        pdfPath: String(fields.pdfPath || '').trim(),
        pdfData: null,
        pdfUrl: null,
        wsId: wsId
      });
    });
    return entries;
  }

  function parseCSLJSON(text, options){
    options = options || {};
    var createId = typeof options.createId === 'function' ? options.createId : defaultIdFactory;
    var wsId = options.workspaceId || null;
    var parsed;
    try{
      parsed = JSON.parse(String(text || ''));
    }catch(_e){
      return [];
    }
    var list = Array.isArray(parsed) ? parsed : [parsed];
    return list.map(function(item){
      if(!item || typeof item !== 'object') return null;
      var authors = Array.isArray(item.author) ? item.author.map(function(author){
        if(!author || typeof author !== 'object') return '';
        var family = String(author.family || '').trim();
        var given = String(author.given || '').trim();
        if(family && given) return family + ', ' + given;
        return family || given || '';
      }).filter(Boolean) : [];
      var issued = item.issued && Array.isArray(item.issued['date-parts']) ? item.issued['date-parts'] : [];
      var year = '';
      if(issued.length && Array.isArray(issued[0]) && issued[0].length){
        year = normalizeYear(String(issued[0][0] || ''));
      }
      var pages = String(item.page || '').replace(/--/g, '-');
      var fp = '';
      var lp = '';
      if(pages.indexOf('-') >= 0){
        var pageParts = pages.split('-');
        fp = String(pageParts[0] || '').trim();
        lp = String(pageParts[pageParts.length - 1] || '').trim();
      }else{
        fp = pages.trim();
      }
      var tags = [];
      if(Array.isArray(item.keyword)){
        tags = item.keyword.slice();
      }else{
        tags = splitTagValues(item.keyword || '');
      }
      if(Array.isArray(item.tags)){
        tags = tags.concat(item.tags.map(function(tag){
          if(!tag) return '';
          if(typeof tag === 'string') return tag;
          if(typeof tag === 'object') return String(tag.tag || tag.name || '').trim();
          return '';
        }));
      }
      var pdfPath = '';
      if(Array.isArray(item.attachments)){
        var pdfAttachment = item.attachments.find(function(att){
          var path = String((att && (att.path || att.url || att.title)) || '').trim();
          return /\.pdf(\?.*)?$/i.test(path);
        });
        if(pdfAttachment) pdfPath = String(pdfAttachment.path || pdfAttachment.url || '').trim();
      }
      return {
        id: createId(),
        title: String(item.title || '').replace(/\s+/g, ' ').trim(),
        authors: authors,
        year: year,
        journal: String(item['container-title'] || item['publicationTitle'] || item['journalAbbreviation'] || '').replace(/\s+/g, ' ').trim(),
        volume: String(item.volume || '').trim(),
        issue: String(item.issue || '').trim(),
        fp: fp,
        lp: lp,
        doi: normalizeDoi(item.DOI || item.doi || item.URL || ''),
        url: String(item.URL || item.url || '').trim(),
        abstract: String(item.abstract || item.abstractNote || '').trim(),
        note: String(item.note || '').trim(),
        labels: (Array.isArray(tags) ? tags : []).map(function(tag){ return String(tag || '').trim(); }).filter(Boolean),
        pdfPath: pdfPath,
        pdfData: null,
        pdfUrl: null,
        wsId: wsId
      };
    }).filter(function(entry){
      if(!entry) return false;
      return !!(entry.title || entry.doi || (entry.authors && entry.authors.length));
    });
  }

  var api = {
    normalizeDoi: normalizeDoi,
    parseBibTeX: parseBibTeX,
    parseRIS: parseRIS,
    parseCSLJSON: parseCSLJSON
  };

  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQReferenceParse = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
