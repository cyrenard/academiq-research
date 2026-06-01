/**
 * Behavioral characterization for aq-engine track-changes accept/reject
 * (experiments/aq-engine/document.js → resolveTrackChangesInBlocks /
 * blocksHaveTrackChanges + doc-model acceptAllTrackChanges /
 * rejectAllTrackChanges / hasTrackChanges).
 *
 * Runs carry `trackInsert` (typed while tracking) and `trackDelete` (deleted
 * while tracking — kept + struck through). Accept keeps insertions and applies
 * deletions; reject drops insertions and restores deletions.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const D = require('../../../../experiments/aq-engine/document.js') as {
  create: (blocks?: any[]) => any;
  resolveTrackChangesInBlocks: (blocks: any[], mode: 'accept' | 'reject') => any[];
  blocksHaveTrackChanges: (blocks: any[]) => boolean;
};

const sample = () => [
  { type: 'paragraph', runs: [
    { text: 'keep ' },
    { text: 'added', trackInsert: true },
    { text: 'gone', trackDelete: true },
    { text: ' tail' }
  ] }
];

describe('blocksHaveTrackChanges', () => {
  it('detects pending insert/delete marks (incl. table cells)', () => {
    expect(D.blocksHaveTrackChanges(sample())).toBe(true);
    expect(D.blocksHaveTrackChanges([{ type: 'paragraph', runs: [{ text: 'plain' }] }])).toBe(false);
    expect(D.blocksHaveTrackChanges([
      { type: 'table', rows: [{ cells: [{ runs: [{ text: 'x', trackDelete: true }] }] }] }
    ])).toBe(true);
  });
});

describe('resolveTrackChangesInBlocks', () => {
  it('accept → keeps insertions (flag cleared), drops deletions', () => {
    const out = D.resolveTrackChangesInBlocks(sample(), 'accept');
    const texts = out[0].runs.map((r: any) => r.text);
    expect(texts).toEqual(['keep ', 'added', ' tail']);
    expect(out[0].runs.find((r: any) => r.text === 'added').trackInsert).toBeUndefined();
  });

  it('reject → drops insertions, restores deletions (flag cleared)', () => {
    const out = D.resolveTrackChangesInBlocks(sample(), 'reject');
    const texts = out[0].runs.map((r: any) => r.text);
    expect(texts).toEqual(['keep ', 'gone', ' tail']);
    expect(out[0].runs.find((r: any) => r.text === 'gone').trackDelete).toBeUndefined();
  });

  it('never leaves a block with zero runs', () => {
    const out = D.resolveTrackChangesInBlocks(
      [{ type: 'paragraph', runs: [{ text: 'x', trackInsert: true }] }], 'reject'
    );
    expect(out[0].runs).toEqual([{ text: '' }]);
  });

  it('processes table cell runs', () => {
    const out = D.resolveTrackChangesInBlocks(
      [{ type: 'table', rows: [{ cells: [{ runs: [{ text: 'a' }, { text: 'b', trackDelete: true }] }] }] }],
      'accept'
    );
    expect(out[0].rows[0].cells[0].runs.map((r: any) => r.text)).toEqual(['a']);
  });
});

describe('doc-model acceptAll / rejectAll', () => {
  it('acceptAllTrackChanges commits the accepted text and is undoable', () => {
    const doc = D.create(sample());
    expect(doc.hasTrackChanges()).toBe(true);
    expect(doc.acceptAllTrackChanges()).toBe(true);
    expect(doc.hasTrackChanges()).toBe(false);
    expect(doc.getPlainText()).toBe('keep added tail');
    expect(doc.undo()).toBe(true);
    expect(doc.hasTrackChanges()).toBe(true);
  });

  it('rejectAllTrackChanges restores the original text', () => {
    const doc = D.create(sample());
    expect(doc.rejectAllTrackChanges()).toBe(true);
    expect(doc.getPlainText()).toBe('keep gone tail');
  });

  it('acceptAll/rejectAll are a no-op (false) when there are no changes', () => {
    const doc = D.create([{ type: 'paragraph', runs: [{ text: 'plain' }] }]);
    expect(doc.acceptAllTrackChanges()).toBe(false);
    expect(doc.rejectAllTrackChanges()).toBe(false);
  });
});
