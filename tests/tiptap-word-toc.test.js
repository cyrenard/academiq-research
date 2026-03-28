const test = require('node:test');
const assert = require('node:assert/strict');

const toc = require('../src/tiptap-word-toc.js');

test('buildTOCHTML builds toc rows with page numbers and target ids', function(){
  const headings = [
    { tagName:'H1', textContent:'Giriş', offsetTop:0, id:'' },
    { tagName:'H2', textContent:'Yöntem', offsetTop:900, id:'custom-id' }
  ];
  const html = toc.buildTOCHTML({}, headings, {
    idFactory: function(index){ return 'generated-' + index; }
  });
  assert.match(html, /generated-0/);
  assert.match(html, /custom-id/);
  assert.match(html, /<span class="toc-page">1<\/span>/);
  assert.match(html, /<span class="toc-page">2<\/span>/);
});

test('scrollToHeading finds target and triggers highlight flow', function(){
  let scrolled = false;
  const target = {
    style: {},
    scrollIntoView: function(){ scrolled = true; }
  };
  const root = {
    querySelector: function(selector){
      if(selector === '.toc-entry[data-toc-idx="0"]'){
        return { dataset: { targetId: 'hdg-1' } };
      }
      if(selector === '#hdg-1'){
        return target;
      }
      return null;
    }
  };
  const ok = toc.scrollToHeading(root, 0);
  assert.equal(ok, true);
  assert.equal(scrolled, true);
  assert.equal(target.style.background, 'rgba(179,131,58,.2)');
});

test('handleDocumentClick routes toc entry clicks to scroll helper', function(){
  let prevented = false;
  let calledWith = null;
  const ok = toc.handleDocumentClick({
    target: {
      closest: function(selector){
        if(selector === '.toc-entry'){
          return { dataset: { tocIdx: '3' } };
        }
        return null;
      }
    },
    preventDefault: function(){ prevented = true; }
  }, {
    scrollToHeading: function(idx){ calledWith = idx; }
  });
  assert.equal(ok, true);
  assert.equal(prevented, true);
  assert.equal(calledWith, '3');
});

test('insertTOC builds and applies toc html through callbacks', function(){
  let applied = '';
  let updated = false;
  const root = {
    querySelectorAll: function(selector){
      if(selector === 'h1,h2,h3,h4,h5'){
        return [{ tagName:'H1', textContent:'Giriş', offsetTop:0, id:'' }];
      }
      return [];
    }
  };
  const ok = toc.insertTOC({
    getEditorRoot: function(){ return root; },
    getHTML: function(){ return '<p>Body</p>'; },
    applyHTML: function(html){ applied = html; },
    onUpdated: function(){ updated = true; },
    idFactory: function(){ return 'hdg-1'; }
  });
  assert.equal(ok, true);
  assert.match(applied, /toc-container/);
  assert.equal(updated, true);
});
