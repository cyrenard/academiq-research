/**
 * Behavioral characterization for the aq-engine APA 7 block quotation support
 * (experiments/aq-engine/document.js → applyAPA7BlockquoteStyle /
 * clearAPA7BlockquoteStyle / setBlockquoteForRange / isBlockquoteForRange).
 *
 * APA 7: a quotation of 40+ words is set as a block — indented 0.5" from the
 * left margin, double-spaced, with NO first-line indent and no quotation marks.
 * Part of the APA golden net (Track A / A4). Before this, the editor's
 * toggleBlockquote command was a broken stub (it just converted the selection
 * to a plain paragraph).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AQEngineDocument = require('../../../../experiments/aq-engine/document.js') as {
  create: (blocks?: any[]) => any;
  applyAPA7BlockquoteStyle: (block: any) => any;
  clearAPA7BlockquoteStyle: (block: any) => any;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AQEngine = require('../../../../experiments/aq-engine/engine.js') as {
  apaBodyFirstLineIndentPx: (block: any, leftIndentPx: number) => number;
};

describe('aq-engine APA 7 block quotation', () => {
  it('applyAPA7BlockquoteStyle gives a 0.5" indent, no first-line indent, double spacing', () => {
    const b: any = { type: 'paragraph', runs: [{ text: 'A long quotation…' }] };
    AQEngineDocument.applyAPA7BlockquoteStyle(b);
    expect(b.blockquote).toBe(true);
    expect(b.leftIndentPx).toBe(48);
    expect(b.firstLineIndentPx).toBe(0);
    expect(b.lineHeightFactor).toBe(2.0);
    expect(b.type).toBe('paragraph');
  });

  it('clearAPA7BlockquoteStyle restores a plain body paragraph', () => {
    const b: any = { type: 'paragraph', blockquote: true, leftIndentPx: 48, firstLineIndentPx: 0, lineHeightFactor: 2.0 };
    AQEngineDocument.clearAPA7BlockquoteStyle(b);
    expect(b.blockquote).toBeUndefined();
    expect(b.leftIndentPx).toBeUndefined();
    expect(b.firstLineIndentPx).toBeUndefined();
    expect(b.lineHeightFactor).toBeUndefined();
  });

  it('a block quote does NOT receive the APA body first-line indent', () => {
    const b: any = { type: 'paragraph', runs: [{ text: 'q' }] };
    AQEngineDocument.applyAPA7BlockquoteStyle(b);
    expect(AQEngine.apaBodyFirstLineIndentPx(b, b.leftIndentPx)).toBe(0);
  });

  it('setBlockquoteForRange toggles the whole selection on and off (with undo support)', () => {
    const doc = AQEngineDocument.create([
      { type: 'paragraph', runs: [{ text: 'AA' }] },
      { type: 'paragraph', runs: [{ text: 'BB' }] }
    ]);
    // select both blocks (flat offsets span both)
    doc.setBlockquoteForRange(0, doc.length(), true);
    expect(doc.isBlockquoteForRange(0, doc.length())).toBe(true);
    let blocks = doc.get().blocks;
    expect(blocks[0].blockquote).toBe(true);
    expect(blocks[0].leftIndentPx).toBe(48);
    expect(blocks[1].blockquote).toBe(true);

    doc.setBlockquoteForRange(0, doc.length(), false);
    expect(doc.isBlockquoteForRange(0, doc.length())).toBe(false);
    blocks = doc.get().blocks;
    expect(blocks[0].blockquote).toBeUndefined();
    expect(blocks[0].leftIndentPx).toBeUndefined();

    // each toggle is a committed step → undo reverts the last one
    expect(doc.undo()).toBe(true);
    expect(doc.isBlockquoteForRange(0, doc.length())).toBe(true);
  });
});
