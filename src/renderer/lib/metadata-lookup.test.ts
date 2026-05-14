import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeDoiForMetadata,
  normalizeLookupText,
  lookupTokens,
  compactLookupText,
  ngramSimilarity,
  titleSimilarity,
  authorLastNames,
  authorOverlapScore,
  yearFromCrossrefDate,
  firstMetadataString,
  mapCrossrefWork,
  mapOpenAlexWork,
  mapSemanticScholarWork,
  scoreMetadataCandidate,
  isWeakMetadataValue,
  metadataYear,
  metadataAuthors,
  isPlaceholderTitleForRef,
  applyFetchedMetadataToRef,
  _resetMetadataLookupCaches
} from './metadata-lookup';

beforeEach(() => {
  _resetMetadataLookupCaches();
});

describe('normalizeDoiForMetadata', () => {
  it('strips doi: prefix and lowercases', () => {
    expect(normalizeDoiForMetadata('doi:10.1234/AbC')).toBe('10.1234/abc');
  });
  it('strips https://doi.org/ prefix', () => {
    expect(normalizeDoiForMetadata('https://doi.org/10.1234/abc')).toBe('10.1234/abc');
    expect(normalizeDoiForMetadata('https://dx.doi.org/10.1234/abc')).toBe('10.1234/abc');
  });
  it('extracts DOI from surrounding text', () => {
    expect(normalizeDoiForMetadata('cf. 10.1234/abc, p. 12.')).toBe('10.1234/abc');
  });
  it('strips trailing punctuation', () => {
    expect(normalizeDoiForMetadata('10.1234/abc).')).toBe('10.1234/abc');
  });
  it('returns empty for non-DOI input', () => {
    expect(normalizeDoiForMetadata('')).toBe('');
    expect(normalizeDoiForMetadata(null)).toBe('');
  });
});

describe('normalizeLookupText', () => {
  it('lowercases (Turkish locale) + strips diacritics + collapses punct', () => {
    // Turkish locale: capital I → ı (dotless), Ü/Ç → u/c after diacritic strip.
    // Note: ı (U+0131) is its own letter, NOT decomposed to i.
    const result = normalizeLookupText('İstanbul Üniversitesi - Tez Çalışması!');
    expect(result).toContain('stanbul');
    expect(result).toContain('universitesi');
    expect(result).toContain('tez');
    expect(result).toContain('cal');
    expect(result).not.toContain('!');
    expect(result).not.toContain('-');
  });
  it('returns empty for nullish input', () => {
    expect(normalizeLookupText(null)).toBe('');
  });
});

describe('lookupTokens', () => {
  it('removes stop words and short tokens', () => {
    const tokens = lookupTokens('A study with the article and for using bir ve ile');
    expect(tokens.length).toBe(0);
  });
  it('preserves content words (note Turkish locale: capital I → ı)', () => {
    // 'Neural', 'Network', 'Medical', 'Detection' all start with consonants.
    // 'Imaging' becomes 'ımaging' because Turkish locale lowercases I → ı.
    const tokens = lookupTokens('Neural Network for Medical Imaging Detection');
    expect(tokens).toContain('neural');
    expect(tokens).toContain('network');
    expect(tokens).toContain('medical');
    expect(tokens).toContain('detection');
    // The dotless-i form for "Imaging":
    expect(tokens).toContain('ımaging');
  });
});

describe('compactLookupText', () => {
  it('removes whitespace + diacritics', () => {
    expect(compactLookupText('Hello  World'))
      .toBe('helloworld');
  });
});

describe('ngramSimilarity', () => {
  it('returns 1 for identical inputs', () => {
    expect(ngramSimilarity('hello', 'hello')).toBe(1);
  });
  it('returns 0 for empty input', () => {
    expect(ngramSimilarity('', 'hello')).toBe(0);
    expect(ngramSimilarity('hello', '')).toBe(0);
  });
  it('returns 0.92 for substring containment', () => {
    expect(ngramSimilarity('neural networks abc', 'neural networks abc xyz'))
      .toBe(0.92);
  });
  it('scales with overlap', () => {
    const high = ngramSimilarity('quick brown fox', 'quick brown dog');
    const low = ngramSimilarity('quick brown fox', 'completely different');
    expect(high).toBeGreaterThan(low);
  });
});

describe('titleSimilarity', () => {
  it('high score for near-identical titles', () => {
    const s = titleSimilarity(
      'Neural Networks for Medical Image Classification',
      'Neural Networks for Medical Image Classification'
    );
    expect(s).toBeGreaterThan(0.95);
  });
  it('reasonable score for paraphrase', () => {
    const s = titleSimilarity(
      'Neural Networks for Medical Image Classification',
      'Medical Image Classification using Neural Networks'
    );
    expect(s).toBeGreaterThan(0.5);
  });
  it('low score for unrelated', () => {
    expect(titleSimilarity('quantum computing', 'baking sourdough bread')).toBeLessThan(0.3);
  });
});

