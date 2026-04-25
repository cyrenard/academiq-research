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
  assert.equal(typeof layout.setPageLayout, 'function');
  assert.equal(typeof layout.setPageSize, 'function');
  assert.equal(typeof layout.getPageSize, 'function');
  assert.equal(typeof layout.getPageSizes, 'function');
  assert.equal(typeof layout.setPageMargins, 'function');
  assert.equal(typeof layout.getPageMargins, 'function');
  assert.equal(typeof layout.setWidowOrphanControl, 'function');
  assert.equal(typeof layout.getWidowOrphanControl, 'function');
  assert.equal(typeof layout.setParagraphSpacing, 'function');
  assert.equal(typeof layout.insertPageBreak, 'function');
});

test('PAGE_SIZES contains A4, Letter, Legal, A5 presets', () => {
  const sizes = layout.getPageSizes();
  assert.ok(sizes.A4);
  assert.equal(sizes.A4.width, '21cm');
  assert.equal(sizes.A4.height, '29.7cm');
  assert.ok(sizes.Letter);
  assert.equal(sizes.Letter.width, '21.59cm');
  assert.equal(sizes.Letter.height, '27.94cm');
  assert.ok(sizes.Legal);
  assert.ok(sizes.A5);
});

test('getPageSize defaults to A4', () => {
  assert.equal(layout.getPageSize(), 'A4');
});

test('setPageMargins stores per-side margins and keeps APA minimum', () => {
  const styles = {};
  globalThis.document = {
    documentElement: {
      style: {
        setProperty(name, value){ styles[name] = value; }
      }
    },
    getElementById(){ return null; }
  };
  try{
    const ok = layout.setPageMargins({ top:'0.5in', right:'1in', bottom:'36pt', left:'90px' }, { delay:1 });
    assert.equal(ok, true);
    const margins = layout.getPageMargins();
    assert.equal(margins.top >= 96, true);
    assert.equal(margins.right >= 96, true);
    assert.equal(margins.bottom >= 96, true);
    assert.equal(margins.left >= 96, true);
    assert.ok(styles['--aq-page-margin-top']);
    assert.ok(styles['--aq-page-margin-bottom']);
    assert.ok(styles['--aq-page-content-height']);
  } finally {
    delete globalThis.document;
  }
});

test('setWidowOrphanControl persists typed layout thresholds', () => {
  const config = layout.setWidowOrphanControl({ enabled:true, minLines:3, lineHeightPx:28 });
  assert.deepEqual(config, {
    enabled: true,
    minLines: 3,
    lineHeightPx: 28
  });
  assert.deepEqual(layout.getWidowOrphanControl(), config);
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
      return (typeof selector === 'string' && selector.indexOf('#apapage-bg') !== -1) ? host : null;
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
  function makeBlock(height, tag){
    return {
      offsetHeight: height,
      scrollHeight: height,
      nodeName: tag || 'P',
      classList: {
        added: [],
        add(name){ this.added.push(name); },
        contains(){ return false; }
      },
      style: {
        values: {},
        setProperty(name, value){ this.values[name] = value; }
      }
    };
  }
  let styleEl = null;
  const ownerDoc = {
    head: {
      appendChild(node){ styleEl = node; }
    },
    getElementById(){ return styleEl; },
    createElement(){
      return {
        id: '',
        textContent: ''
      };
    }
  };

  const first = makeBlock(500, 'P');
  const second = makeBlock(500, 'H1');
  const total = layout.applyPageGaps({
    children: [first, second],
    ownerDocument: ownerDoc
  }, 931, 1123);

  assert.equal(total, 1623);
  assert.ok(styleEl);
  assert.equal(styleEl.id, 'aq-page-gap-style');
  assert.match(styleEl.textContent, /nth-child\(2\)/);
  assert.match(styleEl.textContent, /margin-top:623px/);
});

