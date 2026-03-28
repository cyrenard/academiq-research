(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordCommands = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  function buildAbstractHTML(){
    return '<h1>Abstract</h1><p class="ni">Ozet metni (150-250 kelime).</p><p class="ni"><em>Keywords:</em> kelime1, kelime2</p><p><br></p>';
  }

  function buildBlockquoteHTML(){
    return '<blockquote>Alinti metni (40+ kelime). (Yazar, Yil, s. XX)</blockquote><p><br></p>';
  }

  function buildFigureHTML(number, title){
    var n = String(number || '1');
    var t = String(title || '');
    return '<p style="text-align:center;text-indent:0">[Şekil ' + n + ']</p><p style="text-align:center;text-indent:0;font-style:italic">Şekil ' + n + (t ? ' - ' + t : '') + '</p><p><br></p>';
  }

  function buildTableHTML(options){
    options = options || {};
    var number = String(options.number || '1');
    var cols = Math.max(1, parseInt(options.cols, 10) || 3);
    var rows = Math.max(2, parseInt(options.rows, 10) || 4);
    var title = String(options.title || '');
    var note = String(options.note || '');
    var header = '';
    var body = '';
    for(var c = 0; c < cols; c++) header += '<th>Baslik ' + (c + 1) + '</th>';
    for(var r = 0; r < rows - 1; r++){
      body += '<tr>';
      for(var i = 0; i < cols; i++) body += '<td>&nbsp;</td>';
      body += '</tr>';
    }
    var html = '<p class="ni"><strong>Tablo ' + number + '</strong></p>';
    if(title) html += '<p class="ni"><em>' + title + '</em></p>';
    html += '<table><thead><tr>' + header + '</tr></thead><tbody>' + body + '</tbody></table>';
    if(note) html += '<p class="ni"><em>Not.</em> ' + note + '</p>';
    html += '<p><br></p>';
    return html;
  }

  function applyCommand(editor, cmd, val){
    if(!editor || !editor.chain) return false;
    var chain = editor.chain().focus();
    switch(cmd){
      case 'bold': chain.toggleBold().run(); return true;
      case 'italic': chain.toggleItalic().run(); return true;
      case 'underline': chain.toggleUnderline().run(); return true;
      case 'strikeThrough': chain.toggleStrike().run(); return true;
      case 'formatBlock':
        if(val === 'h1') chain.toggleHeading({ level:1 }).run();
        else if(val === 'h2') chain.toggleHeading({ level:2 }).run();
        else if(val === 'h3') chain.toggleHeading({ level:3 }).run();
        else if(val === 'h4') chain.toggleHeading({ level:4 }).run();
        else if(val === 'h5') chain.toggleHeading({ level:5 }).run();
        else if(val === 'p') chain.setParagraph().run();
        else return false;
        return true;
      case 'justifyLeft': chain.setTextAlign('left').run(); return true;
      case 'justifyCenter': chain.setTextAlign('center').run(); return true;
      case 'justifyRight': chain.setTextAlign('right').run(); return true;
      case 'justifyFull': chain.setTextAlign('justify').run(); return true;
      case 'insertUnorderedList': chain.toggleBulletList().run(); return true;
      case 'insertOrderedList': chain.toggleOrderedList().run(); return true;
      case 'fontName': chain.setFontFamily(val).run(); return true;
      case 'foreColor': chain.setColor(val).run(); return true;
      case 'hiliteColor': chain.toggleHighlight({ color:val }).run(); return true;
      case 'superscript': chain.toggleSuperscript().run(); return true;
      case 'subscript': chain.toggleSubscript().run(); return true;
      case 'indent': chain.sinkListItem('listItem').run(); return true;
      case 'outdent': chain.liftListItem('listItem').run(); return true;
      default: return false;
    }
  }

  function execCommand(options){
    options = options || {};
    var editor = options.editor || null;
    var cmd = options.cmd;
    var val = options.val;
    if(!applyCommand(editor, cmd, val)){
      return false;
    }
    if(typeof options.onApplied === 'function'){
      options.onApplied();
    }
    return true;
  }

  function syncCommandUI(options){
    options = options || {};
    if(typeof window !== 'undefined'
      && window.AQEditorRuntime
      && typeof window.AQEditorRuntime.syncCommandUI === 'function'){
      window.AQEditorRuntime.syncCommandUI();
      return true;
    }
    if(typeof options.onFallback === 'function'){
      options.onFallback();
      return true;
    }
    return false;
  }

  function execEditorCommand(options){
    options = options || {};
    var applied = execCommand(options);
    if(!applied && typeof applyCommand === 'function'){
      applied = applyCommand(options.editor || null, options.cmd, options.val);
    }
    if(!applied) return false;
    syncCommandUI({
      onFallback: options.onFallback
    });
    return true;
  }

  function runEditorCommand(options){
    options = options || {};
    var warn = typeof options.warn === 'function' ? options.warn : function(){};
    if(options.editor){
      if(execEditorCommand({
        editor: options.editor,
        cmd: options.cmd,
        val: options.val,
        onFallback: options.onFallback
      })) return true;

      if(execCommand({
        editor: options.editor,
        cmd: options.cmd,
        val: options.val,
        onApplied: function(){
          syncCommandUI({ onFallback: options.onFallback });
        }
      })) return true;

      if(applyCommand(options.editor, options.cmd, options.val)){
        syncCommandUI({ onFallback: options.onFallback });
        return true;
      }

      warn('unknown', options.cmd);
      return false;
    }
    warn('not-ready', options.cmd);
    return false;
  }

  function applyFontSize(editor, pt){
    if(!editor || !editor.chain) return false;
    editor.chain().focus().setMark('textStyle', { fontSize:String(pt) + 'pt' }).run();
    return true;
  }

  function execFontSize(options){
    options = options || {};
    if(!applyFontSize(options.editor || null, options.pt)){
      return false;
    }
    if(typeof options.onApplied === 'function'){
      options.onApplied(options.pt);
    }
    return true;
  }

  function applyFontSizeDom(options){
    options = options || {};
    var doc = options.documentObj || (typeof document !== 'undefined' ? document : null);
    var host = options.host || (doc && typeof doc.getElementById === 'function'
      ? doc.getElementById('apaed')
      : null);
    if(!doc || !host) return false;
    if(typeof host.focus === 'function'){
      try{ host.focus(); }catch(e){}
    }
    var selection = typeof options.getSelection === 'function'
      ? options.getSelection()
      : (typeof window !== 'undefined' && typeof window.getSelection === 'function'
          ? window.getSelection()
          : null);
    if(!selection || selection.isCollapsed) return false;
    var execCommand = typeof options.execCommand === 'function'
      ? options.execCommand
      : (typeof doc.execCommand === 'function'
          ? function(cmd, showUI, value){ return doc.execCommand(cmd, showUI, value); }
          : null);
    if(!execCommand) return false;
    execCommand('fontSize', false, '7');
    Array.from(host.querySelectorAll ? host.querySelectorAll('font[size="7"]') : []).forEach(function(font){
      var span = doc.createElement('span');
      span.style.fontSize = String(options.pt) + 'pt';
      span.innerHTML = font.innerHTML;
      if(font.parentNode && typeof font.parentNode.replaceChild === 'function'){
        font.parentNode.replaceChild(span, font);
      }
    });
    return true;
  }

  function runFontSize(options){
    options = options || {};
    if(execFontSize({
      editor: options.editor || null,
      pt: options.pt,
      onApplied: options.onApplied
    })){
      if(typeof options.onMutated === 'function'){
        options.onMutated(options.pt);
      }
      return true;
    }
    if(applyFontSizeDom({
      pt: options.pt,
      host: options.host || null,
      documentObj: options.documentObj || null,
      getSelection: options.getSelection,
      execCommand: options.execCommand
    })){
      if(typeof options.onApplied === 'function'){
        options.onApplied(options.pt);
      }
      if(typeof options.onMutated === 'function'){
        options.onMutated(options.pt);
      }
      return true;
    }
    return false;
  }

  function transformText(text, mode){
    text = String(text || '');
    if(mode === 'upper') return text.toLocaleUpperCase('tr-TR');
    if(mode === 'lower') return text.toLocaleLowerCase('tr-TR');
    if(mode === 'title'){
      return text
        .toLocaleLowerCase('tr-TR')
        .replace(/(^|[\s\u00A0]+)(\p{L})/gu, function(match, prefix, letter){
          return prefix + letter.toLocaleUpperCase('tr-TR');
        });
    }
    return text;
  }

  function execTextTransform(options){
    options = options || {};
    var editor = options.editor || null;
    if(!editor || !editor.state || !editor.chain) return false;
    var from = editor.state.selection.from;
    var to = editor.state.selection.to;
    if(from === to) return false;
    var text = editor.state.doc.textBetween(from, to, ' ');
    editor.chain().focus().insertContentAt({ from:from, to:to }, transformText(text, options.mode)).run();
    if(typeof options.onApplied === 'function'){
      options.onApplied();
    }
    return true;
  }

  function execTextTransformWithEffects(options){
    options = options || {};
    if(!execTextTransform({
      editor: options.editor || null,
      mode: options.mode,
      onApplied: options.onApplied
    })){
      return false;
    }
    if(typeof options.onMutated === 'function'){
      options.onMutated();
    }
    return true;
  }

  function runTextTransform(options){
    options = options || {};
    if(execTextTransformWithEffects({
      editor: options.editor || null,
      mode: options.mode,
      onMutated: options.onMutated
    })){
      return true;
    }
    if(execTextTransform({
      editor: options.editor || null,
      mode: options.mode,
      onApplied: options.onMutated
    })){
      return true;
    }
    return false;
  }

  function applyLineSpacing(value){
    var surface = typeof window !== 'undefined' ? (window.AQTipTapWordSurface || null) : null;
    var host = surface && typeof surface.getHost === 'function'
      ? surface.getHost()
      : (typeof document !== 'undefined' ? document.getElementById('apaed') : null);
    var editorDom = surface && typeof surface.getEditorDom === 'function'
      ? surface.getEditorDom()
      : (typeof document !== 'undefined' ? document.querySelector('#apaed .ProseMirror') : null);
    if(host) host.style.lineHeight = value;
    if(editorDom) editorDom.style.lineHeight = value;
    return value;
  }

  function execLineSpacing(options){
    options = options || {};
    var value = applyLineSpacing(options.value);
    if(typeof options.onApplied === 'function'){
      options.onApplied(value);
    }
    return value;
  }

  function execLineSpacingWithEffects(options){
    options = options || {};
    var value = execLineSpacing({
      value: options.value,
      onApplied: options.onApplied
    });
    if(typeof options.onMutated === 'function'){
      options.onMutated(value);
    }
    return value;
  }

  function runLineSpacing(options){
    options = options || {};
    if(execLineSpacingWithEffects({
      value: options.value,
      onMutated: options.onMutated
    })) return true;
    if(typeof execLineSpacing === 'function'){
      execLineSpacing({
        value: options.value,
        onApplied: options.onMutated
      });
      return true;
    }
    applyLineSpacing(options.value);
    if(typeof options.onMutated === 'function'){
      options.onMutated(options.value);
    }
    return true;
  }

  return {
    buildAbstractHTML: buildAbstractHTML,
    buildBlockquoteHTML: buildBlockquoteHTML,
    buildFigureHTML: buildFigureHTML,
    buildTableHTML: buildTableHTML,
    syncCommandUI: syncCommandUI,
    execCommand: execCommand,
    execEditorCommand: execEditorCommand,
    runEditorCommand: runEditorCommand,
    applyCommand: applyCommand,
    execFontSize: execFontSize,
    applyFontSize: applyFontSize,
    applyFontSizeDom: applyFontSizeDom,
    runFontSize: runFontSize,
    transformText: transformText,
    execTextTransform: execTextTransform,
    execTextTransformWithEffects: execTextTransformWithEffects,
    runTextTransform: runTextTransform,
    execLineSpacing: execLineSpacing,
    execLineSpacingWithEffects: execLineSpacingWithEffects,
    runLineSpacing: runLineSpacing,
    applyLineSpacing: applyLineSpacing
  };
});
