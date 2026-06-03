/**
 * Citation finder — query building (pure, offline-testable).
 *
 * Turns a selected (Turkish) claim sentence into search queries for the
 * academic APIs. The "intelligence" of relevance is delegated to Crossref /
 * Semantic Scholar; here we only (a) pull the content terms out of the
 * sentence and (b) map known academic terms TR→EN so the English literature is
 * reachable. Unknown words are left as-is (a network translator fills the gap
 * in the search layer — see the adapters slice).
 */

// Common Turkish + English function words to drop from a query.
const STOPWORDS = new Set<string>([
  // tr
  've', 'veya', 'ile', 'bir', 'bu', 'şu', 'o', 'da', 'de', 'ki', 'mi', 'mı', 'mu', 'mü',
  'için', 'gibi', 'kadar', 'göre', 'ama', 'fakat', 'ancak', 'çünkü', 'eğer', 'ya', 'hem',
  'daha', 'çok', 'az', 'en', 'her', 'bazı', 'tüm', 'olan', 'olarak', 'oldu', 'olur', 'olmak',
  'ise', 'ne', 'nasıl', 'nedir', 'hangi', 'şey', 'kişinin', 'kişi', 'arasında', 'üzerinde',
  // en
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'be',
  'this', 'that', 'these', 'those', 'as', 'by', 'at', 'from', 'it', 'its', 'their', 'has', 'have'
]);

/**
 * Academic term glossary TR→EN. Multi-word entries are matched first so
 * "psikolojik iyi oluş" → "psychological well-being" (not two separate terms).
 * Extend freely — this is the high-precision layer for known terminology.
 */
export const TERM_GLOSSARY: Record<string, string> = {
  'psikolojik iyi oluş': 'psychological well-being',
  'öznel iyi oluş': 'subjective well-being',
  'iyi oluş': 'well-being',
  'bilişsel yük': 'cognitive load',
  'çalışma belleği': 'working memory',
  'öz yeterlik': 'self-efficacy',
  'öz düzenleme': 'self-regulation',
  'akademik başarı': 'academic achievement',
  'yaşam doyumu': 'life satisfaction',
  'duygusal zeka': 'emotional intelligence',
  'tükenmişlik': 'burnout',
  'kaygı': 'anxiety',
  'depresyon': 'depression',
  'motivasyon': 'motivation',
  'sosyal destek': 'social support',
  'baş etme': 'coping',
  'stres': 'stress',
  'dayanıklılık': 'resilience',
  'üst biliş': 'metacognition'
};

const WORD_SPLIT = /[^\p{L}\p{N}]+/u;

export function normalizeText(s: unknown): string {
  return String(s ?? '').toLocaleLowerCase('tr-TR').trim();
}

/** Content terms of a sentence (stopwords + 1-2 char tokens removed). */
export function extractKeyTerms(sentence: string): string[] {
  const norm = normalizeText(sentence);
  const out: string[] = [];
  for (const tok of norm.split(WORD_SPLIT)) {
    if (tok.length <= 2) continue;
    if (STOPWORDS.has(tok)) continue;
    out.push(tok);
  }
  return out;
}

/**
 * Build an English-leaning query string by replacing known glossary terms
 * (multi-word first) and keeping the remaining content words. Unknown Turkish
 * words stay (the network translator handles them later). Returns a space-
 * joined query plus the list of glossary hits.
 */
export function buildEnglishQuery(sentence: string): { query: string; mappedTerms: string[]; unmapped: string[] } {
  let working = normalizeText(sentence);
  const mapped: string[] = [];
  // Replace multi-word glossary entries first (longest key first).
  const keys = Object.keys(TERM_GLOSSARY).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (working.includes(key)) {
      working = working.split(key).join(` ${TERM_GLOSSARY[key]} `);
      mapped.push(TERM_GLOSSARY[key]);
    }
  }
  const terms: string[] = [];
  const unmapped: string[] = [];
  for (const tok of working.split(WORD_SPLIT)) {
    if (!tok || tok.length <= 2 || STOPWORDS.has(tok)) continue;
    terms.push(tok);
    // a leftover Turkish token (contains a Turkish-specific letter or isn't a mapped english term)
    if (/[çğıöşü]/.test(tok)) unmapped.push(tok);
  }
  // de-dupe, preserve order
  const seen = new Set<string>();
  const query = terms.filter((t) => (seen.has(t) ? false : (seen.add(t), true))).join(' ');
  return { query, mappedTerms: Array.from(new Set(mapped)), unmapped: Array.from(new Set(unmapped)) };
}
