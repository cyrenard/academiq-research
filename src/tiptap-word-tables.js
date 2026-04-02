(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordTables = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  var state = {
    initialized: false,
    selectedTable: null,
    button: null
  };

  function getSurface(){
    return typeof window !== 'undefined' ? (window.AQTipTapWordSurface || null) : null;
  }

  function getHost(){
    var surface = getSurface();
    return surface && typeof surface.getHost === 'function' ? surface.getHost() : null;
  }

  function getEditor(){
    if(typeof window === 'undefined') return null;
    if(window.AQEditorCore && typeof window.AQEditorCore.getEditor === 'function'){
      try{
        var coreEditor = window.AQEditorCore.getEditor();
        if(coreEditor) return coreEditor;
      }catch(e){}
    }
    return window.editor || null;
  }

  function getPage(){
    return typeof document !== 'undefined' ? document.getElementById('apapage') : null;
  }

  function getScroll(){
    return typeof document !== 'undefined' ? document.getElementById('escroll') : null;
  }

  function syncEditorState(){
    if(typeof window === 'undefined') return;
    if(window.AQEditorRuntime && typeof window.AQEditorRuntime.runContentApplyEffects === 'function'){
      window.AQEditorRuntime.runContentApplyEffects({
        normalize:false,
        layout:true,
        syncChrome:true,
        syncTOC:false,
        syncRefs:false,
        refreshTrigger:false
      });
      return;
    }
    if(typeof window.uSt === 'function') window.uSt();
    if(typeof window.save === 'function') window.save();
    if(typeof window.updatePageHeight === 'function') window.updatePageHeight();
  }

  function ensureButton(){
    if(state.button) return state.button;
    var existing = typeof document !== 'undefined' ? document.getElementById('tblDelBtn') : null;
    if(existing){
      state.button = existing;
      return existing;
    }
    var page = getPage();
    if(!page) return null;
    var button = document.createElement('button');
    button.id = 'tblDelBtn';
    button.textContent = 'Tabloyu Sil';
    button.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      removeSelectedTable();
    });
    page.appendChild(button);
    state.button = button;
    return button;
  }

  function hideButton(){
    if(state.button) state.button.style.display = 'none';
    state.selectedTable = null;
  }

  function resolveTopLevelBlocks(editor){
    var blocks = [];
    if(!editor || !editor.state || !editor.state.doc || typeof editor.state.doc.forEach !== 'function'){
      return blocks;
    }
    editor.state.doc.forEach(function(node, offset){
      var from = (parseInt(offset, 10) || 0);
      blocks.push({
        node: node,
        from: from,
        to: from + node.nodeSize
      });
    });
    return blocks;
  }

  function blockIndexAtPos(blocks, pos){
    var target = parseInt(pos, 10);
    if(!Array.isArray(blocks) || !blocks.length || !Number.isFinite(target)) return -1;
    for(var i = 0; i < blocks.length; i++){
      if(target >= blocks[i].from && target < blocks[i].to) return i;
    }
    return -1;
  }

  function isParagraphLike(node){
    return !!(node && node.type && node.type.name === 'paragraph');
  }

  function isCaptionOrNoteBlock(node){
    if(!isParagraphLike(node)) return false;
    var attrs = node.attrs || {};
    var klass = String(attrs.class || attrs.className || '').toLowerCase();
    if(klass.indexOf('ni') >= 0) return true;
    var text = String(node.textContent || '').replace(/\u00a0/g, ' ').trim().toLowerCase();
    if(!text) return false;
    if(/^tablo\s+\d+/.test(text)) return true;
    if(/^not\./.test(text)) return true;
    return false;
  }

  function isBlankParagraph(node){
    if(!isParagraphLike(node)) return false;
    var text = String(node.textContent || '').replace(/\u00a0/g, ' ').trim();
    return text === '';
  }

  function resolveDeleteRange(editor, tableElement){
    if(!editor || !editor.view || !editor.state || !tableElement) return null;
    var tablePos = -1;
    try{
      tablePos = editor.view.posAtDOM(tableElement, 0);
    }catch(e){
      tablePos = -1;
    }
    if(!Number.isFinite(tablePos) || tablePos < 0) return null;
    var blocks = resolveTopLevelBlocks(editor);
    if(!blocks.length) return null;
    var tableIndex = blockIndexAtPos(blocks, tablePos);
    if(tableIndex < 0 || !blocks[tableIndex] || !(blocks[tableIndex].node && blocks[tableIndex].node.type && blocks[tableIndex].node.type.name === 'table')){
      return null;
    }
    var startIndex = tableIndex;
    var endIndex = tableIndex;

    for(var prev = tableIndex - 1; prev >= 0; prev--){
      if(!isCaptionOrNoteBlock(blocks[prev].node)) break;
      startIndex = prev;
    }

    for(var next = tableIndex + 1; next < blocks.length; next++){
      var nextNode = blocks[next].node;
      if(isCaptionOrNoteBlock(nextNode)){
        endIndex = next;
        continue;
      }
      if(isBlankParagraph(nextNode)){
        endIndex = next;
      }
      break;
    }

    var docSize = editor.state && editor.state.doc && editor.state.doc.content
      ? parseInt(editor.state.doc.content.size, 10) || 0
      : 0;
    var from = blocks[startIndex].from;
    var to = blocks[endIndex].to;
    if(docSize > 0){
      from = Math.max(0, Math.min(from, docSize));
      to = Math.max(from, Math.min(to, docSize));
    }
    return {
      from: from,
      to: to
    };
  }

  function removeSelectedTableFromEditor(){
    var editor = getEditor();
    if(!editor || !editor.chain || !state.selectedTable) return false;
    var range = resolveDeleteRange(editor, state.selectedTable);
    if(!range || range.from >= range.to) return false;
    try{
      editor.chain().focus().deleteRange({ from: range.from, to: range.to }).run();
      return true;
    }catch(e){
      return false;
    }
  }

  function removeSelectedTableViaHTMLRewrite(){
    var editor = getEditor();
    if(!editor || !editor.commands || typeof editor.commands.setContent !== 'function') return false;
    if(!editor.view || !editor.view.dom || !state.selectedTable) return false;
    var root = editor.view.dom;
    if(typeof root.querySelectorAll !== 'function') return false;
    var tables = Array.prototype.slice.call(root.querySelectorAll('table'));
    var tableIndex = tables.indexOf(state.selectedTable);
    if(tableIndex < 0) return false;

    var clone = root.cloneNode(true);
    var cloneTables = clone.querySelectorAll('table');
    var target = cloneTables[tableIndex];
    if(!target) return false;

    var prev = target.previousElementSibling;
    var next = target.nextElementSibling;
    target.remove();

    while(prev && prev.classList && prev.classList.contains('ni')){
      var prevPrev = prev.previousElementSibling;
      prev.remove();
      prev = prevPrev;
    }
    while(next && next.classList && next.classList.contains('ni')){
      var nextNext = next.nextElementSibling;
      next.remove();
      next = nextNext;
    }
    if(next && next.tagName === 'P' && String(next.textContent || '').replace(/\u00a0/g, ' ').trim() === ''){
      next.remove();
    }

    try{
      editor.commands.setContent(clone.innerHTML || '<p></p>', false);
      return true;
    }catch(e){
      return false;
    }
  }

  function removeSelectedTable(){
    var host = getHost();
    if(!state.selectedTable || !host || !host.contains(state.selectedTable)){
      hideButton();
      return;
    }
    var removedFromState = removeSelectedTableFromEditor();
    if(!removedFromState){
      removedFromState = removeSelectedTableViaHTMLRewrite();
    }
    if(!removedFromState){
      var prev = state.selectedTable.previousElementSibling;
      state.selectedTable.remove();
      while(prev && prev.classList && prev.classList.contains('ni')){
        var nextPrev = prev.previousElementSibling;
        prev.remove();
        prev = nextPrev;
      }
    }
    hideButton();
    syncEditorState();
  }

  function positionButton(table){
    var button = ensureButton();
    var page = getPage();
    if(!button || !page || !table) return;
    var pageRect = page.getBoundingClientRect();
    var tableRect = table.getBoundingClientRect();
    button.style.display = 'block';
    button.style.top = (tableRect.top - pageRect.top - 28) + 'px';
    button.style.left = (tableRect.right - pageRect.left - 90) + 'px';
  }

  function bindTableSelection(){
    var host = getHost();
    if(!host) return;
    host.addEventListener('click', function(e){
      var table = e.target && e.target.closest ? e.target.closest('table') : null;
      if(table && host.contains(table)){
        state.selectedTable = table;
        positionButton(table);
        return;
      }
      hideButton();
    });
  }

  function bindScrollHide(){
    var scroll = getScroll();
    if(!scroll) return;
    scroll.addEventListener('scroll', hideButton);
  }

  function init(){
    if(state.initialized) return true;
    state.initialized = true;
    window.__aqTipTapWordTablesV1 = true;
    ensureButton();
    bindTableSelection();
    bindScrollHide();
    return true;
  }

  return {
    init: init,
    hideButton: hideButton
  };
});
