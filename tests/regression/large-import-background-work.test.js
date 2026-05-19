const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');

test('spellcheck controller uses native cooperative checks for large Tauri documents', () => {
  const source = fs.readFileSync(path.join(root, 'src/renderer/lib/spellcheck-controller.ts'), 'utf8');
  assert.match(source, /preferNativeSpell\(\)/);
  assert.match(source, /ensureSpellLoaded\(\{ preferNative: preferNativeSpell\(\) \}\)/);
  assert.match(source, /checkTextCooperatively/);
  assert.match(source, /NATIVE_CHUNK_CHARS/);
  assert.match(source, /MAX_AUTO_CHECK_CHARS/);
  assert.match(source, /MAX_DEEP_CHECK_CHARS/);
  assert.match(source, /visibleTextWindow/);
  assert.match(source, /selectDocumentTextForCheck/);
  assert.match(source, /MAX_MARKED_MATCHES/);
  assert.match(source, /checkInFlight/);
});

test('spellcheck panel requests a deeper cooperative scan on demand', () => {
  const source = fs.readFileSync(path.join(root, 'src/renderer/components/shell/SpellcheckPanel.tsx'), 'utf8');
  assert.match(source, /runCheckNow\(\{ deep: true \}\)/);
});

test('plain citation import cleanup is bounded on large imported documents', () => {
  const source = fs.readFileSync(path.join(root, 'src/plain-citation-linking.js'), 'utf8');
  assert.match(source, /AUTO_ANALYSIS_MAX_BLOCKS/);
  assert.match(source, /AUTO_ANALYSIS_MAX_CHARS/);
  assert.match(source, /maxTextLength/);
  assert.match(source, /skipPlainCitations: textLength > AUTO_ANALYSIS_MAX_CHARS \* 2/);
  assert.match(source, /results\.truncated = true/);
});
