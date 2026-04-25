const test = require('node:test');
const assert = require('node:assert/strict');

const pdfAnnotationExport = require('../src/pdf-annotation-export.js');

test('sanitizeFilename removes invalid Windows filename characters', () => {
  assert.equal(
    pdfAnnotationExport.sanitizeFilename('A/B:C*D?E"F<G>H|I', 'fallback'),
    'A B C D E F G H I'
  );
});

test('buildAnnotatedPdfExportDocument creates self-contained page HTML', () => {
  const html = pdfAnnotationExport.buildAnnotatedPdfExportDocument({
    title: 'Annotated <PDF>',
    pages: [{
      page: 1,
      width: 800,
      height: 1000,
      dataUrl: 'data:image/png;base64,abc',
      drawingDataUrl: 'data:image/png;base64,draw',
      notes: [{ x: 10, y: 20, w: 200, text: 'Important <note>' }]
    }]
  });

  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /aq-pdf-export-page/);
  assert.match(html, /data:image\/png;base64,abc/);
  assert.match(html, /data:image\/png;base64,draw/);
  assert.match(html, /Important &lt;note&gt;/);
  assert.doesNotMatch(html, /<note>/);
});

test('buildAnnotatedPdfExportDocument handles empty page input safely', () => {
  const html = pdfAnnotationExport.buildAnnotatedPdfExportDocument({ title: 'Empty' });
  assert.match(html, /PDF sayfası bulunamadı/);
});
