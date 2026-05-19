/**
 * Right-side drawer that lists every misspelling in the active document
 * and lets the user jump to one, replace it with a suggestion, or ignore
 * it for the session.
 *
 * Mechanics:
 *   - Subscribes to spellcheck-controller (same source the StatusBar chip
 *     uses), so the panel updates live as the user edits.
 *   - "Jump": calls editor.commands.setTextSelection({from,to}) then
 *     scrolls the matching token span into view + flashes it.
 *   - "Replace with X": calls editor.commands.insertContentAt({from,to}, X)
 *     — AQ Engine's compat-shim exposes both commands. The controller's
 *     next debounced check then drops the match from the list naturally.
 *   - "Atla": removes the match from a session-local ignore set so we
 *     don't have to round-trip back to the dictionary.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSpellcheck } from '../../lib/useSpellcheck';
import { runCheckNow } from '../../lib/spellcheck-controller';
import type { SpellMatch } from '../../lib/spellcheck';

interface SpellcheckPanelProps {
  open: boolean;
  onClose: () => void;
}

/** Snippet length around the misspelling to show in the list item. */
const CONTEXT_RADIUS = 32;

function takeEditorText(): string {
  const win = window as any;
  try {
    if (typeof win.getActiveEditorInstance === 'function') {
      const editor = win.getActiveEditorInstance();
      if (editor && typeof editor.getText === 'function') return String(editor.getText() || '');
    }
  } catch (_e) {}
  return '';
}

function buildContext(text: string, offset: number, length: number) {
  const start = Math.max(0, offset - CONTEXT_RADIUS);
  const end = Math.min(text.length, offset + length + CONTEXT_RADIUS);
  return {
    leading: (start > 0 ? '…' : '') + text.slice(start, offset),
    word: text.slice(offset, offset + length),
    trailing: text.slice(offset + length, end) + (end < text.length ? '…' : '')
  };
}

function findSpanForOffset(offset: number): HTMLElement | null {
  const spans = document.querySelectorAll<HTMLElement>('span[data-offset-start]');
  for (const el of spans) {
    const start = Number(el.dataset.offsetStart);
    const end = Number(el.dataset.offsetEnd);
    if (Number.isFinite(start) && Number.isFinite(end) && start <= offset && offset < end) {
      return el;
    }
  }
  return null;
}

function flashSpan(el: HTMLElement) {
  const FLASH_CLASS = 'aq-spell-flash';
  el.classList.add(FLASH_CLASS);
  window.setTimeout(() => el.classList.remove(FLASH_CLASS), 1200);
}

function jumpToMatch(match: SpellMatch) {
  const win = window as any;
  try {
    if (typeof win.getActiveEditorInstance === 'function') {
      const editor = win.getActiveEditorInstance();
      editor?.commands?.setTextSelection?.({ from: match.offset, to: match.offset + match.length });
    }
  } catch (_e) {}
  const el = findSpanForOffset(match.offset);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flashSpan(el);
  }
}

function replaceMatch(match: SpellMatch, replacement: string) {
  const win = window as any;
  try {
    const editor = typeof win.getActiveEditorInstance === 'function' ? win.getActiveEditorInstance() : null;
    if (!editor || !editor.commands) return false;
    const range = { from: match.offset, to: match.offset + match.length };
    if (typeof editor.commands.insertContentAt === 'function') {
      editor.commands.insertContentAt(range, replacement);
      return true;
    }
    if (typeof editor.commands.setTextSelection === 'function'
      && typeof editor.commands.deleteRange === 'function'
      && typeof editor.commands.insertContent === 'function') {
      editor.commands.setTextSelection(range);
      editor.commands.deleteRange(range);
      editor.commands.insertContent(replacement);
      return true;
    }
  } catch (_e) {}
  return false;
}

