import { describe, it, expect } from 'vitest';
import {
  noteTextForInsert,
  buildNoteInsertHTML,
  collectReferenceIdsFromHTML
} from './note-insert';
import type { AcademiqNote } from './app-state';

function note(overrides: Partial<AcademiqNote> = {}): AcademiqNote {
  return {
    id: 'n1',
    type: 'summary',
    txt: '',
    q: '',
    comment: '',
    sourceExcerpt: '',
    rid: '',
    sourcePage: '',
    tag: '',
    noteType: '',
    dt: '',
    ...overrides
  } as AcademiqNote;
}

describe('noteTextForInsert', () => {
  it('prefers txt over q/comment/sourceExcerpt', () => {
    expect(noteTextForInsert(note({ txt: 'X', q: 'Y', comment: 'Z', sourceExcerpt: 'W' }))).toBe('X');
  });

  it('falls back to q when no txt', () => {
    expect(noteTextForInsert(note({ q: 'Quote text' }))).toBe('Quote text');
  });

  it('falls back to comment', () => {
    expect(noteTextForInsert(note({ comment: 'Comment text' }))).toBe('Comment text');
  });

  it('falls back to sourceExcerpt', () => {
    expect(noteTextForInsert(note({ sourceExcerpt: 'Excerpt' }))).toBe('Excerpt');
  });

  it('returns empty when nothing usable', () => {
    expect(noteTextForInsert(note())).toBe('');
  });
});

describe('buildNoteInsertHTML', () => {
  it('returns empty for empty note', () => {
    expect(buildNoteInsertHTML(note())).toBe('');
  });

  it('builds paragraph + span wrapper for summary notes', () => {
    const html = buildNoteInsertHTML(note({ txt: 'Hello world.', noteType: 'summary' }));
    expect(html).toContain('<span class="aq-note-link"');
    expect(html).toContain('data-note-id="n1"');
    expect(html).toContain('data-note-type="summary"');
    expect(html).toContain('<p class="ni">Hello world.</p>');
    expect(html).not.toContain('<blockquote>');
  });

  it('wraps direct quote notes in blockquote', () => {
    const html = buildNoteInsertHTML(note({ txt: 'A quoted sentence.', noteType: 'direct_quote' }));
    expect(html).toContain('<blockquote>');
    expect(html).toContain('A quoted sentence.');
  });

  it('legacy highlight (type=hl) is treated as quote', () => {
    const html = buildNoteInsertHTML(note({ q: 'Highlight text', type: 'hl' }));
    expect(html).toContain('<blockquote>');
    expect(html).toContain('Highlight text');
  });

  it('splits paragraphs on blank lines + collapses whitespace', () => {
    const html = buildNoteInsertHTML(note({ txt: 'Para1.\n\nPara2  with\nlinebreak.', noteType: 'summary' }));
    expect(html).toContain('<p class="ni">Para1.</p>');
    expect(html).toContain('<p>Para2 with linebreak.</p>');
    // Only first paragraph gets the .ni class
  });

  it('includes data-note-ref when rid present', () => {
    const html = buildNoteInsertHTML(note({ txt: 'X', rid: 'ref-1' }));
    expect(html).toContain('data-note-ref="ref-1"');
  });

  it('includes data-note-page from sourcePage or tag', () => {
    const html1 = buildNoteInsertHTML(note({ txt: 'X', sourcePage: 's12' }));
    expect(html1).toContain('data-note-page="s12"');
    const html2 = buildNoteInsertHTML(note({ txt: 'X', tag: 'metodoloji' }));
    expect(html2).toContain('data-note-page="metodoloji"');
  });

  it('REGRESSION: HTML-escapes user content to block stored-XSS', () => {
    const html = buildNoteInsertHTML(note({
      id: '<script>id</script>',
      rid: '"><img src=x>',
      txt: '<script>alert(1)</script>',
      noteType: '<x>'
    }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('"><img');
    expect(html).toContain('data-note-id="&lt;script&gt;id&lt;/script&gt;"');
  });

  it('handles \\r\\n line endings (Word import path)', () => {
    const html = buildNoteInsertHTML(note({ txt: 'A.\r\n\r\nB.', noteType: 'summary' }));
    expect(html).toContain('<p class="ni">A.</p>');
    expect(html).toContain('<p>B.</p>');
  });
});

describe('collectReferenceIdsFromHTML', () => {
  it('returns empty set for empty/null input', () => {
    expect(collectReferenceIdsFromHTML('').size).toBe(0);
    expect(collectReferenceIdsFromHTML(null as any).size).toBe(0);
  });

  it('extracts data-ref ids', () => {
    const ids = collectReferenceIdsFromHTML('<span class="cit" data-ref="r1">cite</span>');
    expect(Array.from(ids)).toEqual(['r1']);
  });

  it('extracts data-aq-ref ids', () => {
    const ids = collectReferenceIdsFromHTML('<span data-aq-ref="r1">cite</span>');
    expect(Array.from(ids)).toEqual(['r1']);
  });

  it('splits comma-separated id lists', () => {
    const ids = collectReferenceIdsFromHTML('<span data-ref="r1, r2,r3">multi</span>');
    expect(Array.from(ids).sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it('extracts inline ref:xxx markers', () => {
    const ids = collectReferenceIdsFromHTML('referenced ref:r1 and id:r2 inline');
    expect(Array.from(ids).sort()).toEqual(['r1', 'r2']);
  });

  it('handles single + double quotes', () => {
    const ids1 = collectReferenceIdsFromHTML(`<span data-ref='r1'>x</span>`);
    expect(Array.from(ids1)).toEqual(['r1']);
    const ids2 = collectReferenceIdsFromHTML('<span data-ref="r2">x</span>');
    expect(Array.from(ids2)).toEqual(['r2']);
  });

  it('dedupes', () => {
    const ids = collectReferenceIdsFromHTML('<span data-ref="r1">a</span><span data-ref="r1, r2">b</span>');
    expect(Array.from(ids).sort()).toEqual(['r1', 'r2']);
  });
});
