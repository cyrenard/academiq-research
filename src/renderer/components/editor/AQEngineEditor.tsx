import React, { Component, memo, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { createEditor } from '../../lib/editor';
import type { AcademiqEditorApi, AcademiqEditorState } from '../../lib/editor-adapter';
import { scheduleRecheck } from '../../lib/spellcheck-controller';
import { scheduleCitationAudit } from '../../lib/citation-audit-controller';


type AQEngineEditorProps = {
  docId: string;
  editorRef: MutableRefObject<AcademiqEditorApi | null>;
  initialState: unknown;
  onEditorChange: (state: AcademiqEditorState) => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

class EditorErrorBoundary extends Component<{ children: React.ReactNode; docId: string; onRecover: () => void }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Editor crashed:', error, errorInfo);
  }

  override componentDidUpdate(prevProps: { docId: string }) {
    if (prevProps.docId !== this.props.docId) {
      this.setState({ hasError: false, error: null });
    }
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-amber-50 dark:bg-zinc-900 border border-amber-200 dark:border-zinc-800 rounded-lg text-center m-4 max-w-xl mx-auto shadow-md">
          <svg className="w-16 h-16 text-amber-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Editör Yüklenirken Bir Hata Oluştu</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
            Editör çalışırken beklenmeyen bir hata meydana geldi. Belge verilerinizi kurtarmak için en son otomatik kaydedilen taslağı yükleyebilirsiniz.
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                this.props.onRecover();
              }}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded text-sm font-semibold transition cursor-pointer"
            >
              Taslağı Yükle ve Kurtar
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-white rounded text-sm font-semibold transition cursor-pointer"
            >
              Uygulamayı Yeniden Başlat
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
      if (!html || html === lastHTML) return;
      onEditorChangeRef.current({
        docId,
        html,
        snapshot: editorRef.current?.exportSnapshot?.() || null
      });
    }, 700);

    let isComposing = false;

    const debouncedScheduleNotify = debounce(() => {
      if (isComposing) return;
      scheduleRecheck();
      scheduleCitationAudit();
      notifyFromEditor();
    }, 80);

    const scheduleNotify = () => {
      if (isComposing) return;
      debouncedScheduleNotify();
    };

    const handleCompositionStart = () => {
      isComposing = true;
    };

    const handleCompositionEnd = () => {
      isComposing = false;
      scheduleNotify();
    };

    const handleBlur = () => {
      editorRef.current?.flush?.();
    };

    editorRef.current = createEditor({
      mount: containerRef.current,
      docId,
      initialState: initialStateRef.current,
      onChange: (state) => {
        lastHTML = state.html;
        if (!isComposing) {
          scheduleRecheck();
          scheduleCitationAudit();
        }
        saveDraft(state);
      }
    });
    lastHTML = editorRef.current?.getHTML?.() || '';
    window.setTimeout(() => {
      scheduleRecheck();
      scheduleCitationAudit();
    }, 400);

    const container = containerRef.current;
    const eventNames = ['beforeinput', 'input', 'keyup', 'paste', 'cut'];
    eventNames.forEach((eventName) => container.addEventListener(eventName, scheduleNotify, true));
    container.addEventListener('compositionstart', handleCompositionStart, true);
    container.addEventListener('compositionend', handleCompositionEnd, true);
    container.addEventListener('blur', handleBlur, true);

    const observer = new MutationObserver(scheduleNotify);
    observer.observe(container, { childList: true, subtree: true, characterData: true });

    return () => {
      eventNames.forEach((eventName) => container.removeEventListener(eventName, scheduleNotify, true));
      container.removeEventListener('compositionstart', handleCompositionStart, true);
      container.removeEventListener('compositionend', handleCompositionEnd, true);
      container.removeEventListener('blur', handleBlur, true);
      observer.disconnect();
      editorRef.current?.destroy?.();
      editorRef.current = null;
    };
  }, [docId, editorRef]);

  return <div ref={containerRef} className="min-h-0 h-full w-full overflow-hidden" data-aq-engine-editor data-editor-doc-id={docId} />;
}

function AQEngineEditorWrapper(props: AQEngineEditorProps) {
  const [recoveryKey, setRecoveryKey] = useState(0);

  const handleRecover = () => {
    setRecoveryKey((prev) => prev + 1);
  };

  return (
    <EditorErrorBoundary key={`${props.docId}-${recoveryKey}`} docId={props.docId} onRecover={handleRecover}>
      <AQEngineEditorComponent {...props} />
    </EditorErrorBoundary>
  );
}

export const AQEngineEditor = memo(AQEngineEditorWrapper);
