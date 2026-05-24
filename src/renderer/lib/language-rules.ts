import type { SpellMatch } from './spellcheck';

type RuleMatch = Omit<SpellMatch, 'category'> & { category?: string };

const LETTER = 'A-Za-z\\u00c7\\u011e\\u0130\\u00d6\\u015e\\u00dc\\u00e7\\u011f\\u0131\\u00f6\\u015f\\u00fc';
const WORD_BOUNDARY_LEFT = `(^|[^${LETTER}])`;
const WORD_BOUNDARY_RIGHT = `(?=$|[^${LETTER}])`;

const COMMON_REPLACEMENTS: Array<{ wrong: string; replacement: string; ruleId: string }> = [
  { wrong: 'her\\u015fey', replacement: 'her \\u015fey', ruleId: 'AQ_TR_HER_SEY' },
  { wrong: 'hersey', replacement: 'her \\u015fey', ruleId: 'AQ_TR_HER_SEY_ASCII' },
  { wrong: 'bir\\u015fey', replacement: 'bir \\u015fey', ruleId: 'AQ_TR_BIR_SEY' },
  { wrong: 'birsey', replacement: 'bir \\u015fey', ruleId: 'AQ_TR_BIR_SEY_ASCII' },
  { wrong: 'hi\\u00e7bir\\u015fey', replacement: 'hi\\u00e7bir \\u015fey', ruleId: 'AQ_TR_HICBIR_SEY' },
  { wrong: 'hicbirsey', replacement: 'hi\\u00e7bir \\u015fey', ruleId: 'AQ_TR_HICBIR_SEY_ASCII' },
  { wrong: 'hi\\u00e7 bir', replacement: 'hi\\u00e7bir', ruleId: 'AQ_TR_HICBIR' },
  { wrong: 'hic bir', replacement: 'hi\\u00e7bir', ruleId: 'AQ_TR_HICBIR_ASCII' },
  { wrong: 'her hangi', replacement: 'herhangi', ruleId: 'AQ_TR_HERHANGI' },
  { wrong: '\\u015fuan', replacement: '\\u015fu an', ruleId: 'AQ_TR_SU_AN' },
  { wrong: 'suan', replacement: '\\u015fu an', ruleId: 'AQ_TR_SU_AN_ASCII' },
  { wrong: '\\u015fuanki', replacement: '\\u015fu anki', ruleId: 'AQ_TR_SU_ANKI' },
  { wrong: 'suanki', replacement: '\\u015fu anki', ruleId: 'AQ_TR_SU_ANKI_ASCII' },
  { wrong: 'yada', replacement: 'ya da', ruleId: 'AQ_TR_YA_DA' },
  { wrong: 'tabiki', replacement: 'tabii ki', ruleId: 'AQ_TR_TABII_KI' },
  { wrong: 'yan\\u0131s\\u0131ra', replacement: 'yan\\u0131 s\\u0131ra', ruleId: 'AQ_TR_YANI_SIRA' },
  { wrong: 'yanisira', replacement: 'yan\\u0131 s\\u0131ra', ruleId: 'AQ_TR_YANI_SIRA_ASCII' },
  { wrong: 'aras\\u0131ra', replacement: 'ara s\\u0131ra', ruleId: 'AQ_TR_ARA_SIRA' },
  { wrong: 'arasira', replacement: 'ara s\\u0131ra', ruleId: 'AQ_TR_ARA_SIRA_ASCII' },
  { wrong: 'yanyana', replacement: 'yan yana', ruleId: 'AQ_TR_YAN_YANA' },
  { wrong: 'bir ka\\u00e7', replacement: 'birka\\u00e7', ruleId: 'AQ_TR_BIRKAC' },
  { wrong: 'bir \\u00e7ok', replacement: 'bir\\u00e7ok', ruleId: 'AQ_TR_BIRCOK' },
  { wrong: 'pek\\u00e7ok', replacement: 'pek \\u00e7ok', ruleId: 'AQ_TR_PEK_COK' },
  { wrong: 'git gide', replacement: 'gitgide', ruleId: 'AQ_TR_GITGIDE' },
  { wrong: 'rast gele', replacement: 'rastgele', ruleId: 'AQ_TR_RASTGELE' },
  { wrong: '\\u00f6n g\\u00f6r\\u00fclen', replacement: '\\u00f6ng\\u00f6r\\u00fclen', ruleId: 'AQ_TR_ONGORULEN' },
  { wrong: 'var say\\u0131m', replacement: 'varsay\\u0131m', ruleId: 'AQ_TR_VARSAYIM' },
  { wrong: 'farketmek', replacement: 'fark etmek', ruleId: 'AQ_TR_FARK_ETMEK' },
  { wrong: 'farketti', replacement: 'fark etti', ruleId: 'AQ_TR_FARK_ETTI' },
  { wrong: 'terketmek', replacement: 'terk etmek', ruleId: 'AQ_TR_TERK_ETMEK' },
  { wrong: 'malesef', replacement: 'maalesef', ruleId: 'AQ_TR_MAALESEF' },
  { wrong: 'orjinal', replacement: 'orijinal', ruleId: 'AQ_TR_ORIJINAL' },
  { wrong: 'mataryal', replacement: 'materyal', ruleId: 'AQ_TR_MATERYAL' },
  { wrong: 'entellekt\\u00fcel', replacement: 'entelekt\\u00fcel', ruleId: 'AQ_TR_ENTELEKTUEL' },
  { wrong: '\\u00fcnvan', replacement: 'unvan', ruleId: 'AQ_TR_UNVAN' },
  { wrong: 'klavuz', replacement: 'k\\u0131lavuz', ruleId: 'AQ_TR_KILAVUZ' },
  { wrong: '\\u015farz', replacement: '\\u015farj', ruleId: 'AQ_TR_SARJ' }
].map((item) => ({
  wrong: decodeEscapes(item.wrong),
  replacement: decodeEscapes(item.replacement),
  ruleId: item.ruleId
}));

