/**
 * External Reference Import — APA / BibTeX / RIS / DOI parsers + dispatchers.
 *
 * Extracted from LegacyCompatibilityHost.tsx. These functions read user
 * input from the legacy DOM modals (#externalReferenceImportModal) and
 * push the parsed entries to the renderer via either:
 *   - window.importReferenceEntries(...)  (legacy helper, if present)
 *   - CustomEvent('aq:import-references', { detail: ... })  (React listener)
 *
 * Also includes a built-in APA-7 fallback parser used when the legacy
 * parsers aren't loaded.
 *
 * Bug fixed during extraction: the original code had four "AQReferenceParseç"
 * typos (stray ç after Parse). When window.normalizeRefDoi / parseBibTeX
 * /parseRIS / parseApaReferenceText weren't available, the typo'd property
 * access on undefined threw, masked by try/catch. The fallback chain
 * looked correct but never fired.
 */

import type { ChangeEvent } from 'react';
import { legacyWin } from './legacy-window';
import { syncReactFromLegacy } from './legacy-dom-helpers';
import { appStore, selectCurrentWorkspaceId } from './app-store';

type StatusFn = (message: string) => void;

function setExternalImportStatus(message: string) {
  const status = document.getElementById('externalReferenceImportStatus');
  if (status) status.textContent = message;
}

function syncAfterExternalImport() {
  [250, 900, 1800].forEach((delay) => window.setTimeout(syncReactFromLegacy, delay));
}

function normalizeExternalDoi(value: string) {
  const win = legacyWin();
  const normalizeRefDoi = (win as any).normalizeRefDoi as ((v: string) => string) | undefined;
  if (typeof normalizeRefDoi === 'function') {
    const result = normalizeRefDoi(value);
    if (result) return String(result);
  }
  const refParse = win.AQReferenceParse;
  if (refParse && typeof refParse.normalizeDoi === 'function') {
    const result = refParse.normalizeDoi(value);
    if (result) return String(result);
  }
  const match = String(value || '').match(/\b10\.\d{4,9}\/[^\s"'<>]+/i);
  return match ? match[0].replace(/[),.;]+$/, '') : '';
}

function activeWorkspaceId(): string {
  return selectCurrentWorkspaceId(appStore.getState());
}

/** APA-7 fallback parser — splits on blank lines + "Author, X." boundaries. */
function parseApaFallbackEntries(text: string) {
  const win = legacyWin();
  const createId = () => (typeof (win as any).uid === 'function'
    ? (win as any).uid()
    : `ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const chunks = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n|(?=\n?[A-ZÇĞİÖŞÜ][^.\n]{1,120},\s*[A-ZÇĞİÖŞÜ]\.)/g)
    .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return chunks.map((chunk) => {
    const yearMatch = chunk.match(/\((\d{4}[a-z]?|n\.d\.)\)/i);
    const doi = normalizeExternalDoi(chunk);
    if (!yearMatch && !doi) return null;
    const beforeYear = yearMatch ? chunk.slice(0, yearMatch.index).trim().replace(/[.;,\s]+$/, '') : '';
    const afterYear = yearMatch ? chunk.slice((yearMatch.index || 0) + yearMatch[0].length).trim() : chunk;
    const titleMatch = afterYear.match(/^\.?\s*([^.]*(?:\.[^A-ZÇĞİÖŞÜ0-9][^.]*)?)\./);
    const title = String(titleMatch?.[1] || afterYear.split(/\s+(?:https?:\/\/|doi:|10\.)/i)[0] || doi || chunk)
      .replace(/\s+/g, ' ')
      .replace(/[.;,\s]+$/, '')
      .trim();
    const authors = beforeYear
      ? beforeYear.split(/\s*&\s*|\s+and\s+|;\s*/i).map((part) => part.replace(/[.;\s]+$/, '').trim()).filter(Boolean)
      : [];
    if (!title && !doi) return null;
    return {
      id: createId(),
      title: title || doi,
      authors,
      year: yearMatch ? yearMatch[1] : '',
      doi,
      url: doi ? `https://doi.org/${doi}` : '',
      wsId: activeWorkspaceId()
    };
  }).filter(Boolean);
}

