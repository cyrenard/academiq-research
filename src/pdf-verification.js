(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQPDFVerification = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function clamp(value, min, max){
    var num = Number(value);
    if(!Number.isFinite(num)) num = min;
    if(num < min) return min;
    if(num > max) return max;
    return num;
  }

  function normalizeStatus(value){
    var raw = String(value || '').trim().toLowerCase();
    if(raw === 'verified' || raw === 'high') return 'verified';
    if(raw === 'likely' || raw === 'medium') return 'likely';
    if(raw === 'suspicious' || raw === 'low') return 'suspicious';
    if(raw === 'manual') return 'manual';
    return '';
  }

  function uniqueStrings(list, maxLen){
    if(!Array.isArray(list)) return [];
    var seen = {};
    return list.map(function(item){
      return String(item == null ? '' : item).trim().slice(0, maxLen || 160);
    }).filter(Boolean).filter(function(item){
      var key = item.toLowerCase();
      if(seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function buildVerificationReport(input){
    var src = input && typeof input === 'object' ? input : {};
    var reasons = [];
    var warnings = [];
    var score = 0;
    var titleHits = clamp(src.titleTokenHits, 0, 12);
    var titleTotal = clamp(src.titleTokenTotal, 0, 12);
    var authorHits = clamp(src.authorTokenHits, 0, 6);
    var authorTotal = clamp(src.authorTokenTotal, 0, 6);
    var yearMatch = !!src.yearMatch;
    var doiInBody = !!src.doiInBody;
    var doiInUrl = !!src.doiInUrl;
    var expectedDoi = String(src.expectedDoi || '').trim();
    var expectedTitle = String(src.expectedTitle || '').trim();
    var differentDoiFound = !!src.differentDoiFound;
    var status = 'suspicious';

    if(differentDoiFound){
      warnings.push('PDF içinde farklı DOI bulundu');
      return normalizeStoredVerification({
        status: 'suspicious',
        score: 0,
        confidence: 'low',
        summary: 'PDF şüpheli: farklı DOI bulundu',
        reasons: reasons,
        warnings: warnings,
        expectedDoi: expectedDoi,
        finalUrl: src.finalUrl,
        sourceUrl: src.sourceUrl,
        matchedSignals: {
          doiInBody: doiInBody,
          doiInUrl: doiInUrl,
          titleTokenHits: titleHits,
          titleTokenTotal: titleTotal,
          authorTokenHits: authorHits,
          authorTokenTotal: authorTotal,
          yearMatch: yearMatch
        }
      });
    }

    if(doiInBody){
      score += 62;
      reasons.push('DOI PDF içinde doğrulandı');
    }else if(expectedDoi){
      warnings.push('PDF içinde DOI doğrulaması bulunamadı');
    }

    if(doiInUrl){
      score += 16;
      reasons.push('İndirme bağlantısı DOI ile uyumlu');
    }else if(expectedDoi){
      warnings.push('İndirme bağlantısı DOI sinyali taşımıyor');
    }

    if(titleTotal > 0){
      var titleRatio = titleHits / Math.max(titleTotal, 1);
      if(titleRatio >= 0.75 || titleHits >= 4){
        score += 18;
        reasons.push('Başlık güçlü eşleşti');
      }else if(titleRatio >= 0.45 || titleHits >= 2){
        score += 10;
        reasons.push('Başlık kısmen eşleşti');
      }else if(expectedTitle){
        warnings.push('Başlık eşleşmesi zayıf');
      }
    }

    if(authorTotal > 0){
      if(authorHits >= Math.min(2, authorTotal)){
        score += 8;
        reasons.push('Yazar sinyali eşleşti');
      }else{
        warnings.push('Yazar sinyali zayıf');
      }
    }

    if(yearMatch){
      score += 4;
      reasons.push('Yıl eşleşti');
    }

    score = clamp(score, 0, 100);

    if(expectedDoi){
      if(doiInBody || (doiInUrl && (titleHits >= 2 || authorHits >= 1 || yearMatch))){
        status = score >= 70 ? 'verified' : 'likely';
      }else if((titleHits >= 3 && authorHits >= 1) || (titleHits >= 2 && yearMatch)){
        status = 'likely';
      }else{
        status = 'suspicious';
      }
    }else if((titleHits >= 4 && (authorHits >= 1 || yearMatch)) || (titleHits >= 3 && authorHits >= 2)){
      status = score >= 52 ? 'verified' : 'likely';
    }else if(titleHits >= 2 && (authorHits >= 1 || yearMatch)){
      status = 'likely';
    }else{
      status = 'suspicious';
    }

    var summary = 'PDF doğrulanamadı';
    if(status === 'verified') summary = 'PDF yüksek güvenle doğrulandı';
    else if(status === 'likely') summary = 'PDF makul güvenle eşleşti';
    else if(expectedDoi || expectedTitle) summary = 'PDF eşleşmesi şüpheli';

    return normalizeStoredVerification({
      status: status,
      score: score,
      confidence: status === 'verified' ? 'high' : (status === 'likely' ? 'medium' : 'low'),
      summary: summary,
      reasons: reasons,
      warnings: warnings,
      expectedDoi: expectedDoi,
      finalUrl: src.finalUrl,
      sourceUrl: src.sourceUrl,
      matchedSignals: {
        doiInBody: doiInBody,
        doiInUrl: doiInUrl,
        titleTokenHits: titleHits,
        titleTokenTotal: titleTotal,
        authorTokenHits: authorHits,
        authorTokenTotal: authorTotal,
        yearMatch: yearMatch
      }
    });
  }

  function normalizeStoredVerification(input){
    var src = input && typeof input === 'object' ? input : {};
    var status = normalizeStatus(src.status) || 'manual';
    var score = clamp(src.score, 0, 100);
    var confidence = String(src.confidence || '').trim().toLowerCase();
    if(confidence !== 'high' && confidence !== 'medium' && confidence !== 'low'){
      confidence = status === 'verified' ? 'high' : (status === 'likely' ? 'medium' : 'low');
    }
    var out = {
      status: status,
      confidence: confidence,
      score: score,
      summary: String(src.summary || '').trim().slice(0, 220),
      reasons: uniqueStrings(src.reasons, 180),
      warnings: uniqueStrings(src.warnings, 180),
      expectedDoi: String(src.expectedDoi || '').trim().slice(0, 256),
      finalUrl: String(src.finalUrl || '').trim().slice(0, 4096),
      sourceUrl: String(src.sourceUrl || '').trim().slice(0, 4096),
      matchedSignals: {
        doiInBody: !!(src.matchedSignals && src.matchedSignals.doiInBody),
        doiInUrl: !!(src.matchedSignals && src.matchedSignals.doiInUrl),
        titleTokenHits: clamp(src.matchedSignals && src.matchedSignals.titleTokenHits, 0, 12),
        titleTokenTotal: clamp(src.matchedSignals && src.matchedSignals.titleTokenTotal, 0, 12),
        authorTokenHits: clamp(src.matchedSignals && src.matchedSignals.authorTokenHits, 0, 6),
        authorTokenTotal: clamp(src.matchedSignals && src.matchedSignals.authorTokenTotal, 0, 6),
        yearMatch: !!(src.matchedSignals && src.matchedSignals.yearMatch)
      }
    };
    if(src.verifiedAt) out.verifiedAt = Number(src.verifiedAt) || Date.now();
    else out.verifiedAt = Date.now();
    return out;
  }

  function getBadgeMeta(input){
    var row = normalizeStoredVerification(input);
    if(row.status === 'verified'){
      return { label: 'PDF güvenli', className: 'pdfv-ok', title: row.summary || 'PDF yüksek güvenle eşleşti' };
    }
    if(row.status === 'likely'){
      return { label: 'PDF kontrol', className: 'pdfv-warn', title: row.summary || 'PDF kısmi sinyallerle eşleşti' };
    }
    if(row.status === 'suspicious'){
      return { label: 'PDF şüpheli', className: 'pdfv-bad', title: row.summary || 'PDF eşleşmesi şüpheli' };
    }
    return { label: 'PDF manuel', className: 'pdfv-manual', title: row.summary || 'PDF manuel eklendi, doğrulama yapılmadı' };
  }

  function getIssueForMetadataHealth(input){
    var row = normalizeStoredVerification(input);
    if(row.status === 'suspicious'){
      return {
        code: 'suspicious_pdf_match',
        severity: 'warning',
        message: row.summary || 'PDF eşleşmesi şüpheli'
      };
    }
    if(row.status === 'likely'){
      return {
        code: 'review_pdf_match',
        severity: 'warning',
        message: row.summary || 'PDF eşleşmesi gözden geçirilmeli'
      };
    }
    return null;
  }

  return {
    buildVerificationReport: buildVerificationReport,
    normalizeStoredVerification: normalizeStoredVerification,
    getBadgeMeta: getBadgeMeta,
    getIssueForMetadataHealth: getIssueForMetadataHealth
  };
});
