const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..', '..');

test('React command palette exposes PDF viewer controls', () => {
  const app = fs.readFileSync(path.join(rootDir, 'src/renderer/App.tsx'), 'utf8');
  assert.match(app, /runPdfViewerCommand/);
  [
    'togglePdfSearch',
    'toggleThumbs',
    'toggleOutline',
    'togglePdfAnnotations',
    'togglePdfRelated',
    'togglePdfFullscreen',
    'runPdfOcrExtractionNow'
  ].forEach((fn) => assert.match(app, new RegExp(fn)));
  assert.match(app, /id: 'pdf-search'/);
  assert.match(app, /id: 'pdf-ocr'/);
});

test('PDF panel still contains the direct legacy controls', () => {
  const host = fs.readFileSync(path.join(rootDir, 'src/renderer/components/shell/LegacyCompatibilityHost.tsx'), 'utf8');
  [
    'pdfSearchToggleBtn',
    'pdfThumbsToggleBtn',
    'pdfOutlineToggleBtn',
    'pdfAnnotsToggleBtn',
    'pdfRelatedToggleBtn',
    'pdffullbtn',
    'pdfRegionBtn'
  ].forEach((id) => assert.match(host, new RegExp(id)));
});
