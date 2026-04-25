const test = require('node:test');
const assert = require('node:assert/strict');

const bibliographyState = require('../src/bibliography-state.js');

function createContainer(html) {
  const store = { innerHTML: html };
  return {
    innerHTML: html,
    querySelectorAll(selector) {
      if (selector !== 'h1') return [];
      const matches = [...html.matchAll(/<h1>(.*?)<\/h1>/g)];
      return matches.map(match => ({
        textContent: match[1],
        nextSibling: null,
        insertAdjacentHTML(position, fragment) {
          if (position === 'afterend') {
            store.innerHTML = store.innerHTML.replace(match[0], match[0] + fragment);
            this.owner && (this.owner.innerHTML = store.innerHTML);
          }
        }
      }));
    },
    insertAdjacentHTML(position, fragment) {
      if (position === 'beforeend') {
        store.innerHTML += fragment;
        this.innerHTML = store.innerHTML;
      }
    }
  };
}

test('syncBibliographyHTML appends bibliography when missing', () => {
  const result = bibliographyState.syncBibliographyHTML('<p>Body</p>', [{ title: 'A' }], {
    formatRef: ref => ref.title,
    createContainer(html) {
      return {
        innerHTML: html,
        querySelectorAll() { return []; },
        insertAdjacentHTML(position, fragment) {
          if (position === 'beforeend') this.innerHTML += fragment;
        }
      };
    }
  });

  assert.equal(result, '<p>Body</p><h1>Kaynakça</h1><p class="refe" data-ref-id="" tabindex="0" role="button">A</p>');
});

test('syncBibliographyHTML keeps document unchanged when no refs and no bibliography heading', () => {
  const result = bibliographyState.syncBibliographyHTML('<p>Body</p>', [], {
    formatRef: ref => ref.title,
    createContainer(html) {
      return {
        innerHTML: html,
        querySelectorAll() { return []; },
        insertAdjacentHTML() {}
      };
    }
  });

  assert.equal(result, '<p>Body</p>');
});

test('getCurrentDocument returns active document record', () => {
  const doc = bibliographyState.getCurrentDocument([
    { id: 'a', title: 'One' },
    { id: 'b', title: 'Two' }
  ], 'b');

  assert.deepEqual(doc, { id: 'b', title: 'Two' });
});

test('getCurrentDocumentFromState resolves active document from state object', () => {
  const doc = bibliographyState.getCurrentDocumentFromState({
    docs: [
      { id: 'a', title: 'One' },
      { id: 'b', title: 'Two' }
    ]
  }, 'a');

  assert.deepEqual(doc, { id: 'a', title: 'One' });
});

test('resolveEditorRoot prefers surface api, then editor view, then host', () => {
  const host = { id: 'host' };
  const editorRoot = { id: 'editor-root' };
  const surfaceRoot = { id: 'surface-root' };

  assert.equal(
    bibliographyState.resolveEditorRoot({
      surfaceApi: {
        getEditorRoot(target) {
          assert.equal(target, host);
          return surfaceRoot;
        }
      },
      host,
      editor: { view: { dom: editorRoot } }
    }),
    surfaceRoot
  );

  assert.equal(
    bibliographyState.resolveEditorRoot({
      editor: { view: { dom: editorRoot } },
      host
    }),
    editorRoot
  );

  assert.equal(
    bibliographyState.resolveEditorRoot({ host }),
    host
  );
});

test('bindBibliographySurface persists manual bibliography edits', () => {
  const listeners = {};
  const doc = { id: 'doc-1', bibliographyHTML: '', bibliographyManual: false };
  const bodyEl = {
    innerHTML: '<h1>Kaynakça</h1><p>Manual</p>',
    textContent: 'Kaynakça Manual',
    setAttribute(name, value) {
      this[name] = value;
    },
    addEventListener(name, handler) {
      listeners[name] = handler;
    }
  };
  let saved = false;

  const bound = bibliographyState.bindBibliographySurface({
    bodyEl,
    getCurrentDocument() {
      return doc;
    },
    onChange() {
      saved = true;
    }
  });

  assert.equal(bound, true);
  listeners.input();
  assert.equal(doc.bibliographyHTML, '<h1>Kaynakça</h1><p>Manual</p>');
  assert.equal(doc.bibliographyManual, true);
  assert.equal(saved, true);
});

