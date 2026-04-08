const test = require('node:test');
const assert = require('node:assert/strict');

const notesState = require('../src/notes-state.js');

test('createManualNote normalizes tag and trims text', function(){
  const note = notesState.createManualNote({
    id: 'n1',
    notebookId: 'nb1',
    text: '  deneme notu  ',
    tag: '',
    source: 'Doe (2024)',
    referenceId: 'r1',
    dateText: '27.03.2026'
  });

  assert.deepEqual(note, {
    id: 'n1',
    nbId: 'nb1',
    type: 'm',
    txt: 'deneme notu',
    q: '',
    src: 'Doe (2024)',
    rid: 'r1',
    tag: 'genel',
    dt: '27.03.2026',
    noteType: 'summary',
    sourceExcerpt: '',
    comment: 'deneme notu',
    sourcePage: '',
    inserted: false
  });
});

test('createHighlightNote uses fallback quote text', function(){
  const note = notesState.createHighlightNote({
    id: 'n2',
    notebookId: 'nb1',
    quoteText: '',
    pageTag: 's.12',
    highlightColor: '#fef08a'
  });

  assert.equal(note.type, 'hl');
  assert.equal(note.q, '(metin yok)');
  assert.equal(note.tag, 's.12');
  assert.equal(note.hlColor, '#fef08a');
});

test('deleteNote removes only matching note id', function(){
  const next = notesState.deleteNote([{ id:'a' }, { id:'b' }], 'a');
  assert.deepEqual(next, [{ id:'b' }]);
});

test('renderNotesHTML escapes note content and renders actions', function(){
  const html = notesState.renderNotesHTML([{
    id: "n'1",
    type: 'hl',
    src: '<Kaynak>',
    tag: 's.5',
    txt: '<b>not</b>',
    q: '<script>x</script>',
    rid: 'r1',
    hlColor: '#abc'
  }], {});

  assert.match(html, /&lt;Kaynak&gt;/);
  assert.match(html, /&lt;b&gt;not&lt;\/b&gt;/);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(html, /data-note-action="copy-cite"/);
  assert.match(html, /data-note-action="insert-cite"/);
  assert.match(html, /data-note-action="open-source"/);
  assert.match(html, /data-note-action="delete-note"/);
  assert.match(html, /data-note-id="n&#39;1"/);
  assert.match(html, /border-left-color:#abc/);
  assert.match(html, /Kayna&#287;a Git/);
  assert.match(html, /Kullanılmadı/);
});

test('renderNotesHTML does not render source button for non-highlight notes', function(){
  const html = notesState.renderNotesHTML([{
    id: 'n2',
    type: 'm',
    src: 'Kaynak',
    txt: 'manuel not',
    rid: 'r2'
  }], {});

  assert.doesNotMatch(html, /Kayna&#287;a Git/);
});
