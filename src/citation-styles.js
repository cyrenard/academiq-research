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

  function sentenceCase(text){
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    if(!t) return '';
    return t.charAt(0).toUpperCase() + t.slice(1);
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
      return padSpace(txt.split(',')[0]).trim();
    }
    var parts = txt.split(/\s+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }

  function authorInitialLabel(raw){
    var txt = String(raw || '').trim();
    if(!txt) return '';
    if(txt.indexOf(',') >= 0){
      var parts = txt.split(',');
      var last = padSpace(parts[0]);
      var first = padSpace(parts.slice(1).join(' '));
      if(!first) return last;
      var initials = first.split(/\s+/).filter(Boolean).map(function(name){
        return name.charAt(0).toUpperCase() + '.';
      }).join(' ');
      return last + ', ' + initials;
    }
    var names = txt.split(/\s+/).filter(Boolean);
    if(names.length === 1) return names[0];
    var surname = names[names.length - 1];
    var initials2 = names.slice(0, -1).map(function(name){
      return name.charAt(0).toUpperCase() + '.';
    }).join(' ');
    return surname + ', ' + initials2;
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
    if(/\bed\.?\)?$/i.test(raw) || /\bedition\b/i.test(raw)) return raw;
    return raw + ' ed.';
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

    var apaAuthor = authorInitials.length > 20
      ? authorInitials.slice(0, 19).join(', ') + ', . . . & ' + authorInitials[authorInitials.length - 1]
      : (authorInitials.length === 2 ? authorInitials[0] + ' & ' + authorInitials[1] : authorInitials.join(', '));
    if(!apaAuthor) apaAuthor = citationLeadFallback(ref);

    if(referenceType === 'book'){
      var edition = formatEditionLabel(ref && ref.edition);
      var publisher = textOrEmpty(ref && ref.publisher);
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
      var publishedDate = textOrEmpty(ref && ref.publishedDate);
      var websiteDate = formatApaDateLabel(publishedDate || year, 'n.d.');
      var accessedDate = textOrEmpty(ref && ref.accessedDate);
      var retrieval = accessedDate ? ('Retrieved ' + formatApaDateLabel(accessedDate, '') + ', from ') : '';
      var websiteLink = textOrEmpty(ref && ref.url);
      return [
        apaAuthor + ' (' + websiteDate + ').',
        title ? withoutTrailingPeriod(title) + '.' : '',
        websiteName ? withoutTrailingPeriod(websiteName) + '.' : '',
        websiteLink ? (retrieval + websiteLink) : ''
      ].filter(Boolean).join(' ').replace(/\s{2,}/g, ' ').trim();
    }

    return [
      apaAuthor + ' (' + year + ').',
      title ? title + '.' : '',
      journal ? '<i>' + journal + '</i>' : '',
      volume ? ', ' + volume : '',
      issue ? '(' + issue + ')' : '',
      page ? ', ' + page.replace(/^pp\.\s*/i, '') + '.' : '.',
      link || ''
    ].join('').replace(/\s{2,}/g, ' ').trim();
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
