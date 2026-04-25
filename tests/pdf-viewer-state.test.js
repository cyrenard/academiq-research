const test = require('node:test');
const assert = require('node:assert/strict');

const pdfViewerState = require('../src/pdf-viewer-state.js');

test('clampPage keeps navigation inside PDF bounds', function(){
  assert.equal(pdfViewerState.clampPage(-4, 12), 1);
  assert.equal(pdfViewerState.clampPage(99, 12), 12);
  assert.equal(pdfViewerState.clampPage(5, 12), 5);
  assert.equal(pdfViewerState.clampPage(1, 0), 0);
});

test('getPageProgress returns a stable page-based percentage', function(){
  assert.equal(pdfViewerState.getPageProgress(1, 10), 10);
  assert.equal(pdfViewerState.getPageProgress(5, 10), 50);
  assert.equal(pdfViewerState.getPageProgress(99, 10), 100);
  assert.equal(pdfViewerState.getPageProgress(1, 0), 0);
});

test('getZoomLabel distinguishes fixed and fit zoom modes', function(){
  assert.equal(pdfViewerState.getZoomLabel(1.25, 0.8), '125%');
  assert.equal(pdfViewerState.getZoomLabel(0, 0.82), 'Fit 82%');
});

test('getNextZoom clamps user zoom changes', function(){
  assert.equal(pdfViewerState.getNextZoom(0, 0.15, { autoScale: 0.8 }), 0.95);
  assert.equal(pdfViewerState.getNextZoom(3.95, 0.15), 4);
  assert.equal(pdfViewerState.getNextZoom(0.32, -0.15), 0.3);
});

test('buildReaderStats creates compact reader labels', function(){
  const stats = pdfViewerState.buildReaderStats({
    page: 3,
    total: 8,
    highlightCount: 2,
    annotationCount: 1
  });
  assert.equal(stats.pageLabel, '3 / 8');
  assert.equal(stats.progress, 38);
  assert.match(stats.activityLabel, /2 highlight/);
  assert.match(stats.activityLabel, /1 not/);
});

test('buildReaderStats appends OCR activity labels when available', function(){
  const stats = pdfViewerState.buildReaderStats({
    page: 1,
    total: 2,
    highlightCount: 0,
    annotationCount: 0,
    ocrLabel: 'OCR tarama: sf 1/3'
  });
  assert.match(stats.activityLabel, /OCR tarama: sf 1\/3/);
});

test('buildPdfOcrProbeState reports scan progress and OCR need', function(){
  const scanning = pdfViewerState.buildPdfOcrProbeState({
    totalPages: 12,
    samplePages: 3,
    scannedPages: 1,
    pagesWithText: 0
  });
  assert.equal(scanning.status, 'scanning');
  assert.equal(scanning.needsOCR, false);
  assert.match(scanning.label, /OCR tarama/);

  const needed = pdfViewerState.buildPdfOcrProbeState({
    totalPages: 12,
    samplePages: 3,
    scannedPages: 3,
    pagesWithText: 0
  });
  assert.equal(needed.status, 'needed');
  assert.equal(needed.needsOCR, true);
  assert.match(needed.label, /OCR gerekli/);

  const ready = pdfViewerState.buildPdfOcrProbeState({
    totalPages: 12,
    samplePages: 3,
    scannedPages: 3,
    pagesWithText: 2
  });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.needsOCR, false);
});

test('buildPdfOcrProbeState reports OCR extraction progress and applied fallback pages', function(){
  const queued = pdfViewerState.buildPdfOcrProbeState({
    totalPages: 8,
    samplePages: 3,
    scannedPages: 3,
    pagesWithText: 0,
    ocrAutoQueued: true
  });
  assert.equal(queued.status, 'scanning');
  assert.match(queued.label, /hazirlaniyor/i);

  const running = pdfViewerState.buildPdfOcrProbeState({
    totalPages: 8,
    samplePages: 3,
    scannedPages: 3,
    pagesWithText: 0,
    ocrRunning: true,
    ocrTargetPages: 4,
    ocrProcessedPages: 2
  });
  assert.equal(running.status, 'ocr_running');
  assert.match(running.label, /2\/4/);

  const applied = pdfViewerState.buildPdfOcrProbeState({
    totalPages: 8,
    samplePages: 3,
    scannedPages: 3,
    pagesWithText: 0,
    ocrAppliedPages: 3,
    ocrFailedPages: 1
  });
  assert.equal(applied.status, 'ocr_applied');
  assert.match(applied.label, /OCR metni aktif: 3 sf/);
  assert.match(applied.label, /1 hata/);
});

