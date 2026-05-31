/**
 * Reference data domain — pure, dependency-free ports of the legacy
 * `legacy-runtime.js` reference helpers (apa7, fa/fal/fT, refKey,
 * dedupeRefs, sortLib, filterRefsForQuery, normalizeRef*).
 *
 * These are the APA-7 / generic implementations. Style-specific output
 * (Chicago, Vancouver, IEEE, MLA) still lives in the legacy
 * `window.AQCitationStyles` module; the editor seam delegates to it when
 * present and falls back to these functions otherwise.
 *
 * Behaviour is a faithful 1:1 port of the legacy functions (same regexes,
 * same string assembly, same Turkish-locale sort) so output is identical;
 * see `reference-format.test.ts` for the characterization suite.
 *
 * Part of the strangler migration off the legacy runtime: prefer importing
 * from here instead of calling `window.apa7` / `callLegacy('formatRef')`.
 */

export interface ReferenceLike {
  id?: string;
  title?: string;
  authors?: string[];
  year?: string;
  doi?: string;
  isbn?: string;
  url?: string;
  journal?: string;
  publisher?: string;
  websiteName?: string;
  referenceType?: string;
  volume?: string;
  issue?: string;
  fp?: string;
  lp?: string;
  edition?: string;
  publishedDate?: string;
  accessedDate?: string;
  [key: string]: unknown;
}

export type ReferenceType = 'article' | 'book' | 'website';

/** Legacy `normalizeRefTypeValue`. */
export function normalizeReferenceType(value: unknown): ReferenceType {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'book' || raw === 'website' || raw === 'article') return raw;
  return 'article';
}

/** Legacy `normalizeRefDoi`. Returns a lowercase bare DOI or ''. */
export function normalizeDoi(value: unknown): string {
  let raw = String(value ?? '').trim();
  if (!raw) return '';
  try { raw = decodeURIComponent(raw); } catch { /* keep raw */ }
  raw = raw
    .replace(/^doi:\s*/i, '')
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, '')
    .replace(/[)\].,;:]+$/g, '');
  const m = raw.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  let doi = m && m[0] ? m[0] : raw;
  doi = doi
    .replace(/[)\].,;:]+$/g, '')
    .replace(/(?:\/|\.)(BIBTEX|RIS|ABSTRACT|FULLTEXT|FULL|PDF|XML|HTML|EPUB)$/i, '')
    .replace(/\/[A-Za-z]$/, '')
    .trim();
  if (!/^10\.\d{4,9}\//i.test(doi)) return '';
  return doi.toLowerCase();
}

/** Legacy `normalizeRefIsbn` (pure fallback; without the AQReferenceParse delegation). */
export function normalizeIsbn(value: unknown): string {
  const raw = String(value ?? '').trim().replace(/[^\dXx]/g, '').toUpperCase();
  if (raw.length !== 10 && raw.length !== 13) return '';
  return raw;
}

/** Legacy `fa` — format a single author as "Surname, A. B.". */
export function formatAuthor(author: unknown): string {
  if (!author) return '';
  const r = String(author).trim();
  if (!r) return '';
  if (r.includes(',')) {
    const parts = r.split(',');
    const last = parts[0].trim();
    const rest = (parts[1] || '').trim();
    if (!rest) return last;
    return last + ', ' + rest.split(/\s+/).filter(Boolean).map((n) => n[0].toUpperCase() + '.').join(' ');
  }
  const parts = r.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return last + ', ' + parts.slice(0, -1).map((n) => n[0].toUpperCase() + '.').join(' ');
}

/** Legacy `fal` — format an author list with "&" and 20+ ellipsis rule. */
export function formatAuthorList(authors: unknown): string {
  const list = Array.isArray(authors) ? authors : [];
  if (!list.length) return '';
  const f = list.map(formatAuthor).filter(Boolean);
  if (f.length === 1) return f[0];
  if (f.length <= 20) return f.slice(0, -1).join(', ') + ' & ' + f[f.length - 1];
  return f.slice(0, 19).join(', ') + ', . . . & ' + f[f.length - 1];
}

