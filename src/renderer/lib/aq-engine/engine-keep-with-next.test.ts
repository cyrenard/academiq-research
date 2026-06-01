/**
 * Behavioral test for the aq-engine pagination "keep heading with next" rule
 * (experiments/aq-engine/engine.js → shouldBreakBeforeHeading), used during
 * reflow so a heading is never orphaned as the last line on a page when its
 * body would start on the next page (Word/APA fidelity). Track A / A7.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AQEngine = require('../../../../experiments/aq-engine/engine.js') as {
  shouldBreakBeforeHeading: (
    block: any, yPx: number, headingHeightPx: number, lineHeightPx: number, contentHeightPx: number, hasFollowingContent: boolean
  ) => boolean;
};
const fn = AQEngine.shouldBreakBeforeHeading;

const heading = { type: 'heading', level: 2 };
const PAGE = 800;   // content height
const LINE = 32;    // line height

describe('aq-engine keep-heading-with-next (shouldBreakBeforeHeading)', () => {
  it('breaks before a heading that would leave no room for a following line', () => {
    // y near the bottom: heading (1 line) + one body line would overflow
    expect(fn(heading, PAGE - LINE, LINE, LINE, PAGE, true)).toBe(true);
  });

  it('does NOT break when the heading + a following line still fit', () => {
    expect(fn(heading, 100, LINE, LINE, PAGE, true)).toBe(false);
  });

  it('does NOT break at the top of a fresh page (nothing gained)', () => {
    expect(fn(heading, 0, LINE, LINE, PAGE, true)).toBe(false);
  });

  it('does NOT break when there is no following content', () => {
    expect(fn(heading, PAGE - LINE, LINE, LINE, PAGE, false)).toBe(false);
  });

  it('does NOT break for non-heading blocks', () => {
    expect(fn({ type: 'paragraph' }, PAGE - LINE, LINE, LINE, PAGE, true)).toBe(false);
  });

  it('defers to explicit page breaks (pageBreak handles itself)', () => {
    expect(fn({ type: 'heading', pageBreak: true }, PAGE - LINE, LINE, LINE, PAGE, true)).toBe(false);
  });

  it('accounts for a multi-line heading height', () => {
    // 2-line heading near the bottom: heading(2*LINE) + one body line overflows
    expect(fn(heading, PAGE - LINE * 2, LINE * 2, LINE, PAGE, true)).toBe(true);
    // same heading higher up still fits
    expect(fn(heading, PAGE - LINE * 4, LINE * 2, LINE, PAGE, true)).toBe(false);
  });

  it('is safe with a null block', () => {
    expect(fn(null, 100, LINE, LINE, PAGE, true)).toBe(false);
  });
});
