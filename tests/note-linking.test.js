const test = require('node:test');
const assert = require('node:assert/strict');

const noteLinking = require('../src/note-linking.js');

test('buildLinkMetadata creates normalized metadata payload', function(){
  const meta = noteLinking.buildLinkMetadata({
    noteId: 'n1',
    referenceId: 'r1',
    page: '  s. 12 ',
    noteType: 'quote',
    notebookId: 'nb1'
  });

  assert.deepEqual(meta, {
    noteId: 'n1',
    referenceId: 'r1',
    page: 's. 12',
    noteType: 'quote',
    notebookId: 'nb1'
  });
});

test('decorateNoteInsertionHTML adds note attrs to inserted paragraphs', function(){
  const html = noteLinking.decorateNoteInsertionHTML('<p>Paragraf</p><p>Ikinci</p>', {
    noteId: 'n1',
    referenceId: 'r1',
    page: 'p. 5'
  });

  assert.match(html, /data-note-id="n1"/);
  assert.match(html, /data-note-ref="r1"/);
  assert.match(html, /data-note-page="p\. 5"/);
});

test('decorateNoteInsertionHTML adds note attrs to citation spans', function(){
  const html = noteLinking.decorateNoteInsertionHTML('<span class="cit" data-ref="r1">(Doe, 2024)</span>', {
    noteId: 'n1',
    referenceId: 'r1'
  });
  assert.match(html, /class="cit"/);
  assert.match(html, /data-note-id="n1"/);
});

test('decorateNoteInsertionHTML wraps plain text with linked paragraph', function(){
  const html = noteLinking.decorateNoteInsertionHTML('Duz metin', { noteId: 'n7' });
  assert.equal(html, '<p data-note-id="n7">Duz metin</p>');
});

test('stripNoteLinkAttributes removes all note-link attributes for export', function(){
  const cleaned = noteLinking.stripNoteLinkAttributes('<p data-note-id="n1" data-note-ref="r1" data-note-page="p.1">x</p>');
  assert.equal(cleaned, '<p>x</p>');
});

test('resolveLinkFromAttrs maps tiptap attrs into stable metadata', function(){
  const meta = noteLinking.resolveLinkFromAttrs({
    'data-note-id': 'n2',
    'data-note-ref': 'r2',
    'data-note-page': '12',
    'data-note-type': 'summary',
    'data-note-nb': 'nb2'
  });

  assert.deepEqual(meta, {
    noteId: 'n2',
    referenceId: 'r2',
    page: '12',
    noteType: 'summary',
    notebookId: 'nb2'
  });
});

test('resolveLinkFromEditorSelection resolves nearest linked node attrs', function(){
  const editor = {
    state: {
      selection: {
        $from: {
          depth: 2,
          node: function(depth){
            if(depth === 2) return { attrs: {} };
            if(depth === 1) return { attrs: { 'data-note-id': 'n55', 'data-note-ref': 'r55' } };
            return { attrs: {} };
          }
        }
      }
    }
  };

  const meta = noteLinking.resolveLinkFromEditorSelection({ editor: editor });
  assert.equal(meta.noteId, 'n55');
  assert.equal(meta.referenceId, 'r55');
});

test('resolveLinkFromEditorSelection resolves metadata from selection marks', function(){
  const editor = {
    state: {
      selection: {
        $from: {
          depth: 0,
          node: function(){ return { attrs: {} }; },
          marks: function(){
            return [{ attrs: { 'data-note-id': 'n88', 'data-note-ref': 'r88' } }];
          }
        }
      }
    }
  };

  const meta = noteLinking.resolveLinkFromEditorSelection({ editor: editor });
  assert.equal(meta.noteId, 'n88');
  assert.equal(meta.referenceId, 'r88');
});

test('resolveLinkFromEditorSelection returns null when no metadata exists', function(){
  const editor = {
    state: {
      selection: {
        $from: {
          depth: 1,
          node: function(){ return { attrs: {} }; }
        }
      }
    }
  };
  assert.equal(noteLinking.resolveLinkFromEditorSelection({ editor: editor }), null);
});
