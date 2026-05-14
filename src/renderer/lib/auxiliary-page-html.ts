/**
 * Auxiliary-Page HTML Builders
 *
 * Pure (or near-pure) HTML-string builders for the document's
 * non-body pages: TOC, cover, abstract, and appendices.
 *
 * Extracted from TopToolbar.tsx to keep the toolbar focused on UI state +
 * legacy-bridge wiring. These builders take all required input as plain
 * data so they're independently testable.
 *
 * Side-effecty pieces (touching window globals) are opted-into via the
 * `deps` parameter; in tests the builder falls back to a built-in
 * template when no legacy helper is provided.
 */
import { legacyWin } from './legacy-window';

// ───────────────────────────────────────────────────────────────────────────
// Shared HTML escape (kept local to avoid coupling to legacy-dom-helpers
// for what's a one-line utility)
// ───────────────────────────────────────────────────────────────────────────

function escapeAux(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ───────────────────────────────────────────────────────────────────────────
// TOC
// ───────────────────────────────────────────────────────────────────────────

/**
 * Build the TOC page HTML. Prefers the legacy `AQTipTapWordTOC` API
 * (AQ Engine path), then falls back to scanning the editor root's
 * heading elements. Returns '' when no headings exist.
 */
export function buildTOCPageHTML() {
  const win = legacyWin() as any;
  const activeEditor = win.editor || null;
  const tocApi = win.AQTipTapWordTOC;
  if (activeEditor?._aqEngine && typeof activeEditor._reflow === 'function') {
    activeEditor._reflow();
  }
  if (activeEditor?._docModel && tocApi && typeof tocApi.buildAQEngineTOCHTML === 'function') {
    const html = tocApi.buildAQEngineTOCHTML(activeEditor, {
      pageTotalHeight: 1155,
      idFactory: (index: number) => `aq-hdg-${index}`
    });
    if (String(html || '').trim()) return String(html);
  }
  const root = document.getElementById('apaed');
  const headings = root ? root.querySelectorAll('h1,h2,h3,h4,h5') : [];
  if (headings.length && tocApi && typeof tocApi.buildTOCHTML === 'function') {
    return String(tocApi.buildTOCHTML(root, headings, { pageTotalHeight: 1155 }) || '');
  }
  return '';
}

// ───────────────────────────────────────────────────────────────────────────
// Cover
// ───────────────────────────────────────────────────────────────────────────

export type CoverPayload = {
  title: string;
  author: string;
  institution: string;
  course: string;
  professor: string;
  /** Pre-rendered Turkish date string (e.g. "13 Mayıs 2026") */
  dateText: string;
};

/**
 * Build the APA-7 cover page HTML. Prefers the legacy
 * `AQTipTapWordTemplates.buildCoverHTML` template when available;
 * otherwise emits a built-in template.
 */
export function buildCoverPageHTML(payload: CoverPayload) {
  const win = legacyWin() as any;
  const builder = win.AQTipTapWordTemplates?.buildCoverHTML;
  if (typeof builder === 'function') {
    return String(builder(payload) || '');
  }
  const rows = [
    { text: payload.title, bold: true },
    { text: payload.author },
    { text: payload.institution },
    { text: payload.course },
    { text: payload.professor },
    { text: payload.dateText }
  ].filter((row) => row.text);
  return [
    '<div style="text-align:center;padding-top:192px;font-family:&quot;Times New Roman&quot;,Times,serif;font-size:12pt;line-height:2;">',
    ...rows.map((row) => `<p style="text-indent:0;${row.bold ? 'font-weight:bold;' : ''}">${escapeAux(row.text)}</p>`),
    '</div><p><br></p>'
  ].join('');
}

/** Build today's date in the Turkish long form ("13 Mayıs 2026"). */
export function turkishToday(date = new Date()) {
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ───────────────────────────────────────────────────────────────────────────
// Abstract (Turkish only)
// ───────────────────────────────────────────────────────────────────────────

export type AbstractPayload = {
  text: string;
  keywords: string;
};

function joinKeywords(commaList: string) {
  return commaList.split(',').map((item) => item.trim()).filter(Boolean).join(', ');
}

/**
 * Build the Turkish-only Öz page HTML. Used when the user only fills
 * the Turkish abstract fields and not the English ones.
 */
export function buildAbstractPageHTML(payload: AbstractPayload) {
  const body = escapeAux(payload.text.trim());
  const keywords = joinKeywords(payload.keywords);
  return [
    '<div data-aq-abstract="1" style="font-family:&quot;Times New Roman&quot;,Times,serif;font-size:12pt;line-height:2;color:#000;">',
    '<h1 style="text-align:center;font-family:&quot;Times New Roman&quot;,Times,serif;font-size:12pt;line-height:2;font-weight:bold;margin:0 0 16px 0;">Öz</h1>',
    `<p class="aq-abstract-text" style="text-indent:0!important;margin:0;text-align:left;">${body}</p>`,
    keywords ? `<p class="aq-abstract-keywords" style="text-indent:36pt!important;margin:0;text-align:left;"><em>Anahtar Kelimeler:</em> ${escapeAux(keywords)}</p>` : '',
    '</div>'
  ].join('');
}

export type BilingualAbstractPayload = {
  turkish: AbstractPayload;
  english: AbstractPayload;
};

/**
 * Build the bilingual Öz + Abstract page HTML. The English section is
 * omitted entirely if `english.text` is empty; the keywords paragraph
 * is omitted independently per language if the keyword field is empty.
 */
export function buildBilingualAbstractPageHTML(payload: BilingualAbstractPayload) {
  const trBody = escapeAux(payload.turkish.text.trim());
  const trKeywords = joinKeywords(payload.turkish.keywords);
  const enBody = escapeAux(payload.english.text.trim());
  const enKeywords = joinKeywords(payload.english.keywords);
  return [
    '<div data-aq-abstract="1" style="font-family:&quot;Times New Roman&quot;,Times,serif;font-size:12pt;line-height:2;color:#000;">',
    '<section data-aq-abstract-section="tr">',
    '<h1 style="text-align:center;font-family:&quot;Times New Roman&quot;,Times,serif;font-size:12pt;line-height:2;font-weight:bold;margin:0 0 16px 0;">Öz</h1>',
    `<p style="text-indent:0;margin:0;text-align:left;">${trBody}</p>`,
    trKeywords ? `<p style="text-indent:36pt;margin:0;text-align:left;"><em>Anahtar Kelimeler:</em> ${escapeAux(trKeywords)}</p>` : '',
    '</section>',
    enBody ? '<section data-aq-abstract-section="en" style="margin-top:24pt;">' : '',
    enBody ? '<h1 style="text-align:center;font-family:&quot;Times New Roman&quot;,Times,serif;font-size:12pt;line-height:2;font-weight:bold;margin:0 0 16px 0;">Abstract</h1>' : '',
    enBody ? `<p class="aq-abstract-text" style="text-indent:0!important;margin:0;text-align:left;">${enBody}</p>` : '',
    enBody && enKeywords ? `<p class="aq-abstract-keywords" style="text-indent:36pt!important;margin:0;text-align:left;"><em>Keywords:</em> ${escapeAux(enKeywords)}</p>` : '',
    enBody ? '</section>' : '',
    '</div>'
  ].join('');
}

// ───────────────────────────────────────────────────────────────────────────
// Appendices
// ───────────────────────────────────────────────────────────────────────────

/** Count appendix blocks in an HTML string (by class or "EK-N" title). */
export function getAppendixCount(html: string) {
  if (!html.trim()) return 0;
  const matches = html.match(/class=["'][^"']*\bappendix-block\b[^"']*["']/gi);
  if (matches?.length) return matches.length;
  const titleMatches = html.match(/>\s*EK-\d+\s*</gi);
  return titleMatches?.length || 0;
}

/**
 * Build the HTML for a single appendix block. Prefers the legacy
 * `window.buildAppendixHTML` builder when present.
 */
export function buildAppendixBlockHTML(index: number) {
  const builder = (legacyWin() as any).buildAppendixHTML;
  if (typeof builder === 'function') return String(builder(index) || '');
  return [
    `<div class="appendix-block" data-appendix-id="appendix-${index}">`,
    `<h1 class="appendix-title" style="text-align:center;font-weight:bold;">EK-${index}</h1>`,
    '<p class="ni">Ek içeriği...</p>',
    '</div>'
  ].join('');
}

/**
 * Pass `html` through the legacy `window.renumberAppendicesHTML` if
 * available, then through `sanitizeFn`. Returns the result.
 */
export function normalizeAppendicesHTML(html: string, sanitizeFn: (html: string) => string) {
  const renumber = (legacyWin() as any).renumberAppendicesHTML;
  const normalized = typeof renumber === 'function' ? renumber(html) : html;
  return sanitizeFn(normalized);
}

/**
 * Remove a single appendix block from an HTML string by id and
 * re-normalize the result. Returns '' for empty input.
 */
export function removeAppendixFromHTML(
  html: string,
  appendixId: string,
  sanitizeFn: (html: string) => string
) {
  const current = String(html || '').trim();
  if (!current || typeof document === 'undefined') return '';
  const div = document.createElement('div');
  div.innerHTML = current;
  const target = div.querySelector(`.appendix-block[data-appendix-id="${appendixId}"]`);
  if (target) target.remove();
  return normalizeAppendicesHTML(div.innerHTML, sanitizeFn);
}
