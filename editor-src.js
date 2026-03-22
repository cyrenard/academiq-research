// editor-src.js — TipTap bundle source
// All exports will be available as window.TipTap.*

export { Editor, Extension, Node, Mark, mergeAttributes } from '@tiptap/core';
export { StarterKit } from '@tiptap/starter-kit';
export { Underline } from '@tiptap/extension-underline';
export { TextAlign } from '@tiptap/extension-text-align';
export { Placeholder } from '@tiptap/extension-placeholder';
export { TextStyle } from '@tiptap/extension-text-style';
export { FontFamily } from '@tiptap/extension-font-family';
export { Table } from '@tiptap/extension-table';
export { TableRow } from '@tiptap/extension-table-row';
export { TableCell } from '@tiptap/extension-table-cell';
export { TableHeader } from '@tiptap/extension-table-header';
export { Image } from '@tiptap/extension-image';
export { Color } from '@tiptap/extension-color';
export { Highlight } from '@tiptap/extension-highlight';

// Re-export ProseMirror essentials
export { Plugin as PmPlugin, PluginKey as PmPluginKey } from '@tiptap/pm/state';
export { Decoration, DecorationSet } from '@tiptap/pm/view';
