(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  root.AQCitationState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function identityRefs(refs){
    return Array.isArray(refs) ? refs.slice() : [];
  }

  function formatAuthorName(raw){
    if(!raw) return '';
    raw = String(raw).trim();
    if(!raw) return '';
    if(raw.indexOf(',') >= 0){
      var parts = raw.split(',');
      var last = String(parts[0] || '').trim();
      var rest = String(parts[1] || '').trim();
      if(!rest) return last;
      return last + ', ' + rest.split(/\s+/).filter(Boolean).map(function(name){
        return String(name || '').charAt(0).toUpperCase() + '.';
      }).join(' ');
    }
    var names = raw.split(/\s+/).filter(Boolean);
    if(names.length === 1) return names[0];
    var surname = names[names.length - 1];
    return surname + ', ' + names.slice(0, -1).map(function(name){
      return String(name || '').charAt(0).toUpperCase() + '.';
    }).join(' ');
  }

  function buildAuthorLabel(ref, deps){
    var formatAuthor = deps && typeof deps.formatAuthor === 'function'
      ? deps.formatAuthor
      : formatAuthorName;
    var authors = ((ref && ref.authors) || []).map(formatAuthor).filter(Boolean);
    var surnames = authors.map(function(author){
      return String(author || '').split(',')[0].trim();
    }).filter(Boolean);
    if(!surnames.length) return 'Bilinmeyen';
    if(surnames.length === 1) return surnames[0];
    if(surnames.length === 2) return surnames[0] + ' & ' + surnames[1];
    return surnames[0] + ' vd.';
  }

  function getInlineCitationText(ref, deps){
    var styleApi = deps && deps.citationStyles;
    var styleId = deps && deps.styleId;
    if(styleApi && typeof styleApi.formatInlineCitation === 'function'){
      return styleApi.formatInlineCitation(ref, { style: styleId || 'apa7' });
    }
    var authorLabel = buildAuthorLabel(ref || {}, deps || {});
    var year = ref && ref.year ? ref.year : 't.y.';
    return '(' + authorLabel + ', ' + year + ')';
  }

  function normalizeRefs(refs, deps){
    var dedupe = deps && typeof deps.dedupeReferences === 'function'
      ? deps.dedupeReferences
      : identityRefs;
    var sort = deps && typeof deps.sortReferences === 'function'
      ? deps.sortReferences
      : identityRefs;
    return sort(dedupe(Array.isArray(refs) ? refs : []));
  }

  function buildCitationHTML(refs, deps){
    var normalized = normalizeRefs(refs, deps);
    if(!normalized.length) return '';
    var styleApi = deps && deps.citationStyles;
    var styleId = deps && deps.styleId;
    var indexById = {};
    normalized.forEach(function(ref, index){
      if(ref && ref.id) indexById[ref.id] = index + 1;
    });
    if(normalized.length === 1){
      return '<span class="cit" data-ref="' + normalized[0].id + '">'
        + getInlineCitationText(normalized[0], Object.assign({}, deps, { indexById: indexById }))
        + '</span> ';
    }
    var parts = normalized.map(function(ref, index){
      if(styleApi && typeof styleApi.formatInlineCitation === 'function'){
        return String(styleApi.formatInlineCitation(ref, {
          style: styleId || 'apa7',
          indexById: indexById,
          index: index + 1
        }) || '').replace(/^\(|\)$/g, '');
      }
      return buildAuthorLabel(ref, deps) + ', ' + (ref && ref.year ? ref.year : 't.y.');
    });
    var ids = normalized.map(function(ref){ return ref.id; }).join(',');
    if(styleApi && typeof styleApi.normalizeStyleId === 'function' && styleApi.normalizeStyleId(styleId) === 'ieee'){
      return '<span class="cit" data-ref="' + ids + '">'
        + parts.map(function(part){ return '[' + String(part).replace(/^\[|\]$/g, '') + ']'; }).join(', ')
        + '</span> ';
    }
    return '<span class="cit" data-ref="' + ids + '">('
      + parts.join('; ')
      + ')</span> ';
  }

  function visibleCitationText(refs, deps){
    var normalized = normalizeRefs(refs, deps);
    if(!normalized.length) return '';
    var styleApi = deps && deps.citationStyles;
    var styleId = deps && deps.styleId;
    if(styleApi && typeof styleApi.visibleCitationText === 'function'){
      var indexById = {};
      normalized.forEach(function(ref, index){
        if(ref && ref.id) indexById[ref.id] = index + 1;
      });
      return styleApi.visibleCitationText(normalized, {
        style: styleId || 'apa7',
        indexById: indexById
      });
    }
    if(normalized.length === 1) return getInlineCitationText(normalized[0], deps);
    return '(' + normalized.map(function(ref){
      return buildAuthorLabel(ref, deps) + ', ' + (ref && ref.year ? ref.year : 't.y.');
    }).join('; ') + ')';
  }

  return {
    formatAuthorName: formatAuthorName,
    getInlineCitationText: getInlineCitationText,
    buildCitationHTML: buildCitationHTML,
    visibleCitationText: visibleCitationText
  };
});
