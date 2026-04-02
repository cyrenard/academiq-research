const test = require('node:test');
const assert = require('node:assert/strict');

const content = require('../src/tiptap-word-content.js');

test('tiptap word content exports core actions', () => {
  assert.equal(typeof content.getEditorHTML, 'function');
  assert.equal(typeof content.setEditorHTML, 'function');
  assert.equal(typeof content.runMutationEffects, 'function');
  assert.equal(typeof content.applyEditorHTML, 'function');
  assert.equal(typeof content.insertHTML, 'function');
  assert.equal(typeof content.insertEditorHTML, 'function');
  assert.equal(typeof content.insertEditorHTMLWithState, 'function');
  assert.equal(typeof content.insertEditorHTMLWithBridge, 'function');
  assert.equal(typeof content.insertGeneratedHTML, 'function');
  assert.equal(typeof content.buildFallbackBlockHTML, 'function');
  assert.equal(typeof content.resolveBuiltBlockHTML, 'function');
  assert.equal(typeof content.applyTemplate, 'function');
  assert.equal(typeof content.applyTemplateByType, 'function');
  assert.equal(typeof content.applyTemplateByTypeWithBridge, 'function');
  assert.equal(typeof content.buildFallbackCoverHTML, 'function');
  assert.equal(typeof content.insertCoverDocument, 'function');
  assert.equal(typeof content.insertCoverFromForm, 'function');
  assert.equal(typeof content.insertCoverFromFields, 'function');
  assert.equal(typeof content.insertCover, 'function');
  assert.equal(typeof content.insertImageFromEvent, 'function');
  assert.equal(typeof content.insertImageFile, 'function');
  assert.equal(typeof content.insertImageWithState, 'function');
  assert.equal(typeof content.insertImage, 'function');
  assert.equal(typeof content.insertCommandBuiltBlock, 'function');
  assert.equal(typeof content.insertCommandBuiltBlockWithBridge, 'function');
});

test('getEditorHTML and setEditorHTML delegate through document api when present', () => {
  const calls = [];
  const html = content.getEditorHTML({
    documentApi: {
      getEditorHTML(opts) {
        calls.push(['get', !!opts.editor, !!opts.shell, !!opts.host]);
        return '<p>doc-api</p>';
      }
    },
    editor: {},
    shell: {},
    host: {}
  });

  const ok = content.setEditorHTML({
    documentApi: {
      setEditorHTML(opts) {
        calls.push(['set', opts.html]);
        return true;
      }
    },
    html: '<p>x</p>'
  });

  assert.equal(html, '<p>doc-api</p>');
  assert.equal(ok, true);
  assert.deepEqual(calls, [
    ['get', true, true, true],
    ['set', '<p>x</p>']
  ]);
});

test('applyEditorHTML runs normalize and layout after editor setContent', async () => {
  const calls = [];
  const ok = content.applyEditorHTML({
    editor: {
      commands: {
        setContent(html, emit){ calls.push(['setContent', html, emit]); }
      }
    },
    html: '<p>x</p>',
    normalizeCitationSpans(){ calls.push(['normalize']); },
    updatePageHeight(){ calls.push(['layout']); },
    onApplied(){ calls.push(['applied']); },
    afterLayout(){ calls.push(['after']); }
  });
  assert.equal(ok, true);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(calls, [
    ['setContent', '<p>x</p>', false],
    ['normalize'],
    ['layout'],
    ['applied'],
    ['after']
  ]);
});

test('applyTemplate uses runtime-driven mutation effects when available', async () => {
  const calls = [];
  global.window = {
    suppressDocSave: false,
    AQEditorRuntime: {
      runContentApplyEffects(opts){
        calls.push(['effects', !!opts.syncChrome, !!opts.syncTOC, !!opts.syncRefs]);
        if(typeof opts.onApplied === 'function') opts.onApplied();
      }
    }
  };
  try{
    const ok = content.applyTemplate({
      editor: {
        commands: {
          setContent(html, emit){ calls.push(['setContent', html, emit]); },
          focus(where){ calls.push(['focus', where]); }
        },
        setEditable(flag){ calls.push(['editable', flag]); }
      },
      html: '<p>deneme</p>',
      ensureEditableRoot(){ calls.push(['ensure']); }
    });
    assert.equal(ok, true);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(calls, [
      ['editable', true],
      ['setContent', '<p>deneme</p>', false],
      ['effects', true, true, true],
      ['ensure'],
      ['focus', 'end']
    ]);
  } finally {
    delete global.window;
  }
});

