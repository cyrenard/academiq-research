import { createContext, useContext } from 'react';
import type { MutableRefObject } from 'react';
import type { AcademiqEditorApi } from '../../lib/editor-adapter';

export type EditorContextValue = {
  editorRef: MutableRefObject<AcademiqEditorApi | null>;
};

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorCommands() {
  const context = useContext(EditorContext);
  if (!context) throw new Error('useEditorCommands must be used inside EditorContext.Provider');
  return context.editorRef;
}
