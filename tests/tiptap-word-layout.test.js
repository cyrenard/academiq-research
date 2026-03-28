const test = require('node:test');
const assert = require('node:assert/strict');

const layout = require('../src/tiptap-word-layout.js');

test('tiptap word layout exports page helpers', () => {
  assert.equal(typeof layout.computePageCount, 'function');
  assert.equal(typeof layout.buildPageNumberTops, 'function');
  assert.equal(typeof layout.applyPageGaps, 'function');
  assert.equal(typeof layout.renderPageSheets, 'function');
  assert.equal(typeof layout.syncPageMetrics, 'function');
  assert.equal(typeof layout.applyZoom, 'function');
  assert.equal(typeof layout.resolveZoomTargets, 'function');
  assert.equal(typeof layout.changeZoom, 'function');
  assert.equal(typeof layout.changeZoomUI, 'function');
  assert.equal(typeof layout.changeZoomWithFallback, 'function');
  assert.equal(typeof layout.editorZoom, 'function');
  assert.equal(typeof layout.runEditorZoom, 'function');
  assert.equal(typeof layout.resetZoom, 'function');
  assert.equal(typeof layout.resetZoomUI, 'function');
  assert.equal(typeof layout.getZoom, 'function');
});

test('computePageCount and buildPageNumberTops use A4-like defaults', () => {
  assert.equal(layout.computePageCount(864, 864), 1);
  assert.equal(layout.computePageCount(1728, 864), 2);
  assert.deepEqual(layout.buildPageNumberTops(3, 1056, 48), [48, 1104, 2160]);
});

test('renderPageSheets creates visible A4 sheet layers in page background host', () => {
  const nodes = [];
  globalThis.document = {
    createElement(){
      return {
        className: '',
        style: {}
      };
    }
  };
  const host = {
    innerHTML: 'legacy',
    appendChild(node){ nodes.push(node); }
  };
  const page = {
    querySelector(selector){
      return selector === '#apapage-bg' ? host : null;
    }
  };

  const count = layout.renderPageSheets(page, 2, { pageStep: 1123 });

  assert.equal(count, 2);
  assert.equal(host.innerHTML, '');
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].className, 'aq-page-sheet');
  assert.equal(nodes[0].style.top, '0px');
  assert.equal(nodes[1].style.top, '1123px');

  delete globalThis.document;
});

test('applyPageGaps pushes overflowing blocks to next page content start', () => {
  function makeBlock(height){
    return {
      offsetHeight: height,
      scrollHeight: height,
      classList: {
        added: [],
        add(name){ this.added.push(name); }
      },
      style: {
        values: {},
        setProperty(name, value){ this.values[name] = value; }
      }
    };
  }

  const first = makeBlock(500);
  const second = makeBlock(500);
  const total = layout.applyPageGaps({
    children: [first, second]
  }, 931, 1123);

  assert.equal(total, 1623);
  assert.deepEqual(first.classList.added, []);
  assert.deepEqual(second.classList.added, ['aq-page-gap']);
  assert.equal(second.style.values['--aq-page-gap'], '623px');
});

test('resolvePageMetrics combines physical page height with visual page gap', () => {
  const page = {
    appendChild(){},
    removeChild(){},
    ownerDocument: null
  };
  globalThis.document = {
    documentElement: {},
    createElement(){
      return {
        style: {},
        parentNode: null,
        getBoundingClientRect(){ return { height: 0 }; }
      };
    }
  };
  globalThis.window = {
    getComputedStyle(){
      return {
        getPropertyValue(name){
          if(name === '--aq-page-height') return '1123px';
          if(name === '--aq-page-margin') return '96px';
          if(name === '--aq-page-content-height') return '931px';
          if(name === '--aq-page-gap') return '32px';
          return '';
        }
      };
    }
  };
  page.appendChild = function(node){
    node.parentNode = page;
  };
  page.removeChild = function(node){
    node.parentNode = null;
  };

  const metrics = layout.resolvePageMetrics({ page });

  assert.equal(metrics.pageHeight, 1123);
  assert.equal(metrics.pageGap, 32);
  assert.equal(metrics.pageContentHeight, 931);
  assert.equal(metrics.pageTotalHeight, 1155);

  delete globalThis.window;
  delete globalThis.document;
});

