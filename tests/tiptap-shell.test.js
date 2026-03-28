const test = require('node:test');
const assert = require('node:assert/strict');

const shell = require('../src/tiptap-shell.js');

test('buildShellMarkup creates separate shell, body and content mount', () => {
  const markup = shell.buildShellMarkup();
  assert.match(markup, /aq-tiptap-shell/);
  assert.match(markup, /aq-tiptap-body/);
  assert.match(markup, /aq-tiptap-content/);
});

test('normalizeHTML falls back to blank paragraph', () => {
  assert.equal(shell.normalizeHTML(''), '<p></p>');
  assert.equal(shell.normalizeHTML('   '), '<p></p>');
  assert.equal(shell.normalizeHTML('<p>Metin</p>'), '<p>Metin</p>');
});