test('bindBibliographySurfaceForState resolves current document from state', () => {
  const listeners = {};
  const state = {
    docs: [{ id: 'doc-1', bibliographyHTML: '', bibliographyManual: false }]
  };
  const bodyEl = {
    innerHTML: '<p>Manual</p>',
    textContent: 'Manual',
    setAttribute() {},
    addEventListener(name, handler) {
      listeners[name] = handler;
    }
  };

  const bound = bibliographyState.bindBibliographySurfaceForState({
    state,
    currentDocId: 'doc-1',
    bodyEl
  });

  assert.equal(bound, true);
  listeners.input();
  assert.equal(state.docs[0].bibliographyHTML, '<p>Manual</p>');
  assert.equal(state.docs[0].bibliographyManual, true);
});

test('updateBibliographySection applies generated bibliography and updates document state', () => {
  const pageEl = { style: { display: 'none' } };
  const bodyEl = { innerHTML: '' };
  const doc = { id: 'doc-1', bibliographyHTML: '', bibliographyManual: false };
  let bound = false;

  const updated = bibliographyState.updateBibliographySection({
    refs: [{ title: 'A' }, { title: 'B' }],
    pageEl,
    bodyEl,
    doc,
    formatRef(ref) {
      return ref.title;
    },
    bindSurface() {
      bound = true;
    }
  });

  assert.equal(updated, true);
  assert.equal(bound, true);
  assert.equal(pageEl.style.display, 'block');
  assert.equal(bodyEl.innerHTML, '<h1>Kaynakça</h1><p class="refe" data-ref-id="" tabindex="0" role="button">A</p><p class="refe" data-ref-id="" tabindex="0" role="button">B</p>');
  assert.equal(doc.bibliographyHTML, '<h1>Kaynakça</h1><p class="refe" data-ref-id="" tabindex="0" role="button">A</p><p class="refe" data-ref-id="" tabindex="0" role="button">B</p>');
  assert.equal(doc.bibliographyManual, false);
});

