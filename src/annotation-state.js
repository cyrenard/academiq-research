(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  root.AQAnnotationState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function normalizeAnnotation(annotation){
    annotation = annotation || {};
    var out = {
      page: parseInt(annotation.page, 10) || 1,
      x: Number(annotation.x) || 0,
      y: Number(annotation.y) || 0,
      w: Number(annotation.w) || 0,
      h: Number(annotation.h) || 0,
      text: String(annotation.text || '')
    };
    if(annotation.id){
      out.id = String(annotation.id);
    }
    return out;
  }

  function cloneAnnotations(list){
    return (Array.isArray(list) ? list : []).map(normalizeAnnotation);
  }

  function createAnnotation(input){
    input = input || {};
    return normalizeAnnotation({
      page: input.page,
      id: input.id || ('annot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
      x: input.x,
      y: input.y,
      w: input.w == null ? 140 : input.w,
      h: input.h == null ? 30 : input.h,
      text: input.text || ''
    });
  }

  function collectAnnotationsFromElements(elements, deps){
    deps = deps || {};
    var getText = typeof deps.getText === 'function'
      ? deps.getText
      : function(el){
          if(!el) return '';
          var body = typeof el.querySelector === 'function' ? el.querySelector('.pdf-annot-body') : null;
          return body ? (body.value || body.innerText || '') : (el.innerText || '');
        };
    return Array.from(elements || []).map(function(el){
      return normalizeAnnotation({
        page: el && el.dataset ? el.dataset.page : 1,
        id: el && el.dataset ? el.dataset.annotId : '',
        x: el && el.style ? parseFloat(el.style.left) : 0,
        y: el && el.style ? parseFloat(el.style.top) : 0,
        w: el ? (el.offsetWidth || 0) : 0,
        h: el ? (el.offsetHeight || 0) : 0,
        text: getText(el)
      });
    });
  }

  function persistTabAnnotations(tab, annotations){
    if(!tab) return null;
    tab.annots = cloneAnnotations(annotations);
    return tab.annots;
  }

  function persistReferenceAnnotations(ref, annotations){
    if(!ref) return null;
    ref._annots = cloneAnnotations(annotations);
    return ref._annots;
  }

  function buildAnnotationSummary(input){
    input = input || {};
    var text = String(input.text || '').replace(/\s+/g, ' ').trim();
    return {
      id: input.id ? String(input.id) : '',
      page: parseInt(input.page, 10) || 1,
      text: text,
      preview: text.length > 120 ? text.slice(0, 117) + '...' : text,
      empty: text.length === 0
    };
  }

  function filterAnnotationSummaries(items, options){
    options = options || {};
    var filter = String(options.filter || 'all');
    var query = String(options.query || '').toLowerCase().trim();
    return (Array.isArray(items) ? items : []).filter(function(item){
      if(!item) return false;
      if(filter === 'highlight' && item.kind !== 'highlight') return false;
      if(filter === 'note' && item.kind !== 'note') return false;
      if(!query) return true;
      return String(item.text || '').toLowerCase().indexOf(query) !== -1;
    });
  }

  function buildAnnotationReviewModel(items, options){
    options = options || {};
    var all = (Array.isArray(items) ? items : [])
      .map(normalizeDigestItem)
      .filter(function(item){ return item.text; });
    var visible = filterAnnotationSummaries(all, options);
    var pages = {};
    var colors = {};
    all.forEach(function(item){
      pages[item.page] = (pages[item.page] || 0) + 1;
      if(item.color){
        colors[item.color] = (colors[item.color] || 0) + 1;
      }
    });
    var pageGroups = [];
    visible.forEach(function(item){
      var group = pageGroups[pageGroups.length - 1];
      if(!group || group.page !== item.page){
        group = { page: item.page, items: [] };
        pageGroups.push(group);
      }
      group.items.push(item);
    });
    var pageNumbers = Object.keys(pages).map(function(page){ return parseInt(page, 10); }).filter(Boolean).sort(function(a, b){ return a - b; });
    var highlightCount = all.filter(function(item){ return item.kind === 'highlight'; }).length;
    var noteCount = all.filter(function(item){ return item.kind === 'note'; }).length;
    return {
      query: String(options.query || '').trim(),
      filter: String(options.filter || 'all'),
      total: all.length,
      visibleTotal: visible.length,
      highlightCount: highlightCount,
      noteCount: noteCount,
      pageCount: pageNumbers.length,
      pageLabel: pageNumbers.length ? (pageNumbers[0] === pageNumbers[pageNumbers.length - 1] ? ('s. ' + pageNumbers[0]) : ('s. ' + pageNumbers[0] + '-' + pageNumbers[pageNumbers.length - 1])) : '--',
      colorCounts: colors,
      pageGroups: pageGroups,
      items: visible
    };
  }

  function escapeHTML(value){
    return String(value || '').replace(/[&<>"']/g, function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }

  function normalizeDigestItem(item, index){
    item = item || {};
    var text = String(item.text || '').replace(/\s+/g, ' ').trim();
    return {
      id: item.id ? String(item.id) : '',
      kind: item.kind === 'note' ? 'note' : 'highlight',
      page: parseInt(item.page, 10) || 1,
      index: Number.isFinite(Number(item.index)) ? Number(item.index) : index,
      color: item.color ? String(item.color) : '',
      text: text
    };
  }

  function buildAnnotationDigest(items, options){
    options = options || {};
    var title = String(options.title || 'PDF Notları').trim() || 'PDF Notları';
    var citation = String(options.citation || '').trim();
    var includeEmpty = options.includeEmpty === true;
    var normalized = (Array.isArray(items) ? items : [])
      .map(normalizeDigestItem)
      .filter(function(item){ return includeEmpty || item.text; })
      .sort(function(a, b){
        return (a.page - b.page) || (a.kind > b.kind ? 1 : -1) || (a.index - b.index);
      });
    var highlightCount = normalized.filter(function(item){ return item.kind === 'highlight'; }).length;
    var noteCount = normalized.filter(function(item){ return item.kind === 'note'; }).length;
    var grouped = [];
    normalized.forEach(function(item){
      var group = grouped[grouped.length - 1];
      if(!group || group.page !== item.page){
        group = { page: item.page, items: [] };
        grouped.push(group);
      }
      group.items.push(item);
    });

    var md = ['# ' + title];
    if(citation) md.push('', citation);
    md.push('', 'Toplam: ' + normalized.length + ' not/highlight · ' + highlightCount + ' highlight · ' + noteCount + ' not · ' + grouped.length + ' sayfa');
    grouped.forEach(function(group){
      md.push('', '## Sayfa ' + group.page);
      group.items.forEach(function(item){
        md.push('- ' + (item.kind === 'highlight' ? 'Highlight' : 'Not') + ': ' + item.text);
      });
    });

    var html = '<section class="pdf-annotation-digest" data-export-keep="true">';
    html += '<h2>' + escapeHTML(title) + '</h2>';
    if(citation) html += '<p class="ni">' + escapeHTML(citation) + '</p>';
    html += '<p class="ni"><strong>Toplam:</strong> ' + normalized.length + ' not/highlight · ' + highlightCount + ' highlight · ' + noteCount + ' not · ' + grouped.length + ' sayfa</p>';
    grouped.forEach(function(group){
      html += '<h3>Sayfa ' + group.page + '</h3><ul>';
      group.items.forEach(function(item){
        html += '<li><strong>' + (item.kind === 'highlight' ? 'Highlight' : 'Not') + ':</strong> ' + escapeHTML(item.text) + '</li>';
      });
      html += '</ul>';
    });
    if(!normalized.length) html += '<p class="ni">Henüz PDF notu veya highlight yok.</p>';
    html += '</section>';

    return {
      title: title,
      citation: citation,
      count: normalized.length,
      highlightCount: highlightCount,
      noteCount: noteCount,
      pageCount: grouped.length,
      pageGroups: grouped,
      items: normalized,
      markdown: md.join('\n'),
      html: html
    };
  }

  return {
    normalizeAnnotation: normalizeAnnotation,
    cloneAnnotations: cloneAnnotations,
    createAnnotation: createAnnotation,
    collectAnnotationsFromElements: collectAnnotationsFromElements,
    persistTabAnnotations: persistTabAnnotations,
    persistReferenceAnnotations: persistReferenceAnnotations,
    buildAnnotationSummary: buildAnnotationSummary,
    filterAnnotationSummaries: filterAnnotationSummaries,
    buildAnnotationReviewModel: buildAnnotationReviewModel,
    buildAnnotationDigest: buildAnnotationDigest
  };
});
