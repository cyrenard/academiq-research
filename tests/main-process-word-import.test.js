const test = require('node:test');
const assert = require('node:assert/strict');

const wordImport = require('../src/main-process-word-import.js');

function toUtf16BeBuffer(text, withBom = true) {
  const le = Buffer.from(String(text || ''), 'utf16le');
  const be = Buffer.alloc(le.length + (withBom ? 2 : 0));
  let offset = 0;
  if (withBom) {
    be[0] = 0xFE;
    be[1] = 0xFF;
    offset = 2;
  }
  for (let i = 0; i < le.length; i += 2) {
    be[offset + i] = le[i + 1];
    be[offset + i + 1] = le[i];
  }
  return be;
}

test('word import decoder exports expected helpers', () => {
  assert.equal(typeof wordImport.decodeWordImportBuffer, 'function');
  assert.equal(typeof wordImport.scoreDecodedWordHtml, 'function');
  assert.equal(typeof wordImport.detectMetaCharset, 'function');
  assert.equal(typeof wordImport.detectLikelyUtf16LEWithoutBom, 'function');
  assert.equal(typeof wordImport.hasHtmlLikeSignals, 'function');
});

test('detectMetaCharset normalizes unicode alias to utf-16le', () => {
  const raw = Buffer.from('<html><head><meta charset="unicode"></head><body>x</body></html>', 'latin1');
  assert.equal(wordImport.detectMetaCharset(raw), 'utf-16le');
});

test('decodeWordImportBuffer resolves UTF-16LE html without BOM when charset is unicode', () => {
  const html = '<html><head><meta charset="unicode"></head><body><p>Kaynakça</p></body></html>';
  const raw = Buffer.from(html, 'utf16le');
  const decoded = wordImport.decodeWordImportBuffer(raw);
  assert.equal(decoded.encoding, 'utf-16le');
  assert.match(decoded.html, /<p>Kaynakça<\/p>/);
  assert.equal(decoded.html.includes('\u0000'), false);
});

test('decodeWordImportBuffer resolves UTF-16BE BOM payloads', () => {
  const html = '<html><body><p>References</p></body></html>';
  const raw = toUtf16BeBuffer(html, true);
  const decoded = wordImport.decodeWordImportBuffer(raw);
  assert.equal(decoded.encoding, 'utf-16be');
  assert.match(decoded.html, /<p>References<\/p>/);
});

test('scoreDecodedWordHtml prefers clean html over nul-heavy mojibake', () => {
  const validHtml = '<html><body><p>Normal metin</p></body></html>';
  const mojibake = '<\u0000h\u0000t\u0000m\u0000l\u0000>\u0000m\u0000s\u0000o\u0000-\u0000s\u0000t\u0000y\u0000l\u0000e\u0000';
  assert.ok(
    wordImport.scoreDecodedWordHtml(validHtml) > wordImport.scoreDecodedWordHtml(mojibake)
  );
});

test('hasHtmlLikeSignals detects structural html and rejects plain text', () => {
  assert.equal(wordImport.hasHtmlLikeSignals('<html><body><p>x</p></body></html>'), true);
  assert.equal(wordImport.hasHtmlLikeSignals('mso-style-name:Baslik 1; font-family:Aptos Display;'), false);
});
