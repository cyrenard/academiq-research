/**
 * Comments data store — pure helpers over a `Comment[]` array. The text/author/
 * resolved state lives here (persisted on the document record); the anchor
 * (which text a comment covers) lives in the aq-engine as a `commentId` run mark
 * (see lib/aq-engine appendix... document.js commentId). The two are linked by id.
 */

export interface Comment {
  id: string;
  text: string;
  author: string;
  createdAt: number;
  resolved: boolean;
  /** Optional snippet of the anchored text, for display when the anchor scrolls away. */
  quote?: string;
}

export function createCommentId(): string {
  return 'cmt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function asArray(comments: unknown): Comment[] {
  return Array.isArray(comments) ? (comments as Comment[]) : [];
}

export function addComment(
  comments: Comment[],
  fields: { text?: string; author?: string; quote?: string; id?: string }
): { comments: Comment[]; comment: Comment } {
  const comment: Comment = {
    id: String(fields.id || createCommentId()),
    text: String(fields.text || '').trim(),
    author: String(fields.author || '').trim(),
    createdAt: Date.now(),
    resolved: false,
    quote: fields.quote ? String(fields.quote) : undefined
  };
  return { comments: [...asArray(comments), comment], comment };
}

export function getComment(comments: Comment[], id: string): Comment | null {
  const cid = String(id || '');
  return asArray(comments).find((c) => c && String(c.id) === cid) || null;
}

export function updateComment(comments: Comment[], id: string, patch: Partial<Comment>): Comment[] {
  const cid = String(id || '');
  return asArray(comments).map((c) =>
    c && String(c.id) === cid ? { ...c, ...patch, id: c.id } : c
  );
}

export function resolveComment(comments: Comment[], id: string, resolved = true): Comment[] {
  return updateComment(comments, id, { resolved: !!resolved });
}

export function removeComment(comments: Comment[], id: string): Comment[] {
  const cid = String(id || '');
  return asArray(comments).filter((c) => c && String(c.id) !== cid);
}

export function listOpenComments(comments: Comment[]): Comment[] {
  return asArray(comments).filter((c) => c && !c.resolved);
}

/**
 * Drop comments whose id is no longer anchored anywhere in the document (e.g.
 * the anchored text was deleted), keeping the store in sync with the engine.
 */
export function pruneOrphanComments(comments: Comment[], anchoredIds: string[]): Comment[] {
  const live = new Set((anchoredIds || []).map((id) => String(id)));
  return asArray(comments).filter((c) => c && live.has(String(c.id)));
}
