(function(){
  var _boundResize = false;

  function qs(id){ return document.getElementById(id); }

  function injectStyles(){
    if(document.getElementById('aq-editor-shell-style')) return;
    var st = document.createElement('style');
    st.id = 'aq-editor-shell-style';
    st.textContent = [
      '#editor-shell{display:flex;flex:1;min-height:0;flex-direction:column;position:relative;}',
      '#editor-shell-top{display:flex;flex-direction:column;flex-shrink:0;min-height:0;}',
      '#editor-shell-body{display:flex;flex:1;min-height:0;flex-direction:column;position:relative;overflow:hidden;}',
      '#editor-shell-overlay{position:absolute;inset:0;z-index:1;pointer-events:none;}',
      '#editor-shell #doctabs,#editor-shell #etb,#editor-shell #findbar{position:relative;z-index:2;}',
      '#editor-shell #escroll{position:relative;z-index:1;flex:1;min-height:0;}',
      '#editor-shell #apapage{flex:0 0 auto;margin-left:auto;margin-right:auto;}',
      '#editor-shell #zoomBar{z-index:35;}',
      '#editor-shell #trig{position:absolute;z-index:200;pointer-events:auto;}'
    ].join('');
    document.head.appendChild(st);
  }

  function ensureStructure(){
    var ctr = qs('ctr');
    if(!ctr) return null;
    var shell = qs('editor-shell');
    if(!shell){
      shell = document.createElement('div');
      shell.id = 'editor-shell';
      var top = document.createElement('div');
      top.id = 'editor-shell-top';
      var body = document.createElement('div');
      body.id = 'editor-shell-body';
      var overlay = document.createElement('div');
      overlay.id = 'editor-shell-overlay';
      shell.appendChild(top);
      shell.appendChild(body);
      shell.appendChild(overlay);
      ctr.insertBefore(shell, ctr.firstChild);
    }
    return shell;
  }

  function moveIfNeeded(parent, node){
    if(!parent || !node) return;
    if(node.parentElement !== parent) parent.appendChild(node);
  }

  function init(){
    if(typeof console !== 'undefined'){ console.log('[AQ] editor-shell.init called') }
    injectStyles();
    var shell = ensureStructure();
    if(!shell) return;
    var top = qs('editor-shell-top');
    var body = qs('editor-shell-body');
    var overlay = qs('editor-shell-overlay');
    moveIfNeeded(top, qs('doctabs'));
    moveIfNeeded(top, qs('etb'));
    moveIfNeeded(top, qs('findbar'));
    moveIfNeeded(body, qs('escroll'));
    moveIfNeeded(body, qs('zoomBar'));
    // Place trigger outside the overlay to ensure it's clickable even if overlay blocks pointer events
    moveIfNeeded(shell, qs('trig'));
    syncLayout();
    if(!_boundResize){
      _boundResize = true;
      window.addEventListener('resize', syncLayout);
    }
    // Diagnostic: print stacking order of major elements
    try{
      function logStack(){
        var shellEl = document.getElementById('editor-shell');
        var overlayEl = document.getElementById('editor-shell-overlay');
        var trigEl = document.getElementById('trig');
        var contentRootEl = document.getElementById('apaed');
        var items = [
          {name:'shell', el: shellEl},
          {name:'overlay', el: overlayEl},
          {name:'trig', el: trigEl},
          {name:'contentRoot', el: contentRootEl}
        ];
        items.forEach(function(it){
          if(!it.el){ console.log('[AQ-STACK] '+ it.name +': not found'); return; }
          var cs = window.getComputedStyle(it.el);
          var z = parseInt(cs.zIndex, 10);
          if(isNaN(z)) z = 0;
          console.log('[AQ-STACK] '+ it.name +' zIndex='+ z +' display='+ cs.display +' pointerEvents='+ cs.pointerEvents);
        });
      }
      logStack();
    }catch(_e){}
  }

  function getRoot(){ return qs('editor-shell'); }
  function getScrollEl(){ return qs('escroll'); }
  function getOverlayRoot(){ return qs('editor-shell-overlay'); }
  function getBody(){ return qs('editor-shell-body'); }

  function syncLayout(){
    var ctr = qs('ctr');
    var shell = getRoot();
    var body = getBody();
    var scroll = getScrollEl();
    if(ctr) ctr.style.minHeight = '0';
    if(shell) shell.style.minHeight = '0';
    if(body){
      body.style.minHeight = '0';
      body.style.overflow = 'hidden';
    }
    if(scroll){
      scroll.style.minHeight = '0';
      scroll.style.overflowY = 'auto';
      scroll.style.overflowX = 'hidden';
      scroll.style.flex = '1 1 auto';
    }
  }

  function positionPopup(box, anchorRect){
    var overlay = getOverlayRoot();
    if(!box || !overlay) return;
    var hostRect = overlay.getBoundingClientRect();
    var left = 12;
    var top = 96;
    if(anchorRect){
      left = Math.max(12, Math.min(anchorRect.left - hostRect.left, hostRect.width - 420));
      top = Math.max(12, Math.min(anchorRect.bottom - hostRect.top + 8, hostRect.height - 320));
    }
    box.style.left = left + 'px';
    box.style.top = top + 'px';
  }

  window.AQEditorShell = {
    init: init,
    getRoot: getRoot,
    getScrollEl: getScrollEl,
    getOverlayRoot: getOverlayRoot,
    getBody: getBody,
    syncLayout: syncLayout,
    positionPopup: positionPopup
  };
})();
