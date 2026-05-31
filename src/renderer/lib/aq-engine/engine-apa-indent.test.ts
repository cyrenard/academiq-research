/**
 * Behavioral test for the aq-engine reflow's APA 7 body first-line indent rule
 * (experiments/aq-engine/engine.js → apaBodyFirstLineIndentPx, used at reflow to
 * indent the first line of every plain body paragraph by 0.5"/36px).
 *
 * Part of the APA golden net (Track A / A2). Pins: plain body paragraphs get the
 * default indent; explicit values (incl. 0 and headings) win; lists, indented
 * blocks (block quotes), and bibliography/appendix entries do NOT get it.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AQEngine = require('../../../../experiments/aq-engine/engine.js') as {
  apaBodyFirstLineIndentPx: (block: any, leftIndentPx: number) => number;
  APA_BODY_FIRST_LINE_INDENT_PX: number;
};

const fl = (block: any, leftIndentPx = 0) => AQEngine.apaBodyFirstLineIndentPx(block, leftIndentPx);
const DEF = AQEngine.APA_BODY_FIRST_LINE_INDENT_PX;

describe('aq-engine APA body first-line indent', () => {
  it('plain body paragraph gets the default 0.5" indent', () => {
    expect(DEF).toBe(48); // APA 0.5" = 48px (1in = 96px)
    expect(fl({ type: 'paragraph', runs: [{ text: 'Lorem' }] })).toBe(DEF);
    expect(fl({ runs: [{ text: 'no explicit type' }] })).toBe(DEF); // type defaults to paragraph
  });

  it('an explicit firstLineIndentPx always wins (including 0)', () => {
    expect(fl({ type: 'paragraph', firstLineIndentPx: 0 })).toBe(0); // user de-indented
    expect(fl({ type: 'paragraph', firstLineIndentPx: 72 })).toBe(72);
  });

  it('headings keep their explicit indent (0 for L1-3, 36 for L4/5)', () => {
    expect(fl({ type: 'heading', level: 1, firstLineIndentPx: 0 })).toBe(0);
    expect(fl({ type: 'heading', level: 4, firstLineIndentPx: 48 })).toBe(48);
  });

  it('list items do NOT get the body indent', () => {
    expect(fl({ type: 'paragraph', list: { type: 'bullet', level: 0 } })).toBe(0);
  });

  it('indented blocks (block quotes) do NOT get the body indent', () => {
    // leftIndentPx > 0 signals an indented block (e.g. APA block quotation)
    expect(fl({ type: 'paragraph', runs: [{ text: 'quote' }] }, 48)).toBe(0);
    expect(fl({ type: 'paragraph', blockquote: true })).toBe(0);
  });

  it('bibliography and appendix entries do NOT get the body indent', () => {
    expect(fl({ type: 'paragraph', _isBibEntry: true })).toBe(0);
    expect(fl({ type: 'paragraph', _isAppendixEntry: true })).toBe(0);
    expect(fl({ type: 'heading', _isAppendixHeading: true })).toBe(0);
  });

  it('non-paragraph blocks (image/table) do NOT get the body indent', () => {
    expect(fl({ type: 'image' })).toBe(0);
    expect(fl({ type: 'table' })).toBe(0);
  });

  it('null/undefined block is safe', () => {
    expect(fl(null)).toBe(0);
    expect(fl(undefined as any)).toBe(0);
  });
});
