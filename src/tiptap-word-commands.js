(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordCommands = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  var apaStyleEngine = null;
  try{
    if(typeof require === 'function') apaStyleEngine = require('./apa-style-engine.js');
  }catch(_e){}
  if(!apaStyleEngine && typeof window !== 'undefined' && window.AQApaStyleEngine) apaStyleEngine = window.AQApaStyleEngine;

  function traceListStyle(scope, meta){
    if(typeof window === 'undefined' || !window.AQStability || typeof window.AQStability.capture !== 'function') return;
    try{
      window.AQStability.capture(scope, new Error(scope), meta || null);
    }catch(_e){}
  }

  function normalizeListStyleType(listType, value){
    var next = String(value == null ? '' : value).trim().toLowerCase();
    if(!next) return null;
    if(listType === 'bulletList'){
      return ['disc','circle','square'].indexOf(next) >= 0 ? next : null;
    }
    if(listType === 'orderedList'){
      return ['decimal','lower-alpha','lower-roman','upper-alpha','upper-roman'].indexOf(next) >= 0 ? next : null;
    }
    return null;
  }

  var TRACK_STATE_KEY = '__aqTrackChangesState';

  function getTrackRoot(){
    if(typeof window !== 'undefined') return window;
    if(typeof globalThis !== 'undefined') return globalThis;
    return null;
  }

  function ensureTrackChangesState(){
    var root = getTrackRoot();
    if(!root) return { enabled:false, updatedAt:0, author:'user' };
    if(!root[TRACK_STATE_KEY] || typeof root[TRACK_STATE_KEY] !== 'object'){
      root[TRACK_STATE_KEY] = { enabled:false, updatedAt:0, author:'user' };
    }
    return root[TRACK_STATE_KEY];
  }

  function applyTrackChangesBodyClass(enabled){
    var root = getTrackRoot();
    if(!root || !root.document || !root.document.body || !root.document.body.classList) return;
    root.document.body.classList.toggle('aq-track-changes-on', !!enabled);
  }

  function isTrackChangesEnabled(){
    return !!ensureTrackChangesState().enabled;
  }

  function setTrackChangesEnabled(enabled, options){
    options = options || {};
    var state = ensureTrackChangesState();
    var next = enabled == null ? !state.enabled : !!enabled;
    state.enabled = next;
    state.updatedAt = Date.now();
    if(options.author){
      state.author = String(options.author || '').trim() || state.author || 'user';
    }else if(!state.author){
      state.author = 'user';
    }
    applyTrackChangesBodyClass(next);
    var root = getTrackRoot();
    if(root && typeof root.dispatchEvent === 'function'){
      try{
        var eventCtor = root.CustomEvent || (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
        if(eventCtor){
          root.dispatchEvent(new eventCtor('aq:track-changes-toggle', {
            detail: { enabled:next, source:String(options.source || 'commands') }
          }));
        }
      }catch(_e){}
    }
    return next;
  }

  function getTrackMarkType(state, name){
    if(!state || !state.schema || !state.schema.marks) return null;
    return state.schema.marks[name] || null;
  }

  function collectMarkRanges(state, markName){
    var markType = getTrackMarkType(state, markName);
    if(!markType || !state || !state.doc || typeof state.doc.nodesBetween !== 'function') return [];
    var ranges = [];
    state.doc.nodesBetween(0, state.doc.content ? state.doc.content.size : 0, function(node, pos){
      if(!node || !node.isText) return;
      var has = Array.isArray(node.marks) && node.marks.some(function(mark){ return mark && mark.type === markType; });
      if(!has) return;
      var from = Number(pos || 0);
      var to = from + (Number(node.nodeSize || 0) || 0);
      if(to <= from) return;
      var last = ranges[ranges.length - 1];
      if(last && from <= last.to){
        last.to = Math.max(last.to, to);
      }else{
        ranges.push({ from:from, to:to });
      }
    });
    return ranges;
  }

  function mapRangeThroughTransaction(tr, range){
    if(!tr || !tr.mapping || !range) return null;
    var from = tr.mapping.map(range.from, 1);
    var to = tr.mapping.map(range.to, -1);
    if(!isFinite(from) || !isFinite(to) || to <= from) return null;
    return { from:from, to:to };
  }

  function acceptTrackChanges(editor){
    if(!editor || !editor.state || !editor.view || typeof editor.view.dispatch !== 'function') return false;
    var state = editor.state;
    var deleteMark = getTrackMarkType(state, 'trackDelete');
    var insertMark = getTrackMarkType(state, 'trackInsert');
    var deleteRanges = deleteMark ? collectMarkRanges(state, 'trackDelete') : [];
    var insertRanges = insertMark ? collectMarkRanges(state, 'trackInsert') : [];
    if(!deleteRanges.length && !insertRanges.length) return false;
    var tr = state.tr;
    if(deleteRanges.length){
      deleteRanges.slice().sort(function(a, b){ return b.from - a.from; }).forEach(function(range){
        tr = tr.delete(range.from, range.to);
      });
    }
    if(insertMark && insertRanges.length){
      insertRanges.forEach(function(range){
        var mapped = mapRangeThroughTransaction(tr, range);
        if(mapped) tr = tr.removeMark(mapped.from, mapped.to, insertMark);
      });
    }
    if(deleteMark && deleteRanges.length){
      deleteRanges.forEach(function(range){
        var mapped = mapRangeThroughTransaction(tr, range);
        if(mapped) tr = tr.removeMark(mapped.from, mapped.to, deleteMark);
      });
    }
    if(!tr.steps || !tr.steps.length) return false;
    editor.view.dispatch(tr.scrollIntoView());
    return true;
  }

  function rejectTrackChanges(editor){
    if(!editor || !editor.state || !editor.view || typeof editor.view.dispatch !== 'function') return false;
    var state = editor.state;
    var deleteMark = getTrackMarkType(state, 'trackDelete');
    var insertMark = getTrackMarkType(state, 'trackInsert');
    var deleteRanges = deleteMark ? collectMarkRanges(state, 'trackDelete') : [];
    var insertRanges = insertMark ? collectMarkRanges(state, 'trackInsert') : [];
    if(!deleteRanges.length && !insertRanges.length) return false;
    var tr = state.tr;
    if(insertRanges.length){
      insertRanges.slice().sort(function(a, b){ return b.from - a.from; }).forEach(function(range){
        tr = tr.delete(range.from, range.to);
      });
    }
    if(deleteMark && deleteRanges.length){
      deleteRanges.forEach(function(range){
        var mapped = mapRangeThroughTransaction(tr, range);
        if(mapped) tr = tr.removeMark(mapped.from, mapped.to, deleteMark);
      });
    }
    if(insertMark && insertRanges.length){
      insertRanges.forEach(function(range){
        var mapped = mapRangeThroughTransaction(tr, range);
        if(mapped) tr = tr.removeMark(mapped.from, mapped.to, insertMark);
      });
    }
    if(!tr.steps || !tr.steps.length) return false;
    editor.view.dispatch(tr.scrollIntoView());
    return true;
  }

  function summarizeTrackChanges(editor){
    if(!editor || !editor.state){
      return { insertCount:0, deleteCount:0, total:0, insertChars:0, deleteChars:0 };
    }
    var insertRanges = collectMarkRanges(editor.state, 'trackInsert');
    var deleteRanges = collectMarkRanges(editor.state, 'trackDelete');
    function sumChars(ranges){
      if(!Array.isArray(ranges) || !ranges.length) return 0;
      return ranges.reduce(function(total, range){
        var from = Number(range && range.from || 0);
        var to = Number(range && range.to || 0);
        var size = Math.max(0, to - from);
        return total + size;
      }, 0);
    }
    return {
      insertCount: insertRanges.length,
      deleteCount: deleteRanges.length,
      total: insertRanges.length + deleteRanges.length,
      insertChars: sumChars(insertRanges),
      deleteChars: sumChars(deleteRanges)
    };
  }

  function collectTrackChangeRanges(state){
    if(!state) return [];
    var ranges = [];
    collectMarkRanges(state, 'trackInsert').forEach(function(range){
      ranges.push({ from:range.from, to:range.to, kind:'insert' });
    });
    collectMarkRanges(state, 'trackDelete').forEach(function(range){
      ranges.push({ from:range.from, to:range.to, kind:'delete' });
    });
    ranges.sort(function(a, b){
      if(a.from === b.from) return a.to - b.to;
      return a.from - b.from;
    });
    return ranges;
  }

  function pickTrackRange(ranges, cursor, direction){
    if(!Array.isArray(ranges) || !ranges.length) return null;
    var dir = direction < 0 ? -1 : 1;
    var i = 0;
    if(dir > 0){
      for(i = 0; i < ranges.length; i++){
        if(ranges[i].from > cursor) return ranges[i];
      }
      return ranges[0];
    }
    for(i = ranges.length - 1; i >= 0; i--){
      if(ranges[i].to < cursor) return ranges[i];
    }
    return ranges[ranges.length - 1];
  }

  function focusTrackChange(editor, direction){
    if(!editor || !editor.state) return false;
    var ranges = collectTrackChangeRanges(editor.state);
    if(!ranges.length) return false;
    var cursor = editor.state.selection ? Number(editor.state.selection.from || 0) : 0;
    var target = pickTrackRange(ranges, cursor, direction);
    if(!target) return false;
    if(editor.chain && typeof editor.chain === 'function'){
      var chain = editor.chain();
      if(chain && typeof chain.focus === 'function') chain.focus();
      if(chain && typeof chain.setTextSelection === 'function'){
        chain.setTextSelection({ from:target.from, to:target.to });
        return !!chain.run();
      }
    }
    if(editor.commands && typeof editor.commands.setTextSelection === 'function'){
      try{ editor.commands.setTextSelection({ from:target.from, to:target.to }); }catch(_e){ return false; }
      if(editor.commands && typeof editor.commands.focus === 'function'){
        try{ editor.commands.focus(); }catch(_e){}
      }
      return true;
    }
    return false;
  }

  function getSelectedTrackChange(editor){
    if(!editor || !editor.state || !editor.state.selection) return null;
    var selection = editor.state.selection;
    var from = Number(selection.from || 0);
    var to = Number(selection.to || from);
    var ranges = collectTrackChangeRanges(editor.state);
    if(!ranges.length) return null;
    for(var i = 0; i < ranges.length; i++){
      var range = ranges[i];
      if(range.from <= from && range.to >= to) return range;
      if(range.from < to && range.to > from) return range;
    }
    return null;
  }

  function applyTrackChangeDecision(editor, mode){
    if(!editor || !editor.state || !editor.view || typeof editor.view.dispatch !== 'function') return false;
    var range = getSelectedTrackChange(editor);
    if(!range) return false;
    var state = editor.state;
    var insertMark = getTrackMarkType(state, 'trackInsert');
    var deleteMark = getTrackMarkType(state, 'trackDelete');
    var tr = state.tr;
    if(mode === 'accept'){
      if(range.kind === 'delete'){
        tr = tr.delete(range.from, range.to);
      }else if(insertMark){
        tr = tr.removeMark(range.from, range.to, insertMark);
      }
    }else if(mode === 'reject'){
      if(range.kind === 'insert'){
        tr = tr.delete(range.from, range.to);
      }else if(deleteMark){
        tr = tr.removeMark(range.from, range.to, deleteMark);
      }
    }else{
      return false;
    }
    if(!tr.steps || !tr.steps.length) return false;
    editor.view.dispatch(tr.scrollIntoView());
    return true;
  }

  function acceptCurrentTrackChange(editor){
    return applyTrackChangeDecision(editor, 'accept');
  }

  function rejectCurrentTrackChange(editor){
    return applyTrackChangeDecision(editor, 'reject');
  }

  var PARAGRAPH_STYLES = {
    normal: { id:'normal', label:'Normal' },
    heading1: { id:'heading1', label:'Heading 1', level:1 },
    heading2: { id:'heading2', label:'Heading 2', level:2 },
    heading3: { id:'heading3', label:'Heading 3', level:3 },
    heading4: { id:'heading4', label:'Heading 4', level:4 },
    heading5: { id:'heading5', label:'Heading 5', level:5 },
    quote: { id:'quote', label:'Quote' },
    abstract: { id:'abstract', label:'Abstract', blockStyle:'abstract' },
    keywords: { id:'keywords', label:'Keywords', blockStyle:'keywords' },
    referenceEntry: { id:'referenceEntry', label:'Reference Entry', blockStyle:'referenceEntry', className:'aq-ref-entry' },
    tableFigureLabel: { id:'tableFigureLabel', label:'Table/Figure Label', blockStyle:'tableFigureLabel', className:'aq-table-label' },
    tableFigureTitle: { id:'tableFigureTitle', label:'Table/Figure Title', blockStyle:'tableFigureTitle', className:'aq-table-title' }
  };

  var APA_HEADING_ATTRS = {
    1: { textAlign:'center', style:'text-align:center !important;text-indent:0' },
    2: { textAlign:'left', style:'text-align:left !important;text-indent:0' },
    3: { textAlign:'left', style:'text-align:left !important;text-indent:0' },
    4: { textAlign:'left', style:'text-align:left !important;text-indent:.5in' },
    5: { textAlign:'left', style:'text-align:left !important;text-indent:.5in' }
  };

  function getApaHeadingAttrs(level){
    if(apaStyleEngine && typeof apaStyleEngine.getHeadingAttrs === 'function'){
      return apaStyleEngine.getHeadingAttrs(level);
    }
    return Object.assign({}, APA_HEADING_ATTRS[level] || APA_HEADING_ATTRS[2]);
  }

  function applyHeadingStyleAttrs(chain, level){
    if(chain && typeof chain.updateAttributes === 'function'){
      chain.updateAttributes('heading', getApaHeadingAttrs(level));
    }
    return chain;
  }

  function resolveParagraphStyleId(styleId){
    var raw = String(styleId || '').trim();
    if(!raw) return null;
    if(PARAGRAPH_STYLES[raw]) return raw;
    var lower = raw.toLowerCase();
    if(PARAGRAPH_STYLES[lower]) return lower;
    // Case-insensitive match against canonical ids (keeps camelCase intact).
    var keys = Object.keys(PARAGRAPH_STYLES);
    for(var i = 0; i < keys.length; i++){
      if(keys[i].toLowerCase() === lower) return keys[i];
    }
    return null;
  }

  function applyParagraphStyle(editor, styleId){
    if(!editor || !editor.chain) return false;
    var id = resolveParagraphStyleId(styleId);
    if(!id) return false;
    var chain = editor.chain().focus();
    if(id === 'normal'){
      chain.setParagraph();
      // Keep APA default first-line indentation for body text.
      if(typeof chain.updateAttributes === 'function'){
        chain.updateAttributes('paragraph', { indentMode:'first-line' });
      }
      return !!chain.run();
    }
    if(id === 'quote'){
      if(typeof editor.isActive === 'function' && editor.isActive('blockquote')){
        return !!chain.run();
      }
      chain.toggleBlockquote();
      return !!chain.run();
    }
    var style = PARAGRAPH_STYLES[id];
    if(!style) return false;
    if(style.blockStyle){
      // Apply semantic block style (abstract, keywords, referenceEntry, tableFigure*)
      // via paragraph attrs that the APA style engine declares.
      var blockAttrs = null;
      if(apaStyleEngine && typeof apaStyleEngine.getBlockAttrs === 'function'){
        blockAttrs = apaStyleEngine.getBlockAttrs(style.blockStyle);
      }
      if(!blockAttrs) blockAttrs = {};
      chain.setParagraph();
      if(typeof chain.updateAttributes === 'function'){
        var attrs = {
          indentMode: style.blockStyle === 'abstract' ? 'none' : 'first-line',
          style: blockAttrs.style || null,
          textAlign: blockAttrs.textAlign || null
        };
        if(style.className || blockAttrs.className){
          attrs.class = style.className || blockAttrs.className;
        }
        chain.updateAttributes('paragraph', attrs);
      }
      return !!chain.run();
    }
    if(!style.level) return false;
    if(typeof chain.setHeading === 'function'){
      chain.setHeading({ level:style.level });
    }else{
      chain.toggleHeading({ level:style.level });
    }
    applyHeadingStyleAttrs(chain, style.level);
    return !!chain.run();
  }

  function getActiveParagraphStyle(editor){
    if(!editor || typeof editor.isActive !== 'function') return 'normal';
    if(editor.isActive('blockquote')) return 'quote';
    if(editor.isActive('heading', { level:1 })) return 'heading1';
    if(editor.isActive('heading', { level:2 })) return 'heading2';
    if(editor.isActive('heading', { level:3 })) return 'heading3';
    if(editor.isActive('heading', { level:4 })) return 'heading4';
    if(editor.isActive('heading', { level:5 })) return 'heading5';
    try{
      var attrs = typeof editor.getAttributes === 'function' ? editor.getAttributes('paragraph') : null;
      var cls = attrs && attrs.class ? String(attrs.class) : '';
      if(cls.indexOf('aq-abstract') >= 0) return 'abstract';
      if(cls.indexOf('aq-keywords') >= 0) return 'keywords';
      if(cls.indexOf('aq-ref-entry') >= 0) return 'referenceEntry';
      if(cls.indexOf('aq-table-title') >= 0) return 'tableFigureTitle';
      if(cls.indexOf('aq-table-label') >= 0) return 'tableFigureLabel';
    }catch(_e){}
    return 'normal';
  }

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

  function collectListNodePositions(state, listType){
    if(!state || !state.selection) return [];
    var positions = [];
    var seen = Object.create(null);
    function add(pos){
      var key = String(pos);
      if(seen[key]) return;
      seen[key] = true;
      positions.push(pos);
    }
    function addFromResolved($pos){
      if(!$pos || typeof $pos.depth !== 'number' || typeof $pos.node !== 'function') return;
      for(var depth = $pos.depth; depth >= 0; depth--){
        var node = $pos.node(depth);
        if(node && node.type && node.type.name === listType){
          try{
            add($pos.before(depth));
          }catch(_e){}
        }
      }
    }
    addFromResolved(state.selection.$from);
    addFromResolved(state.selection.$to);
    if(state.doc && typeof state.doc.nodesBetween === 'function'){
      var from = state.selection.from;
      var to = state.selection.to;
      state.doc.nodesBetween(from, to, function(node, pos){
        if(node && node.type && node.type.name === listType){
          add(pos);
        }
      });
    }
    positions.sort(function(a, b){ return a - b; });
    return positions;
  }

  function syncRenderedListStyles(editor, listType, style, positions){
    if(!editor || !editor.view || typeof editor.view.nodeDOM !== 'function') return false;
    var nextStyle = normalizeListStyleType(listType, style);
    if(!nextStyle) return false;
    var targets = Array.isArray(positions) && positions.length
      ? positions.slice(0)
      : collectListNodePositions(editor.state, listType);
    function applyToDom(dom){
      if(!dom || dom.nodeType !== 1) return false;
      var tag = String(dom.nodeName || '').toLowerCase();
      if(listType === 'bulletList' && tag !== 'ul') return false;
      if(listType === 'orderedList' && tag !== 'ol') return false;
      dom.setAttribute('data-list-style', nextStyle);
      if(dom.style) dom.style.listStyleType = nextStyle;
      if(listType === 'orderedList'){
        if(nextStyle === 'lower-alpha') dom.setAttribute('type', 'a');
        else if(nextStyle === 'lower-roman') dom.setAttribute('type', 'i');
        else dom.removeAttribute('type');
      }
      return true;
    }
    function findActiveListDom(){
      if(!editor.state || !editor.state.selection || !editor.view || typeof editor.view.domAtPos !== 'function') return null;
      var positionsToCheck = [editor.state.selection.from, editor.state.selection.to];
      for(var i = 0; i < positionsToCheck.length; i++){
        try{
          var domInfo = editor.view.domAtPos(positionsToCheck[i]);
          var node = domInfo && domInfo.node
            ? (domInfo.node.nodeType === 1 ? domInfo.node : domInfo.node.parentElement)
            : null;
          while(node && node !== editor.view.dom){
            var tag = String(node.nodeName || '').toLowerCase();
            if((listType === 'bulletList' && tag === 'ul') || (listType === 'orderedList' && tag === 'ol')){
              return node;
            }
            node = node.parentElement;
          }
        }catch(_e){}
      }
      return null;
    }
    var changed = false;
    targets.forEach(function(pos){
      try{
        var dom = editor.view.nodeDOM(pos);
        if(applyToDom(dom)) changed = true;
      }catch(_e){}
    });
    if(!changed){
      changed = applyToDom(findActiveListDom());
    }
    return changed;
  }

  function updateListStyleAttributes(editor, listType, style){
    if(!editor || !editor.state || !editor.view || typeof editor.view.dispatch !== 'function') return false;
    var nextStyle = normalizeListStyleType(listType, style);
    if(!nextStyle) return false;
    var positions = collectListNodePositions(editor.state, listType);
    traceListStyle('list-style.update.start', {
      listType:listType,
      style:nextStyle,
      positions:positions.slice(0),
      selection: editor.state && editor.state.selection ? {
        from:editor.state.selection.from,
        to:editor.state.selection.to
      } : null
    });
    if(!positions.length) return false;
    var tr = editor.state.tr;
    var changed = false;
    positions.forEach(function(pos){
      try{
        var node = tr.doc.nodeAt(pos);
        if(!node || !node.type || node.type.name !== listType) return;
        var nextAttrs = Object.assign({}, node.attrs || {}, { listStyleType:nextStyle });
        if(nextAttrs.listStyleType === (node.attrs && node.attrs.listStyleType)) return;
        tr = tr.setNodeMarkup(pos, undefined, nextAttrs, node.marks);
        changed = true;
      }catch(_e){}
    });
    if(!changed){
      syncRenderedListStyles(editor, listType, nextStyle, positions);
      return true;
    }
    editor.view.dispatch(tr);
    syncRenderedListStyles(editor, listType, nextStyle, positions);
    traceListStyle('list-style.update.done', {
      listType:listType,
      style:nextStyle,
      changed:true
    });
    return true;
  }

  function applyListStyle(editor, listType, style){
    return applyListStyleAtSelection(editor, listType, style);
  }

  function applyListStyleAtSelection(editor, listType, style){
    if(!editor) return false;
    var nextStyle = normalizeListStyleType(listType, style);
    if(!nextStyle) return false;
    var isSameListActive = typeof editor.isActive === 'function' ? !!editor.isActive(listType) : false;
    traceListStyle('list-style.apply', {
      listType:listType,
      style:nextStyle,
      isSameListActive:isSameListActive,
      selection: editor.state && editor.state.selection ? {
        from:editor.state.selection.from,
        to:editor.state.selection.to
      } : null
    });
    try{
      var chain = editor.chain ? editor.chain() : null;
      if(!chain) return false;
      if(typeof chain.focus === 'function') chain.focus();
      if(!isSameListActive){
        if(listType === 'bulletList'){
          chain.toggleBulletList();
        }else if(listType === 'orderedList'){
          chain.toggleOrderedList();
        }else{
          return false;
        }
      }else{
        // Keep current list structure; only mutate the active list node attrs.
      }
      if(typeof chain.updateAttributes === 'function'){
        chain.updateAttributes(listType, { listStyleType:nextStyle });
      }
      if(!chain.run()) return false;
      if(updateListStyleAttributes(editor, listType, nextStyle)) return true;
      syncRenderedListStyles(editor, listType, nextStyle);
      return true;
    }catch(_e){
      // Fall back to transaction-based attr updates if the chain path is unavailable.
    }
    if(!isSameListActive){
      try{
        if(listType === 'bulletList'){
          if(editor.commands && typeof editor.commands.toggleBulletList === 'function'){
            if(!editor.commands.toggleBulletList()) return false;
          }else if(editor.chain){
            if(!editor.chain().toggleBulletList().run()) return false;
          }else{
            return false;
          }
        }else if(listType === 'orderedList'){
          if(editor.commands && typeof editor.commands.toggleOrderedList === 'function'){
            if(!editor.commands.toggleOrderedList()) return false;
          }else if(editor.chain){
            if(!editor.chain().toggleOrderedList().run()) return false;
          }else{
            return false;
          }
        }else{
          return false;
        }
      }catch(_e){
        return false;
      }
    }
    return updateListStyleAttributes(editor, listType, nextStyle);
  }

  var multiLevelTemplates = {
    bullet: { listType:'bulletList', levels:['disc','circle','square'] },
    number: { listType:'orderedList', levels:['decimal','lower-alpha','lower-roman'] },
    outline:{ listType:'orderedList', levels:['upper-roman','upper-alpha','decimal'] },
    mixed:  { listType:'orderedList', levels:['decimal','disc','lower-alpha'] }
  };

  function applyMultiLevelListTemplate(editor, templateName){
    if(!editor || !editor.chain) return false;
    var tpl = multiLevelTemplates[templateName];
    if(!tpl) return false;
    var isActive = typeof editor.isActive === 'function' && editor.isActive(tpl.listType);
    if(!isActive){
      if(tpl.listType === 'bulletList'){
        editor.chain().focus().toggleBulletList().run();
      }else{
        editor.chain().focus().toggleOrderedList().run();
      }
    }
    var firstStyle = tpl.levels[0] || null;
    if(firstStyle){
      updateListStyleAttributes(editor, tpl.listType, firstStyle);
      syncRenderedListStyles(editor, tpl.listType, firstStyle);
    }
    return true;
  }

  function getMultiLevelTemplates(){
    return multiLevelTemplates;
  }

  function ensureListStyleAfterToggle(editor, listType, defaultStyle){
    if(!editor) return false;
    try{
      if(typeof editor.isActive === 'function' && !editor.isActive(listType)) return false;
    }catch(_e){}
    var next = normalizeListStyleType(listType, defaultStyle);
    if(!next) return false;
    if(updateListStyleAttributes(editor, listType, next)) return true;
    try{
      return !!syncRenderedListStyles(editor, listType, next);
    }catch(_e){}
    return false;
  }

  function runChain(editor, callback){
    if(!editor || typeof editor.chain !== 'function') return false;
    try{
      var chain = editor.chain().focus();
      callback(chain);
      return !!chain.run();
    }catch(_e){}
    return false;
  }

  function applyTextAlign(editor, align){
    var nextAlign = String(align || 'left').toLowerCase();
    var chainApplied = runChain(editor, function(chain){
      if(typeof chain.setTextAlign !== 'function') throw new Error('setTextAlign unavailable');
      chain.setTextAlign(nextAlign);
    });

    try{
      if(!editor || !editor.state || !editor.view || !editor.state.selection) return chainApplied;
      var tr = editor.state.tr;
      var changed = false;
      var touched = {};
      var livePositions = [];
      function applyLiveTextAlign(){
        try{
          if(!editor || !editor.view || typeof editor.view.nodeDOM !== 'function') return;
          livePositions.forEach(function(pos){
            var el = editor.view.nodeDOM(pos);
            if(!el || !el.style) return;
            if(typeof el.style.setProperty === 'function') el.style.setProperty('text-align', nextAlign || 'left', 'important');
            else el.style.textAlign = nextAlign || 'left';
            if(typeof el.setAttribute === 'function') el.setAttribute('data-text-align', nextAlign || 'left');
          });
        }catch(_e){}
      }
      function applyAlignToNode(node, pos){
        if(!node || !node.type) return;
        var typeName = node.type.name;
        if(typeName !== 'paragraph' && typeName !== 'heading') return;
        if(touched[pos]) return;
        touched[pos] = true;
        livePositions.push(pos);
        var attrs = Object.assign({}, node.attrs || {}, { textAlign:nextAlign });
        var style = String(attrs.style || '');
        style = style.replace(/(?:^|;)\s*text-align\s*:\s*[^;]+;?/i, ';').replace(/;;+/g, ';').replace(/^;|;$/g, '').trim();
        if(nextAlign) style = (style ? style + ';' : '') + 'text-align:' + nextAlign + ' !important';
        attrs.style = style || null;
        attrs['data-text-align'] = nextAlign || 'left';
        tr = tr.setNodeMarkup(pos, undefined, attrs, node.marks);
        changed = true;
      }
      editor.state.doc.nodesBetween(editor.state.selection.from, editor.state.selection.to, applyAlignToNode);
      if(!changed && editor.state.selection.$from){
        var $from = editor.state.selection.$from;
        for(var depth = $from.depth; depth >= 0; depth--){
          var node = $from.node(depth);
          if(!node || !node.type) continue;
          var typeName = node.type.name;
          if(typeName !== 'paragraph' && typeName !== 'heading') continue;
          // Empty cursor selections do not always visit the block node in nodesBetween.
          // Resolve the active block directly so toolbar alignment behaves like Word.
          var pos = depth > 0 && typeof $from.before === 'function' ? $from.before(depth) : 0;
          applyAlignToNode(node, pos);
          break;
        }
      }
      if(changed){
        editor.view.dispatch(tr);
        applyLiveTextAlign();
        return true;
      }
    }catch(_e){}
    return chainApplied;
  }

  function isListActive(editor){
    try{
      return !!(editor && typeof editor.isActive === 'function'
        && (editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('listItem')));
    }catch(_e){}
    return false;
  }

  function applyParagraphIndent(editor, direction){
    var delta = direction === 'outdent' ? -0.5 : 0.5;
    try{
      if(!editor || !editor.state || !editor.view || !editor.state.selection) return false;
      var tr = editor.state.tr;
      var changed = false;
      editor.state.doc.nodesBetween(editor.state.selection.from, editor.state.selection.to, function(node, pos){
        if(!node || !node.type) return;
        var typeName = node.type.name;
        if(typeName !== 'paragraph' && typeName !== 'heading') return;
        var attrs = Object.assign({}, node.attrs || {});
        var style = String(attrs.style || '');
        var current = 0;
        var match = style.match(/(?:^|;)\s*margin-left\s*:\s*([0-9.]+)\s*in\s*/i);
        if(match) current = parseFloat(match[1]) || 0;
        var next = Math.max(0, Math.min(3, Math.round((current + delta) * 2) / 2));
        style = style.replace(/(?:^|;)\s*margin-left\s*:\s*[^;]+;?/i, ';').replace(/;;+/g, ';').replace(/^;|;$/g, '').trim();
        if(next > 0) style = (style ? style + ';' : '') + 'margin-left:' + next + 'in';
        attrs.style = style || null;
        // Manual paragraph indent should not be confused with APA first-line indent.
        if(typeName === 'paragraph') attrs.indentMode = next > 0 ? 'none' : (attrs.indentMode || 'first-line');
        tr = tr.setNodeMarkup(pos, undefined, attrs, node.marks);
        changed = true;
      });
      if(!changed) return false;
      editor.view.dispatch(tr);
      return true;
    }catch(_e){}
    return false;
  }

  function applyIndent(editor, outdent){
    if(isListActive(editor)){
      return runChain(editor, function(chain){
        var method = outdent ? 'liftListItem' : 'sinkListItem';
        if(typeof chain[method] !== 'function') throw new Error(method + ' unavailable');
        chain[method]('listItem');
      });
    }
    if(applyParagraphIndent(editor, outdent ? 'outdent' : 'indent')) return true;
    if(!outdent){
      return runChain(editor, function(chain){
        if(typeof chain.toggleBulletList !== 'function') throw new Error('toggleBulletList unavailable');
        chain.toggleBulletList();
      });
    }
    return true;
  }

  function insertPageBreak(editor){
    return runChain(editor, function(chain){
      if(typeof chain.insertContent !== 'function') throw new Error('insertContent unavailable');
      chain.insertContent('<p class="aq-page-break" data-indent-mode="none"><br></p><p><br></p>');
    });
  }

  function applyCommand(editor, cmd, val){
    if(cmd === 'toggleTrackChanges'){
      setTrackChangesEnabled(val, { source:'editor-command' });
      return true;
    }
    if(!editor || !editor.chain) return false;
    switch(cmd){
      case 'bold': editor.chain().focus().toggleBold().run(); return true;
      case 'italic': editor.chain().focus().toggleItalic().run(); return true;
      case 'underline': editor.chain().focus().toggleUnderline().run(); return true;
      case 'strikeThrough': editor.chain().focus().toggleStrike().run(); return true;
      case 'formatBlock':
        if(val === 'h1') applyHeadingStyleAttrs(editor.chain().focus().toggleHeading({ level:1 }), 1).run();
        else if(val === 'h2') applyHeadingStyleAttrs(editor.chain().focus().toggleHeading({ level:2 }), 2).run();
        else if(val === 'h3') applyHeadingStyleAttrs(editor.chain().focus().toggleHeading({ level:3 }), 3).run();
        else if(val === 'h4') applyHeadingStyleAttrs(editor.chain().focus().toggleHeading({ level:4 }), 4).run();
        else if(val === 'h5') applyHeadingStyleAttrs(editor.chain().focus().toggleHeading({ level:5 }), 5).run();
        else if(val === 'p') editor.chain().focus().setParagraph().run();
        else return false;
        return true;
      case 'setParagraphStyle':
        return applyParagraphStyle(editor, val);
      case 'justifyLeft': return applyTextAlign(editor, 'left');
      case 'justifyCenter': return applyTextAlign(editor, 'center');
      case 'justifyRight': return applyTextAlign(editor, 'right');
      case 'justifyFull': return applyTextAlign(editor, 'justify');
      case 'insertUnorderedList':
        editor.chain().focus().toggleBulletList().run();
        ensureListStyleAfterToggle(editor, 'bulletList', 'disc');
        return true;
      case 'insertOrderedList':
        editor.chain().focus().toggleOrderedList().run();
        ensureListStyleAfterToggle(editor, 'orderedList', 'decimal');
        return true;
      case 'setBulletListStyle': return applyListStyle(editor, 'bulletList', val);
      case 'setOrderedListStyle': return applyListStyle(editor, 'orderedList', val);
      case 'fontName': editor.chain().focus().setFontFamily(val).run(); return true;
      case 'foreColor': editor.chain().focus().setColor(val).run(); return true;
      case 'hiliteColor': editor.chain().focus().toggleHighlight({ color:val }).run(); return true;
      case 'superscript': editor.chain().focus().toggleSuperscript().run(); return true;
      case 'subscript': editor.chain().focus().toggleSubscript().run(); return true;
      case 'indent': return applyIndent(editor, false);
      case 'outdent': return applyIndent(editor, true);
      case 'applyMultiLevelList': return applyMultiLevelListTemplate(editor, val);
      case 'insertPageBreak': return insertPageBreak(editor);
      case 'acceptTrackChanges': return acceptTrackChanges(editor);
      case 'rejectTrackChanges': return rejectTrackChanges(editor);
      case 'focusNextTrackChange': return focusTrackChange(editor, 1);
      case 'focusPrevTrackChange': return focusTrackChange(editor, -1);
      case 'acceptCurrentTrackChange': return acceptCurrentTrackChange(editor);
      case 'rejectCurrentTrackChange': return rejectCurrentTrackChange(editor);
      case 'setPageSize':
        if(typeof window !== 'undefined' && window.AQTipTapWordLayout && typeof window.AQTipTapWordLayout.setPageSize === 'function'){
          return window.AQTipTapWordLayout.setPageSize(val);
        }
        return false;
      case 'setParagraphSpacing':
        if(typeof window !== 'undefined' && window.AQTipTapWordLayout && typeof window.AQTipTapWordLayout.setParagraphSpacing === 'function'){
          var parts = String(val || '').split(',');
          return window.AQTipTapWordLayout.setParagraphSpacing(parseFloat(parts[0]) || 0, parseFloat(parts[1]) || 0);
        }
        return false;
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

  function normalizeLineSpacingValue(value){
    var parsed = parseFloat(String(value == null ? '' : value).replace(',', '.'));
    if(!isFinite(parsed) || parsed <= 0) return '2';
    parsed = Math.max(1, Math.min(parsed, 3));
    return String(Math.round(parsed * 100) / 100);
  }

  function applyLineSpacing(value){
    var spacing = normalizeLineSpacingValue(value);
    var spacingPt = String(Math.round(parseFloat(spacing) * 12 * 100) / 100).replace(/\.0+$/,'') + 'pt';
    var surface = typeof window !== 'undefined' ? (window.AQTipTapWordSurface || null) : null;
    var host = surface && typeof surface.getHost === 'function'
      ? surface.getHost()
      : (typeof document !== 'undefined' ? document.getElementById('apaed') : null);
    var editorDom = surface && typeof surface.getEditorDom === 'function'
      ? surface.getEditorDom()
      : (typeof document !== 'undefined' ? document.querySelector('#apaed .ProseMirror') : null);
    if(host){
      host.style.lineHeight = spacingPt;
      host.style.setProperty('--aq-line-spacing', spacingPt);
    }
    if(editorDom){
      editorDom.style.lineHeight = spacingPt;
      editorDom.style.setProperty('--aq-line-spacing', spacingPt);
    }
    if(typeof document !== 'undefined'){
      var styleEl = document.getElementById('aq-editor-line-spacing-style');
      if(!styleEl){
        styleEl = document.createElement('style');
        styleEl.id = 'aq-editor-line-spacing-style';
        if(document.head) document.head.appendChild(styleEl);
      }
      if(styleEl){
        // Keep editor/runtime blocks on exact same line spacing regardless of inline/imported styles.
        styleEl.textContent =
          '#aq-tiptap-content .ProseMirror p,#aq-tiptap-content .ProseMirror li,#aq-tiptap-content .ProseMirror blockquote,#aq-tiptap-content .ProseMirror h1,#aq-tiptap-content .ProseMirror h2,#aq-tiptap-content .ProseMirror h3,#aq-tiptap-content .ProseMirror h4,#aq-tiptap-content .ProseMirror h5,#aq-tiptap-content .ProseMirror h6,#aq-tiptap-content .ProseMirror td,#aq-tiptap-content .ProseMirror th,#aq-tiptap-content .ProseMirror .refe,' +
          '#apaed p,#apaed li,#apaed blockquote,#apaed h1,#apaed h2,#apaed h3,#apaed h4,#apaed h5,#apaed h6,#apaed td,#apaed th,#apaed .refe{' +
            'line-height:' + spacingPt + ' !important;' +
            'margin-top:0 !important;' +
            'margin-bottom:0 !important;' +
            '}' +
          '#aq-tiptap-content .ProseMirror ul,#aq-tiptap-content .ProseMirror ol,#apaed ul,#apaed ol{' +
            'line-height:' + spacingPt + ' !important;' +
          '}';
      }
    }
    return spacing;
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
    PARAGRAPH_STYLES: PARAGRAPH_STYLES,
    // Guard against stale runtime bundles that may miss this symbol.
    applyParagraphStyle: (typeof applyParagraphStyle === 'function'
      ? applyParagraphStyle
      : function(){ return false; }),
    getActiveParagraphStyle: getActiveParagraphStyle,
    buildFigureHTML: buildFigureHTML,
    buildTableHTML: buildTableHTML,
    normalizeListStyleType: normalizeListStyleType,
    collectListNodePositions: collectListNodePositions,
    syncRenderedListStyles: syncRenderedListStyles,
    updateListStyleAttributes: updateListStyleAttributes,
    applyListStyle: applyListStyle,
    applyListStyleAtSelection: applyListStyleAtSelection,
    ensureTrackChangesState: ensureTrackChangesState,
    isTrackChangesEnabled: isTrackChangesEnabled,
    setTrackChangesEnabled: setTrackChangesEnabled,
    collectMarkRanges: collectMarkRanges,
    acceptTrackChanges: acceptTrackChanges,
    rejectTrackChanges: rejectTrackChanges,
    summarizeTrackChanges: summarizeTrackChanges,
    collectTrackChangeRanges: collectTrackChangeRanges,
    focusTrackChange: focusTrackChange,
    acceptCurrentTrackChange: acceptCurrentTrackChange,
    rejectCurrentTrackChange: rejectCurrentTrackChange,
    applyMultiLevelListTemplate: applyMultiLevelListTemplate,
    getMultiLevelTemplates: getMultiLevelTemplates,
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
