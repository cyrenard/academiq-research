import { describe, it, expect } from 'vitest';
import { extractKeyTerms, buildEnglishQuery, TERM_GLOSSARY } from './query';
import { scoreCandidate, rankCandidates, mergeCandidates, filterByCoverage, type PaperCandidate } from './ranking';
import { splitSentences, termOverlapScore, weightedOverlapScore, termWeight, bestSupportingSentence } from './sentence-match';

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

  it('filterByCoverage drops off-topic candidates but honours the safety net', () => {
    const c = (id: string, cov: number): PaperCandidate => ({ id, title: id, authors: [], termCoverage: cov });
    // 6 candidates, 2 off-topic → with keepMin default 5 there are 4 on-topic (<5) → keep ALL
    const six = [c('a', 0.9), c('b', 0.5), c('c', 0.02), c('d', 0.4), c('e', 0.01), c('f', 0.3)];
    expect(filterByCoverage(six)).toHaveLength(6); // safety net: fewer than 5 on-topic
    // with a low keepMin the off-topic ones are dropped
    expect(filterByCoverage(six, { keepMin: 2 }).map((x) => x.id)).toEqual(['a', 'b', 'd', 'f']);
    // unknown coverage is never dropped
    expect(filterByCoverage([c('x', 0.0), { id: 'y', title: 'y', authors: [] }], { keepMin: 1 }).map((x) => x.id)).toEqual(['y']);
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

  it('termWeight: phrases > long words > short words', () => {
    expect(termWeight('cognitive load')).toBe(4); // multi-word phrase
    expect(termWeight('cognitive')).toBe(2);      // long word
    expect(termWeight('learn')).toBe(1.5);
    expect(termWeight('age')).toBe(1);
  });

  it('weightedOverlapScore: matches hyphenated phrases after normalization', () => {
    // "well-being" (term, hyphen) vs "well being" (sentence, normalized) must match.
    const s = weightedOverlapScore(['psychological well-being'], 'It improves psychological well being.');
    expect(s).toBeCloseTo(1, 5);
  });

  it('weightedOverlapScore: a rare on-topic phrase outweighs shared filler', () => {
    const terms = ['cognitive load', 'student', 'study'];
    const onTopic = weightedOverlapScore(terms, 'Cognitive load was measured in the study.'); // phrase(3)+study(1.5)
    const fillerOnly = weightedOverlapScore(terms, 'The study and the student met.');          // study+student only
    expect(onTopic).toBeGreaterThan(fillerOnly);
  });

  it('bestSupportingSentence prefers the sentence carrying the rare phrase', () => {
    const abstract =
      'The study involved many students. ' +
      'Cognitive load was the strongest predictor of outcomes.';
    const best = bestSupportingSentence(['cognitive load', 'student', 'study'], abstract);
    expect(best!.sentence).toContain('Cognitive load');
  });
});
