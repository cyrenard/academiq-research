const test = require('node:test');
const assert = require('node:assert/strict');

const docmod = require('../src/tiptap-word-document.js');

test('tiptap word document exports content helpers', () => {
  assert.equal(typeof docmod.buildImageHTML, 'function');
  assert.equal(typeof docmod.prepareExportSourceHTML, 'function');
  assert.equal(typeof docmod.stripExportOnlyArtifacts, 'function');
  assert.equal(typeof docmod.decorateExportLayout, 'function');
  assert.equal(typeof docmod.buildCleanExportHTML, 'function');
  assert.equal(typeof docmod.buildExportPDFHTML, 'function');
  assert.equal(typeof docmod.buildExportPreviewHTML, 'function');
  assert.equal(typeof docmod.buildExportDocHTML, 'function');
  assert.equal(typeof docmod.stripLegacyEditorArtifacts, 'function');
  assert.equal(typeof docmod.prepareLoadedHTML, 'function');
  assert.equal(typeof docmod.getEditorHTML, 'function');
  assert.equal(typeof docmod.setEditorHTML, 'function');
  assert.equal(typeof docmod.ensureEditableContent, 'function');
  assert.equal(typeof docmod.commitActiveDocument, 'function');
  assert.equal(typeof docmod.commitEditorDocument, 'function');
  assert.equal(typeof docmod.commitEditorDocumentWithState, 'function');
  assert.equal(typeof docmod.commitEditorDocumentFromContext, 'function');
  assert.equal(typeof docmod.setActiveDocument, 'function');
  assert.equal(typeof docmod.loadDocument, 'function');
  assert.equal(typeof docmod.loadEditorDocument, 'function');
  assert.equal(typeof docmod.loadEditorDocumentWithState, 'function');
  assert.equal(typeof docmod.loadEditorDocumentFromContext, 'function');
  assert.equal(typeof docmod.focusEditor, 'function');
  assert.equal(typeof docmod.insertHTML, 'function');
});

test('buildImageHTML and buildExportDocHTML include expected markers', () => {
  const image = docmod.buildImageHTML('data:test', 'örnek');
  const exportHtml = docmod.buildExportDocHTML('<p>Deneme</p>');
  const exportPdfHtml = docmod.buildExportPDFHTML('<p>Deneme</p>');
  const exportPreviewHtml = docmod.buildExportPreviewHTML('<p>Deneme</p>');

  assert.match(image, /<img/);
  assert.match(image, /alt=/);
  assert.match(exportHtml, /WordSection1/);
  assert.match(exportHtml, /Deneme/);
  assert.match(exportHtml, /p\[data-indent-mode="none"\]/);
  assert.match(exportPdfHtml, /aq-export-root/);
  assert.match(exportPdfHtml, /Content-Security-Policy/);
  assert.match(exportPreviewHtml, /aq-preview-page/);
});

test('stripExportOnlyArtifacts removes editor-only helper nodes', () => {
  const cleaned = docmod.stripExportOnlyArtifacts(
    '<p>Metin</p><div class="img-toolbar">x</div><div class="aq-page-sheet">y</div><p>Son</p>'
  );
  assert.equal(cleaned, '<p>Metin</p><p>Son</p>');
});

test('decorateExportLayout groups heading with following block and tags bibliography entries', () => {
  const html = docmod.decorateExportLayout(
    '<h2>Baslik</h2><p>Ilk paragraf</p><h2>Kaynakça</h2><p class="refe">Yazar, A. (2024).</p>'
  );
  assert.match(html, /aq-keep-group/);
  assert.match(html, /aq-keep-with-next/);
  assert.match(html, /aq-biblio-heading/);
  assert.match(html, /aq-ref-entry/);
});

