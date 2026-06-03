/**
 * Citation finder — supporting-sentence matching (pure, testable).
 *
 * Given the user's claim terms and a paper's text (abstract or OA full text),
 * find the sentence that best supports the claim by lexical term overlap. This
 * is the MVP matcher: it shows the user a candidate ORIGINAL sentence to verify
 * before citing (critical for academic integrity). A semantic (embedding)
 * matcher can replace this later for cross-language precision.
 */

const ABBREV = new Set(['vb', 'vs', 'örn', 'bkz', 'dr', 'prof', 'ed', 'eds', 'al', 'fig', 'no', 'p', 'pp']);

/** Split text into sentences (handles . ! ? … and trims; minimal abbreviation guard). */
export function splitSentences(text: string): string[] {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const parts: string[] = [];
  let buf = '';
  const tokens = raw.split(/([.!?…]+)/);
  for (let i = 0; i < tokens.length; i += 2) {
    const chunk = tokens[i] || '';
    const punct = tokens[i + 1] || '';
    buf += chunk + punct;
    const lastWord = chunk.trim().split(' ').pop()?.toLowerCase().replace(/[^a-zçğıöşü]/g, '') || '';
    const isAbbrev = ABBREV.has(lastWord) || /\b[a-zçğıöşü]$/.test(lastWord) === false && lastWord.length === 1;
    if (punct && !isAbbrev) {
      const s = buf.trim();
      if (s) parts.push(s);
      buf = '';
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

/** Fraction of distinct claim terms that appear in the sentence (0..1). */
export function termOverlapScore(claimTerms: string[], sentence: string): number {
  const terms = Array.from(new Set((claimTerms || []).map((t) => String(t).toLowerCase()).filter((t) => t.length > 2)));
  if (!terms.length) return 0;
  const hay = ' ' + String(sentence || '').toLowerCase() + ' ';
  let hits = 0;
  for (const t of terms) if (hay.includes(t)) hits++;
  return hits / terms.length;
}

export interface SupportingSentence {
  sentence: string;
  score: number;
  index: number;
}

/** Best supporting sentence in `text` for the given claim terms, or null. */
export function bestSupportingSentence(
  claimTerms: string[],
  text: string,
  minScore = 0.25
): SupportingSentence | null {
  const sentences = splitSentences(text);
  let best: SupportingSentence | null = null;
  for (let index = 0; index < sentences.length; index++) {
    const sentence = sentences[index];
    const score = termOverlapScore(claimTerms, sentence);
    if (score > 0 && (best === null || score > best.score)) {
      best = { sentence, score, index };
    }
  }
  return best !== null && best.score >= minScore ? best : null;
}
