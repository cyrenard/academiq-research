const test = require('node:test');
const assert = require('node:assert/strict');

const annotationState = require('../src/annotation-state.js');

test('createAnnotation fills default size and normalizes numbers', function(){
  const annot = annotationState.createAnnotation({ page:'2', x:'10', y:'20', text:'abc' });
  assert.equal(annot.page, 2);
  assert.equal(annot.x, 10);
  assert.equal(annot.y, 20);
  assert.equal(annot.w, 140);
  assert.equal(annot.h, 30);
  assert.equal(annot.text, 'abc');
  assert.match(annot.id, /^annot_/);
});

test('collectAnnotationsFromElements reads page, bounds and body text', function(){
  const elements = [{
    dataset: { page:'3' },
    style: { left:'12px', top:'18px' },
    offsetWidth: 200,
    offsetHeight: 80,
    querySelector(){ return { value:'note text' }; }
  }];

  const annots = annotationState.collectAnnotationsFromElements(elements);
  assert.deepEqual(annots, [{ page:3, x:12, y:18, w:200, h:80, text:'note text' }]);
});

test('persistTabAnnotations clones annotation list', function(){
  const tab = {};
  const list = [{ page:1, x:1, y:2, w:3, h:4, text:'x' }];
  const stored = annotationState.persistTabAnnotations(tab, list);

  assert.deepEqual(stored, list);
  assert.notEqual(tab.annots, list);
});

test('persistReferenceAnnotations clones annotation list', function(){
  const ref = {};
  const list = [{ page:1, x:1, y:2, w:3, h:4, text:'x' }];
  const stored = annotationState.persistReferenceAnnotations(ref, list);

  assert.deepEqual(stored, list);
  assert.notEqual(ref._annots, list);
});

test('buildAnnotationSummary keeps compact previews for annotation panels', function(){
  const summary = annotationState.buildAnnotationSummary({
    id: 'a1',
    page: '4',
    text: '  This is a long PDF note  '.repeat(8)
  });
  assert.equal(summary.id, 'a1');
  assert.equal(summary.page, 4);
  assert.equal(summary.empty, false);
  assert.ok(summary.preview.length <= 120);
});

test('filterAnnotationSummaries filters by kind and query', function(){
  const items = [
    { kind:'highlight', text:'metacognition quote' },
    { kind:'note', text:'AI adoption note' },
    { kind:'note', text:'other' }
  ];
  assert.equal(annotationState.filterAnnotationSummaries(items, { filter:'note' }).length, 2);
  assert.deepEqual(
    annotationState.filterAnnotationSummaries(items, { filter:'note', query:'adoption' }),
    [{ kind:'note', text:'AI adoption note' }]
  );
});

test('buildAnnotationReviewModel summarizes visible annotation state', function(){
  const model = annotationState.buildAnnotationReviewModel([
    { kind:'highlight', page:1, color:'#fff176', text:'metacognition quote' },
    { kind:'note', page:2, text:'AI adoption note' },
    { kind:'highlight', page:2, color:'#fff176', text:'confidence quote' },
    { kind:'note', page:3, text:'' }
  ], { filter:'highlight', query:'quote' });

  assert.equal(model.total, 3);
  assert.equal(model.visibleTotal, 2);
  assert.equal(model.highlightCount, 2);
  assert.equal(model.noteCount, 1);
  assert.equal(model.pageCount, 2);
  assert.equal(model.pageLabel, 's. 1-2');
  assert.equal(model.colorCounts['#fff176'], 2);
  assert.equal(model.pageGroups.length, 2);
});

test('buildAnnotationDigest groups PDF work notes by page', function(){
  const digest = annotationState.buildAnnotationDigest([
    { kind:'note', page:2, text:'  second page note  ' },
    { kind:'highlight', page:1, text:'important quote' },
    { kind:'highlight', page:2, text:'' }
  ], {
    title: 'Bandura PDF',
    citation: 'Bandura (1989)'
  });

  assert.equal(digest.count, 2);
  assert.equal(digest.highlightCount, 1);
  assert.equal(digest.noteCount, 1);
  assert.equal(digest.pageCount, 2);
  assert.equal(digest.pageGroups.length, 2);
  assert.match(digest.markdown, /# Bandura PDF/);
  assert.match(digest.markdown, /Toplam: 2 not\/highlight/);
  assert.match(digest.markdown, /## Sayfa 1/);
  assert.match(digest.html, /<section class="pdf-annotation-digest"/);
  assert.ok(digest.items[0].page <= digest.items[1].page);
});
