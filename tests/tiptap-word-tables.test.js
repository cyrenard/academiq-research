const test = require('node:test');
const assert = require('node:assert/strict');

function loadTables(){
  const modulePath = require.resolve('../src/tiptap-word-tables.js');
  delete require.cache[modulePath];
  return require(modulePath);
}

test('tiptap word tables exports init and hideButton', () => {
  const tables = loadTables();
  assert.equal(typeof tables.init, 'function');
  assert.equal(typeof tables.hideButton, 'function');
});

test('removeSelectedTable deletes through editor state so deletion persists after reload', () => {
  const previousWindow = global.window;
  const previousDocument = global.document;

  let removedFromDOM = false;
  let deletedRange = null;
  let runCalls = 0;
  let syncCalls = 0;

  const table = {
    previousElementSibling: null,
    classList: { contains(){ return false; } },
    remove(){ removedFromDOM = true; },
    getBoundingClientRect(){ return { top: 120, right: 300 }; }
  };

  const host = {
    _handlers: {},
    addEventListener(type, handler){ this._handlers[type] = handler; },
    contains(node){ return node === table; }
  };

  const page = {
    appendChild(el){ if(el && el.id) elements[el.id] = el; },
    getBoundingClientRect(){ return { top: 0, left: 0 }; }
  };

  const scroll = {
    addEventListener(){}
  };

  const elements = { apapage: page, escroll: scroll };

  function createButtonElement(){
    return {
      style: {},
      _handlers: {},
      addEventListener(type, handler){ this._handlers[type] = handler; },
      click(){
        if(this._handlers.click){
          this._handlers.click({
            preventDefault(){},
            stopPropagation(){}
          });
        }
      },
      set id(value){
        this._id = value;
        elements[value] = this;
      },
      get id(){ return this._id; }
    };
  }

  try{
    global.document = {
      getElementById(id){ return elements[id] || null; },
      createElement(tag){
        if(tag === 'button') return createButtonElement();
        return { style: {}, addEventListener(){} };
      }
    };

    const editor = {
      state: {
        doc: {
          forEach(callback){
            callback({ type: { name: 'table' }, nodeSize: 5 }, 0);
            callback({ type: { name: 'paragraph' }, nodeSize: 2, textContent: '' }, 5);
          }
        }
      },
      view: {
        posAtDOM(dom){ return dom === table ? 1 : -1; }
      },
      chain(){
        return {
          focus(){ return this; },
          deleteRange(range){ deletedRange = range; return this; },
          run(){ runCalls += 1; return true; }
        };
      }
    };

    global.window = {
      AQTipTapWordSurface: { getHost(){ return host; } },
      AQEditorCore: { getEditor(){ return editor; } },
      AQEditorRuntime: {
        runContentApplyEffects(){ syncCalls += 1; }
      }
    };

    const tables = loadTables();
    tables.init();

    host._handlers.click({
      target: {
        closest(selector){ return selector === 'table' ? table : null; }
      }
    });

    const deleteButton = elements.tblDelBtn;
    assert.ok(deleteButton, 'Tablo silme butonu olusmali');

    deleteButton.click();

    assert.deepEqual(deletedRange, { from: 0, to: 7 });
    assert.equal(runCalls, 1);
    assert.equal(syncCalls, 1);
    assert.equal(removedFromDOM, false);
  } finally {
    if(typeof previousWindow === 'undefined') delete global.window;
    else global.window = previousWindow;
    if(typeof previousDocument === 'undefined') delete global.document;
    else global.document = previousDocument;
  }
});

