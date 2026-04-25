const test = require('node:test');
const assert = require('node:assert/strict');

const documentOutline = require('../src/document-outline.js');

function createNode(order, tagName, textContent, attrs){
  attrs = Object.assign({}, attrs || {});
  const addedClasses = [];
  return {
    __order: order,
    tagName,
    textContent,
    id: attrs.id || '',
    parentNode: null,
    style: {},
    getAttribute(name){
      if(name === 'id') return this.id || '';
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : '';
    },
    setAttribute(name, value){
      attrs[name] = String(value);
      if(name === 'id') this.id = String(value);
    },
    compareDocumentPosition(other){
      if(!other || this === other) return 0;
      return this.__order < other.__order ? 4 : 2;
    },
    scrollIntoView(){
      this.__scrolled = true;
    },
    classList: {
      add(name){ addedClasses.push(name); },
      remove(){},
      contains(name){ return addedClasses.includes(name); }
    }
  };
}

function createRoot(nodesBySelector){
  return {
    querySelectorAll(selector){
      return nodesBySelector[selector] || [];
    },
    querySelector(){
      return null;
    }
  };
}

test('document outline exports key helpers', () => {
  assert.equal(typeof documentOutline.collectEntries, 'function');
  assert.equal(typeof documentOutline.filterEntries, 'function');
  assert.equal(typeof documentOutline.buildSummary, 'function');
  assert.equal(typeof documentOutline.scrollToEntry, 'function');
});

test('document outline collects headings, tables and figures in document order', () => {
  const headingOne = createNode(1, 'H1', 'Giris');
  const tableOne = createNode(2, 'TABLE', '', { 'data-academic-id': 'table-1', 'data-academic-label': 'Tablo 1' });
  const headingTwo = createNode(3, 'H2', 'Yontem');
  const figureOne = createNode(4, 'P', 'Sekil 1 - Akis', {
    'data-academic-id': 'figure-1',
    'data-academic-object': 'figure',
    'data-academic-title-node': 'true',
    'data-academic-label': 'Sekil 1'
  });
  const root = createRoot({
    'h1,h2,h3,h4,h5': [headingOne, headingTwo],
    'table[data-academic-id]': [tableOne],
    '[data-academic-object="figure"][data-academic-id]': [figureOne]
  });
  [headingOne, tableOne, headingTwo, figureOne].forEach((node) => { node.parentNode = root; });
  let normalized = 0;
  const academicApi = {
    normalizeDocument(){ normalized += 1; },
    collectTargets(){
      return [
        { type: 'table', id: 'table-1', label: 'Tablo 1', title: 'Ornek tablo' },
        { type: 'figure', id: 'figure-1', label: 'Sekil 1', title: 'Akis' }
      ];
    }
  };

  const entries = documentOutline.collectEntries({ root, academicApi });

  assert.equal(normalized, 1);
  assert.deepEqual(entries.map((entry) => entry.type), ['heading', 'table', 'heading', 'figure']);
  assert.equal(entries[0].label, 'Giris');
  assert.equal(entries[1].title, 'Ornek tablo');
  assert.equal(entries[2].level, 2);
  assert.equal(entries[3].label, 'Sekil 1');
});

test('document outline filters and summarizes conservatively', () => {
  const entries = [
    { id: 'h1', type: 'heading', level: 1, label: 'Giris', title: 'Giris' },
    { id: 't1', type: 'table', level: 0, label: 'Tablo 1', title: 'Ozet tablo' },
    { id: 'f1', type: 'figure', level: 0, label: 'Sekil 1', title: 'Akis diyagrami' }
  ];

  assert.equal(documentOutline.filterEntries(entries, { type: 'table' }).length, 1);
  assert.equal(documentOutline.filterEntries(entries, { query: 'akis' }).length, 1);
  assert.deepEqual(documentOutline.buildSummary(entries), {
    total: 3,
    headings: 1,
    tables: 1,
    figures: 1
  });
});

test('document outline scrolls to target node when available', () => {
  const target = createNode(1, 'H1', 'Giris', { id: 'heading-1' });
  const doc = {
    getElementById(id){
      return id === 'heading-1' ? target : null;
    }
  };

  const ok = documentOutline.scrollToEntry({ document: doc, id: 'heading-1' });

  assert.equal(ok, true);
  assert.equal(target.__scrolled, true);
  assert.equal(target.classList.contains('aq-outline-target-flash'), true);
});

test('document outline finds active entry nearest the viewport anchor', () => {
  const first = createNode(1, 'H1', 'Giris', { id: 'heading-1' });
  first.getBoundingClientRect = () => ({ top: -260, bottom: -220 });
  const second = createNode(2, 'H2', 'Yontem', { id: 'heading-2' });
  second.getBoundingClientRect = () => ({ top: 160, bottom: 220 });
  const third = createNode(3, 'H2', 'Bulgular', { id: 'heading-3' });
  third.getBoundingClientRect = () => ({ top: 420, bottom: 480 });
  const doc = {
    getElementById(id){
      if(id === 'escroll'){
        return {
          getBoundingClientRect(){
            return { top: 0, bottom: 700 };
          }
        };
      }
      if(id === 'heading-1') return first;
      if(id === 'heading-2') return second;
      if(id === 'heading-3') return third;
      return null;
    }
  };
  const entries = [
    { id: 'heading-1', type: 'heading', level: 1, label: 'Giris' },
    { id: 'heading-2', type: 'heading', level: 2, label: 'Yontem' },
    { id: 'heading-3', type: 'heading', level: 2, label: 'Bulgular' }
  ];

  const active = documentOutline.findActiveEntry(entries, { document: doc });

  assert.equal(active && active.id, 'heading-1');
});
