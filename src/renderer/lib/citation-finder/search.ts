/**
 * Citation finder — network adapters (slice 2).
 *
 * Talks to the free academic APIs through the app's IPC bridge
 * (window.electronAPI.netFetchJSON, the same one DOI import uses — bypasses
 * CORS). All functions take an injectable `fetchJSON` so they're testable with
 * a mock and need no real network in tests.
 *
 *   Crossref          — keyword/bibliographic search + citation count
 *   Semantic Scholar  — relevance search + citationCount/influential + OA pdf + abstract
 *   MyMemory          — free TR→EN query translation
 *   Unpaywall         — Open-Access status + best OA pdf by DOI
 */
import { buildEnglishQuery, extractKeyTerms } from './query';
import { mergeCandidates, rankCandidates, type PaperCandidate, type RankOptions } from './ranking';
import { bestSupportingSentence, weightedOverlapScore, type SupportingSentence } from './sentence-match';

export interface FetchResult { ok: boolean; data?: any; error?: string }
export type FetchJSON = (url: string, options?: unknown) => Promise<FetchResult>;

const MAILTO = 'academiq@example.com';

export function defaultFetchJSON(url: string, options?: unknown): Promise<FetchResult> {
  const fn = (window as any)?.electronAPI?.netFetchJSON;
  if (typeof fn !== 'function') {
    return Promise.resolve({ ok: false, error: 'Ağ köprüsü yok (yalnız uygulama içinde çalışır)' });
  }
  return Promise.resolve(fn(url, options)).then((r: any) => r || { ok: false, error: 'boş yanıt' });
}