test('updateBibliographySection invokes syncPageLayout after render', () => {
  const pageEl = { style: { display: 'none' } };
  const bodyEl = { innerHTML: '' };
  const doc = { id: 'doc-1', bibliographyHTML: '', bibliographyManual: false };
  const calls = [];

  bibliographyState.updateBibliographySection({
    refs: [{ title: 'A' }],
    pageEl,
    bodyEl,
    doc,
    formatRef(ref) {
      return ref.title;
    },
    syncPageLayout(payload) {
      calls.push(payload);
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].pageEl, pageEl);
  assert.equal(calls[0].bodyEl, bodyEl);
  assert.deepEqual(calls[0].refs.map(ref => ref.title), ['A']);
});

test('renderReferencePanel delegates used-reference rendering to citation api', () => {
  const calls = [];
  const listEl = { innerHTML: '' };

  const refs = bibliographyState.renderReferencePanel({
    editorRoot: { id: 'editor-root' },
    listEl,
    citationApi: {
      renderUsedReferenceList(editorRoot, el, deps) {
        calls.push([editorRoot, el, typeof deps.findReference, typeof deps.getInlineCitationText]);
        el.innerHTML = 'rendered';
        return [{ id: 'r1' }];
      }
    },
    findReference() { return null; },
    getInlineCitationText() { return ''; }
  });

  assert.deepEqual(refs, [{ id: 'r1' }]);
  assert.equal(listEl.innerHTML, 'rendered');
  assert.deepEqual(calls, [[{ id: 'editor-root' }, listEl, 'function', 'function']]);
});

test('syncBibliographyUI renders references and updates bibliography in one pass', () => {
  const pageEl = { style: { display: 'none' } };
  const bodyEl = { innerHTML: '' };
  const listEl = { innerHTML: '' };
  const doc = { id: 'doc-1', bibliographyHTML: '', bibliographyManual: false };

  const refs = bibliographyState.syncBibliographyUI({
    editorRoot: { id: 'editor-root' },
    listEl,
    pageEl,
    bodyEl,
    doc,
    citationApi: {
      renderUsedReferenceList(editorRoot, el) {
        el.innerHTML = 'refs-rendered';
        return [{ id: 'b', title: 'B' }, { id: 'a', title: 'A' }];
      }
    },
    dedupeReferences(list) {
      return list;
    },
    sortReferences(list) {
      return list.slice().sort((a, b) => a.id.localeCompare(b.id));
    },
    formatRef(ref) {
      return ref.title;
    }
  });

  assert.deepEqual(refs.map(ref => ref.id), ['a', 'b']);
  assert.equal(listEl.innerHTML, 'refs-rendered');
  assert.equal(pageEl.style.display, 'block');
  assert.equal(bodyEl.innerHTML, '<h1>Kaynakça</h1><p class="refe" data-ref-id="a" tabindex="0" role="button">A</p><p class="refe" data-ref-id="b" tabindex="0" role="button">B</p>');
});

test('syncReferenceViews can render panel only without touching bibliography body', () => {
  const listEl = { innerHTML: '' };
  const bodyEl = { innerHTML: 'keep' };

  const refs = bibliographyState.syncReferenceViews({
    editorRoot: { id: 'editor-root' },
    listEl,
    bodyEl,
    skipBibliography: true,
    citationApi: {
      renderUsedReferenceList(editorRoot, el) {
        el.innerHTML = 'panel-only';
        return [{ id: 'r2' }, { id: 'r1' }];
      }
    }
  });

  assert.deepEqual(refs.map(ref => ref.id), ['r2', 'r1']);
  assert.equal(listEl.innerHTML, 'panel-only');
  assert.equal(bodyEl.innerHTML, 'keep');
});

test('syncReferenceViews can render panel and bibliography together', () => {
  const pageEl = { style: { display: 'none' } };
  const bodyEl = { innerHTML: '' };
  const listEl = { innerHTML: '' };
  const doc = { bibliographyHTML: '', bibliographyManual: false };

  const refs = bibliographyState.syncReferenceViews({
    editorRoot: { id: 'editor-root' },
    listEl,
    pageEl,
    bodyEl,
    doc,
    citationApi: {
      renderUsedReferenceList(editorRoot, el) {
        el.innerHTML = 'views-rendered';
        return [{ id: 'b', title: 'B' }, { id: 'a', title: 'A' }];
      }
    },
    dedupeReferences(list) {
      return list;
    },
    sortReferences(list) {
      return list.slice().sort((a, b) => a.id.localeCompare(b.id));
    },
    formatRef(ref) {
      return ref.title;
    }
  });

  assert.deepEqual(refs.map(ref => ref.id), ['a', 'b']);
  assert.equal(listEl.innerHTML, 'views-rendered');
  assert.equal(pageEl.style.display, 'block');
  assert.equal(bodyEl.innerHTML, '<h1>Kaynakça</h1><p class="refe" data-ref-id="a" tabindex="0" role="button">A</p><p class="refe" data-ref-id="b" tabindex="0" role="button">B</p>');
});

test('syncReferenceViews keeps external bibliography refs on generated page', () => {
  const pageEl = { style: { display: 'none' } };
  const bodyEl = { innerHTML: '' };
  const listEl = { innerHTML: '' };
  const doc = { bibliographyHTML: '', bibliographyManual: false, bibliographyExtraRefIds: ['c'] };

  const refs = bibliographyState.syncReferenceViews({
    editorRoot: { id: 'editor-root' },
    listEl,
    pageEl,
    bodyEl,
    doc,
    citationApi: {
      renderUsedReferenceList(editorRoot, el) {
        el.innerHTML = 'views-rendered';
        return [{ id: 'b', title: 'B' }];
      }
    },
    getExtraReferences() {
      return [{ id: 'c', title: 'C' }];
    },
    dedupeReferences(list) {
      const seen = new Set();
      return list.filter((ref) => {
        if(seen.has(ref.id)) return false;
        seen.add(ref.id);
        return true;
      });
    },
    sortReferences(list) {
      return list.slice().sort((a, b) => a.id.localeCompare(b.id));
    },
    formatRef(ref) {
      return ref.title;
    }
  });

  assert.deepEqual(refs.map(ref => ref.id), ['b', 'c']);
  assert.equal(listEl.innerHTML, 'views-rendered');
  assert.equal(pageEl.style.display, 'block');
  assert.equal(bodyEl.innerHTML, '<h1>Kaynakça</h1><p class="refe" data-ref-id="b" tabindex="0" role="button">B</p><p class="refe" data-ref-id="c" tabindex="0" role="button">C</p>');
  assert.equal(doc.bibliographyManual, false);
});

test('syncReferenceViews creates bibliography page from external refs without inline citations', () => {
  const pageEl = { style: { display: 'none' } };
  const bodyEl = { innerHTML: '' };
  const listEl = { innerHTML: '' };
  const doc = { bibliographyHTML: '', bibliographyManual: false, bibliographyExtraRefIds: ['c'] };

  const refs = bibliographyState.syncReferenceViews({
    editorRoot: { id: 'editor-root' },
    listEl,
    pageEl,
    bodyEl,
    doc,
    citationApi: {
      renderUsedReferenceList(editorRoot, el) {
        el.innerHTML = 'no inline citations';
        return [];
      }
    },
    getExtraReferences() {
      return [{ id: 'c', title: 'Ciudad-Fernandez' }];
    },
    dedupeReferences(list) {
      return list;
    },
    sortReferences(list) {
      return list.slice().sort((a, b) => a.title.localeCompare(b.title));
    },
    formatRef(ref) {
      return ref.title;
    }
  });

  assert.deepEqual(refs.map(ref => ref.id), ['c']);
  assert.equal(listEl.innerHTML, 'no inline citations');
  assert.equal(pageEl.style.display, 'block');
  assert.equal(bodyEl.innerHTML, '<h1>Kaynakça</h1><p class="refe" data-ref-id="c" tabindex="0" role="button">Ciudad-Fernandez</p>');
  assert.equal(doc.bibliographyHTML, '<h1>Kaynakça</h1><p class="refe" data-ref-id="c" tabindex="0" role="button">Ciudad-Fernandez</p>');
});

test('syncReferenceViews re-sorts external bibliography refs when new citations are added', () => {
  const pageEl = { style: { display: 'none' } };
  const bodyEl = { innerHTML: '' };
  const listEl = { innerHTML: '' };
  const doc = {
    bibliographyHTML: '<h1>Kaynakça</h1><p class="refe">Ciudad</p>',
    bibliographyManual: true,
    bibliographyExtraRefIds: ['c']
  };

  const refs = bibliographyState.syncReferenceViews({
    editorRoot: { id: 'editor-root' },
    listEl,
    pageEl,
    bodyEl,
    doc,
    citationApi: {
      renderUsedReferenceList(editorRoot, el) {
        el.innerHTML = 'views-rendered';
        return [{ id: 'a', title: 'Barros' }];
      }
    },
    getExtraReferences() {
      return [{ id: 'c', title: 'Ciudad' }];
    },
    dedupeReferences(list) {
      const seen = new Set();
      return list.filter((ref) => {
        if(seen.has(ref.id)) return false;
        seen.add(ref.id);
        return true;
      });
    },
    sortReferences(list) {
      return list.slice().sort((a, b) => a.title.localeCompare(b.title));
    },
    formatRef(ref) {
      return ref.title;
    }
  });

  assert.deepEqual(refs.map(ref => ref.id), ['a', 'c']);
  assert.equal(bodyEl.innerHTML, '<h1>Kaynakça</h1><p class="refe" data-ref-id="a" tabindex="0" role="button">Barros</p><p class="refe" data-ref-id="c" tabindex="0" role="button">Ciudad</p>');
  assert.equal(doc.bibliographyHTML, '<h1>Kaynakça</h1><p class="refe" data-ref-id="a" tabindex="0" role="button">Barros</p><p class="refe" data-ref-id="c" tabindex="0" role="button">Ciudad</p>');
  assert.equal(doc.bibliographyManual, false);
});

test('syncReferenceViews forwards syncPageLayout callback', () => {
  const pageEl = { style: { display: 'none' } };
  const bodyEl = { innerHTML: '' };
  let syncLayoutCount = 0;

  bibliographyState.syncReferenceViews({
    editorRoot: { id: 'editor-root' },
    listEl: { innerHTML: '' },
    pageEl,
    bodyEl,
    doc: { bibliographyHTML: '', bibliographyManual: false },
    citationApi: {
      renderUsedReferenceList() {
        return [{ id: 'a', title: 'A' }];
      }
    },
    formatRef(ref) {
      return ref.title;
    },
    syncPageLayout() {
      syncLayoutCount += 1;
    }
  });

  assert.equal(syncLayoutCount, 1);
});

test('resetManualBibliography clears manual bibliography state', () => {
  const doc = { bibliographyHTML: '<p>Manual</p>', bibliographyManual: true };
  const reset = bibliographyState.resetManualBibliography(doc);

  assert.equal(reset, true);
  assert.equal(doc.bibliographyHTML, '');
  assert.equal(doc.bibliographyManual, false);
});

test('resetManualBibliographyForState clears active document manual state', () => {
  const state = {
    docs: [{ id: 'doc-1', bibliographyHTML: '<p>Manual</p>', bibliographyManual: true }]
  };
  const reset = bibliographyState.resetManualBibliographyForState(state, 'doc-1');

  assert.equal(reset, true);
  assert.equal(state.docs[0].bibliographyHTML, '');
  assert.equal(state.docs[0].bibliographyManual, false);
});

test('refreshManualBibliography uses syncReferenceViews with forceAuto', () => {
  const calls = [];
  const state = {
    docs: [{ id: 'doc-1', bibliographyHTML: '<p>Manual</p>', bibliographyManual: true }]
  };

  const refreshed = bibliographyState.refreshManualBibliography({
    state,
    currentDocId: 'doc-1',
    editorRoot: { id: 'editor-root' },
    listEl: { innerHTML: '' },
    pageEl: { style: { display: 'none' } },
    bodyEl: { innerHTML: '' },
    syncReferenceViews(options) {
      calls.push(options);
    }
  });

  assert.equal(refreshed, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].doc, state.docs[0]);
  assert.equal(calls[0].forceAuto, true);
});