test('insertImage fallback uses runtime effects after DOM insert', () => {
  const calls = [];
  global.window = {
    AQEditorRuntime: {
      runContentApplyEffects(opts){
        calls.push(['effects', opts.target, !!opts.normalize, !!opts.layout, !!opts.syncChrome]);
      }
    },
    AQTipTapWordDocument: {
      insertHTML(options){
        options.afterDomInsert('host-el');
        return true;
      }
    }
  };
  try{
    const ok = content.insertImage({
      editor: null,
      html: '<p><img /></p>'
    });
    assert.equal(ok, true);
    assert.deepEqual(calls, [
      ['effects', 'host-el', true, true, true]
    ]);
  } finally {
    delete global.window;
  }
});

test('insertEditorHTML composes insertHTML with mutation effects', () => {
  const calls = [];
  global.window = {
    AQEditorRuntime: {
      runContentApplyEffects(opts){
        calls.push(['effects', opts.target, !!opts.normalize, !!opts.layout, !!opts.syncChrome, !!opts.syncTOC, !!opts.syncRefs]);
      }
    },
    AQTipTapWordDocument: {
      insertHTML(options){
        calls.push(['ensure']);
        if(typeof options.beforeEditorInsert === 'function') options.beforeEditorInsert();
        if(typeof options.afterEditorInsert === 'function') options.afterEditorInsert();
        return true;
      }
    }
  };
  try{
    const ok = content.insertEditorHTML({
      editor: { view:{ dom:'pm-root' } },
      html: '<p>x</p>',
      ensureEditableRoot(){ calls.push(['editable']); }
    });
    assert.equal(ok, true);
    assert.deepEqual(calls, [
      ['ensure'],
      ['editable'],
      ['effects', 'pm-root', true, true, true, true, true]
    ]);
  } finally {
    delete global.window;
  }
});

test('insertEditorHTMLWithState composes saved range accessors', () => {
  const calls = [];
  let savedRange = 'old';
  global.window = {
    AQTipTapWordDocument: {
      insertHTML(options){
        calls.push(['saved-before', options.savedRangeRef.current]);
        options.savedRangeRef.current = 'new';
        if(typeof options.beforeEditorInsert === 'function') options.beforeEditorInsert();
        return true;
      }
    }
  };
  try{
    const ok = content.insertEditorHTMLWithState({
      html: '<p>x</p>',
      getSavedRange() {
        return savedRange;
      },
      setSavedRange(value) {
        savedRange = value;
      },
      ensureEditableRoot() {
        calls.push(['ensure']);
      }
    });
    assert.equal(ok, true);
    assert.deepEqual(calls, [
      ['saved-before', 'old'],
      ['ensure']
    ]);
    assert.equal(savedRange, 'new');
  } finally {
    delete global.window;
  }
});

test('insertEditorHTMLWithBridge uses bridge ensure and mutation helpers', () => {
  const calls = [];
  let savedRange = 'old';
  global.window = {
    AQTipTapWordDocument: {
      insertHTML(options){
        calls.push(['saved-before', options.savedRangeRef.current]);
        if(typeof options.beforeEditorInsert === 'function') options.beforeEditorInsert();
        if(typeof options.afterEditorInsert === 'function') options.afterEditorInsert();
        return true;
      }
    }
  };
  try{
    const ok = content.insertEditorHTMLWithBridge({
      editor: { view:{ dom:'pm-root' } },
      html: '<p>x</p>',
      documentApi: { id: 'doc-api' },
      bridgeApi: {
        ensureEditableRoot(opts){
          calls.push(['ensure', opts.documentApi.id, !!opts.editor]);
          return true;
        },
        runEditorMutationEffects(opts){
          calls.push(['effects', opts.target, !!opts.syncChrome, !!opts.syncTOC, !!opts.syncRefs]);
          return true;
        }
      },
      getSavedRange() {
        return savedRange;
      },
      setSavedRange(value) {
        savedRange = value;
      }
    });
    assert.equal(ok, true);
    assert.deepEqual(calls, [
      ['saved-before', 'old'],
      ['ensure', 'doc-api', true],
      ['effects', 'pm-root', true, true, true]
    ]);
  } finally {
    delete global.window;
  }
});

