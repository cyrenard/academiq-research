'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const utils = require('../src/main-process-capture-reference-utils.js');

test('normalizeCaptureReferenceType returns one of article/book/website', () => {
  assert.equal(utils.normalizeCaptureReferenceType('Book'), 'book');
  assert.equal(utils.normalizeCaptureReferenceType('  WEBSITE '), 'website');
  assert.equal(utils.normalizeCaptureReferenceType('article'), 'article');
  assert.equal(utils.normalizeCaptureReferenceType('thesis'), 'article');
  assert.equal(utils.normalizeCaptureReferenceType(''), 'article');
  assert.equal(utils.normalizeCaptureReferenceType(null), 'article');
});

test('normalizeCaptureReference trims whitespace and pulls year from publishedDate', () => {
  const r = utils.normalizeCaptureReference({
    title: '  Hello   World  ',
    year: '',
    publishedDate: '2021-05-13',
    doi: 'https://doi.org/10.1234/abc',
    authors: ['  Alice  ', ' Bob ', ''],
    labels: [' x ', '', 'y']
  });
  assert.equal(r.title, 'Hello World');
  assert.equal(r.year, '2021');
  assert.equal(r.doi, '10.1234/abc');
  assert.deepEqual(r.authors, ['Alice', 'Bob']);
  assert.deepEqual(r.labels, ['x', 'y']);
  assert.equal(r.referenceType, 'article');
});

test('mergeCaptureReferenceFields only fills missing target fields', () => {
  const target = { title: 'Existing', authors: ['A'] };
  const source = { title: 'NEW', year: '2020', authors: ['B'], journal: 'Nature' };
  utils.mergeCaptureReferenceFields(target, source);
  assert.equal(target.title, 'Existing', 'existing title preserved');
  assert.equal(target.year, '2020', 'missing year filled from source');
  assert.deepEqual(target.authors, ['A'], 'existing authors preserved');
  assert.equal(target.journal, 'Nature');
});

test('mergeCaptureReferenceFields preserves non-article referenceType from source', () => {
  const target = { title: 'X', referenceType: 'article' };
  utils.mergeCaptureReferenceFields(target, { title: 'X', referenceType: 'book' });
  assert.equal(target.referenceType, 'book');
});

test('mergeCaptureReferenceFields unions labels from both', () => {
  const target = { title: 'X', labels: ['a', 'b'] };
  utils.mergeCaptureReferenceFields(target, { title: 'X', labels: ['b', 'c'] });
  assert.deepEqual(target.labels.sort(), ['a', 'b', 'c']);
});

test('resolveCaptureTargetWorkspace honors selected, then current, then preferred, then first', () => {
  const wss = [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }];

  const selected = utils.resolveCaptureTargetWorkspace({ wss, cur: 'w2' }, { selectedWorkspaceId: 'w3' }, {});
  assert.equal(selected.workspaceId, 'w3');
  assert.equal(selected.reason, 'selected');
  assert.equal(selected.fallback, false);

  const fallbackToActive = utils.resolveCaptureTargetWorkspace({ wss, cur: 'w2' }, { selectedWorkspaceId: 'wmiss' }, {});
  assert.equal(fallbackToActive.workspaceId, 'w2');
  assert.equal(fallbackToActive.reason, 'selected_missing_to_active');
  assert.equal(fallbackToActive.fallback, true);

  const fallbackToPreferred = utils.resolveCaptureTargetWorkspace({ wss, cur: 'wgone' }, { selectedWorkspaceId: 'wmiss' }, { lastUsedWorkspaceId: 'w3' });
  assert.equal(fallbackToPreferred.workspaceId, 'w3');
  assert.equal(fallbackToPreferred.reason, 'selected_missing_to_preferred');

  const fallbackToFirst = utils.resolveCaptureTargetWorkspace({ wss, cur: '' }, {}, {});
  assert.equal(fallbackToFirst.workspaceId, 'w1');
  assert.equal(fallbackToFirst.reason, 'first');

  const empty = utils.resolveCaptureTargetWorkspace({ wss: [] }, {}, {});
  assert.equal(empty.workspaceId, '');
  assert.equal(empty.workspace, null);
});

test('attachPdfUrlFromCapture returns url_stored when no pdfData yet', () => {
  const ref = { id: 'r1' };
  const res = utils.attachPdfUrlFromCapture(ref, { pdfUrl: 'https://example.com/a.pdf' }, {});
  assert.equal(res.status, 'url_stored');
  assert.equal(ref.pdfUrl, 'https://example.com/a.pdf');
  assert.equal(ref.browserCaptureMeta.pdfCaptureStatus, 'url_stored');
});

