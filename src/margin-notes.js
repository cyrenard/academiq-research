/* margin-notes.js — AcademiQ Margin Notes
 * Academic annotation layer anchored to editor blocks.
 * Notes are rendered in the page margin (outside A4), excluded from exports.
 */
(function(root){
  'use strict';

  // ── Constants ───────────────────────────────────────────────────────────────
  var TYPE_META = {
    note:     { label:'Not',        bg:'#e8f0fe', border:'#4a80d4' },
    outline:  { label:'Taslak',     bg:'#e8f5e9', border:'#2e7d32' },
    todo:     { label:'Yapılacak',  bg:'#fffde7', border:'#f4b400' },
    argument: { label:'Argüman',    bg:'#fce8e6', border:'#c62828' },
    source:   { label:'Kaynak',     bg:'#f3e8fd', border:'#8e24aa' }
  };
  var DEFAULT_TYPE = 'note';
  var CARD_W = 176;   // px — card width
  var CARD_GAP = 8;   // px — min vertical gap between cards

  // ── State ───────────────────────────────────────────────────────────────────
  var _notes = {};         // { [id]: { id, blockId, type, text, createdAt } }
  var _visible = true;
  var _modeActive = false;
  var _editor = null;
  var _layer = null;       // #mn-layer DOM element
  var _hint = null;        // #mn-mode-hint DOM element
  var _renderTimer = null;
  var _initialized = false;
  var _pendingType = DEFAULT_TYPE;

  // ── ID helpers ──────────────────────────────────────────────────────────────
  function uid(){
    return 'mn' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function blockUid(){
    return 'mb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ── Block-id assignment ─────────────────────────────────────────────────────
  // Finds the ProseMirror node for a DOM element and sets data-mn-block-id
  function getOrAssignBlockId(el){
    if(!_editor) return null;
    // Return existing id if already set in DOM
    var existing = el.getAttribute('data-mn-block-id');
    if(existing) return existing;
    var id = blockUid();
    try{
      var view = _editor.view;
      var pos = view.posAtDOM(el, 0);
      // posAtDOM gives position inside the node; node position is one before
      var nodePos = pos - 1;
      if(nodePos < 0) nodePos = 0;
      var $pos = _editor.state.doc.resolve(nodePos);
      var node = $pos.nodeAfter || _editor.state.doc.nodeAt(nodePos);
      if(!node) return null;
      var newAttrs = Object.assign({}, node.attrs, { 'data-mn-block-id': id });
      var tr = _editor.state.tr.setNodeMarkup(nodePos, null, newAttrs);
      tr.setMeta('addToHistory', false);
      view.dispatch(tr);
    } catch(e){
      // Fallback: set directly on DOM (won't survive editor re-render)
      el.setAttribute('data-mn-block-id', id);
    }
    return id;
  }

  // Find the DOM element for a given blockId
  function findBlockEl(blockId){
    if(!_editor) return null;
    var dom = _editor.view.dom;
    return dom.querySelector('[data-mn-block-id="' + blockId + '"]') || null;
  }

  // ── Note CRUD ───────────────────────────────────────────────────────────────
  function createNote(blockEl, type){
    type = type || _pendingType;
    var blockId = getOrAssignBlockId(blockEl);
    if(!blockId) return null;
    var id = uid();
    _notes[id] = { id:id, blockId:blockId, type:type, text:'', createdAt:Date.now() };
    scheduleRender();
    scheduleAutosave();
    return id;
  }

  function updateNoteText(id, text){
    if(!_notes[id]) return;
    _notes[id].text = text;
    scheduleAutosave();
  }

  function updateNoteType(id, type){
    if(!_notes[id] || !TYPE_META[type]) return;
    _notes[id].type = type;
    scheduleRender();
    scheduleAutosave();
  }

  function deleteNote(id){
    if(!_notes[id]) return;
    delete _notes[id];
    // Remove card from DOM immediately
    if(_layer){
      var card = _layer.querySelector('[data-mn-id="' + id + '"]');
      if(card) card.remove();
    }
    scheduleAutosave();
    scheduleRender();
  }

  // ── Rendering ───────────────────────────────────────────────────────────────
  function scheduleRender(){
    clearTimeout(_renderTimer);
    _renderTimer = setTimeout(renderAllNotes, 60);
  }

  function renderAllNotes(){
    if(!_layer || !_editor) return;

    // Collect all notes grouped by blockId
    var byBlock = {};
    Object.keys(_notes).forEach(function(id){
      var n = _notes[id];
      if(!byBlock[n.blockId]) byBlock[n.blockId] = [];
      byBlock[n.blockId].push(n);
    });

    // Get layer rect (position:fixed, so it's the viewport)
    var layerRect = _layer.getBoundingClientRect();

    // Build placement list: { note, top }
    var placements = [];
    Object.keys(byBlock).forEach(function(blockId){
      var el = findBlockEl(blockId);
      if(!el) return;
      var rect = el.getBoundingClientRect();
      var blockTop = rect.top - layerRect.top;  // relative to layer (which is viewport)
      byBlock[blockId].forEach(function(note, idx){
        placements.push({ note:note, top: blockTop + idx * (CARD_GAP + 2) });
      });
    });

    // Sort by top
    placements.sort(function(a, b){ return a.top - b.top; });

    // Collision avoidance: nudge down
    for(var i = 1; i < placements.length; i++){
      var prev = placements[i - 1];
      var cur  = placements[i];
      // Estimate height (measured from existing card or default 90px)
      var prevCard = _layer.querySelector('[data-mn-id="' + prev.note.id + '"]');
      var prevH = prevCard ? prevCard.offsetHeight : 90;
      var minTop = prev.top + prevH + CARD_GAP;
      if(cur.top < minTop) cur.top = minTop;
    }

    // Remove cards that no longer exist in _notes
    Array.prototype.slice.call(_layer.querySelectorAll('.mn-card')).forEach(function(c){
      if(!_notes[c.getAttribute('data-mn-id')]) c.remove();
    });

    // Create/update cards
    placements.forEach(function(p){
      var note = p.note;
      var meta = TYPE_META[note.type] || TYPE_META[DEFAULT_TYPE];
      var card = _layer.querySelector('[data-mn-id="' + note.id + '"]');
      if(!card){
        card = buildCard(note, meta);
        _layer.appendChild(card);
      } else {
        // Update colors if type changed
        card.style.background = meta.bg;
        card.style.borderLeftColor = meta.border;
      }
      card.style.top = Math.max(0, p.top) + 'px';
      card.style.display = _visible ? '' : 'none';
    });
  }

  function buildCard(note, meta){
    var card = document.createElement('div');
    card.className = 'mn-card';
    card.setAttribute('data-mn-id', note.id);
    card.setAttribute('data-mn-block', note.blockId);
    card.style.cssText = [
      'position:absolute',
      'width:' + CARD_W + 'px',
      'background:' + meta.bg,
      'border-left:3px solid ' + meta.border,
      'border-radius:3px',
      'padding:6px 8px',
      'box-shadow:0 1px 4px rgba(0,0,0,.18)',
      'font-family:Arial,sans-serif',
      'font-size:11px',
      'line-height:1.4',
      'z-index:80',
      'box-sizing:border-box',
      'pointer-events:all'
    ].join(';');

    // Header row: type label + delete button
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;';

    var typeBtn = document.createElement('button');
    typeBtn.className = 'mn-type-btn';
    typeBtn.textContent = meta.label;
    typeBtn.title = 'Tür değiştir';
    typeBtn.setAttribute('data-mn-id', note.id);
    typeBtn.style.cssText = [
      'border:none',
      'background:rgba(0,0,0,.08)',
      'border-radius:2px',
      'padding:1px 5px',
      'font-size:10px',
      'cursor:pointer',
      'color:#333',
      'font-family:inherit'
    ].join(';');

    var delBtn = document.createElement('button');
    delBtn.className = 'mn-del-btn';
    delBtn.innerHTML = '&times;';
    delBtn.title = 'Notu sil';
    delBtn.setAttribute('data-mn-id', note.id);
    delBtn.style.cssText = [
      'border:none',
      'background:none',
      'font-size:14px',
      'line-height:1',
      'cursor:pointer',
      'color:#888',
      'padding:0 2px',
      'font-family:inherit'
    ].join(';');

    header.appendChild(typeBtn);
    header.appendChild(delBtn);

    var ta = document.createElement('textarea');
    ta.className = 'mn-ta';
    ta.setAttribute('data-mn-id', note.id);
    ta.value = note.text || '';
    ta.placeholder = 'Not ekle...';
    ta.style.cssText = [
      'width:100%',
      'border:none',
      'background:transparent',
      'resize:none',
      'font-family:inherit',
      'font-size:11px',
      'line-height:1.4',
      'min-height:52px',
      'outline:none',
      'box-sizing:border-box',
      'color:#222',
      'overflow:hidden'
    ].join(';');

    card.appendChild(header);
    card.appendChild(ta);

    // Auto-resize textarea
    function autoResize(){
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    }
    ta.addEventListener('input', function(){
      updateNoteText(note.id, ta.value);
      autoResize();
    });
    ta.addEventListener('focus', function(){ autoResize(); });
    setTimeout(autoResize, 0);

    // Delete
    delBtn.addEventListener('click', function(e){
      e.stopPropagation();
      deleteNote(note.id);
    });

    // Type cycle
    var typeOrder = Object.keys(TYPE_META);
    typeBtn.addEventListener('click', function(e){
      e.stopPropagation();
      var cur = typeOrder.indexOf(note.type);
      var next = typeOrder[(cur + 1) % typeOrder.length];
      updateNoteType(note.id, next);
      typeBtn.textContent = TYPE_META[next].label;
    });

    return card;
  }

  // ── Mode & visibility ────────────────────────────────────────────────────────
  function setMnModeActive(active){
    _modeActive = !!active;
    if(_hint){
      _hint.style.display = _modeActive ? 'flex' : 'none';
    }
    var apapage = document.getElementById('apapage');
    if(apapage){
      if(_modeActive) apapage.classList.add('mn-mode');
      else apapage.classList.remove('mn-mode');
    }
    var modeBtn = document.getElementById('btnMnMode');
    if(modeBtn) modeBtn.classList.toggle('efmt-active', _modeActive);
  }

  function toggleMnMode(){
    setMnModeActive(!_modeActive);
  }

  function setMnVisible(vis){
    _visible = !!vis;
    if(_layer){
      Array.prototype.slice.call(_layer.querySelectorAll('.mn-card')).forEach(function(c){
        c.style.display = _visible ? '' : 'none';
      });
    }
    var btn = document.getElementById('btnMnToggle');
    if(btn) btn.classList.toggle('efmt-active', _visible);
  }

  function toggleMnVisible(){
    setMnVisible(!_visible);
  }

  // ── Editor click handler ────────────────────────────────────────────────────
  function handleEditorClick(e){
    if(!_modeActive) return;
    // Walk up to find a block element (p or h1-h5)
    var el = e.target;
    while(el && el !== document.body){
      var tag = el.tagName && el.tagName.toUpperCase();
      if(tag === 'P' || (tag && /^H[1-5]$/.test(tag))){
        e.preventDefault();
        e.stopPropagation();
        createNote(el, _pendingType);
        return;
      }
      el = el.parentElement;
    }
  }

  // ── Window resize / scroll → re-render ─────────────────────────────────────
  function handleViewportChange(){
    scheduleRender();
  }

  // ── Persistence ─────────────────────────────────────────────────────────────
  var _autosaveTimer = null;
  function scheduleAutosave(){
    clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(function(){
      if(typeof window.save === 'function') window.save();
    }, 800);
  }

  // Called from getEditorHTML / save flow — appends store div
  function hookGetHTML(html){
    var storeDiv = buildStoreDiv();
    if(!storeDiv) return html;
    // Remove any existing store before appending fresh one
    html = String(html || '').replace(/<div class="aq-mn-store"[^>]*>[\s\S]*?<\/div>/, '');
    return html + storeDiv;
  }

  // Called when loading HTML — extract and remove store div
  function hookSetHTML(html){
    html = String(html || '');
    var storeRe = /<div class="aq-mn-store"[^>]*>([\s\S]*?)<\/div>/;
    var m = html.match(storeRe);
    if(m){
      try{
        var data = JSON.parse(decodeURIComponent(m[1]));
        _notes = {};
        if(data && typeof data === 'object'){
          Object.keys(data).forEach(function(id){
            _notes[id] = data[id];
          });
        }
      }catch(ex){}
      html = html.replace(storeRe, '');
    }
    scheduleRender();
    return html;
  }

  // Called before export — strip store div and all block-id attrs
  function stripForExport(html){
    html = String(html || '');
    // Remove store div
    html = html.replace(/<div class="aq-mn-store"[^>]*>[\s\S]*?<\/div>/g, '');
    // Remove data-mn-block-id attributes
    html = html.replace(/\s*data-mn-block-id="[^"]*"/g, '');
    return html;
  }

  function buildStoreDiv(){
    try{
      var json = JSON.stringify(_notes);
      return '<div class="aq-mn-store" style="display:none!important">' + encodeURIComponent(json) + '</div>';
    }catch(e){ return ''; }
  }

  // ── Layer positioning helper ─────────────────────────────────────────────────
  // The layer is position:fixed and covers the viewport.
  // Cards are positioned via getBoundingClientRect() coordinates.
  // We compute the right-side margin column: right of #apapage + gap.
  function getMarginLeft(){
    var page = document.getElementById('apapage');
    if(!page) return window.innerWidth - CARD_W - 20;
    var rect = page.getBoundingClientRect();
    return rect.right + 12;
  }

  function applyLayerColumn(){
    if(!_layer) return;
    var left = getMarginLeft();
    _layer.style.left = left + 'px';
    _layer.style.width = CARD_W + 'px';
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  function init(){
    if(_initialized) return;
    _initialized = true;

    _editor = window.editor || null;
    _layer  = document.getElementById('mn-layer');
    _hint   = document.getElementById('mn-mode-hint');

    if(!_layer){
      console.warn('AQMarginNotes: #mn-layer not found');
      return;
    }

    // Position the layer column
    applyLayerColumn();

    // Watch for page resize → recompute column
    var _colTimer = null;
    window.addEventListener('resize', function(){
      clearTimeout(_colTimer);
      _colTimer = setTimeout(applyLayerColumn, 100);
      handleViewportChange();
    });

    // Scroll within #escroll → re-render card positions
    var escroll = document.getElementById('escroll');
    if(escroll){
      escroll.addEventListener('scroll', handleViewportChange, { passive:true });
    }

    // Editor click in annotation mode
    var apaed = document.getElementById('apaed');
    if(apaed){
      apaed.addEventListener('click', handleEditorClick, true);
    }

    // Esc key exits annotation mode
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape' && _modeActive) setMnModeActive(false);
    });

    // Editor mutation → re-render (handles block reflow after typing)
    if(_editor){
      _editor.on('update', function(){
        scheduleRender();
      });
    }

    // Set initial toggle button state
    setMnVisible(_visible);

    // Render whatever was loaded
    scheduleRender();

    console.log('AQMarginNotes initialized');
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  root.AQMarginNotes = {
    init:           init,
    toggleMnMode:   toggleMnMode,
    setMnModeActive:setMnModeActive,
    toggleMnVisible:toggleMnVisible,
    setMnVisible:   setMnVisible,
    hookGetHTML:    hookGetHTML,
    hookSetHTML:    hookSetHTML,
    stripForExport: stripForExport,
    renderAllNotes: renderAllNotes,
    scheduleRender: scheduleRender,
    // Exposed for tests
    _notes:         _notes,
    _createNote:    createNote,
    _deleteNote:    deleteNote,
    _updateText:    updateNoteText,
    _updateType:    updateNoteType,
    _uid:           uid
  };

})(typeof window !== 'undefined' ? window : globalThis);
