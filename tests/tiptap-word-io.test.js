const test = require('node:test');
const assert = require('node:assert/strict');

const io = require('../src/tiptap-word-io.js');

test('tiptap word io exports import and export helpers', () => {
  assert.equal(typeof io.looksLikeHTML, 'function');
  assert.equal(typeof io.normalizeImportHTML, 'function');
  assert.equal(typeof io.applyImportedHTML, 'function');
  assert.equal(typeof io.buildPrintablePageClone, 'function');
  assert.equal(typeof io.buildPDFExportOptions, 'function');
});

test('normalizeImportHTML distinguishes html and plain text', () => {
  assert.equal(io.looksLikeHTML('<p>x</p>'), true);
  assert.equal(io.looksLikeHTML('duz metin'), false);
  assert.match(io.normalizeImportHTML('duz metin', text => '<p>' + text + '</p>'), /<p>duz metin<\/p>/);
  assert.equal(io.normalizeImportHTML('<h1>X</h1>'), '<h1>X</h1>');
});
