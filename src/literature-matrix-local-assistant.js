(function(root, factory){
  var api = factory(root || {});
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  if(root) root.AQLocalMatrixAssistant = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root){
  var COLUMN_KEYS = ['purpose', 'method', 'sample', 'findings', 'limitations'];

  function text(value){
    return String(value == null ? '' : value).trim();
  }

  function cloneArray(value){
    return Array.isArray(value) ? value.slice() : [];
  }

  function clamp01(value){
    var n = Number(value);
    if(!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  function normalizeSettings(value){
    var source = value && typeof value === 'object' ? value : {};
    return {
      enabled: source.enabled === true,
      provider: text(source.provider || 'rule-guard'),
      allowModelProvider: source.allowModelProvider === true,
      composeCells: source.composeCells === true,
      maxCandidatesPerColumn: Math.max(1, Math.min(8, Number(source.maxCandidatesPerColumn || 4))),
      maxSnippetChars: Math.max(240, Math.min(2000, Number(source.maxSnippetChars || 1200))),
      minConfidence: Number.isFinite(Number(source.minConfidence)) ? clamp01(source.minConfidence) : 0.5
    };
  }

  function normalizeCandidate(candidate){
    var source = candidate && typeof candidate === 'object' ? candidate : {};
    var columnKey = text(source.columnKey);
    if(COLUMN_KEYS.indexOf(columnKey) < 0) return null;
    var body = text(source.text || '');
    if(!body) return null;
    return {
      columnKey: columnKey,
      text: body,
      score: Number(source.score || 0),
      confidence: clamp01(source.confidence),
      source: source.source && typeof source.source === 'object' ? Object.assign({}, source.source) : {},
      reasons: cloneArray(source.reasons),
      assistant: source.assistant && typeof source.assistant === 'object' ? Object.assign({}, source.assistant) : null
    };
  }

  function sentenceLooksLikeCitation(value){
    var raw = text(value);
    if(!raw) return false;
    if(/https?:\/\/|doi\.org|10\.\d{4,9}\//i.test(raw)) return true;
    if(/^[A-ZÇĞİÖŞÜ][^.!?]{0,90}\(\d{4}\)/.test(raw)) return true;
    if(/^\w+,\s*[A-Z]\./.test(raw) && /\(\d{4}\)|\b\d{4}\b/.test(raw)) return true;
    return false;
  }

  function localReviewCandidate(candidate){
    var next = normalizeCandidate(candidate);
    if(!next) return null;
    var reasons = cloneArray(next.reasons);
    var delta = 0;
    var words = text(next.text).split(/\s+/).filter(Boolean).length;
    if(words >= 10 && words <= 55){
      delta += 0.03;
      reasons.push('assistant:length-ok');
    }
    if(sentenceLooksLikeCitation(next.text)){
      delta -= 0.18;
      reasons.push('assistant:reference-like-penalty');
    }
    if(next.columnKey === 'sample' && /\b(?:N|n)\s*=\s*\d+|\b\d+\b.*\b(participants|students|teachers|katılımcı|katilimci|öğrenci|ogrenci)\b/i.test(next.text)){
      delta += 0.08;
      reasons.push('assistant:sample-evidence');
    }
    if(next.columnKey === 'method' && /design|analysis|model|desen|analiz|yöntem|yontem/i.test(next.text)){
      delta += 0.05;
      reasons.push('assistant:method-signal');
    }
    if(next.columnKey === 'findings' && /significant|revealed|showed|bulgu|sonuç|sonuc|anlamlı|anlamli/i.test(next.text)){
      delta += 0.05;
      reasons.push('assistant:finding-signal');
    }
    if(next.columnKey === 'limitations' && /limitation|future research|sınırl|sinirl|gelecek araştır/i.test(next.text)){
      delta += 0.06;
      reasons.push('assistant:limitation-signal');
    }
    next.confidence = clamp01(next.confidence + delta);
    next.score = Number(next.score || 0) + Math.round(delta * 16);
    next.reasons = reasons.slice(0, 12);
    next.assistant = {
      provider: 'rule-guard',
      localOnly: true,
      reviewedAt: Date.now()
    };
    if(next.source && typeof next.source === 'object'){
      next.source.extractionType = text(next.source.extractionType || 'rule-section-sentence');
      next.source.confidence = next.confidence;
    }
    return next;
  }

  function providerRankCandidates(candidates, context, settings){
    if(!settings.allowModelProvider) return null;
    var provider = root && root.AQLocalMatrixModel;
    if(!provider || typeof provider.rankCandidates !== 'function') return null;
    try{
      var ranked = provider.rankCandidates(candidates, {
        mode: 'literature-matrix-only',
        localOnly: true,
        noWritingGeneration: true,
        reference: context && context.reference ? context.reference : null
      });
      return Array.isArray(ranked) ? ranked.map(normalizeCandidate).filter(Boolean) : null;
    }catch(error){
      try{ console.warn('[local-matrix-assistant]', error); }catch(_e){}
      return null;
    }
  }

  function providerComposeCells(candidates, context, settings){
    if(!settings.allowModelProvider) return null;
    var provider = root && root.AQLocalMatrixModel;
    if(!provider || typeof provider.composeCells !== 'function') return null;
    try{
      var composed = provider.composeCells(candidates, {
        mode: 'literature-matrix-only',
        localOnly: true,
        noManuscriptWriting: true,
        columns: COLUMN_KEYS.slice(),
        reference: context && context.reference ? context.reference : null
      });
      return Array.isArray(composed) ? composed.map(normalizeCandidate).filter(Boolean) : null;
    }catch(error){
      try{ console.warn('[local-matrix-assistant-compose]', error); }catch(_e){}
      return null;
    }
  }

  function cleanCellDraft(value, maxLen){
    var raw = text(value).replace(/\s+/g, ' ');
    raw = raw.replace(/^(abstract|özet|ozet|method|methods|findings|results|sample|participants)\s*[:.-]\s*/i, '');
    raw = raw.replace(/\s+([,.;:!?])/g, '$1');
    if(raw.length > maxLen){
      raw = raw.slice(0, maxLen);
      raw = raw.replace(/\s+\S*$/, '').trim();
    }
    return raw;
  }

  function composeColumnDraft(columnKey, columnCandidates, settings){
    var sorted = cloneArray(columnCandidates).sort(function(a, b){
      var confidenceDelta = Number(b.confidence || 0) - Number(a.confidence || 0);
      if(Math.abs(confidenceDelta) > 0.001) return confidenceDelta;
      return Number(b.score || 0) - Number(a.score || 0);
    });
    var primary = sorted[0];
    if(!primary) return null;
    var pieces = [];
    sorted.slice(0, columnKey === 'findings' ? 2 : 1).forEach(function(candidate){
      var body = cleanCellDraft(candidate.text, settings.maxSnippetChars);
      if(body && pieces.indexOf(body) < 0) pieces.push(body);
    });
    var draft = cleanCellDraft(pieces.join(columnKey === 'findings' ? ' ' : ' '), settings.maxSnippetChars);
    if(!draft) return null;
    var source = primary.source && typeof primary.source === 'object' ? Object.assign({}, primary.source) : {};
    source.snippet = text(source.snippet || primary.text).slice(0, settings.maxSnippetChars);
    source.extractionType = 'local-assistant-compose';
    source.confidence = clamp01(Math.max(Number(primary.confidence || 0), 0.82));
    source.updatedAt = Date.now();
    return {
      columnKey: columnKey,
      text: draft,
      score: Number(primary.score || 0) + 2,
      confidence: source.confidence,
      source: source,
      reasons: cloneArray(primary.reasons).concat(['assistant:composed-cell']).slice(0, 12),
      assistant: {
        provider: 'local-composer',
        localOnly: true,
        composedAt: Date.now()
      }
    };
  }

  function composeCells(candidates, context, rawSettings){
    var settings = normalizeSettings(rawSettings);
    if(!settings.enabled || !settings.composeCells) return [];
    var list = rankCandidates(candidates, context || {}, settings);
    if(!list.length) return [];
    var providerComposed = providerComposeCells(list, context || {}, settings);
    if(providerComposed && providerComposed.length) return rankCandidates(providerComposed, context || {}, settings);
    var byColumn = {};
    list.forEach(function(candidate){
      var normalized = normalizeCandidate(candidate);
      if(!normalized) return;
      if(!byColumn[normalized.columnKey]) byColumn[normalized.columnKey] = [];
      byColumn[normalized.columnKey].push(normalized);
    });
    return COLUMN_KEYS.map(function(columnKey){
      return composeColumnDraft(columnKey, byColumn[columnKey] || [], settings);
    }).filter(Boolean);
  }

  function rankCandidates(candidates, context, rawSettings){
    var settings = normalizeSettings(rawSettings);
    var list = cloneArray(candidates).map(normalizeCandidate).filter(Boolean);
    if(!settings.enabled || !list.length) return list;
    var providerRanked = providerRankCandidates(list, context || {}, settings);
    if(providerRanked && providerRanked.length){
      list = providerRanked;
    }else{
      list = list.map(localReviewCandidate).filter(Boolean);
    }
    list = list.filter(function(candidate){
      return Number(candidate.confidence || 0) >= settings.minConfidence || Number(candidate.score || 0) >= 3;
    });
    list.sort(function(a, b){
      var confidenceDelta = Number(b.confidence || 0) - Number(a.confidence || 0);
      if(Math.abs(confidenceDelta) > 0.001) return confidenceDelta;
      return Number(b.score || 0) - Number(a.score || 0);
    });
    var perColumn = {};
    var out = [];
    list.forEach(function(candidate){
      var count = perColumn[candidate.columnKey] || 0;
      if(count >= settings.maxCandidatesPerColumn) return;
      perColumn[candidate.columnKey] = count + 1;
      if(candidate.source && candidate.source.snippet){
        candidate.source.snippet = text(candidate.source.snippet).slice(0, settings.maxSnippetChars);
      }
      candidate.text = text(candidate.text).slice(0, settings.maxSnippetChars);
      out.push(candidate);
    });
    return out;
  }

  function getStatus(rawSettings){
    var settings = normalizeSettings(rawSettings);
    var provider = root && root.AQLocalMatrixModel;
    return {
      enabled: settings.enabled,
      provider: settings.allowModelProvider && provider ? text(provider.name || settings.provider || 'local-model') : 'rule-guard',
      localOnly: true,
      available: settings.enabled,
      modelProviderAvailable: !!(provider && typeof provider.rankCandidates === 'function'),
      composeCells: settings.composeCells,
      composeProviderAvailable: !!(provider && typeof provider.composeCells === 'function'),
      mode: 'literature-matrix-only',
      writesManuscriptText: false
    };
  }

  return {
    normalizeSettings: normalizeSettings,
    rankCandidates: rankCandidates,
    composeCells: composeCells,
    getStatus: getStatus
  };
});