/** Legacy `fT` — sentence-case a title (Turkish-letter aware), as legacy `toUpperCase`. */
export function formatTitle(title: unknown): string {
  const t = String(title ?? '');
  if (!t) return '';
  return t.toLowerCase().replace(/(^|\.\s+|:\s*)([a-zçğıöşüâîû])/g, (_m, p: string, c: string) => p + c.toUpperCase());
}

/** Legacy `apa7` — full APA-7 reference string (may contain `<i>` tags). */
export function apa7Reference(ref: ReferenceLike | null | undefined): string {
  const d = ref || {};
  const type = normalizeReferenceType(d.referenceType || '');
  let c = '';
  let a = formatAuthorList(d.authors || []);
  if (!a && d.title) a = formatTitle(d.title);
  if (a) c += a + ' ';

  if (type === 'book') {
    c += '(' + (d.year || 't.y.') + '). ';
    if (d.title) c += '<i>' + formatTitle(d.title).replace(/[.]+$/, '') + '</i>. ';
    if (d.edition) {
      const ed = String(d.edition || '').replace(/[.]+$/, '');
      c += '(' + (ed + (/\bed\.?$/i.test(String(d.edition || '')) ? '' : ' ed.')) + '). ';
    }
    if (d.publisher) c += String(d.publisher || '').replace(/[.]+$/, '') + '. ';
    if (d.doi) c += 'https://doi.org/' + d.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
    else if (d.url) c += d.url;
    return c.trim();
  }

  if (type === 'website') {
    const dateLabel = d.publishedDate || d.year || 't.y.';
    c += '(' + dateLabel + '). ';
    if (d.title) c += formatTitle(d.title) + '. ';
    if (d.websiteName) c += '<i>' + String(d.websiteName || '').replace(/[.]+$/, '') + '</i>. ';
    if (d.accessedDate && d.url) c += 'Retrieved ' + d.accessedDate + ', from ' + d.url;
    else if (d.url) c += d.url;
    return c.trim();
  }

  c += '(' + (d.year || 't.y.') + '). ';
  c += formatTitle(d.title || '') + '. ';
  if (d.journal) {
    c += '<i>' + d.journal + '</i>';
    if (d.volume) {
      c += ', <i>' + d.volume + '</i>';
      if (d.issue) c += '(' + d.issue + ')';
    }
    if (d.fp) {
      c += ', ' + d.fp;
      if (d.lp) c += '–' + d.lp;
    }
    c += '. ';
  }
  if (d.doi) c += 'https://doi.org/' + d.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  else if (d.url) c += d.url;
  return c.trim();
}

export type InlineCitationMode = 'inline' | 'textual' | 'footnote_explicit';

/** Legacy `inText` — APA in-text citation. */
export function apaInlineCitation(ref: ReferenceLike | null | undefined, mode: InlineCitationMode = 'inline'): string {
  const d = ref || {};
  const au = (d.authors || []).map(formatAuthor).filter(Boolean);
  const ls = au.map((x) => x.split(',')[0].trim());
  const ap = ls.length === 0 ? 'Bilinmeyen'
    : ls.length === 1 ? ls[0]
    : ls.length === 2 ? ls[0] + ' & ' + ls[1]
    : ls[0] + ' vd.';
  const yr = d.year || 't.y.';
  if (mode === 'textual') return ap + ' (' + yr + ')';
  return mode === 'footnote_explicit' ? ap + ', ' + yr + '.' : '(' + ap + ', ' + yr + ')';
}

