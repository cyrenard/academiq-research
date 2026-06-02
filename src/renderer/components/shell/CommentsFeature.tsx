import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveDocRecord, saveAuxiliaryChange } from '../../lib/legacy-doc-helpers';
import {
  addComment,
  removeComment,
  resolveComment,
  updateComment,
  pruneOrphanComments,
  createCommentId,
  type Comment
} from '../../lib/comments-store';

/** Self-drawn, royalty-free speech-bubble comment icon (SVG only). */
export function CommentIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 4H4A1.5 1.5 0 0 0 2.5 5.5v9A1.5 1.5 0 0 0 4 16h3v3.4L11.6 16H20a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 20 4Z" />
      <line x1="7" y1="8.6" x2="17" y2="8.6" />
      <line x1="7" y1="11.6" x2="13" y2="11.6" />
    </svg>
  );
}

const EDITOR_SURFACE_SELECTOR =
  '#apaed, #escroll, .aq-engine-stage, .aq-engine-page, .aq-engine-line, .aq-engine-table-cell, .aq-input-capture';

function currentSelectionText(): string {
  try {
    const editor = getEditor();
    if (editor && typeof editor.getSelectedText === 'function') {
      const t = String(editor.getSelectedText() || '');
      if (t) return t;
    }
  } catch (_e) { /* fall through to DOM selection */ }
  return String(window.getSelection?.()?.toString() || '');
}

function getEditor(): any {
  const win = window as any;
  return typeof win.getActiveEditorInstance === 'function' ? win.getActiveEditorInstance() : win.editor || null;
}

/**
 * Comments feature: right-click "Yorum ekle" on a selection anchors a comment
 * (commentId run mark in the engine) + stores its text on the doc record; the
 * toolbar comment icon toggles a side panel listing every comment. Mounted once
 * (in TopToolbar) and otherwise self-contained.
 */
