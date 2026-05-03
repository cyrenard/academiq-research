/* AQ Engine — TipTap Compatibility Shim
 *
 * Drop-in replacement for TipTap editor used in AcademiQ Research.
 * Implements the subset of editor.commands.*, editor.chain().*, editor.getHTML(),
 * editor.state, editor.isActive(), etc. that the host app uses.
 */
(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){ module.exports = factory(); return; }
  root.AQEngineCompat = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){

  // ── HTML ↔ blocks helpers ─────────────────────────────────────────────────
  function htmlToBlocks(html){
    if(!html || !html.trim()) return [{ type: 'paragraph', runs: [{ text: '' }] }];
    var parser = new DOMParser();
    var doc = parser.parseFromString('<body>' + html + '</body>', 'text/html');
    var body = doc.body;
    var tiptapDoc = domToTipTapJSON(body);
    if(window.AQEngineTipTapAdapter && window.AQEngineTipTapAdapter.convertDoc){
      return window.AQEngineTipTapAdapter.convertDoc(tiptapDoc);
    }
    // Fallback
    return [{ type: 'paragraph', runs: [{ text: body.textContent || '' }] }];
  }

  function domToTipTapJSON(el){
    var content = [];
    for(var i = 0; i < el.childNodes.length; i++){
      var node = el.childNodes[i];
      var n = domNodeToJSON(node);
      if(n){ if(Array.isArray(n)) content = content.concat(n); else content.push(n); }
    }
    return { type: 'doc', content: content };
  }

  function domNodeToJSON(node){
    if(node.nodeType === 3){ var t = node.textContent; if(!t) return null; return { type: 'text', text: t, marks: [] }; }
    if(node.nodeType !== 1) return null;
    var tag = node.tagName.toLowerCase();
    var attrs = {};
    if(tag === 'p'){
      var align = node.style.textAlign || node.getAttribute('data-text-align') || '';
      if(align) attrs.textAlign = align;
      return { type: 'paragraph', attrs: attrs, content: inlineChildren(node) };
    }
    if(/^h([1-6])$/.test(tag)){
      attrs.level = parseInt(RegExp.$1, 10);
      return { type: 'heading', attrs: attrs, content: inlineChildren(node) };
    }
    if(tag === 'ul') return { type: 'bulletList',  content: listItemsToJSON(node) };
    if(tag === 'ol') return { type: 'orderedList', content: listItemsToJSON(node) };
    if(tag === 'li') return { type: 'listItem',    content: blockChildren(node) };
    if(tag === 'blockquote') return { type: 'blockquote', content: blockChildren(node) };
    if(tag === 'hr') return { type: 'horizontalRule' };
    if(tag === 'table') return tableToJSON(node);
    if(tag === 'img') return { type: 'image', attrs: { src: node.src || '', alt: node.alt || '' } };
    if(tag === 'br') return { type: 'hardBreak' };
    if(tag === 'div' || tag === 'section' || tag === 'article') return blockChildren(node);
    return inlineChildren(node);
  }

  function listItemsToJSON(ul){
    var items = [];
    for(var i = 0; i < ul.children.length; i++){
      var li = ul.children[i];
      if(li.tagName && li.tagName.toLowerCase() === 'li')
        items.push({ type: 'listItem', content: blockChildren(li) });
    }
    return items;
  }

  function blockChildren(el){
    var blocks = [], inlineBuf = [];
    function flushInline(){ if(inlineBuf.length){ blocks.push({ type: 'paragraph', content: inlineBuf }); inlineBuf = []; } }
    for(var i = 0; i < el.childNodes.length; i++){
      var ch = el.childNodes[i];
      if(ch.nodeType === 3){ var t = ch.textContent; if(t) inlineBuf.push({ type: 'text', text: t, marks: [] }); continue; }
      if(ch.nodeType !== 1) continue;
      var tag = ch.tagName.toLowerCase();
      if(/^(p|h[1-6]|ul|ol|blockquote|hr|table|div|section)$/.test(tag)){
        flushInline();
        var n = domNodeToJSON(ch);
        if(n){ if(Array.isArray(n)) blocks = blocks.concat(n); else blocks.push(n); }
      } else {
        inlineBuf = inlineBuf.concat(inlineNodeToJSON(ch));
      }
    }
    flushInline();
    if(!blocks.length) blocks.push({ type: 'paragraph', content: [] });
    return blocks;
  }

  function inlineChildren(el){
    var out = [];
    for(var i = 0; i < el.childNodes.length; i++){
      var ch = el.childNodes[i];
      if(ch.nodeType === 3){ var t = ch.textContent; if(t) out.push({ type: 'text', text: t, marks: [] }); }
      else if(ch.nodeType === 1) out = out.concat(inlineNodeToJSON(ch));
    }
    return out;
  }

  function inlineNodeToJSON(el){
    var tag = el.tagName.toLowerCase();
    if(tag === 'br') return [{ type: 'hardBreak' }];
    if(tag === 'img') return [{ type: 'image', attrs: { src: el.src || '', alt: el.alt || '' } }];
    if(el.classList && el.classList.contains('fn-ref'))
      return [{ type: 'footnoteRef', attrs: { fnId: el.getAttribute('data-fn-id') || el.textContent || '' } }];
    var marks = collectMarks(el);
    var children = inlineChildren(el);
    for(var i = 0; i < children.length; i++)
      if(children[i].type === 'text') children[i].marks = (children[i].marks || []).concat(marks);
    return children;
  }

  function collectMarks(el){
    var marks = [], tag = el.tagName.toLowerCase();
    if(tag === 'strong' || tag === 'b') marks.push({ type: 'bold' });
    if(tag === 'em' || tag === 'i') marks.push({ type: 'italic' });
    if(tag === 'u') marks.push({ type: 'underline' });
    if(tag === 's' || tag === 'del' || tag === 'strike') marks.push({ type: 'strike' });
    if(tag === 'sub') marks.push({ type: 'subscript' });
    if(tag === 'sup') marks.push({ type: 'superscript' });
    if(tag === 'a' && el.href) marks.push({ type: 'link', attrs: { href: el.href } });
    if(el.getAttribute('data-ref') || el.getAttribute('data-id'))
      marks.push({ type: 'citation', attrs: { 'data-ref': el.getAttribute('data-ref'), 'data-id': el.getAttribute('data-id'), 'data-note-id': el.getAttribute('data-note-id'), 'data-mode': el.getAttribute('data-mode') } });
    var ts = {};
    if(el.style.color) ts.color = el.style.color;
    if(el.style.fontFamily) ts.fontFamily = el.style.fontFamily;
    if(el.style.fontSize) ts.fontSize = el.style.fontSize;
    if(el.style.backgroundColor) ts.backgroundColor = el.style.backgroundColor;
    if(Object.keys(ts).length) marks.push({ type: 'textStyle', attrs: ts });
    return marks;
  }

  function tableToJSON(tableEl){
    var content = [];
    var rows = tableEl.querySelectorAll('tr');
    for(var r = 0; r < rows.length; r++){
      var cells = rows[r].querySelectorAll('td, th'), rowContent = [];
      for(var c = 0; c < cells.length; c++){
        var ct = cells[c].tagName.toLowerCase() === 'th' ? 'tableHeader' : 'tableCell';
        rowContent.push({ type: ct, content: blockChildren(cells[c]) });
      }
      content.push({ type: 'tableRow', content: rowContent });
    }
    return { type: 'table', content: content };
  }

  // ── blocks → HTML ─────────────────────────────────────────────────────────
  function blocksToHTML(blocks){
    if(!blocks || !blocks.length) return '<p></p>';
    if(window.AQEngineTipTapAdapter && window.AQEngineTipTapAdapter.exportToTipTap){
      return tiptapJSONToHTML(window.AQEngineTipTapAdapter.exportToTipTap(blocks));
    }
    return blocks.map(function(b){
      var text = (b.runs || []).map(function(r){ return escHTML(r.text || ''); }).join('');
      if(b.type === 'heading') return '<h' + (b.level || 1) + '>' + text + '</h' + (b.level || 1) + '>';
      return '<p>' + text + '</p>';
    }).join('');
  }

  function escHTML(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function tiptapJSONToHTML(doc){ if(!doc || !doc.content) return '<p></p>'; return doc.content.map(nodeToHTML).join(''); }
  function nodeToHTML(node){
    if(!node) return '';
    if(node.type === 'text'){
      var t = escHTML(node.text || '');
      var marks = node.marks || [];
      for(var i = marks.length - 1; i >= 0; i--){
        var m = marks[i];
        if(m.type === 'bold') t = '<strong>' + t + '</strong>';
        else if(m.type === 'italic') t = '<em>' + t + '</em>';
        else if(m.type === 'underline') t = '<u>' + t + '</u>';
        else if(m.type === 'strike') t = '<s>' + t + '</s>';
        else if(m.type === 'superscript') t = '<sup>' + t + '</sup>';
        else if(m.type === 'subscript') t = '<sub>' + t + '</sub>';
        else if(m.type === 'link') t = '<a href="' + escHTML((m.attrs||{}).href || '') + '">' + t + '</a>';
        else if(m.type === 'citation'){
          var ca = m.attrs || {};
          var cattr = ' class="cit"';
          if(ca['data-ref']) cattr += ' data-ref="' + escHTML(ca['data-ref']) + '"';
          if(ca['data-id'])  cattr += ' data-id="' + escHTML(ca['data-id']) + '"';
          if(ca['data-note-id']) cattr += ' data-note-id="' + escHTML(ca['data-note-id']) + '"';
          if(ca['data-mode']) cattr += ' data-mode="' + escHTML(ca['data-mode']) + '"';
          t = '<span' + cattr + '>' + t + '</span>';
        } else if(m.type === 'textStyle'){
          var sa = m.attrs || {}, style = '';
          if(sa.color) style += 'color:' + sa.color + ';';
          if(sa.fontFamily) style += 'font-family:' + sa.fontFamily + ';';
          if(sa.fontSize) style += 'font-size:' + sa.fontSize + ';';
          if(sa.backgroundColor) style += 'background-color:' + sa.backgroundColor + ';';
          if(style) t = '<span style="' + escHTML(style) + '">' + t + '</span>';
        }
      }
      return t;
    }
    var children = (node.content || []).map(nodeToHTML).join('');
    var attrs = node.attrs || {};
    var alignAttr = attrs.textAlign ? ' style="text-align:' + attrs.textAlign + '"' : '';
    if(node.type === 'paragraph')   return '<p' + alignAttr + '>' + (children || '') + '</p>';
    if(node.type === 'heading')     return '<h' + (attrs.level||1) + alignAttr + '>' + children + '</h' + (attrs.level||1) + '>';
    if(node.type === 'bulletList')  return '<ul>' + children + '</ul>';
    if(node.type === 'orderedList') return '<ol>' + children + '</ol>';
    if(node.type === 'listItem')    return '<li>' + children + '</li>';
    if(node.type === 'blockquote')  return '<blockquote>' + children + '</blockquote>';
    if(node.type === 'horizontalRule') return '<hr>';
    if(node.type === 'hardBreak')   return '<br>';
    if(node.type === 'image')       return '<img src="' + escHTML(attrs.src||'') + '" alt="' + escHTML(attrs.alt||'') + '">';
    if(node.type === 'table')       return '<table>' + children + '</table>';
    if(node.type === 'tableRow')    return '<tr>' + children + '</tr>';
    if(node.type === 'tableHeader') return '<th>' + children + '</th>';
    if(node.type === 'tableCell')   return '<td>' + children + '</td>';
    if(node.type === 'footnoteRef') return '<sup class="fn-ref" data-fn-id="' + escHTML((attrs.fnId||'')) + '">' + escHTML(attrs.fnId||'') + '</sup>';
    return children;
  }

  function getBlocksTextLength(blks){
    var n = 0;
    for(var i = 0; i < blks.length; i++){
      var runs = blks[i].runs || [];
      for(var j = 0; j < runs.length; j++) n += String(runs[j].text || '').length;
      if(i < blks.length - 1) n += 1;
    }
    return n;
  }

  // ── Editor factory ────────────────────────────────────────────────────────
  function createEditor(opts){
    var element        = opts.element;
    var onUpdate       = opts.onUpdate       || function(){};
    var onSelUpdate    = opts.onSelectionUpdate || function(){};
    var initialHTML    = opts.content || '<p></p>';

    // Tell host app to disable its legacy pagination
    try { window.__aqEngineActive = true; } catch(_e){}

    // Fix #escroll so A4 page (793px) isn't clipped in narrow host
    var _escroll = document.getElementById('escroll');
    if(_escroll){
      _escroll.style.overflowX = 'auto';
      _escroll.style.alignItems = 'flex-start';
      _escroll.style.padding = '24px 0';
    }

    var stageEl = document.createElement('div');
    stageEl.id = 'aq-engine-stage';
    stageEl.className = 'aq-engine-root';
    stageEl.setAttribute('tabindex', '0');
    stageEl.style.cssText = 'display:block;width:100%;outline:none;cursor:text;min-height:100%;';

    element.innerHTML = '';
    element.style.cssText = 'display:block;width:100%;min-height:100%;';
    element.appendChild(stageEl);

    var blocks   = htmlToBlocks(initialHTML);
    var docModel = window.AQEngineDocument.create(blocks);

    var selection  = null;
    var input      = null;
    var _editable  = true;
    var _destroyed = false;
    var _reflowing = false;
    var _setupDone = false;

    var engineOpts = {
      pageSize:         { widthPt: 595.276, heightPt: 841.89 },
      margins:          { topPt: 72, bottomPt: 72, leftPt: 72, rightPt: 72 },
      baseFont:         { family: '"Times New Roman", Times, serif', sizePt: 12, weight: '400', style: 'normal' },
      lineHeightFactor: 2.0,
      backgroundColor:  '#ffffff',
      pageShadow:       '0 1px 6px rgba(0,0,0,.12)',
      pageGapPx:        24
    };

    function reflow(){
      if(_destroyed) return;
      if(_reflowing) return;
      _reflowing = true;
      try {
        var d = docModel.get();
        for(var i = 0; i < d.blocks.length; i++){
          var b = d.blocks[i];
          if(!b.type || b.type === 'paragraph'){
            if(!b.list) b.firstLineIndentPx = 36; else b.firstLineIndentPx = 0;
            if(!b.font) b.font = { sizePt: 12, weight: '400' };
          } else if(b.type === 'heading'){
            var lvl = b.level || 1;
            b.font = b.font || {};
            b.font.sizePt = 12; b.font.weight = '700';
            if(lvl === 1) b.align = b.align || 'center';
            else if(lvl === 2) b.align = b.align || 'left';
            else if(lvl === 3){ b.align = b.align || 'left'; b.font.style = 'italic'; }
            else if(lvl === 4){ b.align = b.align || 'left'; b.firstLineIndentPx = 36; }
            else if(lvl === 5){ b.align = b.align || 'left'; b.font.style = 'italic'; b.firstLineIndentPx = 36; }
          }
        }
        var layout = window.AQEngine.paginate(d.blocks, engineOpts);
        window.AQEngine.renderToDOM(layout, stageEl, engineOpts);

        if(!_setupDone){
          selection = window.AQEngineSelection.create({ container: stageEl, docModel: docModel });
          selection.attach();
          selection.onChange(function(ev){
            onSelUpdate();
            if(editorObj._onSelCb) editorObj._onSelCb(ev);
          });
          input = window.AQEngineInput.create({
            container:    stageEl,
            doc:          docModel,
            selectionRef: function(){ return selection; },
            onChanged:    function(){
              reflow();
              onUpdate({ editor: editorObj });
            }
          });
          if(input && typeof input.attach === 'function') input.attach();
          _setupDone = true;
        } else {
          if(input && input.syncCapturePosition) input.syncCapturePosition();
        }
      } finally {
        _reflowing = false;
      }
    }

    function _getRunAt(blockIdx, intra){
      var b = docModel.get().blocks[blockIdx];
      if(!b) return null;
      var runs = b.runs || [], cursor = 0;
      for(var i = 0; i < runs.length; i++){
        var rlen = String(runs[i].text || '').length;
        if(cursor + rlen > intra || i === runs.length - 1) return runs[i];
        cursor += rlen;
      }
      return null;
    }

    // ── TipTap-compatible editor object ──────────────────────────────────────
    var editorObj = {
      _aqEngine: true,
      _docModel: docModel,
      _reflow:   reflow,
      _stageEl:  stageEl,
      _onSelCb:  null,
      _eventHandlers: {},
      isDestroyed: false,

      getHTML: function(){ return blocksToHTML(docModel.get().blocks); },
      getJSON: function(){
        if(window.AQEngineTipTapAdapter && window.AQEngineTipTapAdapter.exportToTipTap)
          return window.AQEngineTipTapAdapter.exportToTipTap(docModel.get().blocks);
        return { type: 'doc', content: [] };
      },
      getText: function(opts){
        var sep = (opts && opts.blockSeparator) || '\n';
        return docModel.getPlainText().replace(/\n/g, sep);
      },
      getAttributes: function(markOrNode){
        if(!selection) return {};
        var range = selection.getRange();
        var loc   = docModel.locate(range.from);
        var block = docModel.get().blocks[loc.blockIdx];
        if(!block) return {};
        if(markOrNode === 'heading')   return block.type === 'heading' ? { level: block.level || 1 } : {};
        if(markOrNode === 'paragraph') return block.type === 'paragraph' ? {} : {};
        if(markOrNode === 'highlight') {
           var run = _getRunAt(loc.blockIdx, loc.intra);
           return run && run.highlight ? { color: run.highlight } : {};
        }
        var run = _getRunAt(loc.blockIdx, loc.intra);
        if(!run) return {};
        if(markOrNode === 'textStyle') return { 
          color: run.color || null, 
          fontFamily: (run.font && run.font.family) || null, 
          fontSize: (run.font && run.font.sizePt) ? run.font.sizePt + 'pt' : null 
        };
        if(markOrNode === 'link') return { href: run.href || null };
        if(markOrNode === 'citation') return run.citation || {};
        return {};
      },

      isActive: function(nameOrAttrs, attrs){
        if(!selection) return false;
        var range = selection.getRange();
        var loc   = docModel.locate(range.from);
        var block = docModel.get().blocks[loc.blockIdx];
        if(!block) return false;

        if(typeof nameOrAttrs === 'object' && nameOrAttrs !== null){
          if(nameOrAttrs.textAlign !== undefined) return (block.align || 'left') === nameOrAttrs.textAlign;
          return false;
        }

        var name = String(nameOrAttrs || '');
        var a = attrs || {};

        if(name === 'heading')     { if(block.type !== 'heading') return false; if(a.level !== undefined) return block.level === a.level; return true; }
        if(name === 'paragraph')   return !block.type || block.type === 'paragraph';
        if(name === 'bulletList')  return !!(block.list && block.list.type === 'bullet');
        if(name === 'orderedList') return !!(block.list && block.list.type === 'ordered');
        if(name === 'listItem')    return !!block.list;
        if(name === 'blockquote')  return !!(block.leftIndentPx && block.leftIndentPx > 0 && !block.list);

        // Inline: find run at cursor
        var run = _getRunAt(loc.blockIdx, loc.intra);
        if(!run) return false;
        if(name === 'bold')        return !!run.bold;
        if(name === 'italic')      return !!run.italic;
        if(name === 'underline')   return !!run.underline;
        if(name === 'strike')      return !!run.strike;
        if(name === 'superscript') return (run.baselineShift || 0) > 0;
        if(name === 'subscript')   return (run.baselineShift || 0) < 0;
        if(name === 'link')        return !!(run.href);
        if(name === 'citation')    return !!(run.citation);
        if(name === 'highlight')   return !!(run.highlight);
        if(name === 'textStyle')   { 
          if(a.color !== undefined) return (run.color || '#000000') === a.color; 
          return !!(run.color || run.font); 
        }
        return false;
      },

      can: function(){
        var cmds = editorObj.commands;
        var proxy = {};
        Object.keys(cmds).forEach(function(n){ proxy[n] = function(){ return true; }; });
        proxy.undo = function(){ return docModel.canUndo ? docModel.canUndo() : true; };
        proxy.redo = function(){ return docModel.canRedo ? docModel.canRedo() : true; };
        return proxy;
      },

      get state(){
        var range = selection ? selection.getRange() : { from: 0, to: 0, anchor: 0, focus: 0 };
        return {
          selection: { from: range.from, to: range.to, anchor: range.anchor, head: range.focus, empty: range.from === range.to },
          doc: {
            textBetween: function(from, to){ return docModel.getPlainText().slice(from, to); },
            descendants: function(cb){
              var blocks = docModel.get().blocks, offset = 0;
              for(var i = 0; i < blocks.length; i++){
                var b = blocks[i], len = docModel.blockTextLength(i);
                var fakeNode = { type: { name: b.type || 'paragraph' }, attrs: { level: b.level, textAlign: b.align }, textContent: (b.runs||[]).map(function(r){ return r.text||''; }).join(''), content: { size: len } };
                cb(fakeNode, offset);
                offset += len + 1;
              }
            },
            content:    { size: docModel.length() },
            nodeAt:     function(){ return null; },
            resolve:    function(pos){ return { pos: pos, parent: null, depth: 0, nodeAfter: null, nodeBefore: null }; },
            nodeSize:   docModel.length() + 2,
            childCount: (docModel.get().blocks || []).length
          },
          tr: { setMeta: function(){ return this; }, getMeta: function(){ return null; } }
        };
      },

      get view(){ return { dom: stageEl, dispatch: function(){}, state: this.state }; },
      get schema(){ return { marks: {}, nodes: {}, text: function(t){ return { type: 'text', text: t }; } }; },

      get isEditable(){ return _editable; },
      setEditable: function(val){ _editable = !!val; },
      storage: {},
      extensionManager: { extensions: [] },

      on:   function(ev, cb){ if(!this._eventHandlers[ev]) this._eventHandlers[ev] = []; this._eventHandlers[ev].push(cb); },
      off:  function(ev, cb){ var h = this._eventHandlers[ev]; if(!h) return; this._eventHandlers[ev] = h.filter(function(x){ return x !== cb; }); },
      emit: function(ev){ var h = this._eventHandlers[ev]||[]; for(var i=0;i<h.length;i++) try{ h[i]({ editor: this }); }catch(e){} },

      destroy: function(){
        _destroyed = true; this.isDestroyed = true;
        if(input && input.destroy) input.destroy();
        if(selection && selection.detach) selection.detach();
        stageEl.innerHTML = '';
      },

      commands: null, // set below

      chain: function(){
        var cmds = this.commands, queue = [], chainObj = {};
        Object.keys(cmds).forEach(function(name){
          chainObj[name] = function(){ queue.push({ name: name, args: Array.prototype.slice.call(arguments) }); return chainObj; };
        });
        chainObj.run = function(){ queue.forEach(function(q){ if(cmds[q.name]) cmds[q.name].apply(null, q.args); }); return true; };
        return chainObj;
      }
    };

    // ── Commands ─────────────────────────────────────────────────────────────
    editorObj.commands = {
      focus: function(pos){
        if(input && input.focus) input.focus();
        if(pos === 'end')          { var len = docModel.length(); if(selection) selection.setRange(len, len); }
        else if(pos === 'start')   { if(selection) selection.setRange(0, 0); }
        else if(typeof pos === 'number'){ if(selection) selection.setRange(pos, pos); }
      },
      setContent: function(html, emitUpdate){
        docModel.replace(htmlToBlocks(html || '<p></p>'));
        reflow();
        // Place cursor at start after content replacement (import, load, etc.)
        if(selection) selection.setRange(0, 0);
        if(emitUpdate !== false){ onUpdate({ editor: editorObj }); editorObj.emit('update'); }
      },
      insertContent: function(html){
        if(!selection) return;
        var range = selection.getRange();
        var newBlocks = htmlToBlocks(html || '');
        if(range.from !== range.to) docModel.deleteRange(range.from, range.to);
        var at = Math.min(range.from, range.to);
        docModel.insertBlocks(at, newBlocks);
        var insertedLen = getBlocksTextLength(newBlocks);
        reflow();
        if(selection) selection.setRange(at + insertedLen, at + insertedLen);
        onUpdate({ editor: editorObj });
      },
      insertContentAt: function(pos, html){
        var newBlocks = htmlToBlocks(html || '');
        if(typeof pos === 'object' && pos.from !== undefined){ docModel.deleteRange(pos.from, pos.to); pos = pos.from; }
        docModel.insertBlocks(pos, newBlocks);
        var insertedLen = getBlocksTextLength(newBlocks);
        reflow();
        if(selection) selection.setRange(pos + insertedLen, pos + insertedLen);
        onUpdate({ editor: editorObj });
      },
      deleteRange: function(range){
        if(!range) return;
        var from = range.from !== undefined ? range.from : range;
        var to   = range.to   !== undefined ? range.to   : from;
        docModel.deleteRange(from, to);
        reflow();
        if(selection) selection.setRange(from, from);
        onUpdate({ editor: editorObj });
      },
      setTextSelection: function(range){
        if(!selection) return;
        if(typeof range === 'number') selection.setRange(range, range);
        else if(range.from !== undefined) selection.setRange(range.from, range.to || range.from);
        else selection.setRange(range, range);
      },
      selectAll: function(){ if(selection) selection.setRange(0, docModel.length()); },

      // Inline formatting
      toggleBold:      function(){ if(input) input.toggleMark('bold');      else _toggleMark('bold');      reflow(); },
      toggleItalic:    function(){ if(input) input.toggleMark('italic');    else _toggleMark('italic');    reflow(); },
      toggleUnderline: function(){ if(input) input.toggleMark('underline'); else _toggleMark('underline'); reflow(); },
      toggleStrike:    function(){ if(input) input.toggleMark('strike');    else _toggleMark('strike');    reflow(); },

      setMark: function(markName, attrs){
        if(!selection) return;
        var range = selection.getRange();
        if(range.from === range.to) return;
        if(markName === 'textStyle'){
          if(attrs && attrs.color) docModel.applyMark(range.from, range.to, 'color', attrs.color);
          if(attrs && attrs.fontFamily) docModel.applyFontProp(range.from, range.to, 'family', attrs.fontFamily);
          if(attrs && attrs.fontSize){ var sz = parseFloat(String(attrs.fontSize).replace(/[^0-9.]/g,'')); if(sz) docModel.applyFontProp(range.from, range.to, 'sizePt', sz); }
        } else if(markName === 'link'){
          docModel.applyMark(range.from, range.to, 'href', (attrs && attrs.href) || false);
        } else if(markName === 'citation'){
          docModel.applyMark(range.from, range.to, 'citation', attrs || false);
        } else {
          docModel.applyMark(range.from, range.to, markName, true);
        }
        reflow(); onUpdate({ editor: editorObj });
      },
      setTextAlign: function(align){
        if(!selection) return;
        var range = selection.getRange();
        docModel.setAlignForRange(range.from, range.to, align);
        reflow(); onUpdate({ editor: editorObj });
      },
      toggleHeading: function(attrs){
        if(!selection) return;
        var range = selection.getRange();
        var blkIdx = docModel.blockIndexAt(range.from);
        var blk = docModel.get().blocks[blkIdx];
        if(blk && blk.type === 'heading' && blk.level === (attrs && attrs.level))
          docModel.setBlockTypeForRange(range.from, range.to, 'paragraph');
        else
          docModel.setBlockTypeForRange(range.from, range.to, 'heading', attrs);
        reflow(); onUpdate({ editor: editorObj });
      },
      setHeading: function(attrs){
        if(!selection) return;
        var range = selection.getRange();
        docModel.setBlockTypeForRange(range.from, range.to, 'heading', attrs);
        reflow(); onUpdate({ editor: editorObj });
      },
      setParagraph: function(){
        if(!selection) return;
        var range = selection.getRange();
        docModel.setBlockTypeForRange(range.from, range.to, 'paragraph');
        reflow(); onUpdate({ editor: editorObj });
      },
      clearNodes: function(){
        if(!selection) return;
        var range = selection.getRange();
        docModel.setBlockTypeForRange(range.from, range.to, 'paragraph');
        reflow(); onUpdate({ editor: editorObj });
      },
      toggleBulletList: function(){
        if(!selection) return;
        var range = selection.getRange();
        var blk = docModel.get().blocks[docModel.blockIndexAt(range.from)];
        docModel.setListTypeForRange(range.from, range.to, (blk && blk.list && blk.list.type === 'bullet') ? null : 'bullet', 0);
        reflow(); onUpdate({ editor: editorObj });
      },
      toggleOrderedList: function(){
        if(!selection) return;
        var range = selection.getRange();
        var blk = docModel.get().blocks[docModel.blockIndexAt(range.from)];
        docModel.setListTypeForRange(range.from, range.to, (blk && blk.list && blk.list.type === 'ordered') ? null : 'ordered', 0);
        reflow(); onUpdate({ editor: editorObj });
      },
      liftListItem: function(){
        if(!selection) return;
        var range = selection.getRange();
        docModel.changeListLevel(docModel.blockIndexAt(range.from), -1);
        reflow(); onUpdate({ editor: editorObj });
      },
      sinkListItem: function(){
        if(!selection) return;
        var range = selection.getRange();
        docModel.changeListLevel(docModel.blockIndexAt(range.from), 1);
        reflow(); onUpdate({ editor: editorObj });
      },
      splitListItem: function(){ if(input && input.splitBlock) input.splitBlock(); },
      splitBlock:    function(){ if(input && input.splitBlock) input.splitBlock(); },
      deleteBackward:function(){ if(input && input.deleteBackward) input.deleteBackward(); },
      deleteForward: function(){ if(input && input.deleteForward)  input.deleteForward(); },
      setHardBreak:  function(){ if(input && input.splitBlock) input.splitBlock(); },

      toggleHighlight: function(attrs){
        if(!selection) return;
        var range = selection.getRange();
        if(range.from === range.to) return;
        var color = (attrs && attrs.color) ? attrs.color : '#ffff00';
        var has = docModel.rangeHasMark(range.from, range.to, 'highlight');
        docModel.applyMark(range.from, range.to, 'highlight', has ? null : color);
        reflow(); onUpdate({ editor: editorObj });
      },
      setHighlight: function(attrs){
        if(!selection) return;
        var range = selection.getRange();
        if(range.from === range.to) return;
        docModel.applyMark(range.from, range.to, 'highlight', (attrs && attrs.color) || '#ffff00');
        reflow(); onUpdate({ editor: editorObj });
      },
      setColor: function(color){
        if(!selection) return;
        var range = selection.getRange();
        if(range.from === range.to) return;
        docModel.applyMark(range.from, range.to, 'color', color || null);
        reflow(); onUpdate({ editor: editorObj });
      },
      unsetColor: function(){
        if(!selection) return;
        var range = selection.getRange();
        docModel.applyMark(range.from, range.to, 'color', null);
        reflow(); onUpdate({ editor: editorObj });
      },
      setFontFamily: function(family){
        if(!selection) return;
        var range = selection.getRange();
        if(range.from === range.to) return;
        docModel.applyFontProp(range.from, range.to, 'family', family || null);
        reflow(); onUpdate({ editor: editorObj });
      },
      setFontSize: function(size){
        if(!selection) return;
        var range = selection.getRange();
        if(range.from === range.to) return;
        var sz = parseFloat(String(size || '').replace(/[^0-9.]/g,''));
        if(sz) docModel.applyFontProp(range.from, range.to, 'sizePt', sz);
        reflow(); onUpdate({ editor: editorObj });
      },
      toggleSuperscript: function(){
        if(!selection) return;
        var range = selection.getRange();
        if(range.from === range.to) return;
        if(editorObj.isActive('superscript')){ docModel.applyMark(range.from, range.to, 'baselineShift', 0); docModel.applyMark(range.from, range.to, 'fontScale', 0); }
        else { docModel.applyMark(range.from, range.to, 'baselineShift', 6); docModel.applyMark(range.from, range.to, 'fontScale', 0.75); }
        reflow(); onUpdate({ editor: editorObj });
      },
      toggleSubscript: function(){
        if(!selection) return;
        var range = selection.getRange();
        if(range.from === range.to) return;
        if(editorObj.isActive('subscript')){ docModel.applyMark(range.from, range.to, 'baselineShift', 0); docModel.applyMark(range.from, range.to, 'fontScale', 0); }
        else { docModel.applyMark(range.from, range.to, 'baselineShift', -4); docModel.applyMark(range.from, range.to, 'fontScale', 0.75); }
        reflow(); onUpdate({ editor: editorObj });
      },
      updateAttributes: function(nodeType, attrs){
        if(!selection || !attrs) return;
        var range = selection.getRange();
        if(attrs.textAlign) docModel.setAlignForRange(range.from, range.to, attrs.textAlign);
        reflow(); onUpdate({ editor: editorObj });
      },
      deleteSelection: function(){
        if(!selection) return;
        var range = selection.getRange();
        if(range.from === range.to) return;
        docModel.deleteRange(range.from, range.to);
        reflow();
        if(selection) selection.setRange(range.from, range.from);
        onUpdate({ editor: editorObj });
      },
      toggleBlockquote: function(){
        if(!selection) return;
        var range = selection.getRange();
        docModel.setBlockTypeForRange(range.from, range.to, 'paragraph');
        reflow(); onUpdate({ editor: editorObj });
      },
      deleteTable:  function(){},
      insertTable:  function(){},
      undo: function(){ if(docModel.undo()){ reflow(); onUpdate({ editor: editorObj }); } },
      redo: function(){ if(docModel.redo()){ reflow(); onUpdate({ editor: editorObj }); } }
    };

    function _toggleMark(mark){
      if(!selection) return;
      var range = selection.getRange();
      if(range.from === range.to) return;
      var has = docModel.rangeHasMark(range.from, range.to, mark);
      docModel.applyMark(range.from, range.to, mark, !has);
    }

    reflow();
    return editorObj;
  }

  return { createEditor: createEditor };
});