test('openBibliographySection refreshes and scrolls to bibliography page', async () => {
  const calls = [];
  const deferred = [];
  const pageEl = {
    scrollIntoView(options) {
      calls.push(options);
    }
  };

  const opened = bibliographyState.openBibliographySection({
    pageEl,
    refreshBibliography() {
      calls.push('refresh');
    },
    defer(fn) {
      deferred.push(fn);
    }
  });

  assert.equal(opened, true);
  assert.deepEqual(calls, ['refresh']);
  assert.equal(deferred.length, 1);
  deferred[0]();
  assert.deepEqual(calls, ['refresh', { behavior: 'smooth', block: 'start' }]);
});

test('syncReferenceViewsForState resolves current document before syncing', () => {
  const state = {
    docs: [{ id: 'doc-1', bibliographyHTML: '', bibliographyManual: false }]
  };

  const refs = bibliographyState.syncReferenceViewsForState({
    state,
    currentDocId: 'doc-1',
    editorRoot: { id: 'editor-root' },
    citationApi: {
      renderUsedReferenceList() {
        return [{ id: 'r1' }];
      }
    },
    listEl: { innerHTML: '' },
    pageEl: { style: { display: 'none' } },
    bodyEl: { innerHTML: '' },
    formatRef(ref) {
      return ref.id;
    }
  });

  assert.deepEqual(refs, [{ id: 'r1' }]);
  assert.equal(state.docs[0].bibliographyHTML, '<h1>Kaynakça</h1><p class="refe" data-ref-id="r1" tabindex="0" role="button">r1</p>');
});

