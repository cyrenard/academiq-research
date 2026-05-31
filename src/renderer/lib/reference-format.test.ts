import { describe, it, expect } from 'vitest';
import {
  normalizeReferenceType,
  normalizeDoi,
  normalizeIsbn,
  formatAuthor,
  formatAuthorList,
  formatTitle,
  apa7Reference,
  apaInlineCitation,
  referenceKey,
  dedupeReferences,
  authorSearchText,
  apaSortKey,
  sortReferencesApa,
  filterReferencesForQuery,
  type ReferenceLike,
} from './reference-format';

const zimmerman: ReferenceLike = {
  id: 'r1',
  authors: ['Zimmerman, Barry J'],
  year: '2000',
  title: 'Self-Efficacy: An Essential Motive to Learn',
  journal: 'Contemporary Educational Psychology',
  volume: '25',
  issue: '1',
  fp: '82',
  lp: '91',
  doi: '10.1006/ceps.1999.1016',
};

describe('normalizeReferenceType', () => {
  it('keeps known types and defaults to article', () => {
    expect(normalizeReferenceType('Book')).toBe('book');
    expect(normalizeReferenceType('WEBSITE')).toBe('website');
    expect(normalizeReferenceType('article')).toBe('article');
    expect(normalizeReferenceType('thesis')).toBe('article');
    expect(normalizeReferenceType('')).toBe('article');
    expect(normalizeReferenceType(undefined)).toBe('article');
  });
});

describe('normalizeDoi', () => {
  it('strips prefixes, trailing junk and known suffixes', () => {
    expect(normalizeDoi('https://doi.org/10.1000/Example')).toBe('10.1000/example');
    expect(normalizeDoi('doi: 10.1234/abc')).toBe('10.1234/abc');
    expect(normalizeDoi('10.1234/abc.pdf')).toBe('10.1234/abc');
    expect(normalizeDoi('10.1006/ceps.1999.1016')).toBe('10.1006/ceps.1999.1016');
  });
  it('returns empty for non-DOIs', () => {
    expect(normalizeDoi('not a doi')).toBe('');
    expect(normalizeDoi('')).toBe('');
    expect(normalizeDoi(null)).toBe('');
  });
});

describe('normalizeIsbn', () => {
  it('keeps 10/13 digit ISBNs and rejects others', () => {
    expect(normalizeIsbn('978-3-16-148410-0')).toBe('9783161484100');
    expect(normalizeIsbn('0-306-40615-2')).toBe('0306406152');
    expect(normalizeIsbn('123')).toBe('');
  });
});

describe('formatAuthor', () => {
  it('formats "Surname, Given" to initials', () => {
    expect(formatAuthor('Zimmerman, Barry J')).toBe('Zimmerman, B. J.');
    expect(formatAuthor('Wang, Yi')).toBe('Wang, Y.');
    expect(formatAuthor('Kuhn, Thomas')).toBe('Kuhn, T.');
  });
  it('formats "Given Surname" with no comma', () => {
    expect(formatAuthor('Barry Zimmerman')).toBe('Zimmerman, B.');
    expect(formatAuthor('Plato')).toBe('Plato');
    expect(formatAuthor('')).toBe('');
  });
});

describe('formatAuthorList', () => {
  it('joins with & and handles the 20+ ellipsis rule', () => {
    expect(formatAuthorList(['Zimmerman, Barry J', 'Wang, Yi'])).toBe('Zimmerman, B. J. & Wang, Y.');
    expect(formatAuthorList(['Zimmerman, Barry J'])).toBe('Zimmerman, B. J.');
    expect(formatAuthorList([])).toBe('');
    const twentyOne = Array.from({ length: 21 }, (_, i) => `A${i}, B`);
    expect(formatAuthorList(twentyOne)).toContain(', . . . & A20, B.');
  });
});

describe('formatTitle', () => {
  it('sentence-cases after start, period and colon', () => {
    expect(formatTitle('Self-Efficacy: An Essential Motive to Learn'))
      .toBe('Self-efficacy: An essential motive to learn');
    expect(formatTitle('one. two. three')).toBe('One. Two. Three');
  });
});