describe('authorLastNames', () => {
  it('extracts surnames from "Last, First" format', () => {
    expect(authorLastNames(['Smith, John', 'Doe, Jane']))
      .toEqual(['smith', 'doe']);
  });
  it('extracts last word as surname for "First Last" format', () => {
    expect(authorLastNames(['John Smith', 'Jane Doe']))
      .toEqual(['smith', 'doe']);
  });
  it('handles semicolon/comma separated strings', () => {
    expect(authorLastNames('John Smith; Jane Doe'))
      .toEqual(['smith', 'doe']);
  });
});

describe('authorOverlapScore', () => {
  it('returns 1 for full overlap', () => {
    expect(authorOverlapScore(['Smith, J.', 'Doe, J.'], ['Smith, John', 'Doe, Jane']))
      .toBe(1);
  });
  it('returns 0 for no overlap', () => {
    expect(authorOverlapScore(['Smith, J.'], ['Jones, K.'])).toBe(0);
  });
  it('returns 0 for empty', () => {
    expect(authorOverlapScore([], ['Smith'])).toBe(0);
  });
});

describe('yearFromCrossrefDate', () => {
  it('extracts year from CrossRef date-parts', () => {
    expect(yearFromCrossrefDate({ 'date-parts': [[2023, 5, 12]] })).toBe('2023');
  });
  it('returns empty for missing parts', () => {
    expect(yearFromCrossrefDate({})).toBe('');
    expect(yearFromCrossrefDate(null)).toBe('');
  });
});

describe('firstMetadataString', () => {
  it('returns first truthy string', () => {
    expect(firstMetadataString('', null, 'Nature', 'Science')).toBe('Nature');
  });
  it('drills into objects via name/display_name/title', () => {
    expect(firstMetadataString({ name: 'Nature' })).toBe('Nature');
    expect(firstMetadataString({ display_name: 'OpenAlex Journal' })).toBe('OpenAlex Journal');
  });
  it('drills into arrays', () => {
    expect(firstMetadataString([{ name: 'Nature' }])).toBe('Nature');
  });
  it('returns empty when all empty', () => {
    expect(firstMetadataString(null, '', undefined)).toBe('');
  });
});

describe('mapCrossrefWork', () => {
  it('normalizes a CrossRef work to internal ref shape', () => {
    const work = {
      DOI: '10.1234/abc',
      title: ['The Title'],
      author: [{ family: 'Smith', given: 'John' }],
      'published-print': { 'date-parts': [[2020]] },
      'container-title': ['Nature'],
      volume: '42',
      page: '100-120'
    };
    const ref = mapCrossrefWork(work);
    expect(ref.title).toBe('The Title');
    expect(ref.authors).toEqual(['Smith, John']);
    expect(ref.year).toBe('2020');
    expect(ref.doi).toBe('10.1234/abc');
    expect(ref.journal).toBe('Nature');
    expect(ref.volume).toBe('42');
    expect(ref.fp).toBe('100');
    expect(ref.lp).toBe('120');
    expect(ref.url).toBe('https://doi.org/10.1234/abc');
  });
});

describe('mapOpenAlexWork', () => {
  it('normalizes an OpenAlex work', () => {
    const ref = mapOpenAlexWork({
      doi: 'https://doi.org/10.1/x',
      title: 'The Title',
      authorships: [{ author: { display_name: 'Smith, J' } }],
      publication_year: 2021,
      primary_location: { source: { display_name: 'Cell' }, pdf_url: 'https://x.com/a.pdf' }
    });
    expect(ref.doi).toBe('10.1/x');
    expect(ref.title).toBe('The Title');
    expect(ref.year).toBe('2021');
    expect(ref.journal).toBe('Cell');
    expect(ref.pdfUrl).toBe('https://x.com/a.pdf');
  });
});

describe('mapSemanticScholarWork', () => {
  it('normalizes a Semantic Scholar paper', () => {
    const ref = mapSemanticScholarWork({
      externalIds: { DOI: '10.1/y' },
      title: 'Title',
      authors: [{ name: 'Jane Doe' }],
      year: 2019,
      venue: 'NeurIPS',
      openAccessPdf: { url: 'https://oa.example/a.pdf' }
    });
    expect(ref.doi).toBe('10.1/y');
    expect(ref.year).toBe('2019');
    expect(ref.journal).toBe('NeurIPS');
    expect(ref.authors).toEqual(['Jane Doe']);
    expect(ref.pdfUrl).toBe('https://oa.example/a.pdf');
  });
});

describe('scoreMetadataCandidate', () => {
  it('high score with title + author + year match', () => {
    const seed = { title: 'Neural Networks for X', authors: ['Smith, John'], year: '2020' };
    const cand = { title: 'Neural Networks for X', authors: ['Smith, J.'], year: '2020', doi: '10.1/abc' };
    const r = scoreMetadataCandidate(seed, cand);
    expect(r.score).toBeGreaterThan(0.85);
    expect(r.evidence).toContain('başlık benzer');
    expect(r.evidence).toContain('yazar eşleşmesi');
    expect(r.evidence).toContain('yıl eşleşmesi');
    expect(r.evidence).toContain('DOI bulundu');
  });
  it('low score for unrelated', () => {
    const r = scoreMetadataCandidate({ title: 'A' }, { title: 'Z totally different' });
    expect(r.score).toBeLessThan(0.5);
  });
});

