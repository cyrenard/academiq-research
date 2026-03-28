const test = require('node:test');
const assert = require('node:assert/strict');

const citation = require('../src/tiptap-word-citation.js');

test('renderReferenceList renders fallback when there are no refs', function(){
  const container = { innerHTML: '' };
  const html = citation.renderReferenceList(container, [], {});
  assert.match(html, /Metinde atıf yok/);
  assert.equal(container.innerHTML, html);
});

test('copyNoteCitation resolves note reference and copies inline citation', function(){
  let copied = '';
  const ok = citation.copyNoteCitation('n1', {
    notes: [{ id:'n1', rid:'r1' }],
    findReference: function(id){
      return id === 'r1' ? { id:'r1', year:'2024' } : null;
    },
    getInlineCitationText: function(ref){
      return '(' + ref.id + ', ' + ref.year + ')';
    },
    copyText: function(text){
      copied = text;
    }
  });
  assert.equal(ok, true);
  assert.equal(copied, '(r1, 2024)');
});

test('collectUsedReferences resolves citation ids from editor DOM', function(){
  const refs = citation.collectUsedReferences({
    querySelectorAll: function(selector){
      if(selector !== '.cit') return [];
      return [
        { dataset: { ref: 'r2, r1' } },
        { dataset: { ref: 'r1' } }
      ];
    }
  }, {
    findReference: function(id){
      return { id: id };
    },
    dedupeReferences: function(items){
      return items.filter(function(item, index, list){
        return list.findIndex(function(other){ return other.id === item.id; }) === index;
      });
    },
    sortReferences: function(items){
      return items.slice().sort(function(a, b){ return a.id.localeCompare(b.id); });
    }
  });
  assert.deepEqual(refs.map(function(ref){ return ref.id; }), ['r1', 'r2']);
});

test('renderUsedReferenceList collects and renders used references in one pass', function(){
  const container = { innerHTML: '' };
  const refs = citation.renderUsedReferenceList({
    querySelectorAll: function(selector){
      if(selector !== '.cit') return [];
      return [
        { dataset: { ref: 'r2,r1' } }
      ];
    }
  }, container, {
    findReference: function(id){
      return { id: id, title: id.toUpperCase() };
    },
    dedupeReferences: function(items){
      return items.filter(function(item, index, list){
        return list.findIndex(function(other){ return other.id === item.id; }) === index;
      });
    },
    sortReferences: function(items){
      return items.slice().sort(function(a, b){ return a.id.localeCompare(b.id); });
    },
    getInlineCitationText: function(ref){ return ref.id; },
    formatReference: function(ref){ return ref.title; }
  });

  assert.deepEqual(refs.map(function(ref){ return ref.id; }), ['r1', 'r2']);
  assert.match(container.innerHTML, /r1/);
  assert.match(container.innerHTML, /r2/);
});

test('insertCitationIntoEditor deletes trigger range and inserts normalized citation html', async function(){
  const calls = [];
  let triggerRange = { from: 12, to: 20 };
  let normalized = false;
  let cleaned = false;
  const chain = {
    focus: function(){ calls.push('focus'); return this; },
    deleteRange: function(arg){ calls.push({ deleteRange: arg }); return this; },
    insertContent: function(html, opts){ calls.push({ insertContent: html, opts: opts }); return this; },
    run: function(){ calls.push('run'); return true; }
  };
  const ok = citation.insertCitationIntoEditor([{ id:'b' }, { id:'a' }], {
    editor: {
      state: {
        selection: { from: 20 },
        doc: { textBetween: function(){ return '/rfoo'; } }
      },
      chain: function(){ return chain; }
    },
    buildCitationHTML: function(refs){ return refs.map(function(ref){ return ref.id; }).join(','); },
    dedupeReferences: function(refs){ return refs; },
    sortReferences: function(refs){ return refs.slice().sort(function(a, b){ return a.id.localeCompare(b.id); }); },
    triggerRange: triggerRange,
    setTriggerRange: function(value){ triggerRange = value; },
    normalizeCitationSpans: function(){ normalized = true; },
    cleanupSlashRArtifacts: function(){ cleaned = true; }
  });
  assert.equal(ok, true);
  assert.deepEqual(calls[1], { deleteRange: { from: 12, to: 20 } });
  assert.deepEqual(calls[2], { insertContent: 'a,b', opts: { parseOptions: { preserveWhitespace: false } } });
  await new Promise(function(resolve){ setTimeout(resolve, 0); });
  assert.equal(triggerRange, null);
  assert.equal(normalized, true);
  assert.equal(cleaned, true);
});

test('cleanupSlashRArtifacts falls back to regex cleanup when domState is missing', function(){
  let applied = null;
  const ok = citation.cleanupSlashRArtifacts({
    editor: {
      getHTML(){ return '<p>Test /rabc <span class="cit">Ref</span></p>'; },
      commands: {
        setContent(html){ applied = html; }
      },
      view: { dom:{} }
    }
  });
  assert.equal(ok, true);
  assert.equal(applied, '<p>Test <span class="cit">Ref</span></p>');
});

test('cleanupEditorArtifacts resolves root and falls back to dom text-node cleanup', function(){
  let cleanedRoot = null;
  const ok = citation.cleanupEditorArtifacts({
    host: 'host-root',
    domState: {
      cleanupSlashRTextNodes(root){
        cleanedRoot = root;
      }
    }
  });
  assert.equal(ok, true);
  assert.equal(cleanedRoot, 'host-root');
});

test('visibleCitationText builds fallback author-year text when inline formatter is missing', function(){
  const text = citation.visibleCitationText([
    { authors:['Doe, Jane'], year:'2024' },
    { authors:['Smith, John', 'Roe, Jane'], year:'2023' }
  ], {
    formatAuthor: function(value){ return value; },
    dedupeReferences: function(items){ return items; },
    sortReferences: function(items){ return items; }
  });
  assert.equal(text, '(Doe, 2024; Smith & Roe, 2023)');
});

test('normalizeCitationSpans can resolve root from editor when root is omitted', function(){
  const calls = [];
  const ok = citation.normalizeCitationSpans(null, {
    editor: { view:{ dom:'pm-root' } },
    domState: {
      normalizeCitationSpans(root, deps){
        calls.push([root, typeof deps.findReference, typeof deps.visibleCitationText]);
      }
    },
    findReference: function(){ return null; },
    visibleCitationText: function(){ return ''; }
  });
  assert.equal(ok, true);
  assert.deepEqual(calls, [['pm-root', 'function', 'function']]);
});

test('syncEditorCitationSpans delegates through normalizeCitationSpans with resolved options', function(){
  const calls = [];
  const ok = citation.syncEditorCitationSpans({
    host: 'host-root',
    domState: {
      normalizeCitationSpans(root, deps){
        calls.push([root, typeof deps.findReference, typeof deps.visibleCitationText]);
      }
    },
    findReference(){ return null; },
    visibleCitationText(){ return ''; }
  });
  assert.equal(ok, true);
  assert.deepEqual(calls, [['host-root', 'function', 'function']]);
});
