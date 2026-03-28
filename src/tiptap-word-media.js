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
    resizing: false,
    resizeStartX: 0,
    resizeStartW: 0,
    dragImg: null,
    dragWrap: null,
    dragGhost: null,
    dragStartY: 0
  };

  function getSurface(){
    return typeof window !== 'undefined' ? (window.AQTipTapWordSurface || null) : null;
  }

  function getHost(){
    var surface = getSurface();
    return surface && typeof surface.getHost === 'function' ? surface.getHost() : null;
  }

  function getPageHost(){
    return typeof document !== 'undefined' ? document.getElementById('apaed') : null;
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

  function removeResizeHandles(){
    var host = getHost();
    if(!host) return;
    Array.from(host.querySelectorAll('.img-resize-handle')).forEach(function(handle){ handle.remove(); });
  }

  function removeImgToolbar(){
    var host = getHost();
    if(!host) return;
    Array.from(host.querySelectorAll('.img-toolbar')).forEach(function(toolbar){ toolbar.remove(); });
  }

  function clearSelectedImage(except){
    var host = getHost();
    if(!host) return;
    Array.from(host.querySelectorAll('img.img-selected')).forEach(function(img){
      if(img !== except) img.classList.remove('img-selected');
    });
    if(!except) state.selectedImg = null;
  }

  function addResizeHandle(img){
    var wrap = img && img.parentElement;
    if(!wrap || wrap === getPageHost()) return;
    wrap.style.position = 'relative';
    wrap.style.display = 'inline-block';
    var handle = document.createElement('div');
    handle.className = 'img-resize-handle';
    handle.style.right = '-5px';
    handle.style.bottom = '-5px';
    handle.style.position = 'absolute';
    handle.addEventListener('mousedown', function(e){
      e.preventDefault();
      e.stopPropagation();
      state.resizing = true;
      state.resizeStartX = e.clientX;
      state.resizeStartW = img.offsetWidth;
      document.addEventListener('mousemove', onResize);
      document.addEventListener('mouseup', stopResize);
    });
    wrap.appendChild(handle);
  }

  function onResize(e){
    if(!state.resizing || !state.selectedImg) return;
    var newWidth = Math.max(50, state.resizeStartW + (e.clientX - state.resizeStartX));
    state.selectedImg.style.width = newWidth + 'px';
    state.selectedImg.style.height = 'auto';
    state.selectedImg.style.maxWidth = 'none';
  }

  function stopResize(){
    state.resizing = false;
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', stopResize);
    syncEditorState();
  }

  function addImgToolbar(img){
    var wrap = img && img.parentElement;
    if(!wrap || wrap === getPageHost()) return;
    wrap.style.position = 'relative';
    var toolbar = document.createElement('div');
    toolbar.className = 'img-toolbar';
    toolbar.contentEditable = 'false';
    [
      { label:'\u25C0', title:'Sola hizala', align:'left' },
      { label:'\u25A0', title:'Ortala', align:'center' },
      { label:'\u25B6', title:'Sağa hizala', align:'right' }
    ].forEach(function(def){
      var btn = document.createElement('button');
      btn.textContent = def.label;
      btn.title = def.title;
      btn.addEventListener('mousedown', function(e){
        e.preventDefault();
        e.stopPropagation();
      });
      btn.addEventListener('click', function(e){
        e.preventDefault();
        e.stopPropagation();
        wrap.style.textAlign = def.align;
        if(def.align === 'left'){
          wrap.style.display = 'block';
          wrap.style.marginRight = 'auto';
          wrap.style.marginLeft = '0';
        }else if(def.align === 'right'){
          wrap.style.display = 'block';
          wrap.style.marginLeft = 'auto';
          wrap.style.marginRight = '0';
        }else{
          wrap.style.display = 'block';
          wrap.style.marginLeft = 'auto';
          wrap.style.marginRight = 'auto';
        }
        syncEditorState();
      });
      toolbar.appendChild(btn);
    });
    wrap.appendChild(toolbar);
  }

  function bindImageSelection(){
    var host = getHost();
    if(!host) return;
    host.addEventListener('click', function(e){
      clearSelectedImage(e.target && e.target.tagName === 'IMG' ? e.target : null);
      removeResizeHandles();
      removeImgToolbar();
      if(e.target && e.target.tagName === 'IMG'){
        state.selectedImg = e.target;
        state.selectedImg.classList.add('img-selected');
        addResizeHandle(state.selectedImg);
        addImgToolbar(state.selectedImg);
      }else{
        state.selectedImg = null;
      }
    });
  }

  function bindDeleteKey(){
    document.addEventListener('keydown', function(e){
      var host = getHost();
      var active = document.activeElement;
      var editorFocused = !!(host && active && (active === host || host.contains(active)));
      if(state.selectedImg && (e.key === 'Delete' || e.key === 'Backspace') && !editorFocused){
        e.preventDefault();
        var wrap = state.selectedImg.parentElement;
        if(wrap && wrap !== getPageHost()) wrap.remove();
        else state.selectedImg.remove();
        state.selectedImg = null;
        removeResizeHandles();
        removeImgToolbar();
        syncEditorState();
      }
    });
  }

  function bindImageDrag(){
    var host = getHost();
    if(!host) return;
    host.addEventListener('mousedown', function(e){
      if(!e.target || e.target.tagName !== 'IMG') return;
      if(window.__aqTipTapWordEventsV1 && e.target.closest && e.target.closest('.ctx-menu')) return;
      var wrap = e.target.parentElement;
      if(!wrap || wrap === getPageHost()) return;
      state.dragImg = e.target;
      state.dragWrap = wrap;
      state.dragStartY = e.clientY;
      function onMove(ev){
        if(!state.dragImg) return;
        if(Math.abs(ev.clientY - state.dragStartY) < 10) return;
        ev.preventDefault();
        if(!state.dragGhost){
          state.dragGhost = document.createElement('div');
          state.dragGhost.style.cssText = 'position:fixed;pointer-events:none;opacity:.5;z-index:100;';
          state.dragGhost.appendChild(state.dragImg.cloneNode());
          state.dragGhost.firstChild.style.width = state.dragImg.offsetWidth + 'px';
          document.body.appendChild(state.dragGhost);
        }
        state.dragGhost.style.left = ev.clientX + 'px';
        state.dragGhost.style.top = ev.clientY + 'px';
      }
      function onUp(ev){
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if(state.dragGhost){
          state.dragGhost.remove();
          state.dragGhost = null;
          var range = null;
          if(document.caretRangeFromPoint){
            range = document.caretRangeFromPoint(ev.clientX, ev.clientY);
          }else if(document.caretPositionFromPoint){
            var cp = document.caretPositionFromPoint(ev.clientX, ev.clientY);
            if(cp){
              range = document.createRange();
              range.setStart(cp.offsetNode, cp.offset);
            }
          }
          if(range && host.contains(range.startContainer)){
            var marker = document.createElement('span');
            range.insertNode(marker);
            marker.parentNode.insertBefore(state.dragWrap, marker);
            marker.remove();
            syncEditorState();
          }
        }
        state.dragImg = null;
        state.dragWrap = null;
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function init(){
    if(state.initialized) return true;
    state.initialized = true;
    window.__aqTipTapWordMediaV1 = true;
    bindImageSelection();
    bindDeleteKey();
    bindImageDrag();
    return true;
  }

  return {
    init: init,
    clearSelection: function(){
      clearSelectedImage(null);
      removeResizeHandles();
      removeImgToolbar();
    }
  };
});
