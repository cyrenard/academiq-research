const test = require('node:test');
const assert = require('node:assert/strict');

const paste = require('../src/tiptap-word-paste.js');

test('tiptap word paste exports cleaning helpers', () => {
  assert.equal(typeof paste.cleanPastedHTML, 'function');
  assert.equal(typeof paste.formatPlainTextAPA, 'function');
});

test('formatPlainTextAPA wraps paragraphs and escapes html', () => {
  const html = paste.formatPlainTextAPA('Ilk paragraf\n\nIkinci <paragraf>');
  assert.match(html, /<p data-indent-mode="first-line">Ilk paragraf<\/p>/);
  assert.match(html, /&lt;paragraf&gt;/);
});