test('applyPageGaps keeps a 1-inch bottom reserve before paragraph continuation', () => {
  function makeBlock(height, tag){
    return {
      offsetHeight: height,
      scrollHeight: height,
      nodeName: tag || 'P',
      classList: { add(){}, contains(){ return false; } },
      style: { setProperty(){} }
    };
  }
  let styleEl = null;
  const ownerDoc = {
    head: { appendChild(node){ styleEl = node; } },
    getElementById(){ return styleEl; },
    createElement(){ return { id: '', textContent: '' }; }
  };
  const first = makeBlock(500, 'P');
  const second = makeBlock(500, 'P');

  layout.applyPageGaps({
    children: [first, second],
    ownerDocument: ownerDoc
  }, 931, 1123, { widowOrphan: { lineHeightPx: 32, minLines: 2 } });

  const txt = styleEl ? styleEl.textContent : '';
  assert.match(txt, /nth-child\(2\)\{margin-top:623px/);
});

test('applyPageGaps pushes normal paragraphs only when remaining space is tiny', () => {
  function makeBlock(height, tag){
    return {
      offsetHeight: height,
      scrollHeight: height,
      nodeName: tag || 'P',
      classList: { add(){}, contains(){ return false; } },
      style: { setProperty(){} }
    };
  }
  let styleEl = null;
  const ownerDoc = {
    head: { appendChild(node){ styleEl = node; } },
    getElementById(){ return styleEl; },
    createElement(){ return { id: '', textContent: '' }; }
  };
  const first = makeBlock(880, 'P');
  const second = makeBlock(120, 'P');

  layout.applyPageGaps({
    children: [first, second],
    ownerDocument: ownerDoc
  }, 931, 1123, { widowOrphan: { lineHeightPx: 32, minLines: 2 } });

  assert.ok(styleEl);
  assert.match(styleEl.textContent, /nth-child\(2\)\{margin-top:243px/);
});

test('applyPageGaps is idempotent with previously injected gap css', () => {
  function makeBlock(height, tag){
    return {
      offsetHeight: height,
      scrollHeight: height,
      nodeName: tag || 'P',
      classList: { add(){}, contains(){ return false; } },
      style: { setProperty(){} }
    };
  }
  let writeCount = 0;
  let cssText = '#apaed .ProseMirror>*:nth-child(2){margin-top:243px!important;}';
  const styleEl = {};
  Object.defineProperty(styleEl, 'textContent', {
    get(){ return cssText; },
    set(value){ writeCount++; cssText = value; }
  });
  const ownerDoc = {
    head: { appendChild(){ throw new Error('style element should already exist'); } },
    getElementById(id){ return id === 'aq-page-gap-style' ? styleEl : null; },
    createElement(){ throw new Error('style element should not be recreated'); }
  };

  const total = layout.applyPageGaps({
    children: [makeBlock(880, 'P'), makeBlock(120, 'P')],
    ownerDocument: ownerDoc
  }, 931, 1123, { widowOrphan: { lineHeightPx: 32, minLines: 2 } });

  assert.equal(total, 1243);
  assert.equal(writeCount, 0, 'same layout should not rewrite gap css and cause blink');
  assert.equal(cssText, '#apaed .ProseMirror>*:nth-child(2){margin-top:243px!important;}');
});

test('applyPageGaps pushes heading to next page when keep-with-next would orphan it', () => {
  function makeBlock(height, tag){
    return {
      offsetHeight: height,
      scrollHeight: height,
      nodeName: tag || 'P',
      classList: {
        added: [],
        add(name){ this.added.push(name); },
        contains(){ return false; }
      },
      style: {
        values: {},
        setProperty(name, value){ this.values[name] = value; }
      }
    };
  }
  let styleEl = null;
  const ownerDoc = {
    head: {
      appendChild(node){ styleEl = node; }
    },
    getElementById(){ return styleEl; },
    createElement(){
      return { id: '', textContent: '' };
    }
  };
  // Fill page to leave only ~20px after heading would fit — forces keep-with-next push
  const bodyFill = makeBlock(880, 'P');
  const heading = makeBlock(40, 'H2');
  const followUp = makeBlock(200, 'P');
  layout.applyPageGaps({
    children: [bodyFill, heading, followUp],
    ownerDocument: ownerDoc
  }, 931, 1123, { widowOrphan: { keepWithNext: true, lineHeightPx: 32, minLines: 2 } });

  assert.ok(styleEl);
  // Heading is index 2 (nth-child); should have been pushed to next page
  assert.match(styleEl.textContent, /nth-child\(2\)\{margin-top:\d+px/);
});

test('applyPageGaps keep-with-next respects explicit disable flag', () => {
  function makeBlock(height, tag){
    return {
      offsetHeight: height,
      scrollHeight: height,
      nodeName: tag || 'P',
      classList: { add(){}, contains(){ return false; } },
      style: { setProperty(){} }
    };
  }
  let styleEl = null;
  const ownerDoc = {
    head: { appendChild(node){ styleEl = node; } },
    getElementById(){ return styleEl; },
    createElement(){ return { id: '', textContent: '' }; }
  };
  const bodyFill = makeBlock(880, 'P');
  const heading = makeBlock(40, 'H2');
  const followUp = makeBlock(200, 'P');
  layout.applyPageGaps({
    children: [bodyFill, heading, followUp],
    ownerDocument: ownerDoc
  }, 931, 1123, { widowOrphan: { keepWithNext: false } });
  // With keep-with-next disabled, heading stays on page 1 — no nth-child(2) margin rule
  const txt = styleEl ? styleEl.textContent : '';
  assert.doesNotMatch(txt, /nth-child\(2\)\{margin-top:\d+px/);
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

test('resolvePageMetrics enforces APA 1-inch margins as minimum', () => {
  const metrics = layout.resolvePageMetrics({
    pageHeight: 1123,
    pageMargin: 40,
    pageGap: 8,
    pageContentHeight: 1100,
    pageTotalHeight: 1120
  });

  assert.equal(metrics.pageMargin, 96);
  assert.equal(metrics.pageGap >= 24, true);
  assert.equal(metrics.pageContentHeight <= (metrics.pageHeight - (metrics.pageMargin * 2)), true);
  assert.equal(metrics.pageTotalHeight >= (metrics.pageHeight + metrics.pageGap), true);
});

test('syncPageMetrics uses A4 measurements and renders sheets through background host', () => {
  const nodes = [];
  const maskNodes = [];
  globalThis.document = {
    createElement(){
      return {
        className: '',
        textContent: '',
        style: {}
      };
    },
    getElementById(id){
      if(id !== 'aq-mask-layer') return null;
      return {
        innerHTML: '',
        appendChild(node){ maskNodes.push(node); }
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
      return (typeof selector === 'string' && selector.indexOf('#apapage-bg') !== -1) ? host : null;
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
  assert.equal(maskNodes.filter(function(node){ return node.className === 'aq-margin-mask'; }).length, 4);
  assert.deepEqual(maskNodes.map(function(node){ return node.style.height; }), ['96px', '96px', '96px', '96px']);
  assert.deepEqual(maskNodes.map(function(node){ return node.style.top; }), ['0px', '1027px', '1155px', '2182px']);

  delete globalThis.document;
});

test('syncPageMetrics is stable across repeated runs with same inputs', () => {
  let styleText = '';
  let styleWrites = 0;
  let sheetClears = 0;
  let maskClears = 0;
  const styleEl = {};
  Object.defineProperty(styleEl, 'textContent', {
    get(){ return styleText; },
    set(value){ styleWrites++; styleText = value; }
  });
  const sheetNodes = [];
  const maskNodes = [];
  globalThis.document = {
    createElement(){
      return {
        className: '',
        textContent: '',
        style: {},
        remove(){}
      };
    },
    getElementById(id){
      if(id === 'aq-page-gap-style') return styleEl;
      if(id === 'aq-mask-layer') {
        return {
          set innerHTML(value){ maskClears++; },
          get innerHTML(){ return ''; },
          appendChild(node){ maskNodes.push(node); }
        };
      }
      return null;
    }
  };
  const host = {
    set innerHTML(value){ sheetClears++; },
    get innerHTML(){ return ''; },
    appendChild(node){ sheetNodes.push(node); }
  };
  const page = {
    style: {},
    querySelector(selector){ return (typeof selector === 'string' && selector.indexOf('#apapage-bg') !== -1) ? host : null; },
    querySelectorAll(){ return []; },
    appendChild(node){ sheetNodes.push(node); }
  };
  function makeBlock(height){
    return {
      offsetHeight: height,
      scrollHeight: height,
      nodeName: 'P',
      classList: { add(){}, remove(){} },
      style: { setProperty(){}, removeProperty(){} },
      getBoundingClientRect(){ return { height }; }
    };
  }
  const editorDom = {
    ownerDocument: globalThis.document,
    querySelectorAll(){ return []; },
    children: [makeBlock(880), makeBlock(120)],
    scrollHeight: 1300,
    offsetHeight: 1300
  };
  const options = {
    page,
    editorDom,
    scrollEl: { clientHeight: 700 },
    showPageNumbers: true,
    pageContentHeight: 931,
    pageHeight: 1123,
    pageGap: 32,
    pageTotalHeight: 1155,
    pageVerticalPadding: 192
  };

  assert.equal(layout.syncPageMetrics(options), 2);
  const firstCss = styleText;
  const firstStyleWrites = styleWrites;
  assert.equal(layout.syncPageMetrics(options), 2);

  assert.equal(styleText, firstCss);
  assert.equal(styleWrites, firstStyleWrites, 'unchanged gap css should not be rewritten on repeated layout sync');
  assert.equal(sheetClears, 2, 'page sheets still refresh as presentation layers');
  assert.equal(maskClears, 2, 'margin masks still refresh as presentation layers');

  delete globalThis.document;
});

test('syncPageMetrics keeps live ProseMirror page gaps visible and masks disabled', () => {
  const nodes = [];
  const maskNodes = [];
  const maskLayer = {
    innerHTML: '',
    style: {},
    appendChild(node){ maskNodes.push(node); }
  };
  globalThis.document = {
    createElement(){
      return {
        className: '',
        textContent: '',
        style: {}
      };
    },
    getElementById(id){
      return id === 'aq-mask-layer' ? maskLayer : null;
    }
  };
  const page = {
    style: {},
    querySelector(){ return { innerHTML: '', appendChild(node){ nodes.push(node); } }; },
    querySelectorAll(){ return []; },
    appendChild(node){ nodes.push(node); }
  };
  function makeBlock(height){
    return {
      offsetHeight: height,
      scrollHeight: height,
      nodeName: 'P',
      classList: { add(){}, remove(){}, contains(){ return false; } },
      style: { setProperty(){}, removeProperty(){} },
      getBoundingClientRect(){ return { height }; }
    };
  }
  const editorDom = {
    classList: {
      contains(name){ return name === 'ProseMirror'; }
    },
    querySelectorAll(){ return []; },
    children: [makeBlock(520), makeBlock(620)],
    scrollHeight: 1250,
    offsetHeight: 1250
  };

  layout.syncPageMetrics({
    page,
    editorDom,
    scrollEl: { clientHeight: 700 },
    showPageNumbers: false,
    pageContentHeight: 931,
    pageHeight: 1123,
    pageGap: 32,
    pageTotalHeight: 1155,
    pageVerticalPadding: 192
  });

  const overlay = nodes.find(function(node){ return node && node.className === 'page-break-overlay'; });
  assert.ok(overlay, 'live ProseMirror flow should keep page-gap overlays visible');
  assert.equal(overlay.style.top, '1123px');
  assert.equal(overlay.style.height, '32px');
  assert.equal(nodes.filter(function(node){ return node && node.className === 'aq-page-sheet'; }).length, 2);
  const masks = maskNodes.filter(function(node){ return node && node.className === 'aq-margin-mask'; });
  assert.equal(masks.length, 0, 'live ProseMirror flow should not render masks above text');
  assert.equal(maskLayer.style.display, 'none');

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
