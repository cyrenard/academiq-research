const test = require('node:test');
const assert = require('node:assert/strict');

const templates = require('../src/tiptap-word-templates.js');

test('tiptap word templates exports cover and template helpers', () => {
  assert.equal(typeof templates.buildCoverHTML, 'function');
  assert.equal(typeof templates.getTemplate, 'function');
});

test('buildCoverHTML and getTemplate return expected content', () => {
  const cover = templates.buildCoverHTML({
    title:'Deneme',
    author:'Yazar',
    dateText:'27 Mart 2026'
  });
  const article = templates.getTemplate('makale');

  assert.match(cover, /Deneme/);
  assert.match(cover, /Yazar/);
  assert.match(article, /Kaynakça/);
});
