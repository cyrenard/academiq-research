const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..', '..');

function read(file) {
  return fs.readFileSync(path.join(rootDir, file), 'utf8');
}

test('AQ Engine editor keeps the legacy Word/HTML paste cleaning hooks', () => {
  const editor = read('src/tiptap-word-editor.js');
  const init = read('src/tiptap-word-init.js');
  assert.match(editor, /createApaPasteExtension/);
  assert.match(editor, /hooks\.cleanPastedHTML/);
  assert.match(editor, /hooks\.formatPlainTextAPA/);
  assert.match(editor, /PASTE_HTML_CAP/);
  assert.match(init, /AQTipTapWordPaste/);
  assert.match(init, /cleanPastedHTML/);
  assert.match(init, /formatPlainTextAPA/);
});

test('React shell routes pasted images into the existing image insertion engine', () => {
  const host = read('src/renderer/components/shell/LegacyCompatibilityHost.tsx');
  assert.match(host, /document\.addEventListener\('paste', onPaste, true\)/);
  assert.match(host, /clipboardData\?\.files/);
  assert.match(host, /startsWith\('image\/'\)/);
  assert.match(host, /insertImageFileObject\(file, onStatus\)/);
  assert.match(host, /event\.preventDefault\(\)/);
});
