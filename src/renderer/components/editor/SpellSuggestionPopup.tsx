import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { AcademiqEditorApi } from '../../lib/editor-adapter';

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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceFirstWord(html: string, word: string, replacement: string) {
  if (!word) return html;
  return html.replace(new RegExp(escapeRegex(word)), replacement);
}

export function SpellSuggestionPopup({ editorRef }: SpellSuggestionPopupProps) {
  const [popup, setPopup] = useState<PopupState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>('.aq-spell-error, .aq-spell')
        : null;
      if (!target) {
        setPopup(null);
        return;
      }
      const word = (target.textContent || '').trim();
      if (!word) return;
      event.preventDefault();
      event.stopPropagation();
      const base: PopupState = {
        word,
        x: event.clientX,
        y: event.clientY,
        target,
        suggestions: [],
        loading: true
      };
      setPopup(base);
      window.electronAPI?.spell?.suggest?.(word, 'tr')
        .then((suggestions) => {
          if (!cancelled) setPopup({ ...base, suggestions: Array.isArray(suggestions) ? suggestions : [], loading: false });
        })
        .catch(() => {
          if (!cancelled) setPopup({ ...base, suggestions: [], loading: false });
        });
    };
    document.addEventListener('click', onClick, true);
    return () => {
      cancelled = true;
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
      role="menu"
      aria-label="Yazım önerileri"
      className="fixed z-[120] min-w-44 rounded-md border border-aq-line bg-white p-1 text-sm shadow-lg"
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
