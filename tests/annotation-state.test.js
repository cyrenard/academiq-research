const test = require('node:test');
const assert = require('node:assert/strict');

const annotationState = require('../src/annotation-state.js');

test('createAnnotation fills default size and normalizes numbers', function(){
  const annot = annotationState.createAnnotation({ page:'2', x:'10', y:'20', text:'abc' });
  assert.deepEqual(annot, { page:2, x:10, y:20, w:140, h:30, text:'abc' });
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
