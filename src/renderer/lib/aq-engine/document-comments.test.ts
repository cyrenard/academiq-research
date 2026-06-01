/**
 * Behavioral characterization for the aq-engine comment anchor layer:
 * comments are anchored to a text range via a `commentId` run mark
 * (experiments/aq-engine/document.js → collectCommentIds / clearCommentInBlocks
 * + doc-model listCommentIds / clearCommentMark, applied through applyMark).
 * The reflow renders commentId runs with a comment highlight (verified live).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const D = require('../../../../experiments/aq-engine/document.js') as {
  create: (blocks?: any[]) => any;
  collectCommentIds: (blocks: any[]) => string[];
  clearCommentInBlocks: (blocks: any[], commentId: string) => any[];
};

describe('aq-engine comment anchoring (commentId run mark)', () => {
  it('applyMark anchors a commentId on the selected range', () => {
    const doc = D.create([{ type: 'paragraph', runs: [{ text: 'hello world' }] }]);
    doc.applyMark(0, 5, 'commentId', 'c1'); // "hello"
    const runs = doc.get().blocks[0].runs;
    expect(runs.find((r: any) => r.text === 'hello').commentId).toBe('c1');
    expect(runs.find((r: any) => r.text === ' world').commentId).toBeUndefined();
  });

  it('listCommentIds returns the unique comment ids present', () => {
    const doc = D.create([{ type: 'paragraph', runs: [{ text: 'abcdef' }] }]);
    doc.applyMark(0, 2, 'commentId', 'c1');
    doc.applyMark(4, 6, 'commentId', 'c2');
    expect(doc.listCommentIds().sort()).toEqual(['c1', 'c2']);
  });

  it('clearCommentMark removes a comment everywhere (commit-based → undoable)', () => {
    const doc = D.create([{ type: 'paragraph', runs: [{ text: 'abcdef' }] }]);
    doc.applyMark(0, 3, 'commentId', 'c1');
    expect(doc.listCommentIds()).toEqual(['c1']);
    doc.clearCommentMark('c1');
    expect(doc.listCommentIds()).toEqual([]);
    expect(doc.undo()).toBe(true);
    expect(doc.listCommentIds()).toEqual(['c1']);
  });

  it('collectCommentIds / clearCommentInBlocks also walk table cells', () => {
    const blocks = [
      { type: 'paragraph', runs: [{ text: 'x', commentId: 'c1' }] },
      { type: 'table', rows: [{ cells: [{ runs: [{ text: 'y', commentId: 'c2' }] }] }] }
    ];
    expect(D.collectCommentIds(blocks).sort()).toEqual(['c1', 'c2']);
    D.clearCommentInBlocks(blocks, 'c2');
    expect(D.collectCommentIds(blocks)).toEqual(['c1']);
  });
});