/** Legacy `refKey` — dedup key (doi:/isbn:/meta:/id:). */
export function referenceKey(ref: ReferenceLike | null | undefined): string {
  if (!ref) return '';
  const doi = normalizeDoi(ref.doi || '');
  if (doi) return 'doi:' + doi;
  const isbn = normalizeIsbn(ref.isbn || '');
  if (isbn) return 'isbn:' + isbn;
  const type = normalizeReferenceType(ref.referenceType || 'article');
  const title = String(ref.title || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const year = (ref.year || '').trim().toLowerCase();
  const author = (ref.authors && ref.authors[0] ? ref.authors[0] : '').trim().replace(/\s+/g, ' ').toLowerCase();
  // Only emit a strong meta key when there's enough signal, to avoid false
  // PDF/dedup collisions on weak metadata.
  if (title.length < 8) return 'id:' + String(ref.id || '');
  if (!author && !year) return 'id:' + String(ref.id || '');
  return 'meta:' + type + '|' + author + '|' + year + '|' + title;
}

/** Legacy `dedupeRefs`. */
export function dedupeReferences<T extends ReferenceLike>(refs: T[] | null | undefined): T[] {
  const seen: Record<string, boolean> = {};
  return (refs || []).filter((ref) => {
    const key = referenceKey(ref) || ('id:' + (ref && ref.id || ''));
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

/** Legacy `authorSearchText`. */
export function authorSearchText(authors: unknown): string {
  const list = Array.isArray(authors) ? authors : [];
  return list.map((author) => {
    const raw = String(author ?? '').trim();
    if (!raw) return '';
    if (raw.includes(',')) {
      const parts = raw.split(',');
      return (parts[0] + ' ' + (parts[1] || '')).toLowerCase();
    }
    return raw.toLowerCase();
  }).join(' ');
}

/** Legacy `apaSortKey`. */
export function apaSortKey(ref: ReferenceLike | null | undefined): string {
  const d = ref || {};
  const authors = (d.authors || []).map((a) => formatAuthor(String(a ?? ''))).filter(Boolean);
  const lead = authors[0] || '';
  const surname = lead ? lead.split(',')[0].trim() : '';
  const given = lead && lead.indexOf(',') >= 0 ? lead.split(',').slice(1).join(',').trim() : '';
  const year = String(d.year || '9999').trim().toLowerCase();
  const title = String(d.title || '').trim().toLowerCase();
  const fullCitation = apa7Reference(d).toLowerCase();
  return [surname.toLowerCase(), given.toLowerCase(), year, title, fullCitation].join('||');
}

/** Legacy `sortLib` default (APA) path — Turkish-locale numeric sort. */
export function sortReferencesApa<T extends ReferenceLike>(refs: T[] | null | undefined): T[] {
  const list = (refs || []).slice();
  return list.sort((a, b) => apaSortKey(a).localeCompare(apaSortKey(b), 'tr', { numeric: true, sensitivity: 'base' }));
}

/** Legacy `filterRefsForQuery` — dedupe + token AND-match + sort. */
export function filterReferencesForQuery<T extends ReferenceLike>(refs: T[] | null | undefined, query: string): T[] {
  const q = (query || '').toLowerCase().trim();
  const deduped = dedupeReferences(refs || []);
  if (!q) return sortReferencesApa(deduped);
  const tokens = q.split(/\s+/).filter(Boolean);
  return sortReferencesApa(deduped.filter((r) => {
    const authors = r.authors || [];
    const authorHay = authorSearchText(authors);
    const compactAuthors = authors.join(' ').toLowerCase().replace(/[,.\s]+/g, ' ');
    const initials = authors.map((author) =>
      String(author ?? '').replace(/,/g, ' ').split(/\s+/).filter(Boolean).map((part) => part.charAt(0).toLowerCase()).join('')
    ).join(' ');
    const hay = [
      r.title || '',
      authorHay,
      compactAuthors,
      initials,
      r.year || '',
      r.doi || '',
      r.journal || '',
      r.publisher || '',
      r.websiteName || '',
      r.referenceType || '',
      r.volume || '',
      r.issue || '',
    ].join(' ').toLowerCase();
    return tokens.every((token) => hay.indexOf(token) >= 0);
  }));
}
