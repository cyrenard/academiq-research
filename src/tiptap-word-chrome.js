(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordChrome = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  var zenState = {
    active: false,
    startTime: null,
    timer: null,
    mouseTimer: null
  };

  function snapshot(){
    return {
      active: !!zenState.active,
      startTime: zenState.startTime,
      timer: zenState.timer,
      mouseTimer: zenState.mouseTimer
    };
  }

  function setWordGoal(options){
    options = options || {};
    var prompt = typeof options.prompt === 'function'
      ? options.prompt
      : function(){ return Promise.resolve(null); };
    return Promise.resolve(prompt('Kelime hedefi:', options.currentGoal || '')).then(function(value){
      if(value === null) return null;
      var nextGoal = parseInt(value, 10) || 0;
      if(typeof options.setGoal === 'function'){
        options.setGoal(nextGoal);
      }
      if(typeof options.save === 'function'){
        options.save();
      }
      if(typeof options.syncStatus === 'function'){
        options.syncStatus();
      }
      return nextGoal;
    });
  }

  function setCitationMode(options){
    options = options || {};
    if(typeof options.setMode === 'function'){
      options.setMode(options.mode);
    }
    var root = options.root || options.doc || null;
    if(root && typeof root.querySelectorAll === 'function'){
      root.querySelectorAll('.tgm').forEach(function(button){
        if(button && button.classList){
          button.classList.remove('on');
        }
      });
    }
    if(options.button && options.button.classList){
      options.button.classList.add('on');
    }
    var value = typeof options.getSearchValue === 'function'
      ? options.getSearchValue()
      : '';
    if(typeof options.renderTrigger === 'function'){
      options.renderTrigger(value);
    }
    if(typeof options.renderReferences === 'function'){
      options.renderReferences();
    }
    return options.mode;
  }

  function toggleZenMode(options){
    options = options || {};
    zenState.active = !zenState.active;
    var body = options.body || null;
    if(body && body.classList){
      body.classList.toggle('zen', zenState.active);
    }
    if(zenState.active){
      zenState.startTime = typeof options.now === 'function' ? options.now() : Date.now();
      if(zenState.timer){
        clearInterval(zenState.timer);
      }
      zenState.timer = setInterval(function(){
        if(typeof options.onTick === 'function'){
          options.onTick();
        }
      }, parseInt(options.tickMs, 10) || 1000);
      if(typeof options.focusEditor === 'function'){
        options.focusEditor();
      }
      if(typeof options.bindMouseTracking === 'function'){
        options.bindMouseTracking();
      }
    }else{
      if(zenState.timer){
        clearInterval(zenState.timer);
      }
      zenState.timer = null;
      zenState.startTime = null;
      if(typeof options.unbindMouseTracking === 'function'){
        options.unbindMouseTracking();
      }
      var toolbar = options.toolbar || null;
      if(toolbar && toolbar.style){
        toolbar.style.opacity = '1';
      }
    }
    return snapshot();
  }

  function handleZenMouseMove(options){
    options = options || {};
    var toolbar = options.toolbar || null;
    if(toolbar && toolbar.style){
      toolbar.style.opacity = '1';
    }
    if(zenState.mouseTimer){
      clearTimeout(zenState.mouseTimer);
    }
    zenState.mouseTimer = setTimeout(function(){
      if(toolbar && toolbar.style){
        toolbar.style.opacity = '0';
      }
    }, parseInt(options.hideDelay, 10) || 3000);
    return snapshot();
  }

  function updateZenTime(options){
    options = options || {};
    if(!zenState.startTime) return false;
    var now = typeof options.now === 'function' ? options.now() : Date.now();
    var elapsed = Math.max(0, Math.floor((now - zenState.startTime) / 1000));
    var minutes = Math.floor(elapsed / 60);
    var seconds = elapsed % 60;
    var timeEl = options.timeEl || null;
    if(timeEl){
      timeEl.textContent = minutes + 'dk ' + String(seconds).padStart(2, '0') + 'sn';
    }
    var wordsEl = options.wordsEl || null;
    if(wordsEl){
      var words = typeof options.getWordCount === 'function' ? options.getWordCount() : 0;
      wordsEl.textContent = words + ' kelime';
    }
    return true;
  }

  function isZenActive(){
    return !!zenState.active;
  }

  return {
    setWordGoal: setWordGoal,
    setCitationMode: setCitationMode,
    toggleZenMode: toggleZenMode,
    handleZenMouseMove: handleZenMouseMove,
    updateZenTime: updateZenTime,
    isZenActive: isZenActive,
    getZenState: snapshot
  };
});
