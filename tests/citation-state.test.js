const test = require('node:test');
const assert = require('node:assert/strict');

const citationState = require('../src/citation-state.js');
const citationStyles = require('../src/citation-styles.js');

function sortRefs(refs){
  return refs.slice().sort(function(a, b){
    return String(a.id || '').localeCompare(String(b.id || ''), 'tr');
  });
}

function dedupeRefs(refs){
  const seen = new Set();
  return refs.filter(function(ref){
    const key = String(ref && ref.id || '');
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const deps = {
  sortReferences: sortRefs,
  dedupeReferences: dedupeRefs
};

test('getInlineCitationText formats single and multi author names', function(){
  assert.equal(
    citationState.getInlineCitationText({ authors:['Doe, Jane'], year:'2024' }, deps),
    '(Doe, 2024)'
  );
  assert.equal(
    citationState.getInlineCitationText({ authors:['Doe, Jane', 'Smith, John'], year:'2024' }, deps),
    '(Doe & Smith, 2024)'
  );
  assert.equal(
    citationState.getInlineCitationText({ authors:['Doe, Jane', 'Smith, John', 'Ng, Ada'], year:'2024' }, deps),
    '(Doe vd., 2024)'
  );
});

test('buildCitationHTML dedupes and renders multi-citation spans', function(){
  const html = citationState.buildCitationHTML([
    { id:'b', authors:['Smith, John'], year:'2022' },
    { id:'a', authors:['Doe, Jane'], year:'2024' },
    { id:'a', authors:['Doe, Jane'], year:'2024' }
  ], deps);

  assert.match(html, /data-ref="a,b"/);
  assert.match(html, /\(Doe, 2024; Smith, 2022\)/);
  assert.doesNotMatch(html, /cit-gap/);
  assert.ok(html.endsWith('</span> '));
});

test('visibleCitationText mirrors inline text rules', function(){
  assert.equal(
    citationState.visibleCitationText([{ id:'a', authors:['Doe, Jane'], year:'2024' }], deps),
    '(Doe, 2024)'
  );
  assert.equal(
    citationState.visibleCitationText([
      { id:'b', authors:['Smith, John'], year:'2022' },
      { id:'a', authors:['Doe, Jane'], year:'2024' }
    ], deps),
    '(Doe, 2024; Smith, 2022)'
  );
});

test('style adapter integration supports IEEE style output', function(){
  const html = citationState.buildCitationHTML([
    { id:'a', authors:['Doe, Jane'], year:'2024' },
    { id:'b', authors:['Smith, John'], year:'2022' }
  ], {
    sortReferences: sortRefs,
    dedupeReferences: dedupeRefs,
    citationStyles,
    styleId: 'ieee'
  });

  assert.match(html, /data-ref="a,b"/);
  assert.match(html, /\[1\], \[2\]/);
});
