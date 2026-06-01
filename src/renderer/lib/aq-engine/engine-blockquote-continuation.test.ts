/**
 * APA 7 multi-paragraph block quotation: the first line of the 2nd and
 * subsequent paragraphs of a block quote gets an extra 0.5" indent
 * (experiments/aq-engine/engine.js → apaBlockquoteContinuationIndentPx).
 * Track A / A4 follow-up.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AQEngine = require('../../../../experiments/aq-engine/engine.js') as {
  apaBlockquoteContinuationIndentPx: (block: any, prevBlock: any) => number;
  APA_BODY_FIRST_LINE_INDENT_PX: number;
};
const fn = AQEngine.apaBlockquoteContinuationIndentPx;
const HALF_INCH = AQEngine.APA_BODY_FIRST_LINE_INDENT_PX;

const quote = { type: 'paragraph', blockquote: true };
const para = { type: 'paragraph' };

describe('apaBlockquoteContinuationIndentPx', () => {
  it('gives an extra 0.5" to a quote paragraph that follows another quote paragraph', () => {
    expect(fn(quote, quote)).toBe(HALF_INCH);
  });

  it('gives no extra indent to the FIRST paragraph of a block quote', () => {
    expect(fn(quote, para)).toBe(0);
    expect(fn(quote, null)).toBe(0);
  });

  it('gives no extra indent to a normal paragraph', () => {
    expect(fn(para, quote)).toBe(0);
    expect(fn(para, para)).toBe(0);
  });

  it('recognizes the alternate quote flags', () => {
    expect(fn({ quote: true }, { isBlockquote: true })).toBe(HALF_INCH);
  });
});