test('buildPdfOcrProbeState reports cancelled OCR runs and skipped pages', function(){
  const cancelled = pdfViewerState.buildPdfOcrProbeState({
    totalPages: 8,
    samplePages: 3,
    scannedPages: 3,
    pagesWithText: 0,
    ocrCancelled: true,
    ocrTargetPages: 6,
    ocrProcessedPages: 2
  });
  assert.equal(cancelled.status, 'cancelled');
  assert.match(cancelled.label, /2\/6/);

  const runningWithSkips = pdfViewerState.buildPdfOcrProbeState({
    totalPages: 8,
    samplePages: 3,
    scannedPages: 3,
    pagesWithText: 0,
    ocrRunning: true,
    ocrTargetPages: 5,
    ocrProcessedPages: 2,
    ocrSkippedPages: 1
  });
  assert.equal(runningWithSkips.status, 'ocr_running');
  assert.match(runningWithSkips.label, /1 atlandi/);
});

test('normalizePdfRegionSelection clamps and maps crop coordinates', function(){
  const region = pdfViewerState.normalizePdfRegionSelection({
    page: '2',
    pageWidth: 500,
    pageHeight: 1000,
    renderWidth: 1000,
    renderHeight: 2000,
    startX: 450,
    startY: 900,
    endX: 100,
    endY: 100,
    minWidth: 20,
    minHeight: 20
  });

  assert.equal(region.page, 2);
  assert.equal(region.left, 100);
  assert.equal(region.top, 100);
  assert.equal(region.width, 350);
  assert.equal(region.height, 800);
  assert.deepEqual(region.normalized, { x: 0.2, y: 0.1, w: 0.7, h: 0.8 });
  assert.equal(region.cropX, 200);
  assert.equal(region.cropY, 200);
  assert.equal(region.cropW, 700);
  assert.equal(region.cropH, 1600);
  assert.equal(region.valid, true);
});

test('buildPdfRegionFigureHTML rejects non-image data and emits figure markup', function(){
  assert.equal(pdfViewerState.buildPdfRegionFigureHTML({ dataUrl: 'javascript:bad' }), '');

  const html = pdfViewerState.buildPdfRegionFigureHTML({
    dataUrl: 'data:image/png;base64,AAA=',
    page: 4,
    title: 'Bandura study'
  });
  assert.match(html, /<figure class="pdf-capture(?:\s|")/);
  assert.match(html, /PDF bolgesi(?:\s+\w+)? s\.4/);
  assert.match(html, /Bandura study \(s\.4\)/);
});

test('buildPdfRegionCaptureHTML supports table mode and caption override', function(){
  const fallbackFigure = pdfViewerState.buildPdfRegionCaptureHTML({
    dataUrl: 'data:image/png;base64,AAA=',
    page: 2,
    title: 'Fallback',
    kind: 'unknown'
  });
  assert.match(fallbackFigure, /pdf-capture--figure/);
  assert.match(fallbackFigure, /Sekil\. Fallback \(s\.2\)/);

  const tableHtml = pdfViewerState.buildPdfRegionCaptureHTML({
    dataUrl: 'data:image/png;base64,AAA=',
    page: 7,
    title: 'Model summary',
    kind: 'table',
    caption: 'Tablo 1. Ozet sonuclar'
  });
  assert.match(tableHtml, /pdf-capture--table/);
  assert.match(tableHtml, /PDF bolgesi tablo s\.7/);
  assert.match(tableHtml, /Tablo 1\. Ozet sonuclar/);
});

