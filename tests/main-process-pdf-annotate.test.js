'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const annotate = require('../src/main-process-pdf-annotate.js');

function tinyPdf(pageCount = 1){
  const kids = [];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    null
  ];
  for(let i = 0; i < pageCount; i += 1){
    const pageId = objects.length + 1;
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] >>');
    kids.push(pageId + ' 0 R');
  }
  objects[1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pageCount + ' >>';
  let out = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach(function(body, idx){
    offsets[idx + 1] = Buffer.byteLength(out, 'latin1');
    out += (idx + 1) + ' 0 obj\n' + body + '\nendobj\n';
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  offsets.slice(1).forEach(function(offset){
    out += String(offset).padStart(10, '0') + ' 00000 n \n';
  });
  out += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}

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
  // Shim a font-like object with a simple width function to exercise the wrapper.
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

test('flattenAnnotationsIntoPdf preserves legacy PDF bytes with Rust-pipeline marker', async () => {
  const srcBytes = tinyPdf(1);

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
  assert.match(Buffer.from(out).toString('utf8'), /annotations moved to Rust pipeline: Annotated/);
});

test('flattenAnnotationsIntoPdf is a no-op when every page is empty', async () => {
  const srcBytes = tinyPdf(1);
  const out = await annotate.flattenAnnotationsIntoPdf({
    pdfBytes: srcBytes,
    payload: { pages: [{ page: 1, highlights: [], notes: [] }] }
  });
  assert.deepEqual(Buffer.from(out), srcBytes);
});

test('flattenAnnotationsIntoPdf rejects empty input', async () => {
  await assert.rejects(
    () => annotate.flattenAnnotationsIntoPdf({ pdfBytes: Buffer.alloc(0), payload: {} }),
    /required/i
  );
});