test('stripLegacyEditorArtifacts removes old page wrappers and spacers', () => {
  const dirty = [
    '<div class="page-break">x</div>',
    '<div class="page-top-spacer">x</div>',
    '<div class="aq-page-sheet">x</div>',
    '<div class="page-break-overlay">x</div>',
    '<div class="page-number">1</div>',
    '<hr class="pg-spacer"/>',
    '<div class="pg-spacer">x</div>',
    '<p>Deneme</p>'
  ].join('');
  const clean = docmod.stripLegacyEditorArtifacts(dirty);
  assert.equal(clean, '<p>Deneme</p>');
});

test('prepareLoadedHTML strips legacy wrappers and falls back to blank html', () => {
  assert.equal(
    docmod.prepareLoadedHTML('<div class="page-break">x</div><p>Metin</p>', '<p></p>'),
    '<p>Metin</p>'
  );
  assert.equal(
    docmod.prepareLoadedHTML('', '<p></p>'),
    '<p></p>'
  );
});

test('getEditorHTML and setEditorHTML prefer editor then shell then host', () => {
  const editorCalls = [];
  const shellCalls = [];
  assert.equal(docmod.getEditorHTML({
    editor: { getHTML(){ return '<p>editor</p>'; } }
  }), '<p>editor</p>');

  assert.equal(docmod.getEditorHTML({
    shell: { getHTML(){ return '<p>shell</p>'; } }
  }), '<p>shell</p>');

  const host = { innerHTML:'<p>host</p>' };
  assert.equal(docmod.getEditorHTML({ host }), '<p>host</p>');

  assert.equal(docmod.setEditorHTML({
    editor: { commands:{ setContent(html){ editorCalls.push(html); } } },
    html: '<p>a</p>'
  }), true);
  assert.deepEqual(editorCalls, ['<p>a</p>']);

  assert.equal(docmod.setEditorHTML({
    shell: { setHTML(html){ shellCalls.push(html); } },
    html: '<p>b</p>'
  }), true);
  assert.deepEqual(shellCalls, ['<p>b</p>']);

  const host2 = { innerHTML:'' };
  assert.equal(docmod.setEditorHTML({ host:host2, html:'<p>c</p>' }), true);
  assert.equal(host2.innerHTML, '<p>c</p>');
});

test('ensureEditableContent normalizes effectively empty editor html', () => {
  const calls = [];
  const ok = docmod.ensureEditableContent({
    editor: {
      getHTML(){ return '<p><br></p>'; },
      commands: {
        setContent(html, emit){ calls.push([html, emit]); }
      }
    },
    sanitizeHTML(value){ return value; }
  });
  assert.equal(ok, true);
  assert.deepEqual(calls, [['<p></p>', false]]);
});

test('commitActiveDocument updates state through sanitize or commitState hook', () => {
  const state = {
    doc: '',
    docs: [{ id:'d1', content:'' }]
  };
  const html = docmod.commitActiveDocument({
    state,
    currentDocId:'d1',
    blankHTML:'<p></p>',
    getHTML(){ return '<p>x</p>'; },
    sanitizeHTML(value){ return String(value).replace('x', 'y'); }
  });
  assert.equal(html, '<p>y</p>');
  assert.equal(state.doc, '<p>y</p>');
  assert.equal(state.docs[0].content, '<p>y</p>');

  const viaHook = docmod.commitActiveDocument({
    state,
    currentDocId:'d1',
    blankHTML:'<p></p>',
    getHTML(){ return '<p>ignored</p>'; },
    commitState(targetState, nextHTML){
      targetState.doc = 'hooked';
      return nextHTML + '!';
    }
  });
  assert.equal(viaHook, '<p>ignored</p>!');
  assert.equal(state.doc, 'hooked');
});

test('commitEditorDocument returns blank html when switching or document state is unavailable', () => {
  assert.equal(docmod.commitEditorDocument({
    isSwitching: true,
    blankHTML: '<p></p>'
  }), '<p></p>');

  assert.equal(docmod.commitEditorDocument({
    state: { docs: [] },
    blankHTML: '<p></p>'
  }), '<p></p>');
});

