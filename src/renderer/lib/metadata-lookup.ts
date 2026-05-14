/**
 * Metadata Lookup Utilities
 *
 * Pure helpers + thin IPC wrappers for fetching/scoring/applying
 * reference metadata from CrossRef, OpenAlex and Semantic Scholar.
 *
 * Extracted from LegacyCompatibilityHost.tsx where 450+ lines of
 * non-React helpers had accumulated. These functions have no React
 * state or DOM dependencies — only the legacy global
 * `AQReferenceParse.normalizeDoi` (best-effort) and `window.electronAPI.netFetchJSON`.
 */

import { legacyWin } from './legacy-window';

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export type MetadataLookupCandidate = {
  ref: any;
  fetched: Record<string, any>;
  score: number;
  source: string;
  evidence: string[];
};

type MetadataLookupCacheEntry = Omit<MetadataLookupCandidate, 'ref'>;

// ───────────────────────────────────────────────────────────────────────────
// Constants + caches
// ───────────────────────────────────────────────────────────────────────────

export const METADATA_DOI_TIMEOUT_MS = 6500;
export const METADATA_SEARCH_TIMEOUT_MS = 5500;

const metadataDoiCache = new Map<string, Record<string, any>>();
const metadataOpenAlexDoiCache = new Map<string, Record<string, any>>();
const metadataSearchCache = new Map<string, MetadataLookupCacheEntry | null>();

/** Test/debug hook — wipe lookup caches. Not used at runtime. */
export function _resetMetadataLookupCaches() {
  metadataDoiCache.clear();
  metadataOpenAlexDoiCache.clear();
  metadataSearchCache.clear();
}

// ───────────────────────────────────────────────────────────────────────────
// Pure normalization + similarity scoring
// ───────────────────────────────────────────────────────────────────────────

export function normalizeDoiForMetadata(value: unknown) {
  const api = legacyWin().AQReferenceParse;
  if (api && typeof api.normalizeDoi === 'function') {
    try {
      const doi = String(api.normalizeDoi(value) || '').trim().toLowerCase();
      if (doi) return doi;
    } catch (_error) {}
  }
  const raw = String(value || '').trim();
  const match = raw.match(/10\.\d{4,9}\/[^\s"'<>]+/i);
  return (match ? match[0] : raw)
    .replace(/^doi:\s*/i, '')
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/[),.;:\]]+$/g, '')
    .trim()
    .toLowerCase();
}

export function normalizeLookupText(value: unknown) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function lookupTokens(value: unknown) {
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'using', 'study', 'article', 'bir', 've', 'ile', 'icin', 'olan', 'olarak']);
  return normalizeLookupText(value)
    .split(' ')
    .filter((token) => token.length > 2 && !stop.has(token));
}

export function compactLookupText(value: unknown) {
  return normalizeLookupText(value).replace(/\s+/g, '');
}

export function ngramSimilarity(a: unknown, b: unknown) {
  const left = compactLookupText(a);
  const right = compactLookupText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length > 12 && right.length > 12 && (left.includes(right) || right.includes(left))) return 0.92;
  const n = left.length < 8 || right.length < 8 ? 2 : 3;
  const make = (text: string) => {
    const grams = new Map<string, number>();
    if (text.length <= n) {
      grams.set(text, 1);
      return grams;
    }
    for (let index = 0; index <= text.length - n; index += 1) {
      const gram = text.slice(index, index + n);
      grams.set(gram, (grams.get(gram) || 0) + 1);
    }
    return grams;
  };
  const aGrams = make(left);
  const bGrams = make(right);
  let overlap = 0;
  aGrams.forEach((count, gram) => {
    overlap += Math.min(count, bGrams.get(gram) || 0);
  });
  const total = Array.from(aGrams.values()).reduce((sum, count) => sum + count, 0)
    + Array.from(bGrams.values()).reduce((sum, count) => sum + count, 0);
  return total ? (2 * overlap) / total : 0;
}

