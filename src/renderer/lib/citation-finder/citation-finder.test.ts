import { describe, it, expect } from 'vitest';
import { extractKeyTerms, buildEnglishQuery, TERM_GLOSSARY } from './query';
import { scoreCandidate, rankCandidates, mergeCandidates, type PaperCandidate } from './ranking';
import { splitSentences, termOverlapScore, bestSupportingSentence } from './sentence-match';

const CLAIM = 'Bilişsel yük kişinin psikolojik iyi oluşunu etkiler.';

describe('query: extractKeyTerms', () => {
  it('drops stopwords + short tokens, keeps content words', () => {
    const terms = extractKeyTerms(CLAIM);
    expect(terms).toContain('bilişsel');
    expect(terms).toContain('yük');
    expect(terms).toContain('psikolojik');
    expect(terms).not.toContain('kişinin'); // stopword
    expect(terms.every((t) => t.length > 2)).toBe(true);
  });
});

describe('query: buildEnglishQuery (glossary mapping)', () => {
  it('maps multi-word academic terms TR→EN (longest first)', () => {
    const { query, mappedTerms } = buildEnglishQuery(CLAIM);
    expect(mappedTerms).toContain('cognitive load');
    expect(mappedTerms).toContain('psychological well-being');
    expect(query).toContain('cognitive');
    expect(query).toContain('psychological');
  });

  it('glossary has the example terms', () => {
    expect(TERM_GLOSSARY['bilişsel yük']).toBe('cognitive load');
    expect(TERM_GLOSSARY['psikolojik iyi oluş']).toBe('psychological well-being');
  });

  it('reports unmapped Turkish leftovers for the network translator', () => {
    const { unmapped } = buildEnglishQuery('Bağlanma kuramı önemlidir');
    expect(unmapped.length).toBeGreaterThan(0); // "bağlanma" / "kuramı" not in glossary
  });
});

describe('ranking: scoreCandidate / rankCandidates', () => {
  const base: PaperCandidate = { id: 'x', title: 't', authors: [], apiRank: 0 };

  it('rewards citations, OA, Q1, recency', () => {
    const high = scoreCandidate({ ...base, citationCount: 2000, influentialCitationCount: 200, isOpenAccess: true, quartile: 'Q1', year: 2023 }, { currentYear: 2025 });
    const low = scoreCandidate({ ...base, citationCount: 1, quartile: 'Q4', year: 1995, apiRank: 8 }, { currentYear: 2025 });
    expect(high).toBeGreaterThan(low);
  });

  it('ranks the strong candidate first', () => {
    const cands: PaperCandidate[] = [
      { id: 'weak', title: 'w', authors: [], apiRank: 3, citationCount: 2, year: 2000 },
      { id: 'strong', title: 's', authors: [], apiRank: 1, citationCount: 1500, influentialCitationCount: 150, isOpenAccess: true, quartile: 'Q1', year: 2022 }
    ];
    expect(rankCandidates(cands, { currentYear: 2025 })[0].id).toBe('strong');
  });

  it('mergeCandidates de-dupes by DOI and keeps the richer record', () => {
    const a: PaperCandidate = { id: '1', title: 'T', authors: [], doi: '10.1/x', citationCount: 10 };
    const b: PaperCandidate = { id: '2', title: 'T', authors: [], doi: '10.1/X', citationCount: 50, isOpenAccess: true, oaPdfUrl: 'u' };
    const merged = mergeCandidates([a], [b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].citationCount).toBe(50);
    expect(merged[0].isOpenAccess).toBe(true);
  });
});

describe('sentence-match', () => {
  it('splits sentences on . ! ? …', () => {
    expect(splitSentences('Bir cümle. İkinci cümle! Üçüncü?')).toHaveLength(3);
  });

  it('termOverlapScore is the fraction of claim terms present', () => {
    expect(termOverlapScore(['cognitive', 'load', 'well-being'], 'Cognitive load affects well-being.')).toBeCloseTo(1, 5);
    expect(termOverlapScore(['cognitive', 'load'], 'Unrelated sentence about cats.')).toBe(0);
  });

  it('bestSupportingSentence picks the most overlapping sentence', () => {
    const abstract =
      'This paper reviews motivation theories. ' +
      'We found that cognitive load reduces psychological well-being in students. ' +
      'Future work is needed.';
    const best = bestSupportingSentence(['cognitive', 'load', 'psychological', 'well-being'], abstract);
    expect(best).not.toBeNull();
    expect(best!.sentence).toContain('cognitive load reduces psychological well-being');
  });

  it('returns null when nothing meets the threshold', () => {
    expect(bestSupportingSentence(['quantum', 'entanglement'], 'A study about gardening and soil.')).toBeNull();
  });
});
