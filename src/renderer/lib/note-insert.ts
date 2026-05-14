/**
 * Note Insert Helpers
 *
 * Helpers for converting an AcademiqNote into HTML that the editor can
 * insert. Extracted from App.tsx. The output is a `<span class="aq-note-link">`
 * with data attributes that legacy editor code uses to detect and style
 * the insertion as a note (and link it back via note id / ref id).
 *
 * Direct quotes get wrapped in <blockquote>; summary notes are paragraph(s).
 */
import type { AcademiqNote } from './app-state';
import { escapeHtml } from './legacy-dom-helpers';

export function noteTextForInsert(note: AcademiqNote) {
  return String(note.txt || note.q || note.comment || note.sourceExcerpt || '').trim();
}

export function buildNoteInsertHTML(note: AcademiqNote) {
  const text = noteTextForInsert(note);
  if (!text) return '';
  const noteId = escapeHtml(note.id);
  const attrs = [
    `data-note-id="${noteId}"`,
    note.rid ? `data-note-ref="${escapeHtml(note.rid)}"` : '',
    note.sourcePage || note.tag ? `data-note-page="${escapeHtml(note.sourcePage || note.tag)}"` : '',
    note.noteType || note.type ? `data-note-type="${escapeHtml(note.noteType || note.type)}"` : ''
  ].filter(Boolean).join(' ');
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((part) => part.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((part, index) => `<p${index === 0 ? ' class="ni"' : ''}>${escapeHtml(part)}</p>`)
    .join('');
  const isQuote = note.noteType === 'direct_quote' || note.type === 'hl' || Boolean(note.q);
  const body = isQuote ? `<blockquote>${paragraphs}</blockquote>` : paragraphs;
  return `<span class="aq-note-link" ${attrs}>${body}</span>`;
}

/**
 * Extract `data-ref` / `data-aq-ref` attribute values + inline `ref:xxx`
 * markers from an editor HTML snippet. Used to detect which references
 * a piece of content cites.
 */
export function collectReferenceIdsFromHTML(html: string) {
  const ids = new Set<string>();
  const source = String(html || '');
  const addIds = (raw: string) => {
    raw.split(',').map((id) => id.trim()).filter(Boolean).forEach((id) => ids.add(id));
  };
  source.replace(/\b(?:data-ref|data-aq-ref)\s*=\s*(['"])(.*?)\1/gi, (_match, _quote, raw) => {
    addIds(String(raw || ''));
    return _match;
  });
  source.replace(/\b(?:ref|id)\s*:\s*(['"]?)([A-Za-z0-9_:-]+)\1/gi, (_match, _quote, raw) => {
    addIds(String(raw || ''));
    return _match;
  });
  return ids;
}
