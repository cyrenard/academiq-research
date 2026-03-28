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
    if(normalized.length === 1){
      return '<span class="cit" data-ref="' + normalized[0].id + '" contenteditable="false">'
        + getInlineCitationText(normalized[0], deps)
        + '</span> ';
    }
    var parts = normalized.map(function(ref){
      return buildAuthorLabel(ref, deps) + ', ' + (ref && ref.year ? ref.year : 't.y.');
    });
    var ids = normalized.map(function(ref){ return ref.id; }).join(',');
    return '<span class="cit" data-ref="' + ids + '" contenteditable="false">('
      + parts.join('; ')
      + ')</span> ';
  }

  function visibleCitationText(refs, deps){
    var normalized = normalizeRefs(refs, deps);
    if(!normalized.length) return '';
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
