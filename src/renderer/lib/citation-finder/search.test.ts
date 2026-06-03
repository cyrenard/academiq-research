import { describe, it, expect } from 'vitest';
import {
  translateToEnglish,
  searchCrossref,
  searchSemanticScholar,
  searchOpenAlex,
  fetchOpenAlexAbstractByDoi,
  checkOpenAccess,
  findCitations,
  type FetchJSON
} from './search';

const mockFetch: FetchJSON = async (url) => {
  if (url.includes('mymemory')) {
    return { ok: true, data: { responseData: { translatedText: 'cognitive load affects psychological well-being' } } };
  }
  if (url.includes('api.crossref.org')) {
    return {
      ok: true,
      data: { message: { items: [
        {
          DOI: '10.1/cr', title: ['Cognitive Load Study'],
          author: [{ given: 'A', family: 'Yılmaz' }],
          issued: { 'date-parts': [[2021]] }, 'container-title': ['Journal of Education'],
          'is-referenced-by-count': 120,
          abstract: '<jats:p>Cognitive load reduces psychological well-being in learners.</jats:p>'
        }
      ] } }
    };
  }
  if (url.includes('semanticscholar.org')) {
    return {
      ok: true,
      data: { data: [
        {
          paperId: 'p1', title: 'Well-being and Load', year: 2022,
          abstract: 'We show that cognitive load lowers psychological well-being in students.',
          authors: [{ name: 'B Demir' }], venue: 'Journal of Psychology',
          citationCount: 300, influentialCitationCount: 30,
          externalIds: { DOI: '10.1/s2' }, openAccessPdf: { url: 'http://oa/pdf' }, isOpenAccess: true
        }
      ] }
    };
  }
  if (url.includes('api.openalex.org/works/doi:')) {
    // abstract backfill by DOI
    return { ok: true, data: { abstract_inverted_index: { Backfilled: [0], abstract: [1], 'text.': [2] } } };
  }
  if (url.includes('api.openalex.org')) {
    return {
      ok: true,
      data: { results: [
        {
          id: 'https://openalex.org/W1', display_name: 'Load and Well-being in Learning',
          publication_year: 2020,
          // inverted index: word -> positions; reconstructs to readable text
          abstract_inverted_index: { Cognitive: [0], load: [1], affects: [2], 'well-being.': [3] },
          authorships: [{ author: { display_name: 'C Kaya' } }],
          primary_location: { source: { display_name: 'Learning Journal' } },
          cited_by_count: 80,
          doi: 'https://doi.org/10.1/OA',
          open_access: { is_oa: true, oa_url: 'http://oa/oa.pdf' }
        }
      ] }
    };
  }
  if (url.includes('unpaywall.org')) {
    return { ok: true, data: { is_oa: true, best_oa_location: { url_for_pdf: 'http://oa/x.pdf' } } };
  }
  return { ok: false, error: 'unknown' };
};

describe('citation-finder adapters', () => {
  it('translateToEnglish returns MyMemory translation', async () => {
    expect(await translateToEnglish('Bilişsel yük iyi oluşu etkiler', mockFetch))
      .toBe('cognitive load affects psychological well-being');
  });

  it('searchCrossref maps items + strips JATS abstract tags', async () => {
    const out = await searchCrossref('cognitive load', mockFetch);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Cognitive Load Study');
    expect(out[0].citationCount).toBe(120);
    expect(out[0].doi).toBe('10.1/cr');
    expect(out[0].abstract).toBe('Cognitive load reduces psychological well-being in learners.');
    expect(out[0].abstract).not.toContain('<');
  });

  it('searchSemanticScholar maps citations + OA', async () => {
    const out = await searchSemanticScholar('cognitive load', mockFetch);
    expect(out[0].citationCount).toBe(300);
    expect(out[0].influentialCitationCount).toBe(30);
    expect(out[0].isOpenAccess).toBe(true);
    expect(out[0].oaPdfUrl).toBe('http://oa/pdf');
  });

  it('searchOpenAlex maps results + reconstructs the inverted-index abstract', async () => {
    const out = await searchOpenAlex('cognitive load', mockFetch);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Load and Well-being in Learning');
    expect(out[0].citationCount).toBe(80);
    expect(out[0].doi).toBe('10.1/oa'); // https + lowercased
    expect(out[0].isOpenAccess).toBe(true);
    expect(out[0].abstract).toBe('Cognitive load affects well-being.');
    expect(out[0].source).toBe('openalex');
  });

  it('fetchOpenAlexAbstractByDoi reconstructs the abstract from the inverted index', async () => {
    expect(await fetchOpenAlexAbstractByDoi('https://doi.org/10.1/X', mockFetch)).toBe('Backfilled abstract text.');
    expect(await fetchOpenAlexAbstractByDoi('', mockFetch)).toBe('');
  });

  it('findCitations backfills a missing abstract so it gets a supporting sentence', async () => {
    // Crossref hit with a DOI but no abstract; only OpenAlex-by-DOI can fill it.
    const backfillMock: FetchJSON = async (url) => {
      if (url.includes('mymemory')) return { ok: true, data: { responseData: { translatedText: 'cognitive load' } } };
      if (url.includes('api.openalex.org/works/doi:')) {
        return { ok: true, data: { abstract_inverted_index: { Cognitive: [0], load: [1], 'matters.': [2] } } };
      }
      if (url.includes('api.crossref.org')) {
        return { ok: true, data: { message: { items: [
          { DOI: '10.1/noabs', title: ['Cognitive Load Paper'], author: [{ given: 'A', family: 'X' }],
            issued: { 'date-parts': [[2021]] }, 'is-referenced-by-count': 40 } // <- no abstract
        ] } } };
      }
      return { ok: false, error: 'none' }; // s2 + openalex-search empty
    };
    const { candidates } = await findCitations('Bilişsel yük', { currentYear: 2025 }, backfillMock);
    const filled = candidates.find((c) => c.doi === '10.1/noabs');
    expect(filled?.abstract).toBe('Cognitive load matters.');
    expect(filled?.supporting?.sentence.toLowerCase()).toContain('cognitive load');
  });

  it('checkOpenAccess reads Unpaywall', async () => {
    expect(await checkOpenAccess('10.1/x', mockFetch)).toEqual({ isOpenAccess: true, oaPdfUrl: 'http://oa/x.pdf' });
  });

  it('returns false OA + safe error when the bridge is missing', async () => {
    const noBridge: FetchJSON = async () => ({ ok: false, error: 'no bridge' });
    expect(await searchCrossref('x', noBridge)).toEqual([]);
    expect(await checkOpenAccess('10.1/x', noBridge)).toEqual({ isOpenAccess: false, oaPdfUrl: null });
  });

  it('findCitations merges + ranks + attaches a supporting sentence', async () => {
    const { candidates, query } = await findCitations(
      'Bilişsel yük kişinin psikolojik iyi oluşunu etkiler.',
      { currentYear: 2025 },
      mockFetch
    );
    expect(candidates.length).toBeGreaterThanOrEqual(3); // crossref + s2 + openalex (different DOIs)
    // the OA, highly-cited, recent S2 paper should rank at/near the top
    expect(candidates[0].source).toBe('semanticscholar');
    expect(candidates[0].isOpenAccess).toBe(true);
    // verification aid: original supporting sentence from the abstract
    expect(candidates[0].supporting?.sentence.toLowerCase()).toContain('cognitive load');
    expect(query.tr).toContain('Bilişsel yük');
  });
});
