const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..', '..');

test('React delete handlers await custom confirm dialog instead of native confirm', () => {
  const app = fs.readFileSync(path.join(rootDir, 'src', 'renderer', 'App.tsx'), 'utf8');
  assert.match(app, /import \{ ConfirmDialog \}/);
  assert.match(app, /<ConfirmDialog \/>/);
  assert.match(app, /const handleDeleteDocument = async/);
  assert.match(app, /await confirmDialog\(`\$\{current\.name \|\| current\.id\} silinsin mi\?`\)/);
  assert.match(app, /const handleDeleteWorkspace = async/);
  assert.match(app, /await confirmDialog\(`\$\{current\.name\} silinsin mi\?`\)/);
});