const ACADEMIC_STYLE_REPLACEMENTS: Array<{ wrong: string; replacement: string; ruleId: string }> = [
  { wrong: 'vs', replacement: 'vb.', ruleId: 'AQ_TR_STYLE_VS' },
  { wrong: 'v.s.', replacement: 'vb.', ruleId: 'AQ_TR_STYLE_VS_DOTTED' },
  { wrong: 'v.b.', replacement: 'vb.', ruleId: 'AQ_TR_STYLE_VB_DOTTED' },
  { wrong: 'mesela', replacement: '\\u00f6rne\\u011fin', ruleId: 'AQ_TR_STYLE_MESELA' },
  { wrong: '\\u00f6rnek olarak', replacement: '\\u00f6rne\\u011fin', ruleId: 'AQ_TR_STYLE_ORNEK_OLARAK' },
  { wrong: 'bu y\\u00fczden', replacement: 'bu nedenle', ruleId: 'AQ_TR_STYLE_BU_YUZDEN' },
  { wrong: 'bundan dolay\\u0131', replacement: 'bu nedenle', ruleId: 'AQ_TR_STYLE_BUNDAN_DOLAYI' },
  { wrong: 'bence', replacement: 'bu \\u00e7al\\u0131\\u015fmada', ruleId: 'AQ_TR_STYLE_BENCE' },
  { wrong: 'bizce', replacement: 'bu \\u00e7al\\u0131\\u015fmada', ruleId: 'AQ_TR_STYLE_BIZCE' },
  { wrong: 'tablo da', replacement: 'tabloda', ruleId: 'AQ_TR_TABLE_DA_SAFE' },
  { wrong: '\\u015fekil de', replacement: '\\u015fekilde', ruleId: 'AQ_TR_FIGURE_DE_SAFE' }
].map((item) => ({
  wrong: decodeEscapes(item.wrong),
  replacement: decodeEscapes(item.replacement),
  ruleId: item.ruleId
}));

function decodeEscapes(value: string): string {
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function withCase(source: string, replacement: string): string {
  if (!source) return replacement;
  if (source === source.toLocaleUpperCase('tr-TR')) return replacement.toLocaleUpperCase('tr-TR');
  if (source[0] === source[0]?.toLocaleUpperCase('tr-TR')) {
    return replacement[0]?.toLocaleUpperCase('tr-TR') + replacement.slice(1);
  }
  return replacement;
}

function pushMatch(out: RuleMatch[], match: RuleMatch): void {
  if (match.length <= 0) return;
  out.push({ ...match, category: match.category || 'LANGUAGE_RULE' });
}

function addCommonReplacementRules(text: string, out: RuleMatch[]): void {
  for (const item of COMMON_REPLACEMENTS) {
    const escaped = item.wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const re = new RegExp(`${WORD_BOUNDARY_LEFT}(${escaped})${WORD_BOUNDARY_RIGHT}`, 'giu');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const prefix = m[1] || '';
      const found = m[2] || '';
      pushMatch(out, {
        offset: m.index + prefix.length,
        length: found.length,
        text: found,
        message: 'Turkce yazim onerisi',
        replacements: [{ value: withCase(found, item.replacement) }],
        ruleId: item.ruleId
      });
    }
  }
}

