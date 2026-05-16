import type { AcademiqEditorApi, CreateAcademiqEditorOptions } from './editor-adapter';
import { createAcademiqEditor } from './editor-adapter';

type ChainCommand = {
  focus: () => ChainCommand;
  toggleBold: () => ChainCommand;
  run: () => boolean;
};

export function createEditor(options: CreateAcademiqEditorOptions): AcademiqEditorApi {
  return createAcademiqEditor(options);
}

export function getActiveEditor() {
  const win = window as any;
  if (typeof win.getActiveEditorInstance === 'function') return win.getActiveEditorInstance();
  return win.editor || null;
}

export function runCompatBold() {
  const editor = getActiveEditor();
  if (!editor || typeof editor.chain !== 'function') return false;
  return editor.chain().focus().toggleBold().run();
}

export function createNoopCompatEditor() {
  const chain: ChainCommand = {
    focus: () => chain,
    toggleBold: () => chain,
    run: () => true
  };
  return { chain: () => chain };
}