export function SpellcheckPanel({ open, onClose }: SpellcheckPanelProps) {
  const { state } = useSpellcheck();
  // Session-local ignore set keyed by `${offset}:${text}` so re-running
  // the check after an edit doesn't re-surface a word the user dismissed
  // (until it actually changes position/content).
  const [ignored, setIgnored] = useState<Set<string>>(() => new Set());
  const [docText, setDocText] = useState('');

  // Panel açıldığında: belge metnini al + denetimi anında tetikle
  // (debounce'u atla). Sonraki match değişikliklerinde sadece bağlam
  // metnini tazele.
  useEffect(() => {
    if (!open) return;
    setDocText(takeEditorText());
    runCheckNow({ deep: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setDocText(takeEditorText());
  }, [state.matches]);

  const visibleMatches = useMemo(
    () => state.matches.filter((m) => !ignored.has(`${m.offset}:${m.text}`)),
    [state.matches, ignored]
  );

  if (!open) return null;

  return (
    <aside
      role="complementary"
      aria-label="Yazım denetimi sonuçları"
      className="aq-spell-panel fixed right-0 top-0 z-[1100] flex h-full w-[360px] flex-col border-l border-aq-line bg-white shadow-[0_0_28px_rgba(22,27,34,0.16)]"
    >
      <header className="flex h-12 items-center justify-between border-b border-aq-line px-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aq-muted">Yazım Denetimi</div>
          <div className="text-sm font-semibold">
            {state.matches.length === 0
              ? 'Yazım hatası yok'
              : `${visibleMatches.length} / ${state.matches.length} olası hata`}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => runCheckNow({ deep: true })}
            className="h-7 rounded-md border border-aq-line px-2 text-[11px] font-semibold text-aq-muted hover:bg-aq-panel"
            title="Belgeyi şimdi tekrar denetle"
          >
            Yenile
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Paneli kapat"
            className="h-7 w-7 rounded-md text-aq-muted hover:bg-aq-panel"
          >
            ×
          </button>
        </div>
      </header>

      {!state.enabled ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-aq-muted">
          Yazım denetimi kapalı. Ayarlar → Yazım Denetimi sekmesinden açın.
        </div>
      ) : state.loading ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-aq-muted">
          Sözlük yükleniyor…
        </div>
      ) : state.error ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-red-700">
          Yükleme hatası: {state.error}
        </div>
      ) : visibleMatches.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-aq-muted">
          {state.matches.length === 0
            ? '✓ Bu belgede yazım hatası bulunamadı.'
            : 'Tüm hatalar bu oturumda atlandı.'}
        </div>
      ) : (
        <ol className="flex-1 overflow-y-auto">
          {visibleMatches.map((m, idx) => {
            const key = `${m.offset}:${m.text}`;
            const ctx = buildContext(docText, m.offset, m.length);
            return (
              <li key={key + ':' + idx} className="border-b border-aq-line p-3">
                <button
                  type="button"
                  onClick={() => jumpToMatch(m)}
                  className="block w-full text-left"
                  title="Belgede bu konuma git"
                >
                  <div className="mb-1 text-[11px] leading-snug text-aq-muted">
                    {ctx.leading}
                    <span className="font-semibold text-red-700">{ctx.word}</span>
                    {ctx.trailing}
                  </div>
                  <div className="text-xs font-semibold text-aq-ink">{m.text}</div>
                </button>
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.replacements.length === 0 ? (
                    <span className="text-[10px] italic text-aq-muted">Öneri yok</span>
                  ) : (
                    m.replacements.slice(0, 5).map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => {
                          if (replaceMatch(m, r.value)) {
                            // Re-check immediately so the panel + markers refresh.
                            runCheckNow();
                          }
                        }}
                        className="rounded border border-aq-line bg-white px-2 py-0.5 text-[11px] font-medium hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                        title={`"${m.text}" → "${r.value}" olarak değiştir`}
                      >
                        {r.value}
                      </button>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={() => setIgnored((prev) => new Set(prev).add(key))}
                    className="ml-auto rounded border border-transparent px-2 py-0.5 text-[10px] text-aq-muted hover:bg-aq-panel"
                    title="Bu oturumda yoksay"
                  >
                    Atla
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
