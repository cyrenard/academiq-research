import { describe, it, expect } from 'vitest';
import {
  addComment,
  getComment,
  updateComment,
  resolveComment,
  removeComment,
  listOpenComments,
  pruneOrphanComments,
  createCommentId,
  type Comment
} from './comments-store';

describe('comments-store', () => {
  it('addComment appends a new comment with an id and defaults', () => {
    const { comments, comment } = addComment([], { text: '  needs a citation ', author: 'Ada' });
    expect(comments).toHaveLength(1);
    expect(comment.text).toBe('needs a citation');
    expect(comment.author).toBe('Ada');
    expect(comment.resolved).toBe(false);
    expect(comment.id).toMatch(/^cmt_/);
    expect(typeof comment.createdAt).toBe('number');
  });

  it('honors an explicit id (to match an engine commentId)', () => {
    const { comment } = addComment([], { id: 'c1', text: 'x' });
    expect(comment.id).toBe('c1');
  });

  it('getComment / updateComment / resolveComment / removeComment', () => {
    let { comments } = addComment([], { id: 'c1', text: 'first', author: 'A' });
    ({ comments } = addComment(comments, { id: 'c2', text: 'second', author: 'B' }));

    expect(getComment(comments, 'c2')?.text).toBe('second');
    expect(getComment(comments, 'nope')).toBeNull();

    comments = updateComment(comments, 'c1', { text: 'edited' });
    expect(getComment(comments, 'c1')?.text).toBe('edited');
    expect(getComment(comments, 'c1')?.id).toBe('c1'); // id never overwritten

    comments = resolveComment(comments, 'c1');
    expect(getComment(comments, 'c1')?.resolved).toBe(true);
    expect(listOpenComments(comments).map((c) => c.id)).toEqual(['c2']);

    comments = removeComment(comments, 'c2');
    expect(comments.map((c) => c.id)).toEqual(['c1']);
  });

  it('pruneOrphanComments drops comments no longer anchored in the doc', () => {
    const comments: Comment[] = [
      { id: 'c1', text: 'a', author: '', createdAt: 1, resolved: false },
      { id: 'c2', text: 'b', author: '', createdAt: 2, resolved: false }
    ];
    expect(pruneOrphanComments(comments, ['c1']).map((c) => c.id)).toEqual(['c1']);
    expect(pruneOrphanComments(comments, [])).toEqual([]);
  });

  it('createCommentId is unique-ish and prefixed', () => {
    const a = createCommentId();
    const b = createCommentId();
    expect(a).toMatch(/^cmt_/);
    expect(a).not.toBe(b);
  });

  it('tolerates non-array input', () => {
    expect(listOpenComments(undefined as any)).toEqual([]);
    expect(removeComment(null as any, 'x')).toEqual([]);
  });
});
