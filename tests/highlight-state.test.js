const test = require('node:test');
const assert = require('node:assert/strict');

const highlightState = require('../src/highlight-state.js');

test('loadHighlights clones persisted highlight data', function(){
  const ref = {
    _hlData: [{ page:1, color:'#fef08a', rects:[{ x:0.1, y:0.2, w:0.3, h:0.4 }], text:'quote' }]
  };
  const loaded = highlightState.loadHighlights(ref);

  assert.deepEqual(loaded, ref._hlData);
  assert.notEqual(loaded, ref._hlData);
  assert.notEqual(loaded[0].rects, ref._hlData[0].rects);
});

test('persistHighlights stores cloned highlights on reference', function(){
  const ref = {};
  const list = [{ page:2, color:'#abc', rects:[{ x:1, y:2, w:3, h:4 }], text:'x' }];
  const stored = highlightState.persistHighlights(ref, list);

  assert.deepEqual(stored, list);
  assert.deepEqual(ref._hlData, list);
  assert.notEqual(ref._hlData, list);
});

test('addHighlight appends a new normalized highlight', function(){
  const next = highlightState.addHighlight([], {
    page: 3,
    color: '#123',
    rects: [{ x:0, y:0, w:1, h:1 }],
    text: 'sel'
  });

  assert.equal(next.length, 1);
  assert.deepEqual(next[0], {
    page: 3,
    color: '#123',
    rects: [{ x:0, y:0, w:1, h:1 }],
    text: 'sel'
  });
});

test('removeHighlightAt removes target item and returns removed highlight', function(){
  const next = highlightState.removeHighlightAt([
    { page:1, color:'#1', rects:[], text:'a' },
    { page:2, color:'#2', rects:[], text:'b' }
  ], 1);

  assert.equal(next.highlights.length, 1);
  assert.equal(next.highlights[0].page, 1);
  assert.equal(next.removed.page, 2);
});
