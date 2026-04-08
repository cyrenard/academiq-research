(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQLiteratureMatrixState = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  var MATRIX_COLUMNS = [
    { key: 'authorYear', label: 'Author-Year', editable: false },
    { key: 'purpose', label: 'Purpose', editable: true },
    { key: 'method', label: 'Method', editable: true },
    { key: 'sample', label: 'Sample', editable: true },
    { key: 'findings', label: 'Findings', editable: true },
    { key: 'limitations', label: 'Limitations', editable: true },
    { key: 'myNotes', label: 'My Notes', editable: true }
  ];

  var EDITABLE_COLUMN_KEYS = MATRIX_COLUMNS
    .filter(function(column){ return column.editable; })
    .map(function(column){ return column.key; });

  var AUTO_FILL_PATTERNS = {
    purpose: [
      'this study aims to',
      'the aim of this study',
      'this research investigates',
      'the purpose of this study',
      'this study seeks to explore',
      'this study seeks to examine',
      'this study aims to examine',
      'the purpose of this research is to investigate',
      'objective',
      'this paper examines',
      'we aimed to',
      'amaç'
    ],
    method: [
      'using a qualitative approach',
      'a cross-sectional study',
      'participants completed',
      'semi-structured interviews',
      'survey design',
      'mixed-methods',
      'research design',
      'a quantitative research design was employed',
      'data were collected using',
      'data were analyzed using',
      'participants were selected through',
      'method',
      'methodology',
      'randomized controlled',
      'yöntem'
    ],
    sample: [
      'n =',
      'participants were',
      'the sample consisted of',
      'participants ranged in age from',
      'a total of',
      'participants were recruited from',
      'undergraduate students',
      'teachers',
      'adolescents',
      'parents aged',
      'sample',
      'participants'
    ],
    findings: [
      'results showed that',
      'findings indicated',
      'the study found',
      'analysis revealed',
      'results indicated that',
      'findings revealed that',
      'there was a significant relationship between',
      'significantly predicted',
      'results suggest',
      'findings',
      'bulgular'
    ],
    limitations: [
      'limitations include',
      'one limitation',
      'this study is limited by',
      'future research should',
      'this study has several limitations',
      'the findings may not be generalizable',
      'limitation',
      'constraint',
      'sınırlılık'
    ]
  };

  var AUTO_FILL_RULES = {
    purpose: {
      strong: [
        /\bthis study aims to\b/i,
        /\bthe aim of this study\b/i,
        /\bthe purpose of this study\b/i,
        /\bthis research investigates\b/i,
        /\bthis study seeks to explore\b/i,
        /\bthis study seeks to examine\b/i,
        /\bthe purpose of this research is to investigate\b/i,
        /\bthe aim of this research\b/i,
        /\bthis paper aims to\b/i,
        /\bthis paper examines\b/i,
        /\bthis research aims to\b/i,
        /\bthe present study aims\b/i,
        /\bthe current study aims\b/i,
        /\bthe objective of this study\b/i,
        /\bobjective(?:s)?\b/i,
        /\bwe aimed to\b/i,
        /\baim(?:ed)? to\b/i,
        /\bdetermin(?:e|es|ed)\b/i,
        /\bevaluat(?:e|es|ed)\b/i,
        /\bassess(?:es|ed)?\b/i,
        /\banaly[sz](?:e|es|ed|ing)\b/i
      ],
      weak: [
        /\bexamines?\b/i,
        /\bexplores?\b/i,
        /\binvestigates?\b/i,
        /\bpurpose\b/i,
        /\bamaç\b/i,
        /\bincelemek\b/i,
        /\bdeğerlendirmek\b/i,
        /\betkisini\b/i,
        /\bilişkiyi\b/i
      ],
      minScore: 4
    },
    method: {
      strong: [
        /\busing a qualitative approach\b/i,
        /\ba cross-sectional study\b/i,
        /\bsemi-structured interviews?\b/i,
        /\bmixed[- ]methods?\b/i,
        /\brandomized controlled trial\b/i,
        /\bsurvey design\b/i,
        /\bresearch design\b/i,
        /\bstudy design\b/i,
        /\bdata were collected using\b/i,
        /\bdata were analyzed using\b/i,
        /\bwas employed\b/i,
        /\bwere collected\b/i,
        /\bwere analyzed\b/i,
        /\ba quantitative research design\b/i,
        /\bparticipants were selected through\b/i,
        /\bthe sample consisted of\b/i,
        /\bstructural equation model/i,
        /\bconvenience sampling\b/i,
        /\bpurposive sampling\b/i,
        /\brandom sampling\b/i
      ],
      weak: [
        /\bmethod(?:s|ology)?\b/i,
        /\bparticipants completed\b/i,
        /\bregression\b/i,
        /\banalysis\b/i,
        /\bthematic analysis\b/i,
        /\bcontent analysis\b/i,
        /\bcorrelation\b/i,
        /\binstrument\b/i,
        /\bscale\b/i,
        /\bquestionnaire\b/i,
        /\byöntem\b/i,
        /\banket\b/i,
        /\baraştırma deseni\b/i
      ],
      minScore: 4
    },
    sample: {
      strong: [
        /\b(?:N|n)\s*=\s*\d+\b/,
        /\bthe sample consisted of\b/i,
        /\bparticipants were\b/i,
        /\ba total of\b/i,
        /\bparticipants were recruited from\b/i,
        /\bparticipants ranged in age from\b/i,
        /\bundergraduate students\b/i,
        /\badolescents?\b/i,
        /\bparents aged\b/i
      ],
      weak: [
        /\bsample\b/i,
        /\bparticipants?\b/i,
        /\bteachers?\b/i,
        /\bkatılımc[ıi]lar\b/i,
        /\börneklem\b/i
      ],
      minScore: 3
    },
    findings: {
      strong: [
        /\bresults showed that\b/i,
        /\bfindings indicated\b/i,
        /\bthe study found\b/i,
        /\banalysis revealed\b/i,
        /\bour findings\b/i,
        /\bresults indicated that\b/i,
        /\bfindings revealed that\b/i,
        /\bsignificant relationship between\b/i,
        /\bsignificant(?:ly)? predicted\b/i,
        /\bresults suggest\b/i,
        /\bthese findings suggest\b/i,
        /\bthe results are consistent with\b/i,
        /\bwe found that\b/i,
        /\bdemonstrated that\b/i,
        /\bno significant difference\b/i,
        /\bpositive correlation\b/i,
        /\bnegative correlation\b/i,
        /\bstatistically significant\b/i
      ],
      weak: [
        /\bresults?\b/i,
        /\bfindings?\b/i,
        /\bsignificant(?:ly)?\b/i,
        /\bvariance\b/i,
        /\bp\s*[<=>]\s*\.?\d+/i,
        /\bimpact\b/i,
        /\bpredictor\b/i,
        /\bcorrelation\b/i,
        /\bdifference\b/i,
        /\beffect\b/i,
        /\brevealed\b/i,
        /\bindicated\b/i,
        /\bbulgular\b/i,
        /\bsonuçlar\b/i,
        /\banlamlı\b/i
      ],
      minScore: 4
    },
    limitations: {
      strong: [
        /\blimitations include\b/i,
        /\bone limitation\b/i,
        /\bthis study is limited by\b/i,
        /\bfuture research should\b/i,
        /\bthis study has several limitations\b/i,
        /\bmay not be generalizable\b/i,
        /\bone limitation of this study\b/i,
        /\bshould be interpreted with caution\b/i,
        /\bfurther studies\b/i,
        /\bfuture directions\b/i
      ],
      weak: [
        /\blimitation(?:s)?\b/i,
        /\bconstraint(?:s)?\b/i,
        /\bcaution\b/i,
        /\bfuture research\b/i,
        /\bgeneralizability\b/i,
        /\bself-report(?:ed)?\b/i,
        /\bsample size\b/i,
        /\bcross-sectional\b/i,
        /\bbias\b/i,
        /\bsingle[- ]center\b/i,
        /\bcausal inference\b/i,
        /\bsınırlılık(?:lar)?\b/i,
        /\bkısıt(?:lar)?\b/i,
        /\bdaha fazla çalışma\b/i
      ],
      minScore: 3
    }
  };

  var AUTO_FILL_KEYWORDS = {
    purpose: [
      'aim', 'aims', 'aimed', 'objective', 'objectives', 'purpose', 'investigate', 'investigates',
      'investigated', 'evaluate', 'evaluates', 'evaluated', 'examine', 'examines', 'examined',
      'explore', 'explores', 'determine', 'assess', 'analyze', 'understand', 'compare',
      'effect of', 'impact of', 'relationship between', 'association between', 'research question',
      'this study seeks to', 'this study seeks to explore', 'this study seeks to examine',
      'the purpose of this research is to investigate',
      'hypothesis', 'bu çalışmanın amacı', 'araştırmanın amacı', 'amaç', 'incelemek', 'değerlendirmek',
      'etkisini', 'ilişkiyi'
    ],
    method: [
      'method', 'methods', 'methodology', 'design', 'study design', 'protocol',
      'qualitative', 'quantitative', 'mixed methods', 'mixed-methods',
      'cross-sectional', 'longitudinal', 'cohort', 'case-control', 'randomized', 'trial',
      'systematic review', 'meta-analysis', 'survey', 'questionnaire', 'interview',
      'semi-structured', 'focus group', 'thematic analysis', 'content analysis',
      'regression', 'anova', 'structural equation modeling', 'sem', 'correlation',
      'instrument', 'scale', 'data collection', 'data were collected using',
      'data were analyzed using', 'was employed',
      'yöntem', 'yöntemler', 'araştırma deseni', 'nitel', 'nicel', 'karma yöntem',
      'anket', 'görüşme', 'odak grup'
    ],
    sample: [
      'sample', 'sample size', 'participants', 'respondents', 'subjects', 'population',
      'n =', 'n=', 'recruited', 'enrolled', 'inclusion criteria', 'exclusion criteria',
      'students', 'undergraduate students', 'teachers', 'adolescents', 'adults', 'parents', 'patients',
      'healthcare workers', 'community members', 'convenience sample', 'random sample',
      'purposive sampling', 'demographic', 'age', 'gender', 'participants ranged in age from',
      'a total of', 'participants were recruited from',
      'örneklem', 'katılımcılar', 'katilimcilar', 'öğrenci', 'öğrenciler', 'hasta', 'hastalar'
    ],
    findings: [
      'results', 'findings', 'study found', 'we found', 'analysis revealed', 'showed that',
      'indicated that', 'suggests that', 'demonstrated', 'associated with', 'predicted',
      'improved', 'reduced', 'increased', 'significant', 'statistically significant',
      'no significant difference', 'positive correlation', 'negative correlation',
      'difference', 'effect', 'predictor', 'variance', 'p < .05', 'p<.05', 'revealed',
      'bulgular', 'sonuçlar', 'anlamlı', 'tespit edildi', 'ortaya koydu'
    ],
    limitations: [
      'limitation', 'limitations', 'constraint', 'constrained by', 'limited by',
      'small sample size', 'single-center', 'single site', 'self-report bias',
      'cross-sectional design', 'causal inference', 'generalizability',
      'future research', 'future research should', 'further studies', 'should be interpreted with caution',
      'this study has several limitations', 'one limitation of this study is',
      'the findings may not be generalizable',
      'sınırlılık', 'sınırlılıklar', 'kısıt', 'gelecek çalışmalar', 'daha fazla çalışma'
    ]
  };

  var STRUCTURED_SECTION_LABELS = {
    purpose: [
      'purpose', 'aim', 'aims', 'objective', 'objectives', 'research objective',
      'research objectives', 'goals', 'introduction', 'background', 'rationale',
      'research question', 'research questions', 'research aim', 'research aims',
      'study aim', 'study aims', 'study objective', 'study objectives',
      'amaç', 'araştırmanın amacı', 'bu çalışmanın amacı', 'giriş'
    ],
    method: [
      'method', 'methods', 'methodology', 'design', 'materials and methods',
      'research design', 'study design', 'research method', 'research methods',
      'data collection', 'procedure', 'procedures', 'measures', 'instruments',
      'data analysis', 'statistical analysis', 'analysis',
      'yöntem', 'yöntemler', 'araştırma deseni', 'veri toplama'
    ],
    sample: [
      'sample', 'participants', 'population', 'subjects', 'sampling',
      'study population', 'study sample', 'data sources', 'recruitment',
      'inclusion criteria', 'exclusion criteria', 'eligibility',
      'katılımcılar', 'örneklem', 'çalışma grubu', 'evren ve örneklem'
    ],
    findings: [
      'results', 'findings', 'outcomes', 'conclusion', 'conclusions',
      'discussion', 'key findings', 'main findings', 'summary of findings',
      'bulgular', 'sonuçlar', 'sonuç', 'tartışma'
    ],
    limitations: [
      'limitations', 'limitation', 'limitations and future directions',
      'constraints', 'future research', 'future directions',
      'limitations of the study', 'study limitations',
      'sınırlılıklar', 'sınırlılık', 'kısıtlar', 'gelecek çalışmalar'
    ]
  };

  function text(value){
    return String(value == null ? '' : value).trim();
  }

  function cloneArray(value){
    return Array.isArray(value) ? value.slice() : [];
  }

  function uniqueArray(values){
    var seen = {};
    var out = [];
    cloneArray(values).forEach(function(value){
      var key = String(value || '');
      if(!key || seen[key]) return;
      seen[key] = true;
      out.push(key);
    });
    return out;
  }

  function defaultCell(){
    return {
      text: '',
      noteIds: [],
      source: { page: '', snippet: '', updatedAt: 0 }
    };
  }

  function defaultCells(){
    var cells = {};
    EDITABLE_COLUMN_KEYS.forEach(function(key){
      cells[key] = defaultCell();
    });
    return cells;
  }

  function normalizeNoteIds(value){
    return cloneArray(value).map(function(noteId){
      return text(noteId);
    }).filter(Boolean);
  }

  function normalizeCell(value){
    if(typeof value === 'string'){
      return {
        text: value,
        noteIds: [],
        source: { page: '', snippet: '', updatedAt: 0 }
      };
    }
    var cell = value && typeof value === 'object' ? value : {};
    var source = cell.source && typeof cell.source === 'object' ? cell.source : {};
    return {
      text: text(cell.text || ''),
      noteIds: normalizeNoteIds(cell.noteIds),
      source: {
        page: text(source.page || ''),
        snippet: text(source.snippet || ''),
        updatedAt: Number(source.updatedAt) > 0 ? Number(source.updatedAt) : 0
      }
    };
  }

  function splitSentences(textValue){
    var raw = String(textValue || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u2022/g, '. ')
      .trim();
    if(!raw) return [];
    var chunks = raw.split(/\n+/g);
    var out = [];
    chunks.forEach(function(chunk){
      var part = String(chunk || '').trim();
      if(!part) return;
      var pieces = part.match(/[^.!?;\n]+(?:[.!?;:]|$)/g) || [part];
      pieces.forEach(function(sentence){
        var item = String(sentence || '').replace(/\s+/g, ' ').trim();
        if(!item) return;
        out.push(item);
      });
    });
    return out;
  }

  function pushCorpusText(payload, value){
    var item = String(value || '').replace(/\s+/g, ' ').trim();
    if(item) payload.push(item);
  }

  function findSentenceByPatterns(sentences, patterns){
    var list = Array.isArray(sentences) ? sentences : [];
    var keys = cloneArray(patterns).map(function(pattern){
      return String(pattern || '').toLowerCase();
    }).filter(Boolean);
    if(!list.length || !keys.length) return '';
    for(var i = 0; i < list.length; i += 1){
      var sentence = String(list[i] || '').trim();
      if(!sentence) continue;
      var hay = sentence.toLowerCase();
      for(var j = 0; j < keys.length; j += 1){
        if(hay.indexOf(keys[j]) >= 0){
          return sentence;
        }
      }
    }
    return '';
  }

  function wordCount(value){
    return String(value || '').trim().split(/\s+/g).filter(Boolean).length;
  }

  function scoreSentenceForRule(sentence, rule){
    if(!sentence || !rule) return 0;
    var score = 0;
    cloneArray(rule.strong).forEach(function(rx){
      if(rx && typeof rx.test === 'function' && rx.test(sentence)) score += 4;
    });
    cloneArray(rule.weak).forEach(function(rx){
      if(rx && typeof rx.test === 'function' && rx.test(sentence)) score += 1;
    });
    var words = wordCount(sentence);
    if(words >= 7 && words <= 60) score += 1;
    if(words < 5) score -= 2;
    if(words > 80) score -= 1;
    return score;
  }

  function scoreSentenceForKeywords(sentence, keywords){
    var textValue = String(sentence || '').toLowerCase();
    if(!textValue) return 0;
    var score = 0;
    cloneArray(keywords).forEach(function(keyword){
      var key = String(keyword || '').toLowerCase().trim();
      if(!key) return;
      if(textValue.indexOf(key) >= 0){
        score += key.length >= 12 ? 2 : 1;
      }
    });
    return score;
  }

  function findBestSentenceForRule(sentences, rule, keywords){
    var list = Array.isArray(sentences) ? sentences : [];
    if(!list.length || !rule) return '';
    var bestSentence = '';
    var bestScore = 0;
    list.forEach(function(sentence){
      var item = String(sentence || '').trim();
      if(!item) return;
      var score = scoreSentenceForRule(item, rule);
      score += scoreSentenceForKeywords(item, keywords);
      if(score > bestScore){
        bestScore = score;
        bestSentence = item;
      }
    });
    return bestScore >= Number(rule.minScore || 3) ? bestSentence : '';
  }

  function collectTopSentences(sentences, rule, keywords, exclude, maxExtra){
    var list = Array.isArray(sentences) ? sentences : [];
    var scored = [];
    var excludeLower = String(exclude || '').toLowerCase().trim();
    list.forEach(function(sentence){
      var item = String(sentence || '').trim();
      if(!item || item.toLowerCase().trim() === excludeLower) return;
      var score = scoreSentenceForRule(item, rule) + scoreSentenceForKeywords(item, keywords);
      if(score >= 2) scored.push({ text: item, score: score });
    });
    scored.sort(function(a, b){ return b.score - a.score; });
    return scored.slice(0, maxExtra || 2).map(function(s){ return s.text; }).join(' ');
  }

  function escapeRegExp(value){
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function trimSectionLeak(textValue){
    return String(textValue || '')
      .replace(/\s+(?:purpose|aim|objective|method(?:s|ology)?|design|sample|participants?|findings?|results?|limitations?|future research|amaç|yöntem(?:ler)?|örneklem|katılımcılar|bulgular?|sonuçlar?)\s*[:\-].*$/i, '')
      .trim();
  }

  function extractStructuredSection(corpus, labels){
    var source = String(corpus || '');
    var keys = cloneArray(labels).map(function(label){
      return escapeRegExp(label).trim();
    }).filter(Boolean);
    if(!source || !keys.length) return '';
    // Match section headers: "Purpose:", "1. Methods", "II. Sample", "RESULTS", etc.
    var labelAlt = keys.join('|');
    var patterns = [
      new RegExp('(?:^|\\n|\\r|[.;])\\s*(?:' + labelAlt + ')\\s*[:\\-]\\s*([^\\n\\r]{12,420})', 'i'),
      new RegExp('(?:^|\\n|\\r)\\s*\\d+\\.?\\s*(?:' + labelAlt + ')\\s*[:\\-\\n]\\s*([^\\n\\r]{12,420})', 'i'),
      new RegExp('(?:^|\\n|\\r)\\s*(?:I{1,3}V?|VI{0,3})\\.?\\s*(?:' + labelAlt + ')\\s*[:\\-\\n]\\s*([^\\n\\r]{12,420})', 'i')
    ];
    for(var i = 0; i < patterns.length; i++){
      var found = source.match(patterns[i]);
      if(found && found[1]){
        var value = trimSectionLeak(found[1]).replace(/\s+/g, ' ').trim();
        if(value) return value;
      }
    }
    return '';
  }

  function labelToColumn(label){
    var needle = String(label || '').toLowerCase().trim();
    if(!needle) return '';
    var keys = Object.keys(STRUCTURED_SECTION_LABELS);
    for(var i = 0; i < keys.length; i += 1){
      var columnKey = keys[i];
      var labels = cloneArray(STRUCTURED_SECTION_LABELS[columnKey]).map(function(item){
        return String(item || '').toLowerCase().trim();
      });
      if(labels.indexOf(needle) >= 0){
        return columnKey;
      }
    }
    return '';
  }

  function buildStructuredLabelAlternation(){
    var all = [];
    Object.keys(STRUCTURED_SECTION_LABELS).forEach(function(columnKey){
      cloneArray(STRUCTURED_SECTION_LABELS[columnKey]).forEach(function(label){
        var item = String(label || '').trim();
        if(!item) return;
        all.push(item);
      });
    });
    var seen = {};
    return all
      .sort(function(a, b){ return b.length - a.length; })
      .filter(function(item){
        var key = item.toLowerCase();
        if(seen[key]) return false;
        seen[key] = true;
        return true;
      })
      .map(escapeRegExp)
      .join('|');
  }

  function extractStructuredSections(corpus){
    var source = String(corpus || '');
    if(!source) return {};
    var alternation = buildStructuredLabelAlternation();
    if(!alternation) return {};
    var rx = new RegExp('(?:^|\\n|\\r|[.;])\\s*(?:\\d+\\.?\\s*|(?:I{1,3}V?|VI{0,3})\\.?\\s*)?(' + alternation + ')\\s*[:\\-\\n]\\s*', 'ig');
    var matches = [];
    var m = null;
    while((m = rx.exec(source)) !== null){
      matches.push({
        label: String(m[1] || '').trim(),
        start: rx.lastIndex
      });
      if(matches.length > 64) break;
    }
    if(!matches.length) return {};
    var out = {};
    for(var i = 0; i < matches.length; i += 1){
      var columnKey = labelToColumn(matches[i].label);
      if(!columnKey) continue;
      var end = i + 1 < matches.length ? matches[i + 1].start : source.length;
      var chunk = source.slice(matches[i].start, end);
      var cleaned = trimSectionLeak(String(chunk || '').replace(/\s+/g, ' ').trim());
      if(!cleaned || cleaned.length < 12) continue;
      if(!out[columnKey] || cleaned.length > out[columnKey].length){
        out[columnKey] = cleaned;
      }
    }
    return out;
  }

  function extractSampleByInlineSignature(corpus){
    var source = String(corpus || '');
    if(!source) return '';
    var nHit = source.match(/\b(?:N|n)\s*=\s*\d+\b[^.\n;]*/);
    if(nHit && nHit[0]){
      return String(nHit[0]).replace(/\s+/g, ' ').trim();
    }
    var countHit = source.match(/\b\d{1,5}\s+(?:participants?|students?|adolescents?|parents?|teachers?|subjects?|patients?|katılımc[ıi]lar|öğrenciler)\b[^.\n;]*/i);
    if(countHit && countHit[0]){
      return String(countHit[0]).replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  function pickFallbackSentence(sentences, columnKey){
    var list = Array.isArray(sentences) ? sentences : [];
    if(!list.length) return '';
    if(columnKey === 'purpose'){
      return String(list[0] || '').trim();
    }
    if(columnKey === 'findings'){
      for(var i = 0; i < list.length; i += 1){
        var sentence = String(list[i] || '');
        if(/\b(showed|indicated|revealed|found|suggest(?:ed|s)?|results?|findings?|bulgular|sonuçlar?)\b/i.test(sentence)){
          return sentence.trim();
        }
      }
    }
    return '';
  }

  function buildReferenceTextCorpus(reference, options){
    var ref = reference && typeof reference === 'object' ? reference : {};
    var payload = [];
    var fields = [
      ref.abstract,
      ref.abs,
      ref.description,
      ref.summary,
      ref.snippet,
      ref.fullText,
      ref.fulltext,
      ref.content,
      ref.body,
      ref.introduction,
      ref.methods,
      ref.results,
      ref.limitations,
      ref.title
    ];
    fields.forEach(function(value){
      pushCorpusText(payload, value);
    });

    var highlights = Array.isArray(ref._hlData) ? ref._hlData : (Array.isArray(ref.highlights) ? ref.highlights : []);
    highlights.forEach(function(entry){
      if(!entry || typeof entry !== 'object') return;
      pushCorpusText(payload, entry.text || entry.quote || entry.body);
    });

    var annotations = Array.isArray(ref._annots) ? ref._annots : (Array.isArray(ref.annotations) ? ref.annotations : []);
    annotations.forEach(function(entry){
      if(!entry || typeof entry !== 'object') return;
      pushCorpusText(payload, entry.text || entry.body || entry.note);
    });

    var notes = Array.isArray(options && options.notes) ? options.notes : [];
    var refId = text(ref.id || ref.referenceId);
    if(refId){
      notes.forEach(function(note){
        if(!note || String(note.rid || '') !== refId) return;
        pushCorpusText(payload, note.q || note.sourceExcerpt || note.txt || note.comment);
      });
    }
    pushCorpusText(payload, options && options.extraText);
    return payload.join('\n');
  }

  function inferAutoCellsFromReference(reference, options){
    var corpus = buildReferenceTextCorpus(reference, options);
    if(!corpus) return {};
    var sentences = splitSentences(corpus);
    if(!sentences.length) return {};
    var out = {};
    var structuredSections = extractStructuredSections(corpus);
    Object.keys(AUTO_FILL_RULES).forEach(function(columnKey){
      if(structuredSections[columnKey]){
        out[columnKey] = structuredSections[columnKey];
        return;
      }
      var structured = extractStructuredSection(corpus, STRUCTURED_SECTION_LABELS[columnKey]);
      if(structured){
        out[columnKey] = structured;
        return;
      }
      if(columnKey === 'sample'){
      var nHit = extractSampleByInlineSignature(corpus);
      if(nHit){
        out.sample = nHit;
        return;
      }
    }
      var hit = findBestSentenceForRule(
        sentences,
        AUTO_FILL_RULES[columnKey],
        AUTO_FILL_KEYWORDS[columnKey]
      );
      if(!hit){
        hit = findSentenceByPatterns(sentences, AUTO_FILL_PATTERNS[columnKey]);
      }
      if(!hit){
        hit = pickFallbackSentence(sentences, columnKey);
      }
      // If hit is very short, try to gather more context by collecting top-scoring sentences
      if(hit && wordCount(hit) < 10){
        var extras = collectTopSentences(sentences, AUTO_FILL_RULES[columnKey], AUTO_FILL_KEYWORDS[columnKey], hit, 2);
        if(extras) hit = hit + ' ' + extras;
      }
      if(hit) out[columnKey] = hit;
    });
    return out;
  }

  function normalizeCells(cells){
    var next = defaultCells();
    var source = cells && typeof cells === 'object' ? cells : {};
    EDITABLE_COLUMN_KEYS.forEach(function(key){
      next[key] = normalizeCell(source[key]);
    });
    return next;
  }

  function normalizeRow(row, workspaceId, options){
    options = options || {};
    var uid = options.uid || function(){
      return 'mxr-' + Math.random().toString(36).slice(2, 11);
    };
    var safeWorkspaceId = text(workspaceId);
    var source = row && typeof row === 'object' ? row : {};
    var referenceId = text(source.referenceId);
    var now = Date.now();
    return {
      id: text(source.id) || uid(),
      workspaceId: safeWorkspaceId,
      referenceId: referenceId,
      cells: normalizeCells(source.cells),
      createdAt: Number(source.createdAt) > 0 ? Number(source.createdAt) : now,
      updatedAt: Number(source.updatedAt) > 0 ? Number(source.updatedAt) : now
    };
  }

  function ensureState(state){
    if(!state || typeof state !== 'object') return {};
    if(!state.literatureMatrix || typeof state.literatureMatrix !== 'object'){
      state.literatureMatrix = {};
    }
    return state.literatureMatrix;
  }

  function normalizeWorkspaceState(value, workspaceId, options){
    var source = value && typeof value === 'object' ? value : {};
    var rows = cloneArray(source.rows)
      .map(function(row){ return normalizeRow(row, workspaceId, options); })
      .filter(function(row){ return row.referenceId; });
    var seen = {};
    rows = rows.filter(function(row){
      var key = row.referenceId.toLowerCase();
      if(seen[key]) return false;
      seen[key] = true;
      return true;
    });
    var selectedCell = source.selectedCell && typeof source.selectedCell === 'object'
      ? {
          rowId: text(source.selectedCell.rowId),
          columnKey: text(source.selectedCell.columnKey)
        }
      : null;
    if(selectedCell && !selectedCell.rowId){
      selectedCell = null;
    }
    var dismissedReferenceIds = uniqueArray(cloneArray(source.dismissedReferenceIds).map(function(referenceId){
      return text(referenceId);
    }).filter(Boolean));
    return {
      rows: rows,
      selectedCell: selectedCell,
      dismissedReferenceIds: dismissedReferenceIds,
      updatedAt: Number(source.updatedAt) > 0 ? Number(source.updatedAt) : Date.now()
    };
  }

  function ensureWorkspaceMatrix(state, workspaceId, options){
    options = options || {};
    var wsId = text(workspaceId);
    if(!wsId) return null;
    var bucket = ensureState(state);
    bucket[wsId] = normalizeWorkspaceState(bucket[wsId], wsId, options);
    return bucket[wsId];
  }

  function getRows(state, workspaceId, options){
    var ws = ensureWorkspaceMatrix(state, workspaceId, options);
    return ws ? ws.rows : [];
  }

  function findRowByReference(state, workspaceId, referenceId, options){
    var refId = text(referenceId);
    if(!refId) return null;
    var rows = getRows(state, workspaceId, options);
    return rows.find(function(row){
      return text(row.referenceId).toLowerCase() === refId.toLowerCase();
    }) || null;
  }

  function findRowById(state, workspaceId, rowId, options){
    var id = text(rowId);
    if(!id) return null;
    var rows = getRows(state, workspaceId, options);
    return rows.find(function(row){ return row.id === id; }) || null;
  }

  function ensureRowForReference(state, workspaceId, reference, options){
    options = options || {};
    var uid = options.uid || function(){
      return 'mxr-' + Math.random().toString(36).slice(2, 11);
    };
    var ws = ensureWorkspaceMatrix(state, workspaceId, options);
    if(!ws) return null;
    var ref = reference && typeof reference === 'object'
      ? reference
      : { id: text(reference) };
    var referenceId = text(ref.id || ref.referenceId);
    if(!referenceId) return null;
    var existing = ws.rows.find(function(row){
      return text(row && row.referenceId).toLowerCase() === referenceId.toLowerCase();
    }) || null;
    if(existing){
      ws.dismissedReferenceIds = cloneArray(ws.dismissedReferenceIds).filter(function(id){
        return text(id).toLowerCase() !== referenceId.toLowerCase();
      });
      return { row: existing, created: false };
    }
    var now = Date.now();
    var row = normalizeRow({
      id: uid(),
      workspaceId: text(workspaceId),
      referenceId: referenceId,
      cells: defaultCells(),
      createdAt: now,
      updatedAt: now
    }, workspaceId, { uid: uid });
    ws.rows.push(row);
    ws.dismissedReferenceIds = cloneArray(ws.dismissedReferenceIds).filter(function(id){
      return text(id).toLowerCase() !== referenceId.toLowerCase();
    });
    ws.updatedAt = now;
    return { row: row, created: true };
  }

  function dismissReference(state, workspaceId, referenceId, options){
    var ws = ensureWorkspaceMatrix(state, workspaceId, options);
    var refId = text(referenceId);
    if(!ws || !refId) return false;
    var before = cloneArray(ws.dismissedReferenceIds).length;
    var next = cloneArray(ws.dismissedReferenceIds);
    if(next.map(function(id){ return text(id).toLowerCase(); }).indexOf(refId.toLowerCase()) < 0){
      next.push(refId);
    }
    ws.dismissedReferenceIds = uniqueArray(next);
    var changed = ws.dismissedReferenceIds.length !== before;
    if(changed) ws.updatedAt = Date.now();
    return changed;
  }

  function undismissReference(state, workspaceId, referenceId, options){
    var ws = ensureWorkspaceMatrix(state, workspaceId, options);
    var refId = text(referenceId);
    if(!ws || !refId) return false;
    var before = cloneArray(ws.dismissedReferenceIds).length;
    ws.dismissedReferenceIds = cloneArray(ws.dismissedReferenceIds).filter(function(id){
      return text(id).toLowerCase() !== refId.toLowerCase();
    });
    var changed = ws.dismissedReferenceIds.length !== before;
    if(changed) ws.updatedAt = Date.now();
    return changed;
  }

  function isReferenceDismissed(state, workspaceId, referenceId, options){
    var ws = ensureWorkspaceMatrix(state, workspaceId, options);
    var refId = text(referenceId);
    if(!ws || !refId) return false;
    return cloneArray(ws.dismissedReferenceIds).some(function(id){
      return text(id).toLowerCase() === refId.toLowerCase();
    });
  }

  function setCellText(state, workspaceId, rowId, columnKey, nextText, options){
    options = options || {};
    var column = text(columnKey);
    if(EDITABLE_COLUMN_KEYS.indexOf(column) < 0) return null;
    var row = findRowById(state, workspaceId, rowId, options);
    if(!row) return null;
    var cell = normalizeCell(row.cells[column]);
    cell.text = text(nextText);
    row.cells[column] = cell;
    row.updatedAt = Date.now();
    var ws = ensureWorkspaceMatrix(state, workspaceId, options);
    if(ws) ws.updatedAt = row.updatedAt;
    return row;
  }

  function appendNoteToCell(state, workspaceId, rowId, columnKey, noteId, noteText, options){
    options = options || {};
    var column = text(columnKey);
    if(EDITABLE_COLUMN_KEYS.indexOf(column) < 0) return null;
    var row = findRowById(state, workspaceId, rowId, options);
    if(!row) return null;
    var cell = normalizeCell(row.cells[column]);
    var nextNoteId = text(noteId);
    if(nextNoteId && cell.noteIds.indexOf(nextNoteId) < 0){
      cell.noteIds.push(nextNoteId);
    }
    var sourcePage = text(options.sourcePage || '');
    var sourceSnippet = text(options.sourceSnippet || '');
    if(sourcePage){
      cell.source = cell.source || { page: '', snippet: '', updatedAt: 0 };
      cell.source.page = sourcePage;
      if(sourceSnippet) cell.source.snippet = sourceSnippet;
      cell.source.updatedAt = Date.now();
    }else if(sourceSnippet){
      cell.source = cell.source || { page: '', snippet: '', updatedAt: 0 };
      cell.source.snippet = sourceSnippet;
      cell.source.updatedAt = Date.now();
    }
    var payload = text(noteText);
    if(payload){
      if(!cell.text){
        cell.text = payload;
      }else{
        var joiner = String(options.joiner || '\n');
        cell.text += joiner + payload;
      }
    }
    row.cells[column] = cell;
    row.updatedAt = Date.now();
    var ws = ensureWorkspaceMatrix(state, workspaceId, options);
    if(ws) ws.updatedAt = row.updatedAt;
    return row;
  }

  function setSelectedCell(state, workspaceId, rowId, columnKey, options){
    options = options || {};
    var ws = ensureWorkspaceMatrix(state, workspaceId, options);
    if(!ws) return null;
    var column = text(columnKey);
    if(MATRIX_COLUMNS.every(function(def){ return def.key !== column; })){
      ws.selectedCell = null;
      return null;
    }
    var id = text(rowId);
    if(!id){
      ws.selectedCell = null;
      return null;
    }
    ws.selectedCell = { rowId: id, columnKey: column };
    ws.updatedAt = Date.now();
    return ws.selectedCell;
  }

  function getSelectedCell(state, workspaceId, options){
    var ws = ensureWorkspaceMatrix(state, workspaceId, options);
    return ws ? ws.selectedCell : null;
  }

  function getCellLinkedNoteIds(state, workspaceId, rowId, columnKey, options){
    var column = text(columnKey);
    if(EDITABLE_COLUMN_KEYS.indexOf(column) < 0) return [];
    var row = findRowById(state, workspaceId, rowId, options);
    if(!row) return [];
    var cell = normalizeCell(row.cells[column]);
    return cloneArray(cell.noteIds);
  }

  function inferColumnFromNoteType(noteType){
    var key = text(noteType).toLowerCase();
    if(key === 'methodology') return 'method';
    if(key === 'finding') return 'findings';
    if(key === 'limitation') return 'limitations';
    if(key === 'summary') return 'purpose';
    if(key === 'paraphrase') return 'myNotes';
    if(key === 'direct_quote') return 'myNotes';
    if(key === 'personal_insight') return 'myNotes';
    return 'myNotes';
  }

  function applyAutoCellsToRow(state, workspaceId, rowId, autoCells, options){
    options = options || {};
    var row = findRowById(state, workspaceId, rowId, options);
    if(!row) return null;
    var source = autoCells && typeof autoCells === 'object' ? autoCells : {};
    var overwrite = !!options.overwrite;
    var changed = false;
    EDITABLE_COLUMN_KEYS.forEach(function(columnKey){
      var nextText = text(source[columnKey] || '');
      if(!nextText) return;
      var cell = normalizeCell(row.cells[columnKey]);
      if(!overwrite && text(cell.text)) return;
      if(text(cell.text) === nextText) return;
      cell.text = nextText;
      row.cells[columnKey] = cell;
      changed = true;
    });
    if(changed){
      row.updatedAt = Date.now();
      var ws = ensureWorkspaceMatrix(state, workspaceId, options);
      if(ws) ws.updatedAt = row.updatedAt;
    }
    return row;
  }

  function removeLinkedNoteFromRows(state, workspaceId, noteId, options){
    var ws = ensureWorkspaceMatrix(state, workspaceId, options);
    var needle = text(noteId);
    if(!ws || !needle) return false;
    var changed = false;
    ws.rows.forEach(function(row){
      EDITABLE_COLUMN_KEYS.forEach(function(columnKey){
        var cell = normalizeCell(row.cells[columnKey]);
        var nextIds = cell.noteIds.filter(function(entry){
          return String(entry || '') !== needle;
        });
        if(nextIds.length !== cell.noteIds.length){
          cell.noteIds = uniqueArray(nextIds);
          row.cells[columnKey] = cell;
          row.updatedAt = Date.now();
          changed = true;
        }
      });
    });
    if(changed) ws.updatedAt = Date.now();
    return changed;
  }

  function removeRow(state, workspaceId, rowId, options){
    var ws = ensureWorkspaceMatrix(state, workspaceId, options);
    if(!ws) return false;
    var id = text(rowId);
    if(!id) return false;
    var before = ws.rows.length;
    ws.rows = ws.rows.filter(function(row){ return row.id !== id; });
    if(ws.selectedCell && ws.selectedCell.rowId === id){
      ws.selectedCell = null;
    }
    var changed = ws.rows.length !== before;
    if(changed) ws.updatedAt = Date.now();
    return changed;
  }

  return {
    MATRIX_COLUMNS: MATRIX_COLUMNS,
    EDITABLE_COLUMN_KEYS: EDITABLE_COLUMN_KEYS,
    ensureState: ensureState,
    ensureWorkspaceMatrix: ensureWorkspaceMatrix,
    getRows: getRows,
    findRowByReference: findRowByReference,
    findRowById: findRowById,
    ensureRowForReference: ensureRowForReference,
    setCellText: setCellText,
    appendNoteToCell: appendNoteToCell,
    setSelectedCell: setSelectedCell,
    getSelectedCell: getSelectedCell,
    getCellLinkedNoteIds: getCellLinkedNoteIds,
    inferColumnFromNoteType: inferColumnFromNoteType,
    inferAutoCellsFromReference: inferAutoCellsFromReference,
    applyAutoCellsToRow: applyAutoCellsToRow,
    removeLinkedNoteFromRows: removeLinkedNoteFromRows,
    dismissReference: dismissReference,
    undismissReference: undismissReference,
    isReferenceDismissed: isReferenceDismissed,
    AUTO_FILL_PATTERNS: AUTO_FILL_PATTERNS,
    AUTO_FILL_KEYWORDS: AUTO_FILL_KEYWORDS,
    removeRow: removeRow
  };
});
