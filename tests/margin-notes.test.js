const test = require('node:test');
const assert = require('node:assert/strict');

// ── Pure logic extracted from margin-notes.js ─────────────────────────────────

function uid(){
  return 'mn' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function blockUid(){
  return 'mb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Minimal in-memory note store for testing CRUD
function makeStore(){
  var notes = {};

  function createNote(blockId, type){
    type = type || 'note';
    var id = uid();
    notes[id] = { id:id, blockId:blockId, type:type, text:'', createdAt:Date.now() };
    return id;
  }
  function updateNoteText(id, text){
    if(!notes[id]) return false;
    notes[id].text = text;
    return true;
  }
  function updateNoteType(id, type){
    if(!notes[id]) return false;
    notes[id].type = type;
    return true;
  }
  function deleteNote(id){
    if(!notes[id]) return false;
    delete notes[id];
    return true;
  }
  return { notes, createNote, updateNoteText, updateNoteType, deleteNote };
}

// hookGetHTML / hookSetHTML logic (pure, no DOM)
function buildStoreDiv(notes){
  try{
    var json = JSON.stringify(notes);
    return '<div class="aq-mn-store" style="display:none!important">' + encodeURIComponent(json) + '</div>';
  }catch(e){ return ''; }
}

function hookGetHTML(html, notes){
  var storeDiv = buildStoreDiv(notes);
  html = String(html || '').replace(/<div class="aq-mn-store"[^>]*>[\s\S]*?<\/div>/, '');
  return html + storeDiv;
}

function hookSetHTML(html){
  html = String(html || '');
  var storeRe = /<div class="aq-mn-store"[^>]*>([\s\S]*?)<\/div>/;
  var m = html.match(storeRe);
  var loaded = {};
  if(m){
    try{
      var data = JSON.parse(decodeURIComponent(m[1]));
      if(data && typeof data === 'object'){
        Object.keys(data).forEach(function(id){ loaded[id] = data[id]; });
      }
    }catch(ex){}
    html = html.replace(storeRe, '');
  }
  return { html:html, notes:loaded };
}

function stripForExport(html){
  html = String(html || '');
  html = html.replace(/<div class="aq-mn-store"[^>]*>[\s\S]*?<\/div>/g, '');
  html = html.replace(/\s*data-mn-block-id="[^"]*"/g, '');
  return html;
}

// ── CRUD tests ────────────────────────────────────────────────────────────────

test('createNote: creates note with given blockId and type', function(){
  var s = makeStore();
  var id = s.createNote('blk1', 'todo');
  assert.ok(id, 'id is truthy');
  assert.ok(s.notes[id], 'note exists in store');
  assert.equal(s.notes[id].blockId, 'blk1');
  assert.equal(s.notes[id].type, 'todo');
  assert.equal(s.notes[id].text, '');
});

test('createNote: defaults to type "note"', function(){
  var s = makeStore();
  var id = s.createNote('blk2');
  assert.equal(s.notes[id].type, 'note');
});

test('updateNoteText: updates text', function(){
  var s = makeStore();
  var id = s.createNote('blk1');
  var ok = s.updateNoteText(id, 'hello world');
  assert.equal(ok, true);
  assert.equal(s.notes[id].text, 'hello world');
});

test('updateNoteText: returns false for unknown id', function(){
  var s = makeStore();
  assert.equal(s.updateNoteText('nonexistent', 'x'), false);
});

test('updateNoteType: changes type', function(){
  var s = makeStore();
  var id = s.createNote('blk1', 'note');
  var ok = s.updateNoteType(id, 'argument');
  assert.equal(ok, true);
  assert.equal(s.notes[id].type, 'argument');
});

test('updateNoteType: returns false for unknown id', function(){
  var s = makeStore();
  assert.equal(s.updateNoteType('nonexistent', 'todo'), false);
});

test('deleteNote: removes note from store', function(){
  var s = makeStore();
  var id = s.createNote('blk1');
  assert.ok(s.notes[id]);
  var ok = s.deleteNote(id);
  assert.equal(ok, true);
  assert.equal(s.notes[id], undefined);
});

test('deleteNote: returns false for unknown id', function(){
  var s = makeStore();
  assert.equal(s.deleteNote('nonexistent'), false);
});

test('multiple notes on same block', function(){
  var s = makeStore();
  var id1 = s.createNote('blk1', 'note');
  var id2 = s.createNote('blk1', 'todo');
  assert.notEqual(id1, id2);
  var sameBlock = Object.values(s.notes).filter(function(n){ return n.blockId === 'blk1'; });
  assert.equal(sameBlock.length, 2);
});

// ── Persistence tests ─────────────────────────────────────────────────────────

test('hookGetHTML: appends store div to HTML', function(){
  var notes = { mn1: { id:'mn1', blockId:'blk1', type:'note', text:'test', createdAt:1 } };
  var result = hookGetHTML('<p>hello</p>', notes);
  assert.ok(result.includes('<p>hello</p>'));
  assert.ok(result.includes('aq-mn-store'));
  assert.ok(result.includes(encodeURIComponent(JSON.stringify(notes))));
});

test('hookGetHTML: replaces existing store div (no duplication)', function(){
  var notes1 = { mn1: { id:'mn1', blockId:'blk1', type:'note', text:'v1', createdAt:1 } };
  var notes2 = { mn2: { id:'mn2', blockId:'blk2', type:'todo', text:'v2', createdAt:2 } };
  var html1 = hookGetHTML('<p>x</p>', notes1);
  var html2 = hookGetHTML(html1, notes2);
  // Only one store div
  var count = (html2.match(/aq-mn-store/g) || []).length;
  assert.equal(count, 1);
  // Contains notes2 data
  assert.ok(html2.includes(encodeURIComponent(JSON.stringify(notes2))));
});

test('hookSetHTML: extracts notes and strips store div from HTML', function(){
  var notes = { mn1: { id:'mn1', blockId:'blk1', type:'outline', text:'outline text', createdAt:1 } };
  var html = hookGetHTML('<p>content</p>', notes);
  var result = hookSetHTML(html);
  assert.ok(!result.html.includes('aq-mn-store'));
  assert.ok(result.html.includes('<p>content</p>'));
  assert.deepEqual(result.notes, notes);
});

test('hookSetHTML: returns empty notes when no store div', function(){
  var result = hookSetHTML('<p>no notes here</p>');
  assert.deepEqual(result.notes, {});
  assert.equal(result.html, '<p>no notes here</p>');
});

test('hookSetHTML: handles malformed JSON gracefully', function(){
  var html = '<p>x</p><div class="aq-mn-store" style="display:none!important">INVALID_JSON</div>';
  var result = hookSetHTML(html);
  assert.deepEqual(result.notes, {});
});

// ── Export strip tests ────────────────────────────────────────────────────────

test('stripForExport: removes aq-mn-store div', function(){
  var notes = { mn1: { id:'mn1', blockId:'blk1', type:'note', text:'x', createdAt:1 } };
  var html = hookGetHTML('<p>text</p>', notes);
  var exported = stripForExport(html);
  assert.ok(!exported.includes('aq-mn-store'));
  assert.ok(exported.includes('<p>text</p>'));
});

test('stripForExport: removes data-mn-block-id attributes', function(){
  var html = '<p data-mn-block-id="mb123abc">paragraph</p><h1 data-mn-block-id="mb456def">heading</h1>';
  var exported = stripForExport(html);
  assert.ok(!exported.includes('data-mn-block-id'));
  assert.ok(exported.includes('<p>paragraph</p>'));
  assert.ok(exported.includes('<h1>heading</h1>'));
});

test('stripForExport: handles multiple store divs (e.g. double-save edge case)', function(){
  var store = '<div class="aq-mn-store" style="display:none!important">%7B%7D</div>';
  var html = '<p>a</p>' + store + store;
  var exported = stripForExport(html);
  assert.ok(!exported.includes('aq-mn-store'));
});

test('stripForExport: no-op on clean HTML', function(){
  var html = '<p>clean</p><h1>heading</h1>';
  assert.equal(stripForExport(html), html);
});

// ── Round-trip test ───────────────────────────────────────────────────────────

test('round-trip: save → load preserves all note fields', function(){
  var notes = {
    mn1: { id:'mn1', blockId:'mb111', type:'argument', text:'This is an argument', createdAt:1000 },
    mn2: { id:'mn2', blockId:'mb222', type:'source',   text:'Smith 2024',          createdAt:2000 }
  };
  var saved = hookGetHTML('<p>doc content</p>', notes);
  var loaded = hookSetHTML(saved);
  assert.deepEqual(loaded.notes, notes);
  assert.ok(loaded.html.includes('<p>doc content</p>'));
  assert.ok(!loaded.html.includes('aq-mn-store'));
});

test('round-trip: export strips all margin-note artifacts', function(){
  var notes = { mn1: { id:'mn1', blockId:'mb999', type:'todo', text:'finish this', createdAt:99 } };
  var saved = hookGetHTML('<p data-mn-block-id="mb999">para</p>', notes);
  var exported = stripForExport(saved);
  assert.ok(!exported.includes('aq-mn-store'));
  assert.ok(!exported.includes('data-mn-block-id'));
  assert.ok(exported.includes('<p>para</p>'));
});