export function titleSimilarity(a: unknown, b: unknown) {
  const aTokens = new Set(lookupTokens(a));
  const bTokens = new Set(lookupTokens(b));
  if (!aTokens.size || !bTokens.size) return 0;
  let hits = 0;
  aTokens.forEach((token) => { if (bTokens.has(token)) hits += 1; });
  const recall = hits / aTokens.size;
  const precision = hits / bTokens.size;
  const tokenScore = (recall * 0.76) + (precision * 0.24);
  return Math.max(tokenScore, ngramSimilarity(a, b));
}

export function authorLastNames(authors: unknown) {
  const list = Array.isArray(authors) ? authors : String(authors || '').split(/[;,]/);
  return list
    .map((author) => {
      const raw = String(author || '').trim();
      const surnameFirst = raw.includes(',') ? raw.split(',')[0] : raw;
      const text = normalizeLookupText(surnameFirst);
      if (!text) return '';
      return text.split(' ').filter(Boolean).slice(-1)[0];
    })
    .filter(Boolean);
}

export function authorOverlapScore(a: unknown, b: unknown) {
  const aNames = new Set(authorLastNames(a));
  const bNames = new Set(authorLastNames(b));
  if (!aNames.size || !bNames.size) return 0;
  let hits = 0;
  aNames.forEach((name) => { if (bNames.has(name)) hits += 1; });
  return hits / Math.max(aNames.size, bNames.size);
}

export function yearFromCrossrefDate(value: any) {
  const parts = value?.['date-parts'];
  const year = Array.isArray(parts) && Array.isArray(parts[0]) ? parts[0][0] : '';
  return year ? String(year) : '';
}

export function firstMetadataString(...values: any[]) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const item = value.map((entry) => typeof entry === 'object' ? entry?.name || entry?.display_name : entry)
        .find((entry) => String(entry || '').trim());
      if (item) return String(item).trim();
      continue;
    }
    if (value && typeof value === 'object') {
      const item = value.name || value.display_name || value.title;
      if (item) return String(item).trim();
      continue;
    }
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

