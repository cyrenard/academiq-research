const test = require('node:test');
const assert = require('node:assert/strict');

const citationDomState = require('../src/citation-dom-state.js');

test('cleanupCitationHTML removes slash trigger artifacts around citations', function(){
  const html = '<p>Hello /rdoe <span class="cit" data-ref="a">(Doe, 2024)</span></p><p>/r</p>';
  const cleaned = citationDomState.cleanupCitationHTML(html);
  assert.equal(cleaned, '<p>Hello <span class="cit" data-ref="a">(Doe, 2024)</span></p><p></p>');
});

test('cleanupTextNodeValue strips slash trigger tokens from plain text', function(){
  assert.equal(
    citationDomState.cleanupTextNodeValue('before /rdoe after'),
    'before after'
  );
});

test('normalizeCitationSpans updates nodes and ensures trailing text space', function(){
  const inserted = [];
  const parent = {
    insertBefore(node){ inserted.push(node); }
  };
  const citationNode = {
    nodeType: 1,
    _attrs: { 'data-ref':'a,b' },
    parentNode: parent,
    nextSibling: null,
    textContent: '',
    classList: { contains(){ return false; } },
    getAttribute(name){ return this._attrs[name] || ''; },
    setAttribute(name, value){ this._attrs[name] = value; }
  };
  const root = {
    ownerDocument: {
      createElement(tag){
        return {
          nodeType: 1,
          tagName: tag.toUpperCase(),
          className: '',
          textContent: '',
          classList: { contains(cls){ return this._owner.className === cls; }, _owner:null }
        };
      },
      createTextNode(text){
        return { nodeType:3, nodeValue:text };
      }
    },
    querySelectorAll(selector){
      return selector === '.cit' ? [citationNode] : [];
    }
  };
  const deps = {
    findReference(id){
      if(id === 'a') return { id:'a', label:'(Doe, 2024)' };
      if(id === 'b') return { id:'b', label:'(Smith, 2022)' };
      return null;
    },
    dedupeReferences(refs){ return refs; },
    visibleCitationText(refs){ return refs.map(function(ref){ return ref.label; }).join('; '); }
  };

  citationDomState.normalizeCitationSpans(root, deps);

  assert.equal(citationNode._attrs.contenteditable, 'false');
  assert.equal(citationNode.textContent, '(Doe, 2024); (Smith, 2022)');
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].nodeType, 3);
  assert.equal(inserted[0].nodeValue, ' ');
});