test('insertGeneratedHTML delegates through saved-range insertion helper', () => {
  const calls = [];
  global.window = {
    AQTipTapWordDocument: {
      insertHTML(options) {
        calls.push(['html', options.html]);
        if(typeof options.beforeEditorInsert === 'function') options.beforeEditorInsert();
        return true;
      }
    }
  };
  try {
    const ok = content.insertGeneratedHTML({
      html: '<p>generated</p>',
      ensureEditableRoot() {
        calls.push(['ensure']);
      }
    });
    assert.equal(ok, true);
    assert.deepEqual(calls, [
      ['html', '<p>generated</p>'],
      ['ensure']
    ]);
  } finally {
    delete global.window;
  }
});

test('buildFallbackBlockHTML and resolveBuiltBlockHTML provide default block markup', () => {
  assert.match(content.buildFallbackBlockHTML('buildAbstractHTML'), /Abstract/);
  assert.match(content.buildFallbackBlockHTML('buildBlockquoteHTML'), /blockquote/i);
  assert.match(content.buildFallbackBlockHTML('buildFigureHTML', ['2', 'Baslik']), /2/);
  assert.match(content.buildFallbackBlockHTML('buildTableHTML', { number:'3', cols:2, rows:3, title:'Baslik' }), /Tablo 3/);

  const resolved = content.resolveBuiltBlockHTML({
    builderName: 'buildFigureHTML',
    builderArgs: ['4', 'Sekil'],
    commandsApi: null
  });
  assert.match(resolved, /4/);
  assert.match(resolved, /Sekil/);
});

test('applyEditorHTML uses bridge setter when editor is absent', async () => {
  const calls = [];
  const ok = content.applyEditorHTML({
    documentApi: {
      setEditorHTML(opts) {
        calls.push(['set', opts.html]);
        return true;
      }
    },
    host: { innerHTML: '' },
    html: '<p>host</p>',
    syncChrome: true,
    onApplied() {
      calls.push(['applied']);
    },
    afterLayout() {
      calls.push(['after']);
    }
  });

  assert.equal(ok, true);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(calls, [
    ['set', '<p>host</p>'],
    ['applied'],
    ['after']
  ]);
});

test('applyTemplateByType resolves template html before applying', async () => {
  const calls = [];
  global.window = {
    suppressDocSave: false
  };
  try{
    const ok = content.applyTemplateByType({
      type: 'tez',
      confirmFn() {
        calls.push(['confirm']);
        return true;
      },
      templatesApi: {
        getTemplate(type) {
          calls.push(['template', type]);
          return '<p>tez</p>';
        }
      },
      editor: {
        commands: {
          setContent(html, emit){ calls.push(['setContent', html, emit]); },
          focus(where){ calls.push(['focus', where]); }
        },
        setEditable(flag){ calls.push(['editable', flag]); }
      },
      ensureEditableRoot(){ calls.push(['ensure']); }
    });
    assert.equal(ok, true);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(calls, [
      ['confirm'],
      ['template', 'tez'],
      ['editable', true],
      ['setContent', '<p>tez</p>', false],
      ['ensure'],
      ['focus', 'end']
    ]);
  } finally {
    delete global.window;
  }
});

test('applyTemplateByTypeWithBridge uses bridge ensureEditableRoot hook', async () => {
  const calls = [];
  global.window = {
    suppressDocSave: false
  };
  try{
    const ok = content.applyTemplateByTypeWithBridge({
      type: 'tez',
      confirmFn() {
        calls.push(['confirm']);
        return true;
      },
      templatesApi: {
        getTemplate(type) {
          calls.push(['template', type]);
          return '<p>tez</p>';
        }
      },
      bridgeApi: {
        ensureEditableRoot(opts) {
          calls.push(['ensure', !!opts.editor, typeof opts.sanitizeHTML]);
          return true;
        }
      },
      documentApi: { id: 'doc-api' },
      sanitizeHTML(value) {
        return value;
      },
      editor: {
        commands: {
          setContent(html, emit){ calls.push(['setContent', html, emit]); },
          focus(where){ calls.push(['focus', where]); }
        },
        setEditable(flag){ calls.push(['editable', flag]); }
      }
    });
    assert.equal(ok, true);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(calls, [
      ['confirm'],
      ['template', 'tez'],
      ['editable', true],
      ['setContent', '<p>tez</p>', false],
      ['ensure', true, 'function'],
      ['focus', 'end']
    ]);
  } finally {
    delete global.window;
  }
});

