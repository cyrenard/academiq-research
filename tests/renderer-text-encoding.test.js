const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(rootDir, ...parts), 'utf8');

test('current renderer status messages do not expose mojibake', () => {
  const referenceImport = read('src', 'renderer', 'components', 'shell', 'modals', 'ReferenceImportModal.tsx');
  const spellcheck = read('src', 'renderer', 'lib', 'spellcheck.ts');
  assert.doesNotMatch(referenceImport, /[ÃÅÄÂ�]/);
  assert.doesNotMatch(spellcheck, /OlasÄ|yazÄ|hatasÄ/);
  assert.match(spellcheck, /Olası yazım hatası/);
});

test('PDF activity labels and visual Word headings keep valid Turkish text', () => {
  const pdfState = read('src', 'pdf-viewer-state.js');
  const legacy = read('src', 'legacy-runtime.js');
  const wordImport = read('src', 'tiptap-word-io.js');
  assert.match(pdfState, /highlight · .* not/);
  assert.match(legacy, /activityLabel\+=' · '/);
  assert.doesNotMatch(wordImport, /Ã¶zet|giriÅŸ|yÃ¶ntem|tartÄ±ÅŸma|sonuÃ§/);
  assert.match(wordImport, /özet\|ozet\|giriş\|giris\|yöntem/);
});

test('browser capture status tolerates the pre-React mount window', () => {
  const legacy = read('src', 'legacy-runtime.js');
  assert.match(legacy, /function setDst\(m,c\)\{var e=document\.getElementById\('dst'\);if\(!e\)return;/);
});
