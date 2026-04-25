const test = require('node:test');
const assert = require('node:assert/strict');

const layout = require('../src/tiptap-word-layout.js');
const citation = require('../src/tiptap-word-citation.js');

function makeBlock(height, tag) {
  return {
    offsetHeight: height,
    scrollHeight: height,
    nodeName: tag || 'P',
    classList: {
      add() {},
      remove() {},
      contains() { return false; }
    },
    style: {
      setProperty() {},
      removeProperty() {}
    },
    getBoundingClientRect() {
      return { height };
    }
  };
}

test('large document layout sync is deterministic across repeated runs', () => {
  let gapCss = '';
  let gapWrites = 0;
  let sheetClears = 0;
  let maskClears = 0;
  const appended = [];
  const gapStyle = {};
  Object.defineProperty(gapStyle, 'textContent', {
    get() { return gapCss; },
    set(value) { gapWrites += 1; gapCss = value; }
  });

  globalThis.document = {
    createElement() {
      return {
        id: '',
        className: '',
        textContent: '',
        style: {},
        remove() {}
      };
    },
    getElementById(id) {
      if (id === 'aq-page-gap-style') return gapStyle;
      if (id === 'aq-mask-layer') {
        return {
          set innerHTML(_value) { maskClears += 1; },
          get innerHTML() { return ''; },
          appendChild(node) { appended.push(node); }
        };
      }
      return null;
    }
  };

  try {
    const host = {
      set innerHTML(_value) { sheetClears += 1; },
      get innerHTML() { return ''; },
      appendChild(node) { appended.push(node); }
    };
    const page = {
      style: {},
      querySelector(selector) {
        return (typeof selector === 'string' && selector.indexOf('#apapage-bg') !== -1) ? host : null;
      },
      querySelectorAll() {
        return [];
      },
      appendChild(node) {
        appended.push(node);
      }
    };
    const blocks = Array.from({ length: 520 }, (_, index) => {
      if (index > 0 && index % 45 === 0) return makeBlock(42, 'H2');
      return makeBlock(index % 9 === 0 ? 48 : 34, 'P');
    });
    const editorDom = {
      ownerDocument: globalThis.document,
      querySelectorAll() { return []; },
      children: blocks,
      scrollHeight: blocks.reduce((sum, block) => sum + block.offsetHeight, 0),
      offsetHeight: blocks.reduce((sum, block) => sum + block.offsetHeight, 0)
    };
    const options = {
      page,
      editorDom,
      scrollEl: { clientHeight: 720 },
      showPageNumbers: true,
      pageContentHeight: 931,
      pageHeight: 1123,
      pageGap: 32,
      pageTotalHeight: 1155,
      pageVerticalPadding: 192
    };

    const firstPageCount = layout.syncPageMetrics(options);
    const firstCss = gapCss;
    const firstGapWrites = gapWrites;
    const secondPageCount = layout.syncPageMetrics(options);

    assert.equal(firstPageCount, secondPageCount);
    assert.equal(firstPageCount > 10, true, 'fixture should exercise multi-page layout');
    assert.equal(gapCss, firstCss);
    assert.equal(gapWrites, firstGapWrites, 'unchanged large layout should not rewrite gap CSS');
    assert.equal(sheetClears, 2, 'presentation sheets can refresh, but document semantics stay stable');
    assert.equal(maskClears, 2, 'margin masks can refresh without changing editor content');
    assert.equal(String(page.style.minHeight || '').endsWith('px'), true);
  } finally {
    delete globalThis.document;
  }
});

test('large citation collection remains deterministic and duplicate-safe', () => {
  const refsById = new Map();
  for (let i = 0; i < 120; i += 1) {
    refsById.set(`r${i}`, { id: `r${i}`, title: `Reference ${i}` });
  }
  const nodes = Array.from({ length: 900 }, (_, index) => ({
    dataset: {
      ref: `r${index % 120}, r${(index + 7) % 120}`
    }
  }));

  const refs = citation.collectUsedReferences({
    querySelectorAll(selector) {
      return selector === '.cit' ? nodes : [];
    }
  }, {
    findReference(id) {
      return refsById.get(id) || null;
    },
    dedupeReferences(items) {
      const seen = new Set();
      return items.filter((item) => {
        if (!item || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    },
    sortReferences(items) {
      return items.slice().sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    }
  });

  assert.equal(refs.length, 120);
  assert.equal(refs[0].id, 'r0');
  assert.equal(refs[refs.length - 1].id, 'r119');
  assert.deepEqual(new Set(refs.map((ref) => ref.id)).size, refs.length);
});
