const test = require('node:test');
const assert = require('node:assert/strict');

const pdfExport = require('../src/main-process-pdf-export.js');

test('sanitizeExportHTML strips executable browser content', () => {
  const cleaned = pdfExport.sanitizeExportHTML(
    '<div onclick="evil()">x</div><script>alert(1)</script><iframe src="x"></iframe><p>ok</p>'
  );
  assert.equal(cleaned.includes('onclick='), false);
  assert.equal(cleaned.includes('<script'), false);
  assert.equal(cleaned.includes('<iframe'), false);
  assert.equal(cleaned.includes('<p>ok</p>'), true);
});

test('buildExportHTML wraps fragment into hardened html document', () => {
  const html = pdfExport.buildExportHTML({ exportHTML:'<p>Paragraf</p>' });
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /aq-export-root/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /Paragraf/);
});

test('buildExportHTML preserves full html documents', () => {
  const source = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><p>tam</p></body></html>';
  const html = pdfExport.buildExportHTML({ exportHTML:source });
  assert.match(html, /<html>/i);
  assert.match(html, /<p>tam<\/p>/i);
});

test('buildPrintToPDFOptions enables page header numbering by default', () => {
  const opts = pdfExport.buildPrintToPDFOptions();
  assert.equal(opts.pageSize, 'A4');
  assert.equal(opts.displayHeaderFooter, true);
  assert.match(String(opts.headerTemplate || ''), /pageNumber/);
});

test('buildPrintToPDFOptions can disable page header numbering', () => {
  const opts = pdfExport.buildPrintToPDFOptions({ showPageNumbers:false });
  assert.equal(opts.displayHeaderFooter, false);
});