export function CommentsFeature() {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // Snapshot the last non-empty selection (engine collapses it on right-click).
  const lastSelRef = useRef<{ from: number; to: number; text: string } | null>(null);

  // Capture the selection on mouseup/keyup, BEFORE a right-click collapses it.
  useEffect(() => {
    const capture = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target || target.closest('#pdfscroll')) return;
      if (!target.closest(EDITOR_SURFACE_SELECTOR)) return;
      const editor = getEditor();
      if (!editor) return;
      const range = typeof editor.getSelectionRange === 'function' ? editor.getSelectionRange() : null;
      const text = typeof editor.getSelectedText === 'function' ? String(editor.getSelectedText() || '') : '';
      if (range && text) lastSelRef.current = { from: range.from, to: range.to, text };
    };
    document.addEventListener('mouseup', capture, true);
    document.addEventListener('keyup', capture, true);
    return () => {
      document.removeEventListener('mouseup', capture, true);
      document.removeEventListener('keyup', capture, true);
    };
  }, []);

  const reload = useCallback(() => {
    const doc = getActiveDocRecord();
    const stored: Comment[] = Array.isArray(doc?.comments) ? doc.comments : [];
    const editor = getEditor();
    const anchored = editor && typeof editor.listCommentIds === 'function' ? editor.listCommentIds() : null;
    const next = anchored ? pruneOrphanComments(stored, anchored) : stored;
    if (doc && anchored && next.length !== stored.length) {
      doc.comments = next;
      saveAuxiliaryChange();
    }
    setComments([...next].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
  }, []);

  // Toolbar icon toggles the panel (open → all comments shown, closed → hidden).
  useEffect(() => {
    const onToggle = () =>
      setOpen((v) => {
        const next = !v;
        if (next) reload();
        return next;
      });
    window.addEventListener('aq:comments-toggle', onToggle);
    return () => window.removeEventListener('aq:comments-toggle', onToggle);
  }, [reload]);

  useEffect(() => {
    if (!open) return;
    reload();
    const onChanged = () => reload();
    window.addEventListener('aq:comments-changed', onChanged);
    return () => window.removeEventListener('aq:comments-changed', onChanged);
  }, [open, reload]);

  // Right-click on a selection inside the editor → offer "Yorum ekle".
  useEffect(() => {
    const onCtx = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || target.closest('#pdfscroll')) return; // leave the PDF menu alone
      if (!target.closest(EDITOR_SURFACE_SELECTOR)) return;
      // Use the snapshot captured on mouseup (the live selection may already be
      // collapsed by the right-click), falling back to a live read.
      const sel = (lastSelRef.current && lastSelRef.current.text) ? lastSelRef.current.text : currentSelectionText();
      if (!sel.trim()) return; // only when text is selected
      // Replace the native WebView menu with our "Yorum ekle" menu.
      event.preventDefault();
      event.stopPropagation();
      setMenu({ x: Math.min(event.clientX, window.innerWidth - 170), y: Math.min(event.clientY, window.innerHeight - 70) });
    };
    document.addEventListener('contextmenu', onCtx, true);
    return () => document.removeEventListener('contextmenu', onCtx, true);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  const persist = useCallback((next: Comment[]) => {
    const doc = getActiveDocRecord();
    if (doc) {
      doc.comments = next;
      saveAuxiliaryChange();
    }
    setComments([...next].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
  }, []);

  const addAtSelection = useCallback(() => {
    setMenu(null);
    const editor = getEditor();
    const snap = lastSelRef.current;
    const quote = (snap && snap.text) || currentSelectionText();
    if (!editor || typeof editor.applyComment !== 'function') {
      (window as any).setStatusText?.('Yorum için editörü yenileyin', 'er');
      return;
    }
    const id = createCommentId();
    const range = snap ? { from: snap.from, to: snap.to } : undefined;
    if (!editor.applyComment(id, range)) return; // no selection
    lastSelRef.current = null;
    const doc = getActiveDocRecord();
    if (doc) {
      const { comments: next } = addComment(Array.isArray(doc.comments) ? doc.comments : [], { id, text: '', quote });
      doc.comments = next;
      saveAuxiliaryChange();
    }
    setOpen(true);
    reload();
    window.setTimeout(() => {
      (document.querySelector(`[data-comment-edit="${id}"]`) as HTMLTextAreaElement | null)?.focus();
    }, 50);
  }, [reload]);

  const navigate = (id: string) => {
    const el = document.querySelector(`[data-comment-id="${id}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('aq-comment-flash');
    window.setTimeout(() => el.classList.remove('aq-comment-flash'), 1200);
  };

  const onDelete = (id: string) => {
    const editor = getEditor();
    if (editor && typeof editor.removeComment === 'function') editor.removeComment(id);
    persist(removeComment(comments, id));
  };

  return (
    <>
      {menu ? (
        <div
          className="fixed z-[2300] overflow-hidden rounded-lg border border-aq-line bg-white py-1 text-[12px] text-aq-ink shadow-[0_18px_44px_rgba(22,27,34,0.22)]"
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-aq-panel"
            onMouseDown={(event) => event.preventDefault()}
            onClick={addAtSelection}
          >
            <CommentIcon size={13} /> Yorum ekle
          </button>
        </div>
      ) : null}

      {open ? (
        <aside className="fixed right-3 top-[96px] z-[2200] flex max-h-[calc(100vh-120px)] w-[300px] flex-col overflow-hidden rounded-xl border border-aq-line bg-white/95 shadow-[0_24px_64px_rgba(22,27,34,0.20)] backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-aq-line px-3 py-2">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-aq-ink">
              <CommentIcon size={14} /> Yorumlar
              <span className="rounded-full bg-aq-panel px-1.5 text-[10px] text-aq-muted">{comments.length}</span>
            </div>
            <button
              type="button"
              className="rounded px-1.5 text-[16px] leading-none text-aq-muted hover:bg-aq-panel hover:text-aq-ink"
              title="Kapat"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
            {comments.length === 0 ? (
              <div className="px-2 py-6 text-center text-[11px] text-aq-muted">
                Metni seç, sağ tıkla → “Yorum ekle”.
              </div>
            ) : (
              comments.map((comment) => (
                <div
                  key={comment.id}
                  className={[
                    'rounded-lg border border-aq-line p-2 text-[12px]',
                    comment.resolved ? 'bg-aq-panel/60 opacity-70' : 'bg-white'
                  ].join(' ')}
                >
                  {comment.quote ? (
                    <button
                      type="button"
                      onClick={() => navigate(comment.id)}
                      title="Yorumlanan metne git"
                      className="mb-1 block w-full truncate rounded border-l-2 border-amber-400 bg-amber-50 px-2 py-1 text-left text-[11px] text-aq-ink/80 hover:bg-amber-100"
                    >
                      “{comment.quote}”
                    </button>
                  ) : null}
                  <textarea
                    data-comment-edit={comment.id}
                    value={comment.text}
                    placeholder="Yorum yaz…"
                    rows={2}
                    onChange={(event) => persist(updateComment(comments, comment.id, { text: event.target.value }))}
                    className="w-full resize-y rounded border border-aq-line bg-white px-2 py-1 text-[12px] outline-none focus:border-aq-navy"
                  />
                  <div className="mt-1 flex items-center justify-end gap-1 text-[11px]">
                    <button
                      type="button"
                      className="rounded px-2 py-0.5 text-aq-muted hover:bg-aq-panel hover:text-aq-ink"
                      onClick={() => persist(resolveComment(comments, comment.id, !comment.resolved))}
                    >
                      {comment.resolved ? 'Geri aç' : 'Çözüldü'}
                    </button>
                    <button
                      type="button"
                      className="rounded px-2 py-0.5 text-red-500 hover:bg-red-50"
                      onClick={() => onDelete(comment.id)}
                    >
                      Sil
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      ) : null}
    </>
  );
}
