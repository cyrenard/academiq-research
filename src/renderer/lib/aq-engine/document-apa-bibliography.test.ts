/**
 * Behavioral characterization for the aq-engine canonical APA 7 bibliography
 * (reference list) entry styling (experiments/aq-engine/document.js →
 * applyAPA7BibliographyEntryStyle, which compat-shim.js + tiptap-adapter.js now
 * delegate to). Part of the APA golden net (Track A / A3).
 *
 * APA 7 reference list: 0.5" hanging indent (subsequent lines indented), double
 * spacing, 12pt regular.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AQEngineDocument = require('../../../../experiments/aq-engine/document.js') as {
  applyAPA7BibliographyEntryStyle: (block: any) => any;
};

describe('aq-engine APA 7 bibliography entry styling', () => {
  it('applies a 0.5" hanging indent, double spacing, 12pt regular', () => {
    const b: any = { runs: [{ text: 'Kuhn, T. (1962). The structure of scientific revolutions.' }] };
    AQEngineDocument.applyAPA7BibliographyEntryStyle(b);
    expect(b._isBibEntry).toBe(true);
    expect(b.leftIndentPx).toBe(48);        // 0.5" block indent
    expect(b.firstLineIndentPx).toBe(-48);  // first line outdented → hanging indent
    expect(b.lineHeightFactor).toBe(2.0);   // double spacing
    expect(b.spaceAfterPx).toBe(0);
    expect(b.font.sizePt).toBe(12);
    expect(b.font.weight).toBe('400');
    expect(b.font.style).toBe('normal');
  });

  it('defaults the block type to paragraph when missing', () => {
    const b: any = {};
    AQEngineDocument.applyAPA7BibliographyEntryStyle(b);
    expect(b.type).toBe('paragraph');
  });

  it('is exported as the canonical helper the other engine modules delegate to', () => {
    expect(typeof AQEngineDocument.applyAPA7BibliographyEntryStyle).toBe('function');
  });
});
