import { describe, it, expect, afterEach } from 'vitest';
import {
  computeActiveMarks,
  activeMarksEqual,
  ACTIVE_MARK_KEYS,
  type ActiveMarks
} from './editor-active-marks';

afterEach(() => {
  delete (window as any).editor;
});

function fakeEditor(activeMap: Record<string, true | { textAlign?: string; level?: number }>) {
  return {
    isActive(nameOrAttrs: unknown, attrs?: unknown) {
      if (typeof nameOrAttrs === 'string') {
        if (attrs && (attrs as any).level) {
          const key = `${nameOrAttrs}-${(attrs as any).level}`;
          return !!activeMap[key];
        }
        return !!activeMap[nameOrAttrs];
      }
      if (nameOrAttrs && typeof nameOrAttrs === 'object') {
        const align = (nameOrAttrs as any).textAlign;
        if (align) return !!activeMap[`textAlign-${align}`];
      }
      return false;
    }
  };
}

// ─── ACTIVE_MARK_KEYS ─────────────────────────────────────────────────────

describe('ACTIVE_MARK_KEYS', () => {
  it('lists exactly the 19 expected mark keys', () => {
    expect(ACTIVE_MARK_KEYS.length).toBe(19);
    expect(ACTIVE_MARK_KEYS).toContain('bold');
    expect(ACTIVE_MARK_KEYS).toContain('superscript');
    expect(ACTIVE_MARK_KEYS).toContain('h5');
    expect(ACTIVE_MARK_KEYS).toContain('alignJustify');
  });
});

// ─── computeActiveMarks ───────────────────────────────────────────────────

describe('computeActiveMarks', () => {
  it('returns all-false when no editor', () => {
    const marks = computeActiveMarks(undefined);
    Object.values(marks).forEach((value) => expect(value).toBe(false));
  });

  it('reads bold/italic from a fake editor', () => {
    const editor = fakeEditor({ bold: true, italic: true });
    const marks = computeActiveMarks(editor);
    expect(marks.bold).toBe(true);
    expect(marks.italic).toBe(true);
    expect(marks.underline).toBe(false);
  });

  it('strike is true when either strike OR strikeThrough is active', () => {
    expect(computeActiveMarks(fakeEditor({ strike: true })).strike).toBe(true);
    expect(computeActiveMarks(fakeEditor({ strikeThrough: true })).strike).toBe(true);
    expect(computeActiveMarks(fakeEditor({})).strike).toBe(false);
  });

  it('paragraph is true only when paragraph + NOT heading + NOT blockquote', () => {
    expect(computeActiveMarks(fakeEditor({ paragraph: true })).paragraph).toBe(true);
    // heading present → paragraph false
    expect(computeActiveMarks(fakeEditor({ paragraph: true, heading: true })).paragraph).toBe(false);
    // blockquote present → paragraph false
    expect(computeActiveMarks(fakeEditor({ paragraph: true, blockquote: true })).paragraph).toBe(false);
  });

  it('heading levels h1..h5 map correctly', () => {
    [1, 2, 3, 4, 5].forEach((level) => {
      const marks = computeActiveMarks(fakeEditor({ [`heading-${level}`]: true }));
      expect((marks as any)[`h${level}`]).toBe(true);
      // other levels are false
      [1, 2, 3, 4, 5].filter((l) => l !== level).forEach((other) => {
        expect((marks as any)[`h${other}`]).toBe(false);
      });
    });
  });

  it('alignment marks map textAlign attrs', () => {
    const marks = computeActiveMarks(fakeEditor({ 'textAlign-center': true }));
    expect(marks.alignLeft).toBe(false);
    expect(marks.alignCenter).toBe(true);
    expect(marks.alignRight).toBe(false);
    expect(marks.alignJustify).toBe(false);
  });

  it('quote maps to blockquote', () => {
    expect(computeActiveMarks(fakeEditor({ blockquote: true })).quote).toBe(true);
  });

  it('superscript / subscript', () => {
    expect(computeActiveMarks(fakeEditor({ superscript: true })).superscript).toBe(true);
    expect(computeActiveMarks(fakeEditor({ subscript: true })).subscript).toBe(true);
  });

  it('catches editor.isActive throwing and returns false for that mark', () => {
    const editor = { isActive: () => { throw new Error('crashy'); } };
    const marks = computeActiveMarks(editor);
    Object.values(marks).forEach((value) => expect(value).toBe(false));
  });

  it('handles editor without isActive method', () => {
    const marks = computeActiveMarks({});
    Object.values(marks).forEach((value) => expect(value).toBe(false));
  });

  it('falls back to window.editor when no arg passed', () => {
    (window as any).editor = fakeEditor({ bold: true });
    expect(computeActiveMarks().bold).toBe(true);
  });
});

// ─── activeMarksEqual ─────────────────────────────────────────────────────

describe('activeMarksEqual', () => {
  it('returns true for identical records', () => {
    const a: ActiveMarks = { bold: true, italic: false };
    const b: ActiveMarks = { bold: true, italic: false };
    expect(activeMarksEqual(a, b)).toBe(true);
  });

  it('returns false when a value differs', () => {
    expect(activeMarksEqual({ bold: true }, { bold: false })).toBe(false);
  });

  it('returns false when key sets differ', () => {
    expect(activeMarksEqual({ bold: true }, { italic: true })).toBe(false);
    expect(activeMarksEqual({}, { bold: true })).toBe(false);
  });

  it('returns true for two empty records', () => {
    expect(activeMarksEqual({}, {})).toBe(true);
  });
});
