import type { MutableRefObject } from 'react';
import type { AcademiqEditorApi, AcademiqEditorState } from '../../lib/editor-adapter';
import { AQEngineEditor } from './AQEngineEditor';

type EditorHostProps = {
  docId: string;
  editorRef: MutableRefObject<AcademiqEditorApi | null>;
  initialState: unknown;
  onEditorChange: (state: AcademiqEditorState) => void;
};

export function EditorHost(props: EditorHostProps) {
  return <AQEngineEditor {...props} />;
}