describe('isWeakMetadataValue', () => {
  it('detects dash + empty placeholders', () => {
    expect(isWeakMetadataValue('-')).toBe(true);
    expect(isWeakMetadataValue('  ')).toBe(true);
    expect(isWeakMetadataValue('')).toBe(true);
    expect(isWeakMetadataValue(null)).toBe(true);
  });
  it('detects "yok" / "unknown" / "na" placeholders', () => {
    expect(isWeakMetadataValue('yok')).toBe(true);
    expect(isWeakMetadataValue('unknown')).toBe(true);
    expect(isWeakMetadataValue('na')).toBe(true);
    expect(isWeakMetadataValue('n/a')).toBe(true);
  });
  it('treats real values as non-weak', () => {
    expect(isWeakMetadataValue('Nature')).toBe(false);
    expect(isWeakMetadataValue('Smith, J.')).toBe(false);
  });
});

describe('metadataYear', () => {
  it('extracts 4-digit year from a string', () => {
    expect(metadataYear('Published 2023 in NeurIPS')).toBe('2023');
    expect(metadataYear('1999')).toBe('1999');
  });
  it('returns empty when no year found', () => {
    expect(metadataYear('no year here')).toBe('');
  });
});

describe('metadataAuthors', () => {
  it('returns array when given an array', () => {
    expect(metadataAuthors(['John Smith', 'Jane Doe'])).toEqual(['John Smith', 'Jane Doe']);
  });
  it('splits by semicolon', () => {
    expect(metadataAuthors('Smith, J; Doe, K')).toEqual(['Smith, J', 'Doe, K']);
  });
  it('splits by "and"', () => {
    expect(metadataAuthors('Smith and Doe')).toEqual(['Smith', 'Doe']);
  });
  it('returns empty array for empty input', () => {
    expect(metadataAuthors('')).toEqual([]);
  });
});

describe('isPlaceholderTitleForRef', () => {
  it('treats empty as placeholder', () => {
    expect(isPlaceholderTitleForRef('', {})).toBe(true);
  });
  it('treats title matching DOI as placeholder', () => {
    expect(isPlaceholderTitleForRef('10.1234/abc', { doi: '10.1234/abc' })).toBe(true);
  });
  it('treats real title as non-placeholder', () => {
    expect(isPlaceholderTitleForRef('Real Title', { doi: '10.1234/abc' })).toBe(false);
  });
});

describe('applyFetchedMetadataToRef', () => {
  it('fills missing fields from fetched, preserves existing strong fields', () => {
    const ref: any = { title: 'Strong Title', authors: ['Existing'], year: '' };
    const changed = applyFetchedMetadataToRef(ref, {
      title: 'New Title',  // should NOT overwrite (existing not placeholder)
      authors: ['Smith', 'Doe'],  // existing already filled → no overwrite
      year: '2020',
      journal: 'Nature',
      doi: '10.1234/abc'
    });
    expect(ref.title).toBe('Strong Title');
    expect(ref.authors).toEqual(['Existing']);
    expect(ref.year).toBe('2020');
    expect(ref.journal).toBe('Nature');
    expect(ref.doi).toBe('10.1234/abc');
    expect(changed).toContain('year');
    expect(changed).toContain('journal');
    expect(changed).toContain('doi');
  });
  it('overwrites weak metadata values for non-title fields', () => {
    // Title-replacement is gated by isPlaceholderTitleForRef (matches doi/isbn/url),
    // not by weak-value detection. Generic loop fills weak journal/year/etc.
    const ref: any = { title: 'Strong Title', journal: 'yok', year: '' };
    applyFetchedMetadataToRef(ref, {
      title: 'New Title',
      journal: 'Nature',
      year: '2020'
    });
    expect(ref.title).toBe('Strong Title'); // strong title preserved
    expect(ref.journal).toBe('Nature');     // weak journal replaced
    expect(ref.year).toBe('2020');
  });
  it('overwrites title when current title is the DOI itself (placeholder)', () => {
    const ref: any = { title: '10.1234/abc', doi: '10.1234/abc' };
    applyFetchedMetadataToRef(ref, { title: 'Real Title' });
    expect(ref.title).toBe('Real Title');
  });
  it('force-overwrites DOI even when target had a stale value', () => {
    const ref: any = { doi: 'OLD' };
    applyFetchedMetadataToRef(ref, { doi: '10.1/new' });
    expect(ref.doi).toBe('10.1/new');
  });
  it('returns [] for invalid input', () => {
    expect(applyFetchedMetadataToRef(null as any, {})).toEqual([]);
    expect(applyFetchedMetadataToRef({}, null as any)).toEqual([]);
  });
});
