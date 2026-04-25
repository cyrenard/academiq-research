'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const annotate = require('../src/main-process-pdf-annotate.js');

test('parseHexColor handles #RGB, #RRGGBB, and fallback', () => {
  const yellow = annotate.parseHexColor('#ff0');
  assert.ok(Math.abs(yellow.r - 1) < 1e-6);
  assert.ok(Math.abs(yellow.g - 1) < 1e-6);
  assert.equal(yellow.b, 0);

  const mid = annotate.parseHexColor('#808080');
  assert.ok(Math.abs(mid.r - mid.g) < 1e-6);
  assert.ok(Math.abs(mid.g - mid.b) < 1e-6);

  const fallback = annotate.parseHexColor('nonsense');
  assert.ok(fallback && typeof fallback.r === 'number');
});

test('parseDataUrl accepts png/jpg and rejects garbage', () => {
  const png = annotate.parseDataUrl('data:image/png;base64,iVBORw0KGgo=');
  assert.equal(png.mime, 'image/png');
  assert.ok(Buffer.isBuffer(png.bytes));
  assert.equal(annotate.parseDataUrl('http://example.com/a.png'), null);
  assert.equal(annotate.parseDataUrl(''), null);
});

test('normalizePageEntry clamps coordinates and drops empty rects', () => {
  const entry = annotate.normalizePageEntry({
    page: '2',
    layoutWidth: 800,
    layoutHeight: 1000,
    highlights: [
      { color: '#fef08a', rects: [{ x: -0.5, y: 0.1, w: 0.4, h: 0.02 }] },
      { color: '#fef08a', rects: [{ x: 0.1, y: 0.1, w: 0, h: 0 }] }
    ],
    notes: [
      { x: 10, y: 20, w: 50, text: '  hello  ' },
      { x: 0, y: 0, w: 100, text: '' }
    ]
  });
  assert.equal(entry.page, 2);
  assert.equal(entry.highlights.length, 1);
  assert.equal(entry.highlights[0].rects[0].x, 0);
  assert.equal(entry.notes.length, 1);
  assert.equal(entry.notes[0].w, 70); // min clamp
  assert.equal(entry.notes[0].text, 'hello');
});

test('normalizeAnnotationPayload discards pages with nothing to draw', () => {
  const norm = annotate.normalizeAnnotationPayload({
    title: 'X',
    pages: [
      { page: 1, highlights: [], notes: [], drawingDataUrl: '' },
      { page: 2, highlights: [{ color: '#fef08a', rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.02 }] }] }
    ]
  });
  assert.equal(norm.title, 'X');
  assert.equal(norm.pages.length, 1);
  assert.equal(norm.pages[0].page, 2);
});

test('wrapTextToLines wraps using font metrics', () => {
  // Shim a font-like object with a simple width function to exercise the
  // wrapper without loading pdf-lib.
  const fakeFont = {
    widthOfTextAtSize(text, size){ return String(text || '').length * size * 0.5; }
  };
  const lines = annotate.wrapTextToLines(fakeFont, 'one two three four five', 40, 10);
  // maxWidth 40 / size 10 → ~8 chars per line
  assert.ok(lines.length >= 2);
  lines.forEach(function(line){
    assert.ok(line.length * 10 * 0.5 <= 40 + 0.001 || /\S{9,}/.test(line));
  });
});

test('flattenAnnotationsIntoPdf mutates a real PDF end-to-end', async () => {
  const { PDFDocument } = require('pdf-lib');
  const src = await PDFDocument.create();
  const p1 = src.addPage([600, 800]);
  p1.drawText('Hello world', { x: 50, y: 750, size: 18 });
  const srcBytes = await src.save();

  const out = await annotate.flattenAnnotationsIntoPdf({
    pdfBytes: srcBytes,
    payload: {
      title: 'Annotated',
      pages: [{
        page: 1,
        layoutWidth: 600,
        layoutHeight: 800,
        highlights: [{ color: '#fef08a', rects: [{ x: 0.1, y: 0.1, w: 0.3, h: 0.02 }] }],
        notes: [{ x: 100, y: 200, w: 150, text: 'Review this paragraph.' }]
      }]
    }
  });

  assert.ok(out && out.length > srcBytes.length - 100);
  const reloaded = await PDFDocument.load(out);
  assert.equal(reloaded.getPageCount(), 1);
  // Title roundtrips.
  assert.equal(reloaded.getTitle(), 'Annotated');
});

test('flattenAnnotationsIntoPdf is a no-op when every page is empty', async () => {
  const { PDFDocument } = require('pdf-lib');
  const src = await PDFDocument.create();
  src.addPage([400, 500]);
  const srcBytes = await src.save();
  const out = await annotate.flattenAnnotationsIntoPdf({
    pdfBytes: srcBytes,
    payload: { pages: [{ page: 1, highlights: [], notes: [] }] }
  });
  const reloaded = await PDFDocument.load(out);
  assert.equal(reloaded.getPageCount(), 1);
});

test('flattenAnnotationsIntoPdf rejects empty input', async () => {
  await assert.rejects(
    () => annotate.flattenAnnotationsIntoPdf({ pdfBytes: Buffer.alloc(0), payload: {} }),
    /required/i
  );
});
