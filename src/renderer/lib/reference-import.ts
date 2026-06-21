/**
 * Reference Import Helpers
 *
 * Pure (or IPC-only) functions for fetching, normalizing, merging and
 * upserting reference records into the AcademiqAppState. Extracted from
 * App.tsx where ~370 lines of helpers had accumulated.
 *
 * Dependencies:
 *   - getActiveWorkspace from app-state (selector)
 *   - window.AQReferenceParse (legacy DOI/ISBN normalizer; optional)
 *   - window.electronAPI.netFetchJSON (CrossRef / Unpaywall / OpenAlex IPC)
 *   - window.fetchCR / fetchISBN / fetchOAUrls (legacy reference fetchers)
 */
import { getActiveWorkspace, type AcademiqAppState, type AcademiqReference } from './app-state';
import { legacyWin } from './legacy-window';

export type LegacyReferenceFetcher = (
  value: string,
  callback: (error: unknown, reference?: AcademiqReference) => void
) => void;

// ───────────────────────────────────────────────────────────────────────────
// DOI / ISBN normalization
// ───────────────────────────────────────────────────────────────────────────

export function normalizeDoiInput(value: string) {
  const api = (legacyWin() as any).AQReferenceParse;
  if (api && typeof api.normalizeDoi === 'function') {
    try {
      const normalized = String(api.normalizeDoi(value) || '');
      if (normalized) return normalized;
    } catch (_error) {}
  }
  let candidate = value.trim();
  // Some publishers ship DOIs with the leading "1" stripped (0.1234/x).
  if (/^0\.\d{4,9}\//i.test(candidate)) candidate = `1${candidate}`;
  const match = candidate.match(/10\.\d{4,9}\/[^\s"'<>]+/i);
  const doi = match ? match[0] : '';
  return doi
    .replace(/[),.;]+$/, '')
    .replace(/(?:\/|\.)(BIBTEX|RIS|ABSTRACT|FULLTEXT|FULL|PDF|XML|HTML|EPUB)$/i, '')
    .replace(/\/[A-Za-z]$/, '')
    .trim()
    .toLowerCase();
}

export function normalizeIsbnInput(value: string) {
  const api = (legacyWin() as any).AQReferenceParse;
  if (api && typeof api.normalizeIsbn === 'function') {
    try {
      return String(api.normalizeIsbn(value) || '');
    } catch (_error) {}
  }
  const compact = value.replace(/[^0-9Xx]/g, '').toUpperCase();
  return compact.length === 10 || compact.length === 13 ? compact : '';
}

// ───────────────────────────────────────────────────────────────────────────
// Legacy fetch bridge (window.fetchCR / fetchISBN callbacks → Promise)
// ───────────────────────────────────────────────────────────────────────────

export function fetchLegacyReference(functionName: 'fetchCR' | 'fetchISBN', value: string) {
  const fetcher = (legacyWin() as any)[functionName] as LegacyReferenceFetcher | undefined;
  if (typeof fetcher !== 'function') return Promise.resolve<AcademiqReference | null>(null);
  return new Promise<AcademiqReference | null>((resolve) => {
    try {
      fetcher(value, (error, reference) => resolve(error || !reference ? null : reference));
    } catch (_error) {
      resolve(null);
    }
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Identity / dedup keying
// ───────────────────────────────────────────────────────────────────────────

export function hasSameReference(reference: AcademiqReference, input: { doi?: string; isbn?: string; url?: string }) {
  const doi = String(input.doi || '').toLowerCase();
  const isbn = String(input.isbn || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  const url = String(input.url || '').toLowerCase();
  if (doi && String(reference.doi || '').toLowerCase() === doi) return true;
  if (isbn && String(reference.isbn || '').replace(/[^0-9Xx]/g, '').toUpperCase() === isbn) return true;
  if (url && String(reference.url || '').toLowerCase() === url) return true;
  return false;
}

export function referenceImportKey(reference: AcademiqReference) {
  const doi = String(reference.doi || '').trim().toLowerCase();
  if (doi) return `doi:${doi}`;
  const isbn = String(reference.isbn || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (isbn) return `isbn:${isbn}`;
  const url = String(reference.url || '').trim().toLowerCase();
  if (url) return `url:${url}`;
  const title = String(reference.title || '').trim().toLowerCase();
  const year = String(reference.year || '').trim();
  const author = Array.isArray(reference.authors) ? String(reference.authors[0] || '').trim().toLowerCase() : '';
  return title ? `title:${title}|${year}|${author}` : '';
}

export function isPlaceholderReferenceTitle(title: unknown, reference: AcademiqReference) {
  const normalizedTitle = String(title || '').trim().toLowerCase();
  if (!normalizedTitle) return true;
  const titleAsDoi = normalizeDoiInput(normalizedTitle);
  return [reference.doi, reference.isbn, reference.url]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .some((value) => {
      const valueAsDoi = normalizeDoiInput(value);
      return normalizedTitle === value
        || normalizedTitle.endsWith(value)
        || (!!titleAsDoi && titleAsDoi === value)
        || (!!titleAsDoi && !!valueAsDoi && titleAsDoi === valueAsDoi);
    });
}

// ───────────────────────────────────────────────────────────────────────────
// Merge / normalize
// ───────────────────────────────────────────────────────────────────────────

export function mergeReferenceRecords(target: AcademiqReference, source: AcademiqReference) {
  const merged: AcademiqReference = { ...target };
  Object.entries(source).forEach(([key, value]) => {
    if (key === 'id' || value == null || value === '') return;
    if (key === 'title') {
      if (!merged.title || isPlaceholderReferenceTitle(merged.title, merged)) merged.title = String(value || merged.title || '');
      return;
    }
    if (Array.isArray(value)) {
      const existing = Array.isArray(merged[key]) ? merged[key] as unknown[] : [];
      if (!existing.length) merged[key] = value;
      else if (key === 'labels' || key === 'collectionIds') merged[key] = Array.from(new Set([...existing, ...value]));
      return;
    }
    if (!merged[key]) merged[key] = value;
  });
  return merged;
}

export function hasUsableReferenceMetadata(reference: Record<string, any>, query: string) {
  const probe: AcademiqReference = {
    id: 'metadata-probe',
    title: String(reference.title || reference.detectedTitle || ''),
    doi: String(reference.doi || normalizeDoiInput(query) || ''),
    isbn: String(reference.isbn || normalizeIsbnInput(query) || ''),
    url: String(reference.url || (/^https?:\/\//i.test(query) ? query : ''))
  };
  const title = String(reference.title || reference.detectedTitle || '').trim();
  return !!(
    (title && !isPlaceholderReferenceTitle(title, probe))
    || String(reference.doi || '').trim()
    || String(reference.isbn || '').trim()
    || (Array.isArray(reference.authors) && reference.authors.length && reference.year)
  );
}

export function normalizeReferenceList(references: AcademiqReference[]) {
  const byKey = new Map<string, AcademiqReference>();
  const output: AcademiqReference[] = [];
  references.forEach((reference) => {
    const key = referenceImportKey(reference);
    if (!key) {
      output.push(reference);
      return;
    }
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, reference);
      output.push(reference);
      return;
    }
    const merged = mergeReferenceRecords(existing, reference);
    byKey.set(key, merged);
    const index = output.findIndex((item) => item.id === existing.id);
    if (index >= 0) output[index] = merged;
  });
  return output;
}

export function normalizeReferenceState(state: AcademiqAppState): AcademiqAppState {
  return {
    ...state,
    wss: state.wss.map((workspace) => ({
      ...workspace,
      lib: normalizeReferenceList(Array.isArray(workspace.lib) ? workspace.lib : [])
    }))
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Workspace mutations (return a new state)
// ───────────────────────────────────────────────────────────────────────────

export function upsertReferenceInWorkspace(state: AcademiqAppState, reference: AcademiqReference, rawQuery = '') {
  const workspace = getActiveWorkspace(state);
  const key = referenceImportKey(reference);
  const normalizedQuery = rawQuery.trim().toLowerCase();
  let activeId = reference.id;
  let inserted = false;
  const nextLib = (workspace.lib || []).reduce<AcademiqReference[]>((items, item) => {
    const itemKey = referenceImportKey(item);
    const itemTitle = String(item.title || '').trim().toLowerCase();
    const same = (key && itemKey === key)
      || (!!normalizedQuery && itemTitle === normalizedQuery)
      || (!!reference.doi && itemTitle === reference.doi)
      || (!!reference.doi && itemTitle === reference.doi.replace(/^10\./, '0.'));
    if (same) {
      const merged = mergeReferenceRecords(item, reference);
      activeId = merged.id;
      inserted = true;
      const previousIndex = items.findIndex((existing) => referenceImportKey(existing) === referenceImportKey(merged));
      if (previousIndex >= 0) items[previousIndex] = mergeReferenceRecords(items[previousIndex], merged);
      else items.push(merged);
      return items;
    }
    items.push(item);
    return items;
  }, []);
  if (!inserted) nextLib.unshift(reference);
  return {
    state: {
      ...state,
      wss: state.wss.map((item) => item.id === workspace.id ? { ...item, lib: normalizeReferenceList(nextLib) } : item)
    },
    referenceId: activeId
  };
}

export function patchReferenceInWorkspace(state: AcademiqAppState, workspaceId: string, referenceId: string, patch: Record<string, unknown>) {
  return {
    ...state,
    wss: state.wss.map((workspace) => workspace.id === workspaceId
      ? {
          ...workspace,
          lib: (workspace.lib || []).map((reference) => reference.id === referenceId ? { ...reference, ...patch } : reference)
        }
      : workspace)
  };
}

// ───────────────────────────────────────────────────────────────────────────
// CrossRef work → AcademiqReference mapper
// ───────────────────────────────────────────────────────────────────────────

export function yearFromCrossrefDate(value: any) {
  const parts = value?.['date-parts'];
  const year = Array.isArray(parts) && Array.isArray(parts[0]) ? parts[0][0] : '';
  return year ? String(year) : '';
}

export function mapCrossrefWorkToReference(work: any, doi: string): AcademiqReference {
  const authors = Array.isArray(work?.author)
    ? work.author.map((author: any) => author?.family && author?.given ? `${author.family}, ${author.given}` : String(author?.family || author?.name || '')).filter(Boolean)
    : [];
  const published = work?.['published-print'] || work?.['published-online'] || work?.published || work?.created;
  const pages = String(work?.page || '');
  const pageParts = pages.includes('-') ? pages.split('-') : [pages, ''];
  return {
    id: `ref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: String(Array.isArray(work?.title) ? work.title[0] : work?.title || doi),
    authors,
    year: yearFromCrossrefDate(published),
    journal: String(Array.isArray(work?.['container-title']) ? work['container-title'][0] : work?.['container-title'] || ''),
    volume: String(work?.volume || ''),
    issue: String(work?.issue || ''),
    fp: String(pageParts[0] || ''),
    lp: String(pageParts.slice(1).join('-') || ''),
    doi,
    url: String(work?.URL || `https://doi.org/${doi}`),
    pdfUrl: '',
    labels: [],
    referenceType: 'article'
  };
}

// ───────────────────────────────────────────────────────────────────────────
// DOI / OA PDF fetchers (call electronAPI.netFetchJSON behind the scenes)
// ───────────────────────────────────────────────────────────────────────────

export async function fetchDoiReference(doi: string) {
  const crossref = await window.electronAPI?.netFetchJSON?.(
    `https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=academiq@example.com`,
    { timeoutMs: 12000 }
  ) as any;
  if (!crossref?.ok) throw new Error(String(crossref?.error || 'CrossRef yanit vermedi'));
  const ref = mapCrossrefWorkToReference(crossref.data?.message || {}, doi);
  try {
    const unpaywall = await window.electronAPI?.netFetchJSON?.(
      `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=academiq@example.com`,
      { timeoutMs: 12000 }
    ) as any;
    const data = unpaywall?.ok ? unpaywall.data : null;
    const locations = [
      data?.best_oa_location,
      ...(Array.isArray(data?.oa_locations) ? data.oa_locations : [])
    ].filter(Boolean);
    const pdfUrl = locations.map((item: any) => String(item?.url_for_pdf || item?.url || '')).find(Boolean);
    if (pdfUrl) ref.pdfUrl = pdfUrl;
  } catch (_error) {}
  return ref;
}

export async function resolveOpenAccessPdfUrls(doi: string) {
  const cleanDoi = normalizeDoiInput(doi);
  if (!cleanDoi) return [];
  const win = legacyWin() as any;
  if (typeof win.fetchOAUrls === 'function') {
    try {
      const urls = await win.fetchOAUrls(cleanDoi);
      if (Array.isArray(urls)) {
        const legacyUrls = urls.map((item) => String(item || '').trim()).filter(Boolean);
        if (legacyUrls.length) return Array.from(new Set(legacyUrls));
      }
    } catch (_error) {}
  }
  const [openAlex, unpaywall] = await Promise.allSettled([
    window.electronAPI?.netFetchJSON?.(
      `https://api.openalex.org/works/doi:${encodeURIComponent(cleanDoi)}`,
      { timeoutMs: 9000, allowAnyHost: true }
    ),
    window.electronAPI?.netFetchJSON?.(
      `https://api.unpaywall.org/v2/${encodeURIComponent(cleanDoi)}?email=academiq@example.com`,
      { timeoutMs: 9000, allowAnyHost: true }
    )
  ]);
  const candidates: string[] = [];
  if (openAlex.status === 'fulfilled') {
    const result = openAlex.value as any;
    const data = result?.ok ? result.data : null;
    const locations = Array.isArray(data?.locations) ? data.locations : [];
    candidates.push(
      String(data?.open_access?.oa_url || ''),
      ...locations.flatMap((item: any) => [
        String(item?.pdf_url || ''),
        String(item?.landing_page_url || '')
      ])
    );
  }
  if (unpaywall.status === 'fulfilled') {
    const result = unpaywall.value as any;
    const data = result?.ok ? result.data : null;
    const locations = [
      data?.best_oa_location,
      ...(Array.isArray(data?.oa_locations) ? data.oa_locations : [])
    ].filter(Boolean);
    candidates.push(...locations.flatMap((item: any) => [
      String(item?.url_for_pdf || ''),
      String(item?.url || '')
    ]));
  }
  const unique = Array.from(new Set(candidates.map((item) => item.trim()).filter(Boolean)));
  return [
    ...unique.filter((item) => /\.pdf($|[?#])|\/pdf(\/|$|[?#])|pdfdirect|epdf/i.test(item)),
    ...unique.filter((item) => !/\.pdf($|[?#])|\/pdf(\/|$|[?#])|pdfdirect|epdf/i.test(item))
  ];
}

export async function resolveOpenAccessPdfUrl(doi: string) {
  return (await resolveOpenAccessPdfUrls(doi))[0] || '';
}

export function collectOpenAccessPdfCandidates(state: AcademiqAppState) {
  return state.wss.flatMap((workspace) => (workspace.lib || [])
    .filter((reference) => {
      if (!reference || !reference.id) return false;
      if (reference.pdfAttached || reference.pdfData || reference.pdfPath) return false;
      return Boolean(String(reference.pdfUrl || '').trim() || normalizeDoiInput(String(reference.doi || '')));
    })
    .map((reference) => ({ workspaceId: workspace.id, workspaceName: workspace.name, reference })));
}

export async function countDownloadedPdfCandidates(
  state: AcademiqAppState,
  candidates: Array<{ workspaceId: string; workspaceName: string; reference: AcademiqReference }>
) {
  let count = 0;
  for (const candidate of candidates) {
    const workspace = state.wss.find((item) => item.id === candidate.workspaceId);
    const reference = (workspace?.lib || []).find((item) => item.id === candidate.reference.id) || candidate.reference;
    if (reference.pdfAttached || reference.pdfData || reference.pdfPath) {
      count++;
      continue;
    }
    try {
      const result = await window.electronAPI?.pdfExists?.(reference.id, { id: candidate.workspaceId, name: candidate.workspaceName }) as any;
      if (result === true || result?.exists === true || result?.found === true) count++;
    } catch (_error) {}
  }
  return count;
}