test('attachPdfUrlFromCapture respects autoAttachPdfUrl=false (detected_only)', () => {
  const ref = { id: 'r1' };
  const res = utils.attachPdfUrlFromCapture(ref, { pdfUrl: 'https://example.com/a.pdf' }, { autoAttachPdfUrl: false });
  assert.equal(res.status, 'detected_only');
  assert.equal(ref.pdfUrl, undefined);
  assert.equal(ref.browserCaptureMeta.detectedPdfUrl, 'https://example.com/a.pdf');
});

test('attachPdfUrlFromCapture leaves existing pdfUrl alone when different', () => {
  const ref = { id: 'r1', pdfUrl: 'https://old.example.com/old.pdf' };
  const res = utils.attachPdfUrlFromCapture(ref, { pdfUrl: 'https://new.example.com/new.pdf' }, {});
  assert.equal(res.status, 'already_present');
  assert.equal(ref.pdfUrl, 'https://old.example.com/old.pdf');
});

test('attachPdfUrlFromCapture returns not_detected when no pdfUrl in payload', () => {
  const res = utils.attachPdfUrlFromCapture({ id: 'r1' }, { pdfUrl: '' }, {});
  assert.equal(res.status, 'not_detected');
  assert.equal(res.detected, false);
});

test('buildCaptureQueueStats classifies queue entries', () => {
  const now = Date.now();
  const stats = utils.buildCaptureQueueStats([
    { status: 'queued' },
    { status: 'queued', nextRetryAt: now + 10000 },
    { status: 'failed' },
    { status: 'imported' },
    { status: 'duplicate_attached' }
  ]);
  assert.deepEqual(stats, { queued: 1, waitingRetry: 1, failed: 1, imported: 1, duplicateAttached: 1 });
});

test('buildCaptureQueueActivity sorts by recency and caps at 6 entries', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({
    id: `item-${i}`,
    status: 'queued',
    updatedAt: i * 1000,
    payload: { detectedTitle: `T${i}` }
  }));
  const activity = utils.buildCaptureQueueActivity(items);
  assert.equal(activity.length, 6);
  assert.equal(activity[0].id, 'item-9', 'most recent first');
  assert.equal(activity[5].id, 'item-4');
});

test('buildCaptureQueueActivity labels workspace-create rows', () => {
  const activity = utils.buildCaptureQueueActivity([
    { id: 'w', status: 'queued', type: 'workspace_create', name: 'Yeni Tez', updatedAt: 100 }
  ]);
  assert.equal(activity[0].type, 'workspace_create');
  assert.equal(activity[0].title, 'Yeni Tez');
});

test('findEquivalentReferenceAcrossState skips excluded workspace and uses AQWebRelatedPapers.findMatchInList', () => {
  const candidate = { title: 'X', doi: '10.1/2' };
  const calls = [];
  const fakeWRP = {
    findMatchInList(cand, lib) {
      calls.push({ count: lib.length });
      return lib[0] || null;
    }
  };
  const state = {
    wss: [
      { id: 'excluded', lib: [{ id: 'e1' }] },
      { id: 'other', lib: [{ id: 'o1' }] }
    ]
  };
  const res = utils.findEquivalentReferenceAcrossState(state, candidate, 'excluded', { AQWebRelatedPapers: fakeWRP });
  assert.equal(res && res.workspaceId, 'other');
  assert.equal(res && res.ref && res.ref.id, 'o1');
  assert.equal(calls.length, 1, 'excluded workspace was skipped');
});

test('findEquivalentReferenceAcrossState returns null when AQWebRelatedPapers missing', () => {
  const res = utils.findEquivalentReferenceAcrossState({ wss: [{ id: 'a', lib: [{}] }] }, {}, '', {});
  assert.equal(res, null);
});

test('attachCaptureToComparison requires literature-matrix comparisonId', () => {
  const res = utils.attachCaptureToComparison({}, 'w', {}, 'unknown', {});
  assert.deepEqual(res, { requested: true, applied: false, comparisonId: '' });
  const noopReq = utils.attachCaptureToComparison({}, 'w', {}, '', {});
  assert.deepEqual(noopReq, { requested: false, applied: false, comparisonId: '' });
});