export function openAlexSourceName(work: any) {
  const locationSource = Array.isArray(work?.locations)
    ? work.locations.find((location: any) => location?.source?.display_name)?.source?.display_name
    : '';
  return firstMetadataString(
    work?.primary_location?.source?.display_name,
    work?.best_oa_location?.source?.display_name,
    work?.host_venue?.display_name,
    locationSource,
    work?.primary_location?.source?.host_organization_name,
    work?.best_oa_location?.source?.host_organization_name
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Provider-specific work-to-reference mappers
// ───────────────────────────────────────────────────────────────────────────

export function mapCrossrefWork(work: any) {
  const doi = normalizeDoiForMetadata(work?.DOI || work?.doi || work?.URL || '');
  const authors = Array.isArray(work?.author)
    ? work.author.map((author: any) => author?.family && author?.given ? `${author.family}, ${author.given}` : String(author?.family || author?.name || '')).filter(Boolean)
    : [];
  const published = work?.['published-print'] || work?.['published-online'] || work?.published || work?.created;
  const pages = String(work?.page || '');
  const pageParts = pages.includes('-') ? pages.split('-') : [pages, ''];
  const journal = firstMetadataString(
    work?.['container-title'],
    work?.['short-container-title'],
    work?.['proceedings-title'],
    work?.event?.name,
    work?.institution,
    work?.publisher
  );
  return {
    title: String(Array.isArray(work?.title) ? work.title[0] : work?.title || ''),
    authors,
    year: yearFromCrossrefDate(published),
    journal,
    volume: String(work?.volume || ''),
    issue: String(work?.issue || ''),
    fp: String(pageParts[0] || ''),
    lp: String(pageParts.slice(1).join('-') || ''),
    doi,
    url: String(work?.URL || (doi ? `https://doi.org/${doi}` : '')),
    referenceType: 'article'
  };
}

export function mapOpenAlexWork(work: any) {
  const doi = normalizeDoiForMetadata(work?.doi || work?.ids?.doi || '');
  const authors = Array.isArray(work?.authorships)
    ? work.authorships.map((item: any) => String(item?.author?.display_name || '')).filter(Boolean)
    : [];
  return {
    title: String(work?.title || work?.display_name || ''),
    authors,
    year: String(work?.publication_year || ''),
    journal: openAlexSourceName(work),
    doi,
    url: String(work?.primary_location?.landing_page_url || work?.doi || (doi ? `https://doi.org/${doi}` : '')),
    pdfUrl: String(work?.primary_location?.pdf_url || ''),
    referenceType: 'article'
  };
}

export function mapSemanticScholarWork(work: any) {
  const external = work?.externalIds || {};
  const doi = normalizeDoiForMetadata(external.DOI || external.doi || '');
  const authors = Array.isArray(work?.authors)
    ? work.authors.map((item: any) => String(item?.name || '')).filter(Boolean)
    : [];
  const journal = firstMetadataString(
    work?.journal,
    work?.publicationVenue,
    work?.venue,
    work?.publicationTypes
  );
  return {
    title: String(work?.title || ''),
    authors,
    year: String(work?.year || ''),
    journal,
    doi,
    url: String(work?.url || (doi ? `https://doi.org/${doi}` : '')),
    pdfUrl: String(work?.openAccessPdf?.url || ''),
    referenceType: 'article'
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Candidate scoring + reference application
// ───────────────────────────────────────────────────────────────────────────

export function scoreMetadataCandidate(seed: any, candidate: any) {
  const titleScore = titleSimilarity(seed?.title, candidate?.title);
  const authorScore = authorOverlapScore(seed?.authors, candidate?.authors);
  const seedYear = String(seed?.year || '').trim();
  const candidateYear = String(candidate?.year || '').trim();
  const yearScore = seedYear && candidateYear && seedYear === candidateYear ? 1 : 0;
  const doiBoost = candidate?.doi ? 0.04 : 0;
  const score = Math.min(1, (titleScore * 0.72) + (authorScore * 0.16) + (yearScore * 0.08) + doiBoost);
  const evidence: string[] = [];
  if (titleScore >= 0.55) evidence.push('başlık benzer');
  if (authorScore > 0) evidence.push('yazar eşleşmesi');
  if (yearScore) evidence.push('yıl eşleşmesi');
  if (candidate?.doi) evidence.push('DOI bulundu');
  return { score, titleScore, authorScore, yearScore, evidence };
}

export function isWeakMetadataValue(value: unknown) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return true;
  const normalized = normalizeLookupText(text);
  // normalize strips punctuation; pure-punctuation inputs ('-', '...', '?')
  // collapse to '' here even though `text` is non-empty. Treat as weak too.
  if (!normalized) return true;
  return normalized === 'yok'
    || normalized === 'dergi yok'
    || normalized === 'yil yok'
    || normalized === 'basliksiz'
    || normalized === 'yazar yok'
    || normalized === 'unknown'
    || normalized === 'n a'
    || normalized === 'na';
}

export function metadataYear(value: unknown) {
  const match = String(value || '').match(/\b(18|19|20)\d{2}\b/);
  return match ? match[0] : '';
}

export function metadataAuthors(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return String(value || '')
    .split(/\s*(?:;|\band\b| ve |, (?=[A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s|$)))\s*/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isPlaceholderTitleForRef(title: unknown, ref: any) {
  const text = String(title || '').trim();
  if (!text) return true;
  const normalized = normalizeDoiForMetadata(text);
  const keys = [ref?.doi, ref?.isbn, ref?.url]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return keys.some((key) => {
    const normalizedKey = normalizeDoiForMetadata(key);
    return text === key || text.endsWith(key) || (normalized && normalized === normalizedKey);
  });
}

export function applyFetchedMetadataToRef(ref: any, fetchedInput: Record<string, any>) {
  if (!ref || !fetchedInput) return [];
  const fetched = { ...fetchedInput };
  const changed: string[] = [];
  const setField = (key: string, value: unknown, options: { force?: boolean; weakOnly?: boolean } = {}) => {
    if (value == null || value === '') return;
    const current = ref[key];
    const shouldSet = Boolean(options.force)
      || isWeakMetadataValue(current)
      || (options.weakOnly === false && current !== value);
    if (!shouldSet) return;
    ref[key] = value;
    changed.push(key);
  };

  const doi = normalizeDoiForMetadata(fetched.doi || fetched.DOI || fetched.url || '');
  const year = metadataYear(fetched.year || fetched.publishedDate || fetched.publicationYear);
  const authors = metadataAuthors(fetched.authors);
  const journal = fetched.journal || fetched.booktitle || fetched.websiteName || fetched.publisher || '';

  if (fetched.title && isPlaceholderTitleForRef(ref.title, ref)) setField('title', String(fetched.title), { force: true });
  if (authors.length && (!Array.isArray(ref.authors) || !ref.authors.filter(Boolean).length)) {
    ref.authors = authors;
    changed.push('authors');
  }
  if (year) setField('year', year);
  if (journal) setField('journal', String(journal));
  if (doi) {
    setField('doi', doi, { force: true });
    if (!fetched.url) fetched.url = `https://doi.org/${doi}`;
  }
  ['volume', 'issue', 'fp', 'lp', 'isbn', 'url', 'pdfUrl', 'publisher', 'edition', 'websiteName', 'publishedDate', 'accessedDate', 'booktitle', 'language', 'abstract'].forEach((key) => {
    const force = key === 'url' || key === 'pdfUrl';
    setField(key, fetched[key], { force });
  });
  return Array.from(new Set(changed));
}

// ───────────────────────────────────────────────────────────────────────────
// IPC wrappers (electronAPI.netFetchJSON)
// ───────────────────────────────────────────────────────────────────────────

export async function fetchCrossrefMetadataByDoi(doi: string) {
  const cleanDoi = normalizeDoiForMetadata(doi);
  if (!cleanDoi) return null;
  const cached = metadataDoiCache.get(cleanDoi);
  if (cached) return { ...cached };
  const response = await window.electronAPI?.netFetchJSON?.(
    `https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}?mailto=academiq@example.com`,
    { timeoutMs: METADATA_DOI_TIMEOUT_MS }
  ) as any;
  if (!response?.ok) return null;
  const mapped = mapCrossrefWork(response.data?.message || {});
  const result = mapped.doi ? mapped : { ...mapped, doi: cleanDoi };
  metadataDoiCache.set(cleanDoi, result);
  return { ...result };
}

export async function fetchOpenAlexMetadataByDoi(doi: string) {
  const cleanDoi = normalizeDoiForMetadata(doi);
  if (!cleanDoi) return null;
  const cached = metadataOpenAlexDoiCache.get(cleanDoi);
  if (cached) return { ...cached };
  const response = await window.electronAPI?.netFetchJSON?.(
    `https://api.openalex.org/works/doi:${encodeURIComponent(cleanDoi)}?mailto=academiq@example.com`,
    { timeoutMs: METADATA_DOI_TIMEOUT_MS }
  ) as any;
  if (!response?.ok || !response.data) return null;
  const mapped = mapOpenAlexWork(response.data || {});
  const result = mapped.doi ? mapped : { ...mapped, doi: cleanDoi };
  metadataOpenAlexDoiCache.set(cleanDoi, result);
  return { ...result };
}

export async function enrichMetadataByDoi(fetchedInput: Record<string, any>, doiInput: unknown) {
  const doi = normalizeDoiForMetadata(doiInput || fetchedInput?.doi || fetchedInput?.url || '');
  let fetched = { ...fetchedInput };
  if (!doi) return fetched;
  const crossref = await fetchCrossrefMetadataByDoi(doi);
  if (crossref) {
    fetched = {
      ...crossref,
      ...fetched,
      journal: fetched.journal || crossref.journal,
      year: fetched.year || crossref.year,
      authors: metadataAuthors(fetched.authors).length ? fetched.authors : crossref.authors,
      doi: fetched.doi || crossref.doi,
      url: fetched.url || crossref.url
    };
  }
  if (!fetched.journal) {
    const openAlex = await fetchOpenAlexMetadataByDoi(doi);
    if (openAlex) {
      fetched = {
        ...openAlex,
        ...fetched,
        journal: fetched.journal || openAlex.journal,
        year: fetched.year || openAlex.year,
        authors: metadataAuthors(fetched.authors).length ? fetched.authors : openAlex.authors,
        pdfUrl: fetched.pdfUrl || openAlex.pdfUrl,
        doi: fetched.doi || openAlex.doi,
        url: fetched.url || openAlex.url
      };
    }
  }
  return fetched;
}

export async function searchMetadataByTitle(seed: any): Promise<MetadataLookupCandidate | null> {
  const title = String(seed?.title || '').trim();
  if (!title || title.length < 6) return null;
  const authors = authorLastNames(seed?.authors).slice(0, 2).join(' ');
  const year = String(seed?.year || '').trim();
  const query = [title, authors, year].filter(Boolean).join(' ');
  const titleKey = normalizeLookupText(title);
  const searchKey = [titleKey, authors, year].join('|');
  if (metadataSearchCache.has(searchKey)) {
    const cached = metadataSearchCache.get(searchKey);
    return cached ? { ...cached, ref: seed, fetched: { ...cached.fetched }, evidence: [...cached.evidence] } : null;
  }
  const candidates: Array<{ source: string; fetched: Record<string, any> }> = [];

  const fetches = await Promise.allSettled([
    (async () => {
      const crossref = await window.electronAPI?.netFetchJSON?.(
        `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(query)}&rows=6&mailto=academiq@example.com`,
        { timeoutMs: METADATA_SEARCH_TIMEOUT_MS }
      ) as any;
      const items = Array.isArray(crossref?.data?.message?.items) ? crossref.data.message.items : [];
      return items.map((item: any) => ({ source: 'Crossref', fetched: mapCrossrefWork(item) }));
    })(),
    (async () => {
      const crossrefTitle = await window.electronAPI?.netFetchJSON?.(
        `https://api.crossref.org/works?query.title=${encodeURIComponent(title)}&rows=6&mailto=academiq@example.com`,
        { timeoutMs: METADATA_SEARCH_TIMEOUT_MS }
      ) as any;
      const items = Array.isArray(crossrefTitle?.data?.message?.items) ? crossrefTitle.data.message.items : [];
      return items.map((item: any) => ({ source: 'Crossref title', fetched: mapCrossrefWork(item) }));
    })(),
    (async () => {
      const openAlex = await window.electronAPI?.netFetchJSON?.(
        `https://api.openalex.org/works?search=${encodeURIComponent(title)}&per-page=6&mailto=academiq@example.com`,
        { timeoutMs: METADATA_SEARCH_TIMEOUT_MS }
      ) as any;
      const items = Array.isArray(openAlex?.data?.results) ? openAlex.data.results : [];
      return items.map((item: any) => ({ source: 'OpenAlex', fetched: mapOpenAlexWork(item) }));
    })(),
    (async () => {
      const semantic = await window.electronAPI?.netFetchJSON?.(
        `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=6&fields=title,authors,year,journal,venue,publicationVenue,externalIds,url,openAccessPdf`,
        { timeoutMs: METADATA_SEARCH_TIMEOUT_MS }
      ) as any;
      const items = Array.isArray(semantic?.data?.data) ? semantic.data.data : [];
      return items.map((item: any) => ({ source: 'Semantic Scholar', fetched: mapSemanticScholarWork(item) }));
    })()
  ]);

  fetches.forEach((result) => {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) candidates.push(...result.value);
  });

  let best: MetadataLookupCandidate | null = null;
  const seen = new Set<string>();
  candidates.forEach((candidate) => {
    if (!candidate.fetched?.doi && !candidate.fetched?.title) return;
    const key = normalizeDoiForMetadata(candidate.fetched?.doi || '') || compactLookupText(candidate.fetched?.title || '');
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    const scored = scoreMetadataCandidate(seed, candidate.fetched);
    const isReliable = scored.titleScore >= 0.72
      || (scored.titleScore >= 0.54 && (scored.authorScore > 0 || scored.yearScore > 0 || candidate.fetched?.doi));
    if (!isReliable || scored.score < 0.46) return;
    const next = { ref: seed, fetched: candidate.fetched, score: scored.score, source: candidate.source, evidence: scored.evidence };
    if (!best || next.score > best.score) best = next;
  });

  const selected = best as MetadataLookupCandidate | null;
  if (selected) {
    metadataSearchCache.set(searchKey, {
      fetched: { ...selected.fetched },
      score: selected.score,
      source: selected.source,
      evidence: [...selected.evidence]
    });
  }
  return selected;
}
