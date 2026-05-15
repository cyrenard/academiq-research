(function(root, factory){
  var api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.AQLiteratureMatrixFilters = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  var CELL_COLUMNS = ['purpose','method','sample','findings','limitations','myNotes'];
  var DEFAULT_STATE = {
    search: '',
    searchScope: 'all',
    yearRange: { from: '', to: '' },
    metadata: {
      hasDoi: null,
      hasPdf: null,
      metadataHealth: [],
      sourceKinds: [],
      duplicateSuspicion: null
    },
    cellStatus: [],
    methodTypes: [],
    designs: [],
    sampleGroups: [],
    analysisTypes: [],
    findingDirections: [],
    limitationTags: [],
    sourceTypes: [],
    confidence: { min: null, max: null },
    preset: '',
    sort: { key: 'year', direction: 'desc' }
  };

  var LABELS = {
    'purpose:empty': 'Purpose bos',
    'purpose:filled': 'Purpose dolu',
    'method:empty': 'Method bos',
    'method:filled': 'Method dolu',
    'sample:empty': 'Sample bos',
    'sample:filled': 'Sample dolu',
    'findings:empty': 'Findings bos',
    'findings:filled': 'Findings dolu',
    'limitations:empty': 'Limitations bos',
    'limitations:filled': 'Limitations dolu',
    'myNotes:empty': 'My Notes bos',
    'myNotes:filled': 'My Notes dolu',
    incomplete: 'Eksik matrix',
    complete: 'Tam matrix',
    auto_suggested: 'Auto-suggested',
    user_confirmed: 'User-confirmed',
    needs_review: 'Needs-review',
    low_confidence: 'Low-confidence',
    user_edited: 'Kullanici duzenledi',
    pdf_selection: 'PDF secimi',
    auto: 'Otomatik yakalama',
    source_snippet: 'Source snippet',
    page_number: 'Sayfa no',
    zotero: 'Zotero',
    import: 'BibTeX/RIS import',
    duplicate: 'Duplicate supheli',
    good: 'Metadata iyi',
    medium: 'Metadata orta',
    weak: 'Metadata zayif'
  };

  function text(value){
    return String(value == null ? '' : value).trim();
  }

  function normalizeText(value){
    return text(value)
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  function cloneArray(value){
    return Array.isArray(value) ? value.slice() : [];
  }

  function unique(values){
    var seen = {};
    var out = [];
    cloneArray(values).forEach(function(value){
      var key = text(value);
      if(!key || seen[key]) return;
      seen[key] = true;
      out.push(key);
    });
    return out;
  }

  function toBoolOrNull(value){
    if(value === true || value === 'true' || value === 'yes') return true;
    if(value === false || value === 'false' || value === 'no') return false;
    return null;
  }

  function toNumberOrNull(value){
    if(value === '' || value == null) return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeMatrixFilterState(raw){
    var source = raw && typeof raw === 'object' ? raw : {};
    var meta = source.metadata && typeof source.metadata === 'object' ? source.metadata : {};
    var year = source.yearRange && typeof source.yearRange === 'object' ? source.yearRange : {};
    var confidence = source.confidence && typeof source.confidence === 'object' ? source.confidence : {};
    var sort = source.sort && typeof source.sort === 'object' ? source.sort : {};
    return {
      search: text(source.search || ''),
      searchScope: text(source.searchScope || 'all') || 'all',
      yearRange: { from: text(year.from || ''), to: text(year.to || '') },
      metadata: {
        hasDoi: toBoolOrNull(meta.hasDoi),
        hasPdf: toBoolOrNull(meta.hasPdf),
        metadataHealth: unique(meta.metadataHealth),
        sourceKinds: unique(meta.sourceKinds),
        duplicateSuspicion: toBoolOrNull(meta.duplicateSuspicion)
      },
      cellStatus: unique(source.cellStatus),
      methodTypes: unique(source.methodTypes),
      designs: unique(source.designs),
      sampleGroups: unique(source.sampleGroups),
      analysisTypes: unique(source.analysisTypes),
      findingDirections: unique(source.findingDirections),
      limitationTags: unique(source.limitationTags),
      sourceTypes: unique(source.sourceTypes),
      confidence: { min: toNumberOrNull(confidence.min), max: toNumberOrNull(confidence.max) },
      preset: text(source.preset || ''),
      sort: {
        key: text(sort.key || 'year') || 'year',
        direction: text(sort.direction || 'desc') === 'asc' ? 'asc' : 'desc'
      }
    };
  }

  function resetFilterState(){
    return normalizeMatrixFilterState(DEFAULT_STATE);
  }

  function refId(ref){
    return text(ref && ref.id);
  }

  function getRefForRow(row, references, refMap){
    if(!row) return null;
    var id = text(row.referenceId);
    if(refMap && id && refMap[id]) return refMap[id];
    var list = Array.isArray(references) ? references : [];
    for(var i = 0; i < list.length; i += 1){
      if(refId(list[i]) === id) return list[i];
    }
    return null;
  }

  function buildReferenceMap(references){
    var out = {};
    (Array.isArray(references) ? references : []).forEach(function(ref){
      var id = refId(ref);
      if(id) out[id] = ref;
    });
    return out;
  }

  function yearOfRef(ref){
    var raw = text(ref && (ref.year || ref.publishedYear || ref.date || ref.publishedDate));
    var hit = raw.match(/(19|20)\d{2}/);
    return hit ? Number(hit[0]) : 0;
  }

  function hasPdf(ref){
    if(!ref) return false;
    return !!(ref.pdfData || ref.pdfUrl || ref.hasPdf || ref.pdfPath || ref.pdfFileName || ref.pdfStored || ref.pdfStatus === 'present');
  }

  function hasDoi(ref){
    return !!text(ref && ref.doi);
  }

  function authorsCount(ref){
    if(!ref) return 0;
    if(Array.isArray(ref.authors)) return ref.authors.filter(Boolean).length;
    return text(ref.author || ref.authors).length ? 1 : 0;
  }

  function metadataHealth(ref){
    if(!ref) return 'weak';
    if(ref.metadataHealth && typeof ref.metadataHealth === 'string') return normalizeHealth(ref.metadataHealth);
    var score = 0;
    if(text(ref.title)) score += 2;
    if(authorsCount(ref)) score += 2;
    if(yearOfRef(ref)) score += 2;
    if(text(ref.journal || ref.publisher || ref.websiteName)) score += 1;
    if(hasDoi(ref) || text(ref.isbn || ref.url)) score += 1;
    if(score >= 7) return 'good';
    if(score >= 4) return 'medium';
    return 'weak';
  }

  function normalizeHealth(value){
    var key = normalizeText(value);
    if(key.indexOf('good') >= 0 || key.indexOf('iyi') >= 0 || key.indexOf('complete') >= 0) return 'good';
    if(key.indexOf('medium') >= 0 || key.indexOf('orta') >= 0 || key.indexOf('likely') >= 0) return 'medium';
    return 'weak';
  }

  function sourceKinds(ref){
    var hay = normalizeText([
      ref && ref.source,
      ref && ref.importSource,
      ref && ref.importType,
      ref && ref.createdFrom,
      ref && ref.origin,
      ref && ref.browserCaptureMeta ? 'browser' : '',
      ref && (ref.zoteroKey || ref.zoteroItemKey) ? 'zotero' : ''
    ].join(' '));
    var out = [];
    if(hay.indexOf('zotero') >= 0) out.push('zotero');
    if(hay.indexOf('bib') >= 0 || hay.indexOf('ris') >= 0 || hay.indexOf('import') >= 0) out.push('import');
    if(hay.indexOf('browser') >= 0 || hay.indexOf('capture') >= 0) out.push('browser_capture');
    return out;
  }

  function cellsOf(row){
    var cells = row && row.cells && typeof row.cells === 'object' ? row.cells : {};
    return CELL_COLUMNS.map(function(key){
      return { key: key, cell: cells[key] && typeof cells[key] === 'object' ? cells[key] : { text: '' } };
    });
  }

  function cellText(cell){
    return text(cell && cell.text);
  }

  function isFilled(cell){
    return !!cellText(cell);
  }

  function rowFullText(row, ref, scope){
    var refText = [
      ref && ref.title,
      ref && (Array.isArray(ref.authors) ? ref.authors.join(' ') : ref.authors || ref.author),
      ref && ref.year,
      ref && ref.journal,
      ref && ref.abstract,
      ref && ref.note
    ].join(' ');
    if(scope === 'titleAuthor') return refText;
    var cellParts = cellsOf(row).map(function(item){ return cellText(item.cell); }).join(' ');
    if(scope === 'cells') return cellParts;
    if(scope && CELL_COLUMNS.indexOf(scope) >= 0){
      return cellText(row && row.cells && row.cells[scope]);
    }
    return refText + ' ' + cellParts;
  }

  function getGapApi(){
    if(typeof globalThis !== 'undefined' && globalThis.AQLiteratureGapMap) return globalThis.AQLiteratureGapMap;
    if(typeof require === 'function'){
      try{ return require('./literature-gap-map.js'); }catch(_e){}
    }
    return null;
  }

  function tagRow(row){
    var gap = getGapApi();
    if(gap && typeof gap.tagRows === 'function'){
      var tagged = gap.tagRows([row]);
      return tagged && tagged[0] ? tagged[0] : {};
    }
    return {};
  }

  function rowStatuses(row){
    var out = {};
    var filledCount = 0;
    cellsOf(row).forEach(function(item){
      var filled = isFilled(item.cell);
      if(filled) filledCount += 1;
      out[item.key + ':' + (filled ? 'filled' : 'empty')] = true;
      var status = text(item.cell.status);
      if(status) out[status] = true;
    });
    out.incomplete = filledCount < CELL_COLUMNS.length;
    out.complete = filledCount === CELL_COLUMNS.length;
    return out;
  }

  function sourceTypesForRow(row){
    var out = {};
    cellsOf(row).forEach(function(item){
      var cell = item.cell || {};
      var sources = [];
      if(cell.source) sources.push(cell.source);
      if(Array.isArray(cell.sources)) sources = sources.concat(cell.sources);
      if(Array.isArray(cell.candidates)){
        cell.candidates.forEach(function(candidate){
          if(candidate && candidate.source) sources.push(candidate.source);
        });
      }
      if(text(cell.status) === 'user_edited') out.user_edited = true;
      sources.forEach(function(source){
        var type = normalizeText(source && source.extractionType);
        if(type.indexOf('pdf-selection') >= 0 || type.indexOf('pdf selection') >= 0) out.pdf_selection = true;
        if(type.indexOf('rule') >= 0 || type.indexOf('auto') >= 0) out.auto = true;
        if(text(source && source.snippet)) out.source_snippet = true;
        if(text(source && source.page)) out.page_number = true;
      });
    });
    return out;
  }

  function maxConfidence(row){
    var max = 0;
    cellsOf(row).forEach(function(item){
      var cell = item.cell || {};
      var values = [];
      if(cell.source) values.push(cell.source.confidence);
      if(Array.isArray(cell.sources)) cell.sources.forEach(function(source){ values.push(source && source.confidence); });
      if(Array.isArray(cell.candidates)) cell.candidates.forEach(function(candidate){ values.push(candidate && candidate.confidence); });
      values.forEach(function(value){
        var num = Number(value);
        if(Number.isFinite(num) && num > max) max = num;
      });
    });
    return max;
  }

  function missingCount(row){
    var count = 0;
    cellsOf(row).forEach(function(item){ if(!isFilled(item.cell)) count += 1; });
    return count;
  }

  function filledCount(row){
    return CELL_COLUMNS.length - missingCount(row);
  }

  function buildDuplicateMap(references){
    var counts = {};
    (Array.isArray(references) ? references : []).forEach(function(ref){
      var doi = normalizeText(ref && ref.doi);
      var title = normalizeText(ref && ref.title);
      var year = yearOfRef(ref);
      var key = doi ? ('doi:' + doi) : (title ? ('title:' + title + ':' + year) : '');
      if(key) counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }

  function isDuplicateSuspicious(ref, duplicateMap){
    if(!ref) return false;
    if(ref.duplicate || ref.duplicateCandidate || ref.duplicateGroupId) return true;
    var doi = normalizeText(ref.doi);
    var title = normalizeText(ref.title);
    var key = doi ? ('doi:' + doi) : (title ? ('title:' + title + ':' + yearOfRef(ref)) : '');
    return !!(key && duplicateMap && duplicateMap[key] > 1);
  }

  function includesAny(actual, expected){
    if(!expected || !expected.length) return true;
    var list = Array.isArray(actual) ? actual : [actual];
    return expected.some(function(item){ return list.indexOf(item) >= 0; });
  }

  function normalizeFacetValue(value){
    var raw = text(value);
    var key = normalizeText(raw);
    if(key === 'quantitative' || key === 'nicel') return 'quantitative';
    if(key === 'qualitative' || key === 'nitel') return 'qualitative';
    if(key === 'mixed' || key === 'karma') return 'mixed';
    if(key.indexOf('cross') >= 0 || key.indexOf('kesitsel') >= 0) return 'cross-sectional';
    if(key.indexOf('longitudinal') >= 0 || key.indexOf('boylamsal') >= 0) return 'longitudinal';
    if(key.indexOf('quasi') >= 0 || key.indexOf('yari deneysel') >= 0) return 'quasi-experimental';
    if(key.indexOf('experimental') >= 0 || key.indexOf('deneysel') >= 0) return 'experimental';
    if(key.indexOf('phenomenology') >= 0 || key.indexOf('fenomen') >= 0 || key.indexOf('olgu') >= 0) return 'phenomenology';
    if(key.indexOf('case study') >= 0 || key.indexOf('durum') >= 0) return 'case study';
    if(key.indexOf('correlational') >= 0 || key.indexOf('iliskisel') >= 0) return 'correlational';
    if(key.indexOf('undergraduate') >= 0 || key.indexOf('universite ogrenc') >= 0) return 'undergraduate students';
    if(key.indexOf('adolescent') >= 0 || key.indexOf('ergen') >= 0) return 'adolescents';
    if(key.indexOf('preservice') >= 0 || key.indexOf('ogretmen aday') >= 0) return 'preservice teachers';
    if(key.indexOf('teacher') >= 0 || key.indexOf('ogretmen') >= 0) return 'teachers';
    if(key.indexOf('counselor') >= 0 || key.indexOf('psikolojik danisman') >= 0) return 'counselors';
    if(key.indexOf('parent') >= 0 || key.indexOf('ebeveyn') >= 0) return 'parents';
    if(key.indexOf('clinical') >= 0 || key.indexOf('klinik') >= 0) return 'clinical sample';
    if(key.indexOf('adult') >= 0 || key.indexOf('yetiskin') >= 0) return 'adult sample';
    if(key.indexOf('turkish') >= 0 || key.indexOf('turkiye') >= 0) return 'Turkish sample';
    if(key.indexOf('international') >= 0) return 'international sample';
    if(key.indexOf('regression') >= 0 || key.indexOf('regresyon') >= 0) return 'regression';
    if(key.indexOf('correlation') >= 0 || key.indexOf('korelasyon') >= 0) return 'correlation';
    if(key === 'sem' || key.indexOf('yapisal') >= 0) return 'SEM';
    if(key.indexOf('mediation') >= 0 || key.indexOf('aracilik') >= 0) return 'mediation';
    if(key.indexOf('moderation') >= 0 || key.indexOf('duzenleyicilik') >= 0) return 'moderation';
    if(key.indexOf('thematic') >= 0 || key.indexOf('tematik') >= 0) return 'thematic analysis';
    if(key.indexOf('content') >= 0 || key.indexOf('icerik') >= 0) return 'content analysis';
    if(key.indexOf('descriptive') >= 0 || key.indexOf('betimsel') >= 0) return 'descriptive analysis';
    if(key.indexOf('positive') >= 0 || key.indexOf('pozitif') >= 0) return 'positive';
    if(key.indexOf('negative') >= 0 || key.indexOf('negatif') >= 0) return 'negative';
    if(key.indexOf('no significant') >= 0 || key.indexOf('nonsignificant') >= 0 || key.indexOf('anlamli degil') >= 0) return 'nonsignificant';
    if(key.indexOf('self-report') >= 0 || key.indexOf('oz bildirim') >= 0) return 'self-report';
    if(key.indexOf('small sample') >= 0 || key.indexOf('kucuk orneklem') >= 0) return 'small sample';
    if(key.indexOf('convenience') >= 0 || key.indexOf('kolay') >= 0) return 'convenience sample';
    if(key.indexOf('single country') >= 0 || key.indexOf('single culture') >= 0 || key.indexOf('tek ulke') >= 0) return 'single country';
    if(key.indexOf('generalizability') >= 0 || key.indexOf('genellenebilir') >= 0) return 'generalizability';
    if(key.indexOf('causality') >= 0 || key.indexOf('nedensel') >= 0) return 'causality';
    if(key.indexOf('measurement') >= 0 || key.indexOf('olcum') >= 0) return 'measurement limitation';
    if(key.indexOf('future research') >= 0 || key.indexOf('gelecek') >= 0) return 'future research';
    return raw;
  }

  function facetIncludes(actual, expected){
    if(!expected || !expected.length) return true;
    var actualList = (Array.isArray(actual) ? actual : [actual]).map(normalizeFacetValue);
    return expected.map(normalizeFacetValue).some(function(item){ return actualList.indexOf(item) >= 0; });
  }

  function matchRow(row, ref, filterState, duplicateMap){
    var state = normalizeMatrixFilterState(filterState);
    if(state.preset && !matchPreset(row, ref, state.preset, duplicateMap)) return false;
    if(state.search){
      var hay = normalizeText(rowFullText(row, ref, state.searchScope));
      if(hay.indexOf(normalizeText(state.search)) < 0) return false;
    }
    var year = yearOfRef(ref);
    var from = Number(state.yearRange.from || 0);
    var to = Number(state.yearRange.to || 0);
    if(from && (!year || year < from)) return false;
    if(to && (!year || year > to)) return false;
    if(state.metadata.hasDoi !== null && hasDoi(ref) !== state.metadata.hasDoi) return false;
    if(state.metadata.hasPdf !== null && hasPdf(ref) !== state.metadata.hasPdf) return false;
    if(state.metadata.metadataHealth.length && state.metadata.metadataHealth.indexOf(metadataHealth(ref)) < 0) return false;
    if(state.metadata.sourceKinds.length && !includesAny(sourceKinds(ref), state.metadata.sourceKinds)) return false;
    if(state.metadata.duplicateSuspicion !== null && isDuplicateSuspicious(ref, duplicateMap) !== state.metadata.duplicateSuspicion) return false;

    var statuses = rowStatuses(row);
    if(state.cellStatus.length && !state.cellStatus.every(function(status){ return !!statuses[status]; })) return false;

    var tags = tagRow(row);
    if(state.methodTypes.length && !facetIncludes(tags.methodType, state.methodTypes)) return false;
    if(state.designs.length && !facetIncludes(tags.design, state.designs)) return false;
    if(state.sampleGroups.length && !facetIncludes(tags.sampleGroup, state.sampleGroups)) return false;
    if(state.analysisTypes.length && !facetIncludes(tags.analysisType, state.analysisTypes)) return false;
    if(state.findingDirections.length && !facetIncludes(tags.findingDirection, state.findingDirections)) return false;
    if(state.limitationTags.length && !facetIncludes(tags.limitationTags || [], state.limitationTags)) return false;

    var sourceTypes = sourceTypesForRow(row);
    if(state.sourceTypes.length && !state.sourceTypes.every(function(kind){ return !!sourceTypes[kind]; })) return false;
    var confidence = maxConfidence(row);
    if(state.confidence.min !== null && confidence < state.confidence.min) return false;
    if(state.confidence.max !== null && confidence > state.confidence.max) return false;
    return true;
  }

  function matchPreset(row, ref, presetName, duplicateMap){
    var name = normalizeText(presetName);
    var statuses = rowStatuses(row);
    var tags = tagRow(row);
    var sources = sourceTypesForRow(row);
    if(name === 'review-needed'){
      return !!(statuses.needs_review || statuses.low_confidence || statuses.incomplete || metadataHealth(ref) === 'weak' || !hasDoi(ref) || !yearOfRef(ref) || authorsCount(ref) === 0);
    }
    if(name === 'recent-evidence'){
      return yearOfRef(ref) >= currentYear() - 4 && hasPdf(ref) && metadataHealth(ref) === 'good';
    }
    if(name === 'method-gap-finder') return !!cellText(row && row.cells && row.cells.method);
    if(name === 'sample-gap-finder') return !!cellText(row && row.cells && row.cells.sample);
    if(name === 'limitation-based-gap') return !!cellText(row && row.cells && row.cells.limitations) && (tags.limitationTags || []).length > 0;
    if(name === 'incomplete-matrix') return !!statuses.incomplete;
    if(name === 'user-confirmed-evidence') return !!(statuses.user_confirmed && sources.pdf_selection);
    if(name === 'duplicate-suspicion') return isDuplicateSuspicious(ref, duplicateMap);
    return true;
  }

  function sortMatrixRows(rows, references, sortState){
    if(references && !Array.isArray(references) && !sortState){
      sortState = references;
      references = [];
    }
    var list = Array.isArray(rows) ? rows.slice() : [];
    var refMap = buildReferenceMap(references);
    var sort = normalizeMatrixFilterState({ sort: sortState }).sort;
    var dir = sort.direction === 'asc' ? 1 : -1;
    list.sort(function(a, b){
      var ra = getRefForRow(a, references, refMap);
      var rb = getRefForRow(b, references, refMap);
      var av = 0;
      var bv = 0;
      if(sort.key === 'author'){
        av = normalizeText((Array.isArray(ra && ra.authors) ? ra.authors[0] : (ra && (ra.author || ra.authors))) || ra && ra.title);
        bv = normalizeText((Array.isArray(rb && rb.authors) ? rb.authors[0] : (rb && (rb.author || rb.authors))) || rb && rb.title);
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
      }
      if(sort.key === 'confidence'){
        av = maxConfidence(a);
        bv = maxConfidence(b);
      }else if(sort.key === 'metadataHealth'){
        var rank = { good: 3, medium: 2, weak: 1 };
        av = rank[metadataHealth(ra)] || 0;
        bv = rank[metadataHealth(rb)] || 0;
      }else if(sort.key === 'missing'){
        av = missingCount(a);
        bv = missingCount(b);
      }else if(sort.key === 'filled'){
        av = filledCount(a);
        bv = filledCount(b);
      }else if(sort.key === 'updatedAt'){
        av = Number(a && a.updatedAt) || 0;
        bv = Number(b && b.updatedAt) || 0;
      }else{
        av = yearOfRef(ra);
        bv = yearOfRef(rb);
      }
      if(av === bv) return normalizeText(ra && ra.title) < normalizeText(rb && rb.title) ? -1 : 1;
      return av < bv ? -1 * dir : 1 * dir;
    });
    return list;
  }

  function buildActiveFilterChips(filterState){
    var state = normalizeMatrixFilterState(filterState);
    var chips = [];
    if(state.search) chips.push({ id: 'search', label: 'Arama: ' + state.search });
    if(state.yearRange.from) chips.push({ id: 'yearFrom', label: state.yearRange.from + ' sonrasi' });
    if(state.yearRange.to) chips.push({ id: 'yearTo', label: state.yearRange.to + ' oncesi' });
    if(state.metadata.hasDoi !== null) chips.push({ id: 'hasDoi', label: state.metadata.hasDoi ? 'DOI var' : 'DOI yok' });
    if(state.metadata.hasPdf !== null) chips.push({ id: 'hasPdf', label: state.metadata.hasPdf ? 'PDF var' : 'PDF yok' });
    if(state.metadata.duplicateSuspicion !== null) chips.push({ id: 'duplicateSuspicion', label: state.metadata.duplicateSuspicion ? 'Duplicate supheli' : 'Duplicate degil' });
    if(state.preset) chips.push({ id: 'preset', label: 'Preset: ' + state.preset });
    state.metadata.metadataHealth.forEach(function(item){ chips.push({ id: 'metadataHealth:' + item, label: LABELS[item] || item }); });
    state.metadata.sourceKinds.forEach(function(item){ chips.push({ id: 'sourceKinds:' + item, label: LABELS[item] || item }); });
    state.cellStatus.forEach(function(item){ chips.push({ id: 'cellStatus:' + item, label: LABELS[item] || item }); });
    [
      ['methodTypes', state.methodTypes],
      ['designs', state.designs],
      ['sampleGroups', state.sampleGroups],
      ['analysisTypes', state.analysisTypes],
      ['findingDirections', state.findingDirections],
      ['limitationTags', state.limitationTags],
      ['sourceTypes', state.sourceTypes]
    ].forEach(function(pair){
      pair[1].forEach(function(item){ chips.push({ id: pair[0] + ':' + item, label: LABELS[item] || item }); });
    });
    if(state.confidence.min !== null) chips.push({ id: 'confidenceMin', label: 'Confidence >= ' + state.confidence.min });
    if(state.confidence.max !== null) chips.push({ id: 'confidenceMax', label: 'Confidence <= ' + state.confidence.max });
    return chips;
  }

  function removeFilterChip(filterState, chipId){
    var state = normalizeMatrixFilterState(filterState);
    var id = text(chipId);
    if(id === 'search') state.search = '';
    else if(id === 'yearFrom') state.yearRange.from = '';
    else if(id === 'yearTo') state.yearRange.to = '';
    else if(id === 'hasDoi') state.metadata.hasDoi = null;
    else if(id === 'hasPdf') state.metadata.hasPdf = null;
    else if(id === 'duplicateSuspicion') state.metadata.duplicateSuspicion = null;
    else if(id === 'preset') state.preset = '';
    else if(id === 'confidenceMin') state.confidence.min = null;
    else if(id === 'confidenceMax') state.confidence.max = null;
    else if(id.indexOf(':') > 0){
      var parts = id.split(':');
      var bucket = parts[0];
      var value = parts.slice(1).join(':');
      if(bucket === 'metadataHealth') state.metadata.metadataHealth = state.metadata.metadataHealth.filter(function(item){ return item !== value; });
      else if(bucket === 'sourceKinds') state.metadata.sourceKinds = state.metadata.sourceKinds.filter(function(item){ return item !== value; });
      else if(bucket === 'cellStatus') state.cellStatus = state.cellStatus.filter(function(item){ return item !== value; });
      else if(Array.isArray(state[bucket])) state[bucket] = state[bucket].filter(function(item){ return item !== value; });
    }
    return state;
  }

  function applyMatrixFilters(rows, references, filterState){
    var state = normalizeMatrixFilterState(filterState);
    var list = Array.isArray(rows) ? rows : [];
    var refMap = buildReferenceMap(references);
    var dupMap = buildDuplicateMap(references);
    var filtered = list.filter(function(row){
      return matchRow(row, getRefForRow(row, references, refMap), state, dupMap);
    });
    filtered = sortMatrixRows(filtered, references, state.sort);
    return {
      rows: filtered,
      total: list.length,
      filtered: filtered.length,
      activeFilters: buildActiveFilterChips(state),
      state: state
    };
  }

  function inc(map, key){
    var safe = text(key || 'unclear');
    map[safe] = (map[safe] || 0) + 1;
  }

  function deriveFilterFacets(rows, references){
    var refMap = buildReferenceMap(references);
    var facets = {
      years: {},
      metadataHealth: {},
      methodTypes: {},
      designs: {},
      sampleGroups: {},
      analysisTypes: {},
      findingDirections: {},
      limitationTags: {},
      sourceTypes: {},
      cellStatus: {}
    };
    (Array.isArray(rows) ? rows : []).forEach(function(row){
      var ref = getRefForRow(row, references, refMap);
      if(yearOfRef(ref)) inc(facets.years, yearOfRef(ref));
      inc(facets.metadataHealth, metadataHealth(ref));
      var statuses = rowStatuses(row);
      Object.keys(statuses).forEach(function(key){ if(statuses[key]) inc(facets.cellStatus, key); });
      var tags = tagRow(row);
      inc(facets.methodTypes, tags.methodType || 'unclear');
      inc(facets.designs, tags.design || 'unclear');
      inc(facets.sampleGroups, tags.sampleGroup || 'unclear');
      inc(facets.analysisTypes, tags.analysisType || 'unclear');
      inc(facets.findingDirections, tags.findingDirection || 'unclear');
      (tags.limitationTags || []).forEach(function(tag){ inc(facets.limitationTags, tag); });
      var types = sourceTypesForRow(row);
      Object.keys(types).forEach(function(type){ if(types[type]) inc(facets.sourceTypes, type); });
    });
    return facets;
  }

  function currentYear(){
    return new Date().getFullYear();
  }

  function buildPresetFilter(presetName){
    var name = normalizeText(presetName);
    var state = resetFilterState();
    if(name === 'review-needed' || name === 'review needed'){
      state.preset = 'review-needed';
      state.sort = { key: 'missing', direction: 'desc' };
    }else if(name === 'recent-evidence' || name === 'recent evidence'){
      state.preset = 'recent-evidence';
      state.sort = { key: 'year', direction: 'desc' };
    }else if(name === 'method-gap-finder' || name === 'method gap finder'){
      state.preset = 'method-gap-finder';
      state.sort = { key: 'year', direction: 'desc' };
    }else if(name === 'sample-gap-finder' || name === 'sample gap finder'){
      state.preset = 'sample-gap-finder';
      state.sort = { key: 'year', direction: 'desc' };
    }else if(name === 'limitation-based-gap' || name === 'limitation based gap'){
      state.preset = 'limitation-based-gap';
      state.sort = { key: 'year', direction: 'desc' };
    }else if(name === 'incomplete-matrix' || name === 'incomplete matrix'){
      state.preset = 'incomplete-matrix';
      state.sort = { key: 'missing', direction: 'desc' };
    }else if(name === 'user-confirmed-evidence' || name === 'user confirmed evidence'){
      state.preset = 'user-confirmed-evidence';
      state.sort = { key: 'confidence', direction: 'desc' };
    }
    return normalizeMatrixFilterState(state);
  }

  function buildFilterForGapCandidate(candidate){
    var state = resetFilterState();
    var source = candidate && typeof candidate === 'object' ? candidate : {};
    var type = text(source.type);
    var label = normalizeText(source.label || '');
    if(type === 'methodological_gap' || label.indexOf('boylamsal') >= 0){
      state.designs = ['cross-sectional'];
    }else if(type === 'sample_gap' || label.indexOf('orneklem') >= 0 || label.indexOf('sample') >= 0){
      state.sampleGroups = ['undergraduate students'];
    }else if(type === 'measurement_gap' || label.indexOf('self-report') >= 0 || label.indexOf('oz bildirim') >= 0){
      state.limitationTags = ['self-report'];
    }else if(type === 'context_gap'){
      state.sampleGroups = ['Turkish sample'];
    }else{
      state.cellStatus = ['incomplete'];
    }
    return normalizeMatrixFilterState(state);
  }

  return {
    DEFAULT_STATE: DEFAULT_STATE,
    CELL_COLUMNS: CELL_COLUMNS,
    LABELS: LABELS,
    normalizeMatrixFilterState: normalizeMatrixFilterState,
    resetFilterState: resetFilterState,
    applyMatrixFilters: applyMatrixFilters,
    deriveFilterFacets: deriveFilterFacets,
    sortMatrixRows: sortMatrixRows,
    buildPresetFilter: buildPresetFilter,
    buildFilterForGapCandidate: buildFilterForGapCandidate,
    buildActiveFilterChips: buildActiveFilterChips,
    removeFilterChip: removeFilterChip,
    metadataHealth: metadataHealth,
    sourceTypesForRow: sourceTypesForRow,
    maxConfidence: maxConfidence
  };
});