test('attachCaptureToComparison calls AQLiteratureMatrixState.ensureRowForReference', () => {
  let captured = null;
  const fake = {
    ensureRowForReference(state, wsId, ref, opts) {
      captured = { state, wsId, ref, opts };
      return { row: { id: 'mxr-1' }, created: true };
    }
  };
  const res = utils.attachCaptureToComparison({ s: 1 }, 'w1', { id: 'r1' }, 'literature-matrix', {
    createId: () => 'mxr-X',
    AQLiteratureMatrixState: fake
  });
  assert.equal(res.applied, true);
  assert.equal(res.created, true);
  assert.equal(res.comparisonId, 'literature-matrix');
  assert.equal(captured.wsId, 'w1');
  assert.equal(typeof captured.opts.uid, 'function');
  assert.equal(captured.opts.uid(), 'mxr-X');
});

test('attachCaptureToComparison returns applied=false when ensureRowForReference throws', () => {
  const res = utils.attachCaptureToComparison({}, 'w', { id: 'r' }, 'literature-matrix', {
    createId: () => 'x',
    AQLiteratureMatrixState: { ensureRowForReference() { throw new Error('boom'); } }
  });
  assert.equal(res.applied, false);
  assert.equal(res.requested, true);
});

test('buildBrowserCaptureImportMessage describes mode and pdf handling', () => {
  const msg = utils.buildBrowserCaptureImportMessage({
    ok: true,
    mode: 'attached_existing_library',
    workspace: { name: 'Tez' },
    comparison: { applied: true, created: true },
    pdfHandling: { status: 'url_stored' },
    target: { fallback: true }
  });
  assert.match(msg, /kutuphanede/);
  assert.match(msg, /"Tez"/);
  assert.match(msg, /Matrisi satiri olusturuldu/);
  assert.match(msg, /URL olarak kaydedildi/);
  assert.match(msg, /guvenli hedef/);
});

test('buildBrowserCaptureImportMessage returns error string for failures', () => {
  const msg = utils.buildBrowserCaptureImportMessage({ ok: false, error: 'Network down' });
  assert.equal(msg, 'Network down');
});

test('cloneReferenceForWorkspace mints new id and resets collectionIds', () => {
  const existing = { id: 'old', title: 'X', collectionIds: ['c1', 'c2'], wsId: 'wA' };
  let counter = 0;
  const clone = utils.cloneReferenceForWorkspace(existing, { authors: ['Smith'] }, 'wB', {
    createId: () => `ref_${++counter}`
  });
  assert.equal(clone.id, 'ref_1');
  assert.notEqual(clone.id, 'old');
  assert.equal(clone.wsId, 'wB');
  assert.deepEqual(clone.collectionIds, []);
  assert.deepEqual(clone.authors, ['Smith']);
});

test('cloneReferenceForWorkspace throws without createId dep', () => {
  assert.throws(() => utils.cloneReferenceForWorkspace({}, {}, 'w', {}));
});

test('buildBrowserCaptureReference throws without required deps', () => {
  assert.throws(() => utils.buildBrowserCaptureReference({}, 'w', {}));
  assert.throws(() => utils.buildBrowserCaptureReference({}, 'w', { createId: () => 'x' }));
});

test('applyBrowserCaptureMetaToReference initializes browserCaptureMeta safely', () => {
  const ref = {};
  utils.applyBrowserCaptureMetaToReference(ref, {
    sourcePageUrl: 'https://x.com',
    browserSource: 'Chrome',
    timestamp: 12345,
    pdfUrl: 'https://x.com/a.pdf',
    detectionMeta: { hint: 'doi_url' }
  });
  assert.equal(ref.browserCaptureMeta.sourcePageUrl, 'https://x.com');
  assert.equal(ref.browserCaptureMeta.browserSource, 'Chrome');
  assert.equal(ref.browserCaptureMeta.capturedAt, 12345);
  assert.equal(ref.browserCaptureMeta.detectedPdfUrl, 'https://x.com/a.pdf');
  assert.deepEqual(ref.browserCaptureMeta.detectionMeta, { hint: 'doi_url' });
});

test('applyBrowserCaptureMetaToReference preserves existing fields when payload empty', () => {
  const ref = { browserCaptureMeta: { sourcePageUrl: 'existing' } };
  utils.applyBrowserCaptureMetaToReference(ref, {});
  assert.equal(ref.browserCaptureMeta.sourcePageUrl, 'existing');
});
