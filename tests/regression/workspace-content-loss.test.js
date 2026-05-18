const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..', '..');

test('workspace content loss regression is covered in app-state tests', () => {
  const source = fs.readFileSync(path.join(rootDir, 'src', 'renderer', 'lib', 'app-state.test.ts'), 'utf8');
  assert.match(source, /preserves committed active document content/);
  assert.equal(source.includes("updateActiveDocumentHTML(createBlankState(), '<p>ABC</p>')"), true);
  assert.match(source, /switchWorkspace\(added, originalWorkspace\)/);
});

test('App commits fresh editor HTML before workspace and document transitions', () => {
  const source = fs.readFileSync(path.join(rootDir, 'src', 'renderer', 'App.tsx'), 'utf8');
  assert.match(source, /const commitEditorHTML = useCallback\(async \(\)/);
  assert.match(source, /await maybeHTML/);
  assert.match(source, /const committed = await commitEditorHTML\(\);\s*const next = addWorkspace/s);
  assert.match(source, /const committed = await commitEditorHTML\(\);\s*const next = switchWorkspace/s);
  assert.match(source, /const committed = await commitEditorHTML\(\);\s*const next = switchDocument/s);
});
