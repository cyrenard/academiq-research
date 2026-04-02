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
        pdfData: null,
        pdfUrl: null,
        wsId: wsId
      });
    });
    return entries;
  }

  var api = {
    normalizeDoi: normalizeDoi,
    parseBibTeX: parseBibTeX,
    parseRIS: parseRIS
  };

  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQReferenceParse = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

