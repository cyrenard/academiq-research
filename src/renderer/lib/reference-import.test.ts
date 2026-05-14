import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeDoiInput,
  normalizeIsbnInput,
  hasSameReference,
  referenceImportKey,
  isPlaceholderReferenceTitle,
  mergeReferenceRecords,
  hasUsableReferenceMetadata,
  normalizeReferenceList,
  normalizeReferenceState,
  upsertReferenceInWorkspace,
  patchReferenceInWorkspace,
  yearFromCrossrefDate,
  mapCrossrefWorkToReference,
  collectOpenAccessPdfCandidates
} from './reference-import';
import type { AcademiqReference, AcademiqAppState } from './app-state';

afterEach(() => {
  delete (window as any).AQReferenceParse;
});

function makeRef(overrides: Partial<AcademiqReference> = {}): AcademiqReference {
  return {
    id: 'r1',
    title: 'Title',
    authors: ['Smith'],
    year: '2020',
    journal: 'Nature',
    doi: '',
    isbn: '',
    url: '',
    pdfUrl: '',
    labels: [],
    referenceType: 'article',
    ...overrides
  };
}

function makeState(overrides: Partial<AcademiqAppState> = {}): AcademiqAppState {
  return {
    cur: 'ws-1',
    curDoc: 'doc-1',
    wss: [{ id: 'ws-1', name: 'WS1', lib: [], collections: [], notes: [] } as any],
    docs: [],
    notes: [],
    ...overrides
  } as AcademiqAppState;
}

// ─── DOI normalization ───────────────────────────────────────────────────

describe('normalizeDoiInput', () => {
  it('extracts DOI from URL form', () => {
    expect(normalizeDoiInput('https://doi.org/10.1234/abc')).toBe('10.1234/abc');
    expect(normalizeDoiInput('https://dx.doi.org/10.1234/abc')).toBe('10.1234/abc');
  });

  it('extracts DOI from text containing it', () => {
    expect(normalizeDoiInput('cf. 10.1234/abc, p.12')).toBe('10.1234/abc');
  });

  it('lowercases the result', () => {
    expect(normalizeDoiInput('10.1234/ABC')).toBe('10.1234/abc');
  });

  it('strips trailing punctuation', () => {
    expect(normalizeDoiInput('10.1234/abc).')).toBe('10.1234/abc');
  });

  it('fixes the "missing leading 1" bug (0.1234 → 10.1234)', () => {
    expect(normalizeDoiInput('0.1234/abc')).toBe('10.1234/abc');
  });

  it('strips publisher-specific format suffixes', () => {
    expect(normalizeDoiInput('10.1234/abc/PDF')).toBe('10.1234/abc');
    expect(normalizeDoiInput('10.1234/abc.RIS')).toBe('10.1234/abc');
    expect(normalizeDoiInput('10.1234/abc.FULLTEXT')).toBe('10.1234/abc');
  });

  it('returns empty for non-DOI input', () => {
    expect(normalizeDoiInput('not a doi')).toBe('');
    expect(normalizeDoiInput('')).toBe('');
  });

  it('delegates to AQReferenceParse.normalizeDoi when available', () => {
    const normalize = vi.fn(() => '10.99/legacy');
    (window as any).AQReferenceParse = { normalizeDoi: normalize };
    expect(normalizeDoiInput('garbage 10.1/x')).toBe('10.99/legacy');
    expect(normalize).toHaveBeenCalledWith('garbage 10.1/x');
  });

  it('falls back to local regex when legacy normalizer throws', () => {
    (window as any).AQReferenceParse = { normalizeDoi: () => { throw new Error('boom'); } };
    expect(normalizeDoiInput('https://doi.org/10.1234/abc')).toBe('10.1234/abc');
  });
});

// ─── ISBN normalization ──────────────────────────────────────────────────

describe('normalizeIsbnInput', () => {
  it('normalizes 10-digit ISBN', () => {
    expect(normalizeIsbnInput('0-306-40615-2')).toBe('0306406152');
  });

  it('normalizes 13-digit ISBN with hyphens + spaces', () => {
    expect(normalizeIsbnInput('978-0-306-40615-7')).toBe('9780306406157');
    expect(normalizeIsbnInput('978 0 306 40615 7')).toBe('9780306406157');
  });

  it('returns empty when length is not 10 or 13', () => {
    expect(normalizeIsbnInput('12345')).toBe('');
    expect(normalizeIsbnInput('')).toBe('');
  });

  it('handles X check digit', () => {
    expect(normalizeIsbnInput('0-306-40615-X')).toBe('030640615X');
  });

  it('delegates to AQReferenceParse.normalizeIsbn when available', () => {
    (window as any).AQReferenceParse = { normalizeIsbn: () => '9999999999' };
    expect(normalizeIsbnInput('whatever')).toBe('9999999999');
  });
});