test('commitEditorDocument delegates to commitActiveDocument flow', () => {
  const state = { doc:'', docs:[{ id:'d1', content:'' }] };
  const html = docmod.commitEditorDocument({
    state,
    currentDocId:'d1',
    blankHTML:'<p></p>',
    getHTML(){ return '<p>a</p>'; },
    sanitizeHTML(value){ return String(value).replace('a', 'b'); }
  });
  assert.equal(html, '<p>b</p>');
  assert.equal(state.doc, '<p>b</p>');
  assert.equal(state.docs[0].content, '<p>b</p>');
});

test('commitEditorDocumentWithState resolves commit hook from document state api', () => {
  const state = { doc:'', docs:[{ id:'d1', content:'' }] };
  const html = docmod.commitEditorDocumentWithState({
    state,
    currentDocId:'d1',
    blankHTML:'<p></p>',
    getHTML(){ return '<p>a</p>'; },
    documentStateApi: {
      commitActiveDoc(targetState, nextHTML) {
        targetState.doc = 'hooked';
        return nextHTML + '!';
      }
    }
  });

  assert.equal(html, '<p>a</p>!');
  assert.equal(state.doc, 'hooked');
});

test('commitEditorDocumentFromContext resolves html through editor context', () => {
  const state = { doc:'', docs:[{ id:'d1', content:'' }] };
  const html = docmod.commitEditorDocumentFromContext({
    state,
    currentDocId: 'd1',
    blankHTML() {
      return '<p></p>';
    },
    editor: {
      getHTML() {
        return '<p>a</p>';
      }
    },
    sanitizeHTML(value) {
      return String(value).replace('a', 'b');
    }
  });

  assert.equal(html, '<p>b</p>');
  assert.equal(state.doc, '<p>b</p>');
  assert.equal(state.docs[0].content, '<p>b</p>');
});

test('setActiveDocument sanitizes html and applies through editor or host', () => {
  const calls = [];
  const editor = {
    view: { dom:'pm-root' },
    commands: {
      setContent(html, emit){ calls.push(['editor', html, emit]); }
    }
  };
  const html = docmod.setActiveDocument({
    html:'<p>a</p>',
    sanitizeHTML(value){ return String(value).replace('a', 'b'); },
    editor,
    afterSet(target, appliedHTML){ calls.push(['after', target, appliedHTML]); }
  });
  assert.equal(html, '<p>b</p>');
  assert.deepEqual(calls, [
    ['editor', '<p>b</p>', false],
    ['after', 'pm-root', '<p>b</p>']
  ]);

  const host = { innerHTML:'' };
  const hostCalls = [];
  const html2 = docmod.setActiveDocument({
    html:'<p>c</p>',
    host,
    afterSet(target, appliedHTML){ hostCalls.push([target, appliedHTML]); }
  });
  assert.equal(html2, '<p>c</p>');
  assert.equal(host.innerHTML, '<p>c</p>');
  assert.deepEqual(hostCalls, [[host, '<p>c</p>']]);
});

test('loadDocument prepares html and delegates document load effects', () => {
  const calls = [];
  const editor = {
    view: { dom: 'pm-root' },
    commands: {
      setContent(html, emit) {
        calls.push(['setContent', html, emit]);
      }
    }
  };

  const result = docmod.loadDocument({
    html: '<div class="page-break">x</div><p>a</p>',
    blankHTML: '<p></p>',
    editor,
    sanitizeHTML(value) {
      return String(value).replace('a', 'b');
    },
    beforeSet(html) {
      calls.push(['beforeSet', html]);
    },
    beforeApply() {
      calls.push(['beforeApply']);
    },
    runLoadEffects(opts) {
      calls.push(['runLoadEffects', opts.target, opts.html, opts.focusToEnd, opts.focusSurface]);
      if (typeof opts.beforeApply === 'function') opts.beforeApply();
      if (typeof opts.afterLayout === 'function') opts.afterLayout();
    },
    focusAtEnd: true,
    focusToEndFn() {
      calls.push(['focusToEnd']);
    },
    afterLayout() {
      calls.push(['afterLayout']);
    }
  });

  assert.equal(result, '<p>b</p>');
  assert.deepEqual(calls, [
    ['beforeSet', '<p>a</p>'],
    ['setContent', '<p>b</p>', false],
    ['runLoadEffects', 'pm-root', '<p>b</p>', true, false],
    ['beforeApply'],
    ['afterLayout']
  ]);
});