test('buildPdfRegionNoteText emits compact note text for captures', function(){
  const fallback = pdfViewerState.buildPdfRegionNoteText({
    page: 3,
    title: 'Bandura',
    kind: 'figure'
  });
  assert.match(fallback, /\[PDF sekil yakalamasi\]/);
  assert.match(fallback, /Sekil\. Bandura \(s\.3\)/);

  const custom = pdfViewerState.buildPdfRegionNoteText({
    page: 8,
    title: 'Ignored',
    kind: 'table',
    caption: 'Tablo 2. Sonuclar'
  });
  assert.match(custom, /\[PDF tablo yakalamasi\]/);
  assert.match(custom, /Tablo 2\. Sonuclar/);
});

test('buildPdfCompareCandidates lists non-active tabs in stable order', function(){
  const candidates = pdfViewerState.buildPdfCompareCandidates({
    activeTabId: 'tab-2',
    workspaceId: 'ws-1',
    tabs: [
      { id: 'tab-2', title: 'Current', wsId: 'ws-1' },
      { id: 'tab-1', title: 'Bandura 1989', wsId: 'ws-1' },
      { id: 'tab-3', title: 'Zotero Export', wsId: 'ws-1' },
      { id: 'tab-4', title: 'Other ws', wsId: 'ws-2' }
    ]
  });

  assert.deepEqual(candidates.map((item) => item.id), ['tab-1', 'tab-3']);
  assert.equal(candidates[0].label, '1. Bandura 1989');
  assert.equal(candidates[1].label, '2. Zotero Export');
});

test('resolvePdfCompareSelection accepts id, index and exact title', function(){
  const candidates = [
    { id: 'tab-a', index: 1, title: 'Alpha' },
    { id: 'tab-b', index: 2, title: 'Beta' }
  ];

  assert.equal(pdfViewerState.resolvePdfCompareSelection({ candidates, selection: 'tab-b' }), 'tab-b');
  assert.equal(pdfViewerState.resolvePdfCompareSelection({ candidates, selection: '2' }), 'tab-b');
  assert.equal(pdfViewerState.resolvePdfCompareSelection({ candidates, selection: 'alpha' }), 'tab-a');
  assert.equal(pdfViewerState.resolvePdfCompareSelection({ candidates, selection: 'missing' }), '');
});

test('buildPdfCompareStatus summarizes compare mode state', function(){
  assert.equal(pdfViewerState.buildPdfCompareStatus({ enabled: false }), 'Karsilastirma kapali');
  assert.equal(
    pdfViewerState.buildPdfCompareStatus({ enabled: true, leftTitle: 'A', rightTitle: 'B', syncScroll: true }),
    'Karsilastirma: A <> B (scroll senkron)'
  );
});

test('normalizeScrollRatio and scrollTopFromRatio map compare scroll safely', function(){
  assert.equal(pdfViewerState.normalizeScrollRatio({ scrollTop: 0, scrollHeight: 1000, clientHeight: 500 }), 0);
  assert.equal(pdfViewerState.normalizeScrollRatio({ scrollTop: 250, scrollHeight: 1000, clientHeight: 500 }), 0.5);
  assert.equal(pdfViewerState.normalizeScrollRatio({ scrollTop: 9999, scrollHeight: 1000, clientHeight: 500 }), 1);
  assert.equal(pdfViewerState.normalizeScrollRatio({ scrollTop: 10, scrollHeight: 100, clientHeight: 120 }), 0);

  assert.equal(pdfViewerState.scrollTopFromRatio({ ratio: 0, scrollHeight: 1000, clientHeight: 500 }), 0);
  assert.equal(pdfViewerState.scrollTopFromRatio({ ratio: 0.5, scrollHeight: 1000, clientHeight: 500 }), 250);
  assert.equal(pdfViewerState.scrollTopFromRatio({ ratio: 2, scrollHeight: 1000, clientHeight: 500 }), 500);
  assert.equal(pdfViewerState.scrollTopFromRatio({ ratio: 0.5, scrollHeight: 100, clientHeight: 120 }), 0);
});