// ─── Identity / dedup keying ─────────────────────────────────────────────

describe('hasSameReference', () => {
  it('matches by DOI (case-insensitive)', () => {
    expect(hasSameReference(makeRef({ doi: '10.1/x' }), { doi: '10.1/X' })).toBe(true);
  });

  it('matches by ISBN (normalized)', () => {
    expect(hasSameReference(makeRef({ isbn: '978-0-306-40615-7' }), { isbn: '9780306406157' })).toBe(true);
  });

  it('matches by URL (case-insensitive)', () => {
    expect(hasSameReference(makeRef({ url: 'HTTPS://Example.COM' }), { url: 'https://example.com' })).toBe(true);
  });

  it('returns false when nothing matches', () => {
    expect(hasSameReference(makeRef({ doi: '10.1/x' }), { doi: '10.2/y' })).toBe(false);
    expect(hasSameReference(makeRef({}), {})).toBe(false);
  });
});

describe('referenceImportKey', () => {
  it('prefers DOI key', () => {
    expect(referenceImportKey(makeRef({ doi: '10.1/x', isbn: '978', title: 'X' }))).toBe('doi:10.1/x');
  });

  it('falls back to ISBN', () => {
    expect(referenceImportKey(makeRef({ isbn: '978-0306-40615-7' }))).toBe('isbn:9780306406157');
  });

  it('falls back to URL', () => {
    expect(referenceImportKey(makeRef({ url: 'https://x.com' }))).toBe('url:https://x.com');
  });

  it('falls back to title|year|firstAuthor', () => {
    const ref = makeRef({ title: 'Some Title', year: '2020', authors: ['Smith'] });
    expect(referenceImportKey(ref)).toBe('title:some title|2020|smith');
  });

  it('returns empty when nothing usable', () => {
    expect(referenceImportKey(makeRef({ title: '', year: '', authors: [] }))).toBe('');
  });
});

describe('isPlaceholderReferenceTitle', () => {
  it('empty title is placeholder', () => {
    expect(isPlaceholderReferenceTitle('', makeRef())).toBe(true);
  });

  it('title matching DOI is placeholder', () => {
    expect(isPlaceholderReferenceTitle('10.1234/abc', makeRef({ doi: '10.1234/abc' }))).toBe(true);
  });

  it('title matching DOI URL form is placeholder', () => {
    expect(isPlaceholderReferenceTitle('https://doi.org/10.1234/abc', makeRef({ doi: '10.1234/abc' }))).toBe(true);
  });

  it('real title is not a placeholder', () => {
    expect(isPlaceholderReferenceTitle('Real Title', makeRef({ doi: '10.1234/abc' }))).toBe(false);
  });
});

// ─── Merge ───────────────────────────────────────────────────────────────

describe('mergeReferenceRecords', () => {
  it('preserves target id', () => {
    const merged = mergeReferenceRecords(makeRef({ id: 'keep' }), makeRef({ id: 'replace' }));
    expect(merged.id).toBe('keep');
  });

  it('fills missing fields from source', () => {
    const target = makeRef({ title: 'T', year: '', journal: '' });
    const source = makeRef({ year: '2020', journal: 'Nature', doi: '10.1/x' });
    const merged = mergeReferenceRecords(target, source);
    expect(merged.year).toBe('2020');
    expect(merged.journal).toBe('Nature');
    expect(merged.doi).toBe('10.1/x');
  });

  it('replaces placeholder title (DOI as title) with real source title', () => {
    const target = makeRef({ doi: '10.1/x', title: '10.1/x' });
    const source = makeRef({ title: 'Real Title' });
    const merged = mergeReferenceRecords(target, source);
    expect(merged.title).toBe('Real Title');
  });

  it('unions labels and collectionIds arrays', () => {
    const target = makeRef({ labels: ['a'], collectionIds: ['c1'] } as any);
    const source = makeRef({ labels: ['b'], collectionIds: ['c2'] } as any);
    const merged = mergeReferenceRecords(target, source);
    expect((merged.labels as string[]).sort()).toEqual(['a', 'b']);
    expect((merged as any).collectionIds.sort()).toEqual(['c1', 'c2']);
  });

  it('ignores empty/null source fields', () => {
    const target = makeRef({ journal: 'Nature' });
    const source = makeRef({ journal: '' });
    expect(mergeReferenceRecords(target, source).journal).toBe('Nature');
  });
});

