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

  /**
   * Parse plain-text APA 7 reference block (typically pasted from an existing
   * bibliography) into normalized reference records. Each record uses the same
   * shape as parseBibTeX/parseRIS so it can flow through sortLib + rRefs + the
   * citation runtime untouched, keeping alphabetic order and downstream citation
   * insertion intact.
   *
   * Handles:
   *  - multi-author lists with "&" ("Smith, J., Doe, A., & Roe, B.")
   *  - year variants: (2020), (2020a), (2020, May), (n.d.)
   *  - journal articles: ", VV(II), FP-LP" and ", VV, FP-LP" and single-page
   *  - book chapters with "pp. XX-YY"
   *  - DOI embedded as URL, "doi:", or bare 10.xxxx/...
   *  - "Retrieved from URL" stripping
   *  - entries joined across visual line wraps
   * @param {string} text
   * @param {{createId?:Function, workspaceId?:string}} [options]
   * @returns {Array<object>}
   */
  function parseApaReferenceText(text, options){
    options = options || {};
    var createId = typeof options.createId === 'function' ? options.createId : defaultIdFactory;
    var wsId = options.workspaceId || null;
    var entries = [];
    splitApaEntries(String(text || '')).forEach(function(block){
      var entry = parseSingleApaEntry(block, createId, wsId);
      if(entry) entries.push(entry);
    });
    return entries;
  }

  function splitApaEntries(raw){
    var text = String(raw || '').replace(/\r\n?/g, '\n').trim();
    if(!text) return [];
    var yearPattern = /\((?:\d{4}[a-z]?|n\.d\.)(?:,[^)]*)?\)/i;
    // First collapse visually-wrapped lines into paragraphs (blank line separates)
    var paragraphs = text.split(/\n\s*\n+/);
    // Then within each paragraph, detect "new entry starts" by looking for an
    // author pattern (Surname, X.) that is followed within ~300 chars by (YYYY).
    var splitRe = /\s+(?=[A-ZÇĞİÖŞÜ][^,\n]{0,80},\s*[A-ZÇĞİÖŞÜ]\.[^(]{0,300}?\((?:\d{4}[a-z]?|n\.d\.)(?:,[^)]*)?\))/g;
    var out = [];
    paragraphs.forEach(function(p){
      var flat = p.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
      if(!flat) return;
      var chunks = flat.split(splitRe);
      chunks.forEach(function(c){
        var t = String(c || '').trim();
        if(t && yearPattern.test(t)) out.push(t);
      });
    });
    return out;
  }

  function parseSingleApaEntry(text, createId, wsId){
    var raw = String(text || '').replace(/\s+/g, ' ').trim();
    if(!raw) return null;
    var yearMatch = raw.match(/\((\d{4}[a-z]?)(?:,\s*[^)]*)?\)\s*\.?/);
    var isNd = false;
    if(!yearMatch){
      yearMatch = raw.match(/\((n\.d\.)\)\s*\.?/i);
      isNd = !!yearMatch;
    }
    if(!yearMatch) return null;

    var authorsPart = raw.slice(0, yearMatch.index).replace(/[.,;\s]+$/, '').trim();
    var year = isNd ? '' : String(yearMatch[1] || '').replace(/[a-z]$/, '');
    var afterYear = raw.slice(yearMatch.index + yearMatch[0].length).trim();

    var authors = parseApaAuthorBlock(authorsPart);
    afterYear = afterYear.replace(/\bRetrieved\s+(?:on\s+[^,]+,\s*)?(?:from\s+)?/i, ' ').trim();

    var doi = '';
    var url = '';
    var doiMatch = afterYear.match(/https?:\/\/(?:dx\.)?doi\.org\/\S+/i);
    if(doiMatch){
      doi = normalizeDoi(doiMatch[0]);
      afterYear = afterYear.replace(doiMatch[0], ' ').trim();
    } else if((doiMatch = afterYear.match(/\bdoi:\s*(\S+)/i))){
      doi = normalizeDoi(doiMatch[1]);
      afterYear = afterYear.replace(doiMatch[0], ' ').trim();
    } else if((doiMatch = afterYear.match(/\b10\.\d{4,9}\/[^\s,;]+/))){
      doi = normalizeDoi(doiMatch[0]);
      afterYear = afterYear.replace(doiMatch[0], ' ').trim();
    }

    var urlMatch = afterYear.match(/https?:\/\/\S+/i);
    if(urlMatch){
      url = urlMatch[0].replace(/[.,;)]+$/, '');
      afterYear = afterYear.replace(urlMatch[0], ' ').trim();
    }
    if(!doi && url){
      var doiFromUrl = normalizeDoi(url);
      if(doiFromUrl){ doi = doiFromUrl; url = ''; }
    }

    afterYear = afterYear.replace(/\s+/g, ' ').replace(/[.,;\s]+$/, '').trim();

    var volume = '';
    var issue = '';
    var fp = '';
    var lp = '';
    var referenceType = '';
    var publisher = '';
    var edition = '';
    var websiteName = '';
    var forcedTitle = '';
    var forcedJournal = '';
    var pageToken = '([A-Za-z0-9]+)';
    var chapterRe = new RegExp('^(.+?)\\.\\s+(In\\s+.+?)\\s*\\(\\s*(?:[^)]*,\\s*)?pp?\\.\\s*' + pageToken + '(?:\\s*[-–—?]\\s*' + pageToken + ')?\\s*\\)\\.?\\s*(.*)$', 'i');
    var chapterMatch = afterYear.match(chapterRe);
    if(chapterMatch){
      forcedTitle = chapterMatch[1].replace(/[.!?]+$/, '').trim();
      forcedJournal = (chapterMatch[2] + (chapterMatch[5] ? '. ' + chapterMatch[5] : '')).replace(/[.!?]+$/, '').trim();
      fp = chapterMatch[3] || '';
      lp = chapterMatch[4] || '';
      afterYear = forcedTitle;
    }
    var advanceOnline = /\.\s*Advance online publication\.?$/i.test(afterYear);
    if(advanceOnline){
      afterYear = afterYear.replace(/\.\s*Advance online publication\.?$/i, '').trim();
    }
    var m = afterYear.match(new RegExp(',\\s*(\\d+)\\s*\\(([^)]+)\\)\\s*,\\s*' + pageToken + '(?:\\s*[-–—?]\\s*' + pageToken + ')?\\s*\\.?$', 'i'));
    if(m){
      volume = m[1]; issue = m[2]; fp = m[3]; lp = m[4] || '';
      afterYear = afterYear.slice(0, m.index).trim();
    } else if((m = afterYear.match(new RegExp(',\\s*(\\d+)\\s*,\\s*' + pageToken + '(?:\\s*[-–—?]\\s*' + pageToken + ')?\\s*\\.?$', 'i')))){
      volume = m[1]; fp = m[2]; lp = m[3] || '';
      afterYear = afterYear.slice(0, m.index).trim();
    } else if((m = afterYear.match(/,\s*(\d+)\s*\(([^)]+)\)\s*\.?$/))){
      volume = m[1]; issue = m[2];
      afterYear = afterYear.slice(0, m.index).trim();
    } else if((m = afterYear.match(new RegExp(',\\s*pp?\\.\\s*' + pageToken + '(?:\\s*[-–—?]\\s*' + pageToken + ')?\\s*\\.?$', 'i')))){
      fp = m[1]; lp = m[2] || '';
      afterYear = afterYear.slice(0, m.index).trim();
    } else if((m = afterYear.match(new RegExp('\\(\\s*pp?\\.\\s*' + pageToken + '(?:\\s*[-–—?]\\s*' + pageToken + ')?\\s*\\)\\.?\\s*[^.]*\\.?$', 'i')))){
      fp = m[1]; lp = m[2] || '';
      afterYear = afterYear.slice(0, m.index).trim();
    }

    afterYear = afterYear.replace(/[.,;\s]+$/, '').trim();

    var title = '';
    var journal = '';
    if(forcedTitle){
      title = forcedTitle;
      journal = forcedJournal;
      referenceType = 'chapter';
    } else if(volume || fp || doi || url || advanceOnline || /\.\s+In\s+/i.test(afterYear)){
      var split = splitTitleAndJournal(afterYear);
      title = split.title;
      journal = split.journal;
      if(url && !doi && !volume && !fp){
        referenceType = 'website';
        websiteName = journal;
        journal = '';
      }else{
        referenceType = 'article';
      }
    } else {
      var hintedSplit = splitTitleAndJournal(afterYear);
      // Some APA journal entries omit DOI/volume/pages (e.g., "Title. Journal Name.")
      // but should still be treated as article references instead of books.
      if(hintedSplit.title && hintedSplit.journal && looksLikeJournalContainer(hintedSplit.journal)){
        title = hintedSplit.title;
        journal = hintedSplit.journal;
        referenceType = 'article';
      }else{
        var bookParts = splitBookTitleAndPublisher(afterYear);
        title = bookParts.title;
        publisher = bookParts.publisher;
        edition = bookParts.edition;
        referenceType = publisher ? 'book' : '';
      }
    }

    if(!title && !authors.length && !doi) return null;

    return {
      id: createId(),
      title: title,
      authors: authors,
      year: year,
      journal: journal,
      volume: volume,
      issue: issue,
      fp: fp,
      lp: lp,
      doi: doi,
      url: url,
      referenceType: referenceType,
      publisher: publisher,
      edition: edition,
      websiteName: websiteName,
      abstract: '',
      labels: [],
      pdfPath: '',
      pdfData: null,
      pdfUrl: null,
      wsId: wsId
    };
  }

  function splitTitleAndJournal(text){
    var value = String(text || '').trim();
    if(!value) return { title: '', journal: '' };
    // Titles frequently contain colons, question marks, and quoted strings but
    // rarely end with "<period><space><Capital letter>" except at the boundary
    // between title and journal/container. Use the LAST ". " to split.
    var idx = value.lastIndexOf('. ');
    if(idx < 0){
      return { title: value.replace(/[.!?]+$/, '').trim(), journal: '' };
    }
    var title = value.slice(0, idx).replace(/[.!?]+$/, '').trim();
    var journal = value.slice(idx + 2).replace(/[.!?]+$/, '').trim();
    if(!title || !journal){
      return { title: value.replace(/[.!?]+$/, '').trim(), journal: '' };
    }
    return { title: title, journal: journal };
  }

  function splitBookTitleAndPublisher(text){
    var value = String(text || '').replace(/[.,;\s]+$/, '').trim();
    if(!value) return { title: '', publisher: '', edition: '' };
    var split = findLastSentenceBoundary(value);
    var title = value;
    var publisher = '';
    if(split > 0){
      var candidateTitle = value.slice(0, split + 1).replace(/[.!?]+$/, '').trim();
      var candidatePublisher = value.slice(split + 1).replace(/[.!?]+$/, '').trim();
      // Book publishers are usually a short final container segment. Keeping the
      // heuristic conservative avoids splitting ordinary article titles.
      if(candidateTitle && looksLikeBookPublisher(candidatePublisher)){
        title = candidateTitle;
        publisher = candidatePublisher;
      }
    }
    var edition = '';
    var editionMatch = title.match(/\((\d+(?:st|nd|rd|th)?\s+ed\.?)\)\s*$/i);
    if(editionMatch){
      edition = editionMatch[1].replace(/\.$/, '');
      title = title.slice(0, editionMatch.index).replace(/[.!?]+$/, '').trim();
    }
    return { title: title.replace(/[.!?]+$/, '').trim(), publisher: publisher, edition: edition };
  }

  function looksLikeBookPublisher(value){
    var text = String(value || '').replace(/[.!?]+$/, '').trim();
    if(!text || /^\d/.test(text)) return false;
    if(text.split(/\s+/).length > 8) return false;
    return /\b(press|publisher|publishers|publishing|books|pearson|wiley|routledge|sage|springer|elsevier|oxford|cambridge|polity|erlbaum|academic)\b/i.test(text);
  }

  function looksLikeJournalContainer(value){
    var text = String(value || '').replace(/[.!?]+$/, '').trim();
    if(!text) return false;
    if(text.split(/\s+/).length > 14) return false;
    return /\b(journal|review|reports|behavior|behaviour|psychology|education|technology|society|systems|patterns|heliyon|frontiers|telematics|informatics|system)\b/i.test(text);
  }

  function findLastSentenceBoundary(value){
    for(var i = value.length - 2; i >= 0; i -= 1){
      var ch = value.charAt(i);
      if((ch === '.' || ch === '?' || ch === '!') && /\s/.test(value.charAt(i + 1) || '')){
        return i;
      }
    }
    return -1;
  }

  function parseApaAuthorBlock(text){
    if(!text) return [];
    var normalized = String(text || '')
      .replace(/\s+/g, ' ')
      .replace(/,\s*&\s*/g, ' & ')
      .replace(/\s*&\s*/g, ' & ')
      .trim();
    var tokens = normalized.split(/,\s*/);
    var authors = [];
    var i = 0;
    while(i < tokens.length){
      var surname = String(tokens[i] || '').trim();
      if(!surname){ i++; continue; }
      var next = String(tokens[i+1] || '').trim();
      var initialMatch = next.match(/^([A-ZÇĞİÖŞÜ]\.(?:[-\s]*[A-ZÇĞİÖŞÜ]\.)*)(?:\s*&\s*(.*))?$/);
      if(initialMatch){
        authors.push((surname + ', ' + initialMatch[1]).trim());
        if(initialMatch[2]){
          tokens[i+1] = initialMatch[2];
          i += 1;
        } else {
          i += 2;
        }
      } else if(/^&/.test(next)){
        authors.push(surname);
        tokens[i+1] = next.replace(/^&\s*/, '');
        i += 1;
      } else {
        authors.push(surname.replace(/[.,;\s]+$/, '').trim());
        i += 1;
      }
    }
    return authors
      .map(function(a){ return String(a || '').replace(/^[&,\s]+/, '').replace(/[,\s]+$/, '').trim(); })
      .filter(Boolean);
  }

  function splitApaEntries(raw){
    var text = String(raw || '').replace(/\r\n?/g, '\n').trim();
    if(!text) return [];
    var yearPattern = /\((?:\d{4}[a-z]?|n\.d\.)(?:,[^)]*)?\)/i;
    var entryStartRe = /(^|\s)([A-Z\u00C0-\u024F][^,()]{0,90},\s*[A-Z\u00C0-\u024F]\.?(?:\s*[A-Z\u00C0-\u024F]\.?){0,8}[^()]{0,1600}?\((?:\d{4}[a-z]?|n\.d\.)(?:,[^)]*)?\))/g;
    var out = [];
    var lineGroups = [];
    var current = [];
    function looksLikeEntryStart(line){
      var value = String(line || '').replace(/^\s*(?:\d+[\).\s-]+|[-•*]\s+)/, '').trim();
      var year = value.match(/\((?:\d{4}[a-z]?|n\.d\.)(?:,[^)]*)?\)/i);
      if(!year || year.index < 3 || year.index > 1800) return false;
      var prefix = value.slice(0, year.index);
      return /[A-Z\u00C0-\u024F][^,()]{0,90},\s*[A-Z\u00C0-\u024F]\.?/.test(prefix);
    }
    text.split('\n').forEach(function(line){
      var clean = String(line || '').trim();
      if(!clean){
        if(current.length){ lineGroups.push(current.join(' ')); current = []; }
        return;
      }
      if(/^(references|reference list|bibliography|kaynakça|kaynaklar)$/i.test(clean)) return;
      if(looksLikeEntryStart(clean) && current.length && yearPattern.test(current.join(' '))){
        lineGroups.push(current.join(' '));
        current = [clean];
      }else{
        current.push(clean);
      }
    });
    if(current.length) lineGroups.push(current.join(' '));
    lineGroups.forEach(function(paragraph){
      var flat = paragraph.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
      if(!flat) return;
      var starts = [0];
      var match;
      while((match = entryStartRe.exec(flat)) !== null){
        var idx = match.index + (match[1] ? match[1].length : 0);
        if(idx <= 0) continue;
        // Author names inside a multi-author APA block also look like
        // "Surname, X."; only split after a previous year has closed.
        if(yearPattern.test(flat.slice(0, idx)) && looksLikeEntryStart(flat.slice(idx, idx + 1900)) && starts.indexOf(idx) < 0) starts.push(idx);
      }
      starts.sort(function(a,b){ return a-b; });
      for(var i = 0; i < starts.length; i++){
        var chunk = flat.slice(starts[i], starts[i + 1] || flat.length).trim();
        if(chunk && yearPattern.test(chunk)) out.push(chunk);
      }
    });
    return out;
  }

  function parseApaAuthorBlock(text){
    var value = String(text || '').replace(/\s+/g, ' ').trim();
    if(!value) return [];
    var authors = [];
    var re = /(?:^|,\s*&\s*|,\s*|&\s*)([^,&]+?),\s*([A-Z\u00C0-\u024F]\.?(?:[-\s]*[A-Z\u00C0-\u024F]\.?)*)/g;
    var match;
    while((match = re.exec(value)) !== null){
      var surname = String(match[1] || '').replace(/^[&,\s]+/, '').replace(/[,\s]+$/, '').trim();
      var initials = String(match[2] || '').replace(/\s+/g, ' ').replace(/([A-Z\u00C0-\u024F])$/,'$1.').trim();
      if(surname && initials) authors.push(surname + ', ' + initials);
    }
    if(authors.length) return authors;
    return value.split(/\s*&\s*|,\s*(?=[^,]+,\s*[A-Z])/)
      .map(function(a){ return String(a || '').replace(/^[&,\s]+/, '').replace(/[,\s]+$/, '').trim(); })
      .filter(Boolean);
  }

  var api = {
    normalizeDoi: normalizeDoi,
    parseBibTeX: parseBibTeX,
    parseRIS: parseRIS,
    parseCSLJSON: parseCSLJSON,
    parseApaReferenceText: parseApaReferenceText
  };

  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQReferenceParse = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
