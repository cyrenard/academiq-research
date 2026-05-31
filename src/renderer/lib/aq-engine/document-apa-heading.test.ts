/**
 * Behavioral characterization tests for the aq-engine document model's APA 7
 * heading styling (experiments/aq-engine/document.js → applyAPA7HeadingStyle,
 * exercised through the public `setBlockType(idx, 'heading', { level })`).
 *
 * This is the first behavioral (not source-string-matching) test against the
 * live doc model — the seed of the "APA golden net" (Track A / Faz 0). It pins
 * the APA 7 five-level heading contract so future typesetting changes can't
 * silently regress it.
 *
 * APA 7 heading spec:
 *   L1: Centered, Bold, Title Case
 *   L2: Flush Left, Bold, Title Case
 *   L3: Flush Left, Bold Italic, Title Case
 *   L4: Indented, Bold, Title Case, run-in (text continues on same line)
 *   L5: Indented, Bold Italic, Title Case, run-in
 * None of the levels force ALL CAPS — the author keeps their own casing.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AQEngineDocument = require('../../../../experiments/aq-engine/document.js') as {
  create: (blocks?: any[]) => any;
};

function headingBlock(text: string, level: number) {
  const doc = AQEngineDocument.create([{ type: 'paragraph', runs: [{ text }] }]);
  doc.setBlockType(0, 'heading', { level });
  return doc.get().blocks[0];
}

describe('aq-engine APA 7 heading styling', () => {
  it('L1 preserves the author casing (Title Case, NOT ALL CAPS) + centered bold', () => {
    const b = headingBlock('Bilişsel Yük Kuramı', 1);
    expect(b.runs[0].text).toBe('Bilişsel Yük Kuramı'); // no force-uppercase
    expect(b.type).toBe('heading');
    expect(b.level).toBe(1);
    expect(b.align).toBe('center');
    expect(b.font.weight).toBe('700');
    expect(b.font.style).toBe('normal');
    expect(b.firstLineIndentPx).toBe(0);
    expect(b.runInHeading).toBe(false);
  });

  it('L2 is flush left, bold, not italic', () => {
    const b = headingBlock('Yöntem', 2);
    expect(b.runs[0].text).toBe('Yöntem');
    expect(b.align).toBe('left');
    expect(b.font.weight).toBe('700');
    expect(b.font.style).toBe('normal');
    expect(b.runInHeading).toBe(false);
  });

  it('L3 is flush left, bold italic', () => {
    const b = headingBlock('Katılımcılar', 3);
    expect(b.align).toBe('left');
    expect(b.font.weight).toBe('700');
    expect(b.font.style).toBe('italic');
    expect(b.runInHeading).toBe(false);
  });

  it('L4 is indented bold run-in (text continues on the same line)', () => {
    const b = headingBlock('Ölçüm araçları', 4);
    expect(b.font.weight).toBe('700');
    expect(b.font.style).toBe('normal');
    expect(b.firstLineIndentPx).toBe(36);
    expect(b.runInHeading).toBe(true);
  });

  it('L5 is indented bold italic run-in', () => {
    const b = headingBlock('Güvenirlik', 5);
    expect(b.font.weight).toBe('700');
    expect(b.font.style).toBe('italic');
    expect(b.firstLineIndentPx).toBe(36);
    expect(b.runInHeading).toBe(true);
  });

  it('clamps out-of-range levels into 1..5', () => {
    expect(headingBlock('x', 0).level).toBe(1);
    expect(headingBlock('x', 9).level).toBe(5);
  });

  it('all heading levels use 12pt', () => {
    for (let lvl = 1; lvl <= 5; lvl++) {
      expect(headingBlock('x', lvl).font.sizePt).toBe(12);
    }
  });
});