test('loadDocument uses fallback finalize chain when runtime hook is absent', () => {
  const calls = [];
  const host = { innerHTML: '' };

  const result = docmod.loadDocument({
    html: '<p>x</p>',
    blankHTML: '<p></p>',
    host,
    beforeApply() {
      calls.push(['beforeApply']);
    },
    normalize(target) {
      calls.push(['normalize', target]);
    },
    syncRefs() {
      calls.push(['syncRefs']);
    },
    syncChrome() {
      calls.push(['syncChrome']);
    },
    syncLayout() {
      calls.push(['syncLayout']);
    },
    afterLayout() {
      calls.push(['afterLayout']);
    }
  });

  assert.equal(result, '<p>x</p>');
  assert.equal(host.innerHTML, '<p>x</p>');
  assert.deepEqual(calls, [
    ['beforeApply'],
    ['normalize', host],
    ['syncRefs'],
    ['syncChrome'],
    ['syncLayout'],
    ['afterLayout']
  ]);
});

test('loadEditorDocument delegates high-level orchestration to loadDocument', () => {
  const calls = [];
  const editor = {
    view: { dom: 'pm-root' },
    commands: {
      setContent(html, emit) {
        calls.push(['setContent', html, emit]);
      }
    }
  };

  const result = docmod.loadEditorDocument({
    html: '<div class="page-break">x</div><p>a</p>',
    blankHTML: '<p></p>',
    sanitizeHTML(value) {
      return String(value).replace('a', 'b');
    },
    editor,
    beforeSet(html) {
      calls.push(['beforeSet', html]);
    },
    beforeApply() {
      calls.push(['beforeApply']);
    },
    runLoadEffects(opts) {
      calls.push(['runLoadEffects', opts.target, opts.html, opts.focusToEnd]);
      if (typeof opts.beforeApply === 'function') opts.beforeApply();
      if (typeof opts.afterLayout === 'function') opts.afterLayout();
    },
    focusAtEnd: true,
    afterLayout() {
      calls.push(['afterLayout']);
    }
  });

  assert.equal(result, '<p>b</p>');
  assert.deepEqual(calls, [
    ['beforeSet', '<p>a</p>'],
    ['setContent', '<p>b</p>', false],
    ['runLoadEffects', 'pm-root', '<p>b</p>', true],
    ['beforeApply'],
    ['afterLayout']
  ]);
});

test('loadEditorDocumentWithState resolves runtime hook and delegates load flow', () => {
  const calls = [];
  const editor = {
    view: { dom: 'pm-root' },
    commands: {
      setContent(html, emit) {
        calls.push(['setContent', html, emit]);
      }
    }
  };

  const result = docmod.loadEditorDocumentWithState({
    html: '<p>a</p>',
    blankHTML: '<p></p>',
    editor,
    runtimeApi: {
      runDocumentLoadEffects(opts) {
        calls.push(['runLoadEffects', opts.target, opts.html, opts.focusToEnd]);
        if (typeof opts.beforeApply === 'function') opts.beforeApply();
        if (typeof opts.afterLayout === 'function') opts.afterLayout();
      }
    },
    beforeSet() {
      calls.push(['beforeSet']);
    },
    beforeApply() {
      calls.push(['beforeApply']);
    },
    focusAtEnd: true,
    afterLayout() {
      calls.push(['afterLayout']);
    }
  });

  assert.equal(result, '<p>a</p>');
  assert.deepEqual(calls, [
    ['beforeSet'],
    ['setContent', '<p>a</p>', false],
    ['runLoadEffects', 'pm-root', '<p>a</p>', true],
    ['beforeApply'],
    ['afterLayout']
  ]);
});

