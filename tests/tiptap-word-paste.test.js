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

test('formatPlainTextAPA converts plain-text lists into semantic lists', () => {
  const html = paste.formatPlainTextAPA('- madde 1\n- madde 2\n\n1. kaynak 1\n2. kaynak 2');
  assert.match(html, /<ul[^>]*><li>madde 1<\/li><li>madde 2<\/li><\/ul>/);
  assert.match(html, /<ol[^>]*><li>kaynak 1<\/li><li>kaynak 2<\/li><\/ol>/);
});

test('cleanPastedHTML fallback strips dangerous nodes and events without DOM', () => {
  const cleaned = paste.cleanPastedHTML('<p onclick="evil()" style="mso-line-height-alt:120%;line-height:1.4">X</p><script>alert(1)</script>');
  assert.equal(cleaned.includes('<script'), false);
  assert.equal(cleaned.includes('onclick='), false);
  assert.match(cleaned, /line-height:1.4/);
});

test('cleanPastedHTML fallback strips style/meta/link blocks and MSO classes', () => {
  const input = '<!--[if gte mso 9]><xml></xml><![endif]-->'
    + '<style>p.MsoNormal { font: 14pt }</style>'
    + '<meta name="Generator" content="Microsoft Word">'
    + '<link rel="stylesheet" href="evil.css">'
    + '<p class="MsoNormal">Hello</p>';
  const cleaned = paste.cleanPastedHTML(input);
  assert.equal(cleaned.includes('<style'), false);
  assert.equal(cleaned.includes('<meta'), false);
  assert.equal(cleaned.includes('<link'), false);
  assert.equal(cleaned.includes('MsoNormal'), false);
  assert.match(cleaned, /<p[^>]*>Hello<\/p>/);
});

test('cleanPastedHTML fallback drops non-whitelisted style properties', () => {
  const cleaned = paste.cleanPastedHTML('<p style="position:absolute;top:100px;color:red;font-family:Arial;font-size:20pt">X</p>');
  assert.equal(cleaned.includes('position'), false);
  assert.equal(cleaned.includes('top:'), false);
  assert.match(cleaned, /color:red/i);
  assert.match(cleaned, /font-family:Arial/i);
  assert.match(cleaned, /font-size:20pt/i);
});

test('cleanPastedHTML fallback removes Word VML shapes without keeping textbox text', () => {
  const cleaned = paste.cleanPastedHTML('<p>Ana metin</p><v:shape><v:textbox><p>Sekil kalintisi</p></v:textbox></v:shape>');
  assert.match(cleaned, /Ana metin/);
  assert.equal(/Sekil kalintisi/i.test(cleaned), false);
  assert.equal(/v:shape/i.test(cleaned), false);
});

test('normalizeStyleAttribute preserves safe Word visual and paragraph styles', () => {
  const style = paste.normalizeStyleAttribute(
    'font-family:Aptos Display;font-size:16pt;color:#0F4761;background-color:rgb(255, 255, 0);text-align:center;margin-left:36pt;text-indent:-18pt;mso-style-name:Heading;position:absolute'
  );
  assert.match(style, /font-family:Aptos Display/);
  assert.match(style, /font-size:16pt/);
  assert.match(style, /color:#0F4761/i);
  assert.match(style, /background-color:rgb\(255, 255, 0\)/);
  assert.match(style, /text-align:center/);
  assert.match(style, /margin-left:36pt/);
  assert.match(style, /text-indent:-18pt/);
  assert.equal(/mso-style-name|position/i.test(style), false);
});

test('cleanPastedHTML fallback preserves paragraph layout styles', () => {
  const cleaned = paste.cleanPastedHTML('<p style="text-align:right;margin-left:36pt;text-indent:-18pt">Paragraf</p>');
  assert.match(cleaned, /text-align:right/);
  assert.match(cleaned, /margin-left:36pt/);
  assert.match(cleaned, /text-indent:-18pt/);
});