/** Strip JATS/HTML tags Crossref puts in abstracts. */
function stripTags(s: unknown): string {
  return String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface FoundCandidate extends PaperCandidate {
  supporting?: SupportingSentence | null;
}

// ── Translation ─────────────────────────────────────────────────────────────
export async function translateToEnglish(text: string, fetchJSON: FetchJSON = defaultFetchJSON): Promise<string> {
  const q = String(text || '').slice(0, 480).trim();
  if (!q) return '';
  const res = await fetchJSON(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=tr|en`);
  const t = res.ok ? res.data?.responseData?.translatedText : '';
  return String(t || '').trim();
}

// ── Crossref ────────────────────────────────────────────────────────────────
function mapCrossref(w: any, rank: number): PaperCandidate {
  const issuedYear = w?.issued?.['date-parts']?.[0]?.[0];
  return {
    id: `cr:${w?.DOI || rank}`,
    title: stripTags(Array.isArray(w?.title) ? w.title[0] : w?.title),
    authors: (w?.author || []).map((a: any) => [a?.given, a?.family].filter(Boolean).join(' ').trim()).filter(Boolean),
    year: issuedYear ? Number(issuedYear) : null,
    venue: Array.isArray(w?.['container-title']) ? w['container-title'][0] : w?.['container-title'],
    citationCount: Number(w?.['is-referenced-by-count']) || 0,
    abstract: stripTags(w?.abstract),
    doi: w?.DOI ? String(w.DOI).toLowerCase() : null,
    apiRank: rank,
    source: 'crossref'
  };
}

export async function searchCrossref(query: string, fetchJSON: FetchJSON = defaultFetchJSON, rows = 12): Promise<PaperCandidate[]> {
  if (!String(query || '').trim()) return [];
  // `query=` is Crossref's topical/relevance search (dismax across fields);
  // `query.bibliographic` is for matching a known citation string, which gave
  // poor topical results.
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${rows}` +
    `&select=DOI,title,author,issued,container-title,is-referenced-by-count,abstract&mailto=${MAILTO}`;
  const res = await fetchJSON(url);
  if (!res.ok) return [];
  const items = res.data?.message?.items || [];
  return items.map((w: any, i: number) => mapCrossref(w, i));
}

// ── OpenAlex ────────────────────────────────────────────────────────────────
function reconstructOpenAlexAbstract(inv: any): string {
  if (!inv || typeof inv !== 'object') return '';
  const positions: string[] = [];
  for (const word of Object.keys(inv)) {
    for (const pos of inv[word] || []) positions[pos] = word;
  }
  return positions.join(' ').replace(/\s+/g, ' ').trim();
}

function mapOpenAlex(w: any, rank: number): PaperCandidate {
  return {
    id: `oa:${w?.doi || w?.id || rank}`,
    title: String(w?.display_name || '').trim(),
    authors: (w?.authorships || []).map((a: any) => String(a?.author?.display_name || '').trim()).filter(Boolean),
    year: w?.publication_year ? Number(w.publication_year) : null,
    venue: w?.primary_location?.source?.display_name || w?.host_venue?.display_name || '',
    citationCount: Number(w?.cited_by_count) || 0,
    abstract: reconstructOpenAlexAbstract(w?.abstract_inverted_index),
    doi: w?.doi ? String(w.doi).replace(/^https?:\/\/doi\.org\//i, '').toLowerCase() : null,
    isOpenAccess: !!w?.open_access?.is_oa,
    oaPdfUrl: w?.open_access?.oa_url || null,
    apiRank: rank,
    source: 'openalex'
  };
}

export async function searchOpenAlex(query: string, fetchJSON: FetchJSON = defaultFetchJSON, perPage = 12): Promise<PaperCandidate[]> {
  if (!String(query || '').trim()) return [];
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=${perPage}&mailto=${MAILTO}`;
  const res = await fetchJSON(url);
  if (!res.ok) return [];
  const items = res.data?.results || [];
  return items.map((w: any, i: number) => mapOpenAlex(w, i));
}

// ── Semantic Scholar ────────────────────────────────────────────────────────
function mapS2(p: any, rank: number): PaperCandidate {
  return {
    id: `s2:${p?.paperId || rank}`,
    title: String(p?.title || '').trim(),
    authors: (p?.authors || []).map((a: any) => String(a?.name || '').trim()).filter(Boolean),
    year: p?.year ? Number(p.year) : null,
    venue: p?.venue || '',
    citationCount: Number(p?.citationCount) || 0,
    influentialCitationCount: Number(p?.influentialCitationCount) || 0,
    abstract: String(p?.abstract || '').trim(),
    doi: p?.externalIds?.DOI ? String(p.externalIds.DOI).toLowerCase() : null,
    isOpenAccess: !!p?.isOpenAccess || !!p?.openAccessPdf?.url,
    oaPdfUrl: p?.openAccessPdf?.url || null,
    apiRank: rank,
    source: 'semanticscholar'
  };
}

export async function searchSemanticScholar(query: string, fetchJSON: FetchJSON = defaultFetchJSON, limit = 8): Promise<PaperCandidate[]> {
  if (!String(query || '').trim()) return [];
  const fields = 'title,abstract,year,authors,venue,citationCount,influentialCitationCount,externalIds,openAccessPdf,isOpenAccess';
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=${fields}`;
  const res = await fetchJSON(url);
  if (!res.ok) return [];
  const items = res.data?.data || [];
  return items.map((p: any, i: number) => mapS2(p, i));
}

// ── Unpaywall (Open Access) ─────────────────────────────────────────────────
export async function checkOpenAccess(doi: string, fetchJSON: FetchJSON = defaultFetchJSON): Promise<{ isOpenAccess: boolean; oaPdfUrl: string | null }> {
  if (!doi) return { isOpenAccess: false, oaPdfUrl: null };
  const res = await fetchJSON(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${MAILTO}`);
  if (!res.ok) return { isOpenAccess: false, oaPdfUrl: null };
  const d = res.data || {};
  const loc = d.best_oa_location || null;
  return { isOpenAccess: !!d.is_oa, oaPdfUrl: (loc && (loc.url_for_pdf || loc.url)) || null };
}

// ── Orchestrator ────────────────────────────────────────────────────────────
export interface FindOptions extends RankOptions {
  enrichOpenAccessTop?: number; // how many top candidates to check via Unpaywall (default 6)
}

export async function findCitations(
  sentence: string,
  opts: FindOptions = {},
  fetchJSON: FetchJSON = defaultFetchJSON
): Promise<{ candidates: FoundCandidate[]; query: { tr: string; en: string } }> {
  const trQuery = String(sentence || '').trim();
  const glossary = buildEnglishQuery(trQuery);
  // If Turkish words are left unmapped, translate the whole sentence for a better EN query.
  let enQuery = glossary.query;
  if (glossary.unmapped.length) {
    const translated = await translateToEnglish(trQuery, fetchJSON);
    if (translated) enQuery = translated;
  }
  // Match terms: the glossary phrases (high signal) + the English content words.
  const englishTerms = Array.from(new Set([
    ...glossary.mappedTerms,
    ...extractKeyTerms(enQuery)
  ]));

  const [cr, s2, oa] = await Promise.all([
    searchCrossref(enQuery, fetchJSON).catch(() => []),
    searchSemanticScholar(enQuery, fetchJSON).catch(() => []),
    searchOpenAlex(enQuery, fetchJSON).catch(() => [])
  ]);
  let merged = mergeCandidates(cr, s2, oa);

  // Topicality score: how much of the claim actually appears in title+abstract.
  for (const c of merged) {
    c.termCoverage = weightedOverlapScore(englishTerms, `${c.title || ''} ${c.abstract || ''}`);
  }

  // Enrich OA for the most relevant candidates that don't already know.
  const topForOA = rankCandidates(merged, opts)
    .filter((c) => c.doi && c.isOpenAccess == null)
    .slice(0, opts.enrichOpenAccessTop ?? 6);
  await Promise.all(
    topForOA.map(async (c) => {
      const oa = await checkOpenAccess(c.doi as string, fetchJSON).catch(() => null);
      if (oa) { c.isOpenAccess = oa.isOpenAccess; c.oaPdfUrl = c.oaPdfUrl || oa.oaPdfUrl; }
    })
  );

  const ranked = rankCandidates(merged, opts) as FoundCandidate[];
  // Attach the best supporting sentence from each abstract (verification aid).
  for (const c of ranked) {
    c.supporting = c.abstract ? bestSupportingSentence(englishTerms, c.abstract) : null;
  }
  return { candidates: ranked, query: { tr: trQuery, en: enQuery } };
}