test('refreshManualBibliographyForState resolves active document automatically', () => {
  const calls = [];
  const state = {
    docs: [{ id: 'doc-1', bibliographyHTML: '<p>Manual</p>', bibliographyManual: true }]
  };

  const refreshed = bibliographyState.refreshManualBibliographyForState({
    state,
    currentDocId: 'doc-1',
    syncReferenceViews(options) {
      calls.push(options.doc);
    }
  });

  assert.equal(refreshed, true);
  assert.deepEqual(calls, [state.docs[0]]);
});

test('refreshManualBibliographyForState resolves editor root from surface context', () => {
  const calls = [];
  const state = {
    docs: [{ id: 'doc-1', bibliographyHTML: '<p>Manual</p>', bibliographyManual: true }]
  };
  const host = { id: 'host' };
  const surfaceRoot = { id: 'surface-root' };

  const refreshed = bibliographyState.refreshManualBibliographyForState({
    state,
    currentDocId: 'doc-1',
    host,
    surfaceApi: {
      getEditorRoot(target) {
        assert.equal(target, host);
        return surfaceRoot;
      }
    },
    syncReferenceViews(options) {
      calls.push(options.editorRoot);
    }
  });

  assert.equal(refreshed, true);
  assert.deepEqual(calls, [surfaceRoot]);
});

test('openBibliographySectionForState reuses resolved state context', () => {
  const state = {
    docs: [{ id: 'doc-1', bibliographyHTML: '', bibliographyManual: false }]
  };
  const calls = [];

  const opened = bibliographyState.openBibliographySectionForState({
    state,
    currentDocId: 'doc-1',
    pageEl: {
      scrollIntoView() {
        calls.push('scroll');
      }
    },
    refreshBibliography() {
      calls.push('refresh');
    },
    defer(fn) {
      fn();
    }
  });

  assert.equal(opened, true);
  assert.deepEqual(calls, ['refresh', 'scroll']);
});

test('openBibliographySectionForState can refresh through syncReferenceViews fallback', () => {
  const state = {
    docs: [{ id: 'doc-1', bibliographyHTML: '', bibliographyManual: false }]
  };
  const calls = [];

  const opened = bibliographyState.openBibliographySectionForState({
    state,
    currentDocId: 'doc-1',
    pageEl: {
      scrollIntoView() {
        calls.push('scroll');
      }
    },
    syncReferenceViews(options) {
      calls.push(options.doc.id);
    },
    defer(fn) {
      fn();
    }
  });

  assert.equal(opened, true);
  assert.deepEqual(calls, ['doc-1', 'scroll']);
});
