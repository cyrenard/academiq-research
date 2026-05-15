(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  if(root) root.AQLiteratureGapMap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function text(value){ return String(value || '').trim(); }
  function lower(value){ return text(value).toLocaleLowerCase('tr-TR'); }
  function inc(map, key){
    var label = text(key) || 'unclear';
    map[label] = (map[label] || 0) + 1;
  }
  function detectMethodType(rowText){
    var t = lower(rowText);
    if(/meta-analysis|systematic review|review|derleme|meta analiz/.test(t)) return 'review';
    if(/mixed[- ]methods?|karma yöntem|karma yontem/.test(t)) return 'mixed';
    if(/qualitative|nitel|phenomenolog|olgu bilim|case study|durum çalışması|durum calismasi/.test(t)) return 'qualitative';
    if(/quantitative|nicel|survey|regression|anova|sem|correlation|tarama/.test(t)) return 'quantitative';
    return 'unclear';
  }
  function detectDesign(rowText){
    var t = lower(rowText);
    if(/cross-sectional|kesitsel/.test(t)) return 'cross-sectional';
    if(/longitudinal|boylamsal/.test(t)) return 'longitudinal';
    if(/quasi-experimental|yarı deneysel|yari deneysel/.test(t)) return 'quasi-experimental';
    if(/experimental|deneysel|randomized/.test(t)) return 'experimental';
    if(/phenomenolog|fenomenoloji|olgu bilim/.test(t)) return 'phenomenology';
    if(/case study|durum çalışması|durum calismasi/.test(t)) return 'case study';
    if(/correlational|ilişkisel|iliskisel|correlation/.test(t)) return 'correlational';
    return 'unclear';
  }
  function detectSampleGroup(rowText){
    var t = lower(rowText);
    if(/undergraduate students|university students|üniversite öğrencileri|universite ogrencileri/.test(t)) return 'undergraduate students';
    if(/adolescents|ergen/.test(t)) return 'adolescents';
    if(/preservice teachers|öğretmen adayları|ogretmen adaylari/.test(t)) return 'preservice teachers';
    if(/teachers|öğretmenler|ogretmenler/.test(t)) return 'teachers';
    if(/counselors|psikolojik danışman|psikolojik danisman/.test(t)) return 'counselors';
    if(/parents|ebeveyn/.test(t)) return 'parents';
    if(/clinical|klinik/.test(t)) return 'clinical sample';
    return 'unclear';
  }
  function detectAnalysisType(rowText){
    var t = lower(rowText);
    if(/structural equation|sem|yapısal eşitlik|yapisal esitlik/.test(t)) return 'SEM';
    if(/regression|regresyon/.test(t)) return 'regression';
    if(/correlation|korelasyon/.test(t)) return 'correlation';
    if(/anova/.test(t)) return 'ANOVA';
    if(/t-test|t test/.test(t)) return 't-test';
    if(/mediat|aracılık|aracilik/.test(t)) return 'mediation';
    if(/moderat|düzenleyicilik|duzenleyicilik/.test(t)) return 'moderation';
    if(/thematic analysis|tematik analiz/.test(t)) return 'thematic analysis';
    if(/content analysis|içerik analizi|icerik analizi/.test(t)) return 'content analysis';
    if(/descriptive analysis|betimsel analiz/.test(t)) return 'descriptive analysis';
    return 'unclear';
  }
  function detectFindingDirection(rowText){
    var t = lower(rowText);
    if(/no significant|not significant|anlamlı .* bulunmamıştır|anlamli .* bulunmamistir/.test(t)) return 'nonsignificant';
    if(/positive|pozitif/.test(t)) return 'positive';
    if(/negative|negatif/.test(t)) return 'negative';
    if(/mixed|karma/.test(t)) return 'mixed';
    return 'unclear';
  }
  function detectLimitationTags(rowText){
    var t = lower(rowText);
    var tags = [];
    if(/cross-sectional|kesitsel/.test(t)) tags.push('cross-sectional');
    if(/self-report|öz bildirim|oz bildirim/.test(t)) tags.push('self-report');
    if(/small sample|küçük örneklem|kucuk orneklem/.test(t)) tags.push('small sample');
    if(/convenience sample|kolayda/.test(t)) tags.push('convenience sample');
    if(/single country|tek ülke|tek ulke/.test(t)) tags.push('single country');
    if(/generaliz/.test(t)) tags.push('generalizability');
    if(/causal|nedensel/.test(t)) tags.push('causality');
    if(/measurement|ölçüm|olcum/.test(t)) tags.push('measurement limitation');
    return tags;
  }
  function rowText(row){
    var cells = row && row.cells ? row.cells : {};
    return ['purpose','method','sample','findings','limitations','myNotes'].map(function(key){
      var cell = cells[key];
      return typeof cell === 'string' ? cell : text(cell && cell.text);
    }).join(' ');
  }
  function tagRows(rows){
    return (Array.isArray(rows) ? rows : []).map(function(row){
      var body = rowText(row);
      return {
        rowId: text(row && row.id),
        referenceId: text(row && row.referenceId),
        methodType: detectMethodType(body),
        design: detectDesign(body),
        sampleGroup: detectSampleGroup(body),
        analysisType: detectAnalysisType(body),
        findingDirection: detectFindingDirection(body),
        limitationTags: detectLimitationTags(body)
      };
    });
  }
  function buildHeatmap(tagged, xKey, yKey){
    var map = {};
    tagged.forEach(function(item){
      var x = text(item[xKey]) || 'unclear';
      var y = text(item[yKey]) || 'unclear';
      var key = x + '||' + y;
      map[key] = map[key] || { x: x, y: y, count: 0, referenceIds: [] };
      map[key].count += 1;
      if(item.referenceId) map[key].referenceIds.push(item.referenceId);
    });
    return Object.keys(map).map(function(key){ return map[key]; }).sort(function(a,b){ return b.count - a.count; });
  }
  function buildGapMap(rows){
    var tagged = tagRows(rows);
    var methodCounts = {};
    var sampleCounts = {};
    var limitationFrequency = {};
    tagged.forEach(function(item){
      inc(methodCounts, item.methodType);
      inc(sampleCounts, item.sampleGroup);
      item.limitationTags.forEach(function(tag){ inc(limitationFrequency, tag); });
    });
    var total = tagged.length;
    var gapCandidates = [];
    var cross = tagged.filter(function(item){ return item.design === 'cross-sectional'; }).length;
    var long = tagged.filter(function(item){ return item.design === 'longitudinal'; }).length;
    if(total >= 3 && cross >= Math.ceil(total * 0.5) && long === 0){
      gapCandidates.push({
        type: 'methodological_gap',
        label: 'Boylamsal çalışma eksikliği',
        evidence: { totalStudies: total, crossSectional: cross, longitudinal: long },
        relatedReferenceIds: tagged.filter(function(item){ return item.design === 'cross-sectional'; }).map(function(item){ return item.referenceId; }).filter(Boolean),
        confidence: 'high'
      });
    }
    var undergrad = sampleCounts['undergraduate students'] || 0;
    if(total >= 3 && undergrad >= Math.ceil(total * 0.5)){
      gapCandidates.push({
        type: 'sample_gap',
        label: 'Örneklem çeşitliliği düşük',
        evidence: { totalStudies: total, undergraduateStudents: undergrad },
        relatedReferenceIds: tagged.filter(function(item){ return item.sampleGroup === 'undergraduate students'; }).map(function(item){ return item.referenceId; }).filter(Boolean),
        confidence: 'medium'
      });
    }
    return {
      overview: {
        totalStudies: total,
        mostCommonMethod: Object.keys(methodCounts).sort(function(a,b){ return methodCounts[b] - methodCounts[a]; })[0] || 'unclear',
        mostCommonSample: Object.keys(sampleCounts).sort(function(a,b){ return sampleCounts[b] - sampleCounts[a]; })[0] || 'unclear'
      },
      tags: tagged,
      heatmaps: {
        methodBySample: buildHeatmap(tagged, 'methodType', 'sampleGroup'),
        methodByAnalysis: buildHeatmap(tagged, 'methodType', 'analysisType'),
        limitationFrequency: Object.keys(limitationFrequency).map(function(tag){ return { tag: tag, count: limitationFrequency[tag] }; }).sort(function(a,b){ return b.count - a.count; })
      },
      gapCandidates: gapCandidates
    };
  }
  return {
    tagRows: tagRows,
    buildGapMap: buildGapMap,
    detectMethodType: detectMethodType,
    detectDesign: detectDesign,
    detectSampleGroup: detectSampleGroup,
    detectAnalysisType: detectAnalysisType,
    detectFindingDirection: detectFindingDirection,
    detectLimitationTags: detectLimitationTags
  };
});