// ─── Usable metadata heuristic ───────────────────────────────────────────

describe('hasUsableReferenceMetadata', () => {
  it('true when a real title is present', () => {
    expect(hasUsableReferenceMetadata({ title: 'Some Article' }, '')).toBe(true);
  });

  it('true when DOI is present', () => {
    expect(hasUsableReferenceMetadata({ doi: '10.1/x' }, '')).toBe(true);
  });

  it('true when ISBN is present', () => {
    expect(hasUsableReferenceMetadata({ isbn: '9780306406157' }, '')).toBe(true);
  });

  it('true when authors+year present (no title)', () => {
    expect(hasUsableReferenceMetadata({ authors: ['Smith'], year: '2020' }, '')).toBe(true);
  });

  it('true when DOI is present even if title is just the DOI placeholder', () => {
    // Title is a placeholder, but a real DOI alone counts as usable metadata.
    expect(hasUsableReferenceMetadata({ title: '10.1/x', doi: '10.1234/abc' }, '')).toBe(true);
  });

  it('false when empty', () => {
    expect(hasUsableReferenceMetadata({}, '')).toBe(false);
  });
});

// ─── List normalization ──────────────────────────────────────────────────

describe('normalizeReferenceList', () => {
  it('dedupes by DOI', () => {
    const refs = [
      makeRef({ id: 'a', doi: '10.1/x', title: 'A' }),
      makeRef({ id: 'b', doi: '10.1/x', title: 'B', year: '2020' })
    ];
    const result = normalizeReferenceList(refs);
    expect(result.length).toBe(1);
    expect(result[0]!.title).toBe('A'); // keeps first
    expect(result[0]!.year).toBe('2020'); // but absorbs year from dup
  });

  it('keeps entries with no key intact', () => {
    const refs = [
      makeRef({ id: 'a', title: '', doi: '', isbn: '', url: '' }),
      makeRef({ id: 'b', title: '', doi: '', isbn: '', url: '' })
    ];
    expect(normalizeReferenceList(refs).length).toBe(2);
  });

  it('preserves order of unique entries', () => {
    const refs = [
      makeRef({ id: 'a', doi: '10.1/x' }),
      makeRef({ id: 'b', doi: '10.2/y' }),
      makeRef({ id: 'c', doi: '10.3/z' })
    ];
    expect(normalizeReferenceList(refs).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('normalizeReferenceState', () => {
  it('runs normalizeReferenceList over every workspace lib', () => {
    const state = makeState({
      wss: [
        { id: 'ws-1', name: 'A', lib: [
          makeRef({ id: 'a', doi: '10.1/x' }),
          makeRef({ id: 'b', doi: '10.1/x' })
        ], collections: [], notes: [] } as any,
        { id: 'ws-2', name: 'B', lib: [makeRef({ id: 'c', doi: '10.2/y' })], collections: [], notes: [] } as any
      ]
    });
    const result = normalizeReferenceState(state);
    expect(result.wss[0]!.lib!.length).toBe(1);
    expect(result.wss[1]!.lib!.length).toBe(1);
  });
});

// ─── Upsert / patch ──────────────────────────────────────────────────────

describe('upsertReferenceInWorkspace', () => {
  it('adds reference at start when no duplicate exists', () => {
    const state = makeState();
    const ref = makeRef({ id: 'new', doi: '10.1/x' });
    const { state: next, referenceId } = upsertReferenceInWorkspace(state, ref);
    expect(referenceId).toBe('new');
    expect(next.wss[0]!.lib).toEqual([ref]);
  });

  it('merges into existing reference on DOI match', () => {
    const existing = makeRef({ id: 'old', doi: '10.1/x', title: 'Existing' });
    const state = makeState({ wss: [{ id: 'ws-1', name: 'WS1', lib: [existing], collections: [], notes: [] } as any] });
    const incoming = makeRef({ id: 'new', doi: '10.1/x', year: '2020', journal: 'Nature' });
    const { state: next, referenceId } = upsertReferenceInWorkspace(state, incoming);
    expect(referenceId).toBe('old');
    expect(next.wss[0]!.lib!.length).toBe(1);
    expect(next.wss[0]!.lib![0]!.year).toBe('2020');
    expect(next.wss[0]!.lib![0]!.journal).toBe('Nature');
  });
});

describe('patchReferenceInWorkspace', () => {
  it('patches matching reference fields', () => {
    const state = makeState({
      wss: [{ id: 'ws-1', name: 'WS1', lib: [makeRef({ id: 'a', year: '' })], collections: [], notes: [] } as any]
    });
    const result = patchReferenceInWorkspace(state, 'ws-1', 'a', { year: '2024' });
    expect(result.wss[0]!.lib![0]!.year).toBe('2024');
  });

  it('does not affect refs that do not match', () => {
    const state = makeState({
      wss: [{ id: 'ws-1', name: 'WS1', lib: [makeRef({ id: 'a', year: '2020' }), makeRef({ id: 'b', year: '2021' })], collections: [], notes: [] } as any]
    });
    const result = patchReferenceInWorkspace(state, 'ws-1', 'b', { year: '2024' });
    expect(result.wss[0]!.lib![0]!.year).toBe('2020');
    expect(result.wss[0]!.lib![1]!.year).toBe('2024');
  });
});

// ─── CrossRef mapper ─────────────────────────────────────────────────────

describe('yearFromCrossrefDate', () => {
  it('extracts year from date-parts', () => {
    expect(yearFromCrossrefDate({ 'date-parts': [[2023, 5, 1]] })).toBe('2023');
  });

  it('returns empty when missing', () => {
    expect(yearFromCrossrefDate({})).toBe('');
    expect(yearFromCrossrefDate(null)).toBe('');
  });
});

describe('mapCrossrefWorkToReference', () => {
  it('produces a valid AcademiqReference from a CrossRef work', () => {
    const ref = mapCrossrefWorkToReference({
      title: ['The Title'],
      author: [{ family: 'Smith', given: 'John' }, { family: 'Doe', given: 'Jane' }],
      'published-print': { 'date-parts': [[2021]] },
      'container-title': ['Nature'],
      volume: '42',
      issue: '3',
      page: '100-120',
      URL: 'https://x.com'
    }, '10.1234/abc');
    expect(ref.title).toBe('The Title');
    expect(ref.authors).toEqual(['Smith, John', 'Doe, Jane']);
    expect(ref.year).toBe('2021');
    expect(ref.journal).toBe('Nature');
    expect(ref.volume).toBe('42');
    expect(ref.issue).toBe('3');
    expect(ref.fp).toBe('100');
    expect(ref.lp).toBe('120');
    expect(ref.doi).toBe('10.1234/abc');
    expect(ref.url).toBe('https://x.com');
    expect(ref.referenceType).toBe('article');
  });

  it('falls back to DOI URL when no URL field', () => {
    const ref = mapCrossrefWorkToReference({ title: 'T' }, '10.1234/abc');
    expect(ref.url).toBe('https://doi.org/10.1234/abc');
  });

  it('falls back to DOI as title when title is missing', () => {
    const ref = mapCrossrefWorkToReference({}, '10.1234/abc');
    expect(ref.title).toBe('10.1234/abc');
  });
});

// ─── Collectors ──────────────────────────────────────────────────────────

describe('collectOpenAccessPdfCandidates', () => {
  it('returns refs with pdfUrl or DOI that are not yet attached', () => {
    const state = makeState({
      wss: [{
        id: 'ws-1',
        name: 'WS1',
        lib: [
          makeRef({ id: 'has-pdf-url', pdfUrl: 'https://x.com/a.pdf' }),
          makeRef({ id: 'has-doi', doi: '10.1234/abc' }),
          makeRef({ id: 'attached', doi: '10.5678/abc', pdfAttached: true } as any),
          makeRef({ id: 'no-pdf-no-doi' })
        ],
        collections: [],
        notes: []
      } as any]
    });
    const result = collectOpenAccessPdfCandidates(state);
    expect(result.map((r) => r.reference.id).sort()).toEqual(['has-doi', 'has-pdf-url']);
  });

  it('skips refs without id', () => {
    const state = makeState({
      wss: [{
        id: 'ws-1', name: 'WS1', collections: [], notes: [],
        lib: [makeRef({ id: '', pdfUrl: 'https://x.com/a.pdf' })]
      } as any]
    });
    expect(collectOpenAccessPdfCandidates(state).length).toBe(0);
  });
});