function addRepeatedWordRules(text: string, out: RuleMatch[]): void {
  const re = new RegExp(`\\b([${LETTER}]{2,})(\\s+\\1\\b)+`, 'giu');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    pushMatch(out, {
      offset: m.index,
      length: m[0].length,
      text: m[0],
      message: 'Tekrar eden kelime',
      replacements: [{ value: m[1] || '' }],
      ruleId: 'AQ_TR_REPEATED_WORD'
    });
  }
}

function addSpacingRules(text: string, out: RuleMatch[]): void {
  let m: RegExpExecArray | null;
  const beforePunctuation = /[ \t]+([,.;:!?])/g;
  while ((m = beforePunctuation.exec(text)) !== null) {
    pushMatch(out, {
      offset: m.index,
      length: m[0].length,
      text: m[0],
      message: 'Noktalama isaretinden once bosluk olmamali',
      replacements: [{ value: m[1] || '' }],
      ruleId: 'AQ_TR_SPACE_BEFORE_PUNCTUATION'
    });
  }

  const missingSpaceAfterPunctuation = /([,.;:!?])(?=[^\s\d,.;:!?)\]}])/g;
  while ((m = missingSpaceAfterPunctuation.exec(text)) !== null) {
    const punctuation = m[1] || '';
    pushMatch(out, {
      offset: m.index,
      length: punctuation.length,
      text: punctuation,
      message: 'Noktalama isaretinden sonra bosluk onerilir',
      replacements: [{ value: `${punctuation} ` }],
      ruleId: 'AQ_TR_SPACE_AFTER_PUNCTUATION'
    });
  }

  const multiSpace = / {2,}/g;
  while ((m = multiSpace.exec(text)) !== null) {
    pushMatch(out, {
      offset: m.index,
      length: m[0].length,
      text: m[0],
      message: 'Birden fazla bosluk',
      replacements: [{ value: ' ' }],
      ruleId: 'AQ_TR_MULTIPLE_SPACES'
    });
  }
}

function addPunctuationCleanupRules(text: string, out: RuleMatch[]): void {
  const rules: Array<{ re: RegExp; replacement: string; message: string; ruleId: string }> = [
    { re: /!!+/g, replacement: '!', message: 'Akademik metinde tek unlem onerilir', ruleId: 'AQ_TR_REPEATED_EXCLAMATION' },
    { re: /\?\?+/g, replacement: '?', message: 'Akademik metinde tek soru isareti onerilir', ruleId: 'AQ_TR_REPEATED_QUESTION' },
    { re: /,,+/g, replacement: ',', message: 'Tek virgul kullanilmali', ruleId: 'AQ_TR_REPEATED_COMMA' },
    { re: /,\./g, replacement: '.', message: 'Virgul ve nokta birlikte kullanilmamali', ruleId: 'AQ_TR_COMMA_DOT' },
    { re: /\.,/g, replacement: '.', message: 'Nokta ve virgul birlikte kullanilmamali', ruleId: 'AQ_TR_DOT_COMMA' }
  ];
  for (const rule of rules) {
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text)) !== null) {
      pushMatch(out, {
        offset: m.index,
        length: m[0].length,
        text: m[0],
        message: rule.message,
        replacements: [{ value: rule.replacement }],
        ruleId: rule.ruleId
      });
    }
  }
}

function addAcademicAbbreviationRules(text: string, out: RuleMatch[]): void {
  const rules: Array<{ re: RegExp; replacement: string; ruleId: string }> = [
    { re: new RegExp(`${WORD_BOUNDARY_LEFT}(vd)(?=\\s|,|;|\\)|\\]|$)`, 'giu'), replacement: 'vd.', ruleId: 'AQ_TR_ABBR_VD_DOT' },
    { re: new RegExp(`${WORD_BOUNDARY_LEFT}(\u00f6rn)(?=\\s|,|;|\\)|\\]|$)`, 'giu'), replacement: '\u00f6rn.', ruleId: 'AQ_TR_ABBR_ORN_DOT' },
    { re: new RegExp(`${WORD_BOUNDARY_LEFT}(bkz)(?=\\s|,|;|\\)|\\]|$)`, 'giu'), replacement: 'bkz.', ruleId: 'AQ_TR_ABBR_BKZ_DOT' }
  ];
  for (const rule of rules) {
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text)) !== null) {
      const prefix = m[1] || '';
      const found = m[2] || '';
      pushMatch(out, {
        offset: m.index + prefix.length,
        length: found.length,
        text: found,
        message: 'Akademik kisaltmada nokta onerilir',
        replacements: [{ value: withCase(found, rule.replacement) }],
        ruleId: rule.ruleId
      });
    }
  }
}

