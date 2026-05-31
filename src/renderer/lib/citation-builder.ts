import { ReferenceLike, apa7Reference, apaInlineCitation, dedupeReferences } from './reference-format';

type LegacyWindow = any;

export function getCurrentDocument(win: LegacyWindow): any | null {
  const state = win.S || {};
  const docs = Array.isArray(state.docs) ? state.docs : [];
  const docId = state.curDoc || state.doc || '';
  if (win.AQBibliographyState && typeof win.AQBibliographyState.getCurrentDocumentFromState === 'function') {
    return win.AQBibliographyState.getCurrentDocumentFromState(state, docId);
  }
  if (win.AQBibliographyState && typeof win.AQBibliographyState.getCurrentDocument === 'function') {
    return win.AQBibliographyState.getCurrentDocument(docs, docId);
  }
  return docs.find((doc: any) => doc && doc.id === docId) || docs[0] || null;
}

export function getCitationStyle(win: LegacyWindow): string {
  const doc = getCurrentDocument(win);
  const raw = doc?.citationStyle || (win.S as any)?.citationStyle || win.S?.cm || 'apa7';
  if (win.AQCitationStyles && typeof win.AQCitationStyles.normalizeStyleId === 'function') {
    return win.AQCitationStyles.normalizeStyleId(String(raw || 'apa7'));
  }
  return String(raw || 'apa7').trim().toLowerCase() || 'apa7';
}

export function setCitationStyle(win: LegacyWindow, styleId: unknown): string | null {
  const doc = getCurrentDocument(win);
  if (!doc) return null;
  if (win.AQCitationStyles && typeof win.AQCitationStyles.normalizeStyleId === 'function') {
    doc.citationStyle = win.AQCitationStyles.normalizeStyleId(styleId);
  } else {
    doc.citationStyle = String(styleId || 'apa7').trim().toLowerCase() || 'apa7';
  }
  return doc.citationStyle;
}

export function getInlineCitationText(win: LegacyWindow, ref: ReferenceLike): string {
  if (!ref) return '';
  if (win.AQCitationStyles && typeof win.AQCitationStyles.visibleCitationText === 'function') {
    return win.AQCitationStyles.visibleCitationText([ref], { style: getCitationStyle(win) });
  }
  // Faithful APA-7 in-text fallback (legacy `inText`): uses author SURNAME
  // (not the given name), with Bilinmeyen / & / vd. and t.y. handling.
  return apaInlineCitation(ref, 'inline');
}

export function visibleCitationText(win: LegacyWindow, refs: any[]): string {
  const list = dedupeReferences(Array.isArray(refs) ? refs : []);
  if (win.AQCitationStyles && typeof win.AQCitationStyles.visibleCitationText === 'function') {
    return win.AQCitationStyles.visibleCitationText(list, { style: getCitationStyle(win) });
  }
  return list.map((ref) => String(getInlineCitationText(win, ref)).replace(/^\(|\)$/g, '')).filter(Boolean).join('; ');
}

export function authorSurname(author: unknown): string {
  const text = String(author || '').trim();
  if (!text) return '';
  if (text.includes(',')) return text.split(',')[0].trim();
  return text.split(/\s+/).filter(Boolean).pop() || '';
}

export function narrativeCitationText(ref: ReferenceLike): string {
  const authors = Array.isArray(ref?.authors) ? ref.authors : (ref?.authors ? [ref.authors] : []);
  const surnames = authors.map(authorSurname).filter(Boolean);
  const label = surnames.length === 0
    ? String(ref?.title || ref?.id || 'Kaynak')
    : surnames.length === 1
      ? surnames[0]
      : surnames.length === 2
        ? `${surnames[0]} & ${surnames[1]}`
        : `${surnames[0]} vd.`;
  return `${label}${ref?.year ? ` (${String(ref.year)})` : ''}`;
}

export function buildCitationHTML(win: LegacyWindow, refs: any[], sortFn: (win: LegacyWindow, items: any[]) => any[]): string {
  const normalized = sortFn(win, dedupeReferences(Array.isArray(refs) ? refs : []));
  if (!normalized.length) return '';
  if ((win as any).AQCitationState && typeof (win as any).AQCitationState.buildCitationHTML === 'function') {
    return (win as any).AQCitationState.buildCitationHTML(normalized, {
      citationStyles: win.AQCitationStyles || null,
      styleId: getCitationStyle(win),
      dedupeReferences: (items: any[]) => dedupeReferences(items),
      sortReferences: (items: any[]) => sortFn(win, items)
    });
  }
  const ids = normalized.map((ref) => ref.id).join(',');
  return `<span class="cit" data-ref="${ids}">${visibleCitationText(win, normalized)}</span> `;
}

export function formatReference(win: LegacyWindow, ref: any, options?: Record<string, unknown>): string {
  if (win.AQCitationStyles && typeof win.AQCitationStyles.formatReference === 'function') {
    return win.AQCitationStyles.formatReference(ref, {
      ...(options || {}),
      style: getCitationStyle(win)
    });
  }
  return apa7Reference(ref);
}

export function buildBibliographyHTML(win: LegacyWindow, refs: any[], sortFn: (win: LegacyWindow, items: any[]) => any[]): string {
  const sorted = sortFn(win, dedupeReferences(refs || []));
  if (!sorted.length) return '';
  return '<h1>KAYNAKÇA</h1>' + sorted.map((ref, idx) => `<p class="refe">${formatReference(win, ref, { index: idx + 1 })}</p>`).join('');
}
