/**
 * Editor Active-Marks Reader
 *
 * Reads the current "active formatting marks" state from the editor
 * instance (TipTap or AQ Engine compat shim) and returns it as a flat
 * record. The toolbar uses this to highlight active buttons (bold /
 * italic / heading / alignment / etc.).
 *
 * Extracted from TopToolbar.tsx so the reader is unit-testable with a
 * fake editor instead of a full TipTap/AQ Engine setup.
 */
import { legacyWin } from './legacy-window';

export type ActiveMarks = Record<string, boolean>;

/**
 * The fixed set of keys this reader populates. Listed explicitly so
 * callers and the toolbar UI agree on the shape.
 */
export const ACTIVE_MARK_KEYS = [
  'bold', 'italic', 'underline', 'strike',
  'paragraph', 'h1', 'h2', 'h3', 'h4', 'h5',
  'quote', 'bulletList', 'orderedList',
  'alignLeft', 'alignCenter', 'alignRight', 'alignJustify',
  'superscript', 'subscript'
] as const;

/**
 * Compute the active-mark record from the active editor.
 *
 * If no editor is available, returns all-false. Each isActive() call
 * is try/catch'd so a misbehaving editor instance can't crash the
 * toolbar.
 */
export function computeActiveMarks(editor: any = legacyWin().editor): ActiveMarks {
  const isActive = (nameOrAttrs: unknown, attrs?: unknown) => {
    try {
      return !!(editor && typeof editor.isActive === 'function' && editor.isActive(nameOrAttrs, attrs));
    } catch (_error) {
      return false;
    }
  };
  return {
    bold: isActive('bold'),
    italic: isActive('italic'),
    underline: isActive('underline'),
    strike: isActive('strike') || isActive('strikeThrough'),
    paragraph: isActive('paragraph') && !isActive('heading') && !isActive('blockquote'),
    h1: isActive('heading', { level: 1 }),
    h2: isActive('heading', { level: 2 }),
    h3: isActive('heading', { level: 3 }),
    h4: isActive('heading', { level: 4 }),
    h5: isActive('heading', { level: 5 }),
    quote: isActive('blockquote'),
    bulletList: isActive('bulletList'),
    orderedList: isActive('orderedList'),
    alignLeft: isActive({ textAlign: 'left' }),
    alignCenter: isActive({ textAlign: 'center' }),
    alignRight: isActive({ textAlign: 'right' }),
    alignJustify: isActive({ textAlign: 'justify' }),
    superscript: isActive('superscript'),
    subscript: isActive('subscript')
  };
}

/**
 * Returns true when the two ActiveMarks records have identical keys
 * and values. Useful as a `setState` updater guard so React doesn't
 * re-render when nothing actually changed.
 */
export function activeMarksEqual(a: ActiveMarks, b: ActiveMarks): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}
