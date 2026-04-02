(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordMedia = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  var state = {
    initialized: false,
    selectedImg: null,
    selectedPos: -1,
    resizeHandle: null,
    toolbar: null,
    toolbarSlider: null,
    toolbarSizeLabel: null,
    resizing: false,
    resizeStartX: 0,
    resizeStartW: 0,
    dragImg: null,
    dragPos: -1,
    dragGhost: null,
    dragStartX: 0,
    dragStartY: 0,
    dragActive: false
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
      return window.AQEditorCore.getEditor();
    }
    return window.editor || null;
  }

  function getEditorDom(){
    var surface = getSurface();
    return surface && typeof surface.getEditorDom === 'function' ? surface.getEditorDom() : null;
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

  function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
  }

  function normalizeAlign(value){
    var next = String(value || 'left').toLowerCase();
    if(next === 'center' || next === 'right') return next;
    return 'left';
  }

  function normalizePercent(value){
    var num = parseFloat(value);
    if(!isFinite(num)) num = 70;
    return clamp(Math.round(num * 10) / 10, 10, 100);
  }

  function formatPercent(value){
    var n = String(Math.round(value * 10) / 10);
    return n.replace(/\.0$/,'') + '%';
  }

  function getImageMaxWidth(){
    var editorDom = getEditorDom();
    var fallback = state.selectedImg ? state.selectedImg.parentElement : null;
    var width = editorDom && editorDom.clientWidth ? editorDom.clientWidth : (fallback && fallback.clientWidth ? fallback.clientWidth : 700);
    return Math.max(160, width - 8);
  }

  function resolvePercentFromImage(img){
    if(!img) return 70;
    var widthAttr = img.getAttribute('data-width') || img.style.width || '';
    var percentMatch = String(widthAttr).match(/^(\d+(?:\.\d+)?)%$/);
    if(percentMatch){
      return normalizePercent(percentMatch[1]);
    }
    var pxMatch = String(widthAttr).match(/^(\d+(?:\.\d+)?)px$/i);
    if(pxMatch){
      var px = parseFloat(pxMatch[1]) || 0;
      var max = getImageMaxWidth();
      return normalizePercent((px / Math.max(1, max)) * 100);
    }
    var visibleWidth = img.getBoundingClientRect ? img.getBoundingClientRect().width : img.offsetWidth;
    if(visibleWidth){
      return normalizePercent((visibleWidth / Math.max(1, getImageMaxWidth())) * 100);
    }
    return 70;
  }

  function resolveImagePos(img){
    var editor = getEditor();
    if(!editor || !editor.state || !editor.view || !img) return -1;
    var candidates = [];
    try{
      var p0 = editor.view.posAtDOM(img, 0);
      if(typeof p0 === 'number') candidates.push(p0);
    }catch(e){}
    try{
      var p1 = editor.view.posAtDOM(img, 1);
      if(typeof p1 === 'number') candidates.push(p1);
    }catch(e){}
    var doc = editor.state.doc;
    for(var i = 0; i < candidates.length; i++){
      var base = candidates[i];
      var offsets = [0, -1, 1, -2, 2];
      for(var j = 0; j < offsets.length; j++){
        var pos = base + offsets[j];
        if(pos < 0 || pos > doc.content.size) continue;
        var node = doc.nodeAt(pos);
        if(node && node.type && node.type.name === 'image') return pos;
      }
    }
    var src = String(img.getAttribute('src') || '');
    if(src){
      var matchPos = -1;
      doc.descendants(function(node, pos){
        if(matchPos >= 0) return false;
        if(node && node.type && node.type.name === 'image' && String(node.attrs && node.attrs.src || '') === src){
          matchPos = pos;
          return false;
        }
        return true;
      });
      return matchPos;
    }
    return -1;
  }

  function findNearestImagePos(targetPos, src){
    var editor = getEditor();
    if(!editor || !editor.state || !editor.state.doc) return -1;
    var best = { pos:-1, distance:Infinity };
    var hasSrc = !!src;
    editor.state.doc.descendants(function(node, pos){
      if(!node || !node.type || node.type.name !== 'image') return true;
      if(hasSrc && String(node.attrs && node.attrs.src || '') !== String(src)) return true;
      var dist = Math.abs(pos - targetPos);
      if(dist < best.distance){
        best.pos = pos;
        best.distance = dist;
      }
      return true;
    });
    if(best.pos >= 0 || hasSrc) return best.pos;
    editor.state.doc.descendants(function(node, pos){
      if(best.pos >= 0) return false;
      if(node && node.type && node.type.name === 'image'){
        best.pos = pos;
        return false;
      }
      return true;
    });
    return best.pos;
  }

  function getSelectedImageFromPos(){
    var editor = getEditor();
    if(!editor || !editor.view || state.selectedPos < 0) return null;
    try{
      var domNode = editor.view.nodeDOM(state.selectedPos);
      if(domNode && domNode.nodeType === 1){
        if(domNode.tagName === 'IMG') return domNode;
        if(domNode.querySelector){
          var img = domNode.querySelector('img');
          if(img) return img;
        }
      }
    }catch(e){}
    return null;
  }

  function getActiveImageTarget(){
    var editor = getEditor();
    if(!editor || !editor.state) return null;
    var sel = editor.state.selection;
    if(sel && sel.node && sel.node.type && sel.node.type.name === 'image'){
      return { pos: sel.from, node: sel.node };
    }
    var pos = state.selectedPos;
    if(typeof pos === 'number' && pos >= 0){
      var node = editor.state.doc.nodeAt(pos);
      if(node && node.type && node.type.name === 'image'){
        return { pos:pos, node:node };
      }
    }
    var img = state.selectedImg;
    if(img){
      var resolvedPos = resolveImagePos(img);
      if(resolvedPos >= 0){
        var resolvedNode = editor.state.doc.nodeAt(resolvedPos);
        if(resolvedNode && resolvedNode.type && resolvedNode.type.name === 'image'){
          return { pos:resolvedPos, node:resolvedNode };
        }
      }
    }
    return null;
  }

  function getImageSelectionPosFromEditor(){
    var editor = getEditor();
    if(!editor || !editor.state || !editor.state.doc) return -1;
    var sel = editor.state.selection;
    if(sel && sel.node && sel.node.type && sel.node.type.name === 'image' && typeof sel.from === 'number'){
      return sel.from;
    }
    if(sel && typeof sel.from === 'number'){
      var node = editor.state.doc.nodeAt(sel.from);
      if(node && node.type && node.type.name === 'image') return sel.from;
    }
    return -1;
  }

  function nodeHasImage(node){
    var hasImage = false;
    if(!node || typeof node.descendants !== 'function') return false;
    node.descendants(function(child){
      if(hasImage) return false;
      if(child && child.type && child.type.name === 'image'){
        hasImage = true;
        return false;
      }
      return true;
    });
    return hasImage;
  }

  function cloneJSON(value){
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(e){
      return null;
    }
  }

  function jsonNodeHasSideImage(node){
    if(!node || typeof node !== 'object') return false;
    if(node.type === 'image'){
      var attrs = node.attrs || {};
      var layout = String(attrs.layout || attrs['data-layout'] || '').toLowerCase();
      return layout === 'side';
    }
    var content = Array.isArray(node.content) ? node.content : [];
    for(var i = 0; i < content.length; i++){
      if(jsonNodeHasSideImage(content[i])) return true;
    }
    return false;
  }

  function normalizeSideTextCellJSON(cellJSON){
    var cell = cloneJSON(cellJSON) || { type:'tableCell' };
    if(cell.type !== 'tableCell') cell.type = 'tableCell';
    if(!Array.isArray(cell.content)) cell.content = [];
    var hasParagraph = false;
    for(var i = 0; i < cell.content.length; i++){
      if(cell.content[i] && cell.content[i].type === 'paragraph'){
        hasParagraph = true;
        break;
      }
    }
    if(!hasParagraph){
      cell.content.unshift({ type:'paragraph' });
    }
    return cell;
  }

  function findSideLayoutTableContext(imagePos){
    var editor = getEditor();
    if(!editor || !editor.state || typeof imagePos !== 'number' || imagePos < 0) return null;
    try{
      var $pos = editor.state.doc.resolve(imagePos);
      for(var depth = $pos.depth; depth >= 0; depth--){
        var node = $pos.node(depth);
        if(!(node && node.type && node.type.name === 'table')) continue;
        var hasSideImage = false;
        node.descendants(function(child){
          if(hasSideImage) return false;
          if(child && child.type && child.type.name === 'image' && child.attrs && child.attrs.layout === 'side'){
            hasSideImage = true;
            return false;
          }
          return true;
        });
        if(!hasSideImage) return null;
        var tablePos = -1;
        try{
          tablePos = depth > 0 ? $pos.before(depth) : 0;
        }catch(_posErr){
          tablePos = -1;
        }
        if(tablePos < 0) return null;
        return {
          tableNode: node,
          tablePos: tablePos
        };
      }
    }catch(e){}
    return null;
  }

  function isInsideSideLayoutTable(imagePos){
    return !!findSideLayoutTableContext(imagePos);
  }

  function buildSideLayoutTableJSON(imageAttrs, side){
    var imageNode = {
      type:'image',
      attrs:Object.assign({}, imageAttrs || {}, {
        layout:'side',
        width:'100%',
        align: side === 'right' ? 'right' : 'left'
      })
    };
    var imageParagraph = {
      type:'paragraph',
      content:[imageNode]
    };
    var textParagraph = {
      type:'paragraph'
    };
    var imageCell = {
      type:'tableCell',
      content:[imageParagraph]
    };
    var textCell = {
      type:'tableCell',
      content:[textParagraph]
    };
    var row = {
      type:'tableRow',
      content: side === 'right'
        ? [textCell, imageCell]
        : [imageCell, textCell]
    };
    return {
      type:'table',
      content:[row]
    };
  }

  function resolveSideLayoutReplaceRange(imagePos){
    var editor = getEditor();
    if(!editor || !editor.state || !editor.state.doc || typeof imagePos !== 'number' || imagePos < 0){
      return null;
    }
    var doc = editor.state.doc;
    var node = doc.nodeAt(imagePos);
    if(!(node && node.type && node.type.name === 'image')){
      return null;
    }
    var fallback = {
      from: imagePos,
      to: imagePos + node.nodeSize,
      anchor: imagePos
    };
    try{
      var $pos = doc.resolve(imagePos);
      for(var depth = $pos.depth; depth > 0; depth--){
        var parent = $pos.node(depth);
        if(!(parent && parent.type && parent.type.name === 'paragraph')) continue;
        var onlyImage = parent.childCount === 1
          && parent.firstChild
          && parent.firstChild.type
          && parent.firstChild.type.name === 'image';
        if(!onlyImage) break;
        var from = $pos.before(depth);
        return {
          from: from,
          to: from + parent.nodeSize,
          anchor: from
        };
      }
    }catch(e){}
    return fallback;
  }

  function findSideLayoutTextCellPos(anchorPos, bounds){
    var editor = getEditor();
    if(!editor || !editor.state || !editor.state.doc) return -1;
    var doc = editor.state.doc;
    var found = -1;
    var minPos = bounds && typeof bounds.from === 'number' ? bounds.from : -1;
    var maxPos = bounds && typeof bounds.to === 'number' ? bounds.to : Number.MAX_SAFE_INTEGER;
    var startAt = typeof anchorPos === 'number' ? anchorPos : 0;
    doc.descendants(function(node, pos){
      if(found >= 0) return false;
      if(pos < minPos || pos > maxPos) return true;
      if(!node || !node.type || node.type.name !== 'paragraph') return true;
      if(nodeHasImage(node)) return true;
      var inSideTable = false;
      try{
        var $pos = doc.resolve(pos);
        for(var depth = $pos.depth; depth >= 0; depth--){
          var parent = $pos.node(depth);
          if(parent && parent.type && parent.type.name === 'table'){
            parent.descendants(function(child){
              if(inSideTable) return false;
              if(child && child.type && child.type.name === 'image' && child.attrs && child.attrs.layout === 'side'){
                inSideTable = true;
                return false;
              }
              return true;
            });
            break;
          }
        }
      }catch(e){}
      if(!inSideTable) return true;
      if(pos >= startAt){
        found = pos + 1;
        return false;
      }
      return true;
    });
    return found;
  }

  function placeCaretInsideSideTextCell(imagePos){
    var editor = getEditor();
    if(!editor || !editor.chain || typeof imagePos !== 'number' || imagePos < 0) return false;
    var context = findSideLayoutTableContext(imagePos);
    if(!context) return false;
    var bounds = {
      from: context.tablePos,
      to: context.tablePos + (context.tableNode ? context.tableNode.nodeSize : 0)
    };
    var textPos = findSideLayoutTextCellPos(context.tablePos, bounds);
    if(textPos < 0) return false;
    try{
      editor.chain().focus().setTextSelection(textPos).run();
      return true;
    }catch(e){}
    return false;
  }

  function reorderExistingSideLayoutTable(side, imagePos){
    var editor = getEditor();
    if(!editor || !editor.state || !editor.view || typeof imagePos !== 'number' || imagePos < 0) return false;
    var context = findSideLayoutTableContext(imagePos);
    if(!context || !context.tableNode || context.tablePos < 0) return false;
    var tableJSON = cloneJSON(context.tableNode.toJSON ? context.tableNode.toJSON() : null);
    if(!tableJSON || !Array.isArray(tableJSON.content) || !tableJSON.content.length) return false;
    var row = tableJSON.content[0];
    if(!row || row.type !== 'tableRow' || !Array.isArray(row.content) || !row.content.length) return false;

    var imageCell = null;
    var textCell = null;
    var tailCells = [];
    for(var i = 0; i < row.content.length; i++){
      var cell = row.content[i];
      if(!imageCell && jsonNodeHasSideImage(cell)){
        imageCell = cell;
        continue;
      }
      if(!textCell){
        textCell = cell;
        continue;
      }
      tailCells.push(cell);
    }
    if(!imageCell) return false;
    textCell = normalizeSideTextCellJSON(textCell);
    var reordered = side === 'right'
      ? [textCell, imageCell]
      : [imageCell, textCell];
    if(tailCells.length){
      reordered = reordered.concat(tailCells);
    }
    row.content = reordered;
    tableJSON.content[0] = row;

    var nextTableNode = null;
    try{
      nextTableNode = editor.state.schema.nodeFromJSON(tableJSON);
      var tr = editor.state.tr.replaceWith(
        context.tablePos,
        context.tablePos + context.tableNode.nodeSize,
        nextTableNode
      );
      editor.view.dispatch(tr);
    }catch(e){
      return false;
    }

    clearSelectedImage(null);
    removeResizeHandle();
    removeImgToolbar();

    var nextBounds = {
      from: context.tablePos,
      to: context.tablePos + (nextTableNode ? nextTableNode.nodeSize : 0)
    };
    var textPos = findSideLayoutTextCellPos(context.tablePos, nextBounds);
    if(textPos >= 0){
      try{ editor.chain().focus().setTextSelection(textPos).run(); }catch(_selErr){}
    }else{
      try{ editor.chain().focus().run(); }catch(_focusErr){}
    }
    syncEditorState();
    return true;
  }

  function convertSelectedImageToSideText(side){
    var editor = getEditor();
    if(!editor || !editor.state || !editor.view) return false;
    var target = getActiveImageTarget();
    if(!target) return false;
    if(isInsideSideLayoutTable(target.pos)){
      return reorderExistingSideLayoutTable(side, target.pos);
    }
    var tableJSON = buildSideLayoutTableJSON(target.node.attrs || {}, side);
    var replaceRange = resolveSideLayoutReplaceRange(target.pos) || {
      from: target.pos,
      to: target.pos + target.node.nodeSize,
      anchor: target.pos
    };
    var tableNode = null;
    try{
      tableNode = editor.state.schema.nodeFromJSON(tableJSON);
      var tr = editor.state.tr.replaceWith(replaceRange.from, replaceRange.to, tableNode);
      editor.view.dispatch(tr);
    }catch(e){
      return false;
    }
    clearSelectedImage(null);
    removeResizeHandle();
    removeImgToolbar();
    var nextBounds = {
      from: replaceRange.from,
      to: replaceRange.from + (tableNode ? tableNode.nodeSize : 0)
    };
    var textPos = findSideLayoutTextCellPos(replaceRange.from, nextBounds);
    if(textPos >= 0){
      try{ editor.chain().focus().setTextSelection(textPos).run(); }catch(_selErr){}
    }else{
      try{ editor.chain().focus().run(); }catch(_focusErr){}
    }
    syncEditorState();
    return true;
  }

  function removeResizeHandle(){
    if(state.resizeHandle && state.resizeHandle.parentNode){
      state.resizeHandle.parentNode.removeChild(state.resizeHandle);
    }
    state.resizeHandle = null;
  }

  function removeImgToolbar(){
    if(state.toolbar && state.toolbar.parentNode){
      state.toolbar.parentNode.removeChild(state.toolbar);
    }
    state.toolbar = null;
    state.toolbarSlider = null;
    state.toolbarSizeLabel = null;
  }

  function clearSelectedImage(except){
    var host = getHost();
    if(!host) return;
    Array.from(host.querySelectorAll('img.img-selected')).forEach(function(img){
      if(img !== except) img.classList.remove('img-selected');
    });
    if(!except){
      state.selectedImg = null;
      state.selectedPos = -1;
    }
  }

  function ensureParagraphCursorAfterImage(imagePos){
    var editor = getEditor();
    if(!editor || !editor.state || !editor.view || typeof imagePos !== 'number' || imagePos < 0){
      return -1;
    }
    var doc = editor.state.doc;
    var imageNode = doc.nodeAt(imagePos);
    if(!imageNode || !imageNode.type || imageNode.type.name !== 'image'){
      return -1;
    }
    var afterPos = imagePos + imageNode.nodeSize;
    var afterNode = doc.nodeAt(afterPos);
    if(!(afterNode && afterNode.type && afterNode.type.name === 'paragraph')){
      try{
        var pType = editor.state.schema && editor.state.schema.nodes ? editor.state.schema.nodes.paragraph : null;
        if(pType){
          var pNode = pType.createAndFill();
          if(pNode){
            var tr = editor.state.tr.insert(afterPos, pNode);
            editor.view.dispatch(tr);
          }
        }else if(editor.chain){
          editor.chain().focus().insertContentAt(afterPos, { type:'paragraph' }).run();
        }
      }catch(e){
        try{
          if(editor.chain) editor.chain().focus().insertContentAt(afterPos, { type:'paragraph' }).run();
        }catch(_e){}
      }
    }
    var nextDoc = editor.state.doc;
    var nextAfterNode = nextDoc.nodeAt(afterPos);
    if(nextAfterNode && nextAfterNode.type && nextAfterNode.type.name === 'paragraph'){
      return clamp(afterPos + 1, 0, nextDoc.content.size);
    }
    return clamp(afterPos, 0, nextDoc.content.size);
  }

  function placeCaretAtClickOrAfterImage(options){
    options = options || {};
    var editor = getEditor();
    if(!editor || !editor.state || !editor.commands) return false;
    var doc = editor.state.doc;
    var coords = options.coords || null;
    var fromPos = -1;
    if(options.preferAfterImage && typeof options.imagePos === 'number' && options.imagePos >= 0){
      fromPos = ensureParagraphCursorAfterImage(options.imagePos);
    }
    if(fromPos < 0 && coords && editor.view && typeof editor.view.posAtCoords === 'function'){
      try{
        var found = editor.view.posAtCoords({ left:coords.left, top:coords.top });
        if(found && typeof found.pos === 'number'){
          fromPos = found.pos;
        }
      }catch(e){}
    }
    if(fromPos < 0){
      var imagePos = typeof options.imagePos === 'number' ? options.imagePos : -1;
      if(imagePos >= 0){
        fromPos = ensureParagraphCursorAfterImage(imagePos);
      }
    }
    if(fromPos >= 0){
      var liveDoc = editor.state.doc;
      var maybeNode = liveDoc.nodeAt(fromPos);
      if(maybeNode && maybeNode.type && maybeNode.type.name === 'image'){
        if(options.preferAfterImage){
          var adjusted = ensureParagraphCursorAfterImage(fromPos);
          if(adjusted >= 0) fromPos = adjusted;
        }else{
          fromPos = clamp(fromPos, 0, liveDoc.content.size);
        }
      }
    }
    if(fromPos < 0){
      fromPos = editor.state.selection && typeof editor.state.selection.to === 'number'
        ? editor.state.selection.to
        : doc.content.size;
    }
    fromPos = clamp(fromPos, 0, doc.content.size);
    try{
      editor.chain().focus().setTextSelection(fromPos).run();
      return true;
    }catch(e){}
    return false;
  }

  function applyAlignPreview(img, align){
    if(!img) return;
    var next = normalizeAlign(align);
    img.style.display = 'block';
    img.style.textIndent = '0';
    if(next === 'center'){
      img.style.float = 'none';
      img.style.marginLeft = 'auto';
      img.style.marginRight = 'auto';
      img.style.marginTop = '4px';
      img.style.marginBottom = '12px';
      return;
    }
    if(next === 'right'){
      img.style.float = 'right';
      img.style.marginLeft = '14px';
      img.style.marginRight = '0';
      img.style.marginTop = '2px';
      img.style.marginBottom = '10px';
      return;
    }
    img.style.float = 'left';
    img.style.marginLeft = '0';
    img.style.marginRight = '14px';
    img.style.marginTop = '2px';
    img.style.marginBottom = '10px';
  }

  function applyWidthPreview(img, percent){
    if(!img) return;
    var pct = normalizePercent(percent);
    img.style.width = formatPercent(pct);
    img.style.height = 'auto';
    img.style.maxWidth = '100%';
  }

  function positionFloatingControls(){
    var img = state.selectedImg;
    if(!img || !document.body || !document.body.contains(img)){
      clearSelectedImage(null);
      removeResizeHandle();
      removeImgToolbar();
      return;
    }
    var rect = img.getBoundingClientRect();
    var isVisible = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
    if(state.toolbar){
      if(!isVisible){
        state.toolbar.style.display = 'none';
      }else{
        state.toolbar.style.display = 'flex';
        var top = rect.top - state.toolbar.offsetHeight - 10;
        if(top < 6) top = rect.bottom + 8;
        var left = rect.left + (rect.width - state.toolbar.offsetWidth) / 2;
        left = clamp(left, 6, Math.max(6, window.innerWidth - state.toolbar.offsetWidth - 6));
        state.toolbar.style.top = Math.round(top) + 'px';
        state.toolbar.style.left = Math.round(left) + 'px';
      }
    }
    if(state.resizeHandle){
      if(!isVisible){
        state.resizeHandle.style.display = 'none';
      }else{
        state.resizeHandle.style.display = 'block';
        state.resizeHandle.style.left = Math.round(rect.right - 6) + 'px';
        state.resizeHandle.style.top = Math.round(rect.bottom - 6) + 'px';
      }
    }
  }

  function updateToolbarState(){
    if(!state.selectedImg) return;
    var pct = resolvePercentFromImage(state.selectedImg);
    if(state.toolbarSlider) state.toolbarSlider.value = String(Math.round(pct));
    if(state.toolbarSizeLabel) state.toolbarSizeLabel.textContent = String(Math.round(pct)) + '%';
    positionFloatingControls();
  }

  function updateSelectedImageAttrs(nextAttrs){
    var editor = getEditor();
    var pos = state.selectedPos;
    var img = state.selectedImg;
    if(editor && editor.state && editor.view){
      if(pos < 0 || !editor.state.doc.nodeAt(pos) || editor.state.doc.nodeAt(pos).type.name !== 'image'){
        pos = resolveImagePos(img);
      }
      var node = pos >= 0 ? editor.state.doc.nodeAt(pos) : null;
      if(node && node.type && node.type.name === 'image'){
        var attrs = Object.assign({}, node.attrs || {}, nextAttrs || {});
        try{
          var tr = editor.state.tr.setNodeMarkup(pos, undefined, attrs);
          editor.view.dispatch(tr);
          state.selectedPos = findNearestImagePos(pos, attrs.src || (node.attrs && node.attrs.src));
          if(state.selectedPos >= 0 && editor.commands && typeof editor.commands.setNodeSelection === 'function'){
            try{ editor.commands.setNodeSelection(state.selectedPos); }catch(e){}
          }
          setTimeout(function(){
            var nextImg = getSelectedImageFromPos();
            if(nextImg){
              selectImage(nextImg, state.selectedPos, true);
              return;
            }
            if(img){
              if(attrs.width) applyWidthPreview(img, attrs.width);
              if(attrs.align) applyAlignPreview(img, attrs.align);
              updateToolbarState();
            }
          }, 0);
          syncEditorState();
          return true;
        }catch(e){}
      }
    }
    if(img){
      if(nextAttrs && nextAttrs.width) applyWidthPreview(img, nextAttrs.width);
      if(nextAttrs && nextAttrs.align) applyAlignPreview(img, nextAttrs.align);
      syncEditorState();
      return true;
    }
    return false;
  }

  function createToolbarButton(label, title, onClick){
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.title = title;
    btn.addEventListener('mousedown', function(e){
      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  function selectImage(img, pos, keepExistingSelection){
    if(!img) return;
    if(!keepExistingSelection){
      clearSelectedImage(img);
    }
    state.selectedImg = img;
    state.selectedPos = typeof pos === 'number' ? pos : resolveImagePos(img);
    state.selectedImg.classList.add('img-selected');
    var editor = getEditor();
    if(editor && state.selectedPos >= 0){
      try{
        if(editor.commands && typeof editor.commands.setNodeSelection === 'function'){
          editor.commands.setNodeSelection(state.selectedPos);
        }
      }catch(e){}
    }
    if(state.toolbar){
      updateToolbarState();
      return;
    }
    addImgToolbar(state.selectedImg);
    addResizeHandle(state.selectedImg);
    updateToolbarState();
  }

  function setSelectedPercentWidth(percent){
    var pct = normalizePercent(percent);
    if(state.selectedImg) applyWidthPreview(state.selectedImg, pct);
    updateSelectedImageAttrs({ width:formatPercent(pct) });
  }

  function nudgeSelectedWidth(delta){
    if(!state.selectedImg) return;
    var current = resolvePercentFromImage(state.selectedImg);
    setSelectedPercentWidth(current + delta);
  }

  function setSelectedAlign(align){
    var next = normalizeAlign(align);
    if(state.selectedImg) applyAlignPreview(state.selectedImg, next);
    updateSelectedImageAttrs({ align:next });
  }

  function addResizeHandle(img){
    removeResizeHandle();
    if(!img || !document.body) return;
    var handle = document.createElement('div');
    handle.className = 'img-resize-handle';
    handle.style.position = 'fixed';
    handle.style.zIndex = '1300';
    handle.addEventListener('mousedown', function(e){
      e.preventDefault();
      e.stopPropagation();
      if(!state.selectedImg) return;
      state.resizing = true;
      state.resizeStartX = e.clientX;
      state.resizeStartW = state.selectedImg.getBoundingClientRect().width || state.selectedImg.offsetWidth || 200;
      document.addEventListener('mousemove', onResizeMove);
      document.addEventListener('mouseup', stopResize);
    });
    document.body.appendChild(handle);
    state.resizeHandle = handle;
    positionFloatingControls();
  }

  function onResizeMove(e){
    if(!state.resizing || !state.selectedImg) return;
    e.preventDefault();
    var maxWidth = getImageMaxWidth();
    var nextPx = clamp(state.resizeStartW + (e.clientX - state.resizeStartX), 80, maxWidth);
    var nextPct = normalizePercent((nextPx / Math.max(1, maxWidth)) * 100);
    applyWidthPreview(state.selectedImg, nextPct);
    if(state.toolbarSlider) state.toolbarSlider.value = String(Math.round(nextPct));
    if(state.toolbarSizeLabel) state.toolbarSizeLabel.textContent = String(Math.round(nextPct)) + '%';
    positionFloatingControls();
  }

  function stopResize(){
    if(!state.resizing) return;
    state.resizing = false;
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', stopResize);
    if(!state.selectedImg) return;
    var pct = resolvePercentFromImage(state.selectedImg);
    updateSelectedImageAttrs({ width:formatPercent(pct) });
  }

  function addImgToolbar(img){
    removeImgToolbar();
    if(!img || !document.body) return;
    var toolbar = document.createElement('div');
    toolbar.className = 'img-toolbar';
    toolbar.contentEditable = 'false';
    toolbar.style.position = 'fixed';
    toolbar.style.transform = 'none';
    toolbar.style.zIndex = '1250';

    var minusBtn = createToolbarButton('-', 'Kucult', function(){ nudgeSelectedWidth(-10); });
    var plusBtn = createToolbarButton('+', 'Buyut', function(){ nudgeSelectedWidth(10); });
    var leftBtn = createToolbarButton('Sol+Metin', 'Gorsel solda, metin kutusu sagda', function(){ convertSelectedImageToSideText('left'); });
    var centerBtn = createToolbarButton('Orta', 'Ortala', function(){ setSelectedAlign('center'); });
    var rightBtn = createToolbarButton('Sag+Metin', 'Gorsel sagda, metin kutusu solda', function(){ convertSelectedImageToSideText('right'); });
    var slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '10';
    slider.max = '100';
    slider.step = '1';
    slider.style.width = '92px';
    slider.style.cursor = 'pointer';
    slider.style.margin = '0 4px';
    slider.addEventListener('mousedown', function(e){ e.stopPropagation(); });
    slider.addEventListener('input', function(e){
      var value = normalizePercent(e && e.target ? e.target.value : 70);
      if(state.selectedImg) applyWidthPreview(state.selectedImg, value);
      if(state.toolbarSizeLabel) state.toolbarSizeLabel.textContent = String(Math.round(value)) + '%';
      positionFloatingControls();
    });
    slider.addEventListener('change', function(e){
      var value = normalizePercent(e && e.target ? e.target.value : 70);
      setSelectedPercentWidth(value);
    });

    var sizeLabel = document.createElement('span');
    sizeLabel.style.fontSize = '10px';
    sizeLabel.style.color = 'var(--txt2)';
    sizeLabel.style.minWidth = '36px';
    sizeLabel.style.textAlign = 'right';

    [minusBtn, plusBtn, leftBtn, centerBtn, rightBtn].forEach(function(btn){
      toolbar.appendChild(btn);
    });
    toolbar.appendChild(slider);
    toolbar.appendChild(sizeLabel);

    toolbar.addEventListener('mousedown', function(e){
      e.preventDefault();
      e.stopPropagation();
    });
    toolbar.addEventListener('click', function(e){
      e.stopPropagation();
    });

    document.body.appendChild(toolbar);
    state.toolbar = toolbar;
    state.toolbarSlider = slider;
    state.toolbarSizeLabel = sizeLabel;
    updateToolbarState();
  }

  function removeSelectedImage(imagePos){
    var editor = getEditor();
    var posHint = (typeof imagePos === 'number' && imagePos >= 0)
      ? imagePos
      : (state.selectedPos >= 0 ? state.selectedPos : resolveImagePos(state.selectedImg));
    if(posHint < 0){
      posHint = getImageSelectionPosFromEditor();
    }
    if(editor && editor.state && editor.view){
      var pos = posHint;
      var node = pos >= 0 ? editor.state.doc.nodeAt(pos) : null;
      if(node && node.type && node.type.name === 'image'){
        try{
          var tr = editor.state.tr.delete(pos, pos + node.nodeSize);
          editor.view.dispatch(tr);
          clearSelectedImage(null);
          removeResizeHandle();
          removeImgToolbar();
          syncEditorState();
          return true;
        }catch(e){}
      }
    }
    if(!state.selectedImg) return false;
    try{
      state.selectedImg.remove();
      clearSelectedImage(null);
      removeResizeHandle();
      removeImgToolbar();
      syncEditorState();
      return true;
    }catch(e){}
    return false;
  }

  function isEditableInput(target){
    if(!target || !target.tagName) return false;
    var tag = String(target.tagName).toLowerCase();
    if(tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return !!target.isContentEditable;
  }

  function bindImageSelection(){
    var host = getHost();
    if(!host) return;
    host.addEventListener('click', function(e){
      if(e.target && e.target.closest && e.target.closest('.img-toolbar,.img-resize-handle')) return;
      if(e.target && e.target.tagName === 'IMG'){
        selectImage(e.target, resolveImagePos(e.target));
      }else{
        clearSelectedImage(null);
        removeResizeHandle();
        removeImgToolbar();
      }
    });
  }

  function insertTextAfterImage(text, imagePos){
    var editor = getEditor();
    if(!editor || !editor.chain) return false;
    var cursorPos = ensureParagraphCursorAfterImage(imagePos);
    if(cursorPos < 0) return false;
    try{
      editor.chain().focus().setTextSelection(cursorPos).insertContent(text).run();
      return true;
    }catch(e){}
    return false;
  }

  function insertLineAfterImage(imagePos){
    var editor = getEditor();
    if(!editor || !editor.chain) return false;
    var cursorPos = ensureParagraphCursorAfterImage(imagePos);
    if(cursorPos < 0) return false;
    try{
      editor.chain().focus().setTextSelection(cursorPos).enter().run();
      return true;
    }catch(e){}
    return false;
  }

  function bindDeleteKey(){
    function isEditorEventTarget(target){
      if(!target) return false;
      var host = getHost();
      if(host && (target === host || (typeof host.contains === 'function' && host.contains(target)))) return true;
      var editorDom = getEditorDom();
      if(editorDom && (target === editorDom || (typeof editorDom.contains === 'function' && editorDom.contains(target)))) return true;
      return false;
    }

    function routeTypingFromSelectedImage(key, imagePos){
      var editor = getEditor();
      if(!editor || !editor.chain) return false;
      var targetPos = (typeof imagePos === 'number' && imagePos >= 0)
        ? imagePos
        : (state.selectedPos >= 0 ? state.selectedPos : getImageSelectionPosFromEditor());
      if(targetPos < 0) return false;
      clearSelectedImage(null);
      removeResizeHandle();
      removeImgToolbar();
      var placed = placeCaretInsideSideTextCell(targetPos);
      if(!placed){
        placed = placeCaretAtClickOrAfterImage({ imagePos:targetPos, preferAfterImage:true });
      }
      if(!placed){
        try{
          var docSize = editor.state && editor.state.doc && editor.state.doc.content
            ? (editor.state.doc.content.size || 0)
            : 0;
          var safePos = clamp(targetPos + 1, 0, docSize);
          editor.chain().focus().setTextSelection(safePos).run();
          placed = true;
        }catch(_fallbackErr){}
      }
      if(!placed) return false;
      try{
        if(key === 'Enter'){
          editor.chain().focus().enter().run();
          return true;
        }
        if(typeof key === 'string' && key.length === 1){
          editor.chain().focus().insertContent(key).run();
          return true;
        }
      }catch(e){}
      return false;
    }

    document.addEventListener('keydown', function(e){
      if(state.selectedImg && document.body && !document.body.contains(state.selectedImg)){
        clearSelectedImage(null);
        removeResizeHandle();
        removeImgToolbar();
      }
      var selectionImagePos = getImageSelectionPosFromEditor();
      var activeImagePos = state.selectedPos >= 0 ? state.selectedPos : selectionImagePos;
      var hasImageSelection = !!state.selectedImg || activeImagePos >= 0;
      if(hasImageSelection){
        if(e.key === 'Escape'){
          var escPos = activeImagePos;
          clearSelectedImage(null);
          removeResizeHandle();
          removeImgToolbar();
          placeCaretAtClickOrAfterImage({ imagePos: escPos });
          return;
        }
        if((e.key === 'Delete' || e.key === 'Backspace') && selectionImagePos >= 0 && isEditorEventTarget(e.target)){
          e.preventDefault();
          removeSelectedImage(selectionImagePos);
          return;
        }
        if(!e.ctrlKey && !e.metaKey && !e.altKey){
          var isTypingKey = e.key === 'Enter' || (typeof e.key === 'string' && e.key.length === 1);
          if(isTypingKey && selectionImagePos >= 0 && (!isEditableInput(e.target) || isEditorEventTarget(e.target))){
            e.preventDefault();
            routeTypingFromSelectedImage(e.key, selectionImagePos);
            return;
          }
        }
      }
    });
  }

  function createDragGhost(img){
    if(state.dragGhost || !img || !document.body) return;
    var ghost = document.createElement('div');
    ghost.style.cssText = 'position:fixed;pointer-events:none;opacity:.55;z-index:1400;border:1px solid var(--acc);background:rgba(255,255,255,.7);padding:2px;';
    var clone = img.cloneNode();
    clone.style.width = Math.round(img.getBoundingClientRect().width || img.offsetWidth || 200) + 'px';
    clone.style.height = 'auto';
    clone.style.margin = '0';
    clone.style.display = 'block';
    ghost.appendChild(clone);
    document.body.appendChild(ghost);
    state.dragGhost = ghost;
  }

  function moveImageNode(oldPos, dropPos){
    var editor = getEditor();
    if(!editor || !editor.state || !editor.view || oldPos < 0 || typeof dropPos !== 'number') return false;
    var node = editor.state.doc.nodeAt(oldPos);
    if(!node || !node.type || node.type.name !== 'image') return false;
    var imageJSON = node.toJSON();
    try{
      var tr = editor.state.tr.delete(oldPos, oldPos + node.nodeSize);
      editor.view.dispatch(tr);
    }catch(e){
      return false;
    }
    var targetPos = dropPos > oldPos ? dropPos - node.nodeSize : dropPos;
    targetPos = clamp(targetPos, 0, editor.state.doc.content.size);
    var inserted = false;
    try{
      inserted = !!editor.chain().focus().insertContentAt(targetPos, imageJSON).run();
    }catch(e){
      inserted = false;
    }
    if(!inserted){
      try{
        var fallbackNode = editor.state.schema.nodeFromJSON(imageJSON);
        var fallbackTr = editor.state.tr.insert(targetPos, fallbackNode);
        editor.view.dispatch(fallbackTr);
        inserted = true;
      }catch(_e){
        inserted = false;
      }
    }
    if(!inserted){
      try{
        editor.chain().focus().insertContentAt(clamp(oldPos, 0, editor.state.doc.content.size), imageJSON).run();
      }catch(_restoreErr){}
      return false;
    }
    var src = imageJSON && imageJSON.attrs ? imageJSON.attrs.src : '';
    var nextPos = findNearestImagePos(targetPos, src);
    state.selectedPos = nextPos;
    if(nextPos >= 0 && editor.commands && typeof editor.commands.setNodeSelection === 'function'){
      try{ editor.commands.setNodeSelection(nextPos); }catch(e){}
    }
    setTimeout(function(){
      var nextImg = getSelectedImageFromPos();
      if(nextImg) selectImage(nextImg, nextPos, true);
    }, 0);
    syncEditorState();
    return true;
  }

  function bindImageDrag(){
    var host = getHost();
    if(!host) return;
    host.addEventListener('mousedown', function(e){
      if(!e.target || e.target.tagName !== 'IMG' || e.button !== 0) return;
      if(e.target.closest && e.target.closest('.img-toolbar,.img-resize-handle,.ctx-menu')) return;
      state.dragImg = e.target;
      state.dragPos = resolveImagePos(e.target);
      state.dragStartX = e.clientX;
      state.dragStartY = e.clientY;
      state.dragActive = false;

      function onMove(ev){
        if(!state.dragImg) return;
        var dx = ev.clientX - state.dragStartX;
        var dy = ev.clientY - state.dragStartY;
        if(!state.dragActive){
          if(Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          state.dragActive = true;
          createDragGhost(state.dragImg);
        }
        ev.preventDefault();
        if(state.dragGhost){
          state.dragGhost.style.left = Math.round(ev.clientX + 8) + 'px';
          state.dragGhost.style.top = Math.round(ev.clientY + 8) + 'px';
        }
      }

      function onUp(ev){
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        var moved = false;
        if(state.dragActive){
          ev.preventDefault();
          var editor = getEditor();
          if(editor && editor.view && typeof editor.view.posAtCoords === 'function'){
            var coords = editor.view.posAtCoords({ left:ev.clientX, top:ev.clientY });
            if(coords && typeof coords.pos === 'number'){
              moved = moveImageNode(state.dragPos, coords.pos);
            }
          }
        }
        if(state.dragGhost && state.dragGhost.parentNode){
          state.dragGhost.parentNode.removeChild(state.dragGhost);
        }
        state.dragGhost = null;
        state.dragImg = null;
        state.dragPos = -1;
        state.dragActive = false;
        if(!moved && e.target && e.target.tagName === 'IMG'){
          selectImage(e.target, resolveImagePos(e.target));
        }
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function bindFloatingControlReposition(){
    window.addEventListener('resize', positionFloatingControls);
    document.addEventListener('scroll', positionFloatingControls, true);
  }

  function init(){
    if(state.initialized) return true;
    state.initialized = true;
    window.__aqTipTapWordMediaV1 = true;
    bindImageSelection();
    bindDeleteKey();
    bindImageDrag();
    bindFloatingControlReposition();
    return true;
  }

  return {
    init: init,
    clearSelection: function(){
      clearSelectedImage(null);
      removeResizeHandle();
      removeImgToolbar();
    }
  };
});
