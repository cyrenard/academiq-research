import { memo, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { createAcademiqEditor, type AcademiqEditorApi, type AcademiqEditorState } from '../../lib/editor-adapter';

type EditorHostProps = {
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

function EditorHostComponent({ docId, editorRef, initialState, onEditorChange }: EditorHostProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const initialStateRef = useRef(initialState);
  const onEditorChangeRef = useRef(onEditorChange);

  initialStateRef.current = initialState;
  onEditorChangeRef.current = onEditorChange;

  useEffect(() => {
    if (!rootRef.current) return;
    if (import.meta.env.DEV) console.info('[AcademiQ] EditorHost mount', { docId });

    const saveDraft = debounce((state: AcademiqEditorState) => onEditorChangeRef.current(state), 800);

    editorRef.current = createAcademiqEditor({
      mount: rootRef.current,
      docId,
      initialState: initialStateRef.current,
      onChange: saveDraft
    });

    return () => {
      if (import.meta.env.DEV) console.info('[AcademiQ] EditorHost destroy', { docId });
      editorRef.current?.destroy?.();
      editorRef.current = null;
    };
  }, [docId, editorRef]);

  return <div ref={rootRef} className="min-h-0 h-full w-full overflow-hidden" data-editor-doc-id={docId} />;
}

export const EditorHost = memo(EditorHostComponent);
