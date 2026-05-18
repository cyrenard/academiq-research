const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..', '..');

test('React shell has a left-click spell suggestion popup wired to aq spell spans', () => {
  const component = fs.readFileSync(
    path.join(rootDir, 'src', 'renderer', 'components', 'editor', 'SpellSuggestionPopup.tsx'),
    'utf8'
  );
  const app = fs.readFileSync(path.join(rootDir, 'src', 'renderer', 'App.tsx'), 'utf8');
  assert.match(component, /document\.addEventListener\('click'/);
  assert.match(component, /\.aq-spell-error, \.aq-spell/);
  assert.match(component, /window\.electronAPI\?\.spell\?\.suggest/);
  assert.match(component, /setHTML\(replaceFirstWord/);
  assert.match(app, /<SpellSuggestionPopup editorRef=\{editorRef\}/);
});
