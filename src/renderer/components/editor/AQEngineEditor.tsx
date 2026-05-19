import { memo, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { createEditor } from '../../lib/editor';
import type { AcademiqEditorApi, AcademiqEditorState } from '../../lib/editor-adapter';
import { scheduleRecheck } from '../../lib/spellcheck-controller';

type AQEngineEditorProps = {
  docId: string;
  editorRef: MutableRefObject<AcademiqEditorApi | null>;
  initialState: unknown;
  onEditorChange: (state: AcademiqEditorState) => void;
};

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timer: number | undefined;
  return (...args: Parameters<T>) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

function AQEngineEditorComponent({ docId, editorRef, initialState, onEditorChange }: AQEngineEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initialStateRef = useRef(initialState);
  const onEditorChangeRef = useRef(onEditorChange);

  initialStateRef.current = initialState;
  onEditorChangeRef.current = onEditorChange;

  useEffect(() => {
    if (!containerRef.current) return;
    const saveDraft = debounce((state: AcademiqEditorState) => onEditorChangeRef.current(state), 1600);
    let lastHTML = '';
    const notifyFromEditor = debounce(() => {
      const html = editorRef.current?.getHTML?.() || '';
      scheduleRecheck();
      if (!html || html === lastHTML) return;
      lastHTML = html;
      onEditorChangeRef.current({
        docId,
        html,
        snapshot: editorRef.current?.exportSnapshot?.() || null
      });
    }, 700);

    editorRef.current = createEditor({
      mount: containerRef.current,
      docId,
      initialState: initialStateRef.current,
      onChange: (state) => {
        lastHTML = state.html;
        scheduleRecheck();
        saveDraft(state);
      }
    });
    lastHTML = editorRef.current?.getHTML?.() || '';
    window.setTimeout(scheduleRecheck, 400);

    const scheduleNotify = () => window.setTimeout(notifyFromEditor, 0);
    const container = containerRef.current;
    const eventNames = ['beforeinput', 'input', 'keyup', 'compositionend', 'paste', 'cut'];
    eventNames.forEach((eventName) => container.addEventListener(eventName, scheduleNotify, true));
    const observer = new MutationObserver(scheduleNotify);
    observer.observe(container, { childList: true, subtree: true, characterData: true });

    return () => {
      eventNames.forEach((eventName) => container.removeEventListener(eventName, scheduleNotify, true));
      observer.disconnect();
      editorRef.current?.destroy?.();
      editorRef.current = null;
    };
  }, [docId, editorRef]);

  return <div ref={containerRef} className="min-h-0 h-full w-full overflow-hidden" data-aq-engine-editor data-editor-doc-id={docId} />;
}

export const AQEngineEditor = memo(AQEngineEditorComponent);