test('loadEditorDocumentFromContext manages switching and suppress-save flags', () => {
  const calls = [];
  const editor = {
    view: { dom: 'pm-root' },
    commands: {
      setContent(html, emit) {
        calls.push(['setContent', html, emit]);
      }
    }
  };

  const result = docmod.loadEditorDocumentFromContext({
    html: '<p>a</p>',
    blankHTML() {
      return '<p></p>';
    },
    editor,
    runtimeApi: {
      runDocumentLoadEffects(opts) {
        calls.push(['runLoadEffects', opts.target, opts.html, opts.focusToEnd]);
        if(typeof opts.beforeApply === 'function') opts.beforeApply();
        if(typeof opts.afterLayout === 'function') opts.afterLayout();
      }
    },
    setSwitching(value) {
      calls.push(['switch', value]);
    },
    setSuppressSave(value) {
      calls.push(['suppress', value]);
    },
    ensureEditableRoot() {
      calls.push(['ensure']);
    },
    focusAtEnd: true,
    afterLayout() {
      calls.push(['afterLayout']);
    }
  });

  assert.equal(result, '<p>a</p>');
  assert.deepEqual(calls, [
    ['switch', true],
    ['suppress', true],
    ['setContent', '<p>a</p>', false],
    ['runLoadEffects', 'pm-root', '<p>a</p>', true],
    ['suppress', false],
    ['switch', false],
    ['ensure'],
    ['afterLayout']
  ]);
});

test('loadEditorDocumentFromContext ignores stale async load callbacks', () => {
  const calls = [];
  const pending = [];
  const editor = {
    view: { dom: 'pm-root' },
    commands: {
      setContent(html, emit) {
        calls.push(['setContent', html, emit]);
      }
    }
  };

  function load(label, html) {
    return docmod.loadEditorDocumentFromContext({
      html,
      blankHTML() {
        return '<p></p>';
      },
      editor,
      runtimeApi: {
        runDocumentLoadEffects(opts) {
          calls.push(['runLoadEffects', opts.html, opts.token]);
          pending.push(opts);
        }
      },
      setSwitching(value) {
        calls.push(['switch', value]);
      },
      setSuppressSave(value) {
        calls.push(['suppress', value]);
      },
      ensureEditableRoot() {
        calls.push(['ensure', label]);
      },
      afterLayout() {
        calls.push(['afterLayout', label]);
      }
    });
  }

  load('A', '<p>a</p>');
  load('B', '<p>b</p>');

  assert.equal(pending.length, 2);
  assert.notEqual(pending[0].token, pending[1].token);
  assert.equal(typeof pending[0].isTokenActive, 'function');

  if(typeof pending[1].beforeApply === 'function') pending[1].beforeApply();
  if(typeof pending[1].afterLayout === 'function') pending[1].afterLayout();
  if(typeof pending[0].beforeApply === 'function') pending[0].beforeApply();
  if(typeof pending[0].afterLayout === 'function') pending[0].afterLayout();

  const firstToken = pending[0].token;
  const secondToken = pending[1].token;
  assert.deepEqual(calls, [
    ['switch', true],
    ['suppress', true],
    ['setContent', '<p>a</p>', false],
    ['runLoadEffects', '<p>a</p>', firstToken],
    ['switch', true],
    ['suppress', true],
    ['setContent', '<p>b</p>', false],
    ['runLoadEffects', '<p>b</p>', secondToken],
    ['suppress', false],
    ['switch', false],
    ['ensure', 'B'],
    ['afterLayout', 'B']
  ]);
});