/** Parse raw text using legacy BibTeX/RIS/APA parsers or fall back to local APA parser. */
export function parseExternalReferenceText(text: string, kind: 'auto' | 'bibtex' | 'ris' | 'apa' = 'auto') {
  const win = legacyWin();
  const raw = String(text || '').trim();
  if (!raw) return [];
  const options = { createId: (win as any).uid, workspaceId: activeWorkspaceId() };
  const looksBib = /@\w+\s*\{/i.test(raw);
  const looksRis = /(^|\n)TY\s*-\s*/i.test(raw);
  const refParse = win.AQReferenceParse;
  const parseBibTeX = (win as any).parseBibTeX || refParse?.parseBibTeX;
  const parseRIS = (win as any).parseRIS || refParse?.parseRIS;
  const parseApaReferenceText = (win as any).parseApaReferenceText || refParse?.parseApaReferenceText;

  if ((kind === 'bibtex' || (kind === 'auto' && looksBib)) && typeof parseBibTeX === 'function') {
    return parseBibTeX(raw, options) || [];
  }
  if ((kind === 'ris' || (kind === 'auto' && looksRis)) && typeof parseRIS === 'function') {
    return parseRIS(raw, options) || [];
  }
  const parsed = typeof parseApaReferenceText === 'function'
    ? parseApaReferenceText(raw, options) || []
    : [];
  return parsed.length ? parsed : parseApaFallbackEntries(raw);
}

/**
 * Hand off parsed entries to React persistence.
 *
 * The legacy importer mutates `window.S` and saves on a debounce. In the React
 * shell that can race with autosave and write an older state_blob back over the
 * freshly imported references. Parsed entries therefore go through
 * `aq:import-references`, whose App.tsx listener calls persistState
 * immediately.
 */
export function importExternalEntries(entries: any[], sourceLabel: string, onStatus: StatusFn) {
  if (!entries.length) {
    setExternalImportStatus('Kaynak bulunamadı.');
    return;
  }
  try {
    window.dispatchEvent(new CustomEvent('aq:import-references', {
      detail: { entries, sourceLabel, includeInBibliography: true, revealBibliography: true }
    }));
    const message = `${sourceLabel}: ${entries.length} kaynak bulundu, kaydediliyor...`;
    setExternalImportStatus(message);
    onStatus(message);
  } catch (error) {
    console.error('[external-reference-import]', error);
    setExternalImportStatus(`${sourceLabel} aktarılamadı.`);
    onStatus(`${sourceLabel} aktarılamadı`);
  }
}

/** Read the #externalReferenceTextInput textarea, parse as APA, and import. */
export function runExternalReferenceTextImport(onStatus: StatusFn) {
  const input = document.getElementById('externalReferenceTextInput') as HTMLTextAreaElement | null;
  const raw = String(input?.value || '').trim();
  if (!raw) {
    setExternalImportStatus('APA kaynak metni bos.');
    return;
  }
  const entries = parseExternalReferenceText(raw, 'apa');
  if (!entries.length) {
    setExternalImportStatus('Kaynak bulunamadı. APA 7 kaynakça satırı, DOI, BibTeX/RIS dosyası veya DOI alanını kullan.');
    return;
  }
  importExternalEntries(entries, 'APA metin', onStatus);
  if (input) input.value = '';
}

/** Read #externalReferenceBibRisInput, auto-detect format, import. */
export function runExternalReferenceBibliographyTextImport(onStatus: StatusFn) {
  const input = document.getElementById('externalReferenceBibRisInput') as HTMLTextAreaElement | null;
  const raw = String(input?.value || '').trim();
  if (!raw) {
    setExternalImportStatus('BibTeX/RIS metni bos.');
    return;
  }
  const entries = parseExternalReferenceText(raw, 'auto');
  if (!entries.length) {
    setExternalImportStatus('BibTeX/RIS kaynağı bulunamadı.');
    return;
  }
  importExternalEntries(entries, /@\w+\s*\{/i.test(raw) ? 'BibTeX' : 'RIS', onStatus);
  if (input) input.value = '';
}

/** File upload handler for .bib / .ris / .csl-json files. */
export function runExternalReferenceFileImport(event: ChangeEvent<HTMLInputElement>, onStatus: StatusFn) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  const win = legacyWin();
  try {
    const importExternalReferenceFile = (win as any).importExternalReferenceFile as ((evt: Event) => void) | undefined;
    if (typeof importExternalReferenceFile === 'function') {
      importExternalReferenceFile(event.nativeEvent || (event as unknown as Event));
      setExternalImportStatus('Dosya isleniyor...');
      syncAfterExternalImport();
      return;
    }
    const importFromFileInput = (win as any).__importFromFileInput as
      | ((evt: { target: HTMLInputElement }, opts: any) => void)
      | undefined;
    if (typeof importFromFileInput === 'function') {
      importFromFileInput({ target: input }, {
        allowJson: false,
        prefix: 'Dış kaynak dosyası',
        includeInBibliography: true,
        revealBibliography: true
      });
      setExternalImportStatus('Dosya isleniyor...');
      syncAfterExternalImport();
      return;
    }
    onStatus('Dış kaynak dosyası aktarımı hazır değil');
    setExternalImportStatus('Dosya aktarımı hazır değil.');
  } catch (error) {
    console.error('[external-reference-file]', error);
    onStatus('Dış kaynak dosyası aktarılamadı');
    setExternalImportStatus('Dosya aktarılamadı.');
  }
}

/** Read #externalReferenceDoiInput, fetch metadata, import. */
export function runExternalReferenceDoiImport(onStatus: StatusFn) {
  const input = document.getElementById('externalReferenceDoiInput') as HTMLTextAreaElement | null;
  if (!String(input?.value || '').trim()) {
    setExternalImportStatus('DOI alani bos.');
    return;
  }
  try {
    const win = legacyWin();
    const importExternalReferenceDoi = (win as any).importExternalReferenceDoi as (() => void) | undefined;
    if (typeof importExternalReferenceDoi === 'function') {
      importExternalReferenceDoi();
      syncAfterExternalImport();
      return;
    }
    onStatus('DOI aktarımı hazır değil');
    setExternalImportStatus('DOI aktarımı hazır değil.');
  } catch (error) {
    console.error('[external-reference-doi]', error);
    onStatus('DOI kaynak aktarımı başarısız');
    setExternalImportStatus('DOI aktarım hatası.');
  }
}