test('removeSelectedTable can persist deletion via HTML rewrite fallback when deleteRange fails', () => {
  const previousWindow = global.window;
  const previousDocument = global.document;

  let removedFromDOM = false;
  let setContentHTML = null;
  let syncCalls = 0;

  const makePara = function(text, ni){
    return {
      tagName: 'P',
      textContent: text || '',
      classList: {
        contains(name){ return ni ? name === 'ni' : false; }
      },
      previousElementSibling: null,
      nextElementSibling: null,
      remove(){
        if(this.previousElementSibling) this.previousElementSibling.nextElementSibling = this.nextElementSibling;
        if(this.nextElementSibling) this.nextElementSibling.previousElementSibling = this.previousElementSibling;
      }
    };
  };

  const tableNode = {
    tagName: 'TABLE',
    classList: { contains(){ return false; } },
    previousElementSibling: null,
    nextElementSibling: null,
    remove(){
      if(this.previousElementSibling) this.previousElementSibling.nextElementSibling = this.nextElementSibling;
      if(this.nextElementSibling) this.nextElementSibling.previousElementSibling = this.previousElementSibling;
    },
    getBoundingClientRect(){ return { top: 120, right: 300 }; }
  };

  const paraBefore = makePara('Tablo 1', true);
  const paraAfter = makePara('', false);
  paraBefore.nextElementSibling = tableNode;
  tableNode.previousElementSibling = paraBefore;
  tableNode.nextElementSibling = paraAfter;
  paraAfter.previousElementSibling = tableNode;

  const cloneTable = {
    tagName: 'TABLE',
    classList: { contains(){ return false; } },
    previousElementSibling: null,
    nextElementSibling: null,
    remove(){
      if(this.previousElementSibling) this.previousElementSibling.nextElementSibling = this.nextElementSibling;
      if(this.nextElementSibling) this.nextElementSibling.previousElementSibling = this.previousElementSibling;
    }
  };
  const cloneBefore = makePara('Tablo 1', true);
  const cloneAfter = makePara('', false);
  cloneBefore.nextElementSibling = cloneTable;
  cloneTable.previousElementSibling = cloneBefore;
  cloneTable.nextElementSibling = cloneAfter;
  cloneAfter.previousElementSibling = cloneTable;

  const cloneRoot = {
    innerHTML: '<p class="ni"><strong>Tablo 1</strong></p><table><tbody><tr><td>x</td></tr></tbody></table><p><br></p>',
    querySelectorAll(selector){
      if(selector === 'table') return [cloneTable];
      return [];
    }
  };

  const table = {
    previousElementSibling: paraBefore,
    nextElementSibling: paraAfter,
    classList: { contains(){ return false; } },
    remove(){ removedFromDOM = true; },
    getBoundingClientRect(){ return { top: 120, right: 300 }; }
  };

  const editorRoot = {
    querySelectorAll(selector){
      if(selector === 'table') return [table];
      return [];
    },
    cloneNode(){ return cloneRoot; }
  };

  const host = {
    _handlers: {},
    addEventListener(type, handler){ this._handlers[type] = handler; },
    contains(node){ return node === table; }
  };

  const page = {
    appendChild(el){ if(el && el.id) elements[el.id] = el; },
    getBoundingClientRect(){ return { top: 0, left: 0 }; }
  };
  const scroll = { addEventListener(){} };
  const elements = { apapage: page, escroll: scroll };

  function createButtonElement(){
    return {
      style: {},
      _handlers: {},
      addEventListener(type, handler){ this._handlers[type] = handler; },
      click(){
        if(this._handlers.click){
          this._handlers.click({ preventDefault(){}, stopPropagation(){} });
        }
      },
      set id(value){
        this._id = value;
        elements[value] = this;
      },
      get id(){ return this._id; }
    };
  }

  try{
    global.document = {
      getElementById(id){ return elements[id] || null; },
      createElement(tag){
        if(tag === 'button') return createButtonElement();
        return { style: {}, addEventListener(){} };
      }
    };

    const editor = {
      state: {
        doc: {
          content: { size: 7 },
          forEach(callback){
            callback({ type: { name: 'table' }, nodeSize: 5 }, 0);
            callback({ type: { name: 'paragraph' }, nodeSize: 2, textContent: '' }, 5);
          }
        }
      },
      view: {
        dom: editorRoot,
        posAtDOM(){ return 1; }
      },
      chain(){
        return {
          focus(){ return this; },
          deleteRange(){ return this; },
          run(){ throw new Error('delete failed'); }
        };
      },
      commands: {
        setContent(html){ setContentHTML = html; }
      }
    };

    global.window = {
      AQTipTapWordSurface: { getHost(){ return host; } },
      AQEditorCore: { getEditor(){ return editor; } },
      AQEditorRuntime: { runContentApplyEffects(){ syncCalls += 1; } }
    };

    const tables = loadTables();
    tables.init();
    host._handlers.click({
      target: {
        closest(selector){ return selector === 'table' ? table : null; }
      }
    });

    const deleteButton = elements.tblDelBtn;
    assert.ok(deleteButton, 'Tablo silme butonu olusmali');
    deleteButton.click();

    assert.equal(typeof setContentHTML, 'string');
    assert.equal(syncCalls, 1);
    assert.equal(removedFromDOM, false);
  } finally {
    if(typeof previousWindow === 'undefined') delete global.window;
    else global.window = previousWindow;
    if(typeof previousDocument === 'undefined') delete global.document;
    else global.document = previousDocument;
  }
});
