(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQCitationStyles = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  var STYLE_IDS = ['apa7', 'mla', 'chicago-author-date', 'ieee', 'harvard'];

  function normalizeStyleId(value){
    var raw = String(value || '').trim().toLowerCase();
    if(raw === 'apa' || raw === 'apa 7' || raw === 'apa-7') return 'apa7';
    if(raw === 'chicago' || raw === 'chicago-ad' || raw === 'chicago_author_date') return 'chicago-author-date';
    if(raw === 'ieee') return 'ieee';
    if(raw === 'mla') return 'mla';
    if(raw === 'harvard') return 'harvard';
    return STYLE_IDS.indexOf(raw) >= 0 ? raw : 'apa7';
  }

  function padSpace(value){
    return String(value || '').trim();
  }

  function hasTurkishLetters(value){
    return /[ÇĞİÖŞÜçğıöşü]/.test(String(value || ''));
  }

  function lowerAcademic(value){
    var raw = String(value || '');
    return hasTurkishLetters(raw) ? raw.toLocaleLowerCase('tr-TR') : raw.toLocaleLowerCase('en-US');
  }

  function upperAcademic(value){
    var raw = String(value || '');
    return hasTurkishLetters(raw) ? raw.toLocaleUpperCase('tr-TR') : raw.toLocaleUpperCase('en-US');
  }

  function capitalizeAcademic(value){
    var raw = String(value || '');
    if(!raw) return '';
    var first = raw.charAt(0);
    return upperAcademic(first) + raw.slice(1);
  }

  function letterStats(value){
    var letters = String(value || '').match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g) || [];
    var upper = letters.filter(function(ch){ return ch === upperAcademic(ch) && ch !== lowerAcademic(ch); }).length;
    var lower = letters.filter(function(ch){ return ch === lowerAcademic(ch) && ch !== upperAcademic(ch); }).length;
    return { letters: letters.length, upper: upper, lower: lower };
  }

  function isMostlyUppercase(value){
    var stats = letterStats(value);
    return stats.letters >= 6 && stats.upper / Math.max(1, stats.letters) >= 0.78;
  }

  function isTitleCaseish(value){
    var words = String(value || '').split(/\s+/).filter(function(word){
      return /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(word);
    });
    if(words.length < 4) return false;
    var titleWords = words.filter(function(word){
      var clean = word.replace(/^[^A-Za-zÇĞİÖŞÜçğıöşü]+|[^A-Za-zÇĞİÖŞÜçğıöşü]+$/g, '');
      if(clean.length < 2) return false;
      return clean.charAt(0) === upperAcademic(clean.charAt(0)) && clean.slice(1) === lowerAcademic(clean.slice(1));
    }).length;
    return titleWords / words.length >= 0.65;
  }

  var PROTECTED_ACRONYMS = ['AI', 'APA', 'DOI', 'ISBN', 'PDF', 'CSL', 'RIS', 'SEM', 'ANOVA', 'MANOVA', 'SPSS', 'COVID-19', 'PTSD', 'OCD', 'ADHD', 'CBT', 'RCT', 'TAM', 'UTAUT'];

  function restoreProtectedAcronyms(value){
    var out = String(value || '');
    PROTECTED_ACRONYMS.forEach(function(token){
      var escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp('\\b' + escaped + '\\b', 'gi'), token);
    });
    return out;
  }

  function normalizeNamePart(value){
    var raw = String(value || '').replace(/\s+/g, ' ').trim();
    if(!raw) return '';
    return raw.split(/(\s+|-|')/).map(function(part){
      if(!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(part)) return part;
      if(part.length <= 3 && part === upperAcademic(part)) return part;
      var lowered = lowerAcademic(part);
      return capitalizeAcademic(lowered);
    }).join('');
  }

  function titleCaseAcademic(value){
    var raw = String(value || '').replace(/\s+/g, ' ').trim();
    if(!raw) return '';
    var smallWords = {
      a: true, an: true, and: true, as: true, at: true, but: true, by: true, for: true, from: true,
      in: true, into: true, nor: true, of: true, on: true, or: true, the: true, to: true, with: true,
      ve: true, veya: true, ile: true, de: true, da: true, ki: true, için: true
    };
    var words = lowerAcademic(raw).split(' ');
    return restoreProtectedAcronyms(words.map(function(word, index){
      var bare = word.replace(/^[^A-Za-zÇĞİÖŞÜçğıöşü]+|[^A-Za-zÇĞİÖŞÜçğıöşü]+$/g, '');
      if(!bare) return word;
      if(index > 0 && smallWords[bare]) return word;
      return word.replace(bare, capitalizeAcademic(bare));
    }).join(' '));
  }

  function sentenceCase(text){
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    if(!t) return '';
    if(isMostlyUppercase(t) || isTitleCaseish(t)){
      t = lowerAcademic(t);
    }
    t = t.replace(/(^|[:.!?]\s+)([a-zçğıöşü])/g, function(match, prefix, letter){
      return prefix + upperAcademic(letter);
    });
    return restoreProtectedAcronyms(capitalizeAcademic(t));
  }

  function normalizeReferenceType(ref){
    var raw = String(ref && ref.referenceType || '').trim().toLowerCase();
    if(raw === 'book' || raw === 'website' || raw === 'article') return raw;
    if(ref && (ref.websiteName || ref.publishedDate || ref.accessedDate)) return 'website';
    if(ref && ref.publisher && !ref.journal) return 'book';
    return 'article';
  }

  function citationLeadFallback(ref){
    var title = String(ref && ref.title || '').trim();
    if(title){
      var normalized = title.replace(/[()[\]{}.,;:!?]/g, ' ').replace(/\s+/g, ' ').trim();
      if(normalized){
        var words = normalized.split(' ').filter(Boolean).slice(0, 5);
        return words.join(' ');
      }
    }
    var website = String(ref && ref.websiteName || '').trim();
    if(website) return website;
    return 'Unknown';
  }

  function authorSurname(raw){
    var txt = String(raw || '').trim();
    if(!txt) return '';
    if(txt.indexOf(',') >= 0){
      return normalizeNamePart(padSpace(txt.split(',')[0]).trim());
    }
    var parts = txt.split(/\s+/).filter(Boolean);
    return parts.length ? normalizeNamePart(parts[parts.length - 1]) : '';
  }

  function authorInitialLabel(raw){
    var txt = String(raw || '').trim();
    if(!txt) return '';
    if(txt.indexOf(',') >= 0){
      var parts = txt.split(',');
      var last = normalizeNamePart(padSpace(parts[0]));
      var first = padSpace(parts.slice(1).join(' '));
      if(!first) return last;
      var initials = first.split(/\s+/).filter(Boolean).map(function(name){
        return upperAcademic(name.charAt(0)) + '.';
      }).join(' ');
      return last + ', ' + initials;
    }
    var names = txt.split(/\s+/).filter(Boolean);
    if(names.length === 1) return normalizeNamePart(names[0]);
    var surname = normalizeNamePart(names[names.length - 1]);
    var initials2 = names.slice(0, -1).map(function(name){
      return upperAcademic(name.charAt(0)) + '.';
    }).join(' ');
    return surname + ', ' + initials2;
  }

  function formatApaAuthorList(authors){
    var list = (Array.isArray(authors) ? authors : [])
      .map(authorInitialLabel)
      .filter(Boolean);
    if(list.length > 20){
      return list.slice(0, 19).join(', ') + ', . . . ' + list[list.length - 1];
    }
    if(list.length === 2) return list[0] + ', & ' + list[1];
    if(list.length > 2) return list.slice(0, -1).join(', ') + ', & ' + list[list.length - 1];
    return list.join(', ');
  }

  function joinAuthorSurnames(ref, options){
    options = options || {};
    var style = normalizeStyleId(options.style);
    var conjunction = options.conjunction || (style === 'harvard' ? 'and' : '&');
    var etAlLabel = String(options.etAlLabel || 'et al.').trim() || 'et al.';
    var authors = Array.isArray(ref && ref.authors) ? ref.authors : [];
    var surnames = authors.map(authorSurname).filter(Boolean);
    if(!surnames.length) return citationLeadFallback(ref);
    if(surnames.length === 1) return surnames[0];
    if(surnames.length === 2) return surnames[0] + ' ' + conjunction + ' ' + surnames[1];
    if(style === 'mla') return surnames[0] + ' ' + etAlLabel;
    if(style === 'ieee') return surnames[0] + ' ' + etAlLabel;
    return surnames[0] + ' ' + etAlLabel;
  }

  function yearLabel(ref){
    return String((ref && ref.year) || 'n.d.').trim() || 'n.d.';
  }

  function pageLabel(ref, options){
    options = options || {};
    var fp = String((ref && ref.fp) || '').trim();
    var lp = String((ref && ref.lp) || '').trim();
    if(!fp && !lp) return '';
    var range = fp && lp ? (fp + '-' + lp) : (fp || lp);
    if(options.prefix === false) return range;
    return 'pp. ' + range;
  }

  function textOrEmpty(value){
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function withoutTrailingPeriod(value){
    return String(value || '').trim().replace(/[.]+$/g, '');
  }

  function hasMonthDayToken(value){
    return /(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)/i.test(String(value || ''));
  }

  function formatApaDateLabel(value, fallback){
    var raw = String(value || '').trim();
    if(!raw) return fallback || 'n.d.';
    var compact = raw.replace(/\s+/g, ' ');
    var iso = compact.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?$/);
    if(iso){
      var year = iso[1];
      var month = Number(iso[2]);
      var day = Number(iso[3] || 0);
      var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      if(month >= 1 && month <= 12){
        if(day >= 1 && day <= 31) return monthNames[month - 1] + ' ' + day + ', ' + year;
        return monthNames[month - 1] + ' ' + year;
      }
      return year;
    }
    var justYear = compact.match(/\b(19|20)\d{2}\b/);
    if(justYear && !hasMonthDayToken(compact)) return justYear[0];
    return compact;
  }

  function formatEditionLabel(value){
    var raw = textOrEmpty(value);
    if(!raw) return '';
    var clean = withoutTrailingPeriod(raw)
      .replace(/^\(+|\)+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if(!clean) return '';
    var numeric = clean.match(/^(\d+)(?:st|nd|rd|th)?(?:\.?\s*(?:ed\.?|edition|bask[ıi]))?$/i);
    if(numeric){
      var number = Number(numeric[1]);
      var mod100 = number % 100;
      var suffix = 'th';
      if(mod100 < 11 || mod100 > 13){
        var mod10 = number % 10;
        if(mod10 === 1) suffix = 'st';
        else if(mod10 === 2) suffix = 'nd';
        else if(mod10 === 3) suffix = 'rd';
      }
      return number + suffix + ' ed.';
    }
    var englishEdition = clean.match(/^(.+?)\s+edition$/i);
    if(englishEdition) return withoutTrailingPeriod(englishEdition[1]).trim() + ' ed.';
    if(/\bed$/i.test(clean)) return clean.replace(/\bed$/i, 'ed.');
    if(/\bed\.$/i.test(clean)) return clean;
    return clean + ' ed.';
  }

  function doiOrUrl(ref){
    if(ref && ref.doi) return 'https://doi.org/' + String(ref.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
    return String((ref && ref.url) || '').trim();
  }

  function ieeeIndex(ref, options){
    options = options || {};
    var idx = 0;
    if(options.indexById && ref && ref.id && options.indexById[ref.id] != null){
      idx = Number(options.indexById[ref.id]) || 0;
    }else if(options.index != null){
      idx = Number(options.index) || 0;
    }
    return idx > 0 ? idx : 1;
  }

  function formatInlineCitation(ref, options){
    options = options || {};
    var style = normalizeStyleId(options.style);
    var year = yearLabel(ref);
    if(style === 'ieee'){
      return '[' + ieeeIndex(ref, options) + ']';
    }
    if(style === 'mla'){
      return '(' + joinAuthorSurnames(ref, { style: style, conjunction: 'and', etAlLabel: 'vd.' }).replace(/\sand\s/, ' and ') + ')';
    }
    if(style === 'chicago-author-date'){
      return '(' + joinAuthorSurnames(ref, { style: style, conjunction: 'and', etAlLabel: 'vd.' }) + ' ' + year + ')';
    }
    if(style === 'harvard'){
      return '(' + joinAuthorSurnames(ref, { style: style, conjunction: 'and', etAlLabel: 'vd.' }) + ', ' + year + ')';
    }
    return '(' + joinAuthorSurnames(ref, { style: style, conjunction: '&', etAlLabel: 'vd.' }) + ', ' + year + ')';
  }

  function visibleCitationText(refs, options){
    options = options || {};
    var list = Array.isArray(refs) ? refs.filter(Boolean) : [];
    if(!list.length) return '';
    var style = normalizeStyleId(options.style);
    if(style === 'ieee'){
      return list.map(function(ref, i){
        return formatInlineCitation(ref, {
          style: style,
          indexById: options.indexById || null,
          index: i + 1
        });
      }).join(', ');
    }
    if(list.length === 1){
      return formatInlineCitation(list[0], options);
    }
    var parts = list.map(function(ref, i){
      return formatInlineCitation(ref, {
        style: style,
        indexById: options.indexById || null,
        index: i + 1
      }).replace(/^\(|\)$/g, '');
    });
    return '(' + parts.join('; ') + ')';
  }

  function formatReference(ref, options){
    options = options || {};
    var style = normalizeStyleId(options.style);
    var title = sentenceCase(ref && ref.title);
    var year = yearLabel(ref);
    var journal = padSpace(ref && ref.journal);
    if(isMostlyUppercase(journal)) journal = titleCaseAcademic(journal);
    var volume = padSpace(ref && ref.volume);
    var issue = padSpace(ref && ref.issue);
    var page = pageLabel(ref, { prefix: style !== 'chicago-author-date' });
    var link = doiOrUrl(ref);
    var authorInitials = (Array.isArray(ref && ref.authors) ? ref.authors : [])
      .map(authorInitialLabel)
      .filter(Boolean);
    var authorSurnames = (Array.isArray(ref && ref.authors) ? ref.authors : [])
      .map(authorSurname)
      .filter(Boolean);
    var lead = joinAuthorSurnames(ref, { style: style, conjunction: style === 'harvard' || style === 'chicago-author-date' ? 'and' : '&' });
    var referenceType = normalizeReferenceType(ref);

    if(style === 'mla'){
      var mlaAuthors = authorInitials.length > 1 ? (authorInitials[0] + ', et al.') : (authorInitials[0] || 'Unknown');
      return [
        mlaAuthors + '.',
        title ? '"' + title + '."' : '',
        journal ? '<i>' + journal + '</i>,' : '',
        volume ? 'vol. ' + volume + ',' : '',
        issue ? 'no. ' + issue + ',' : '',
        year ? year + ',' : '',
        page ? page + '.' : '',
        link || ''
      ].filter(Boolean).join(' ').replace(/\s+,/g, ',').trim();
    }

    if(style === 'chicago-author-date'){
      return [
        lead + '.',
        year + '.',
        title ? '"' + title + '."' : '',
        journal ? '<i>' + journal + '</i>' : '',
        volume ? volume : '',
        issue ? '(' + issue + ')' : '',
        page ? ':' + page.replace(/^pp\.\s*/i, '') + '.' : '',
        link || ''
      ].filter(Boolean).join(' ').replace(/\s+:/g, ':').trim();
    }

    if(style === 'ieee'){
      var ieeeAuthor = authorInitials.join(', ') || 'Unknown';
      return [
        '[' + ieeeIndex(ref, options) + ']',
        ieeeAuthor + ',',
        title ? '"' + title + ',"' : '',
        journal ? '<i>' + journal + '</i>,' : '',
        volume ? 'vol. ' + volume + ',' : '',
        issue ? 'no. ' + issue + ',' : '',
        page ? page + ',' : '',
        year + '.',
        link || ''
      ].filter(Boolean).join(' ').replace(/\s+,/g, ',').trim();
    }

    if(style === 'harvard'){
      var harvardAuthor = authorSurnames.length > 2
        ? (authorSurnames[0] + ' et al.')
        : (authorSurnames.length === 2 ? (authorSurnames[0] + ' and ' + authorSurnames[1]) : (authorSurnames[0] || 'Unknown'));
      return [
        harvardAuthor + ' (' + year + ')',
        title ? "'" + title + "'" : '',
        journal ? '<i>' + journal + '</i>,' : '',
        volume ? volume : '',
        issue ? '(' + issue + ')' : '',
        page ? ',' + page + '.' : '.',
        link || ''
      ].filter(Boolean).join(' ').replace(/\s+,/g, ',').trim();
    }

    var apaAuthor = formatApaAuthorList(Array.isArray(ref && ref.authors) ? ref.authors : []);
    if(!apaAuthor) apaAuthor = citationLeadFallback(ref);

    if(referenceType === 'book'){
      var edition = formatEditionLabel(ref && ref.edition);
      var publisher = textOrEmpty(ref && ref.publisher);
      if(isMostlyUppercase(publisher)) publisher = titleCaseAcademic(publisher);
      return [
        apaAuthor + ' (' + year + ').',
        title ? '<i>' + withoutTrailingPeriod(title) + '</i>.' : '',
        edition ? '(' + edition + ').' : '',
        publisher ? withoutTrailingPeriod(publisher) + '.' : '',
        link || ''
      ].filter(Boolean).join(' ').replace(/\s{2,}/g, ' ').trim();
    }

    if(referenceType === 'website'){
      var websiteName = textOrEmpty(ref && ref.websiteName);
      if(isMostlyUppercase(websiteName)) websiteName = titleCaseAcademic(websiteName);
      var publishedDate = textOrEmpty(ref && ref.publishedDate);
      var websiteDate = formatApaDateLabel(publishedDate || year, 'n.d.');
      var accessedDate = textOrEmpty(ref && ref.accessedDate);
      var retrieval = accessedDate ? ('Retrieved ' + formatApaDateLabel(accessedDate, '') + ', from ') : '';
      var websiteLink = textOrEmpty(ref && ref.url);
      return [
        apaAuthor + ' (' + websiteDate + ').',
        title ? '<i>' + withoutTrailingPeriod(title) + '</i>.' : '',
        websiteName ? withoutTrailingPeriod(websiteName) + '.' : '',
        websiteLink ? (retrieval + websiteLink) : ''
      ].filter(Boolean).join(' ').replace(/\s{2,}/g, ' ').trim();
    }

    var journalVolume = '';
    if(journal || volume){
      journalVolume = '<i>' + [journal, volume].filter(Boolean).join(', ') + '</i>';
    }
    var articleSource = '';
    if(journalVolume || issue || page){
      articleSource = journalVolume;
      if(issue) articleSource += '(' + issue + ')';
      if(page) articleSource += ', ' + page.replace(/^pp\.\s*/i, '') + '.';
      else articleSource += '.';
    }
    return [
      apaAuthor + ' (' + year + ').',
      title ? title + '.' : '',
      articleSource,
      link || ''
    ].filter(Boolean).join(' ').replace(/\s{2,}/g, ' ').trim();
  }

  function bibliographySortKey(ref){
    ref = ref || {};
    var first = authorSurname((Array.isArray(ref.authors) ? ref.authors[0] : '') || '');
    var year = yearLabel(ref);
    var title = String(ref.title || '').trim().toLowerCase();
    return (first + '||' + year + '||' + title).toLowerCase();
  }

  function sortReferences(refs, options){
    options = options || {};
    var list = Array.isArray(refs) ? refs.slice() : [];
    var style = normalizeStyleId(options.style);
    if(style === 'ieee' && options.preserveOrder){
      return list;
    }
    var locale = options.locale || 'tr';
    return list.sort(function(a, b){
      return bibliographySortKey(a).localeCompare(bibliographySortKey(b), locale, { numeric: true, sensitivity: 'base' });
    });
  }

  function supportedStyles(){
    return [
      { id: 'apa7', label: 'APA 7' },
      { id: 'mla', label: 'MLA' },
      { id: 'chicago-author-date', label: 'Chicago AD' },
      { id: 'ieee', label: 'IEEE' },
      { id: 'harvard', label: 'Harvard' }
    ];
  }

  return {
    normalizeStyleId: normalizeStyleId,
    supportedStyles: supportedStyles,
    formatInlineCitation: formatInlineCitation,
    visibleCitationText: visibleCitationText,
    formatReference: formatReference,
    sortReferences: sortReferences
  };
});
