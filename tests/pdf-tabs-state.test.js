const test = require('node:test');
const assert = require('node:assert/strict');

const pdfTabsState = require('../src/pdf-tabs-state.js');

test('addPdfTab creates a new active tab with workspace scoping', function(){
  const next = pdfTabsState.addPdfTab({
    tabs: [],
    activeTabId: null
  }, {
    title: 'A very long PDF title that should be trimmed down',
    pdfData: 'buf',
    refId: 'r1',
    workspaceId: 'ws1'
  }, {
    createTabId(){ return 'tab_1'; },
    getReferenceAnnots(){ return [{ page:1 }]; }
  });

  assert.equal(next.activeTabId, 'tab_1');
  assert.equal(next.tabs.length, 1);
  assert.equal(next.tabs[0].title, 'A very long PDF title that should be tri');
  assert.deepEqual(next.tabs[0].annots, [{ page:1 }]);
});

test('addPdfTab switches to existing ref tab instead of duplicating', function(){
  const next = pdfTabsState.addPdfTab({
    tabs: [{ id:'tab_1', refId:'r1', title:'PDF' }],
    activeTabId: null
  }, {
    title: 'PDF',
    pdfData: 'buf',
    refId: 'r1',
    workspaceId: 'ws1'
  }, {});

  assert.equal(next.action, 'switch-existing');
  assert.equal(next.tabs.length, 1);
  assert.equal(next.activeTabId, 'tab_1');
});

test('saveActiveTabState updates only active tab snapshot fields', function(){
  const next = pdfTabsState.saveActiveTabState({
    tabs: [{ id:'tab_1', scrollPos:0, hlData:[], annots:[] }, { id:'tab_2', scrollPos:5 }],
    activeTabId: 'tab_1'
  }, {
    scrollPos: 42,
    hlData: [{ page:1 }],
    annots: [{ text:'x' }]
  });

  assert.equal(next.tabs[0].scrollPos, 42);
  assert.deepEqual(next.tabs[0].hlData, [{ page:1 }]);
  assert.deepEqual(next.tabs[0].annots, [{ text:'x' }]);
  assert.equal(next.tabs[1].scrollPos, 5);
});

test('saveActiveTabState persists OCR cache and per-page OCR metadata', function(){
  const next = pdfTabsState.saveActiveTabState({
    tabs: [{ id:'tab_1', scrollPos:0, hlData:[], annots:[] }],
    activeTabId: 'tab_1'
  }, {
    ocrPageItems: {
      '1': [{ str: 'OCR text' }]
    },
    ocrPageMeta: {
      '1': { status: 'success', attempts: 1, failures: 0, lastError: '', updatedAt: 10 },
      '2': { status: 'failed', attempts: 2, failures: 2, lastError: 'ai_timeout', updatedAt: 20 }
    },
    ocrLastAt: 123456
  });

  assert.deepEqual(next.tabs[0].ocrPageItems, { '1': [{ str: 'OCR text' }] });
  assert.deepEqual(next.tabs[0].ocrPageMeta, {
    '1': { status: 'success', attempts: 1, failures: 0, lastError: '', updatedAt: 10 },
    '2': { status: 'failed', attempts: 2, failures: 2, lastError: 'ai_timeout', updatedAt: 20 }
  });
  assert.equal(next.tabs[0].ocrLastAt, 123456);
});

test('switchPdfTab returns OCR fields from existing tab clone', function(){
  const next = pdfTabsState.switchPdfTab({
    tabs: [
      { id:'tab_1', title:'Alpha', ocrPageItems:{ '3': [{ str:'x' }] }, ocrPageMeta:{ '3': { status:'success', attempts:1, failures:0, lastError:'', updatedAt:1 } }, ocrLastAt: 77 }
    ],
    activeTabId: null
  }, 'tab_1');

  assert.equal(next.activeTabId, 'tab_1');
  assert.deepEqual(next.activeTab.ocrPageItems, { '3': [{ str:'x' }] });
  assert.deepEqual(next.activeTab.ocrPageMeta, {
    '3': { status:'success', attempts:1, failures:0, lastError:'', updatedAt:1 }
  });
  assert.equal(next.activeTab.ocrLastAt, 77);
});

test('closePdfTab selects first workspace tab when active closes', function(){
  const next = pdfTabsState.closePdfTab({
    tabs: [
      { id:'tab_1', wsId:'ws1' },
      { id:'tab_2', wsId:'ws1' },
      { id:'tab_3', wsId:'ws2' }
    ],
    activeTabId: 'tab_1',
    workspaceId: 'ws1'
  }, 'tab_1');

  assert.equal(next.action, 'closed-active-switch');
  assert.equal(next.nextTabId, 'tab_2');
  assert.equal(next.workspaceTabs.length, 1);
});

test('switchWorkspaceTabs clears active tab when workspace has none', function(){
  const next = pdfTabsState.switchWorkspaceTabs({
    tabs: [{ id:'tab_1', wsId:'ws2' }],
    activeTabId: 'tab_1',
    workspaceId: 'ws1'
  });

  assert.equal(next.action, 'clear');
  assert.equal(next.activeTabId, null);
  assert.equal(next.nextTabId, null);
});
