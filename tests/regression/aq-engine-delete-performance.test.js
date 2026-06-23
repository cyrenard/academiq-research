const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const AQEngineDocument = require(path.join(root, 'experiments', 'aq-engine', 'document.js'));

test('AQ Engine batches repeated same-block deletes into one undo step', () => {
  const doc = AQEngineDocument.create([{ type: 'paragraph', runs: [{ text: 'abcdef' }] }]);

  doc.deleteRange(5, 6);
  doc.deleteRange(4, 5);
  doc.deleteRange(3, 4);

  assert.equal(doc.getPlainText(), 'abc');
  assert.equal(doc.undo(), true);
  assert.equal(doc.getPlainText(), 'abcdef');
});

test('AQ Engine keeps single-block deletes off the full-document clone path', () => {
  const source = fs.readFileSync(path.join(root, 'experiments', 'aq-engine', 'document.js'), 'utf8');

  assert.match(source, /function deleteRangeInPlace\(doc, from, to\)/);
  assert.match(source, /if\(!deleteRangeInPlace\(doc, from, to\)\) doc = deleteRange\(doc, from, to\);/);
  assert.match(source, /function blockStartOffset\(doc, blockIdx\)/);
  assert.doesNotMatch(source, /function findWordBoundary\(doc, off, direction\)\{\s*var t = getPlainText\(doc\);/);
});

test('AQ Engine interactive edits coalesce layout work onto animation frames', () => {
  const source = fs.readFileSync(path.join(root, 'experiments', 'aq-engine', 'compat-shim.js'), 'utf8');

  assert.match(source, /function scheduleInteractiveReflow\(\)/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /if\(_interactiveReflowTimer\) return;/);
  assert.match(source, /onChanged:\s*function\(\)\{\s*scheduleInteractiveReflow\(\);\s*\}/);
});
