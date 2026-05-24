import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { AcademiqEditorApi } from '../../lib/editor-adapter';
import { suggestWord } from '../../lib/spellcheck';
import { getSpellcheckState } from '../../lib/spellcheck-controller';

type PopupState = {
  word: string;
  x: number;
  y: number;
  target: HTMLElement;
  suggestions: string[];
  loading: boolean;
};

type SpellSuggestionPopupProps = {
  editorRef: MutableRefObject<AcademiqEditorApi | null>;
};

const SPELL_SELECTOR = '.aq-spell-error, .aq-spell, .aq-spell-mistake, [data-spell-offset]';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceFirstWord(html: string, word: string, replacement: string) {
  if (!word) return html;
  return html.replace(new RegExp(escapeRegex(word)), replacement);
}

function eventElement(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) return target;
  const node = target instanceof Node ? target : null;
  return node?.parentElement || null;
}

function spellTargetFromEvent(target: EventTarget | null): HTMLElement | null {
  return eventElement(target)?.closest<HTMLElement>(SPELL_SELECTOR) || null;
}

function suggestionsFromMatch(match: ReturnType<typeof getSpellcheckState>['matches'][number] | null): string[] {
  if (!match || !Array.isArray(match.replacements)) return [];
  const seen = new Set<string>();
  return match.replacements
    .map((item) => String(item?.value || '').trim())
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

export function SpellSuggestionPopup({ editorRef }: SpellSuggestionPopupProps) {
  const [popup, setPopup] = useState<PopupState | null>(null);

  useEffect(() => {
    let cancelled = false;
    let lastOpen = { target: null as HTMLElement | null, at: 0 };
    const onClick = (event: MouseEvent) => {
      if (eventElement(event.target)?.closest('[data-spell-suggestion-popup]')) return;
      const target = spellTargetFromEvent(event.target);
      if (!target) {
        setPopup(null);
        return;
      }
      const now = Date.now();
      if (lastOpen.target === target && now - lastOpen.at < 250) return;
      lastOpen = { target, at: now };
      const offset = Number(target.dataset.spellOffset);
      const match = Number.isFinite(offset)
        ? getSpellcheckState().matches.find((item) => item.offset === offset)
        : null;
      const resolvedMatch = match ?? null;
      const word = String(resolvedMatch?.text || target.textContent || '').trim();
      if (!word) return;
      event.preventDefault();
      event.stopPropagation();
      const fallbackSuggestions = suggestionsFromMatch(resolvedMatch);
      const base: PopupState = {
        word,
        x: event.clientX,
        y: event.clientY,
        target,
        suggestions: fallbackSuggestions,
        loading: fallbackSuggestions.length === 0
      };
      setPopup(base);
      if (fallbackSuggestions.length > 0) return;
      suggestWord(word, { maxSuggestions: 8, preferNative: true, workspaceId: getSpellcheckState().workspaceId ?? undefined })
        .then((suggestions) => {
          if (!cancelled) {
            setPopup({ ...base, suggestions: Array.isArray(suggestions) ? suggestions : [], loading: false });
          }
        })
        .catch(() => {
          Promise.resolve(window.electronAPI?.spell?.suggest?.(word, 'tr', getSpellcheckState().workspaceId ?? undefined) || [])
            .then((suggestions) => {
              if (!cancelled) {
                setPopup({ ...base, suggestions: Array.isArray(suggestions) ? suggestions.map(String) : [], loading: false });
              }
            })
            .catch(() => {
              if (!cancelled) setPopup({ ...base, suggestions: [], loading: false });
            });
        });
    };
    document.addEventListener('pointerup', onClick, true);
    document.addEventListener('click', onClick, true);
    return () => {
      cancelled = true;
      document.removeEventListener('pointerup', onClick, true);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  if (!popup) return null;

  const applySuggestion = (suggestion: string) => {
    const editor = editorRef.current;
    if (editor && typeof editor.getHTML === 'function' && typeof editor.setHTML === 'function') {
      editor.setHTML(replaceFirstWord(editor.getHTML(), popup.word, suggestion));
    } else {
      popup.target.textContent = suggestion;
    }
    popup.target.classList.remove('aq-spell-error', 'aq-spell');
    setPopup(null);
  };

  return (
    <div
      data-spell-suggestion-popup
      role="menu"
      aria-label="Yazım önerileri"
      className="fixed z-[4200] min-w-44 rounded-md border border-aq-line bg-white p-1 text-sm shadow-lg"
      style={{ left: popup.x, top: popup.y }}
    >
      <div className="px-2 py-1 text-xs font-semibold text-aq-muted">{popup.word}</div>
      {popup.loading ? (
        <div className="px-2 py-1 text-xs text-aq-muted">Öneriler yükleniyor...</div>
      ) : popup.suggestions.length ? (
        popup.suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            role="menuitem"
            className="block w-full rounded px-2 py-1 text-left hover:bg-aq-panel"
            onClick={() => applySuggestion(suggestion)}
          >
            {suggestion}
          </button>
        ))
      ) : (
        <div className="px-2 py-1 text-xs text-aq-muted">Öneri yok</div>
      )}
    </div>
  );
}