test('insertCoverFromFields resolves cover html and delegates insert', () => {
  const calls = [];
  global.window = {
    AQEditorRuntime: {
      runContentApplyEffects(opts) {
        calls.push(['effects', !!opts.layout, !!opts.syncChrome]);
      }
    }
  };
  try {
    const ok = content.insertCoverFromFields({
      templatesApi: {
        buildCoverHTML(options) {
          calls.push(['template', options.title, options.author]);
          return '<p>cover</p>';
        }
      },
      title: 'Baslik',
      author: 'Yazar',
      editor: {
        commands: {
          insertContentAt(pos, html) {
            calls.push(['insert', pos, html]);
          }
        }
      }
    });
    assert.equal(ok, true);
    assert.deepEqual(calls, [
      ['template', 'Baslik', 'Yazar'],
      ['insert', 0, '<p>cover</p>'],
      ['effects', true, true]
    ]);
  } finally {
    delete global.window;
  }
});

test('insertCoverDocument builds fallback cover html when needed', () => {
  const calls = [];
  global.window = {
    AQEditorRuntime: {
      runContentApplyEffects() {
        calls.push(['effects']);
      }
    }
  };
  try {
    const ok = content.insertCoverDocument({
      title: 'Baslik',
      editor: {
        commands: {
          insertContentAt(pos, html) {
            calls.push(['insert', pos, html]);
          }
        }
      }
    });
    assert.equal(ok, true);
    assert.equal(String(calls[0][2]).includes('Baslik'), true);
    assert.deepEqual(calls[1], ['effects']);
  } finally {
    delete global.window;
  }
});

test('insertCoverFromForm reads inputs, hides modal and clears fields', () => {
  const calls = [];
  const fields = {
    cvtitle: { value: 'Baslik', focus() { calls.push(['focus-title']); } },
    cvauthor: { value: 'Yazar' },
    cvinst: { value: 'Kurum' },
    cvcourse: { value: 'Ders' },
    cvprof: { value: 'Hoca' }
  };
  global.window = {
    AQEditorRuntime: {
      runContentApplyEffects() {
        calls.push(['effects']);
      }
    }
  };
  try {
    const ok = content.insertCoverFromForm({
      documentObj: {
        getElementById(id) {
          return fields[id] || null;
        }
      },
      templatesApi: {
        buildCoverHTML(options) {
          return '<p>' + options.title + ' - ' + options.author + '</p>';
        }
      },
      hideModal(id) {
        calls.push(['hide', id]);
      },
      getDateText() {
        return '27 Mart 2026';
      },
      editor: {
        commands: {
          insertContentAt(pos, html) {
            calls.push(['insert', pos, html.includes('Baslik'), html.includes('Yazar')]);
          }
        }
      }
    });
    assert.equal(ok, true);
    assert.deepEqual(calls, [
      ['hide', 'covermodal'],
      ['insert', 0, true, true],
      ['effects']
    ]);
    assert.equal(fields.cvtitle.value, '');
    assert.equal(fields.cvauthor.value, '');
    assert.equal(fields.cvinst.value, '');
    assert.equal(fields.cvcourse.value, '');
    assert.equal(fields.cvprof.value, '');
  } finally {
    delete global.window;
  }
});

test('insertImageWithState composes saved range accessors for image insertion', () => {
  let savedRange = 'old';
  const calls = [];
  global.window = {
    AQTipTapWordDocument: {
      insertHTML(options) {
        calls.push(['saved-before', options.savedRangeRef.current]);
        options.savedRangeRef.current = 'new';
        return true;
      }
    }
  };
  try {
    const ok = content.insertImageWithState({
      html: '<p><img /></p>',
      getSavedRange() {
        return savedRange;
      },
      setSavedRange(value) {
        savedRange = value;
      }
    });
    assert.equal(ok, true);
    assert.deepEqual(calls, [['saved-before', 'old']]);
    assert.equal(savedRange, 'new');
  } finally {
    delete global.window;
  }
});

