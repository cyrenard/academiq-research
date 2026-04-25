(function(root, factory){
  if(typeof module === 'object' && module.exports){
    module.exports = factory();
  }else{
    root.AQLeanUIShell = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  var DEFAULT_TABS = [
    {id:'outline', label:'Anahat', icon:'O'},
    {id:'linter', label:'APA', icon:'A'},
    {id:'citegraph', label:'Atif', icon:'C'},
    {id:'suggest', label:'Oneri', icon:'S'},
    {id:'pdfnotes', label:'PDF Notlari', icon:'P'},
    {id:'track', label:'Inceleme', icon:'T'},
    {id:'history', label:'Gecmis', icon:'H'}
  ];
  var PANEL_WIDTH_KEY = 'academiq.leanUi.sidePanelWidth';
  var PANEL_TAB_KEY = 'academiq.leanUi.sidePanelTab';
  var RECENT_COMMANDS_KEY = 'academiq.leanUi.recentCommands';
  var LINTER_IGNORES_KEY = 'academiq.leanUi.ignoredLinterIssues';
  var MAX_RECENT_COMMANDS = 6;
  var PANEL_WIDTH_DEFAULT = 360;
  var PANEL_WIDTH_MIN = 280;
  var PANEL_WIDTH_MAX = 560;
  var FALLBACK_CITATION_STYLES = [
    { id:'apa7', label:'APA 7' },
    { id:'mla', label:'MLA' },
    { id:'chicago-author-date', label:'Chicago AD' },
    { id:'ieee', label:'IEEE' },
    { id:'harvard', label:'Harvard' }
  ];

  function normalizeText(value){
    return String(value == null ? '' : value)
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeCitationStyleId(value, normalizeFn){
    var raw = String(value || '').trim().toLowerCase();
    if(typeof normalizeFn === 'function'){
      try{
        return String(normalizeFn(raw) || 'apa7').trim().toLowerCase() || 'apa7';
      }catch(_error){}
    }
    if(raw === 'apa' || raw === 'apa 7' || raw === 'apa-7') return 'apa7';
    if(raw === 'chicago' || raw === 'chicago-ad' || raw === 'chicago_author_date') return 'chicago-author-date';
    if(raw === 'ieee') return 'ieee';
    if(raw === 'mla') return 'mla';
    if(raw === 'harvard') return 'harvard';
    return raw || 'apa7';
  }

  function normalizeCitationStyleCatalog(styles, normalizeFn){
    var seen = {};
    var out = [];
    (Array.isArray(styles) ? styles : []).forEach(function(style){
      if(!style || typeof style !== 'object') return;
      var id = normalizeCitationStyleId(style.id, normalizeFn);
      if(!id || seen[id]) return;
      seen[id] = true;
      var label = String(style.label || '').trim();
      out.push({id:id, label:label || id.toUpperCase()});
    });
    if(!out.length){
      return FALLBACK_CITATION_STYLES.map(function(style){
        return {id:style.id, label:style.label};
      });
    }
    return out;
  }

  function resolveCitationStyleLabel(styleId, styles){
    var id = normalizeCitationStyleId(styleId);
    var list = normalizeCitationStyleCatalog(styles);
    var found = list.find(function(style){ return style && style.id === id; });
    return found ? found.label : 'APA 7';
  }

  function scoreCommand(command, query){
    var q = normalizeText(query);
    if(!q) return 1;
    if(normalizeText(command && command.title) === q) return 100;
    var haystack = normalizeText([
      command && command.title,
      command && command.section,
      command && command.keywords && command.keywords.join(' ')
    ].filter(Boolean).join(' '));
    if(!haystack) return 0;
    if(haystack === q) return 100;
    if(haystack.indexOf(q) === 0) return 80;
    if(haystack.indexOf(' ' + q) >= 0) return 65;
    if(haystack.indexOf(q) >= 0) return 45;
    var parts = q.split(' ').filter(Boolean);
    if(parts.length && parts.every(function(part){ return haystack.indexOf(part) >= 0; })){
      return 30 + parts.length;
    }
    return 0;
  }

  function filterCommands(commands, query, limit, recentCommandIds){
    var q = normalizeText(query);
    var recentRank = {};
    (Array.isArray(recentCommandIds) ? recentCommandIds : []).forEach(function(id, index){
      if(id && !recentRank[id]) recentRank[id] = MAX_RECENT_COMMANDS - index;
    });
    return (commands || [])
      .map(function(command){
        var score = scoreCommand(command, query);
        if(!q && command && command.id && recentRank[command.id]){
          score += 100 + recentRank[command.id];
        }
        return {command:command, score:score};
      })
      .filter(function(item){ return item.score > 0; })
      .sort(function(a,b){
        if(b.score !== a.score) return b.score - a.score;
        return String(a.command.title || '').localeCompare(String(b.command.title || ''), 'tr');
      })
      .slice(0, limit || 12)
      .map(function(item){ return item.command; });
  }

  function normalizeRecentCommandIds(ids, knownIds, limit){
    var known = {};
    (Array.isArray(knownIds) ? knownIds : []).forEach(function(id){ if(id) known[String(id)] = true; });
    var hasKnownFilter = Object.keys(known).length > 0;
    var seen = {};
    var out = [];
    (Array.isArray(ids) ? ids : []).forEach(function(id){
      var value = String(id || '').trim();
      if(!value || seen[value]) return;
      if(hasKnownFilter && !known[value]) return;
      seen[value] = true;
      out.push(value);
    });
    return out.slice(0, Number(limit || MAX_RECENT_COMMANDS) || MAX_RECENT_COMMANDS);
  }

  function recordRecentCommandId(ids, commandId, limit){
    var id = String(commandId || '').trim();
    if(!id) return normalizeRecentCommandIds(ids, [], limit);
    return normalizeRecentCommandIds([id].concat(Array.isArray(ids) ? ids : []), [], limit);
  }

  function buildCommandPaletteItemModel(command){
    var item = command || {};
    return {
      id: item.id || '',
      icon: item.icon || 'K',
      title: item.title || item.id || 'Komut',
      section: item.section || '',
      shortcut: item.shortcut || '',
      description: item.description || ''
    };
  }

  function sanitizeReadabilityText(text){
    return String(text || '')
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/\bdoi:\s*10\.\S+/gi, ' ')
      .replace(/\((?=[^)]*(?:\b\d{4}[a-z]?\b|et al\.|vd\.|v\.d\.))[^)]*\)/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function computeReadabilityReport(text){
    var normalized = sanitizeReadabilityText(text);
    var words = normalized ? (normalized.match(/[^\s]+/g) || []) : [];
    var sentenceMatches = normalized ? (normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []) : [];
    var sentences = sentenceMatches
      .map(function(sentence){ return sentence.trim(); })
      .filter(function(sentence){ return (sentence.match(/[^\s]+/g) || []).length >= 3; });
    var sentenceCount = sentences.length || 0;
    var wordCount = words.length;
    var avg = sentenceCount ? wordCount / sentenceCount : 0;
    var longSentences = sentences.filter(function(sentence){
      return (sentence.match(/[^\s]+/g) || []).length > 35;
    }).length;
    var veryLongSentences = sentences.filter(function(sentence){
      return (sentence.match(/[^\s]+/g) || []).length > 55;
    }).length;
    var tone = 'ok';
    var label = 'Okunabilirlik sakin';
    if(wordCount < 120 || sentenceCount < 3){
      tone = 'neutral';
      label = 'Okunabilirlik icin metin az';
    }else if(avg > 35 || veryLongSentences > 0){
      tone = 'warning';
      label = 'Cumleler uzun';
    }else if(avg > 28 || longSentences > 0){
      tone = 'watch';
      label = 'Okunabilirlik izlenmeli';
    }
    return {
      words: wordCount,
      sentences: sentenceCount,
      avgWordsPerSentence: Math.round(avg * 10) / 10,
      longSentences: longSentences,
      veryLongSentences: veryLongSentences,
      tone: tone,
      label: label
    };
  }

  function summarizeReferenceHealth(refs, healthApi){
    var list = Array.isArray(refs) ? refs : [];
    var summary = {total:list.length, complete:0, incomplete:0, suspicious:0, issueCounts:{}};
    if(healthApi && typeof healthApi.summarizeHealth === 'function'){
      try{
        var external = healthApi.summarizeHealth(list);
        if(external && typeof external === 'object') return external;
      }catch(_error){}
    }
    list.forEach(function(ref){
      ref = ref || {};
      var missing = [];
      var type = normalizeReferenceHealthType(ref);
      if(!String(ref.title || '').trim()) missing.push('missing_title');
      if(!Array.isArray(ref.authors) || !ref.authors.filter(Boolean).length) missing.push('missing_authors');
      if(!String(ref.year || '').trim()) missing.push('missing_year');
      if(type === 'book' && !String(ref.publisher || '').trim()) missing.push('missing_publisher');
      if(type === 'website' && !String(ref.url || '').trim()) missing.push('missing_url');
      if(missing.length){
        summary.incomplete += 1;
        missing.forEach(function(code){ summary.issueCounts[code] = (summary.issueCounts[code] || 0) + 1; });
        return;
      }
      if(type === 'article' && !String(ref.journal || '').trim()){
        summary.suspicious += 1;
        summary.issueCounts.missing_container = (summary.issueCounts.missing_container || 0) + 1;
        return;
      }
      if(type === 'article' && !String(ref.doi || ref.url || ref.fp || ref.lp || '').trim()){
        summary.suspicious += 1;
        summary.issueCounts.missing_locator = (summary.issueCounts.missing_locator || 0) + 1;
        return;
      }
      if(type === 'article' && !String(ref.doi || '').trim()){
        summary.suspicious += 1;
        summary.issueCounts.missing_doi = (summary.issueCounts.missing_doi || 0) + 1;
        return;
      }
      summary.complete += 1;
    });
    return summary;
  }

  function normalizeReferenceHealthType(ref){
    var raw = String(ref && ref.referenceType || '').trim().toLowerCase();
    if(raw === 'book' || raw === 'website' || raw === 'article') return raw;
    if(ref && (ref.websiteName || ref.publishedDate || ref.accessedDate)) return 'website';
    if(ref && ref.publisher && !ref.journal) return 'book';
    return 'article';
  }

  function buildCitationCoverageSummary(paragraphs){
    var items = Array.isArray(paragraphs) ? paragraphs : [];
    var summary = {
      totalParagraphs: 0,
      longParagraphs: 0,
      uncoveredLongParagraphs: 0
    };
    items.forEach(function(paragraph){
      var item = paragraph || {};
      var words = Number(item.wordCount || 0) || 0;
      var sentences = Number(item.sentenceCount || 0) || 0;
      var hasCitation = !!item.hasCitation;
      var meaningful = words >= 25 || sentences >= 2;
      if(!meaningful) return;
      summary.totalParagraphs += 1;
      var isLong = words >= 85 || sentences >= 3;
      if(!isLong) return;
      summary.longParagraphs += 1;
      if(!hasCitation) summary.uncoveredLongParagraphs += 1;
    });
    return summary;
  }

  function buildQualityReport(input){
    input = input || {};
    var refs = Array.isArray(input.refs) ? input.refs : [];
    var citationIds = Array.isArray(input.citationIds) ? input.citationIds : [];
    var citationCount = Number(input.citationCount || citationIds.length || 0) || 0;
    var bibliographyText = String(input.bibliographyText || '').trim();
    var health = summarizeReferenceHealth(refs, input.healthApi || null);
    var consistency = buildCitationConsistencyReport({
      refs: refs,
      citationIds: citationIds,
      bibliographyEntryCount: input.bibliographyEntryCount,
      bibliographyManual: input.bibliographyManual
    });
    var citationCoverage = input.citationCoverage || null;
    var grammar = input.grammar && typeof input.grammar === 'object'
      ? input.grammar
      : null;
    var issues = [];
    if(citationCount > 0 && refs.length === 0){
      issues.push({severity:'error', code:'citations_without_library', message:'Metinde atif var ama aktif workspace library bos gorunuyor.'});
    }
    if(citationCount > 0 && !bibliographyText){
      issues.push({severity:'warning', code:'missing_bibliography_page', message:'Kaynak var; kaynakca sayfasi bos veya henuz olusturulmamis.'});
    }
    if(health.incomplete > 0){
      issues.push({severity:'error', code:'incomplete_references', message:health.incomplete + ' kaynakta zorunlu kunye alani eksik.'});
    }
    if(health.suspicious > 0){
      issues.push({severity:'warning', code:'suspicious_references', message:health.suspicious + ' kaynakta DOI/URL/sayfa veya PDF dogrulama riski var.'});
    }
    if((health.issueCounts && Number(health.issueCounts.missing_doi || 0) > 0)){
      issues.push({severity:'warning', code:'missing_doi', message:health.issueCounts.missing_doi + ' makale kaynaginda DOI eksik gorunuyor.'});
    }
    if(input.lineSpacing && Number(input.lineSpacing) < 1.9){
      issues.push({severity:'warning', code:'line_spacing', message:'Satir araligi APA 7 cift aralik beklentisinin altinda gorunuyor.'});
    }
    var readability = input.readability || null;
    if(readability && readability.tone === 'warning'){
      issues.push({severity:'warning', code:'readability_long_sentences', message:'Okunabilirlik: Ortalama cumle uzunlugu ' + readability.avgWordsPerSentence + ' kelime. Uzun akademik cumleleri bolmek metni guclendirir.'});
    }
    if(citationCoverage && Number(citationCoverage.uncoveredLongParagraphs || 0) > 0){
      issues.push({
        severity: 'warning',
        code: 'long_paragraph_without_citation',
        message: citationCoverage.uncoveredLongParagraphs + ' uzun paragrafta atif sinyali yok. APA 7 akisi icin ilgili yerlere kaynak eklemeyi degerlendir.'
      });
    }
    var outlineSummary = input.outlineSummary || null;
    var wordCount = Number(input.wordCount || 0) || 0;
    if(outlineSummary && wordCount > 500 && Number(outlineSummary.headings || 0) === 0){
      issues.push({severity:'warning', code:'missing_heading_structure', message:'Belge uzun gorunuyor ama H1-H5 baslik yapisi yok. Basliklar outline, export ve APA okuma akisini guclendirir.'});
    }
    consistency.issues.forEach(function(issue){ issues.push(issue); });
    var grammarSummary = grammar ? {
      status: String(grammar.status || 'idle'),
      issueCount: Number(grammar.issueCount || (Array.isArray(grammar.issues) ? grammar.issues.length : 0)) || 0,
      highlightCount: Number(grammar.highlightCount || 0) || 0,
      checkedAt: Number(grammar.checkedAt || 0) || 0,
      error: String(grammar.error || ''),
      issues: Array.isArray(grammar.issues) ? grammar.issues.slice(0, 8) : []
    } : {
      status: 'idle',
      issueCount: 0,
      highlightCount: 0,
      checkedAt: 0,
      error: '',
      issues: []
    };
    return {
      refs: refs.length,
      citations: citationCount,
      health: health,
      consistency: consistency,
      readability: readability,
      citationCoverage: citationCoverage,
      outlineSummary: outlineSummary,
      grammar: grammarSummary,
      issues: issues,
      errors: issues.filter(function(issue){ return issue.severity === 'error'; }).length,
      warnings: issues.filter(function(issue){ return issue.severity !== 'error'; }).length
    };
  }

  function normalizeIgnoredIssueCodes(codes){
    var seen = {};
    var out = [];
    (Array.isArray(codes) ? codes : []).forEach(function(code){
      var value = String(code || '').trim();
      if(!value || seen[value]) return;
      seen[value] = true;
      out.push(value);
    });
    return out;
  }

  function buildIgnoredIssueToken(code, docId){
    var normalizedCode = String(code || '').trim();
    if(!normalizedCode) return '';
    var normalizedDocId = String(docId || '').trim();
    if(!normalizedDocId) return normalizedCode;
    return 'doc:' + normalizedDocId + '::' + normalizedCode;
  }

  function removeIgnoredIssueTokensForDoc(codes, docId){
    var normalizedDocId = String(docId || '').trim();
    var list = normalizeIgnoredIssueCodes(codes);
    if(!normalizedDocId) return list;
    var prefix = 'doc:' + normalizedDocId + '::';
    return list.filter(function(code){ return String(code || '').indexOf(prefix) !== 0; });
  }

  function applyIgnoredIssues(report, ignoredCodes, options){
    report = report || {};
    options = options || {};
    var docId = String(options.docId || '').trim();
    var ignored = {};
    normalizeIgnoredIssueCodes(ignoredCodes).forEach(function(code){ ignored[code] = true; });
    var issues = Array.isArray(report.issues) ? report.issues : [];
    var visible = [];
    var hidden = [];
    issues.forEach(function(issue){
      var code = String(issue && issue.code || '');
      var token = String(issue && issue.ignoreCode || '') || buildIgnoredIssueToken(code, docId);
      if((code && ignored[code]) || (token && ignored[token])) hidden.push(issue);
      else visible.push(issue);
    });
    var next = {};
    Object.keys(report).forEach(function(key){ next[key] = report[key]; });
    next.issues = visible;
    next.ignoredIssues = hidden;
    next.ignoredCount = hidden.length;
    next.errors = visible.filter(function(issue){ return issue && issue.severity === 'error'; }).length;
    next.warnings = visible.filter(function(issue){ return !(issue && issue.severity === 'error'); }).length;
    return next;
  }

  function getIssueAction(issue){
    var code = String(issue && issue.code || '');
    if(code === 'missing_bibliography_page' || code === 'bibliography_entry_count_low'){
      return {action:'refreshBibliography', label:'Kaynakcayi Guncelle'};
    }
    if(code === 'manual_bibliography'){
      return {action:'resetBibliography', label:'Otomatige Al'};
    }
    if(code === 'citation_missing_reference' || code === 'citations_without_library' || code === 'uncited_references'){
      return {action:'openCitationGraph', label:'Atif Grafigi'};
    }
    if(code === 'incomplete_references' || code === 'suspicious_references'){
      return {action:'metadataHealth', label:'Metadata Kontrol'};
    }
    if(code === 'missing_doi'){
      return {action:'metadataHealth', label:'Metadata Kontrol'};
    }
    if(code === 'line_spacing'){
      return {action:'openLinter', label:'Kontrol Et'};
    }
    if(code === 'readability_long_sentences'){
      return {action:'openLinter', label:'Okunabilirlik'};
    }
    if(code === 'long_paragraph_without_citation'){
      return {action:'openCitationGraph', label:'Atif Grafigi'};
    }
    if(code === 'missing_heading_structure'){
      return {action:'openOutline', label:'Anahati Ac'};
    }
    return {action:'openLinter', label:'Detay'};
  }

  function buildLinterIssueViewModel(report){
    report = report || {};
    var issues = Array.isArray(report.issues) ? report.issues : [];
    if(!issues.length){
      return [{
        severity: 'ok',
        code: 'clean',
        title: 'Simdilik temiz',
        message: 'Temel kaynakca ve metadata kontrolunde kritik bir sorun gorunmuyor.',
        action: '',
        actionLabel: ''
      }];
    }
    return issues.map(function(issue){
      var action = getIssueAction(issue);
      return {
        severity: issue && issue.severity === 'error' ? 'error' : 'warning',
        code: String(issue && issue.code || ''),
        ignoreCode: String(issue && issue.ignoreCode || issue && issue.code || ''),
        title: issue && issue.severity === 'error' ? 'Hata' : 'Uyari',
        message: String(issue && (issue.message || issue.code) || 'Kontrol gerekli'),
        action: action.action,
        actionLabel: action.label
      };
    });
  }

  function classifySaveStatus(text){
    var raw = String(text || '').trim();
    var normalized = normalizeText(raw);
    if(!normalized) return {tone:'ok', label:'kaydedildi'};
    if(/hata|error|basarisiz|kaydedilemedi|failed/.test(normalized)){
      return {tone:'error', label:raw};
    }
    if(/kaydediliyor|yaziliyor|degisiklik|bekliyor|sync|senkron|saving|pending/.test(normalized)){
      return {tone:'saving', label:raw};
    }
    if(/recovery|draft|kurtar|crash/.test(normalized)){
      return {tone:'warning', label:raw};
    }
    return {tone:'ok', label:raw};
  }

  function buildStatusViewModel(input){
    input = input || {};
    var stats = input.stats || {};
    var report = input.report || {};
    var styleLabel = String(input.styleLabel || 'APA').trim() || 'APA';
    var errors = Number(report.errors || 0) || 0;
    var warnings = Number(report.warnings || 0) || 0;
    var issueCount = errors + warnings;
    var save = classifySaveStatus(input.saveStatus || '');
    var totalPages = Math.max(1, Number(stats.totalPages || stats.pages || 1) || 1);
    var currentPage = Math.max(1, Math.min(totalPages, Number(stats.currentPage || 1) || 1));
    return {
      pagesLabel: 'sf ' + currentPage + '/' + totalPages,
      wordsLabel: (Number(stats.words || 0) || 0) + ' kelime',
      apaLabel: errors ? (styleLabel + ' riskli') : (warnings ? (styleLabel + ' kontrol') : (styleLabel + ' ok')),
      apaTone: errors ? 'error' : (warnings ? 'warning' : 'ok'),
      warningsLabel: issueCount ? (issueCount + ' sorun') : '0 uyari',
      warningsTone: errors ? 'error' : (warnings ? 'warning' : 'ok'),
      saveLabel: save.label,
      saveTone: save.tone
    };
  }

  function computePageStats(input){
    input = input || {};
    var fallbackTotal = Math.max(1, Number(input.fallbackPageCount || 1) || 1);
    var viewportHeight = Math.max(1, Number(input.viewportHeight || 0) || 1);
    var scrollTop = Math.max(0, Number(input.scrollTop || 0) || 0);
    var center = scrollTop + (viewportHeight / 2);
    var rects = (Array.isArray(input.pageRects) ? input.pageRects : [])
      .map(function(rect){
        var top = Number(rect && rect.top);
        var bottom = Number(rect && rect.bottom);
        if(!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= top) return null;
        return {top:top, bottom:bottom};
      })
      .filter(Boolean)
      .sort(function(a,b){ return a.top - b.top; });
    if(!rects.length){
      return {currentPage:1, totalPages:fallbackTotal};
    }
    var currentPage = 1;
    var bestDistance = Infinity;
    rects.forEach(function(rect, index){
      var distance = 0;
      if(center < rect.top) distance = rect.top - center;
      else if(center > rect.bottom) distance = center - rect.bottom;
      if(distance < bestDistance){
        bestDistance = distance;
        currentPage = index + 1;
      }
    });
    return {
      currentPage: currentPage,
      totalPages: Math.max(fallbackTotal, rects.length)
    };
  }

  function clampPageNumber(value, totalPages){
    var total = Math.max(1, Number(totalPages || 1) || 1);
    var page = Math.round(Number(value || 1) || 1);
    if(!Number.isFinite(page)) page = 1;
    if(page < 1) page = 1;
    if(page > total) page = total;
    return page;
  }

  function buildShortcutHelpModel(){
    return [
      {keys:'Ctrl+K', title:'Komut paleti', body:'Buton aramadan belge, kaynakca, PDF ve kalite komutlarini calistir.'},
      {keys:'Ctrl+G', title:'Sayfaya git', body:'Editor sayfalari arasinda hedef sayfaya hizli gecis yapar.'},
      {keys:'F9', title:'Sag panel', body:'Outline, APA kontrolu, atif grafigi, oneriler ve gecmis panelini ac/kapat.'},
      {keys:'Ctrl+Shift+E', title:'Inceleme modu', body:'Track changes modunu ac/kapat ve onerili duzenleme akisina gec.'},
      {keys:'Ctrl+F', title:'Belgde bul', body:'Editor toolbarindaki bul kutusuna odaklanir.'},
      {keys:'Ctrl+Enter', title:'Sayfa sonu', body:'Editor icinde guvenli page break ekler.'},
      {keys:'/r', title:'Parantez ici atif', body:'APA 7 parantez ici atif secicisini acar.'},
      {keys:'/t', title:'Narrative atif', body:'Yazar (Yil) formatinda metin ici atif secicisini acar.'},
      {keys:'?', title:'Bu yardim', body:'Editor veya input disindayken kisa klavye yardimini acar.'}
    ];
  }

  function isEditableTarget(target){
    if(!target) return false;
    var tag = String(target.tagName || '').toLowerCase();
    if(tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if(target.isContentEditable) return true;
    if(typeof target.closest === 'function'){
      try{
        if(target.closest('[contenteditable="true"], .ProseMirror, #apaed, #toolbarFindInp, #findinp')) return true;
      }catch(_error){}
    }
    return false;
  }

  function shouldOpenShortcutHelp(event){
    if(!event) return false;
    if(event.ctrlKey || event.metaKey || event.altKey) return false;
    if(String(event.key || '') !== '?') return false;
    return !isEditableTarget(event.target || null);
  }

  function uniqueStrings(values){
    var seen = {};
    var out = [];
    (Array.isArray(values) ? values : []).forEach(function(value){
      var text = String(value == null ? '' : value).trim();
      if(!text || seen[text]) return;
      seen[text] = true;
      out.push(text);
    });
    return out;
  }

  function clampNumber(value, min, max){
    var n = Number(value);
    if(!Number.isFinite(n)) n = min;
    return Math.max(min, Math.min(max, n));
  }

  function computeGrammarErrorCooldownMs(errorCount){
    var count = Math.max(0, Math.floor(Number(errorCount || 0) || 0));
    if(count <= 0) return 0;
    var step = Math.min(6, count);
    return Math.min(60000, 8000 * Math.pow(2, step - 1));
  }

  function normalizePanelWidth(value, viewportWidth){
    var maxByViewport = Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX, Number(viewportWidth || 0) - 36 || PANEL_WIDTH_MAX));
    return clampNumber(value || PANEL_WIDTH_DEFAULT, PANEL_WIDTH_MIN, maxByViewport);
  }

  function normalizePanelTab(tabId, tabs){
    var list = Array.isArray(tabs) && tabs.length ? tabs : DEFAULT_TABS;
    var fallback = list[0] && list[0].id ? list[0].id : 'outline';
    var value = String(tabId || '').trim();
    return list.some(function(tab){ return tab && tab.id === value; }) ? value : fallback;
  }

  function buildCitationConsistencyReport(input){
    input = input || {};
    var refs = Array.isArray(input.refs) ? input.refs : [];
    var refIds = uniqueStrings(refs.map(function(ref){ return ref && ref.id; }));
    var refMap = {};
    refIds.forEach(function(id){ refMap[id] = true; });
    var citationIds = uniqueStrings(input.citationIds);
    var missingRefIds = citationIds.filter(function(id){ return !refMap[id]; });
    var citedMap = {};
    citationIds.forEach(function(id){ citedMap[id] = true; });
    var uncitedRefIds = refIds.filter(function(id){ return !citedMap[id]; });
    var uncitedRatio = refIds.length ? (uncitedRefIds.length / refIds.length) : 0;
    var shouldWarnUncited = citationIds.length > 0 && uncitedRefIds.length > 0
      && ((uncitedRefIds.length >= 2 && uncitedRatio >= 0.5) || uncitedRefIds.length >= 4);
    var bibliographyEntryCount = Number(input.bibliographyEntryCount || 0) || 0;
    var issues = [];

    if(missingRefIds.length){
      issues.push({
        severity: 'error',
        code: 'citation_missing_reference',
        message: missingRefIds.length + ' atif aktif library icinde kaynak kaydina baglanamiyor.'
      });
    }
    if(citationIds.length && bibliographyEntryCount && bibliographyEntryCount < citationIds.length){
      issues.push({
        severity: 'warning',
        code: 'bibliography_entry_count_low',
        message: 'Kaynakca sayfasindaki girdi sayisi metindeki benzersiz atif sayisindan az gorunuyor.'
      });
    }
    if(shouldWarnUncited){
      issues.push({
        severity: 'warning',
        code: 'uncited_references',
        message: uncitedRefIds.length + ' kaynak library/kaynakca tarafinda var ama metinde henuz atiflanmamis gorunuyor.'
      });
    }
    if(input.bibliographyManual && citationIds.length){
      issues.push({
        severity: 'warning',
        code: 'manual_bibliography',
        message: 'Kaynakca manuel modda; yeni atiflardan sonra otomatik alfabetik siralama durabilir.'
      });
    }

    return {
      cited: citationIds.length,
      referenceIds: refIds.length,
      missingRefIds: missingRefIds,
      uncitedRefIds: uncitedRefIds,
      uncitedRatio: uncitedRatio,
      shouldWarnUncited: shouldWarnUncited,
      bibliographyEntryCount: bibliographyEntryCount,
      issues: issues
    };
  }

  function getReferenceLabel(ref){
    ref = ref || {};
    var authors = Array.isArray(ref.authors) ? ref.authors.filter(Boolean) : [];
    var author = authors.length ? String(authors[0] || '') : String(ref.author || '');
    author = author.replace(/\s+/g, ' ').trim();
    var title = String(ref.title || ref.detectedTitle || '').replace(/\s+/g, ' ').trim();
    var year = String(ref.year || '').trim();
    var head = author || title || ref.id || 'Kaynak';
    if(year) head += ' (' + year + ')';
    return head;
  }

  function buildCitationGraphModel(input){
    input = input || {};
    var refs = Array.isArray(input.refs) ? input.refs : [];
    var citationIds = uniqueStrings(input.citationIds || []);
    var citationMap = {};
    citationIds.forEach(function(id){ citationMap[id] = true; });
    var refById = {};
    refs.forEach(function(ref){
      if(ref && ref.id) refById[String(ref.id)] = ref;
    });
    var citedRefs = citationIds
      .map(function(id){ return refById[id] || null; })
      .filter(Boolean);
    var missingRefIds = citationIds.filter(function(id){ return !refById[id]; });
    var uncitedRefs = refs.filter(function(ref){
      var id = ref && ref.id ? String(ref.id) : '';
      return id && !citationMap[id];
    });
    return {
      citationIds: citationIds,
      citedRefs: citedRefs,
      uncitedRefs: uncitedRefs,
      missingRefIds: missingRefIds,
      totalRefs: refs.length,
      citedCount: citedRefs.length,
      uncitedCount: uncitedRefs.length,
      missingCount: missingRefIds.length
    };
  }

  function truncateGraphLabel(text, maxLen){
    var value = String(text || '').replace(/\s+/g, ' ').trim();
    var limit = Math.max(8, parseInt(maxLen, 10) || 24);
    if(value.length <= limit) return value;
    return value.slice(0, Math.max(1, limit - 1)).trim() + '…';
  }

  function buildCitationGraphSvgModel(input){
    input = input || {};
    var graph = input.graph || {};
    var centerLabel = truncateGraphLabel(input.centerLabel || 'Belge', 20) || 'Belge';
    var citedRefs = Array.isArray(graph.citedRefs) ? graph.citedRefs : [];
    var uncitedRefs = Array.isArray(graph.uncitedRefs) ? graph.uncitedRefs : [];
    var missingRefIds = Array.isArray(graph.missingRefIds) ? graph.missingRefIds : [];
    var maxCited = Math.max(1, parseInt(input.maxCited, 10) || 6);
    var maxUncited = Math.max(0, parseInt(input.maxUncited, 10) || 3);
    var maxMissing = Math.max(0, parseInt(input.maxMissing, 10) || 3);
    var nodes = [];

    citedRefs.slice(0, maxCited).forEach(function(ref, index){
      nodes.push({
        id: 'cited_' + index,
        kind: 'cited',
        tone: 'ok',
        label: truncateGraphLabel(getReferenceLabel(ref), 24),
        fullLabel: getReferenceLabel(ref)
      });
    });
    missingRefIds.slice(0, maxMissing).forEach(function(id, index){
      var label = 'Eksik: ' + String(id || '').trim();
      nodes.push({
        id: 'missing_' + index,
        kind: 'missing',
        tone: 'error',
        label: truncateGraphLabel(label, 24),
        fullLabel: label
      });
    });
    uncitedRefs.slice(0, maxUncited).forEach(function(ref, index){
      var unusedLabel = 'Kullanilmiyor: ' + getReferenceLabel(ref);
      nodes.push({
        id: 'uncited_' + index,
        kind: 'uncited',
        tone: 'warn',
        label: truncateGraphLabel(unusedLabel, 24),
        fullLabel: unusedLabel
      });
    });

    var width = Math.max(220, parseInt(input.width, 10) || 268);
    var height = Math.max(180, parseInt(input.height, 10) || 204);
    var cx = Math.round(width / 2);
    var cy = Math.round(height / 2);
    var ringRadius = Math.round(Math.min(width, height) * 0.36);
    var nodeRadius = 7;
    var total = nodes.length;
    for(var i = 0; i < total; i += 1){
      var angle = ((Math.PI * 2) * i / Math.max(1, total)) - (Math.PI / 2);
      nodes[i].x = Math.round(cx + Math.cos(angle) * ringRadius);
      nodes[i].y = Math.round(cy + Math.sin(angle) * ringRadius);
      nodes[i].r = nodeRadius;
      nodes[i].labelX = nodes[i].x + (nodes[i].x >= cx ? 10 : -10);
      nodes[i].labelY = nodes[i].y + 4;
      nodes[i].labelAnchor = nodes[i].x >= cx ? 'start' : 'end';
    }

    return {
      width: width,
      height: height,
      centerX: cx,
      centerY: cy,
      centerRadius: 15,
      centerLabel: centerLabel,
      nodes: nodes,
      hidden: {
        cited: Math.max(0, citedRefs.length - maxCited),
        missing: Math.max(0, missingRefIds.length - maxMissing),
        uncited: Math.max(0, uncitedRefs.length - maxUncited)
      }
    };
  }

  function renderCitationGraphSvg(model){
    if(!model || !Array.isArray(model.nodes)) return '';
    var lines = model.nodes.map(function(node){
      return '<line class="aq-cite-edge ' + escapeHTML(node.tone || '') + '" x1="' + model.centerX + '" y1="' + model.centerY + '" x2="' + node.x + '" y2="' + node.y + '"></line>';
    }).join('');
    var nodes = model.nodes.map(function(node){
      return '<g class="aq-cite-node ' + escapeHTML(node.tone || '') + '">'
        + '<circle class="aq-cite-node-circle" cx="' + node.x + '" cy="' + node.y + '" r="' + node.r + '"></circle>'
        + '<text class="aq-cite-node-label" x="' + node.labelX + '" y="' + node.labelY + '" text-anchor="' + node.labelAnchor + '" title="' + escapeHTML(node.fullLabel || node.label || '') + '">' + escapeHTML(node.label || '') + '</text>'
        + '</g>';
    }).join('');
    return '<svg class="aq-cite-svg" viewBox="0 0 ' + model.width + ' ' + model.height + '" role="img" aria-label="Atif iliski grafigi">'
      + lines
      + '<circle class="aq-cite-center" cx="' + model.centerX + '" cy="' + model.centerY + '" r="' + model.centerRadius + '"></circle>'
      + '<text class="aq-cite-center-label" x="' + model.centerX + '" y="' + (model.centerY + 4) + '" text-anchor="middle">' + escapeHTML(model.centerLabel || 'Belge') + '</text>'
      + nodes
      + '</svg>';
  }

  function buildSuggestionModel(input){
    input = input || {};
    var report = input.report || {issues:[], errors:0, warnings:0};
    var graph = input.graph || {missingCount:0, uncitedCount:0, citedCount:0};
    var outlineSummary = input.outlineSummary || {headings:0, tables:0, figures:0};
    var pdfDigest = input.pdfDigest || {count:0};
    var track = input.track || {enabled:false, total:0, insertCount:0, deleteCount:0};
    var suggestions = [];

    if(report.issues && report.issues.some(function(issue){ return issue.code === 'missing_bibliography_page'; })){
      suggestions.push({
        id: 'refresh-bibliography',
        severity: 'warning',
        title: 'Kaynakca sayfasini guncelle',
        body: 'Metinde kaynak sinyali var ama kaynakca sayfasi bos veya eksik gorunuyor.',
        action: 'refreshBibliography',
        actionLabel: 'Kaynakcayi Guncelle'
      });
    }
    if(report.issues && report.issues.some(function(issue){ return issue.code === 'manual_bibliography'; })){
      suggestions.push({
        id: 'reset-manual-bibliography',
        severity: 'warning',
        title: 'Kaynakcayi otomatik moda al',
        body: 'Manuel kaynakca yeni atiflarla alfabetik sirayi bozabilir.',
        action: 'resetBibliography',
        actionLabel: 'Otomatige Don'
      });
    }
    if(graph.missingCount > 0){
      suggestions.push({
        id: 'missing-citation-links',
        severity: 'error',
        title: 'Kirik atif baglantilarini kontrol et',
        body: graph.missingCount + ' atif aktif libraryde kaynak kaydina baglanamiyor.',
        action: 'openLinter',
        actionLabel: 'APA Panelini Ac'
      });
    }
    if(report.health && report.health.incomplete > 0){
      suggestions.push({
        id: 'repair-metadata',
        severity: 'error',
        title: 'Eksik kunye alanlarini tamamla',
        body: report.health.incomplete + ' kaynakta baslik, yazar veya yil gibi zorunlu alanlar eksik.',
        action: 'metadataHealth',
        actionLabel: 'Metadata Health'
      });
    }
    if(report.issues && report.issues.some(function(issue){ return issue.code === 'readability_long_sentences'; })){
      suggestions.push({
        id: 'review-readability',
        severity: 'warning',
        title: 'Uzun cumleleri gozden gecir',
        body: 'Okunabilirlik sinyali metindeki bazi cumlelerin akademik akisi agirlastirdigini gosteriyor.',
        action: 'openLinter',
        actionLabel: 'Okunabilirlik'
      });
    }
    if(report.issues && report.issues.some(function(issue){ return issue.code === 'long_paragraph_without_citation'; })){
      suggestions.push({
        id: 'strengthen-citation-coverage',
        severity: 'warning',
        title: 'Uzun paragraflarda atif kapsamini guclendir',
        body: 'Uzun paragraflarin bazilarinda atif sinyali yok; ilgili iddialari kaynaklarla baglamak metni guclendirir.',
        action: 'openCitationGraph',
        actionLabel: 'Atif Grafigi'
      });
    }
    if(graph.uncitedCount > 8){
      suggestions.push({
        id: 'review-unused-sources',
        severity: 'info',
        title: 'Kullanilmayan kaynaklari gozden gecir',
        body: graph.uncitedCount + ' library kaynagi metinde kullanilmamis gorunuyor.',
        action: 'openCitationGraph',
        actionLabel: 'Atif Grafi'
      });
    }
    if(!outlineSummary.headings && Number(input.wordCount || 0) > 500){
      suggestions.push({
        id: 'add-outline',
        severity: 'info',
        title: 'Belgeye baslik yapisi ekle',
        body: 'Uzun belgede H1-H5 basliklar outline, export ve okuma deneyimini guclendirir.',
        action: 'openOutline',
        actionLabel: 'Anahati Ac'
      });
    }
    if(Number(pdfDigest.count || 0) > 0){
      suggestions.push({
        id: 'prepare-pdf-digest',
        severity: 'info',
        title: 'PDF not ozetini hazirla',
        body: pdfDigest.count + ' PDF notu/highlight belgeye aktarilabilecek bir digest icin hazir.',
        action: 'openPdfDigest',
        actionLabel: 'PDF Ozetini Ac'
      });
    }
    if(Number(track.total || 0) > 0){
      suggestions.push({
        id: 'review-track-changes',
        severity: 'warning',
        title: 'Inceleme onerilerini sonlandir',
        body: track.total + ' track changes onerisi bekliyor. Kapanis oncesi kabul/geri al kontrolu onerilir.',
        action: 'openTrackReview',
        actionLabel: 'Incelemeyi Ac'
      });
    }
    if(!suggestions.length){
      suggestions.push({
        id: 'clean',
        severity: 'ok',
        title: 'Simdilik iyi gorunuyor',
        body: 'Temel kalite ve referans sinyallerinde acil bir aksiyon gorunmuyor.',
        action: '',
        actionLabel: ''
      });
    }
    return suggestions;
  }

  function buildTrackChangesPanelModel(input){
    input = input || {};
    var summary = input.summary && typeof input.summary === 'object' ? input.summary : {};
    var enabled = !!input.enabled;
    var insertCount = Math.max(0, Number(summary.insertCount || 0) || 0);
    var deleteCount = Math.max(0, Number(summary.deleteCount || 0) || 0);
    var total = Number(summary.total);
    if(!Number.isFinite(total)) total = insertCount + deleteCount;
    total = Math.max(0, total);
    var insertChars = Math.max(0, Number(summary.insertChars || 0) || 0);
    var deleteChars = Math.max(0, Number(summary.deleteChars || 0) || 0);
    var hasChanges = total > 0;
    var tone = hasChanges ? 'warning' : 'ok';
    var statusLabel = enabled ? 'Inceleme modu acik' : 'Inceleme modu kapali';
    var pendingLabel = hasChanges
      ? (total + ' oneri bekliyor')
      : 'Bekleyen oneri yok';
    return {
      enabled: enabled,
      hasChanges: hasChanges,
      tone: tone,
      statusLabel: statusLabel,
      pendingLabel: pendingLabel,
      insertCount: insertCount,
      deleteCount: deleteCount,
      total: total,
      insertChars: insertChars,
      deleteChars: deleteChars
    };
  }

  function buildPdfAnnotationDigestViewModel(items, digestApi, options){
    options = options || {};
    var list = Array.isArray(items) ? items : [];
    var title = String(options.title || 'PDF Not Ozeti').trim() || 'PDF Not Ozeti';
    var citation = String(options.citation || '').trim();
    var digest = digestApi && typeof digestApi.buildAnnotationDigest === 'function'
      ? digestApi.buildAnnotationDigest(list, {title:title, citation:citation})
      : null;
    if(!digest){
      var safeItems = list.filter(function(item){ return item && String(item.text || '').trim(); });
      digest = {
        title: title,
        citation: citation,
        count: safeItems.length,
        highlightCount: safeItems.filter(function(item){ return item.kind === 'highlight'; }).length,
        noteCount: safeItems.filter(function(item){ return item.kind === 'note'; }).length,
        items: safeItems,
        markdown: safeItems.map(function(item){ return '- s. ' + (item.page || '?') + ': ' + String(item.text || '').trim(); }).join('\n'),
        html: ''
      };
    }
    return {
      title: digest.title || title,
      citation: digest.citation || citation,
      count: Number(digest.count || 0) || 0,
      highlightCount: Number(digest.highlightCount || 0) || 0,
      noteCount: Number(digest.noteCount || 0) || 0,
      items: Array.isArray(digest.items) ? digest.items : [],
      markdown: String(digest.markdown || ''),
      html: String(digest.html || ''),
      hasItems: Number(digest.count || 0) > 0
    };
  }

  function buildPdfAnnotationSearchModel(items, annotationApi, options){
    options = options || {};
    var query = String(options.query || '').trim();
    var filter = String(options.filter || 'all');
    if(filter !== 'highlight' && filter !== 'note') filter = 'all';
    var summaries = (Array.isArray(items) ? items : []).map(function(item, index){
      item = item || {};
      var summary = annotationApi && typeof annotationApi.buildAnnotationSummary === 'function'
        ? annotationApi.buildAnnotationSummary(item)
        : null;
      summary = summary || {
        id: item.id ? String(item.id) : '',
        page: parseInt(item.page, 10) || 1,
        text: String(item.text || '').replace(/\s+/g, ' ').trim(),
        preview: String(item.text || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        empty: !String(item.text || '').trim()
      };
      return {
        id: summary.id || (item.id ? String(item.id) : ('annotation_' + index)),
        kind: item.kind === 'note' ? 'note' : 'highlight',
        page: parseInt(summary.page, 10) || parseInt(item.page, 10) || 1,
        index: Number.isFinite(Number(item.index)) ? Number(item.index) : index,
        text: String(summary.text || item.text || '').replace(/\s+/g, ' ').trim(),
        preview: String(summary.preview || summary.text || item.text || '').replace(/\s+/g, ' ').trim(),
        empty: summary.empty === true
      };
    });
    var filtered = annotationApi && typeof annotationApi.filterAnnotationSummaries === 'function'
      ? annotationApi.filterAnnotationSummaries(summaries, {query:query, filter:filter})
      : summaries.filter(function(item){
          if(!item || item.empty) return false;
          if(filter === 'highlight' && item.kind !== 'highlight') return false;
          if(filter === 'note' && item.kind !== 'note') return false;
          if(!query) return true;
          return normalizeText(item.text).indexOf(normalizeText(query)) >= 0;
        });
    var nonEmpty = summaries.filter(function(item){ return item && !item.empty; });
    return {
      query: query,
      filter: filter,
      total: nonEmpty.length,
      count: filtered.length,
      highlightCount: filtered.filter(function(item){ return item.kind === 'highlight'; }).length,
      noteCount: filtered.filter(function(item){ return item.kind === 'note'; }).length,
      items: filtered
    };
  }

  function formatShortDateTime(value, now){
    var time = Number(value || 0);
    if(!time) return '';
    var base = Number(now || 0) || Date.now();
    var diff = Math.max(0, base - time);
    if(diff < 60 * 1000) return 'az once';
    if(diff < 60 * 60 * 1000) return Math.floor(diff / (60 * 1000)) + ' dk once';
    if(diff < 24 * 60 * 60 * 1000) return Math.floor(diff / (60 * 60 * 1000)) + ' sa once';
    try{
      return new Date(time).toLocaleString('tr-TR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
    }catch(_error){
      return String(time);
    }
  }

  function buildHistoryPanelModel(input){
    input = input || {};
    var appInfo = input.appInfo && typeof input.appInfo === 'object' ? input.appInfo : {};
    var history = input.history && typeof input.history === 'object' ? input.history : {};
    var session = appInfo.session && typeof appInfo.session === 'object' ? appInfo.session : {};
    var draft = appInfo.editorDraft && typeof appInfo.editorDraft === 'object' ? appInfo.editorDraft : {};
    var docHistory = appInfo.documentHistory && typeof appInfo.documentHistory === 'object' ? appInfo.documentHistory : {};
    var snapshots = Array.isArray(history.snapshots) ? history.snapshots : [];
    var now = Number(input.now || 0) || Date.now();
    var cards = [];

    if(draft.exists && draft.valid && draft.recoverableAfterUncleanShutdown){
      cards.push({
        severity: 'warning',
        title: 'Kurtarilabilir editor drafti var',
        body: 'Onceki kapanis temiz degil ve draft son kayittan yeni gorunuyor. Uygulama acilista bunu recovery icin kullanabilir.'
      });
    }else if(draft.exists && draft.valid && draft.isNewerThanLastSave){
      cards.push({
        severity: 'info',
        title: 'Autosave draft aktif',
        body: 'Editor drafti son ana kayittan yeni. Yazma guvenligi icin arka planda korunuyor.'
      });
    }else if(draft.exists && !draft.valid){
      cards.push({
        severity: 'warning',
        title: 'Draft dosyasi okunamadi',
        body: draft.invalidReason || 'Draft gecersiz gorunuyor; ana veri ve document history ayri korunur.'
      });
    }else{
      cards.push({
        severity: 'ok',
        title: 'Editor draft durumu sakin',
        body: 'Su anda kurtarma gerektiren yeni draft sinyali yok.'
      });
    }

    if(session.previousCleanExit === false){
      cards.push({
        severity: 'warning',
        title: 'Onceki oturum temiz kapanmamis',
        body: 'Bir onceki calisma aniden kapanmis olabilir. Storage recovery ve draft kontrolleri devrede.'
      });
    }else if(session.previousCleanExit === true){
      cards.push({
        severity: 'ok',
        title: 'Onceki oturum temiz kapanmis',
        body: 'Son kapatma kaydi normal gorunuyor.'
      });
    }

    if(snapshots.length){
      cards.push({
        severity: 'ok',
        title: 'Belge snapshotlari hazir',
        body: snapshots.length + ' snapshot bulundu. En yeni snapshot: ' + formatShortDateTime(snapshots[0] && snapshots[0].createdAt, now) + '.'
      });
    }else{
      cards.push({
        severity: 'info',
        title: 'Bu belge icin snapshot bekleniyor',
        body: 'Duzeltme yaptikca autosave periyodik olarak belge gecmisi olusturur.'
      });
    }

    return {
      saveStatus: String(input.saveStatus || 'kaydedildi'),
      draft: draft,
      session: session,
      documentHistory: docHistory,
      docId: String(history.docId || input.docId || ''),
      docName: String(history.docName || input.docName || 'Belge'),
      snapshots: snapshots,
      cards: cards
    };
  }

  function getExportRiskLevel(report){
    report = report || {};
    if(Number(report.errors || 0) > 0) return 'blocker';
    if(Number(report.warnings || 0) > 0) return 'caution';
    return 'clean';
  }

  function formatPreflightMessage(report, target){
    report = report || {};
    var lines = [];
    var label = String(target || 'export').toUpperCase();
    lines.push(label + ' oncesi kalite kontrolu');
    lines.push('');
    if(getExportRiskLevel(report) === 'clean'){
      lines.push('Kritik bir sorun gorunmuyor.');
      return lines.join('\n');
    }
    lines.push(report.errors + ' hata, ' + report.warnings + ' uyari bulundu.');
    lines.push('');
    (Array.isArray(report.issues) ? report.issues : []).slice(0, 8).forEach(function(issue, index){
      lines.push((index + 1) + '. [' + String(issue.severity || 'warning').toUpperCase() + '] ' + String(issue.message || issue.code || 'Kontrol gerekli'));
    });
    if(report.issues && report.issues.length > 8){
      lines.push('... +' + (report.issues.length - 8) + ' ek kontrol.');
    }
    lines.push('');
    lines.push('Yine de disa aktarmaya devam edilsin mi?');
    return lines.join('\n');
  }

  function escapeHTML(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }

  function safeRun(fn){
    try{ if(typeof fn === 'function') return fn(); }
    catch(err){ if(typeof console !== 'undefined' && console.warn) console.warn('[AQLeanUIShell]', err); }
    return null;
  }

  function createShell(){
    var state = {
      commands: [],
      paletteOpen: false,
      selectedIndex: 0,
      activePanelTab: 'outline',
      panelFullscreen: false,
      outlineQuery: '',
      outlineType: 'all',
      pdfAnnotationQuery: '',
      pdfAnnotationFilter: 'all',
      recentCommandIds: [],
      ignoredIssueCodes: [],
      historyToken: 0,
      statusTimer: null,
      grammar: {
        status: 'unsupported',
        issues: [],
        issueCount: 0,
        checkedAt: 0,
        error: '',
        lastText: '',
        consecutiveErrors: 0,
        errorCooldownMs: 0,
        timer: null,
        token: 0
      }
    };

    function doc(){ return typeof document !== 'undefined' ? document : null; }
    function win(){ return typeof window !== 'undefined' ? window : null; }
    function byId(id){ var d = doc(); return d ? d.getElementById(id) : null; }
    function storage(){
      var w = win();
      try{ return w && w.localStorage ? w.localStorage : null; }catch(_error){ return null; }
    }

    function sanitizeGrammarSourceText(text){
      return String(text || '').replace(/\u00a0/g, ' ').slice(0, 3600);
    }

    function collectGrammarTextMap(limit){
      var d = doc();
      var rootEl = getEditorRoot();
      var max = Math.max(200, Number(limit || 3600) || 3600);
      var text = '';
      var segments = [];
      if(!d || !rootEl || typeof d.createTreeWalker !== 'function'){
        return { text:'', segments:[], sourceLength:0 };
      }
      var nodeFilter = (typeof NodeFilter !== 'undefined' && NodeFilter) ? NodeFilter : {SHOW_TEXT:4, FILTER_ACCEPT:1, FILTER_REJECT:2};
      var walker = d.createTreeWalker(rootEl, nodeFilter.SHOW_TEXT, {
        acceptNode: function(node){
          if(!node || typeof node.nodeValue !== 'string') return nodeFilter.FILTER_REJECT;
          if(!node.nodeValue.trim()) return nodeFilter.FILTER_REJECT;
          var parent = node.parentElement;
          if(!parent) return nodeFilter.FILTER_REJECT;
          if(parent.closest && parent.closest('#bibbody,.refe,[data-aq-bibliography],.aq-bibliography')) return nodeFilter.FILTER_REJECT;
          return nodeFilter.FILTER_ACCEPT;
        }
      });
      var current = walker.nextNode();
      while(current && text.length < max){
        var raw = String(current.nodeValue || '').replace(/\u00a0/g, ' ');
        if(raw){
          var remain = max - text.length;
          var piece = raw.length > remain ? raw.slice(0, remain) : raw;
          if(piece){
            segments.push({ node:current, start:text.length, length:piece.length });
            text += piece;
          }
        }
        current = walker.nextNode();
      }
      return { text:text, segments:segments, sourceLength:text.length };
    }

    function resolveGrammarPoint(segments, offset){
      var safeOffset = Math.max(0, Number(offset || 0) || 0);
      var list = Array.isArray(segments) ? segments : [];
      for(var i = 0; i < list.length; i++){
        var item = list[i];
        if(!item || !item.node) continue;
        var start = Number(item.start || 0) || 0;
        var end = start + (Number(item.length || 0) || 0);
        if(safeOffset < end){
          return {
            node: item.node,
            offset: Math.max(0, safeOffset - start)
          };
        }
      }
      if(list.length){
        var last = list[list.length - 1];
        return {
          node: last.node,
          offset: Math.max(0, Number(last.length || 0) || 0)
        };
      }
      return null;
    }

    function buildGrammarRange(sourceMap, issue){
      var d = doc();
      if(!d || !sourceMap || !Array.isArray(sourceMap.segments)) return null;
      var total = Math.max(0, Number(sourceMap.sourceLength || 0) || 0);
      if(!total) return null;
      var startOffset = Math.max(0, Math.min(total - 1, parseInt(issue && issue.offset, 10) || 0));
      var length = Math.max(1, Math.min(200, parseInt(issue && issue.length, 10) || 1));
      var endOffset = Math.max(startOffset + 1, Math.min(total, startOffset + length));
      var startPoint = resolveGrammarPoint(sourceMap.segments, startOffset);
      var endPoint = resolveGrammarPoint(sourceMap.segments, endOffset);
      if(!startPoint || !endPoint || !startPoint.node || !endPoint.node) return null;
      try{
        var range = d.createRange();
        range.setStart(startPoint.node, startPoint.offset);
        range.setEnd(endPoint.node, endPoint.offset);
        return range;
      }catch(_error){
        return null;
      }
    }

    function clearGrammarHighlights(){
      if(typeof CSS === 'undefined' || !CSS.highlights || typeof CSS.highlights.delete !== 'function') return;
      try{ CSS.highlights.delete('aq-grammar-issues'); }catch(_error){}
    }

    function applyGrammarHighlights(sourceMap, issues){
      if(typeof CSS === 'undefined' || !CSS.highlights || typeof Highlight === 'undefined') return 0;
      var ranges = [];
      (Array.isArray(issues) ? issues : []).forEach(function(issue){
        var range = buildGrammarRange(sourceMap, issue);
        if(range && !range.collapsed) ranges.push(range);
      });
      try{
        if(!ranges.length){
          CSS.highlights.delete('aq-grammar-issues');
          return 0;
        }
        var highlight = new Highlight();
        ranges.forEach(function(range){ highlight.add(range); });
        CSS.highlights.set('aq-grammar-issues', highlight);
        return ranges.length;
      }catch(_error){
        return 0;
      }
    }

    function normalizeGrammarIssues(matches, sourceText){
      var text = String(sourceText || '');
      return (Array.isArray(matches) ? matches : []).slice(0, 18).map(function(match, index){
        var offset = Math.max(0, parseInt(match && match.offset, 10) || 0);
        var length = Math.max(1, Math.min(120, parseInt(match && match.length, 10) || 1));
        var start = Math.max(0, offset - 24);
        var end = Math.min(text.length, offset + length + 24);
        var before = text.slice(start, offset);
        var token = text.slice(offset, Math.min(text.length, offset + length));
        var after = text.slice(Math.min(text.length, offset + length), end);
        var replacements = Array.isArray(match && match.replacements)
          ? match.replacements.map(function(value){ return String(value || '').trim(); }).filter(Boolean).slice(0, 4)
          : [];
        return {
          id: 'grammar_' + index + '_' + offset,
          message: String((match && (match.shortMessage || match.message)) || 'Dil/yazim onerisi').trim() || 'Dil/yazim onerisi',
          ruleId: String((match && match.ruleId) || '').trim(),
          offset: offset,
          length: length,
          replacements: replacements,
          snippet: (before + '[' + token + ']' + after).replace(/\s+/g, ' ').trim()
        };
      }).filter(function(issue){
        return !!(issue.message || issue.snippet);
      });
    }

    function getGrammarStateSnapshot(){
      var grammar = state.grammar || {};
      var issues = Array.isArray(grammar.issues) ? grammar.issues : [];
      return {
        status: String(grammar.status || 'idle'),
        issues: issues.slice(0, 8),
        issueCount: Number(grammar.issueCount || issues.length || 0) || 0,
        highlightCount: Number(grammar.highlightCount || 0) || 0,
        checkedAt: Number(grammar.checkedAt || 0) || 0,
        error: String(grammar.error || ''),
        consecutiveErrors: Number(grammar.consecutiveErrors || 0) || 0,
        errorCooldownMs: Number(grammar.errorCooldownMs || 0) || 0
      };
    }

    function runGrammarCheck(options){
      options = options || {};
      var grammar = state.grammar;
      if(!grammar) return;
      grammar.status = 'unsupported';
      grammar.issues = [];
      grammar.issueCount = 0;
      grammar.highlightCount = 0;
      grammar.error = '';
      grammar.consecutiveErrors = 0;
      grammar.errorCooldownMs = 0;
      grammar.checkedAt = Date.now();
      clearGrammarHighlights();
      updateStatusBar(true);
      if(state.activePanelTab === 'linter') renderSidePanel();
    }

    function scheduleGrammarCheck(options){
      options = options || {};
      var grammar = state.grammar;
      if(!grammar) return;
      if(grammar.timer){
        try{ clearTimeout(grammar.timer); }catch(_error){}
        grammar.timer = null;
      }
      var delay = options.immediate ? 40 : 760;
      grammar.timer = setTimeout(function(){
        grammar.timer = null;
        runGrammarCheck({force:!!options.force});
      }, delay);
    }

    function injectStyles(){
      var d = doc();
      if(!d || byId('aqLeanUiStyles')) return;
      var style = d.createElement('style');
      style.id = 'aqLeanUiStyles';
      style.textContent = [
        '.aq-cmdpal-bg{position:fixed;inset:0;z-index:100000;display:none;align-items:flex-start;justify-content:center;padding-top:9vh;background:rgba(28,39,45,.20);backdrop-filter:blur(6px)}',
        '.aq-cmdpal-bg.open{display:flex}',
        '.aq-cmdpal{width:min(680px,calc(100vw - 36px));border:1px solid rgba(151,169,178,.42);border-radius:24px;background:rgba(255,252,246,.96);box-shadow:0 28px 80px rgba(35,50,58,.24);overflow:hidden}',
        '.aq-cmdpal-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(190,204,210,.42)}',
        '.aq-cmdpal-k{font:700 10px var(--fm,monospace);letter-spacing:.14em;text-transform:uppercase;color:var(--txt3,#8a98a1)}',
        '.aq-cmdpal-input{flex:1;border:0;background:transparent;outline:0;color:var(--txt,#23343d);font:600 17px var(--ui,inherit);min-width:0}',
        '.aq-cmdpal-list{max-height:420px;overflow:auto;padding:8px}',
        '.aq-cmdpal-empty{padding:22px;color:var(--txt3,#8a98a1);font:12px var(--fm,monospace);text-align:center}',
        '.aq-cmdpal-item{width:100%;display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;border:0;border-radius:16px;background:transparent;color:var(--txt,#23343d);padding:10px 12px;text-align:left;cursor:pointer}',
        '.aq-cmdpal-item:hover,.aq-cmdpal-item.active{background:rgba(80,113,132,.12)}',
        '.aq-cmdpal-icon{width:28px;height:28px;border-radius:10px;display:grid;place-items:center;background:rgba(80,113,132,.12);color:var(--acc,#4f7184);font-weight:700}',
        '.aq-cmdpal-copy{min-width:0;display:flex;flex-direction:column;gap:2px}',
        '.aq-cmdpal-title{font:650 13px var(--ui,inherit);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.aq-cmdpal-desc{font:11px var(--ui,inherit);color:var(--txt3,#8a98a1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.aq-cmdpal-meta{display:flex;align-items:center;justify-content:flex-end;gap:6px;min-width:0}',
        '.aq-cmdpal-shortcut{border:1px solid rgba(80,113,132,.20);border-radius:8px;background:rgba(255,255,255,.62);padding:3px 6px;font:800 9px var(--fm,monospace);color:var(--txt2,#51636d);white-space:nowrap}',
        '.aq-cmdpal-sec{font:700 9px var(--fm,monospace);letter-spacing:.12em;text-transform:uppercase;color:var(--txt3,#8a98a1);white-space:nowrap}',
        '.aq-shortcuts-bg{position:fixed;inset:0;z-index:100001;display:none;align-items:center;justify-content:center;background:rgba(28,39,45,.18);backdrop-filter:blur(6px)}',
        '.aq-shortcuts-bg.open{display:flex}',
        '.aq-shortcuts{width:min(620px,calc(100vw - 36px));border:1px solid rgba(151,169,178,.42);border-radius:24px;background:rgba(255,252,246,.97);box-shadow:0 28px 80px rgba(35,50,58,.24);overflow:hidden}',
        '.aq-shortcuts-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(190,204,210,.42)}',
        '.aq-shortcuts-title{font:750 14px var(--ui,inherit);color:var(--txt,#23343d)}',
        '.aq-shortcuts-close{border:0;background:transparent;color:var(--txt3,#8a98a1);font-size:20px;cursor:pointer}',
        '.aq-shortcuts-list{display:grid;grid-template-columns:1fr;gap:8px;padding:12px}',
        '.aq-shortcuts-item{display:grid;grid-template-columns:92px 1fr;gap:12px;align-items:flex-start;border:1px solid rgba(151,169,178,.26);border-radius:14px;background:rgba(255,255,255,.58);padding:10px}',
        '.aq-shortcuts-keys{display:inline-flex;justify-content:center;border:1px solid rgba(80,113,132,.24);border-radius:10px;background:rgba(80,113,132,.10);padding:5px 7px;font:800 10px var(--fm,monospace);color:var(--acc,#4f7184);white-space:nowrap}',
        '.aq-shortcuts-copy b{display:block;color:var(--txt,#23343d);font:750 12px var(--ui,inherit);margin-bottom:3px}',
        '.aq-shortcuts-copy span{display:block;color:var(--txt2,#51636d);font:11px var(--ui,inherit);line-height:1.45}',
        '.aq-side-panel{position:fixed;right:14px;top:92px;bottom:42px;width:min(360px,calc(100vw - 36px));z-index:9000;display:none;border:1px solid rgba(151,169,178,.38);border-radius:22px;background:rgba(255,252,246,.96);box-shadow:0 22px 70px rgba(35,50,58,.20);overflow:hidden}',
        'body.aq-side-panel-fullscreen #tb,body.aq-side-panel-fullscreen #lay{display:none!important}',
        'body.aq-side-panel-fullscreen #ctr{position:fixed;inset:0;z-index:9998;display:block!important;overflow:hidden!important;background:linear-gradient(180deg,#f7f2e9 0%,#efe7d8 100%)!important}',
        'body.aq-side-panel-fullscreen #escroll{display:none!important}',
        'body.aq-side-panel-fullscreen .aq-side-panel{left:0!important;top:0!important;right:0!important;bottom:0!important;width:auto!important;max-width:none!important;height:auto!important;min-height:0!important;z-index:10020!important;border-radius:0!important;box-shadow:none!important}',
        '.aq-side-panel.fullscreen{left:12px;top:12px;right:12px;bottom:12px;width:auto;max-width:none;z-index:10020;border-radius:22px;box-shadow:0 34px 110px rgba(35,50,58,.28)}',
        '.aq-side-panel.open{display:flex}',
        '.aq-side-panel.fullscreen .aq-side-resize{display:none}',
        '.aq-side-resize{position:absolute;left:0;top:0;bottom:0;width:7px;cursor:col-resize;z-index:3;background:transparent}',
        '.aq-side-resize:hover,.aq-side-panel.resizing .aq-side-resize{background:rgba(80,113,132,.16)}',
        '.aq-side-tabs{width:48px;padding:10px 7px;border-right:1px solid rgba(190,204,210,.42);display:flex;flex-direction:column;gap:8px;background:rgba(241,246,244,.72)}',
        '.aq-side-tab{width:34px;height:34px;border:1px solid rgba(151,169,178,.38);border-radius:13px;background:rgba(255,255,255,.72);color:var(--txt2,#51636d);cursor:pointer;font:800 11px var(--fm,monospace)}',
        '.aq-side-tab.active{background:var(--acc,#4f7184);color:#fff;border-color:var(--acc,#4f7184)}',
        '.aq-side-main{min-width:0;flex:1;display:flex;flex-direction:column}',
        '.aq-side-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(190,204,210,.42)}',
        '.aq-side-head-actions{display:flex;align-items:center;gap:6px}',
        '.aq-side-title{font:750 12px var(--ui,inherit);color:var(--txt,#23343d)}',
        '.aq-side-headbtn{border:0;background:transparent;color:var(--txt3,#8a98a1);font-size:18px;cursor:pointer;line-height:1;width:26px;height:26px;border-radius:8px}',
        '.aq-side-headbtn:hover{background:rgba(80,113,132,.10);color:var(--txt,#23343d)}',
        '.aq-side-body{padding:10px 12px;overflow:auto;font:12px var(--ui,inherit);color:var(--txt2,#51636d)}',
        'body.aq-side-panel-fullscreen .aq-side-body{padding:12px 14px}',
        '.aq-side-muted{font:11px var(--fm,monospace);color:var(--txt3,#8a98a1);line-height:1.5}',
        '.aq-side-controls{display:flex;gap:6px;align-items:center;margin:0 0 10px 0}',
        '.aq-side-search{flex:1;min-width:0;border:1px solid rgba(151,169,178,.38);border-radius:12px;background:rgba(255,255,255,.70);padding:8px 10px;color:var(--txt,#23343d);outline:0;font:12px var(--ui,inherit)}',
        '.aq-side-select{border:1px solid rgba(151,169,178,.38);border-radius:12px;background:rgba(255,255,255,.70);padding:8px 9px;color:var(--txt,#23343d);outline:0;font:11px var(--ui,inherit)}',
        '.aq-side-summary{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px 0}',
        '.aq-side-chip{border:1px solid rgba(151,169,178,.30);border-radius:999px;background:rgba(255,255,255,.56);padding:4px 8px;color:var(--txt2,#51636d);font:700 10px var(--fm,monospace)}',
        '::highlight(aq-grammar-issues){background:rgba(243,123,123,.18);text-decoration-line:underline;text-decoration-style:wavy;text-decoration-color:rgba(196,57,57,.92);text-decoration-thickness:1.4px;}',
        '.aq-outline-list{display:flex;flex-direction:column;gap:4px}',
        '.aq-outline-item{display:block;width:100%;border:0;background:transparent;text-align:left;border-radius:10px;padding:7px 8px;color:var(--txt,#23343d);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.aq-outline-item:hover,.aq-outline-item.active{background:rgba(80,113,132,.10)}',
        '.aq-outline-item[data-level="2"]{padding-left:18px}.aq-outline-item[data-level="3"]{padding-left:28px}.aq-outline-item[data-level="4"]{padding-left:38px}.aq-outline-item[data-level="5"]{padding-left:48px}',
        '.aq-outline-meta{display:block;margin-top:2px;color:var(--txt3,#8a98a1);font:10px var(--fm,monospace);overflow:hidden;text-overflow:ellipsis}',
        '.aq-issue-list{display:flex;flex-direction:column;gap:8px;margin-top:10px}',
        '.aq-issue{border:1px solid rgba(151,169,178,.32);border-radius:14px;background:rgba(255,255,255,.62);padding:9px 10px}',
        '.aq-issue.error{border-color:rgba(186,65,65,.32);background:rgba(254,243,243,.72)}',
        '.aq-issue.warning{border-color:rgba(179,131,58,.34);background:rgba(255,249,235,.72)}',
        '.aq-issue.ok{border-color:rgba(99,163,111,.32);background:rgba(240,251,244,.72)}',
        '.aq-issue-title{font:750 12px var(--ui,inherit);color:var(--txt,#23343d);margin-bottom:3px}',
        '.aq-issue-body{font:11px var(--ui,inherit);color:var(--txt2,#51636d);line-height:1.45}',
        '.aq-issue-action{margin-top:8px;border:1px solid rgba(80,113,132,.28);border-radius:999px;background:rgba(255,255,255,.74);color:var(--txt,#23343d);padding:6px 10px;font:700 10px var(--fm,monospace);cursor:pointer}',
        '.aq-issue-action:hover{border-color:rgba(80,113,132,.55);background:#fff}',
        '.aq-issue-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
        '.aq-issue-ignore{border:1px solid rgba(151,169,178,.24);border-radius:999px;background:rgba(255,255,255,.54);color:var(--txt3,#8a98a1);padding:6px 10px;font:700 10px var(--fm,monospace);cursor:pointer}',
        '.aq-issue-ignore:hover{border-color:rgba(80,113,132,.45);color:var(--txt,#23343d);background:#fff}',
        '.aq-graph-list{display:flex;flex-direction:column;gap:7px;margin-top:10px}',
        '.aq-graph-section{margin-top:12px}',
        '.aq-graph-section-title{font:800 10px var(--fm,monospace);letter-spacing:.12em;text-transform:uppercase;color:var(--txt3,#8a98a1);margin-bottom:6px}',
        '.aq-graph-item{border:1px solid rgba(151,169,178,.28);border-radius:12px;background:rgba(255,255,255,.55);padding:8px 9px;color:var(--txt,#23343d);font:12px var(--ui,inherit);line-height:1.35;overflow:hidden;text-overflow:ellipsis}',
        '.aq-graph-item.warn{border-color:rgba(179,131,58,.34);background:rgba(255,249,235,.72)}',
        '.aq-graph-item.error{border-color:rgba(186,65,65,.32);background:rgba(254,243,243,.72)}',
        '.aq-cite-svg-wrap{margin:10px 0 12px 0;padding:8px;border:1px solid rgba(151,169,178,.28);border-radius:14px;background:rgba(255,255,255,.55);max-width:100%;overflow:auto}',
        'body.aq-side-panel-fullscreen .aq-cite-svg-wrap{max-height:34vh}',
        '.aq-cite-svg{display:block;width:100%;height:auto;max-width:100%;overflow:visible}',
        'body.aq-side-panel-fullscreen .aq-cite-svg{max-height:30vh}',
        '.aq-cite-edge{stroke:rgba(80,113,132,.34);stroke-width:1.2}',
        '.aq-cite-edge.warn{stroke:rgba(179,131,58,.52);stroke-dasharray:3 3}',
        '.aq-cite-edge.error{stroke:rgba(186,65,65,.58);stroke-dasharray:4 4}',
        '.aq-cite-center{fill:rgba(80,113,132,.86);stroke:#fff;stroke-width:1.5}',
        '.aq-cite-center-label{fill:#fff;font:700 9px var(--fm,monospace);letter-spacing:.03em}',
        '.aq-cite-node-circle{fill:#9bb0bb;stroke:rgba(255,255,255,.92);stroke-width:1.4}',
        '.aq-cite-node.ok .aq-cite-node-circle{fill:#63a36f}',
        '.aq-cite-node.warn .aq-cite-node-circle{fill:#b3833a}',
        '.aq-cite-node.error .aq-cite-node-circle{fill:#ba4141}',
        '.aq-cite-node-label{fill:var(--txt2,#51636d);font:700 9px var(--fm,monospace);pointer-events:none}',
        '.aq-suggest-list{display:flex;flex-direction:column;gap:9px}',
        '.aq-suggest-card{border:1px solid rgba(151,169,178,.30);border-radius:15px;background:rgba(255,255,255,.62);padding:10px 11px}',
        '.aq-suggest-card.error{border-color:rgba(186,65,65,.32);background:rgba(254,243,243,.72)}',
        '.aq-suggest-card.warning{border-color:rgba(179,131,58,.34);background:rgba(255,249,235,.72)}',
        '.aq-suggest-card.ok{border-color:rgba(99,163,111,.32);background:rgba(240,251,244,.72)}',
        '.aq-suggest-title{font:750 12px var(--ui,inherit);color:var(--txt,#23343d);margin-bottom:4px}',
        '.aq-suggest-body{font:11px var(--ui,inherit);color:var(--txt2,#51636d);line-height:1.45}',
        '.aq-suggest-action{margin-top:8px;border:1px solid rgba(80,113,132,.28);border-radius:999px;background:rgba(255,255,255,.74);color:var(--txt,#23343d);padding:6px 10px;font:700 10px var(--fm,monospace);cursor:pointer}',
        '.aq-suggest-action:hover{border-color:rgba(80,113,132,.55);background:#fff}',
        '.aq-history-list{display:flex;flex-direction:column;gap:9px;margin-top:10px}',
        '.aq-history-card{border:1px solid rgba(151,169,178,.30);border-radius:15px;background:rgba(255,255,255,.62);padding:10px 11px}',
        '.aq-history-card.warning{border-color:rgba(179,131,58,.34);background:rgba(255,249,235,.72)}',
        '.aq-history-card.ok{border-color:rgba(99,163,111,.32);background:rgba(240,251,244,.72)}',
        '.aq-history-title{font:750 12px var(--ui,inherit);color:var(--txt,#23343d);margin-bottom:4px}',
        '.aq-history-body{font:11px var(--ui,inherit);color:var(--txt2,#51636d);line-height:1.45}',
        '.aq-history-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}',
        '.aq-history-action{border:1px solid rgba(80,113,132,.28);border-radius:999px;background:rgba(255,255,255,.74);color:var(--txt,#23343d);padding:6px 10px;font:700 10px var(--fm,monospace);cursor:pointer}',
        '.aq-history-action:hover{border-color:rgba(80,113,132,.55);background:#fff}',
        '.aq-pdf-digest-preview{max-height:260px;overflow:auto;border:1px solid rgba(151,169,178,.28);border-radius:14px;background:rgba(255,255,255,.56);padding:10px;margin-top:10px;white-space:pre-wrap;font:11px/1.5 var(--ui,inherit);color:var(--txt2,#51636d)}',
        '.aq-pdf-annotation-list{display:flex;flex-direction:column;gap:7px;margin-top:10px;max-height:220px;overflow:auto;padding-right:2px}',
        '.aq-pdf-annotation-card{border:1px solid rgba(151,169,178,.28);border-radius:13px;background:rgba(255,255,255,.60);padding:8px 9px}',
        '.aq-pdf-annotation-card.note{border-color:rgba(80,113,132,.34);background:rgba(244,249,251,.74)}',
        '.aq-pdf-annotation-meta{display:flex;align-items:center;gap:6px;margin-bottom:4px;color:var(--txt3,#8a98a1);font:800 9px var(--fm,monospace);letter-spacing:.08em;text-transform:uppercase}',
        '.aq-pdf-annotation-text{color:var(--txt2,#51636d);font:11px/1.45 var(--ui,inherit)}',
        '.aq-pdf-digest-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}',
        '.aq-pdf-digest-action{border:1px solid rgba(80,113,132,.28);border-radius:999px;background:rgba(255,255,255,.74);color:var(--txt,#23343d);padding:6px 10px;font:700 10px var(--fm,monospace);cursor:pointer}',
        '.aq-pdf-digest-action.primary{background:var(--acc,#4f7184);border-color:var(--acc,#4f7184);color:#fff}',
        '.aq-pdf-digest-action:hover{border-color:rgba(80,113,132,.55);background:#fff;color:var(--txt,#23343d)}',
        '#sbar.aq-lean-status{gap:8px}',
        '.aq-status-pill{display:inline-flex;align-items:center;gap:5px;border:1px solid rgba(151,169,178,.30);border-radius:999px;padding:2px 8px;background:rgba(255,255,255,.58);color:var(--txt2,#51636d);font:700 10px var(--fm,monospace);white-space:nowrap;cursor:default}',
        '.aq-status-pill.clickable{cursor:pointer}.aq-status-pill.clickable:hover{border-color:rgba(80,113,132,.55);color:var(--txt,#23343d)}',
        '.aq-status-pill.ok{border-color:rgba(99,163,111,.28);color:#2d6a3d;background:rgba(240,251,244,.70)}',
        '.aq-status-pill.warning,.aq-status-pill.saving{border-color:rgba(179,131,58,.34);color:#7a541f;background:rgba(255,249,235,.76)}',
        '.aq-status-pill.error{border-color:rgba(186,65,65,.34);color:#8b2f2f;background:rgba(254,243,243,.76)}',
        '.aq-status-dot{width:7px;height:7px;border-radius:50%;background:#63a36f;box-shadow:0 0 0 3px rgba(99,163,111,.12)}',
        // Lean status bar carries autosave/save-state now; keep top toolbar from
        // showing the same pill twice while preserving #synclbl text for state reads.
        '#tb #synclbl{display:none!important}'
      ].join('\n');
      d.head.appendChild(style);
    }

    function ensurePalette(){
      var d = doc();
      if(!d) return null;
      var bg = byId('aqCmdPalette');
      if(bg) return bg;
      bg = d.createElement('div');
      bg.id = 'aqCmdPalette';
      bg.className = 'aq-cmdpal-bg';
      bg.innerHTML = '<div class="aq-cmdpal" role="dialog" aria-modal="true" aria-label="Komut paleti">'
        + '<div class="aq-cmdpal-head"><span class="aq-cmdpal-k">Komut</span><input id="aqCmdPaletteInput" class="aq-cmdpal-input" placeholder="Komut ara..." autocomplete="off"/><span class="aq-cmdpal-k">Enter</span></div>'
        + '<div id="aqCmdPaletteList" class="aq-cmdpal-list"></div></div>';
      d.body.appendChild(bg);
      bg.addEventListener('mousedown', function(event){ if(event.target === bg) closePalette(); });
      var input = byId('aqCmdPaletteInput');
      if(input){
        input.addEventListener('input', function(){ state.selectedIndex = 0; renderPalette(); });
        input.addEventListener('keydown', function(event){
          var visible = getVisibleCommands();
          if(event.key === 'Escape'){ event.preventDefault(); closePalette(); return; }
          if(event.key === 'ArrowDown'){ event.preventDefault(); state.selectedIndex = Math.min(visible.length - 1, state.selectedIndex + 1); renderPalette(); return; }
          if(event.key === 'ArrowUp'){ event.preventDefault(); state.selectedIndex = Math.max(0, state.selectedIndex - 1); renderPalette(); return; }
          if(event.key === 'Enter'){
            event.preventDefault();
            var command = visible[state.selectedIndex];
            if(command) runCommand(command.id);
          }
        });
      }
      return bg;
    }

    function getVisibleCommands(){
      var input = byId('aqCmdPaletteInput');
      return filterCommands(state.commands, input ? input.value : '', 20, state.recentCommandIds);
    }

    function renderPalette(){
      var list = byId('aqCmdPaletteList');
      if(!list) return;
      var visible = getVisibleCommands();
      if(!visible.length){
        list.innerHTML = '<div class="aq-cmdpal-empty">Komut bulunamadi.</div>';
        return;
      }
      list.innerHTML = '';
      var btns = [];
      visible.forEach(function(command, index){
        var item = buildCommandPaletteItemModel(command);
        var btn = doc().createElement('button');
        btn.type = 'button';
        btn.className = 'aq-cmdpal-item' + (index === state.selectedIndex ? ' active' : '');
        btn.innerHTML = '<span class="aq-cmdpal-icon">' + escapeHTML(item.icon) + '</span>'
          + '<span class="aq-cmdpal-copy"><span class="aq-cmdpal-title">' + escapeHTML(item.title) + '</span>'
          + (item.description ? '<span class="aq-cmdpal-desc">' + escapeHTML(item.description) + '</span>' : '') + '</span>'
          + '<span class="aq-cmdpal-meta">'
          + (item.shortcut ? '<span class="aq-cmdpal-shortcut">' + escapeHTML(item.shortcut) + '</span>' : '')
          + '<span class="aq-cmdpal-sec">' + escapeHTML(item.section) + '</span></span>';
        // IMPORTANT: only update active class on hover — do NOT re-render the list,
        // or the button gets destroyed between mousedown and mouseup and the click
        // event never fires.
        btn.addEventListener('mouseenter', function(){
          state.selectedIndex = index;
          for(var i=0;i<btns.length;i++){
            btns[i].classList.toggle('active', i === index);
          }
        });
        btn.addEventListener('mousedown', function(event){ event.preventDefault(); });
        btn.addEventListener('click', function(){ runCommand(command.id); });
        list.appendChild(btn);
        btns.push(btn);
      });
    }

    function openPalette(){
      injectStyles();
      ensureDefaultCommands();
      var bg = ensurePalette();
      if(!bg) return;
      state.paletteOpen = true;
      state.selectedIndex = 0;
      bg.classList.add('open');
      var input = byId('aqCmdPaletteInput');
      if(input){
        input.value = '';
        renderPalette();
        setTimeout(function(){ input.focus(); input.select(); }, 0);
      }
    }

    function closePalette(){
      var bg = byId('aqCmdPalette');
      if(bg) bg.classList.remove('open');
      state.paletteOpen = false;
    }

    function registerCommand(command){
      if(!command || !command.id) return;
      var existingIndex = state.commands.findIndex(function(item){ return item.id === command.id; });
      if(existingIndex >= 0) state.commands.splice(existingIndex, 1, command);
      else state.commands.push(command);
    }

    function runCommand(id){
      var command = state.commands.find(function(item){ return item.id === id; });
      if(!command) return false;
      closePalette();
      recordRecentCommand(command.id);
      safeRun(command.run);
      return true;
    }

    function loadRecentCommands(){
      var store = storage();
      var raw = [];
      if(store){
        try{ raw = JSON.parse(store.getItem(RECENT_COMMANDS_KEY) || '[]'); }catch(_error){ raw = []; }
      }
      state.recentCommandIds = normalizeRecentCommandIds(raw, state.commands.map(function(command){ return command && command.id; }), MAX_RECENT_COMMANDS);
    }

    function recordRecentCommand(id){
      if(id === 'open-command-palette') return;
      state.recentCommandIds = recordRecentCommandId(state.recentCommandIds, id, MAX_RECENT_COMMANDS);
      var store = storage();
      if(store){
        try{ store.setItem(RECENT_COMMANDS_KEY, JSON.stringify(state.recentCommandIds)); }catch(_error){}
      }
    }

    function loadIgnoredIssueCodes(){
      var store = storage();
      var raw = [];
      if(store){
        try{ raw = JSON.parse(store.getItem(LINTER_IGNORES_KEY) || '[]'); }catch(_error){ raw = []; }
      }
      state.ignoredIssueCodes = normalizeIgnoredIssueCodes(raw);
    }

    function persistIgnoredIssueCodes(){
      var store = storage();
      if(store){
        try{ store.setItem(LINTER_IGNORES_KEY, JSON.stringify(state.ignoredIssueCodes)); }catch(_error){}
      }
    }

    function ignoreLinterIssue(code){
      var value = String(code || '').trim();
      if(!value) return;
      var next = normalizeIgnoredIssueCodes(state.ignoredIssueCodes.concat([value]));
      state.ignoredIssueCodes = next;
      persistIgnoredIssueCodes();
      renderSidePanel();
      updateStatusBar(true);
    }

    function resetIgnoredLinterIssues(){
      state.ignoredIssueCodes = [];
      persistIgnoredIssueCodes();
      renderSidePanel();
      updateStatusBar(true);
    }

    function resetIgnoredLinterIssuesForCurrentDoc(){
      var currentDoc = getCurrentDocRecordSafe();
      var docId = currentDoc && currentDoc.id ? String(currentDoc.id) : '';
      state.ignoredIssueCodes = removeIgnoredIssueTokensForDoc(state.ignoredIssueCodes, docId);
      persistIgnoredIssueCodes();
      renderSidePanel();
      updateStatusBar(true);
    }

    function clickIfExists(id){
      var el = byId(id);
      if(el && typeof el.click === 'function'){ el.click(); return true; }
      return false;
    }

    function focusIfExists(id){
      var el = byId(id);
      if(!el || typeof el.focus !== 'function') return false;
      try{ el.focus(); }catch(_error){}
      if(typeof el.select === 'function'){
        try{ el.select(); }catch(_selectError){}
      }
      return true;
    }

    function openFindCommand(){
      if(focusIfExists('toolbarFindInp')) return;
      if(clickIfExists('findbtn')){
        setTimeout(function(){ focusIfExists('toolbarFindInp') || focusIfExists('findinp'); }, 0);
        return;
      }
      focusIfExists('findinp');
    }

    function openReplaceCommand(){
      if(clickIfExists('toolbarFindReplaceBtn')) return;
      if(clickIfExists('findbtn')){
        setTimeout(function(){ focusIfExists('replaceinp') || focusIfExists('toolbarReplaceInp'); }, 0);
        return;
      }
      focusIfExists('replaceinp') || focusIfExists('toolbarReplaceInp');
    }

    function ensureShortcutHelp(){
      var d = doc();
      if(!d) return null;
      var bg = byId('aqShortcutHelp');
      if(bg) return bg;
      bg = d.createElement('div');
      bg.id = 'aqShortcutHelp';
      bg.className = 'aq-shortcuts-bg';
      bg.innerHTML = '<div class="aq-shortcuts" role="dialog" aria-modal="true" aria-label="Klavye kisayollari">'
        + '<div class="aq-shortcuts-head"><div class="aq-shortcuts-title">Klavye kisayollari</div><button class="aq-shortcuts-close" type="button" id="aqShortcutHelpClose" title="Kapat">x</button></div>'
        + '<div class="aq-shortcuts-list">'
        + buildShortcutHelpModel().map(function(item){
          return '<div class="aq-shortcuts-item"><div class="aq-shortcuts-keys">' + escapeHTML(item.keys) + '</div><div class="aq-shortcuts-copy"><b>' + escapeHTML(item.title) + '</b><span>' + escapeHTML(item.body) + '</span></div></div>';
        }).join('')
        + '</div></div>';
      d.body.appendChild(bg);
      bg.addEventListener('mousedown', function(event){ if(event.target === bg) closeShortcutHelp(); });
      var close = byId('aqShortcutHelpClose');
      if(close) close.addEventListener('click', closeShortcutHelp);
      return bg;
    }

    function openShortcutHelp(){
      injectStyles();
      var bg = ensureShortcutHelp();
      if(bg) bg.classList.add('open');
    }

    function closeShortcutHelp(){
      var bg = byId('aqShortcutHelp');
      if(bg) bg.classList.remove('open');
    }

    function openPdfAnnotationSearch(){
      openSidePanel('pdfnotes');
      setTimeout(function(){
        var input = byId('aqPdfAnnotationSearch');
        if(input){
          try{
            input.focus();
            input.select();
          }catch(_error){}
        }
      }, 0);
    }

    function getCitationStylesApi(){
      var w = win();
      return w && w.AQCitationStyles ? w.AQCitationStyles : null;
    }

    function getSupportedCitationStyles(){
      var api = getCitationStylesApi();
      var normalizeFn = api && typeof api.normalizeStyleId === 'function'
        ? api.normalizeStyleId.bind(api)
        : null;
      var styles = (api && typeof api.supportedStyles === 'function')
        ? api.supportedStyles()
        : null;
      return normalizeCitationStyleCatalog(styles, normalizeFn);
    }

    function getCurrentCitationStyleSafe(){
      var w = win();
      var api = getCitationStylesApi();
      var normalizeFn = api && typeof api.normalizeStyleId === 'function'
        ? api.normalizeStyleId.bind(api)
        : null;
      if(w && typeof w.getCurrentCitationStyle === 'function'){
        try{
          return normalizeCitationStyleId(w.getCurrentCitationStyle(), normalizeFn);
        }catch(_error){}
      }
      var docRecord = getCurrentDocRecordSafe();
      if(docRecord && docRecord.citationStyle){
        return normalizeCitationStyleId(docRecord.citationStyle, normalizeFn);
      }
      var select = byId('citationStyleSel');
      if(select && select.value){
        return normalizeCitationStyleId(select.value, normalizeFn);
      }
      return normalizeCitationStyleId('apa7', normalizeFn);
    }

    function applyCitationStyle(styleId){
      var w = win();
      if(!w) return false;
      var api = getCitationStylesApi();
      var normalizeFn = api && typeof api.normalizeStyleId === 'function'
        ? api.normalizeStyleId.bind(api)
        : null;
      var next = normalizeCitationStyleId(styleId, normalizeFn);
      var current = getCurrentCitationStyleSafe();
      if(current === next) return true;
      if(typeof w.setCitationStyle === 'function'){
        try{
          w.setCitationStyle(next);
          updateStatusBar(true);
          return true;
        }catch(_error){}
      }
      var select = byId('citationStyleSel');
      if(select){
        select.value = next;
        if(typeof select.dispatchEvent === 'function'){
          select.dispatchEvent(new Event('change', { bubbles:true }));
        }
        updateStatusBar(true);
        return true;
      }
      return false;
    }

    function cycleCitationStyle(){
      var styles = getSupportedCitationStyles();
      if(!styles.length) return false;
      var current = getCurrentCitationStyleSafe();
      var idx = styles.findIndex(function(style){ return style.id === current; });
      var next = styles[(idx + 1) % styles.length];
      return !!(next && applyCitationStyle(next.id));
    }

    function openCitationStylePicker(){
      var w = win();
      if(!w || typeof w.prompt !== 'function') return false;
      var styles = getSupportedCitationStyles();
      if(!styles.length) return false;
      var current = getCurrentCitationStyleSafe();
      var listText = styles.map(function(style, index){
        var active = style.id === current ? ' *' : '';
        return (index + 1) + '. ' + style.label + ' (' + style.id + ')' + active;
      }).join('\n');
      var input = w.prompt('Atif stilini sec:\n' + listText + '\n\nStil kodu veya sira numarasi gir.', String(current));
      if(input == null) return false;
      var raw = String(input || '').trim();
      if(!raw) return false;
      var idx = Number(raw);
      if(Number.isFinite(idx) && idx >= 1 && idx <= styles.length){
        return applyCitationStyle(styles[idx - 1].id);
      }
      return applyCitationStyle(raw);
    }

    function registerCitationStyleCommands(){
      getSupportedCitationStyles().forEach(function(style){
        if(!style || !style.id) return;
        var safeId = String(style.id).replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
        registerCommand({
          id: 'citation-style-' + safeId,
          title: 'Atif stili: ' + style.label,
          section: 'Belge',
          icon: 'CS',
          description: style.label + ' stiline gec ve atif/kaynakca gorunumunu guncelle.',
          keywords: ['citation', 'style', 'csl', 'apa', 'mla', 'ieee', 'harvard', style.id, style.label],
          run: function(){ applyCitationStyle(style.id); }
        });
      });
    }

    function ensureDefaultCommands(){
      [
        {id:'open-command-palette', title:'Komut paletini ac', section:'Gorunum', icon:'K', shortcut:'Ctrl+K', description:'Uygulama komutlarini tek yerden calistir.', keywords:['ara','komut'], run:openPalette},
        {id:'keyboard-help', title:'Klavye kisayollarini goster', section:'Gorunum', icon:'?', shortcut:'?', description:'Temel hizli akis kisayollarini goster.', keywords:['kisayol','yardim','shortcut','help'], run:openShortcutHelp},
        {id:'open-outline-panel', title:'Baslik haritasini ac', section:'Belge', icon:'O', shortcut:'F9', description:'Sag panelde belge anahatini ac.', keywords:['outline','anahat','baslik'], run:function(){ openSidePanel('outline'); }},
        {id:'open-apa-linter', title:'APA kontrol panelini ac', section:'Kalite', icon:'A', description:'Atif, kaynakca ve bicim uyarilarini denetle.', keywords:['linter','uyari','kontrol'], run:function(){ openSidePanel('linter'); }},
        {id:'citation-style-picker', title:'Atif stilini degistir', section:'Belge', icon:'CS', description:'APA 7, MLA, Chicago, IEEE veya Harvard stiline gec.', keywords:['citation','style','csl','apa','mla','ieee','harvard'], run:openCitationStylePicker},
        {id:'citation-style-next', title:'Atif stilini siradaki stile gecir', section:'Belge', icon:'CS+', description:'Mevcut atif stilini bir sonraki desteklenen stile cevirir.', keywords:['citation','style','next','degistir'], run:cycleCitationStyle},
        {id:'open-citation-graph', title:'Atif grafigini ac', section:'Referans', icon:'C', description:'Metindeki atiflarla library kayitlarini karsilastir.', keywords:['citation','atif','graph'], run:function(){ openSidePanel('citegraph'); }},
        {id:'open-suggestions', title:'Oneriler panelini ac', section:'Veri', icon:'S', description:'Belge icin dusuk kalabalikli sonraki adimlari goster.', keywords:['oneri','kaynak'], run:function(){ openSidePanel('suggest'); }},
        {id:'open-track-review', title:'Inceleme panelini ac', section:'Yazim', icon:'TR', description:'Track changes onerilerini tek panelde kabul/geri al.', keywords:['track changes','inceleme','review','suggestion'], run:function(){ openSidePanel('track'); }},
        {id:'open-history', title:'Gecmis ve recovery panelini ac', section:'Yazim', icon:'H', description:'Autosave, recovery ve son snapshot durumunu goster.', keywords:['autosave','recovery','gecmis'], run:function(){ openSidePanel('history'); }},
        {id:'toggle-track-changes', title:'Inceleme modunu ac/kapat', section:'Yazim', icon:'TR', shortcut:'Ctrl+Shift+E', description:'Word benzeri onerili degisiklik modunu acar/kapatir.', keywords:['track changes','suggestion','inceleme','revizyon'], run:function(){ var w = win(); if(w && typeof w.toggleTrackChangesMode === 'function') w.toggleTrackChangesMode(); else if(w && w.AQTipTapWordCommands && typeof w.AQTipTapWordCommands.setTrackChangesEnabled === 'function'){ w.AQTipTapWordCommands.setTrackChangesEnabled(null, { source:'palette' }); } }},
        {id:'focus-prev-track-change', title:'Onceki oneriye git', section:'Yazim', icon:'T←', description:'Inceleme modundaki onceki degisiklik onerisine gider.', keywords:['track changes','previous','onceki','oneri'], run:function(){ var w = win(); if(w && typeof w.focusPrevTrackedChange === 'function') w.focusPrevTrackedChange(); else if(w && typeof w.ec === 'function') w.ec('focusPrevTrackChange'); }},
        {id:'focus-next-track-change', title:'Sonraki oneriye git', section:'Yazim', icon:'T→', description:'Inceleme modundaki sonraki degisiklik onerisine gider.', keywords:['track changes','next','sonraki','oneri'], run:function(){ var w = win(); if(w && typeof w.focusNextTrackedChange === 'function') w.focusNextTrackedChange(); else if(w && typeof w.ec === 'function') w.ec('focusNextTrackChange'); }},
        {id:'accept-current-track-change', title:'Secili oneriyi kabul et', section:'Yazim', icon:'T✓', description:'Imlecin/seleksiyonun oldugu degisiklik onerisini kabul eder.', keywords:['track changes','accept current','secili','kabul'], run:function(){ var w = win(); if(w && typeof w.acceptCurrentTrackedChange === 'function') w.acceptCurrentTrackedChange(); else if(w && typeof w.ec === 'function') w.ec('acceptCurrentTrackChange'); }},
        {id:'reject-current-track-change', title:'Secili oneriyi geri al', section:'Yazim', icon:'T↺', description:'Imlecin/seleksiyonun oldugu degisiklik onerisini geri alir.', keywords:['track changes','reject current','secili','geri al'], run:function(){ var w = win(); if(w && typeof w.rejectCurrentTrackedChange === 'function') w.rejectCurrentTrackedChange(); else if(w && typeof w.ec === 'function') w.ec('rejectCurrentTrackChange'); }},
        {id:'accept-track-changes', title:'Tum onerileri kabul et', section:'Yazim', icon:'TA', description:'Inceleme modundaki tum silme/ekleme onerilerini kabul eder.', keywords:['track changes','accept','kabul'], run:function(){ var w = win(); if(w && typeof w.acceptTrackedChanges === 'function') w.acceptTrackedChanges(); else if(w && typeof w.ec === 'function') w.ec('acceptTrackChanges'); }},
        {id:'reject-track-changes', title:'Tum onerileri geri al', section:'Yazim', icon:'TRJ', description:'Inceleme modundaki tum silme/ekleme onerilerini geri alir.', keywords:['track changes','reject','geri al'], run:function(){ var w = win(); if(w && typeof w.rejectTrackedChanges === 'function') w.rejectTrackedChanges(); else if(w && typeof w.ec === 'function') w.ec('rejectTrackChanges'); }},
        {id:'refresh-side-panel', title:'Sag paneli yenile', section:'Gorunum', icon:'R', description:'Acik paneldeki verileri yeniden hesapla.', keywords:['panel','outline','linter','yenile'], run:function(){ renderSidePanel(); }},
        {id:'export-preflight', title:'Export oncesi kalite kontrolu', section:'Kalite', icon:'Q', description:'PDF/DOCX cikti oncesi riskleri tek panelde goster.', keywords:['preflight','pdf','docx','apa','kontrol'], run:function(){ runPreflight({interactive:false, openPanel:true}); }},
        {id:'bibliography-refresh', title:'Kaynakcayi guncelle', section:'Kaynakca', icon:'B', description:'APA 7 kaynakca sayfasini yeniden sirala ve senkronla.', keywords:['apa','references'], run:function(){ if(!clickIfExists('bibliographyRefreshBtn')) clickIfExists('refreshBibliographyBtn'); }},
        {id:'bibliography-go', title:'Kaynakcaya git', section:'Kaynakca', icon:'G', description:'Kaynakca sayfasina hizlica atla.', keywords:['references','git'], run:function(){ if(!clickIfExists('bibliographyGoBtn')) clickIfExists('goBibliographyBtn'); }},
        {id:'external-bibliography', title:'Disaridan kaynakca ekle', section:'Kaynakca', icon:'+', description:'APA metni, DOI, BibTeX veya RIS kaynagini iceri al.', keywords:['apa metin','bib','ris','doi'], run:function(){ if(!clickIfExists('externalBibliographyBtn')) clickIfExists('bibliographyMenuBtn'); }},
        {id:'export-bibliography-apa', title:'Kaynakcayi APA TXT olarak disa aktar', section:'Disa Aktar', icon:'EA', description:'Kaynakca listesini APA 7 sirali duz metin olarak kaydeder.', keywords:['kaynakca','apa','txt','export','disa aktar'], run:function(){ var w = win(); if(w && typeof w.expBibliographyAPA === 'function') w.expBibliographyAPA(); }},
        {id:'export-bibliography-chicago', title:'Kaynakcayi Chicago TXT olarak disa aktar', section:'Disa Aktar', icon:'EC', description:'Kaynakca listesini Chicago Author-Date duz metin cikti olarak kaydeder.', keywords:['kaynakca','chicago','txt','export','disa aktar'], run:function(){ var w = win(); if(w && typeof w.expBibliographyChicago === 'function') w.expBibliographyChicago(); }},
        {id:'export-bibliography-vancouver', title:'Kaynakcayi Vancouver TXT olarak disa aktar', section:'Disa Aktar', icon:'EV', description:'Kaynakca listesini Vancouver benzeri numerik duz metin cikti olarak kaydeder.', keywords:['kaynakca','vancouver','txt','export','disa aktar'], run:function(){ var w = win(); if(w && typeof w.expBibliographyVancouver === 'function') w.expBibliographyVancouver(); }},
        {id:'export-bibliography-csl', title:'Kaynakcayi CSL-JSON olarak disa aktar', section:'Disa Aktar', icon:'EJ', description:'Kaynakca kayitlarini CSL-JSON veri formatinda kaydeder.', keywords:['kaynakca','csl','json','export','disa aktar'], run:function(){ var w = win(); if(w && typeof w.expCSLJSON === 'function') w.expCSLJSON(); }},
        {id:'find-duplicates', title:'Yinelenen kaynaklari tara', section:'Referans', icon:'D', description:'DOI ve baslik benzerligiyle tekrar kayitlari bul.', keywords:['duplicate','dedupe'], run:function(){ clickIfExists('btnFindDuplicates'); }},
        {id:'page-jump', title:'Sayfaya git', section:'Belge', icon:'PG', shortcut:'Ctrl+G', description:'Belgede hedef sayfaya hizli atla.', keywords:['sayfa','page','jump','git'], run:openPageJump},
        {id:'find-in-document', title:'Belgede bul', section:'Yazim', icon:'F', shortcut:'Ctrl+F', description:'Editor toolbarindaki bul alanina odaklan.', keywords:['bul','ara','ctrl f','find'], run:openFindCommand},
        {id:'find-replace', title:'Bul ve degistir', section:'Yazim', icon:'R', description:'Bul/degistir akisini ac.', keywords:['degistir','replace','bul'], run:openReplaceCommand},
        {id:'word-stats', title:'Kelime ve belge istatistikleri', section:'Yazim', icon:'W', description:'Kelime, sayfa ve APA durumunu status/panel uzerinden goster.', keywords:['kelime','sayfa','istatistik'], run:function(){ openSidePanel('linter'); }},
        {id:'focus-mode', title:'Odak modunu ac/kapat', section:'Yazim', icon:'F', description:'Dikkat dagitan panelleri azaltan yazim modunu degistir.', keywords:['zen','focus'], run:function(){ clickIfExists('zenbtn'); }},
        {id:'backup-project', title:'Proje yedegi al (.aqresearch)', section:'Veri', icon:'BK', description:'Tum calisma alanlari, notlar, belgeler ve PDF verisini tek dosyaya yedekler.', keywords:['backup','yedek','aqresearch','export','proje'], run:function(){ var w = win(); if(w && typeof w.aqBackupProject === 'function') w.aqBackupProject(); }},
        {id:'restore-project', title:'Proje yedegini geri yukle (.aqresearch)', section:'Veri', icon:'RS', description:'Secilen .aqresearch yedegini geri yukler ve uygulamayi yeniler.', keywords:['restore','geri','yukle','aqresearch','import','proje'], run:function(){ var w = win(); if(w && typeof w.aqRestoreProject === 'function') w.aqRestoreProject(); }},
        {id:'pdf-annotation-digest', title:'PDF not ozetini ac', section:'PDF', icon:'P', description:'Highlight ve PDF notlarini tek sindirilebilir ozette topla.', keywords:['annotasyon','digest','not','highlight'], run:function(){ openSidePanel('pdfnotes'); }},
        {id:'open-annotation-digest', title:'PDF not ozetini belgeye aktar', section:'PDF', icon:'A+', description:'Aktif PDF annotationlarindan ozet olusturup belgeye aktar.', keywords:['annotation','not','ozet','digest','belge'], run:function(){ var w = win(); if(w && typeof w.insertPdfAnnotationDigestIntoDocument === 'function') w.insertPdfAnnotationDigestIntoDocument(); }},
        {id:'copy-annotation-digest', title:'PDF not ozetini panoya kopyala', section:'PDF', icon:'AC', description:'Aktif PDF annotation ozetini markdown olarak panoya kopyalar.', keywords:['annotation','kopyala','copy','digest','markdown'], run:function(){ var w = win(); if(w && typeof w.copyPdfAnnotationDigest === 'function') w.copyPdfAnnotationDigest(); }},
        {id:'annotations-to-notes', title:'PDF annotationlarini notlara aktar', section:'PDF', icon:'AN', description:'Aktif PDF highlight ve notlarini arastirma notlarina tasir.', keywords:['annotation','not','notes','aktar'], run:function(){ var w = win(); if(w && typeof w.createNotesFromPdfAnnotationItems === 'function') w.createNotesFromPdfAnnotationItems(); }},
        {id:'search-pdf-annotations', title:'PDF notlarinda ara', section:'PDF', icon:'AS', description:'Aktif PDF highlight ve notlari icinde lokal arama yap.', keywords:['annotation','not','highlight','ara','search'], run:openPdfAnnotationSearch},
        {id:'toggle-pdf-compare', title:'PDF karsilastirma modunu ac/kapat', section:'PDF', icon:'CP', description:'Aktif PDF ile ikinci bir PDF sekmesini yan yana goruntuler.', keywords:['pdf','compare','karsilastirma','side by side','yan yana'], run:function(){ var w = win(); if(w && typeof w.togglePdfCompareMode === 'function') w.togglePdfCompareMode(); }},
        {id:'select-pdf-compare-secondary', title:'Karsilastirma icin ikinci PDF sec', section:'PDF', icon:'C2', description:'Yan yana karsilastirma icin ikinci PDF sekmesini degistirir.', keywords:['pdf','compare','karsilastirma','ikinci'], run:function(){ var w = win(); if(w && typeof w.selectPdfCompareSecondaryTab === 'function') w.selectPdfCompareSecondaryTab(); }},
        {id:'toggle-pdf-compare-sync', title:'PDF karsilastirma scroll senkronu ac/kapat', section:'PDF', icon:'CS', description:'Yan yana compare modunda iki PDF arasinda scroll oranini esitler (desteklenen gorunumlerde).', keywords:['pdf','compare','scroll','senkron','sync'], run:function(){ var w = win(); if(w && typeof w.togglePdfCompareScrollSync === 'function') w.togglePdfCompareScrollSync(); }},
        {id:'scan-pdf-ocr-need', title:'PDF OCR ihtiyacini tara', section:'PDF', icon:'OCR', description:'Aktif PDFde metin katmanini kontrol eder ve OCR gereksinimini gunceller.', keywords:['pdf','ocr','text layer','metin katmani','scan','taranmis'], run:function(){ var w = win(); if(w && typeof w.runPdfOcrNeedScan === 'function') return w.runPdfOcrNeedScan(); if(w && typeof w.ec === 'function') return w.ec('runPdfOcrNeedScan'); }},
        {id:'run-pdf-ocr-now', title:'PDF OCR metin cikarimini baslat', section:'PDF', icon:'OCR+', description:'Metin katmani zayif PDF sayfalarindan AI ile OCR metni olusturur.', keywords:['pdf','ocr','extract','ai','text'], run:function(){ var w = win(); if(w && typeof w.runPdfOcrExtractionNow === 'function') return w.runPdfOcrExtractionNow(); if(w && typeof w.ec === 'function') return w.ec('runPdfOcrExtractionNow'); }},
        {id:'retry-pdf-ocr-failed', title:'PDF OCR basarisiz sayfalari tekrar dene', section:'PDF', icon:'OCRR', description:'Daha once OCR hatasi alan sayfalari yeniden dener.', keywords:['pdf','ocr','retry','failed','tekrar dene'], run:function(){ var w = win(); if(w && typeof w.runPdfOcrRetryFailedNow === 'function') return w.runPdfOcrRetryFailedNow(); if(w && typeof w.ec === 'function') return w.ec('runPdfOcrRetryFailedNow'); }},
        {id:'cancel-pdf-ocr', title:'PDF OCR islemini iptal et', section:'PDF', icon:'OCRX', description:'Calisan veya kuyrukta bekleyen OCR isini durdurur.', keywords:['pdf','ocr','cancel','iptal','dur'], run:function(){ var w = win(); if(w && typeof w.cancelPdfOcrRun === 'function') return w.cancelPdfOcrRun(); if(w && typeof w.ec === 'function') return w.ec('cancelPdfOcrRun'); }},
        {id:'show-pdf-ocr-status', title:'PDF OCR durumunu goster', section:'PDF', icon:'OS', description:'Aktif PDF icin OCR tarama/uygunluk durumunu ozetler.', keywords:['pdf','ocr','status','durum'], run:function(){ var w = win(); if(w && typeof w.showPdfOcrStatus === 'function') return w.showPdfOcrStatus(); if(w && typeof w.ec === 'function') return w.ec('showPdfOcrStatus'); }},
        {id:'capture-pdf-region', title:'PDF bolgesi sec (sekil/tablo yakala)', section:'PDF', icon:'RG', description:'PDF uzerinde bir dikdortgen secip belgeye sekil olarak ekle veya PNG indir.', keywords:['region','crop','sekil','figure','tablo','table','select','bolge','capture'], run:function(){ var w = win(); if(w && typeof w.togglePdfRegionCaptureMode === 'function') w.togglePdfRegionCaptureMode(); }},
        {id:'capture-pdf-page-to-doc', title:'PDF sayfasini belgeye sekil olarak ekle', section:'PDF', icon:'FI', description:'Aktif PDF sayfasini PNG olarak yakalayip belgeye sekil/figcaption ile ekler.', keywords:['figure','sekil','capture','pdf','sayfa','image','gorsel'], run:function(){ var w = win(); if(w && typeof w.capturePdfCurrentPageToDocument === 'function') w.capturePdfCurrentPageToDocument(); }},
        {id:'capture-pdf-page-download', title:'PDF sayfasini PNG olarak indir', section:'PDF', icon:'PN', description:'Aktif PDF sayfasini yuksek cozunurluklu PNG olarak kaydeder.', keywords:['png','capture','pdf','sayfa','download','indir'], run:function(){ var w = win(); if(w && typeof w.capturePdfCurrentPageDownload === 'function') w.capturePdfCurrentPageDownload(); }},
        {id:'pdf-annotated-export', title:'Annotationli PDF disa aktar', section:'PDF', icon:'PDF', description:'PDF notlarini flatten ederek disa aktar.', keywords:['annotasyon','flatten'], run:function(){ var w = win(); if(w && typeof w.exportAnnotatedPdf === 'function') w.exportAnnotatedPdf(); }}
      ].forEach(registerCommand);
      registerCitationStyleCommands();
    }

    function ensureSidePanel(){
      var d = doc();
      if(!d) return null;
      var panel = byId('aqSidePanel');
      if(panel) return panel;
      panel = d.createElement('div');
      panel.id = 'aqSidePanel';
      panel.className = 'aq-side-panel';
      panel.innerHTML = '<div class="aq-side-resize" id="aqSidePanelResize" title="Panel genisligini ayarla"></div><div class="aq-side-tabs">'
        + DEFAULT_TABS.map(function(tab){ return '<button class="aq-side-tab" type="button" data-aq-side-tab="' + tab.id + '" title="' + escapeHTML(tab.label) + '">' + tab.icon + '</button>'; }).join('')
        + '</div><div class="aq-side-main"><div class="aq-side-head"><div class="aq-side-title" id="aqSidePanelTitle">Anahat</div><div class="aq-side-head-actions"><button class="aq-side-headbtn" type="button" id="aqSidePanelFullscreen" title="Tam ekran">⤢</button><button class="aq-side-headbtn" type="button" id="aqSidePanelClose" title="Kapat">x</button></div></div><div class="aq-side-body" id="aqSidePanelBody"></div></div>';
      d.body.appendChild(panel);
      applyStoredPanelWidth(panel);
      bindPanelResize(panel);
      panel.querySelectorAll('[data-aq-side-tab]').forEach(function(btn){
        btn.addEventListener('click', function(){ setSidePanelTab(btn.getAttribute('data-aq-side-tab')); });
      });
      var close = byId('aqSidePanelClose');
      if(close) close.addEventListener('click', closeSidePanel);
      var full = byId('aqSidePanelFullscreen');
      if(full) full.addEventListener('click', toggleSidePanelFullscreen);
      applySidePanelFullscreen(panel);
      return panel;
    }

    function applyStoredPanelWidth(panel){
      var store = storage();
      var w = win();
      var saved = store ? Number(store.getItem(PANEL_WIDTH_KEY) || 0) : 0;
      var width = normalizePanelWidth(saved || PANEL_WIDTH_DEFAULT, w ? w.innerWidth : 0);
      if(panel && panel.style) panel.style.width = width + 'px';
    }

    function applyStoredPanelTab(){
      var store = storage();
      if(!store) return;
      var saved = '';
      try{ saved = store.getItem(PANEL_TAB_KEY) || ''; }catch(_error){}
      state.activePanelTab = normalizePanelTab(saved || state.activePanelTab, DEFAULT_TABS);
    }

    function persistPanelTab(tabId){
      var store = storage();
      if(!store) return;
      try{ store.setItem(PANEL_TAB_KEY, normalizePanelTab(tabId, DEFAULT_TABS)); }catch(_error){}
    }

    function bindPanelResize(panel){
      if(!panel || panel.__aqResizeBound) return;
      panel.__aqResizeBound = true;
      var handle = panel.querySelector('#aqSidePanelResize');
      if(!handle || typeof handle.addEventListener !== 'function') return;
      var startX = 0;
      var startWidth = 0;
      function move(event){
        var w = win();
        var next = normalizePanelWidth(startWidth + (startX - Number(event.clientX || 0)), w ? w.innerWidth : 0);
        panel.style.width = next + 'px';
      }
      function up(){
        var d = doc();
        var w = win();
        panel.classList.remove('resizing');
        if(d){
          d.removeEventListener('mousemove', move, true);
          d.removeEventListener('mouseup', up, true);
        }
        var store = storage();
        if(store){
          try{ store.setItem(PANEL_WIDTH_KEY, String(parseInt(panel.style.width, 10) || PANEL_WIDTH_DEFAULT)); }catch(_error){}
        }
        if(w && w.getSelection){
          try{ w.getSelection().removeAllRanges(); }catch(_error){}
        }
      }
      handle.addEventListener('mousedown', function(event){
        event.preventDefault();
        var d = doc();
        startX = Number(event.clientX || 0);
        startWidth = panel.getBoundingClientRect ? Number(panel.getBoundingClientRect().width || PANEL_WIDTH_DEFAULT) : PANEL_WIDTH_DEFAULT;
        panel.classList.add('resizing');
        if(d){
          d.addEventListener('mousemove', move, true);
          d.addEventListener('mouseup', up, true);
        }
      });
    }

    function applySidePanelFullscreen(panel){
      var on = !!state.panelFullscreen;
      var body = doc() && doc().body ? doc().body : null;
      if(panel && panel.classList) panel.classList.toggle('fullscreen', on);
      if(body && body.classList) body.classList.toggle('aq-side-panel-fullscreen', on);
      var btn = byId('aqSidePanelFullscreen');
      if(btn){
        btn.textContent = on ? '⤡' : '⤢';
        btn.setAttribute('title', on ? 'Küçült' : 'Tam ekran');
        btn.classList.toggle('active', on);
      }
    }

    function setSidePanelFullscreen(on){
      state.panelFullscreen = !!on;
      var panel = ensureSidePanel();
      if(panel){
        applySidePanelFullscreen(panel);
      }
      if(state.activePanelTab === 'linter' || state.activePanelTab === 'outline' || state.activePanelTab === 'suggest' || state.activePanelTab === 'citegraph' || state.activePanelTab === 'pdfnotes' || state.activePanelTab === 'track' || state.activePanelTab === 'history'){
        renderSidePanel();
      }
    }

    function toggleSidePanelFullscreen(){
      setSidePanelFullscreen(!state.panelFullscreen);
    }

    function openSidePanel(tabId){
      injectStyles();
      var panel = ensureSidePanel();
      if(!panel) return;
      panel.classList.add('open');
      applySidePanelFullscreen(panel);
      setSidePanelTab(tabId || state.activePanelTab || 'outline');
    }

    function closeSidePanel(){
      var panel = byId('aqSidePanel');
      setSidePanelFullscreen(false);
      if(panel) panel.classList.remove('open');
    }

    function setSidePanelTab(tabId){
      state.activePanelTab = normalizePanelTab(tabId || state.activePanelTab || 'outline', DEFAULT_TABS);
      persistPanelTab(state.activePanelTab);
      var tab = DEFAULT_TABS.find(function(item){ return item.id === state.activePanelTab; }) || DEFAULT_TABS[0];
      var title = byId('aqSidePanelTitle');
      if(title) title.textContent = tab.label;
      var panel = ensureSidePanel();
      if(panel){
        panel.querySelectorAll('[data-aq-side-tab]').forEach(function(btn){
          btn.classList.toggle('active', btn.getAttribute('data-aq-side-tab') === tab.id);
        });
      }
      if(tab && tab.id === 'linter'){
        scheduleGrammarCheck({immediate:true});
      }
      applySidePanelFullscreen(panel);
      renderSidePanel();
      var body = byId('aqSidePanelBody');
      if(body){
        try{ body.scrollTop = 0; }catch(_error){}
      }
    }

    function renderSidePanel(){
      var body = byId('aqSidePanelBody');
      if(!body) return;
      if(state.activePanelTab === 'outline'){ renderOutline(body); return; }
      if(state.activePanelTab === 'linter'){ renderLinter(body); return; }
      if(state.activePanelTab === 'citegraph'){ renderCitationGraph(body); return; }
      if(state.activePanelTab === 'suggest'){ renderSuggestions(body); return; }
      if(state.activePanelTab === 'pdfnotes'){ renderPdfDigest(body); return; }
      if(state.activePanelTab === 'track'){ renderTrackChanges(body); return; }
      if(state.activePanelTab === 'history'){ renderHistory(body); return; }
      body.innerHTML = '<div class="aq-side-muted">Oneriler burada toplanacak: eksik DOI, olasi kaynak onerileri, PDFden cikarilan kanitlar ve yaziya baglanabilecek notlar.</div>';
    }

    function getEditorRoot(){
      return byId('apaed') || (doc() && doc().querySelector('.ProseMirror'));
    }

    function collectOutlineItems(){
      var w = win();
      if(w && w.AQDocumentOutline && typeof w.AQDocumentOutline.collectEntries === 'function'){
        try{
          return w.AQDocumentOutline.collectEntries({root:getEditorRoot(), document:doc()}).map(function(entry){
            return {
              id: entry.id,
              type: entry.type || 'heading',
              level: Number(entry.level || 1) || 1,
              text: entry.label || entry.title || 'Basliksiz',
              title: entry.title || '',
              index: entry.index
            };
          });
        }catch(_error){}
      }
      var rootEl = getEditorRoot();
      if(!rootEl) return [];
      return Array.prototype.slice.call(rootEl.querySelectorAll('h1,h2,h3,h4,h5,[data-heading-level]')).map(function(el, index){
        var tagLevel = /^H([1-5])$/i.test(el.tagName || '') ? Number(RegExp.$1) : 1;
        var attrLevel = Number(el.getAttribute('data-heading-level') || el.getAttribute('level') || tagLevel);
        return {el:el, index:index, type:'heading', level:Math.max(1, Math.min(5, attrLevel || tagLevel)), text:(el.textContent || '').trim() || 'Basliksiz'};
      }).filter(function(item){ return item.text; });
    }

    function renderOutline(body){
      var w = win();
      var outlineApi = w && w.AQDocumentOutline ? w.AQDocumentOutline : null;
      var allItems = collectOutlineItems();
      var summary = outlineApi && typeof outlineApi.buildSummary === 'function'
        ? outlineApi.buildSummary(allItems.map(function(item){ return {type:item.type, level:item.level, label:item.text, title:item.title}; }))
        : {total:allItems.length, headings:allItems.length, tables:0, figures:0};
      var items = allItems;
      if(outlineApi && typeof outlineApi.filterEntries === 'function'){
        items = outlineApi.filterEntries(allItems.map(function(item){
          return {id:item.id, type:item.type, level:item.level, label:item.text, title:item.title, index:item.index};
        }), {query:state.outlineQuery, type:state.outlineType}).map(function(entry){
          return {id:entry.id, type:entry.type, level:entry.level, text:entry.label, title:entry.title, index:entry.index};
        });
      }else{
        items = allItems.filter(function(item){
          if(state.outlineType !== 'all' && item.type !== state.outlineType) return false;
          if(!state.outlineQuery) return true;
          return normalizeText([item.text, item.title].join(' ')).indexOf(normalizeText(state.outlineQuery)) >= 0;
        });
      }
      body.innerHTML = '<div class="aq-side-controls">'
        + '<input class="aq-side-search" id="aqOutlineSearch" placeholder="Anahatta ara..." value="' + escapeHTML(state.outlineQuery) + '"/>'
        + '<select class="aq-side-select" id="aqOutlineType"><option value="all">Tumu</option><option value="heading">Baslik</option><option value="table">Tablo</option><option value="figure">Sekil</option></select>'
        + '</div><div class="aq-side-summary">'
        + '<span class="aq-side-chip">' + summary.total + ' oge</span>'
        + '<span class="aq-side-chip">' + summary.headings + ' baslik</span>'
        + '<span class="aq-side-chip">' + summary.tables + ' tablo</span>'
        + '<span class="aq-side-chip">' + summary.figures + ' sekil</span>'
        + '</div><div class="aq-outline-list" id="aqOutlineList"></div>';
      var search = byId('aqOutlineSearch');
      var type = byId('aqOutlineType');
      if(type) type.value = state.outlineType;
      if(search){
        search.addEventListener('input', function(event){
          state.outlineQuery = String(event && event.target ? event.target.value : '');
          renderOutline(body);
          var nextSearch = byId('aqOutlineSearch');
          if(nextSearch){
            nextSearch.focus();
            try{ nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length); }catch(_error){}
          }
        });
      }
      if(type){
        type.addEventListener('change', function(event){
          state.outlineType = String(event && event.target ? event.target.value : 'all') || 'all';
          renderOutline(body);
        });
      }
      var list = byId('aqOutlineList');
      if(!list) return;
      if(!items.length){
        list.innerHTML = '<div class="aq-side-muted">Bu filtreyle gorunur baslik, tablo veya sekil yok.</div>';
        return;
      }
      items.forEach(function(item){
        var btn = doc().createElement('button');
        btn.type = 'button';
        btn.className = 'aq-outline-item';
        btn.setAttribute('data-level', String(item.level || 1));
        btn.innerHTML = escapeHTML(item.text) + (item.title ? '<span class="aq-outline-meta">' + escapeHTML(item.title) + '</span>' : '');
        btn.addEventListener('click', function(){
          var scrolled = false;
          if(outlineApi && typeof outlineApi.scrollToEntry === 'function' && item.id){
            try{ scrolled = !!outlineApi.scrollToEntry({root:getEditorRoot(), document:doc(), id:item.id}); }catch(_e){}
          }
          if(!scrolled && item.el){
            try{ item.el.scrollIntoView({behavior:'smooth', block:'center'}); scrolled = true; }catch(_e){}
          }
          if(!scrolled){
            // Last-resort: search by id on the document, then by heading text inside editor root.
            var rootEl = getEditorRoot();
            var target = null;
            if(item.id){
              try{ target = doc().getElementById(item.id); }catch(_e){}
            }
            if(!target && rootEl && item.text){
              var hs = rootEl.querySelectorAll('h1,h2,h3,h4,h5');
              var needle = String(item.text).trim().toLowerCase();
              for(var i=0;i<hs.length;i++){
                if((hs[i].textContent||'').trim().toLowerCase() === needle){ target = hs[i]; break; }
              }
            }
            if(target){
              try{ target.scrollIntoView({behavior:'smooth', block:'center'}); }catch(_e){}
              try{
                target.classList.add('aq-outline-target-flash');
                setTimeout(function(){ try{ target.classList.remove('aq-outline-target-flash'); }catch(_e){} }, 1500);
              }catch(_e){}
            }
          }
        });
        list.appendChild(btn);
      });
    }

    function collectCurrentRefs(){
      var w = win();
      if(!w) return [];
      var refs = [];
      if(typeof w.cLib === 'function'){
        try{ refs = w.cLib() || []; }catch(_error){}
      }else if(w.S && Array.isArray(w.S.wss)){
        var ws = w.S.wss.find(function(item){ return item && item.id === w.S.cur; });
        refs = (ws && ws.lib) || [];
      }
      if(typeof w.getBibliographyPageRefs === 'function'){
        try{
          refs = w.getBibliographyPageRefs(refs) || refs;
        }catch(_error){}
      }
      return Array.isArray(refs) ? refs : [];
    }

    function collectCitationGraphRefs(){
      return collectCurrentRefs();
    }

    function collectCitationIds(){
      var rootEl = getEditorRoot();
      if(!rootEl || typeof rootEl.querySelectorAll !== 'function') return [];
      var ids = [];
      Array.prototype.forEach.call(rootEl.querySelectorAll('.cit,[data-citation-id],[data-ref-id],[data-ref]'), function(node){
        ['data-ref', 'data-ref-id', 'data-citation-id'].forEach(function(attr){
          var raw = node && node.getAttribute ? String(node.getAttribute(attr) || '') : '';
          raw.split(',').forEach(function(part){
            var id = String(part || '').trim();
            if(id) ids.push(id);
          });
        });
      });
      return uniqueStrings(ids);
    }

    function collectPdfAnnotationItems(){
      var w = win();
      if(w && typeof w.getPdfAnnotationItems === 'function'){
        try{ return w.getPdfAnnotationItems() || []; }catch(_error){}
      }
      var d = doc();
      var items = [];
      var annotationApi = w && w.AQAnnotationState;
      if(d && annotationApi && typeof annotationApi.collectAnnotationsFromElements === 'function'){
        try{
          annotationApi.collectAnnotationsFromElements(d.querySelectorAll('.pdf-annot')).forEach(function(item, index){
            items.push({kind:'note', id:item.id || ('note_' + index), page:item.page, index:index, text:item.text});
          });
        }catch(_error){}
      }
      return items;
    }

    function getPdfDigestCitation(){
      var w = win();
      try{
        if(w && w.curRef && typeof w.shortRef === 'function') return w.shortRef(w.curRef) || '';
      }catch(_error){}
      return '';
    }

    function getBibliographyText(){
      var bib = byId('bibbody');
      return bib ? String(bib.innerText || bib.textContent || '').trim() : '';
    }

  function getEditorReadableText(){
    var rootEl = getEditorRoot();
    if(!rootEl) return '';
    var text = String(rootEl.innerText || rootEl.textContent || '').trim();
    var lines = text.split(/\r?\n+/);
    var bibliographyHeadingIndex = lines.findIndex(function(line){
      return /^(kaynakca|references|bibliography)\s*:?$/i.test(String(line || '').trim());
    });
    if(bibliographyHeadingIndex >= 0){
      text = lines.slice(0, bibliographyHeadingIndex).join('\n').trim();
    }
    var bibliography = getBibliographyText();
    // References can be intentionally long and DOI-heavy; excluding them keeps
    // the readability signal focused on the user's prose, not the source list.
      if(bibliography && text.indexOf(bibliography) >= 0){
        text = text.replace(bibliography, ' ');
      }
    return text.replace(/\s+/g, ' ').trim();
  }

  function collectCitationCoverageSummary(){
    var rootEl = getEditorRoot();
    if(!rootEl || typeof rootEl.querySelectorAll !== 'function'){
      return buildCitationCoverageSummary([]);
    }
    var rows = [];
    var paragraphNodes = rootEl.querySelectorAll('p');
    Array.prototype.forEach.call(paragraphNodes, function(node){
      if(!node) return;
      if(node.classList && node.classList.contains('refe')) return;
      if(node.closest && node.closest('#bibbody,.aq-bibliography,[data-aq-bibliography]')) return;
      var text = String(node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
      if(!text) return;
      var words = (text.match(/[^\s]+/g) || []).length;
      var sentences = (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []).length;
      var hasCitation = !!(node.querySelector && node.querySelector('.cit,[data-citation-id],[data-ref-id],[data-ref]'));
      rows.push({
        wordCount: words,
        sentenceCount: sentences,
        hasCitation: hasCitation
      });
    });
    return buildCitationCoverageSummary(rows);
  }

    function getBibliographyEntryCount(){
      var bib = byId('bibbody');
      if(!bib || typeof bib.querySelectorAll !== 'function') return 0;
      return bib.querySelectorAll('.refe,p[data-ref-id],li[data-ref-id]').length;
    }

    function getCurrentDocRecordSafe(){
      var w = win();
      if(!w) return null;
      if(typeof w.getCurrentDocRecord === 'function'){
        try{ return w.getCurrentDocRecord() || null; }catch(_error){}
      }
      if(w.S && Array.isArray(w.S.docs)){
        return w.S.docs.find(function(doc){ return doc && doc.id === w.S.curDoc; }) || null;
      }
      return null;
    }

    function getElectronAPI(){
      var w = win();
      return w && w.electronAPI ? w.electronAPI : null;
    }

    function getLineSpacingValue(){
      var rootEl = getEditorRoot();
      var w = win();
      if(!rootEl || !w || !w.getComputedStyle) return 0;
      var computed = w.getComputedStyle(rootEl);
      var cssVar = computed.getPropertyValue('--aq-line-spacing');
      var parsed = Number(cssVar || 0);
      if(parsed) return parsed;
      var lineHeight = parseFloat(computed.lineHeight || '0');
      var fontSize = parseFloat(computed.fontSize || '0');
      return lineHeight && fontSize ? (lineHeight / fontSize) : 0;
    }

  function collectQualityReport(){
      var stats = collectStatusStats();
      var w = win();
      var currentDoc = getCurrentDocRecordSafe();
    var docId = currentDoc && currentDoc.id ? String(currentDoc.id) : '';
      var report = buildQualityReport({
      refs: collectCurrentRefs(),
      citationIds: collectCitationIds(),
      citationCount: stats.citations,
        bibliographyText: getBibliographyText(),
        bibliographyEntryCount: getBibliographyEntryCount(),
        bibliographyManual: !!(currentDoc && currentDoc.bibliographyManual),
        lineSpacing: getLineSpacingValue(),
        readability: computeReadabilityReport(getEditorReadableText()),
        citationCoverage: collectCitationCoverageSummary(),
        outlineSummary: collectOutlineSummary(),
      grammar: getGrammarStateSnapshot(),
      wordCount: stats.words,
      healthApi: w ? w.AQMetadataHealth : null
    });
    if(Array.isArray(report.issues) && report.issues.length){
      report.issues = report.issues.map(function(issue){
        var item = issue && typeof issue === 'object' ? issue : {};
        var code = String(item.code || '').trim();
        if(item.ignoreCode || !code) return item;
        var next = {};
        Object.keys(item).forEach(function(key){ next[key] = item[key]; });
        next.ignoreCode = buildIgnoredIssueToken(code, docId);
        return next;
      });
    }
    return applyIgnoredIssues(report, state.ignoredIssueCodes, {docId:docId});
  }

    function collectCitationStyleInfo(){
      var styles = getSupportedCitationStyles();
      var id = getCurrentCitationStyleSafe();
      return {
        id: id,
        label: resolveCitationStyleLabel(id, styles)
      };
    }

    function runPreflight(options){
      options = options || {};
      var report = collectQualityReport();
      if(options.openPanel) openSidePanel('linter');
      if(options.interactive){
        var risk = getExportRiskLevel(report);
        if(risk !== 'clean'){
          var w = win();
          if(w && typeof w.confirm === 'function'){
            return w.confirm(formatPreflightMessage(report, options.target || 'export')) ? report : false;
          }
        }
      }
      return report;
    }

    function installExportPreflightGuard(){
      var w = win();
      if(!w || w.__aqLeanExportPreflightBound) return;
      var wrap = function(name, target){
        var original = w[name];
        if(typeof original !== 'function' || original.__aqLeanPreflightWrapped) return false;
        var wrapped = function(){
          var report = runPreflight({interactive:true, target:target});
          if(report === false) return false;
          return original.apply(this, arguments);
        };
        wrapped.__aqLeanPreflightWrapped = true;
        wrapped.__aqLeanOriginal = original;
        w[name] = wrapped;
        return true;
      };
      var didWrap = wrap('expPDF', 'pdf') || wrap('expDOC', 'docx');
      if(didWrap) w.__aqLeanExportPreflightBound = true;
    }

    function renderLinter(body){
      var stats = collectStatusStats();
      var report = collectQualityReport();
      var status = report.errors ? 'Riskli' : (report.warnings ? 'Kontrol gerekli' : 'Temiz');
      var issueViews = buildLinterIssueViewModel(report);
      var readability = report.readability || computeReadabilityReport('');
      var grammar = report.grammar || {status:'idle', issueCount:0, issues:[], error:''};
      var readabilityLabel = readability.sentences
        ? readability.label + ' - ort. ' + readability.avgWordsPerSentence + ' kelime/cumle'
        : readability.label;
      var grammarLabel = 'Dil kontrolu devre disi';
      var grammarDetailHtml = '<div class="aq-side-muted">Dil kontrolu uygulamadan kaldirildi. Grammarly veya benzeri harici araclari kullanabilirsin.</div>';
      body.innerHTML = '<div class="aq-side-summary"><span class="aq-side-chip">' + escapeHTML(status) + '</span><span class="aq-side-chip">' + report.errors + ' hata</span><span class="aq-side-chip">' + report.warnings + ' uyari</span>'
        + '<span class="aq-side-chip">' + escapeHTML(readabilityLabel) + '</span>'
        + '<span class="aq-side-chip">' + escapeHTML(grammarLabel) + '</span>'
        + (report.ignoredCount ? '<button class="aq-issue-ignore" type="button" data-aq-linter-reset-doc-ignores="1">bu belgede yoksayilanlari sifirla</button><button class="aq-issue-ignore" type="button" data-aq-linter-reset-ignores="1">' + report.ignoredCount + ' yoksayilan - tumunu sifirla</button>' : '') + '</div>'
        + '<p><b>Kelime:</b> ' + stats.words + '</p>'
        + '<p><b>Atif:</b> ' + stats.citations + '</p>'
        + '<p><b>Kaynak:</b> ' + stats.references + '</p>'
        + '<p><b>Sayfa:</b> ' + stats.pages + '</p>'
        + '<p><b>Okunabilirlik:</b> ' + escapeHTML(readabilityLabel) + '</p>'
        + '<p><b>Dil/Yazim:</b> ' + escapeHTML(grammarLabel) + '</p>'
        + grammarDetailHtml
        + '<div class="aq-issue-list">' + issueViews.map(function(issue){
          return '<div class="aq-issue ' + escapeHTML(issue.severity) + '">'
            + '<div class="aq-issue-title">' + escapeHTML(issue.title) + '</div>'
            + '<div class="aq-issue-body">' + escapeHTML(issue.message) + '</div>'
            + (issue.code && issue.code !== 'clean' ? '<div class="aq-issue-actions">'
              + (issue.action ? '<button class="aq-issue-action" type="button" data-aq-linter-action="' + escapeHTML(issue.action) + '">' + escapeHTML(issue.actionLabel || 'Ac') + '</button>' : '')
              + '<button class="aq-issue-ignore" type="button" data-aq-linter-ignore="' + escapeHTML(issue.ignoreCode || issue.code) + '">Yoksay</button></div>' : '')
            + '</div>';
        }).join('') + '</div>';
      body.querySelectorAll('[data-aq-linter-action]').forEach(function(btn){
        btn.addEventListener('click', function(){
          runLinterAction(btn.getAttribute('data-aq-linter-action') || '');
        });
      });
      body.querySelectorAll('[data-aq-linter-ignore]').forEach(function(btn){
        btn.addEventListener('click', function(){
          ignoreLinterIssue(btn.getAttribute('data-aq-linter-ignore') || '');
        });
      });
      body.querySelectorAll('[data-aq-linter-reset-ignores]').forEach(function(btn){
        btn.addEventListener('click', resetIgnoredLinterIssues);
      });
      body.querySelectorAll('[data-aq-linter-reset-doc-ignores]').forEach(function(btn){
        btn.addEventListener('click', resetIgnoredLinterIssuesForCurrentDoc);
      });
    }

    function runLinterAction(action){
      runSuggestionAction(action);
    }

    function renderCitationGraph(body){
      var stats = collectStatusStats();
      var graph = buildCitationGraphModel({
        refs: collectCitationGraphRefs(),
        citationIds: collectCitationIds()
      });
      var svgModel = buildCitationGraphSvgModel({
        graph: graph,
        centerLabel: 'Belge'
      });
      var hiddenParts = [];
      if(svgModel.hidden.cited > 0) hiddenParts.push('+' + svgModel.hidden.cited + ' bagli');
      if(svgModel.hidden.missing > 0) hiddenParts.push('+' + svgModel.hidden.missing + ' eksik');
      if(svgModel.hidden.uncited > 0) hiddenParts.push('+' + svgModel.hidden.uncited + ' kullanilmayan');
      body.innerHTML = '<div class="aq-side-muted">Metindeki atiflar ile aktif workspace library baglantisi.</div>'
        + '<div class="aq-cite-svg-wrap">' + renderCitationGraphSvg(svgModel) + '</div>'
        + (hiddenParts.length ? '<div class="aq-side-muted">' + escapeHTML(hiddenParts.join(' · ')) + '</div>' : '')
        + '<div class="aq-side-summary">'
        + '<span class="aq-side-chip">' + stats.citations + ' atif span</span>'
        + '<span class="aq-side-chip">' + graph.citedCount + ' bagli</span>'
        + '<span class="aq-side-chip">' + graph.uncitedCount + ' kullanilmayan</span>'
        + '<span class="aq-side-chip">' + graph.missingCount + ' eksik</span>'
        + '</div>'
        + renderGraphSection('Bagli kaynaklar', graph.citedRefs.map(function(ref){ return {kind:'ok', text:getReferenceLabel(ref)}; }), 'Metinde henuz bagli atif yok.')
        + renderGraphSection('Eksik baglantilar', graph.missingRefIds.map(function(id){ return {kind:'error', text:'Kaynak kaydi bulunamadi: ' + id}; }), 'Eksik atif baglantisi yok.')
        + renderGraphSection('Libraryde olup metinde kullanilmayanlar', graph.uncitedRefs.slice(0, 20).map(function(ref){ return {kind:'warn', text:getReferenceLabel(ref)}; }), graph.uncitedRefs.length > 20 ? '+ ' + (graph.uncitedRefs.length - 20) + ' kaynak daha var.' : 'Kullanilmayan kaynak yok.');
    }

    function renderGraphSection(title, items, emptyText){
      var list = Array.isArray(items) ? items : [];
      return '<div class="aq-graph-section"><div class="aq-graph-section-title">' + escapeHTML(title) + '</div><div class="aq-graph-list">'
        + (list.length ? list.map(function(item){
          return '<div class="aq-graph-item ' + escapeHTML(item.kind || '') + '">' + escapeHTML(item.text || '') + '</div>';
        }).join('') : '<div class="aq-side-muted">' + escapeHTML(emptyText || 'Kayit yok.') + '</div>')
        + '</div></div>';
    }

    function collectOutlineSummary(){
      var w = win();
      var items = collectOutlineItems();
      if(w && w.AQDocumentOutline && typeof w.AQDocumentOutline.buildSummary === 'function'){
        try{
          return w.AQDocumentOutline.buildSummary(items.map(function(item){ return {type:item.type, level:item.level, label:item.text, title:item.title}; }));
        }catch(_error){}
      }
      return {total:items.length, headings:items.length, tables:0, figures:0};
    }

    function renderSuggestions(body){
      var report = collectQualityReport();
      var graph = buildCitationGraphModel({refs:collectCitationGraphRefs(), citationIds:collectCitationIds()});
      var stats = collectStatusStats();
      var suggestions = buildSuggestionModel({
        report: report,
        graph: graph,
        outlineSummary: collectOutlineSummary(),
        wordCount: stats.words,
        pdfDigest: buildPdfAnnotationDigestViewModel(collectPdfAnnotationItems(), win() && win().AQAnnotationState),
        track: collectTrackChangesPanelModel()
      });
      body.innerHTML = '<div class="aq-side-muted">Belge durumuna gore siradaki en mantikli aksiyonlar.</div>'
        + '<div class="aq-suggest-list">'
        + suggestions.map(function(item){
          return '<div class="aq-suggest-card ' + escapeHTML(item.severity || 'info') + '">'
            + '<div class="aq-suggest-title">' + escapeHTML(item.title) + '</div>'
            + '<div class="aq-suggest-body">' + escapeHTML(item.body) + '</div>'
            + (item.action ? '<button class="aq-suggest-action" type="button" data-aq-suggest-action="' + escapeHTML(item.action) + '">' + escapeHTML(item.actionLabel || 'Ac') + '</button>' : '')
            + '</div>';
        }).join('')
        + '</div>';
      body.querySelectorAll('[data-aq-suggest-action]').forEach(function(btn){
        btn.addEventListener('click', function(){
          runSuggestionAction(btn.getAttribute('data-aq-suggest-action') || '');
        });
      });
    }

    function collectTrackChangesPanelModel(){
      var w = win();
      var enabled = false;
      var summary = null;
      if(w){
        try{
          if(typeof w.isTrackChangesEnabled === 'function'){
            enabled = !!w.isTrackChangesEnabled();
          }else if(w.AQTipTapWordCommands && typeof w.AQTipTapWordCommands.isTrackChangesEnabled === 'function'){
            enabled = !!w.AQTipTapWordCommands.isTrackChangesEnabled();
          }
        }catch(_error){}
        try{
          if(typeof w.getTrackChangesSummaryRuntime === 'function'){
            summary = w.getTrackChangesSummaryRuntime() || null;
          }else if(w.AQTipTapWordCommands && typeof w.AQTipTapWordCommands.summarizeTrackChanges === 'function' && w.editor){
            summary = w.AQTipTapWordCommands.summarizeTrackChanges(w.editor) || null;
          }
        }catch(_error){}
      }
      return buildTrackChangesPanelModel({
        enabled: enabled,
        summary: summary
      });
    }

    function rerenderTrackPanelSoon(){
      var d = doc();
      if(!d) return;
      setTimeout(function(){
        if(state.activePanelTab !== 'track') return;
        var body = byId('aqSidePanelBody');
        if(body) renderTrackChanges(body);
      }, 0);
    }

    function runTrackAction(action){
      var w = win();
      if(!w) return;
      var result = null;
      if(action === 'toggle'){
        if(typeof w.toggleTrackChangesMode === 'function'){
          result = w.toggleTrackChangesMode();
        }else if(w.AQTipTapWordCommands && typeof w.AQTipTapWordCommands.setTrackChangesEnabled === 'function'){
          result = w.AQTipTapWordCommands.setTrackChangesEnabled(null, { source:'lean-ui-shell' });
        }
      }else if(action === 'prev'){
        if(typeof w.focusPrevTrackedChange === 'function') result = w.focusPrevTrackedChange();
        else if(typeof w.ec === 'function') result = w.ec('focusPrevTrackChange');
      }else if(action === 'next'){
        if(typeof w.focusNextTrackedChange === 'function') result = w.focusNextTrackedChange();
        else if(typeof w.ec === 'function') result = w.ec('focusNextTrackChange');
      }else if(action === 'acceptCurrent'){
        if(typeof w.acceptCurrentTrackedChange === 'function') result = w.acceptCurrentTrackedChange();
        else if(typeof w.ec === 'function') result = w.ec('acceptCurrentTrackChange');
      }else if(action === 'rejectCurrent'){
        if(typeof w.rejectCurrentTrackedChange === 'function') result = w.rejectCurrentTrackedChange();
        else if(typeof w.ec === 'function') result = w.ec('rejectCurrentTrackChange');
      }else if(action === 'acceptAll'){
        if(typeof w.acceptTrackedChanges === 'function') result = w.acceptTrackedChanges();
        else if(typeof w.ec === 'function') result = w.ec('acceptTrackChanges');
      }else if(action === 'rejectAll'){
        if(typeof w.rejectTrackedChanges === 'function') result = w.rejectTrackedChanges();
        else if(typeof w.ec === 'function') result = w.ec('rejectTrackChanges');
      }else if(action === 'refresh'){
        rerenderTrackPanelSoon();
        return;
      }
      if(result && typeof result.then === 'function'){
        result.finally(function(){
          rerenderTrackPanelSoon();
          updateStatusBar(true);
        });
        return;
      }
      rerenderTrackPanelSoon();
      updateStatusBar(true);
    }

    function renderTrackChanges(body){
      var model = collectTrackChangesPanelModel();
      body.innerHTML = '<div class="aq-side-muted">Inceleme modu acikken degisiklikler oneriler olarak saklanir. Bu panelden hizlica kabul/geri al yapabilirsin.</div>'
        + '<div class="aq-side-summary">'
        + '<span class="aq-side-chip">' + escapeHTML(model.statusLabel) + '</span>'
        + '<span class="aq-side-chip">' + escapeHTML(model.pendingLabel) + '</span>'
        + '<span class="aq-side-chip">' + model.insertCount + ' ekleme</span>'
        + '<span class="aq-side-chip">' + model.deleteCount + ' silme</span>'
        + '</div>'
        + '<div class="aq-history-actions">'
        + '<button class="aq-history-action" type="button" data-aq-track-action="toggle">' + (model.enabled ? 'Inceleme Modunu Kapat' : 'Inceleme Modunu Ac') + '</button>'
        + '<button class="aq-history-action" type="button" data-aq-track-action="prev"' + (model.hasChanges ? '' : ' disabled') + '>Onceki Oneri</button>'
        + '<button class="aq-history-action" type="button" data-aq-track-action="next"' + (model.hasChanges ? '' : ' disabled') + '>Sonraki Oneri</button>'
        + '</div>'
        + '<div class="aq-history-actions">'
        + '<button class="aq-history-action" type="button" data-aq-track-action="acceptCurrent"' + (model.hasChanges ? '' : ' disabled') + '>Seciliyi Kabul Et</button>'
        + '<button class="aq-history-action" type="button" data-aq-track-action="rejectCurrent"' + (model.hasChanges ? '' : ' disabled') + '>Seciliyi Geri Al</button>'
        + '</div>'
        + '<div class="aq-history-actions">'
        + '<button class="aq-history-action" type="button" data-aq-track-action="acceptAll"' + (model.hasChanges ? '' : ' disabled') + '>Tumunu Kabul Et</button>'
        + '<button class="aq-history-action" type="button" data-aq-track-action="rejectAll"' + (model.hasChanges ? '' : ' disabled') + '>Tumunu Geri Al</button>'
        + '<button class="aq-history-action" type="button" data-aq-track-action="refresh">Yenile</button>'
        + '</div>';
      body.querySelectorAll('[data-aq-track-action]').forEach(function(btn){
        btn.addEventListener('click', function(){
          runTrackAction(btn.getAttribute('data-aq-track-action') || '');
        });
      });
    }

    function renderPdfDigest(body){
      var w = win();
      var annotationItems = collectPdfAnnotationItems();
      var model = buildPdfAnnotationDigestViewModel(
        annotationItems,
        w && w.AQAnnotationState,
        {title:'PDF Not Ozeti', citation:getPdfDigestCitation()}
      );
      var searchModel = buildPdfAnnotationSearchModel(annotationItems, w && w.AQAnnotationState, {
        query: state.pdfAnnotationQuery,
        filter: state.pdfAnnotationFilter
      });
      body.innerHTML = '<div class="aq-side-muted">Aktif PDF highlight ve notlarini tek bir okunabilir digest olarak toplar.</div>'
        + '<div class="aq-side-summary">'
        + '<span class="aq-side-chip">' + model.count + ' kayit</span>'
        + '<span class="aq-side-chip">' + model.highlightCount + ' highlight</span>'
        + '<span class="aq-side-chip">' + model.noteCount + ' not</span>'
        + '</div>'
        + '<div class="aq-side-filterbar">'
        + '<input class="aq-side-search" id="aqPdfAnnotationSearch" placeholder="PDF notlarinda ara..." value="' + escapeHTML(searchModel.query) + '"/>'
        + '<select class="aq-side-select" id="aqPdfAnnotationFilter"><option value="all">Tumu</option><option value="highlight">Highlight</option><option value="note">Not</option></select>'
        + '</div>'
        + '<div class="aq-side-summary">'
        + '<span class="aq-side-chip">' + searchModel.count + '/' + searchModel.total + ' eslesme</span>'
        + '<span class="aq-side-chip">' + searchModel.highlightCount + ' highlight</span>'
        + '<span class="aq-side-chip">' + searchModel.noteCount + ' not</span>'
        + '</div>'
        + '<div class="aq-pdf-annotation-list" id="aqPdfAnnotationList"></div>'
        + '<div class="aq-pdf-digest-actions">'
        + '<button class="aq-pdf-digest-action" type="button" data-aq-pdf-digest-action="openPanel">PDF Not Paneli</button>'
        + '<button class="aq-pdf-digest-action" type="button" data-aq-pdf-digest-action="copy">Ozeti Kopyala</button>'
        + '<button class="aq-pdf-digest-action primary" type="button" data-aq-pdf-digest-action="insert">Belgeye Ekle</button>'
        + '</div>'
        + '<div class="aq-pdf-digest-preview">' + escapeHTML(model.hasItems ? model.markdown : 'Aktif PDF icin henuz highlight veya not yok.') + '</div>';
      var search = byId('aqPdfAnnotationSearch');
      var filter = byId('aqPdfAnnotationFilter');
      if(filter) filter.value = searchModel.filter;
      if(search){
        search.addEventListener('input', function(event){
          state.pdfAnnotationQuery = String(event && event.target ? event.target.value : '');
          renderPdfDigest(body);
          var nextSearch = byId('aqPdfAnnotationSearch');
          if(nextSearch){
            nextSearch.focus();
            try{ nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length); }catch(_error){}
          }
        });
      }
      if(filter){
        filter.addEventListener('change', function(event){
          state.pdfAnnotationFilter = String(event && event.target ? event.target.value : 'all') || 'all';
          renderPdfDigest(body);
        });
      }
      var list = byId('aqPdfAnnotationList');
      if(list){
        if(!searchModel.items.length){
          list.innerHTML = '<div class="aq-side-empty">' + (searchModel.total ? 'Bu aramada PDF notu bulunamadi.' : 'Aktif PDF icin aranabilir not veya highlight yok.') + '</div>';
        }else{
          searchModel.items.slice(0, 80).forEach(function(item){
            var card = doc().createElement('div');
            card.className = 'aq-pdf-annotation-card ' + (item.kind === 'note' ? 'note' : 'highlight');
            card.innerHTML = '<div class="aq-pdf-annotation-meta"><span>' + (item.kind === 'note' ? 'Not' : 'Highlight') + '</span><span>s. ' + escapeHTML(item.page) + '</span></div>'
              + '<div class="aq-pdf-annotation-text">' + escapeHTML(item.preview || item.text || '') + '</div>';
            list.appendChild(card);
          });
        }
      }
      body.querySelectorAll('[data-aq-pdf-digest-action]').forEach(function(btn){
        btn.addEventListener('click', function(){
          runPdfDigestAction(btn.getAttribute('data-aq-pdf-digest-action') || '');
        });
      });
    }

    function runPdfDigestAction(action){
      var w = win();
      if(action === 'openPanel'){
        var d = doc();
        try{
          var pdfPanel = d && d.getElementById ? d.getElementById('pdfpanel') : null;
          if(pdfPanel && !pdfPanel.classList.contains('open')) pdfPanel.classList.add('open');
          var annots = d && d.getElementById ? d.getElementById('pdfannots') : null;
          if(annots){
            var cs = w && w.getComputedStyle ? w.getComputedStyle(annots) : null;
            var hidden = (annots.style.display === 'none') || (cs && cs.display === 'none');
            if(hidden){
              if(w && typeof w.togglePdfAnnotations === 'function') w.togglePdfAnnotations();
              else clickIfExists('pdfAnnotsToggleBtn');
            }
          }else{
            if(w && typeof w.togglePdfAnnotations === 'function') w.togglePdfAnnotations();
            else clickIfExists('pdfAnnotsToggleBtn');
          }
        }catch(_e){
          if(w && typeof w.togglePdfAnnotations === 'function') w.togglePdfAnnotations();
        }
        return;
      }
      if(action === 'copy'){
        if(w && typeof w.copyPdfAnnotationDigest === 'function') w.copyPdfAnnotationDigest();
        return;
      }
      if(action === 'insert'){
        if(w && typeof w.insertPdfAnnotationDigestIntoDocument === 'function') w.insertPdfAnnotationDigestIntoDocument();
      }
    }

    function runSuggestionAction(action){
      if(action === 'refreshBibliography'){
        if(!clickIfExists('bibliographyRefreshBtn')) clickIfExists('refreshBibliographyBtn');
        return;
      }
      if(action === 'resetBibliography'){
        if(!clickIfExists('resetBibliographyBtn')) clickIfExists('bibliographyMenuBtn');
        return;
      }
      if(action === 'metadataHealth'){
        clickIfExists('btnMetadataHealth');
        return;
      }
      if(action === 'openCitationGraph'){
        openSidePanel('citegraph');
        var citeBody = byId('aqSidePanelBody');
        if(citeBody){
          try{ citeBody.scrollTop = 0; }catch(_error){}
        }
        return;
      }
      if(action === 'openLinter'){
        openSidePanel('linter');
        return;
      }
      if(action === 'openOutline'){
        openSidePanel('outline');
        return;
      }
      if(action === 'openPdfDigest'){
        openSidePanel('pdfnotes');
        return;
      }
      if(action === 'openTrackReview'){
        openSidePanel('track');
        return;
      }
      if(action === 'refreshGrammar'){
        if(state.activePanelTab !== 'linter') openSidePanel('linter');
        return;
      }
    }

    function renderHistory(body){
      var saveText = getSaveStatusText();
      var currentDoc = getCurrentDocRecordSafe();
      var docId = currentDoc && currentDoc.id ? String(currentDoc.id) : '';
      var docName = currentDoc && currentDoc.name ? String(currentDoc.name) : 'Belge';
      var api = getElectronAPI();
      var token = ++state.historyToken;
      body.innerHTML = '<div class="aq-side-muted">Autosave, recovery ve belge snapshot durumu yukleniyor...</div>';
      if(!api){
        renderHistoryModel(body, buildHistoryPanelModel({
          saveStatus: saveText,
          docId: docId,
          docName: docName,
          history: {docId:docId, docName:docName, snapshots:[]}
        }));
        return;
      }
      var appInfoPromise = typeof api.getAppInfo === 'function'
        ? api.getAppInfo().catch(function(){ return null; })
        : Promise.resolve(null);
      var historyPromise = typeof api.getDocumentHistory === 'function'
        ? api.getDocumentHistory(docId, 6).catch(function(){ return {docId:docId, docName:docName, snapshots:[]}; })
        : Promise.resolve({docId:docId, docName:docName, snapshots:[]});
      Promise.all([appInfoPromise, historyPromise]).then(function(results){
        if(token !== state.historyToken || state.activePanelTab !== 'history') return;
        renderHistoryModel(body, buildHistoryPanelModel({
          appInfo: results[0],
          history: results[1],
          saveStatus: saveText,
          docId: docId,
          docName: docName
        }));
      });
    }

    function renderHistoryModel(body, model){
      model = model || buildHistoryPanelModel({});
      var snapshotRows = (model.snapshots || []).slice(0, 4).map(function(snapshot){
        var when = formatShortDateTime(snapshot && snapshot.createdAt);
        var words = Number(snapshot && snapshot.wordCount || 0);
        return '<div class="aq-history-card">'
          + '<div class="aq-history-title">' + escapeHTML(when || 'Snapshot') + (words ? ' · ' + words + ' kelime' : '') + '</div>'
          + '<div class="aq-history-body">' + escapeHTML(snapshot && snapshot.excerpt || 'Onizleme yok') + '</div>'
          + '</div>';
      }).join('');
      body.innerHTML = '<div class="aq-side-muted">Autosave ve recovery, capture queue sisteminden ayridir; bu panel sadece editor veri guvenligini gosterir.</div>'
        + '<div class="aq-side-summary">'
        + '<span class="aq-side-chip">' + escapeHTML(model.saveStatus || 'kaydedildi') + '</span>'
        + '<span class="aq-side-chip">' + escapeHTML(model.docName || 'Belge') + '</span>'
        + '<span class="aq-side-chip">' + (model.snapshots ? model.snapshots.length : 0) + ' snapshot</span>'
        + '</div>'
        + '<div class="aq-history-list">'
        + (model.cards || []).map(function(card){
          return '<div class="aq-history-card ' + escapeHTML(card.severity || '') + '"><div class="aq-history-title">' + escapeHTML(card.title) + '</div><div class="aq-history-body">' + escapeHTML(card.body) + '</div></div>';
        }).join('')
        + '</div>'
        + '<div class="aq-history-actions">'
        + '<button class="aq-history-action" type="button" data-aq-history-action="openHistory">Belge Gecmisini Ac</button>'
        + '<button class="aq-history-action" type="button" data-aq-history-action="refreshHistory">Yenile</button>'
        + '</div>'
        + (snapshotRows ? '<div class="aq-graph-section"><div class="aq-graph-section-title">Son snapshotlar</div><div class="aq-history-list">' + snapshotRows + '</div></div>' : '');
      body.querySelectorAll('[data-aq-history-action]').forEach(function(btn){
        btn.addEventListener('click', function(){
          runHistoryAction(btn.getAttribute('data-aq-history-action') || '');
        });
      });
    }

    function runHistoryAction(action){
      var w = win();
      if(action === 'openHistory'){
        if(w && typeof w.openDocumentHistory === 'function'){ w.openDocumentHistory(); return; }
        clickIfExists('docHistoryOpenBtn');
        return;
      }
      if(action === 'refreshHistory'){
        var body = byId('aqSidePanelBody');
        if(body) renderHistory(body);
      }
    }

    function collectStatusStats(){
      var rootEl = getEditorRoot();
      var text = rootEl ? (rootEl.innerText || rootEl.textContent || '') : '';
      var words = (text.trim().match(/\S+/g) || []).length;
      var citations = rootEl ? rootEl.querySelectorAll('.cit,[data-citation-id],[data-ref-id],[data-ref]').length : 0;
      var references = collectCurrentRefs().length || (byId('liblist') ? byId('liblist').querySelectorAll('.lcard,.ref-card,[data-ref-id]').length : 0);
      var d = doc();
      var pageNodes = d ? Array.prototype.slice.call(d.querySelectorAll('.aq-page-sheet')) : [];
      var fallbackPageCount = d
        ? Math.max(1, pageNodes.length || d.querySelectorAll('.page-number').length || 1)
        : 1;
      var pageStats = {currentPage:1, totalPages:fallbackPageCount};
      var scrollHost = byId('escroll');
      if(scrollHost && pageNodes.length && typeof scrollHost.getBoundingClientRect === 'function'){
        var hostRect = scrollHost.getBoundingClientRect();
        var pageRects = pageNodes.map(function(node){
          if(!node || typeof node.getBoundingClientRect !== 'function') return null;
          var rect = node.getBoundingClientRect();
          return {
            top: rect.top - hostRect.top + scrollHost.scrollTop,
            bottom: rect.bottom - hostRect.top + scrollHost.scrollTop
          };
        }).filter(Boolean);
        pageStats = computePageStats({
          scrollTop: scrollHost.scrollTop,
          viewportHeight: scrollHost.clientHeight,
          pageRects: pageRects,
          fallbackPageCount: fallbackPageCount
        });
      }else{
        pageStats = computePageStats({fallbackPageCount:fallbackPageCount});
      }
      return {
        words:words,
        citations:citations,
        references:references,
        pages:pageStats.totalPages,
        currentPage:pageStats.currentPage,
        totalPages:pageStats.totalPages
      };
    }

    function scrollToEditorPage(pageNumber){
      var target = clampPageNumber(pageNumber, collectStatusStats().totalPages);
      var scrollHost = byId('escroll');
      if(!scrollHost) return false;
      var pages = Array.prototype.slice.call(doc().querySelectorAll('.aq-page-sheet'));
      if(!pages.length) return false;
      var node = pages[target - 1] || pages[0];
      if(!node || typeof node.getBoundingClientRect !== 'function') return false;
      var hostRect = scrollHost.getBoundingClientRect();
      var nodeRect = node.getBoundingClientRect();
      var top = (nodeRect.top - hostRect.top) + scrollHost.scrollTop;
      scrollHost.scrollTo({
        top: Math.max(0, Math.round(top - 10)),
        behavior: 'smooth'
      });
      return true;
    }

    function openPageJump(){
      var w = win();
      if(!w || typeof w.prompt !== 'function') return false;
      var stats = collectStatusStats();
      var current = clampPageNumber(stats.currentPage, stats.totalPages);
      var input = w.prompt('Sayfaya git (1-' + stats.totalPages + ')', String(current));
      if(input == null) return false;
      var trimmed = String(input || '').trim();
      if(!trimmed) return false;
      var parsed = Number(trimmed);
      if(!Number.isFinite(parsed)){
        if(typeof w.alert === 'function') w.alert('Gecersiz sayfa numarasi.');
        return false;
      }
      return scrollToEditorPage(parsed);
    }

    function getSaveStatusText(){
      var sync = byId('synclbl');
      if(sync && sync.textContent && sync.textContent.trim()) return sync.textContent.trim();
      return 'kaydedildi';
    }

    function ensureStatusBar(){
      var sbar = byId('sbar');
      if(!sbar || byId('aqLeanStatus')) return;
      sbar.classList.add('aq-lean-status');
      Array.prototype.forEach.call(sbar.children, function(node){
        if(!node || node.id === 'aqLeanStatus') return;
        if(node.nodeType === 1){
          node.style.display = 'none';
        }
      });
      var wrap = doc().createElement('span');
      wrap.id = 'aqLeanStatus';
      wrap.style.display = 'inline-flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '6px';
      wrap.innerHTML = '<span class="aq-status-pill clickable" id="aqStatusPages">sf 1</span>'
        + '<span class="aq-status-pill clickable" id="aqStatusWords">0 kelime</span>'
        + '<span class="aq-status-pill clickable" id="aqStatusApa">APA ok</span>'
        + '<span class="aq-status-pill clickable" id="aqStatusWarnings">0 uyari</span>'
        + '<span class="aq-status-pill clickable" id="aqStatusSave"><span class="aq-status-dot"></span><span>kaydedildi</span></span>';
      sbar.appendChild(wrap);
      var apa = byId('aqStatusApa');
      var warn = byId('aqStatusWarnings');
      var pages = byId('aqStatusPages');
      var words = byId('aqStatusWords');
      var save = byId('aqStatusSave');
      if(apa) apa.addEventListener('click', function(){ openSidePanel('linter'); });
      if(warn) warn.addEventListener('click', function(){ openSidePanel('linter'); });
      if(pages) pages.addEventListener('click', function(){
        if(!openPageJump()) openSidePanel('outline');
      });
      if(words) words.addEventListener('click', function(){ openSidePanel('linter'); });
      if(save) save.addEventListener('click', function(){ openSidePanel('history'); });
    }

    function updateStatusBar(force){
      ensureStatusBar();
      scheduleGrammarCheck({immediate:!!force});
      // Cheap signature: changes in stats + save text are the only things that affect the UI.
      var stats = collectStatusStats();
      var saveText = getSaveStatusText();
      var styleInfo = collectCitationStyleInfo();
      var sig = stats.words + '|' + stats.citations + '|' + stats.references + '|' + stats.pages + '|' + saveText + '|' + styleInfo.id;
      if(!force && state.__aqLastStatusSig === sig) return;
      state.__aqLastStatusSig = sig;
      var pages = byId('aqStatusPages');
      var words = byId('aqStatusWords');
      var save = byId('aqStatusSave');
      var warnings = byId('aqStatusWarnings');
      var apa = byId('aqStatusApa');
      var report = warnings || apa ? collectQualityReport() : {};
      var model = buildStatusViewModel({stats:stats, report:report, saveStatus:saveText, styleLabel:styleInfo.label});
      if(pages) pages.textContent = model.pagesLabel;
      if(words) words.textContent = model.wordsLabel;
      setStatusTone(apa, model.apaTone, model.apaLabel);
      setStatusTone(warnings, model.warningsTone, model.warningsLabel);
      if(save){
        var label = save.querySelector('span:last-child');
        if(label) label.textContent = model.saveLabel;
        setStatusTone(save, model.saveTone);
      }
    }

    function setStatusTone(el, tone, text){
      if(!el) return;
      if(typeof text === 'string') el.textContent = text;
      ['ok','warning','error','saving'].forEach(function(name){ el.classList.remove(name); });
      el.classList.add(tone || 'ok');
    }

    function bindGlobalKeys(){
      var d = doc();
      if(!d || d.__aqLeanUiKeysBound) return;
      d.__aqLeanUiKeysBound = true;
      d.addEventListener('keydown', function(event){
        if(event.key === 'Escape'){
          if(state.panelFullscreen){
            event.preventDefault();
            setSidePanelFullscreen(false);
            return;
          }
          closeShortcutHelp();
        }
        if((event.ctrlKey || event.metaKey) && !event.shiftKey && String(event.key).toLowerCase() === 'k'){
          event.preventDefault();
          openPalette();
          return;
        }
        if((event.ctrlKey || event.metaKey) && !event.shiftKey && String(event.key).toLowerCase() === 'g'){
          if(isEditableTarget(event.target || null)) return;
          event.preventDefault();
          openPageJump();
          return;
        }
        if(shouldOpenShortcutHelp(event)){
          event.preventDefault();
          openShortcutHelp();
          return;
        }
        if(event.key === 'F9'){
          event.preventDefault();
          var panel = byId('aqSidePanel');
          if(panel && panel.classList.contains('open')) closeSidePanel();
          else openSidePanel(state.activePanelTab || 'outline');
        }
      }, true);
    }

    function init(){
      injectStyles();
      ensureDefaultCommands();
      loadRecentCommands();
      loadIgnoredIssueCodes();
      var d = doc();
      if(d && !d.__aqLeanRefsBound){
        d.__aqLeanRefsBound = true;
        d.addEventListener('aq:references-changed', function(){
          if(state.activePanelTab === 'citegraph' || state.activePanelTab === 'suggest' || state.activePanelTab === 'linter'){
            renderSidePanel();
          }
          updateStatusBar(true);
        });
      }
      ensurePalette();
      applyStoredPanelTab();
      ensureSidePanel();
      ensureStatusBar();
      bindGlobalKeys();
      updateStatusBar();
      installExportPreflightGuard();
      applyStoredPanelWidth(byId('aqSidePanel'));
      if(!state.statusTimer && typeof window !== 'undefined'){
        state.statusTimer = window.setInterval(function(){
          // Skip background work when the document is hidden; signature cache
          // keeps the foreground tick cheap when nothing has changed.
          if(typeof document !== 'undefined' && document.hidden) return;
          updateStatusBar();
          installExportPreflightGuard();
        }, 1500);
      }
      return api;
    }

    var api = {
      init:init,
      registerCommand:registerCommand,
      runCommand:runCommand,
      openPalette:openPalette,
      closePalette:closePalette,
      openShortcutHelp:openShortcutHelp,
      closeShortcutHelp:closeShortcutHelp,
      openSidePanel:openSidePanel,
      closeSidePanel:closeSidePanel,
      setSidePanelTab:setSidePanelTab,
      runPreflight:runPreflight,
      updateStatusBar:updateStatusBar,
      _state:state
    };
    return api;
  }

  var shell = createShell();

  if(typeof document !== 'undefined'){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ shell.init(); });
    else setTimeout(function(){ shell.init(); }, 0);
  }

  return {
    normalizeText: normalizeText,
    scoreCommand: scoreCommand,
    filterCommands: filterCommands,
    normalizeRecentCommandIds: normalizeRecentCommandIds,
    recordRecentCommandId: recordRecentCommandId,
    buildCommandPaletteItemModel: buildCommandPaletteItemModel,
    sanitizeReadabilityText: sanitizeReadabilityText,
    computeReadabilityReport: computeReadabilityReport,
    summarizeReferenceHealth: summarizeReferenceHealth,
    buildCitationCoverageSummary: buildCitationCoverageSummary,
    buildQualityReport: buildQualityReport,
    normalizeIgnoredIssueCodes: normalizeIgnoredIssueCodes,
    buildIgnoredIssueToken: buildIgnoredIssueToken,
    removeIgnoredIssueTokensForDoc: removeIgnoredIssueTokensForDoc,
    applyIgnoredIssues: applyIgnoredIssues,
    getIssueAction: getIssueAction,
    buildLinterIssueViewModel: buildLinterIssueViewModel,
    classifySaveStatus: classifySaveStatus,
    buildStatusViewModel: buildStatusViewModel,
    computePageStats: computePageStats,
    clampPageNumber: clampPageNumber,
    buildShortcutHelpModel: buildShortcutHelpModel,
    normalizeCitationStyleId: normalizeCitationStyleId,
    normalizeCitationStyleCatalog: normalizeCitationStyleCatalog,
    resolveCitationStyleLabel: resolveCitationStyleLabel,
    isEditableTarget: isEditableTarget,
    shouldOpenShortcutHelp: shouldOpenShortcutHelp,
    buildCitationConsistencyReport: buildCitationConsistencyReport,
    buildCitationGraphModel: buildCitationGraphModel,
    buildCitationGraphSvgModel: buildCitationGraphSvgModel,
    renderCitationGraphSvg: renderCitationGraphSvg,
    buildSuggestionModel: buildSuggestionModel,
    buildTrackChangesPanelModel: buildTrackChangesPanelModel,
    buildPdfAnnotationDigestViewModel: buildPdfAnnotationDigestViewModel,
    buildPdfAnnotationSearchModel: buildPdfAnnotationSearchModel,
    getReferenceLabel: getReferenceLabel,
    formatShortDateTime: formatShortDateTime,
    buildHistoryPanelModel: buildHistoryPanelModel,
    getExportRiskLevel: getExportRiskLevel,
    formatPreflightMessage: formatPreflightMessage,
    clampNumber: clampNumber,
    computeGrammarErrorCooldownMs: computeGrammarErrorCooldownMs,
    normalizePanelWidth: normalizePanelWidth,
    normalizePanelTab: normalizePanelTab,
    createShell: createShell,
    init: shell.init,
    registerCommand: shell.registerCommand,
    runCommand: shell.runCommand,
    openPalette: shell.openPalette,
    closePalette: shell.closePalette,
    openShortcutHelp: shell.openShortcutHelp,
    closeShortcutHelp: shell.closeShortcutHelp,
    openSidePanel: shell.openSidePanel,
    closeSidePanel: shell.closeSidePanel,
    setSidePanelTab: shell.setSidePanelTab,
    runPreflight: shell.runPreflight,
    updateStatusBar: shell.updateStatusBar
  };
});