function addAcademicStyleRules(text: string, out: RuleMatch[]): void {
  for (const item of ACADEMIC_STYLE_REPLACEMENTS) {
    const escaped = item.wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const re = new RegExp(`${WORD_BOUNDARY_LEFT}(${escaped})${WORD_BOUNDARY_RIGHT}`, 'giu');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const prefix = m[1] || '';
      const found = m[2] || '';
      pushMatch(out, {
        offset: m.index + prefix.length,
        length: found.length,
        text: found,
        message: 'Akademik uslup onerisi',
        replacements: [{ value: withCase(found, item.replacement) }],
        ruleId: item.ruleId,
        category: 'WRITING_STYLE'
      });
    }
  }
}

function addAcademicFormatRules(text: string, out: RuleMatch[]): void {
  let m: RegExpExecArray | null;
  const figureTableNoSpace = new RegExp(`${WORD_BOUNDARY_LEFT}((tablo|\\u015fekil|sekil)(\\d+))${WORD_BOUNDARY_RIGHT}`, 'giu');
  while ((m = figureTableNoSpace.exec(text)) !== null) {
    const prefix = m[1] || '';
    const found = m[2] || '';
    const label = m[3] || '';
    const num = m[4] || '';
    pushMatch(out, {
      offset: m.index + prefix.length,
      length: found.length,
      text: found,
      message: 'Tablo/Sekil numarasindan once bosluk onerilir',
      replacements: [{ value: `${withCase(label, label)} ${num}` }],
      ruleId: 'AQ_TR_ACADEMIC_OBJECT_SPACE',
      category: 'ACADEMIC_FORMAT'
    });
  }

  const statisticSpacing = /\b([npqrtF])\s*(=|<|>|<=|>=)\s*(\d+(?:[.,]\d+)?|\.\d+)\b/g;
  while ((m = statisticSpacing.exec(text)) !== null) {
    const symbol = m[1] || '';
    const op = m[2] || '';
    const value = m[3] || '';
    const replacement = `${symbol} ${op} ${value}`;
    if (m[0] === replacement) continue;
    pushMatch(out, {
      offset: m.index,
      length: m[0].length,
      text: m[0],
      message: 'Istatistiksel ifade bicimi onerisi',
      replacements: [{ value: replacement }],
      ruleId: 'AQ_TR_STATISTIC_SPACING',
      category: 'ACADEMIC_FORMAT'
    });
  }

  const citationYearComma = /\(([A-ZÇĞİÖŞÜ][^()\n]{1,80}),(\d{4}[a-z]?)\)/gu;
  while ((m = citationYearComma.exec(text)) !== null) {
    pushMatch(out, {
      offset: m.index,
      length: m[0].length,
      text: m[0],
      message: 'Atifta yildan once virgulden sonra bosluk onerilir',
      replacements: [{ value: `(${m[1]}, ${m[2]})` }],
      ruleId: 'AQ_TR_CITATION_COMMA_SPACE',
      category: 'ACADEMIC_FORMAT'
    });
  }
}

function overlaps(a: SpellMatch, b: SpellMatch): boolean {
  return a.offset < b.offset + b.length && b.offset < a.offset + a.length;
}

export function checkLanguageRules(text: string): SpellMatch[] {
  const source = String(text || '');
  if (!source.trim()) return [];
  const matches: RuleMatch[] = [];
  addCommonReplacementRules(source, matches);
  addRepeatedWordRules(source, matches);
  addSpacingRules(source, matches);
  addPunctuationCleanupRules(source, matches);
  addAcademicAbbreviationRules(source, matches);
  addAcademicStyleRules(source, matches);
  addAcademicFormatRules(source, matches);

  const sorted = matches
    .map((match) => ({ ...match, category: match.category || 'LANGUAGE_RULE' }))
    .sort((a, b) => a.offset - b.offset || b.length - a.length || a.ruleId.localeCompare(b.ruleId));

  const out: SpellMatch[] = [];
  for (const match of sorted) {
    if (out.some((existing) => overlaps(existing, match))) continue;
    out.push(match);
  }
  return out;
}