test('syncPageMetrics uses A4 measurements and renders sheets through background host', () => {
  const nodes = [];
  globalThis.document = {
    createElement(){
      return {
        className: '',
        textContent: '',
        style: {}
      };
    }
  };
  const host = {
    innerHTML: '',
    appendChild(node){ nodes.push(node); }
  };
  const page = {
    style: {},
    querySelector(selector){
      return selector === '#apapage-bg' ? host : null;
    },
    querySelectorAll(){ return []; },
    appendChild(node){ nodes.push(node); }
  };
  function makeBlock(height){
    return {
      offsetHeight: height,
      scrollHeight: height,
      classList: {
        add(){},
        remove(){}
      },
      style: {
        setProperty(){},
        removeProperty(){}
      },
      getBoundingClientRect(){ return { height }; }
    };
  }
  const editorDom = {
    querySelectorAll(){ return []; },
    children: [makeBlock(500), makeBlock(500)],
    scrollHeight: 1200,
    offsetHeight: 1200
  };
  const scrollEl = { clientHeight: 700 };

  const count = layout.syncPageMetrics({
    page,
    editorDom,
    scrollEl,
    showPageNumbers: true,
    pageContentHeight: 931,
    pageHeight: 1123,
    pageGap: 32,
    pageTotalHeight: 1155,
    pageVerticalPadding: 192
  });

  assert.equal(count, 2);
  assert.equal(page.style.minHeight, '2310px');
  assert.equal(nodes.filter(function(node){ return node.className === 'aq-page-sheet'; }).length, 2);
  assert.equal(nodes.filter(function(node){ return node.className === 'page-number'; }).length, 2);

  delete globalThis.document;
});

test('schedulePageSync triggers sync after delay', async () => {
  let synced = 0;
  const ok = layout.schedulePageSync({
    delay: 1,
    page: {
      querySelectorAll: function(){ return []; },
      appendChild: function(){},
      style: {}
    },
    editorDom: {
      querySelectorAll: function(){ return []; },
      children: [],
      scrollHeight: 900,
      offsetHeight: 900
    },
    onSynced: function(){ synced++; }
  });
  assert.equal(ok, true);
  await new Promise(function(resolve){ setTimeout(resolve, 10); });
  assert.equal(synced, 1);
});

test('changeZoom and resetZoom manage stored zoom state', () => {
  const page = { style:{} };
  const label = { textContent:'' };
  assert.equal(layout.resetZoom({ page:page, label:label }), 100);
  assert.equal(layout.changeZoom({ page:page, label:label, delta:10 }), 110);
  assert.equal(layout.getZoom(), 110);
  assert.equal(label.textContent, '110%');
  assert.equal(layout.resetZoom({ page:page, label:label }), 100);
  assert.equal(layout.getZoom(), 100);
});

test('changeZoomUI and resetZoomUI resolve page and label from document', () => {
  const page = { style:{} };
  const label = { textContent:'' };
  const doc = {
    getElementById(id){
      if(id === 'apapage') return page;
      if(id === 'zoomLbl') return label;
      return null;
    }
  };
  assert.equal(layout.changeZoomUI({ doc, delta:15 }), 115);
  assert.equal(label.textContent, '115%');
  assert.equal(layout.resetZoomUI({ doc }), 100);
  assert.equal(label.textContent, '100%');
});

test('changeZoomWithFallback can apply manual fallback when targets are missing', () => {
  let applied = null;
  const next = layout.changeZoomWithFallback({
    delta: 15,
    currentZoom: 100,
    applyManual(value) {
      applied = value;
    }
  });

  assert.equal(next, 115);
  assert.equal(applied, 115);
});

test('editorZoom delegates to changeZoomWithFallback style flow', () => {
  let applied = null;
  const next = layout.editorZoom({
    delta: 20,
    currentZoom: 100,
    applyManual(value) {
      applied = value;
    }
  });

  assert.equal(next, 120);
  assert.equal(applied, 120);
});

test('runEditorZoom resolves current label and updates page targets', () => {
  const page = { style:{} };
  const label = { textContent:'100%' };
  const doc = {
    getElementById(id){
      if(id === 'apapage') return page;
      if(id === 'zoomLbl') return label;
      return null;
    }
  };

  layout.resetZoomUI({ doc });
  const next = layout.runEditorZoom({ doc, delta: 10 });

  assert.equal(next, 110);
  assert.equal(page.style.transform, 'scale(1.1)');
  assert.equal(page.style.transformOrigin, 'top center');
  assert.equal(label.textContent, '110%');
});

test('resetZoomWithFallback can apply manual fallback when targets are missing', () => {
  let applied = null;
  const next = layout.resetZoomWithFallback({
    applyManual(value) {
      applied = value;
    }
  });

  assert.equal(next, 100);
  assert.equal(applied, 100);
});
