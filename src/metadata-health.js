(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQMetadataHealth = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  var pdfVerificationApi = null;
  try{
    if(typeof require === 'function'){
      pdfVerificationApi = require('./pdf-verification.js');
    }
  }catch(_e){}
  if(!pdfVerificationApi && typeof globalThis !== 'undefined' && globalThis.AQPDFVerification){
    pdfVerificationApi = globalThis.AQPDFVerification;
  }
  function normalizeDoi(value){
    var raw = String(value || '').trim();
    if(!raw) return '';
    try{ raw = decodeURIComponent(raw); }catch(_e){}
    raw = raw
      .replace(/^doi:\s*/i, '')
      .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, '')
      .replace(/[)\].,;:]+$/g, '');
    var match = raw.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
    var doi = (match && match[0]) ? match[0] : raw;
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
    var m = text.match(/\b(19|20)\d{2}\b/);
    return m ? m[0] : text;
  }

  function normalizeAuthorName(author){
    var text = String(author || '').replace(/\s+/g, ' ').trim();
    if(!text) return '';
    if(/^[A-ZÇĞİÖŞÜ\s,.'-]+$/.test(text)){
      text = text.toLowerCase().replace(/\b([a-zçğıöşü])/g, function(_, ch){ return ch.toUpperCase(); });
    }
    return text;
  }

  function normalizeAuthorsList(authors){
    var list = Array.isArray(authors) ? authors : [];
    var seen = {};
    return list
      .map(normalizeAuthorName)
      .filter(Boolean)
      .filter(function(name){
        var key = name.toLowerCase();
        if(seen[key]) return false;
        seen[key] = true;
        return true;
      });
  }

  function conservativeTitleCase(title){
    var raw = String(title || '').replace(/\s+/g, ' ').trim();
    if(!raw) return '';
    var letters = raw.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '');
    var isMostlyUpper = letters && letters === letters.toUpperCase();
    var isMostlyLower = letters && letters === letters.toLowerCase();
    if(!isMostlyUpper && !isMostlyLower) return raw;

    var lowered = raw.toLowerCase();
    return lowered.charAt(0).toUpperCase() + lowered.slice(1);
  }

  function normalizePageValue(value){
    return String(value || '').replace(/[–—]/g, '-').replace(/\s+/g, '').trim();
  }

  function isMalformedPageRange(ref){
    if(!ref || typeof ref !== 'object') return false;
    var fp = normalizePageValue(ref.fp);
    var lp = normalizePageValue(ref.lp);
    if(!fp && !lp) return false;
    if(fp && !/^[0-9]+$/.test(fp)) return true;
    if(lp && !/^[0-9]+$/.test(lp)) return true;
    if(fp && lp){
      var fpn = Number(fp);
      var lpn = Number(lp);
      if(!Number.isFinite(fpn) || !Number.isFinite(lpn)) return true;
      if(lpn < fpn) return true;
    }
    return false;
  }

  function addIssue(issues, code, severity, message){
    issues.push({
      code: code,
      severity: severity,
      message: message
    });
  }

  function analyzeReference(ref){
    ref = ref || {};
    var issues = [];

    var title = String(ref.title || '').trim();
    var authors = Array.isArray(ref.authors) ? ref.authors.filter(Boolean) : [];
    var year = normalizeYear(ref.year);
    var journal = String(ref.journal || ref.booktitle || '').trim();
    var rawDoi = String(ref.doi || '').trim();
    var normalizedDoi = normalizeDoi(rawDoi);

    if(!title) addIssue(issues, 'missing_title', 'error', 'Başlık eksik');
    if(!authors.length) addIssue(issues, 'missing_authors', 'error', 'Yazar bilgisi eksik');
    if(!year) addIssue(issues, 'missing_year', 'error', 'Yıl bilgisi eksik');
    if(!journal) addIssue(issues, 'missing_journal', 'warning', 'Dergi/Kaynak bilgisi eksik');
    if(rawDoi && !normalizedDoi) addIssue(issues, 'malformed_doi', 'warning', 'DOI biçimi şüpheli');
    if(isMalformedPageRange(ref)) addIssue(issues, 'malformed_pages', 'warning', 'Sayfa aralığı biçimi şüpheli');
    if(pdfVerificationApi && typeof pdfVerificationApi.getIssueForMetadataHealth === 'function'){
      try{
        var pdfIssue = pdfVerificationApi.getIssueForMetadataHealth(ref.pdfVerification || null);
        if(pdfIssue) addIssue(issues, pdfIssue.code, pdfIssue.severity, pdfIssue.message);
      }catch(_e){}
    }

    var hasErrors = issues.some(function(issue){ return issue.severity === 'error'; });
    var hasWarnings = issues.some(function(issue){ return issue.severity === 'warning'; });
    var status = 'complete';
    if(hasErrors) status = 'incomplete';
    else if(hasWarnings) status = 'suspicious';

    return {
      status: status,
      issues: issues
    };
  }

  function summarizeHealth(refs){
    var list = Array.isArray(refs) ? refs : [];
    var summary = {
      total: list.length,
      complete: 0,
      incomplete: 0,
      suspicious: 0,
      issueCounts: {}
    };
    list.forEach(function(ref){
      var report = analyzeReference(ref);
      summary[report.status] = (summary[report.status] || 0) + 1;
      report.issues.forEach(function(issue){
        summary.issueCounts[issue.code] = (summary.issueCounts[issue.code] || 0) + 1;
      });
    });
    return summary;
  }

  function applyConservativeRepairs(ref){
    var src = ref || {};
    var out = Object.assign({}, src);
    var changes = [];

    var normalizedAuthors = normalizeAuthorsList(src.authors || []);
    if(JSON.stringify(normalizedAuthors) !== JSON.stringify(src.authors || [])){
      out.authors = normalizedAuthors;
      changes.push('authors');
    }

    var normalizedTitle = conservativeTitleCase(src.title || '');
    if(normalizedTitle && normalizedTitle !== String(src.title || '')){
      out.title = normalizedTitle;
      changes.push('title');
    }

    var normalizedYear = normalizeYear(src.year || '');
    if(normalizedYear && normalizedYear !== String(src.year || '')){
      out.year = normalizedYear;
      changes.push('year');
    }

    var normalizedDoi = normalizeDoi(src.doi || src.url || '');
    if(normalizedDoi && normalizedDoi !== String(src.doi || '')){
      out.doi = normalizedDoi;
      changes.push('doi');
    }

    var fp = normalizePageValue(src.fp || '');
    var lp = normalizePageValue(src.lp || '');
    if(fp !== String(src.fp || '')){
      out.fp = fp;
      changes.push('fp');
    }
    if(lp !== String(src.lp || '')){
      out.lp = lp;
      changes.push('lp');
    }

    return {
      ref: out,
      changes: changes
    };
  }

  return {
    normalizeDoi: normalizeDoi,
    analyzeReference: analyzeReference,
    summarizeHealth: summarizeHealth,
    normalizeAuthorName: normalizeAuthorName,
    normalizeAuthorsList: normalizeAuthorsList,
    conservativeTitleCase: conservativeTitleCase,
    applyConservativeRepairs: applyConservativeRepairs
  };
});
