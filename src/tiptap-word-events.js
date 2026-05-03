(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordEvents = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  var state = {
    initialized: false,
    observer: null,
    ctxMenu: null,
    ctxDocBound: false,
    ctxHostBound: false,
    watchRetryTimer: null,
    pendingCitationKey: ''
  };

  function getSurface(){
    return typeof window !== 'undefined' ? (window.AQTipTapWordSurface || null) : null;
  }

  function getHost(){
    var surface = getSurface();
    return surface && typeof surface.getHost === 'function' ? surface.getHost() : null;
  }

  function getPage(){
    return typeof document !== 'undefined' ? document.getElementById('apapage') : null;
  }

  function getScroll(){
    return typeof document !== 'undefined' ? document.getElementById('escroll') : null;
  }

  function getEditorDom(){
    var surface = getSurface();
    return surface && typeof surface.getEditorDom === 'function' ? surface.getEditorDom() : null;
  }

  function applySurfaceAttributes(root){
    if(typeof document === 'undefined') return false;
    root = root || document;
    var targets = [
      document.body,
      document.getElementById('apapage'),
      document.getElementById('apaed'),
      document.querySelector('#apaed .ProseMirror'),
      root && root.querySelector ? root.querySelector('.ProseMirror') : null,
      root && root.nodeType === 1 ? root : null
    ].filter(Boolean);
    targets.forEach(function(node){
      node.setAttribute('spellcheck','true');
    });
    return !!targets.length;
  }

  function bindSelectionChange(){
    if(typeof document === 'undefined') return;
    document.addEventListener('selectionchange', function(){
      var host = getHost();
      var sel = document.getSelection && document.getSelection();
      if(host && sel && sel.anchorNode && host.contains(sel.anchorNode) && typeof window.updateFmtState === 'function'){
        window.updateFmtState();
      }
    });
  }

  function bindTriggerEvents(){
    var host = getHost();
    if(!host) return;
    host.addEventListener('keyup', function(e){
      if(window.__aqCitationRuntimeV1){
        setTimeout(function(){ if(window.AQCitationRuntime) window.AQCitationRuntime.refreshFromEditor(); }, 0);
        return;
      }
      if(e.key === 'r' || e.key === 'R' || e.key === '/' || e.key === 'Backspace'){
        setTimeout(window.checkTrig, 0);
      }
    });
    host.addEventListener('input', function(){
      if(window.__aqCitationRuntimeV1){
        setTimeout(function(){ if(window.AQCitationRuntime) window.AQCitationRuntime.refreshFromEditor(); }, 0);
        return;
      }
      setTimeout(window.checkTrig, 0);
    });
    host.addEventListener('beforeinput', function(e){
      if(window.__aqCitationRuntimeV1){
        setTimeout(function(){ if(window.AQCitationRuntime) window.AQCitationRuntime.refreshFromEditor(); }, 0);
        return;
      }
      if(e && typeof e.data === 'string' && (e.data === '/' || e.data.toLowerCase() === 'r')){
        setTimeout(window.checkTrig, 0);
      }
    });
  }

  function bindFocusEvents(){
    var host = getHost();
    var page = getPage();
    var scroll = getScroll();
    console.log('[bindFocusEvents] host:', host, 'page:', page, 'scroll:', scroll);
    function getElementTarget(target){
      if(!target) return null;
      return target.nodeType === 3 ? target.parentElement : target;
    }
    function shouldFocusTarget(target){
      target = getElementTarget(target);
      if(!target) return false;
      if(target.closest && target.closest('.img-toolbar,.img-resize-handle,.toc-delete,.ctx-menu,.aq-cmdpal-bg,.aq-shortcuts-bg')) return false;
      if(target.closest && target.closest('.pdf-annot')) return false;
      if(host && host.contains(target)) return true;
      return target.closest ? !!target.closest('.ProseMirror,#aq-tiptap-content,#apaed') : false;
    }
    function focusEditorSurface(){
      console.log('[focusEditorSurface] attempting focus');
      if(window.__aqEditorArchitectureV1 && window.AQEditorCore && typeof window.AQEditorCore.focus === 'function'){
        console.log('[focusEditorSurface] using AQEditorCore.focus');
        window.AQEditorCore.focus(false);
      }
      if(window.AQTipTapWordSurface && typeof window.AQTipTapWordSurface.focus === 'function'){
        console.log('[focusEditorSurface] using AQTipTapWordSurface.focus');
        window.AQTipTapWordSurface.focus({ toEnd:false });
      }
      if(typeof window.editor !== 'undefined' && window.editor){
        try{
          if(window.editor.chain && typeof window.editor.chain === 'function'){
            console.log('[focusEditorSurface] using editor.chain().focus()');
            window.editor.chain().focus().run();
          }else if(window.editor.commands && typeof window.editor.commands.focus === 'function'){
            console.log('[focusEditorSurface] using editor.commands.focus()');
            window.editor.commands.focus();
          }else if(typeof window.editor.focus === 'function'){
            console.log('[focusEditorSurface] using editor.focus()');
            window.editor.focus();
          }
        }catch(e){ console.log('[focusEditorSurface] editor method error:', e); }
        try{
          if(window.editor.view && window.editor.view.dom && typeof window.editor.view.dom.focus === 'function'){
            console.log('[focusEditorSurface] using editor.view.dom.focus()');
            window.editor.view.dom.focus({ preventScroll:true });
          }
        }catch(e){ console.log('[focusEditorSurface] editor.view error:', e); }
      }
    }
    if(host){
      host.addEventListener('focusin', function(){
        try{ host.dispatchEvent(new Event('input', { bubbles:true })); }catch(e){}
      });
      ['pointerdown','mousedown'].forEach(function(type){
        host.addEventListener(type, function(e){
          console.log('[event:' + type + '] target:', e.target, 'shouldFocus:', shouldFocusTarget(e.target));
          if(!shouldFocusTarget(e.target)) return;
          setTimeout(focusEditorSurface, 0);
        });
      });
      host.addEventListener('click', function(e){
        var target = e && e.target ? (e.target.nodeType === 3 ? e.target.parentElement : e.target) : null;
        var citation = target && target.closest ? target.closest('.cit') : null;
        if(!citation) return;
        var refId = String(citation.getAttribute('data-ref') || '').split(',').map(function(id){
          return String(id || '').trim();
        }).filter(Boolean)[0] || '';
        if(!refId) return;
        if(typeof e.preventDefault === 'function') e.preventDefault();
        if(typeof e.stopPropagation === 'function') e.stopPropagation();
        var api = window.AQBibliographyState || null;
        var jump = typeof window.jumpToBibliographyEntry === 'function'
          ? window.jumpToBibliographyEntry
          : (api && typeof api.jumpToBibliographyEntry === 'function'
            ? api.jumpToBibliographyEntry
            : null);
        if(jump){
          jump(refId, {
            pageEl: document.getElementById('bibpage'),
            bodyEl: document.getElementById('bibbody'),
            openBibliography: function(){
              if(typeof window.updateRefSection === 'function') window.updateRefSection(true);
              var page = document.getElementById('bibpage');
              if(page && page.style) page.style.display = 'block';
            },
            scroller: document.getElementById('escroll'),
            behavior: 'smooth',
            block: 'center'
          });
        }else if(typeof window.insRefs === 'function'){
          window.insRefs();
        }
      }, true);
    }
    ['pointerdown','mousedown','click'].forEach(function(type){
      document.addEventListener(type, function(e){
        if(!shouldFocusTarget(e.target)) return;
        setTimeout(focusEditorSurface, 0);
      }, true);
    });
    if(page){
      page.addEventListener('click', function(e){
        if(e.target === page && window.__aqEditorArchitectureV1 && window.AQEditorCore){
          setTimeout(function(){ window.AQEditorCore.focus(false); }, 0);
        }
      });
    }
    if(scroll){
      scroll.addEventListener('click', function(e){
        if(e.target === scroll && window.__aqEditorArchitectureV1 && window.AQEditorCore){
          setTimeout(function(){ window.AQEditorCore.focus(false); }, 0);
        }
      });
    }
  }

  function bindClickAnywhereTyping(){
    var host = getHost();
    if(!host) return;
    host.addEventListener('dblclick', function(e){
      if(e.target !== host) return;
      var hostRect = host.getBoundingClientRect();
      var clickY = e.clientY - hostRect.top;
      var contentHeight = host.scrollHeight;
      if(clickY <= contentHeight) return;
      var lineHeight = Math.max(8, parseFloat(getComputedStyle(host).lineHeight) || 32);
      var needed = Math.min(10, Math.ceil((clickY - contentHeight) / lineHeight));
      for(var i = 0; i < needed; i++){
        var p = document.createElement('p');
        p.innerHTML = '<br>';
        host.appendChild(p);
      }
      var last = host.lastElementChild;
      if(last){
        var range = document.createRange();
        range.setStart(last, 0);
        range.collapse(true);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      if(typeof window.uSt === 'function') window.uSt();
      if(typeof window.save === 'function') window.save();
      if(typeof window.updatePageHeight === 'function') window.updatePageHeight();
    });
  }

  function hideContextMenu(){
    if(state.ctxMenu && state.ctxMenu.parentNode){
      state.ctxMenu.parentNode.removeChild(state.ctxMenu);
    }
    state.ctxMenu = null;
    if(typeof document !== 'undefined'){
      var legacy = document.getElementById('ctxmenu');
      if(legacy) legacy.classList.remove('show');
    }
  }

  function normalizeSelectionText(text){
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  }

  function getSelectedText(editor){
    if(editor && editor.state && editor.state.selection && editor.state.doc){
      if(editor.state.selection.empty) return '';
      return editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ');
    }
    var sel = window.getSelection && window.getSelection();
    return sel && sel.toString ? sel.toString() : '';
  }

  function getSelectionCitationKey(host){
    host = host || getHost();
    if(!host || typeof document === 'undefined') return '';
    var sel = window.getSelection && window.getSelection();
    if(!sel || !sel.rangeCount || sel.isCollapsed) return '';
    var fallbackText = normalizeSelectionText(sel.toString ? sel.toString() : '');
    var range = sel.getRangeAt(0);
    function findCitationNode(node){
      while(node && node !== host){
        if(node.nodeType === 1 && node.classList && node.classList.contains('cit')){
          return node;
        }
        node = node.parentNode;
      }
      return null;
    }
    var node = findCitationNode(range.commonAncestorContainer || range.startContainer || null);
    if(!node && typeof host.querySelectorAll === 'function'){
      var nodes = Array.prototype.slice.call(host.querySelectorAll('.cit'));
      node = nodes.find(function(el){
        try{
          return !!(range.intersectsNode && range.intersectsNode(el));
        }catch(_e){
          return false;
        }
      }) || null;
    }
    if(!node){
      return fallbackText ? 'sel:' + encodeURIComponent(fallbackText) + '#1' : '';
    }
    var refIds = String(node.getAttribute('data-ref') || '').split(',').map(function(id){
      return String(id || '').trim();
    }).filter(Boolean);
    if(!refIds.length) return '';
    var seenBySignature = {};
    var rows = Array.prototype.slice.call(host.querySelectorAll('.cit'));
    for(var i = 0; i < rows.length; i++){
      var row = rows[i];
      var rowRefIds = String(row.getAttribute('data-ref') || '').split(',').map(function(id){
        return String(id || '').trim();
      }).filter(Boolean);
      if(!rowRefIds.length) continue;
      var signature = rowRefIds.join(',');
      seenBySignature[signature] = (seenBySignature[signature] || 0) + 1;
      if(row === node){
        return 'ref:' + signature + '#' + seenBySignature[signature];
      }
    }
    if(fallbackText) return 'sel:' + encodeURIComponent(fallbackText) + '#1';
    return 'ref:' + refIds.join(',') + '#1';
  }

  async function fetchGrammarSuggestions(selectionText){
    void selectionText;
    return [];
  }

  function buildContextMenuModel(hasSelection, options){
    var opts = options && typeof options === 'object' ? options : {};
    var citationKey = String(opts.citationKey || '').trim();
    var items = [];
    if(hasSelection && Array.isArray(opts.grammarSuggestions) && opts.grammarSuggestions.length){
      opts.grammarSuggestions.forEach(function(item){
        items.push(item);
      });
      items.push({ kind:'sep' });
    }else if(hasSelection && opts.grammarChecked){
      items.push({ kind:'hint', label:'Dil kontrolu: onerilen duzeltme yok', disabled:true });
      items.push({ kind:'sep' });
    }
    if(hasSelection){
      items.push({ kind:'action', action:'cut', label:'Kes', key:'Ctrl+X' });
      items.push({ kind:'action', action:'copy', label:'Kopyala', key:'Ctrl+C' });
    }
    items.push({ kind:'action', action:'paste', label:'Yapistir', key:'Ctrl+V' });
    if(hasSelection){
      items.push({ kind:'sep' });
      items.push({ kind:'action', action:'bold', label:'Kalin', key:'Ctrl+B' });
      items.push({ kind:'action', action:'italic', label:'Italik', key:'Ctrl+I' });
      items.push({ kind:'action', action:'underline', label:'Alti Cizili', key:'Ctrl+U' });
    }
    items.push({ kind:'sep' });
    items.push({ kind:'action', action:'selectAll', label:'Tumunu Sec', key:'Ctrl+A' });
    return items;
  }

  function runContextMenuAction(action, item, options){
    options = options || {};
    var editor = typeof window !== 'undefined' ? (window.editor || null) : null;
    if(action === 'replaceSelection'){
      var replacement = item && typeof item.replacement === 'string' ? item.replacement : '';
      if(!replacement) return;
      if(editor && editor.chain){
        editor.chain().focus().insertContent(replacement).run();
        return;
      }
      if(typeof document !== 'undefined') document.execCommand('insertText', false, replacement);
      return;
    }
    if(action === 'cut'){
      if(editor && editor.state && editor.state.selection){
        var text = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ');
        if(typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText){
          navigator.clipboard.writeText(text).catch(function(){});
        }
        editor.chain().focus().deleteSelection().run();
        return;
      }
      if(typeof document !== 'undefined') document.execCommand('cut');
      return;
    }
    if(action === 'copy'){
      if(typeof document !== 'undefined') document.execCommand('copy');
      return;
    }
    if(action === 'paste'){
      if(typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText){
        navigator.clipboard.readText().then(function(text){
          if(editor && editor.chain){
            editor.chain().focus().insertContent(text).run();
            return;
          }
          if(typeof document !== 'undefined') document.execCommand('insertText', false, text);
        }).catch(function(){});
      }
      return;
    }
    if(action === 'bold' || action === 'italic' || action === 'underline'){
      if(typeof window !== 'undefined' && typeof window.ec === 'function'){
        window.ec(action);
      }
      return;
    }
    if(action === 'selectAll'){
      if(editor && editor.commands && typeof editor.commands.selectAll === 'function'){
        editor.commands.selectAll();
        return;
      }
      if(typeof document !== 'undefined') document.execCommand('selectAll');
    }
  }

  function bindContextMenu(){
    if(typeof document === 'undefined') return;

    if(!state.ctxDocBound){
      state.ctxDocBound = true;
      document.addEventListener('click', hideContextMenu);
      document.addEventListener('keydown', hideContextMenu);
      document.addEventListener('contextmenu', function(e){
        var t = e && e.target;
        if(t && t.nodeType === 3) t = t.parentElement;
        var toc = t && t.closest ? t.closest('.toc-container') : null;
        if(!toc) return;
        e.preventDefault();
        hideContextMenu();
        var menu = document.getElementById('ctxmenu');
        if(!menu) return;
        menu.innerHTML = '';
        [
          { label:'İçindekileri Güncelle', fn:function(){ if(typeof window.insertTOC === 'function') window.insertTOC(); } },
          { label:'İçindekileri Sil', fn:function(){ if(typeof window.removeTOC === 'function') window.removeTOC(); } }
        ].forEach(function(item){
          var btn = document.createElement('button');
          btn.className = 'ctxi';
          btn.textContent = item.label;
          btn.addEventListener('click', function(ev){
            ev.preventDefault();
            ev.stopPropagation();
            hideContextMenu();
            item.fn();
          });
          menu.appendChild(btn);
        });
        menu.style.left = Math.min(e.clientX, window.innerWidth - 220) + 'px';
        menu.style.top = Math.min(e.clientY, window.innerHeight - 120) + 'px';
        menu.classList.add('show');
      });
    }

    var host = getHost();
    if(!host || state.ctxHostBound) return;
    state.ctxHostBound = true;

    host.addEventListener('contextmenu', async function(e){
      var t = e && e.target;
      if(t && t.nodeType === 3) t = t.parentElement;
      if(t && t.closest && t.closest('.toc-container')) return;
      e.preventDefault();
      hideContextMenu();
      var editor = typeof window !== 'undefined' ? (window.editor || null) : null;
      var hasSelection = false;
      if(editor && editor.state && editor.state.selection){
        hasSelection = !editor.state.selection.empty;
      }else{
        var sel = window.getSelection && window.getSelection();
        hasSelection = !!(sel && sel.toString && sel.toString().length);
      }
      var grammarSuggestions = [];
      var grammarChecked = false;
      var citationKey = getSelectionCitationKey(host);
      if(hasSelection){
        var grammarResult = await Promise.race([
          fetchGrammarSuggestions(getSelectedText(editor)).then(function(items){
            return { checked:true, items:items };
          }),
          new Promise(function(resolve){
            setTimeout(function(){
              resolve({ checked:false, items:[] });
            }, 450);
          })
        ]);
        grammarSuggestions = Array.isArray(grammarResult.items) ? grammarResult.items : [];
        grammarChecked = !!grammarResult.checked;
      }
      var menu = document.createElement('div');
      menu.className = 'ctx-menu';
      buildContextMenuModel(hasSelection, {
        grammarSuggestions: grammarSuggestions,
        grammarChecked: grammarChecked,
        citationKey: citationKey
      }).forEach(function(item){
        if(item.kind === 'sep'){
          var sep = document.createElement('div');
          sep.className = 'ctx-sep';
          menu.appendChild(sep);
          return;
        }
        var row = document.createElement('div');
        row.textContent = item.label;
        if(item.kind === 'hint' || item.disabled){
          row.className = 'ctx-disabled';
          menu.appendChild(row);
          return;
        }
        if(item.key){
          var key = document.createElement('span');
          key.className = 'ctx-shortcut';
          key.textContent = item.key;
          row.appendChild(key);
        }
        row.addEventListener('click', function(ev){
          ev.preventDefault();
          ev.stopPropagation();
          hideContextMenu();
          runContextMenuAction(item.action, item, { citationKey: citationKey });
        });
        menu.appendChild(row);
      });
      menu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
      menu.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';
      document.body.appendChild(menu);
      state.ctxMenu = menu;
    });
  }

  function bindReferenceSync(){
    if(typeof document === 'undefined') return;
    document.addEventListener('focusout', function(e){
      var pm = getEditorDom();
      if(pm && e.target && (e.target === pm || pm.contains(e.target))){
        setTimeout(function(){
          var active = document.activeElement;
          if(window.__aqCitationSyncInProgress) return;
          if(!(pm && active && (active === pm || pm.contains(active))) && typeof window.scheduleRefSectionSync === 'function'){
            window.scheduleRefSectionSync();
          }
        }, 30);
      }
    });
  }

  function watchSurface(){
    if(typeof MutationObserver === 'undefined') return;
    var host = getHost();
    if(!host){
      if(!state.watchRetryTimer){
        state.watchRetryTimer = setTimeout(function(){
          state.watchRetryTimer = null;
          bindContextMenu();
          watchSurface();
        }, 300);
      }
      return;
    }
    if(state.observer) state.observer.disconnect();
    applySurfaceAttributes(host);
    state.observer = new MutationObserver(function(){
      applySurfaceAttributes(host);
    });
    state.observer.observe(host, { childList:true, subtree:true, attributes:false });
    bindContextMenu();
  }

  function init(){
    if(state.initialized) return true;
    state.initialized = true;
    window.__aqTipTapWordEventsV1 = true;
    console.log('[AQTipTapWordEvents.init] starting event binding setup');
    bindSelectionChange();
    bindTriggerEvents();
    bindFocusEvents();
    bindClickAnywhereTyping();
    bindContextMenu();
    bindReferenceSync();
    watchSurface();
    console.log('[AQTipTapWordEvents.init] completed event binding setup');
    return true;
  }

  return {
    init:init,
    watchSurface:watchSurface,
    applySurfaceAttributes:applySurfaceAttributes,
    buildContextMenuModel:buildContextMenuModel,
    fetchGrammarSuggestions:fetchGrammarSuggestions
  };
});
