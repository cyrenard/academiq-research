(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  if(root) root.AQLiteratureMatrixExtraction = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  var COLUMN_KEYS = ['purpose', 'method', 'sample', 'findings', 'limitations'];

  var SECTION_ALIASES = {
    abstract: ['abstract', 'özet', 'ozet'],
    introduction: ['introduction', 'giriş', 'giris', 'background', 'rationale'],
    purpose: ['purpose', 'aim', 'aims', 'objective', 'objectives', 'research aim', 'research question', 'amaç', 'amac', 'araştırmanın amacı', 'arastirmanin amaci', 'bu çalışmanın amacı', 'bu calismanin amaci'],
    method: ['method', 'methods', 'methodology', 'materials and methods', 'research design', 'study design', 'yöntem', 'yontem', 'yöntemler', 'yontemler', 'araştırma deseni', 'arastirma deseni'],
    sample: ['participants', 'sample', 'study group', 'population and sample', 'sampling', 'katılımcılar', 'katilimcilar', 'örneklem', 'orneklem', 'çalışma grubu', 'calisma grubu', 'evren ve örneklem', 'evren ve orneklem'],
    measures: ['measures', 'instruments', 'data collection tools', 'veri toplama araçları', 'veri toplama araclari', 'ölçme araçları', 'olcme araclari'],
    analysis: ['data analysis', 'statistical analysis', 'veri analizi', 'istatistiksel analiz'],
    findings: ['results', 'findings', 'outcomes', 'bulgular', 'sonuçlar', 'sonuclar'],
    discussion: ['discussion', 'tartışma', 'tartisma'],
    limitations: ['limitations', 'study limitations', 'limitations and future directions', 'sınırlılıklar', 'sinirliliklar', 'araştırmanın sınırlılıkları', 'arastirmanin sinirliliklari'],
    conclusion: ['conclusion', 'conclusions', 'sonuç', 'sonuc'],
    futureResearch: ['future research', 'future directions', 'gelecek araştırmalar', 'gelecek arastirmalar', 'öneriler', 'oneriler']
  };

  var SECTION_PRIORITY = {
    purpose: ['abstract', 'purpose', 'introduction'],
    method: ['method', 'analysis', 'abstract', 'measures'],
    sample: ['sample', 'method', 'abstract'],
    findings: ['findings', 'abstract', 'discussion', 'conclusion'],
    limitations: ['limitations', 'discussion', 'futureResearch', 'conclusion']
  };

  var STRONG = {
    purpose: [
      /this study aims to/i, /the aim of this study/i, /the purpose of this study/i,
      /this research investigates/i, /this study seeks to examine/i, /this study examines/i,
      /the objective of this study/i, /we aimed to/i, /this paper examines/i,
      /bu araştırmanın amacı/i, /bu arastirmanin amaci/i, /bu çalışmanın amacı/i, /bu calismanin amaci/i,
      /araştırmanın amacı/i, /arastirmanin amaci/i, /çalışmanın amacı/i, /calismanin amaci/i,
      /bu araştırmada .* incelenmiştir/i, /bu arastirmada .* incelenmistir/i,
      /bu çalışmada .* incelenmiştir/i, /bu calismada .* incelenmistir/i,
      /bu çalışmada .* ele alınmıştır/i, /bu calismada .* ele alinmistir/i,
      /belirlenmesi amaçlanmıştır/i, /belirlenmesi amaclanmistir/i, /temel amaç/i, /temel amac/i,
      /amaçlanmıştır/i, /amaclanmistir/i, /incelenmesi amaçlanmıştır/i, /incelenmesi amaclanmistir/i
    ],
    method: [
      /cross-sectional/i, /longitudinal/i, /randomized controlled trial/i, /qualitative approach/i,
      /quantitative research design/i, /mixed[- ]methods?/i, /survey design/i, /phenomenological/i,
      /case study/i, /grounded theory/i, /thematic analysis/i, /content analysis/i, /regression analysis/i,
      /structural equation modeling/i, /data were collected using/i, /data were analyzed using/i,
      /ilişkisel tarama modeli/i, /iliskisel tarama modeli/i, /betimsel tarama modeli/i,
      /nicel araştırma/i, /nicel arastirma/i, /nitel araştırma/i, /nitel arastirma/i, /karma yöntem/i,
      /fenomenolojik desen/i, /olgu bilim deseni/i, /durum çalışması/i, /durum calismasi/i,
      /gömülü teori/i, /gomulu teori/i, /yarı deneysel desen/i, /yari deneysel desen/i, /deneysel desen/i,
      /veriler .* ile toplanmıştır/i, /veriler .* ile toplanmistir/i, /verilerin analizinde .* kullanılmıştır/i,
      /verilerin analizinde .* kullanilmistir/i, /içerik analizi/i, /icerik analizi/i, /betimsel analiz/i,
      /tematik analiz/i, /regresyon analizi/i, /yapısal eşitlik modeli/i, /yapisal esitlik modeli/i,
      /ölçüt örnekleme/i, /olcut ornekleme/i, /amaçlı örnekleme/i, /amacli ornekleme/i
    ],
    sample: [
      /\bN\s*=\s*\d+/i, /\bn\s*=\s*\d+/i, /participants were/i, /the sample consisted of/i,
      /a total of .* participants/i, /participants were recruited from/i, /undergraduate students/i,
      /adolescents/i, /teachers/i, /parents/i, /mean age/i, /age ranged from/i,
      /araştırmanın örneklemini/i, /arastirmanin orneklemini/i, /araştırmanın çalışma grubunu/i,
      /arastirmanin calisma grubunu/i, /çalışma grubunu .* oluşturmaktadır/i, /calisma grubunu .* olusturmaktadir/i,
      /örneklem .* kişiden oluşmaktadır/i, /orneklem .* kisiden olusmaktadir/i,
      /katılımcılar .* oluşmaktadır/i, /katilimcilar .* olusmaktadir/i, /toplam .* katılımcı/i,
      /toplam .* katilimci/i, /toplam .* öğrenci/i, /toplam .* ogrenci/i, /yaş aralığı/i, /yas araligi/i,
      /yaş ortalaması/i, /yas ortalamasi/i, /üniversite öğrencileri/i, /universite ogrencileri/i,
      /ergenler/i, /öğretmenler/i, /ogretmenler/i, /psikolojik danışmanlar/i, /psikolojik danismanlar/i
    ],
    findings: [
      /results showed that/i, /findings indicated/i, /findings revealed/i, /the study found/i,
      /analysis revealed/i, /significant relationship/i, /significant difference/i,
      /significantly predicted/i, /positive correlation/i, /negative correlation/i,
      /no significant difference/i, /mediated/i, /moderated/i,
      /araştırma sonucunda/i, /arastirma sonucunda/i, /elde edilen bulgular/i,
      /bulgular .* göstermektedir/i, /bulgular .* gostermektedir/i, /sonuçlar .* ortaya koymuştur/i,
      /sonuclar .* ortaya koymustur/i, /anlamlı bir ilişki bulunmuştur/i, /anlamli bir iliski bulunmustur/i,
      /anlamlı bir farklılık bulunmuştur/i, /anlamli bir farklilik bulunmustur/i,
      /yordadığı görülmüştür/i, /yordadigi gorulmustur/i, /aracı rol/i, /araci rol/i,
      /düzenleyici rol/i, /duzenleyici rol/i, /pozitif yönde/i, /pozitif yonde/i, /negatif yönde/i
    ],
    limitations: [
      /limitations include/i, /one limitation/i, /this study is limited by/i, /this study has several limitations/i,
      /should be interpreted with caution/i, /may not be generalizable/i, /future research should/i,
      /further studies are needed/i, /self-report/i, /cross-sectional design/i, /small sample size/i,
      /convenience sample/i, /bu araştırmanın sınırlılığı/i, /bu arastirmanin sinirliligi/i,
      /araştırmanın sınırlılıkları/i, /arastirmanin sinirliliklari/i, /çalışmanın sınırlılıkları/i,
      /calismanin sinirliliklari/i, /bulguların genellenebilirliği/i, /bulgularin genellenebilirligi/i,
      /kesitsel desen/i, /öz bildirim/i, /oz bildirim/i, /küçük örneklem/i, /kucuk orneklem/i,
      /kolayda örnekleme/i, /tek bir örneklem/i, /gelecek araştırmalarda/i, /gelecek arastirmalarda/i,
      /nedensel çıkarım yapılamaz/i, /nedensel cikarim yapilamaz/i
    ]
  };

  var WEAK = {
    purpose: [/aim/i, /objective/i, /purpose/i, /investigat/i, /examin/i, /amaç/i, /amac/i, /incele/i],
    method: [/method/i, /design/i, /analysis/i, /survey/i, /interview/i, /sample/i, /yöntem/i, /yontem/i, /analiz/i, /desen/i],
    sample: [/sample/i, /participant/i, /student/i, /teacher/i, /age/i, /örneklem/i, /orneklem/i, /katılımc/i, /katilimc/i, /öğrenci/i, /ogrenci/i],
    findings: [/result/i, /finding/i, /significant/i, /correlation/i, /difference/i, /bulgu/i, /sonuç/i, /sonuc/i, /anlamlı/i, /anlamli/i],
    limitations: [/limitation/i, /future research/i, /generaliz/i, /sınırl/i, /sinirl/i, /gelecek/i]
  };

  var NEGATIVE = {
    purpose: [/for the purpose of analysis/i, /for this purpose/i, /the purpose of the scale/i, /previous studies aimed/i, /önceki çalışmaların amacı/i, /onceki calismalarin amaci/i, /bu ölçeğin amacı/i],
    method: [/methodological limitations/i, /previous methods/i, /this method has been used/i, /yöntemsel sınırlılık/i, /onceki çalışmalarda kullanılan yöntem/i],
    sample: [/sample item/i, /sample question/i, /sample table/i, /sample of studies/i, /örnek madde/i, /ornek madde/i, /örnek soru/i, /çalışma örneği/i],
    findings: [/previous findings/i, /findings of previous studies/i, /literature findings/i, /önceki bulgular/i, /onceki bulgular/i],
    limitations: [/previous studies have limitations/i, /limitations of previous research/i, /önceki çalışmaların sınırlılıkları/i]
  };

  function cleanText(value){
    return String(value || '').replace(/\r\n?/g, '\n').replace(/\s+/g, ' ').trim();
  }

  function normalizeForMatch(value){
    return String(value || '').toLocaleLowerCase('tr-TR')
      .replace(/[ıİ]/g, 'i').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
      .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[çÇ]/g, 'c')
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  }

  function wordCount(value){
    return cleanText(value).split(/\s+/).filter(Boolean).length;
  }

  function truncateSnippet(value, max){
    var text = cleanText(value);
    var limit = Number(max) > 0 ? Number(max) : 2000;
    return text.length > limit ? text.slice(0, limit).trim() : text;
  }

  function buildHeadingMap(){
    var out = [];
    Object.keys(SECTION_ALIASES).forEach(function(section){
      SECTION_ALIASES[section].forEach(function(label){
        out.push({ section: section, label: label, normalized: normalizeForMatch(label) });
      });
    });
    return out.sort(function(a, b){ return b.normalized.length - a.normalized.length; });
  }

  var HEADING_MAP = buildHeadingMap();

  function detectHeading(line){
    var raw = String(line || '').trim();
    if(!raw || raw.length > 120) return null;
    var stripped = raw
      .replace(/^\s*(?:\d+(?:\.\d+)*\.?|[IVXLCDM]+\.?)\s+/i, '')
      .replace(/[:\-–—]\s*$/g, '')
      .trim();
    var norm = normalizeForMatch(stripped);
    for(var i = 0; i < HEADING_MAP.length; i += 1){
      if(norm === HEADING_MAP[i].normalized) return HEADING_MAP[i].section;
    }
    return null;
  }

  function stripAfterReferences(value){
    var lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
    var kept = [];
    for(var i = 0; i < lines.length; i += 1){
      var heading = detectHeading(lines[i]);
      if(heading === 'references' || /^(references|bibliography|kaynakça|kaynakca|referanslar)\s*$/i.test(String(lines[i] || '').trim())) break;
      kept.push(lines[i]);
    }
    return kept.join('\n');
  }

  function parseSections(value){
    var text = stripAfterReferences(String(value || ''));
    var lines = text.replace(/\r\n?/g, '\n').split('\n');
    var sections = [];
    var current = { section: 'unknown', text: '' };
    function flush(){
      var body = cleanText(current.text);
      if(body.length >= 24) sections.push({ section: current.section, text: body, pageRange: '' });
    }
    lines.forEach(function(line){
      var heading = detectHeading(line);
      if(heading){
        flush();
        current = { section: heading, text: '' };
      }else{
        current.text += '\n' + line;
      }
    });
    flush();
    if(!sections.length && cleanText(text)) sections.push({ section: 'unknown', text: cleanText(text), pageRange: '' });
    return sections;
  }

  function splitSentences(value){
    var text = stripAfterReferences(String(value || '')).replace(/\r\n?/g, '\n');
    var parts = text.split(/(?<=[.!?])\s+|\n+/g);
    return parts.map(cleanText).filter(function(sentence){
      var words = wordCount(sentence);
      if(words < 4) return false;
      if(/https?:\/\/|doi\.org|^\w+,\s*[A-Z]\./i.test(sentence) && words < 14) return false;
      return true;
    });
  }

  function scoreSentence(sentence, columnKey, sectionName, sectionRank){
    var reasons = [];
    var score = 0;
    var strong = STRONG[columnKey] || [];
    var weak = WEAK[columnKey] || [];
    var negative = NEGATIVE[columnKey] || [];
    var priorities = SECTION_PRIORITY[columnKey] || [];
    var normalizedSentence = normalizeForMatch(sentence);
    var matches = function(rx){ return rx.test(sentence) || rx.test(normalizedSentence); };
    if(sectionRank === 0){ score += 4; reasons.push('section:' + sectionName); }
    else if(sectionRank > 0 && sectionRank <= 2){ score += 2; reasons.push('secondary-section:' + sectionName); }
    strong.forEach(function(rx){
      if(matches(rx)){ score += 4; reasons.push('pattern:' + String(rx).slice(1, 40)); }
    });
    weak.forEach(function(rx){
      if(matches(rx)){ score += 1; reasons.push('keyword:' + String(rx).slice(1, 30)); }
    });
    if(columnKey === 'sample' && (/\b(?:N|n)\s*=\s*\d+|\b\d+\s+\w*\s*(participants|students|teachers|katılımcı|katilimci|öğrenci|ogrenci)|\b\d+\b.*\b(participants|students|teachers|katılımcı|katilimci|öğrenci|ogrenci)\b/i.test(sentence) || /\b(?:N|n)\s*=\s*\d+|\b\d+\s+\w*\s*(participants|students|teachers|katilimci|ogrenci)|\b\d+\b.*\b(participants|students|teachers|katilimci|ogrenci)\b/i.test(normalizedSentence))){
      score += 4; reasons.push('contains_numeric_n');
    }
    if(columnKey === 'findings' && /\bp\s*[<=>]\s*\.?\d+|significant|anlamlı|anlamli|correlation|regression/i.test(sentence)){
      score += 3; reasons.push('statistical_evidence');
    }
    var words = wordCount(sentence);
    if(words >= 8 && words <= 60){ score += 1; reasons.push('sentence_length'); }
    if(words < 5) score -= 3;
    if(words > 90) score -= 2;
    negative.forEach(function(rx){
      if(matches(rx)){ score -= 5; reasons.push('negative:' + String(rx).slice(1, 35)); }
    });
    if(priorities.indexOf(sectionName) < 0 && sectionName !== 'unknown') score -= 1;
    return { score: score, reasons: reasons };
  }

  function scoreToConfidence(score){
    if(score <= 0) return 0;
    return Math.max(0, Math.min(0.98, score / 16));
  }

  function extractCandidates(input, options){
    options = options || {};
    var sections = Array.isArray(input) ? input : parseSections(input);
    var candidates = [];
    COLUMN_KEYS.forEach(function(columnKey){
      var priorities = SECTION_PRIORITY[columnKey] || [];
      sections.forEach(function(section){
        var sectionName = section.section || 'unknown';
        var rank = priorities.indexOf(sectionName);
        var sentences = splitSentences(section.text);
        sentences.forEach(function(sentence){
          var scored = scoreSentence(sentence, columnKey, sectionName, rank);
          if(scored.score < 3) return;
          var confidence = scoreToConfidence(scored.score);
          var source = {
            section: sectionName,
            page: String(section.pageRange || section.page || ''),
            snippet: truncateSnippet(sentence, options.maxSnippet || 2000),
            extractionType: 'rule-section-sentence',
            confidence: confidence,
            updatedAt: Date.now()
          };
          candidates.push({
            columnKey: columnKey,
            text: truncateSnippet(sentence, options.maxText || 2000),
            score: scored.score,
            confidence: confidence,
            source: source,
            reasons: scored.reasons
          });
        });
      });
    });
    candidates.sort(function(a, b){ return b.score - a.score; });
    return candidates;
  }

  function bestCandidatesByColumn(input, options){
    var out = {};
    extractCandidates(input, options).forEach(function(candidate){
      if(!out[candidate.columnKey]) out[candidate.columnKey] = candidate;
    });
    return out;
  }

  return {
    COLUMN_KEYS: COLUMN_KEYS,
    SECTION_ALIASES: SECTION_ALIASES,
    parseSections: parseSections,
    splitSentences: splitSentences,
    scoreSentence: scoreSentence,
    scoreToConfidence: scoreToConfidence,
    extractCandidates: extractCandidates,
    bestCandidatesByColumn: bestCandidatesByColumn,
    truncateSnippet: truncateSnippet
  };
});

