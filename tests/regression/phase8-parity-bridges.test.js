const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(rootDir, file), 'utf8');

test('React shell mounts inline interaction and spell left-click handlers', () => {
  const app = read('src/renderer/App.tsx');
  assert.match(app, /<InlineInteractionHandler \/>/);
  assert.match(app, /<SpellSuggestionPopup editorRef=\{editorRef\}/);
  assert.match(app, /aq:react-edit-reference/);
});

test('inline interaction handler covers citation footnote xref link image and table clicks', () => {
  const handler = read('src/renderer/components/editor/InlineInteractionHandler.tsx');
  [
    '.aq-citation',
    '[data-cit]',
    '.aq-fn-ref',
    '[data-fnid]',
    '.aq-cross-ref',
    '[data-href]',
    '.aq-engine-image',
    '.aq-engine-table-cell'
  ].forEach((needle) => assert.match(handler, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
});

test('toolbar exposes track changes, footnote and margin note bridge actions', () => {
  const toolbar = read('src/renderer/components/shell/TopToolbar.tsx');
  assert.match(toolbar, /AQFootnotes', 'insertFootnote', 'footnote'/);
  assert.match(toolbar, /AQMarginNotes/);
  assert.match(toolbar, /toggleTrackChanges/);
  assert.match(toolbar, /Değişiklikleri izle/);
});

test('AppShell exposes matrix nav and APA status opens lean linter before fallback', () => {
  const shell = read('src/renderer/components/shell/AppShell.tsx');
  const app = read('src/renderer/App.tsx');
  assert.match(shell, /navButton\('matrix', 'Matris'\)/);
  assert.match(app, /openLeanSidePanel\('linter'\)/);
  assert.match(app, /openShortcutHelp/);
});