test('insertImageFile reads file, builds image html and delegates insertion', () => {
  const calls = [];
  const file = { name: 'resim.png' };
  global.window = {
    AQTipTapWordDocument: {
      buildImageHTML(src, name) {
        calls.push(['build', src, name]);
        return '<p>img</p>';
      }
    },
    AQTipTapWordContent: content
  };
  global.window.AQTipTapWordDocument.insertHTML = function(options) {
    calls.push(['insert', options.html, options.savedRangeRef.current]);
    options.savedRangeRef.current = 'next-range';
    return true;
  };
  let savedRange = 'old-range';
  try {
    const ok = content.insertImageFile({
      file,
      getSavedRange() {
        return savedRange;
      },
      setSavedRange(value) {
        savedRange = value;
      },
      readFileAsDataURL(inputFile, onLoad) {
        calls.push(['read', inputFile.name]);
        onLoad('data:image/png;base64,abc');
      }
    });
    assert.equal(ok, true);
    assert.deepEqual(calls, [
      ['read', 'resim.png'],
      ['build', 'data:image/png;base64,abc', 'resim.png'],
      ['insert', '<p>img</p>', 'old-range']
    ]);
    assert.equal(savedRange, 'next-range');
  } finally {
    delete global.window;
  }
});

test('insertImageFromEvent extracts file, delegates and clears input', () => {
  const target = {
    files: [{ name: 'resim.png' }],
    value: 'picked'
  };
  const calls = [];
  global.window = {
    AQTipTapWordDocument: {
      buildImageHTML() {
        calls.push(['build']);
        return '<p>img</p>';
      },
      insertHTML(options) {
        calls.push(['insert', options.html]);
        return true;
      }
    }
  };
  try {
    const ok = content.insertImageFromEvent({
      event: { target },
      readFileAsDataURL(file, onLoad) {
        calls.push(['read', file.name]);
        onLoad('data:image/png;base64,abc');
      },
      host: { nodeType: 1 }
    });
    assert.equal(ok, true);
    assert.deepEqual(calls, [
      ['read', 'resim.png'],
      ['build'],
      ['insert', '<p>img</p>']
    ]);
    assert.equal(target.value, '');
  } finally {
    delete global.window;
  }
});

test('insertCommandBuiltBlock builds html from commands api before inserting', () => {
  const calls = [];
  global.window = {
    AQTipTapWordCommands: {
      buildAbstractHTML() {
        calls.push(['build']);
        return '<p>abstract</p>';
      }
    },
    AQTipTapWordDocument: {
      insertHTML(options) {
        calls.push(['insert', options.html]);
        return true;
      }
    }
  };
  try {
    const ok = content.insertCommandBuiltBlock({
      builderName: 'buildAbstractHTML'
    });
    assert.equal(ok, true);
    assert.deepEqual(calls, [
      ['build'],
      ['insert', '<p>abstract</p>']
    ]);
  } finally {
    delete global.window;
  }
});

test('insertCommandBuiltBlockWithBridge uses resolved block html and bridge effects', () => {
  const calls = [];
  let savedRange = 'old';
  global.window = {
    AQTipTapWordDocument: {
      insertHTML(options){
        calls.push(['insert', options.html, options.savedRangeRef.current]);
        if(typeof options.beforeEditorInsert === 'function') options.beforeEditorInsert();
        if(typeof options.afterEditorInsert === 'function') options.afterEditorInsert();
        return true;
      }
    }
  };
  try{
    const ok = content.insertCommandBuiltBlockWithBridge({
      builderName: 'buildFigureHTML',
      builderArgs: ['2', 'Sekil'],
      bridgeApi: {
        ensureEditableRoot() {
          calls.push(['ensure']);
          return true;
        },
        runEditorMutationEffects(opts) {
          calls.push(['effects', !!opts.syncChrome, !!opts.syncTOC, !!opts.syncRefs]);
          return true;
        }
      },
      documentApi: { id:'doc-api' },
      editor: { view:{ dom:'pm-root' } },
      getSavedRange() {
        return savedRange;
      },
      setSavedRange(value) {
        savedRange = value;
      }
    });
    assert.equal(ok, true);
    assert.equal(calls[0][0], 'insert');
    assert.match(calls[0][1], /Şekil 2/u);
    assert.equal(calls[0][2], 'old');
    assert.deepEqual(calls.slice(1), [
      ['ensure'],
      ['effects', true, true, true]
    ]);
  } finally {
    delete global.window;
  }
});