describe('apa7Reference', () => {
  it('formats a journal article', () => {
    expect(apa7Reference(zimmerman)).toBe(
      'Zimmerman, B. J. (2000). Self-efficacy: An essential motive to learn. ' +
      '<i>Contemporary Educational Psychology</i>, <i>25</i>(1), 82–91. ' +
      'https://doi.org/10.1006/ceps.1999.1016'
    );
  });
  it('formats a book', () => {
    expect(apa7Reference({
      referenceType: 'book',
      authors: ['Kuhn, Thomas'],
      year: '1962',
      title: 'The Structure of Scientific Revolutions',
      publisher: 'University of Chicago Press',
    })).toBe('Kuhn, T. (1962). <i>The structure of scientific revolutions</i>. University of Chicago Press.');
  });
  it('formats a website with retrieval date', () => {
    expect(apa7Reference({
      referenceType: 'website',
      authors: ['Doe, Jane'],
      year: '2021',
      title: 'A Guide',
      websiteName: 'Example',
      url: 'https://example.com/g',
      accessedDate: '2022-01-01',
    })).toBe('Doe, J. (2021). A guide. <i>Example</i>. Retrieved 2022-01-01, from https://example.com/g');
  });
  it('uses t.y. for missing year and title-as-author fallback', () => {
    expect(apa7Reference({ title: 'Anonymous Work' })).toBe('Anonymous work (t.y.). Anonymous work.');
  });
});

describe('apaInlineCitation', () => {
  it('renders inline, textual and footnote forms', () => {
    expect(apaInlineCitation(zimmerman, 'inline')).toBe('(Zimmerman, 2000)');
    expect(apaInlineCitation(zimmerman, 'textual')).toBe('Zimmerman (2000)');
    expect(apaInlineCitation(zimmerman, 'footnote_explicit')).toBe('Zimmerman, 2000.');
  });
  it('handles 0, 2 and 3+ authors', () => {
    expect(apaInlineCitation({})).toBe('(Bilinmeyen, t.y.)');
    expect(apaInlineCitation({ authors: ['A, X', 'B, Y'], year: '2020' })).toBe('(A & B, 2020)');
    expect(apaInlineCitation({ authors: ['A, X', 'B, Y', 'C, Z'], year: '2020' })).toBe('(A vd., 2020)');
  });
});

describe('referenceKey / dedupeReferences', () => {
  it('keys by DOI, ISBN, meta, then id', () => {
    expect(referenceKey({ doi: 'https://doi.org/10.1000/Example' })).toBe('doi:10.1000/example');
    expect(referenceKey({ isbn: '978-3-16-148410-0' })).toBe('isbn:9783161484100');
    expect(referenceKey({ title: 'A long enough title', year: '2020', authors: ['Smith, J'] }))
      .toBe('meta:article|smith, j|2020|a long enough title');
    expect(referenceKey({ title: 'short', id: 'x' })).toBe('id:x');
  });
  it('removes duplicates by key, keeping first', () => {
    const a = { id: '1', doi: '10.1000/abc' };
    const b = { id: '2', doi: 'https://doi.org/10.1000/ABC' };
    const c = { id: '3', doi: '10.9999/zzz' };
    const out = dedupeReferences([a, b, c]);
    expect(out.map((r) => r.id)).toEqual(['1', '3']);
  });
});

describe('authorSearchText', () => {
  it('lowercases and flattens "surname, given"', () => {
    expect(authorSearchText(['Zimmerman, Barry'])).toBe('zimmerman  barry');
    expect(authorSearchText(['Plato'])).toBe('plato');
  });
});

describe('sortReferencesApa', () => {
  it('orders by surname then year (Turkish locale)', () => {
    const refs = [
      { id: 'b', authors: ['Çelik, Ali'], year: '2019', title: 'B' },
      { id: 'a', authors: ['Adam, Bob'], year: '2001', title: 'A' },
      { id: 'c', authors: ['Adam, Bob'], year: '1999', title: 'C' },
    ];
    expect(sortReferencesApa(refs).map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('filterReferencesForQuery', () => {
  const lib: ReferenceLike[] = [
    zimmerman,
    { id: 'r2', authors: ['Wang, Yi', 'Xu, Shuang'], year: '2026', title: 'AI and writing', journal: 'X' },
  ];
  it('returns all (sorted) for empty query', () => {
    expect(filterReferencesForQuery(lib, '').map((r) => r.id)).toEqual(['r2', 'r1']);
  });
  it('AND-matches tokens across fields', () => {
    expect(filterReferencesForQuery(lib, 'writing wang').map((r) => r.id)).toEqual(['r2']);
    expect(filterReferencesForQuery(lib, 'self-efficacy').map((r) => r.id)).toEqual(['r1']);
  });
  it('matches author initials', () => {
    expect(filterReferencesForQuery(lib, 'wy').map((r) => r.id)).toEqual(['r2']);
  });
});
