(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQBibliographyExport = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  function normalizeStyleId(styleId){
    var raw = String(styleId || 'apa7').trim().toLowerCase();
    if(raw === 'chicago' || raw === 'chicago-ad' || raw === 'chicago_author_date') return 'chicago-author-date';
    if(raw === 'vancouver') return 'ieee';
    if(raw === 'mla' || raw === 'harvard' || raw === 'ieee' || raw === 'apa7' || raw === 'chicago-author-date'){
      return raw;
    }
    return 'apa7';
  }

  function normalizeDoi(doi){
    return String(doi || '')
      .trim()
      .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  }

  function parseYear(value){
    var raw = String(value || '').trim();
    var match = raw.match(/(\d{4})/);
    return match ? Number(match[1]) : null;
  }

  function parseAuthorName(raw){
    var text = String(raw || '').trim();
    if(!text) return null;
    if(text.indexOf(',') >= 0){
      var parts = text.split(',');
      return {
        family: String(parts.shift() || '').trim(),
        given: String(parts.join(',') || '').trim()
      };
    }
    var bits = text.split(/\s+/).filter(Boolean);
    if(!bits.length) return null;
    if(bits.length === 1){
      return { family: bits[0], given: '' };
    }
    return {
      family: bits[bits.length - 1],
      given: bits.slice(0, -1).join(' ')
    };
  }

  function mapReferenceType(ref){
    var type = String(ref && ref.referenceType || '').toLowerCase();
    if(type === 'book') return 'book';
    if(type === 'website' || type === 'web') return 'webpage';
    if(type === 'chapter') return 'chapter';
    if(type === 'conference' || type === 'proceedings') return 'paper-conference';
    if(ref && ref.journal) return 'article-journal';
    return 'article';
  }

  function mapReferenceToCslItem(ref, index){
    ref = ref || {};
    var item = {
      id: String(ref.id || ('ref-' + (index + 1))),
      type: mapReferenceType(ref),
      title: String(ref.title || '').trim() || 'Untitled'
    };
    var year = parseYear(ref.year);
    if(year){
      item.issued = { 'date-parts': [[year]] };
    }
    var authors = Array.isArray(ref.authors) ? ref.authors.map(parseAuthorName).filter(Boolean) : [];
    if(authors.length){
      item.author = authors;
    }
    if(ref.journal){
      item['container-title'] = String(ref.journal).trim();
    }
    if(ref.publisher){
      item.publisher = String(ref.publisher).trim();
    }
    if(ref.websiteName && !item['container-title']){
      item['container-title'] = String(ref.websiteName).trim();
    }
    if(ref.volume){
      item.volume = String(ref.volume).trim();
    }
    if(ref.issue){
      item.issue = String(ref.issue).trim();
    }
    var page = String(ref.fp || '').trim();
    if(page && ref.lp){
      page += '-' + String(ref.lp).trim();
    }else if(!page && ref.lp){
      page = String(ref.lp).trim();
    }
    if(page){
      item.page = page;
    }
    var doi = normalizeDoi(ref.doi);
    if(doi){
      item.DOI = doi;
    }
    if(ref.url){
      item.URL = String(ref.url).trim();
    }
    return item;
  }

  function defaultSort(refs){
    return (Array.isArray(refs) ? refs : []).slice().sort(function(a, b){
      function key(ref){
        ref = ref || {};
        var leadAuthor = Array.isArray(ref.authors) && ref.authors.length ? String(ref.authors[0]) : '';
        return [
          leadAuthor.toLocaleLowerCase('tr'),
          String(ref.year || '').toLocaleLowerCase('tr'),
          String(ref.title || '').toLocaleLowerCase('tr')
        ].join('||');
      }
      return key(a).localeCompare(key(b), 'tr', { numeric:true, sensitivity:'base' });
    });
  }

  function sortReferences(refs, options){
    options = options || {};
    var style = normalizeStyleId(options.style);
    var citationStyles = options.citationStyles || null;
    if(citationStyles && typeof citationStyles.sortReferences === 'function'){
      try{
        return citationStyles.sortReferences((Array.isArray(refs) ? refs : []).slice(), {
          style: style,
          locale: options.locale || 'tr',
          preserveOrder: false
        });
      }catch(_error){}
    }
    var fallbackSort = typeof options.fallbackSort === 'function' ? options.fallbackSort : defaultSort;
    return fallbackSort(refs);
  }

  function formatReference(ref, options){
    options = options || {};
    var style = normalizeStyleId(options.style);
    var citationStyles = options.citationStyles || null;
    if(citationStyles && typeof citationStyles.formatReference === 'function'){
      try{
        return citationStyles.formatReference(ref, {
          style: style,
          indexById: options.indexById || null,
          index: options.index || null
        });
      }catch(_error){}
    }
    if(typeof options.fallbackFormat === 'function'){
      return options.fallbackFormat(ref);
    }
    return String((ref && ref.title) || '').trim();
  }

  function buildPlainBibliographyText(refs, options){
    options = options || {};
    var sorted = sortReferences(refs, options);
    var indexById = {};
    sorted.forEach(function(ref, idx){
      if(ref && ref.id != null){
        indexById[String(ref.id)] = idx + 1;
      }
    });
    return sorted.map(function(ref, idx){
      return formatReference(ref, {
        style: options.style,
        citationStyles: options.citationStyles,
        fallbackFormat: options.fallbackFormat,
        indexById: indexById,
        index: idx + 1
      });
    }).join('\n');
  }

  function buildCslJsonItems(refs){
    return (Array.isArray(refs) ? refs : []).map(function(ref, idx){
      return mapReferenceToCslItem(ref, idx);
    });
  }

  return {
    normalizeStyleId: normalizeStyleId,
    normalizeDoi: normalizeDoi,
    parseAuthorName: parseAuthorName,
    sortReferences: sortReferences,
    formatReference: formatReference,
    buildPlainBibliographyText: buildPlainBibliographyText,
    mapReferenceToCslItem: mapReferenceToCslItem,
    buildCslJsonItems: buildCslJsonItems
  };
});
