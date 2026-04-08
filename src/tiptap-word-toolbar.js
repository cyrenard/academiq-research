(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordToolbar = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  function normalizeColorValue(color, fallback){
    if(!color) return fallback || '#000000';
    if(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)){
      if(color.length === 4){
        return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
      }
      return color.toLowerCase();
    }
    var match = String(color).match(/rgb\s*\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    if(match){
      var toHex = function(n){
        n = Math.max(0, Math.min(255, parseInt(n, 10) || 0));
        return n.toString(16).padStart(2, '0');
      };
      return '#' + toHex(match[1]) + toHex(match[2]) + toHex(match[3]);
    }
    return fallback || '#000000';
  }

  function computeWordCount(text){
    return String(text || '')
      .trim()
      .split(/\s+/)
      .filter(function(word){ return word.length > 0; })
      .length;
  }

  function buildGoalState(words, goal){
    if(!goal || goal <= 0){
      return { text:'', color:'' };
    }
    var pct = Math.round(words / goal * 100);
    var color = pct >= 100 ? 'var(--blue)' : pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--acc)' : 'var(--red)';
    return {
      text: words + '/' + goal + ' <span style="color:' + color + ';font-weight:600">(%' + pct + ')</span>',
      color: color
    };
  }

  function getStats(options){
    options = options || {};
    var editor = options.editor || null;
    var host = options.host || null;
    var refs = parseInt(options.refs, 10) || 0;
    var text = '';
    var cites = 0;
    if(editor && typeof editor.getText === 'function'){
      text = editor.getText();
      if(editor.view && editor.view.dom){
        cites = editor.view.dom.querySelectorAll('.cit').length;
      }
    }else if(host){
      text = host.innerText || '';
      cites = host.querySelectorAll ? host.querySelectorAll('.cit').length : 0;
    }
    return {
      words: computeWordCount(text),
      cites: cites,
      refs: refs
    };
  }

  function syncCommandButtons(doc, defs){
    defs.forEach(function(def){
      var btn = doc.getElementById(def.id);
      if(!btn) return;
      btn.classList[def.active ? 'add' : 'remove']('active');
      btn.classList[def.active ? 'add' : 'remove']('is-active');
    });
  }

  function resolveTextAlign(editor){
    if(!editor) return 'left';
    if(typeof editor.isActive === 'function'){
      if(editor.isActive({ textAlign:'center' })) return 'center';
      if(editor.isActive({ textAlign:'right' })) return 'right';
      if(editor.isActive({ textAlign:'justify' })) return 'justify';
      if(editor.isActive({ textAlign:'left' })) return 'left';
    }
    var paragraphAttrs = typeof editor.getAttributes === 'function' ? (editor.getAttributes('paragraph') || {}) : {};
    var headingAttrs = typeof editor.getAttributes === 'function' ? (editor.getAttributes('heading') || {}) : {};
    return headingAttrs.textAlign || paragraphAttrs.textAlign || 'left';
  }

  function syncFormatState(options){
    options = options || {};
    var editor = options.editor || null;
    var doc = options.doc || (typeof document !== 'undefined' ? document : null);
    if(!doc) return false;
    if(!editor){
      var queryState = typeof options.queryState === 'function'
        ? options.queryState
        : function(){ return false; };
      syncCommandButtons(doc, [
        { id:'btnBold', active:!!queryState('bold') },
        { id:'btnItalic', active:!!queryState('italic') },
        { id:'btnUnderline', active:!!queryState('underline') },
        { id:'btnStrike', active:!!queryState('strikeThrough') }
      ]);
      return true;
    }
    syncCommandButtons(doc, [
      { id:'btnBold', active:editor.isActive('bold') },
      { id:'btnItalic', active:editor.isActive('italic') },
      { id:'btnUnderline', active:editor.isActive('underline') },
      { id:'btnStrike', active:editor.isActive('strike') },
      { id:'btnParagraph', active:editor.isActive('paragraph') && !editor.isActive('blockquote') },
      { id:'btnBlockQuote', active:editor.isActive('blockquote') },
      { id:'btnUnorderedList', active:editor.isActive('bulletList') },
      { id:'btnOrderedList', active:editor.isActive('orderedList') },
      { id:'btnAlignLeft', active:resolveTextAlign(editor) === 'left' },
      { id:'btnAlignCenter', active:resolveTextAlign(editor) === 'center' },
      { id:'btnAlignRight', active:resolveTextAlign(editor) === 'right' }
    ]);
    var attrs = editor.getAttributes('textStyle') || {};
    var fontSel = doc.getElementById('fontsel');
    var sizeSel = doc.getElementById('sizesel');
    var txtColor = doc.getElementById('txtColor');
    var hlColor = doc.getElementById('hlColor');
    if(fontSel) fontSel.value = attrs.fontFamily || 'Times New Roman';
    if(sizeSel) sizeSel.value = attrs.fontSize ? String(attrs.fontSize).replace(/pt$/i, '') : '12';
    if(txtColor) txtColor.value = normalizeColorValue(attrs.color, '#000000');
    var hlAttrs = editor.getAttributes('highlight') || {};
    if(hlColor) hlColor.value = normalizeColorValue(hlAttrs.color, '#ffff00');
    for(var _lvl=1;_lvl<=5;_lvl++){
      var _btn=doc.getElementById('btnH'+_lvl);
      if(_btn){
        if(editor.isActive('heading',{level:_lvl})){
          _btn.classList.add('heading-active');
          _btn.classList.add('active');
          _btn.classList.add('is-active');
        }else{
          _btn.classList.remove('heading-active');
          _btn.classList.remove('active');
          _btn.classList.remove('is-active');
        }
      }
    }
    return true;
  }

  function syncStatus(options){
    options = options || {};
    var doc = options.doc || (typeof document !== 'undefined' ? document : null);
    if(!doc) return false;
    var stats = getStats(options);
    var tbinfo = doc.getElementById('tbinfo');
    var sbw = doc.getElementById('sbw');
    var sbc = doc.getElementById('sbc');
    var sbr2 = doc.getElementById('sbr2');
    var sbgoal = doc.getElementById('sbgoal');
    if(tbinfo) tbinfo.textContent = stats.words + ' kelime';
    if(sbw) sbw.textContent = stats.words + ' kelime';
    if(sbc) sbc.textContent = stats.cites + ' atıf';
    if(sbr2) sbr2.textContent = stats.refs + ' kaynak';
    if(sbgoal){
      var goalState = buildGoalState(stats.words, options.wordGoal);
      sbgoal.innerHTML = goalState.text;
      sbgoal.style.color = goalState.color;
    }
    return true;
  }

  function syncEditorUI(options){
    options = options || {};
    if(!options.skipFormat){
      syncFormatState(options);
    }
    if(!options.skipStatus){
      syncStatus(options);
    }
    return true;
  }

  function syncFormatUI(options){
    options = options || {};
    try{
      return syncEditorUI({
        editor: options.editor || null,
        doc: options.doc || null,
        skipStatus: true,
        queryState: options.queryState || null
      });
    }catch(e){}
    return false;
  }

  function syncStatusUI(options){
    options = options || {};
    var host = typeof options.getHost === 'function'
      ? options.getHost()
      : (options.host || null);
    var refs = typeof options.getRefs === 'function'
      ? options.getRefs()
      : (parseInt(options.refs, 10) || 0);
    return syncEditorUI({
      doc: options.doc || null,
      editor: options.editor || null,
      host: host,
      refs: refs,
      wordGoal: options.wordGoal || 0,
      skipFormat: true
    });
  }

  return {
    normalizeColorValue: normalizeColorValue,
    computeWordCount: computeWordCount,
    buildGoalState: buildGoalState,
    getStats: getStats,
    syncFormatState: syncFormatState,
    syncStatus: syncStatus,
    syncEditorUI: syncEditorUI,
    syncFormatUI: syncFormatUI,
    syncStatusUI: syncStatusUI
  };
});
