import { memo, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { createEditor } from '../../lib/editor';
import type { AcademiqEditorApi, AcademiqEditorState } from '../../lib/editor-adapter';

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

    editorRef.current = createEditor({
      mount: containerRef.current,
      docId,
      initialState: initialStateRef.current,
      onChange: saveDraft
    });

    return () => {
      editorRef.current?.destroy?.();
      editorRef.current = null;
    };
  }, [docId, editorRef]);

  return <div ref={containerRef} className="min-h-0 h-full w-full overflow-hidden" data-aq-engine-editor data-editor-doc-id={docId} />;
}

export const AQEngineEditor = memo(AQEngineEditorComponent);
