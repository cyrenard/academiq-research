(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordEditor = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  function getIndentApi(){
    if(typeof window !== 'undefined' && window.AQTipTapWordIndent){
      return window.AQTipTapWordIndent;
    }
    if(typeof globalThis !== 'undefined' && globalThis.AQTipTapWordIndent){
      return globalThis.AQTipTapWordIndent;
    }
    if(typeof require === 'function'){
      try{ return require('./tiptap-word-indent.js'); }catch(_e){}
    }
    return null;
  }

  var indentApi = getIndentApi();

  function sanitizeIndentMode(value){
    if(indentApi && typeof indentApi.sanitizeIndentMode === 'function'){
      return indentApi.sanitizeIndentMode(value);
    }
    return value === 'none' ? 'none' : 'first-line';
  }

  function stripIndentClasses(className){
    if(indentApi && typeof indentApi.stripIndentClasses === 'function'){
      return indentApi.stripIndentClasses(className);
    }
    if(!className) return null;
    var stripped = String(className).replace(/\b(indent-first-line|indent-none)\b/g, '').trim().replace(/\s+/g, ' ');
    return stripped || null;
  }

  function parseIndentModeFromElement(el){
    if(indentApi && typeof indentApi.parseIndentModeFromElement === 'function'){
      return indentApi.parseIndentModeFromElement(el);
    }
    if(!el || typeof el.getAttribute !== 'function') return 'first-line';
    var attr = el.getAttribute('data-indent-mode');
    if(attr === 'none' || attr === 'first-line') return attr;
    return 'first-line';
  }

  function resolveParagraphIndentMode(options){
    if(indentApi && typeof indentApi.resolveParagraphIndentMode === 'function'){
      return indentApi.resolveParagraphIndentMode(options);
    }
    return 'first-line';
  }

  function normalizeParagraphIndentation(options){
    if(indentApi && typeof indentApi.normalizeParagraphIndentation === 'function'){
      return indentApi.normalizeParagraphIndentation(options);
    }
    return { changed:false, updates:[] };
  }

  function resolveParagraphPosFromSelection($pos){
    if(!($pos && typeof $pos.depth === 'number' && typeof $pos.node === 'function')) return null;
    for(var depth = $pos.depth; depth >= 0; depth--){
      var node = $pos.node(depth);
      if(node && node.type && node.type.name === 'paragraph'){
        if(depth === 0) return 0;
        if(typeof $pos.before === 'function'){
          try{ return $pos.before(depth); }catch(_e){ return null; }
        }
        return null;
      }
    }
    return null;
  }

  function createCitationMark(T){
    return T.Mark.create({
      name:'citation',
      inclusive:false,
      addAttributes:function(){
        return {
          'data-ref':{
            default:null,
            parseHTML:function(el){ return el.getAttribute('data-ref') || null; },
            renderHTML:function(attrs){ return attrs['data-ref'] ? { 'data-ref':attrs['data-ref'] } : {}; }
          },
          'data-id':{
            default:null,
            parseHTML:function(el){ return el.getAttribute('data-id') || null; },
            renderHTML:function(attrs){ return attrs['data-id'] ? { 'data-id':attrs['data-id'] } : {}; }
          },
          'data-note-id':{
            default:null,
            parseHTML:function(el){ return el.getAttribute('data-note-id') || null; },
            renderHTML:function(attrs){ return attrs['data-note-id'] ? { 'data-note-id':attrs['data-note-id'] } : {}; }
          },
          'data-note-ref':{
            default:null,
            parseHTML:function(el){ return el.getAttribute('data-note-ref') || null; },
            renderHTML:function(attrs){ return attrs['data-note-ref'] ? { 'data-note-ref':attrs['data-note-ref'] } : {}; }
          },
          'data-note-page':{
            default:null,
            parseHTML:function(el){ return el.getAttribute('data-note-page') || null; },
            renderHTML:function(attrs){ return attrs['data-note-page'] ? { 'data-note-page':attrs['data-note-page'] } : {}; }
          },
          'data-note-type':{
            default:null,
            parseHTML:function(el){ return el.getAttribute('data-note-type') || null; },
            renderHTML:function(attrs){ return attrs['data-note-type'] ? { 'data-note-type':attrs['data-note-type'] } : {}; }
          },
          'data-note-nb':{
            default:null,
            parseHTML:function(el){ return el.getAttribute('data-note-nb') || null; },
            renderHTML:function(attrs){ return attrs['data-note-nb'] ? { 'data-note-nb':attrs['data-note-nb'] } : {}; }
          },
          // /t (narrative) citations carry data-mode="textual" so the DOM
          // post-processor (normalizeCitationSpans) skips them and preserves
          // the "Yazar (Yıl)" format. Without this attribute on the schema,
          // ProseMirror would strip data-mode on insert and the citation
          // would render identically to /r parenthetical citations.
          'data-mode':{
            default:null,
            parseHTML:function(el){ return el.getAttribute('data-mode') || null; },
            renderHTML:function(attrs){ return attrs['data-mode'] ? { 'data-mode':attrs['data-mode'] } : {}; }
          }
        };
      },
      parseHTML:function(){ return [{ tag:'span.cit' }]; },
      renderHTML:function(render){
        return ['span', T.mergeAttributes({ 'class':'cit' }, render.HTMLAttributes), 0];
      }
    });
  }

  function createTrackInsertMark(T){
    return T.Mark.create({
      name:'trackInsert',
      inclusive:true,
      addAttributes:function(){
        return {
          'data-track-author':{
            default:null,
            parseHTML:function(el){ return el.getAttribute('data-track-author') || null; },
            renderHTML:function(attrs){ return attrs['data-track-author'] ? { 'data-track-author':attrs['data-track-author'] } : {}; }
          },
          'data-track-ts':{
            default:null,
            parseHTML:function(el){ return el.getAttribute('data-track-ts') || null; },
            renderHTML:function(attrs){ return attrs['data-track-ts'] ? { 'data-track-ts':attrs['data-track-ts'] } : {}; }
          }
        };
      },
      parseHTML:function(){ return [{ tag:'span.aq-track-insert' }]; },
      renderHTML:function(render){
        return ['span', T.mergeAttributes({ 'class':'aq-track-insert' }, render.HTMLAttributes), 0];
      }
    });
  }

  function createTrackDeleteMark(T){
    return T.Mark.create({
      name:'trackDelete',
      inclusive:false,
      addAttributes:function(){
        return {
          'data-track-author':{
            default:null,
            parseHTML:function(el){ return el.getAttribute('data-track-author') || null; },
            renderHTML:function(attrs){ return attrs['data-track-author'] ? { 'data-track-author':attrs['data-track-author'] } : {}; }
          },
          'data-track-ts':{
            default:null,
            parseHTML:function(el){ return el.getAttribute('data-track-ts') || null; },
            renderHTML:function(attrs){ return attrs['data-track-ts'] ? { 'data-track-ts':attrs['data-track-ts'] } : {}; }
          }
        };
      },
      parseHTML:function(){ return [{ tag:'span.aq-track-delete' }]; },
      renderHTML:function(render){
        return ['span', T.mergeAttributes({ 'class':'aq-track-delete' }, render.HTMLAttributes), 0];
      }
    });
  }

  function resolveTrackCommandsApi(){
    if(typeof window !== 'undefined' && window.AQTipTapWordCommands){
      return window.AQTipTapWordCommands;
    }
    if(typeof globalThis !== 'undefined' && globalThis.AQTipTapWordCommands){
      return globalThis.AQTipTapWordCommands;
    }
    if(typeof require === 'function'){
      try{ return require('./tiptap-word-commands.js'); }catch(_e){}
    }
    return null;
  }

  function isTrackChangesActive(hooks){
    hooks = hooks || {};
    if(typeof hooks.isTrackChangesEnabled === 'function'){
      try{ return !!hooks.isTrackChangesEnabled(); }catch(_e){}
    }
    var api = resolveTrackCommandsApi();
    if(api && typeof api.isTrackChangesEnabled === 'function'){
      try{ return !!api.isTrackChangesEnabled(); }catch(_e){}
    }
    return false;
  }

  function resolveTrackChangeAuthor(hooks){
    hooks = hooks || {};
    if(typeof hooks.getTrackChangeAuthor === 'function'){
      try{
        var value = String(hooks.getTrackChangeAuthor() || '').trim();
        if(value) return value;
      }catch(_e){}
    }
    return 'user';
  }

  function createTrackMarkAttrs(hooks){
    return {
      'data-track-author': resolveTrackChangeAuthor(hooks),
      'data-track-ts': String(Date.now())
    };
  }

  function rangeHasTrackDeleteMark(state, from, to){
    if(!state || !state.doc || typeof state.doc.nodesBetween !== 'function') return false;
    var markType = state.schema && state.schema.marks ? state.schema.marks.trackDelete : null;
    if(!markType) return false;
    var hasMarkedText = false;
    state.doc.nodesBetween(from, to, function(node){
      if(hasMarkedText || !node || !node.isText) return;
      hasMarkedText = !!(Array.isArray(node.marks) && node.marks.some(function(mark){ return mark && mark.type === markType; }));
    });
    return hasMarkedText;
  }

  function rangeHasUnmarkedTextForMark(state, from, to, markType){
    if(!state || !state.doc || typeof state.doc.nodesBetween !== 'function' || !markType) return false;
    var hasText = false;
    var hasUnmarkedText = false;
    state.doc.nodesBetween(from, to, function(node){
      if(hasUnmarkedText || !node || !node.isText) return;
      hasText = true;
      var marked = !!(Array.isArray(node.marks) && node.marks.some(function(mark){ return mark && mark.type === markType; }));
      if(!marked) hasUnmarkedText = true;
    });
    return hasText && hasUnmarkedText;
  }

  function applyTrackedInsert(view, from, to, text, hooks){
    if(!view || !view.state || !view.dispatch || !text) return false;
    var state = view.state;
    var marks = state.schema && state.schema.marks ? state.schema.marks : null;
    var insertMarkType = marks ? marks.trackInsert : null;
    if(!insertMarkType) return false;
    var nextText = String(text);

    // Word-like replacement behavior:
    // when typing over a selection, keep selected content in place as a
    // deletion suggestion and append the new text as insertion suggestion.
    if(to > from){
      var deleteMarkType = marks ? marks.trackDelete : null;
      if(deleteMarkType){
        var trReplace = state.tr;
        if(!rangeHasTrackDeleteMark(state, from, to)){
          trReplace = trReplace.addMark(from, to, deleteMarkType.create(createTrackMarkAttrs(hooks)));
        }
        var insertFrom = to;
        var insertTo = insertFrom + nextText.length;
        trReplace = trReplace.insertText(nextText, insertFrom);
        trReplace = trReplace.addMark(insertFrom, insertTo, insertMarkType.create(createTrackMarkAttrs(hooks)));
        var selection = state.selection || null;
        var selectionCtor = selection && selection.constructor;
        if(selectionCtor && typeof selectionCtor.near === 'function'){
          try{ trReplace = trReplace.setSelection(selectionCtor.near(trReplace.doc.resolve(insertTo))); }catch(_e){}
        }
        view.dispatch(trReplace.scrollIntoView());
        return true;
      }
    }

    var tr = state.tr.insertText(nextText, from, to);
    var end = from + nextText.length;
    tr = tr.addMark(from, end, insertMarkType.create(createTrackMarkAttrs(hooks)));
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  function resolveTrackDeleteRange(state, key){
    if(!state || !state.selection) return null;
    var from = state.selection.from;
    var to = state.selection.to;
    if(from !== to){
      return { from:from, to:to };
    }
    if(String(key || '') === 'Backspace'){
      if(from <= 0) return null;
      return { from:from - 1, to:from };
    }
    if(String(key || '') === 'Delete'){
      var docSize = state.doc && state.doc.content ? state.doc.content.size : 0;
      if(from >= docSize) return null;
      return { from:from, to:from + 1 };
    }
    return null;
  }

  function applyTrackedDelete(view, key, hooks){
    if(!view || !view.state || !view.dispatch) return false;
    var state = view.state;
    var markType = state.schema && state.schema.marks ? state.schema.marks.trackDelete : null;
    if(!markType) return false;
    var range = resolveTrackDeleteRange(state, key);
    if(!range || range.to <= range.from) return false;
    var snippet = state.doc && typeof state.doc.textBetween === 'function'
      ? String(state.doc.textBetween(range.from, range.to, '', '') || '')
      : '';
    if(!snippet.trim()) return false;
    if(!rangeHasUnmarkedTextForMark(state, range.from, range.to, markType)) return true;
    var tr = state.tr.addMark(range.from, range.to, markType.create(createTrackMarkAttrs(hooks)));
    var selectionCtor = state.selection && state.selection.constructor;
    if(selectionCtor && typeof selectionCtor.near === 'function'){
      tr = tr.setSelection(selectionCtor.near(tr.doc.resolve(range.from)));
    }
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  function resolvePastedPlainText(plainText, htmlText){
    var plain = String(plainText || '').replace(/\r\n?/g, '\n');
    if(plain.trim()) return plain;
    var html = String(htmlText || '');
    if(!html) return '';
    if(typeof document !== 'undefined' && document.createElement){
      var wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      plain = String(wrapper.innerText || wrapper.textContent || '');
    }else{
      plain = html
        .replace(/<br\b[^>]*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|section|article)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ');
    }
    return String(plain || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function applyTrackedPaste(view, event, hooks){
    if(!isTrackChangesActive(hooks)) return false;
    var clipboard = event && event.clipboardData ? event.clipboardData : null;
    if(!clipboard || typeof clipboard.getData !== 'function') return false;
    var plain = resolvePastedPlainText(
      clipboard.getData('text/plain') || '',
      clipboard.getData('text/html') || ''
    );
    if(!plain) return false;
    var selection = view && view.state ? view.state.selection : null;
    var from = selection ? Number(selection.from || 0) : 0;
    var to = selection ? Number(selection.to || from) : from;
    var handled = applyTrackedInsert(view, from, to, plain, hooks);
    if(handled && event && typeof event.preventDefault === 'function'){
      event.preventDefault();
    }
    return handled;
  }

  function createTrackChangesExtension(T, hooks){
    hooks = hooks || {};
    return T.Extension.create({
      name:'trackChangesRuntime',
      addProseMirrorPlugins:function(){
        return [new T.PmPlugin({
          key:new T.PmPluginKey('trackChangesRuntime'),
          props:{
            handlePaste:function(view, event){
              return applyTrackedPaste(view, event, hooks);
            },
            handleTextInput:function(view, from, to, text){
              if(!isTrackChangesActive(hooks)) return false;
              return applyTrackedInsert(view, from, to, text, hooks);
            },
            handleKeyDown:function(view, event){
              if(!isTrackChangesActive(hooks)) return false;
              if(!event || event.ctrlKey || event.metaKey || event.altKey) return false;
              var key = String(event.key || '');
              if(key !== 'Backspace' && key !== 'Delete') return false;
              return applyTrackedDelete(view, key, hooks);
            }
          }
        })];
      }
    });
  }

  function createApaPasteExtension(T, hooks){
    hooks = hooks || {};
    return T.Extension.create({
      name:'apaPaste',
      addProseMirrorPlugins:function(){
        var self = this;
        return [new T.PmPlugin({
          key:new T.PmPluginKey('apaPaste'),
          props:{
            handlePaste:function(view, event){
              if(isTrackChangesActive(hooks)) return false;
              var html = event.clipboardData.getData('text/html');
              var text = event.clipboardData.getData('text/plain');
              if(html && html.includes('class="cit"')) return false;
              // Cap pasted HTML size: anything over ~2 MB is almost certainly
              // bloated Word/Web markup that turns the editor unusable on
              // subsequent interactions. Fall through to the plain-text path
              // below so the user still gets the prose without the cruft.
              var PASTE_HTML_CAP = 2 * 1024 * 1024;
              if(html && html.length > PASTE_HTML_CAP){ html = ''; }
              if(html && !event.shiftKey){
                var cleaned = typeof hooks.cleanPastedHTML === 'function'
                  ? hooks.cleanPastedHTML(html)
                  : html;
                self.editor.commands.insertContent(cleaned);
                if(typeof hooks.onMutate === 'function') hooks.onMutate(self.editor);
                return true;
              }
              if(text){
                var formatted = typeof hooks.formatPlainTextAPA === 'function'
                  ? hooks.formatPlainTextAPA(text)
                  : text;
                self.editor.commands.insertContent(formatted);
                if(typeof hooks.onMutate === 'function') hooks.onMutate(self.editor);
                return true;
              }
              return false;
            }
          }
        })];
      }
    });
  }

  function createSlashRTriggerExtension(T){
    return T.Extension.create({
      name:'slashRTrigger',
      addProseMirrorPlugins:function(){
        function scheduleRefresh(){
          setTimeout(function(){
            try{
              if(window.AQCitationRuntime && typeof window.AQCitationRuntime.refreshFromEditor === 'function'){
                window.AQCitationRuntime.refreshFromEditor();
                return;
              }
              if(typeof window.checkTrig === 'function'){
                window.checkTrig();
              }
            }catch(_e){}
          }, 0);
          return false;
        }
        function triggerSlashRCandidate(view, from, text){
          try{
            var before = view && view.state && view.state.doc && typeof view.state.doc.textBetween === 'function'
              ? view.state.doc.textBetween(Math.max(0, from - 128), from, '', '')
              : '';
            var combined = String(before || '') + String(text || '');
            var match = combined.match(/\/r(?:\s*([^\n\r]*))?$/i);
            if(!match) return false;
            var insertedLength = String(text || '').length;
            var end = from + insertedLength;
            var start = Math.max(0, end - match[0].length);
            var query = String(match[1] || '').trim();
            setTimeout(function(){
              try{
                window.editorTrigRange = { from:start, to:end };
                if(window.AQCitationRuntime && typeof window.AQCitationRuntime.openFromSlash === 'function'){
                  window.AQCitationRuntime.openFromSlash(query);
                  return;
                }
                if(typeof window.openTrig === 'function'){
                  window.openTrig(query);
                  return;
                }
                if(typeof window.checkTrig === 'function'){
                  window.checkTrig();
                }
              }catch(_e){}
            }, 0);
            return true;
          }catch(_e){
            return false;
          }
        }
        return [new T.PmPlugin({
          key:new T.PmPluginKey('slashRTrigger'),
          props:{
            handleTextInput:function(view, from, _to, text){
              if(typeof text === 'string' && text){
                if(triggerSlashRCandidate(view, from, text)) return false;
                return scheduleRefresh();
              }
              return false;
            },
            handleKeyDown:function(_view, event){
              var key = String(event && event.key || '');
              if(key === 'Backspace' || key === 'Delete' || key === 'Escape'){
                return scheduleRefresh();
              }
              return false;
            },
            handleDOMEvents:{
              compositionend:function(){
                scheduleRefresh();
                return false;
              }
            }
          }
        })];
      }
    });
  }

  function createSuperscriptMark(T){
    return T.Mark.create({
      name:'superscript',
      parseHTML:function(){ return [{ tag:'sup' }]; },
      renderHTML:function(){ return ['sup', 0]; },
      addCommands:function(){
        var self = this;
        return {
          toggleSuperscript:function(){
            return function(ctx){ return ctx.commands.toggleMark(self.name); };
          }
        };
      }
    });
  }

  function createSubscriptMark(T){
    return T.Mark.create({
      name:'subscript',
      parseHTML:function(){ return [{ tag:'sub' }]; },
      renderHTML:function(){ return ['sub', 0]; },
      addCommands:function(){
        var self = this;
        return {
          toggleSubscript:function(){
            return function(ctx){ return ctx.commands.toggleMark(self.name); };
          }
        };
      }
    });
  }

  // ── APA paragraph indent helpers ─────────────────────────────────────────
  // Normalization plugin: corrects indentMode whenever doc changes (handles paste, programmatic inserts)
  function createApaIndentPlugin(T){
    return T.Extension.create({
      name:'apaIndentNormalize',
      addProseMirrorPlugins:function(){
        return [new T.PmPlugin({
          key:new T.PmPluginKey('apaIndentNormalize'),
          appendTransaction:function(transactions, _old, newState){
            if(!transactions.some(function(tr){ return tr.docChanged; })) return null;
            var tr = newState.tr;
            var result = normalizeParagraphIndentation({
              doc:newState.doc,
              applyUpdate:function(update){
                tr.setNodeMarkup(update.pos, null, update.attrs);
              }
            });
            return result.changed ? tr : null;
          }
        })];
      }
    });
  }
  // ─────────────────────────────────────────────────────────────────────────

  function createApaParagraph(T){
    return T.Paragraph.extend({
      addAttributes:function(){
        return Object.assign({}, this.parent ? this.parent() : {}, {
          class:{
            default:null,
            parseHTML:function(el){
              var cls = el.getAttribute('class') || null;
              if(!cls) return null;
              // Strip indent-derived classes — they are reconstructed from indentMode attr
              return stripIndentClasses(cls);
            },
            renderHTML:function(attrs){ return attrs.class ? { class:attrs.class } : {}; }
          },
          style:{
            default:null,
            parseHTML:function(el){ return el.getAttribute('style') || null; },
            renderHTML:function(attrs){ return attrs.style ? { style:attrs.style } : {}; }
          },
          indentMode:{
            default:'first-line',
            parseHTML:function(el){ return parseIndentModeFromElement(el); },
            renderHTML:function(attrs){
              return { 'data-indent-mode':sanitizeIndentMode(attrs.indentMode) };
            }
          },
          'data-note-id':{
            default:null,
            parseHTML:function(el){ return el.getAttribute('data-note-id') || null; },
            renderHTML:function(attrs){ return attrs['data-note-id'] ? { 'data-note-id':attrs['data-note-id'] } : {}; }
          },
          'data-note-ref':{
            default:null,
            parseHTML:function(el){ return el.getAttribute('data-note-ref') || null; },
            renderHTML:function(attrs){ return attrs['data-note-ref'] ? { 'data-note-ref':attrs['data-note-ref'] } : {}; }
          },
          'data-note-page':{
            default:null,
            parseHTML:function(el){ return el.getAttribute('data-note-page') || null; },
            renderHTML:function(attrs){ return attrs['data-note-page'] ? { 'data-note-page':attrs['data-note-page'] } : {}; }
          },
          'data-note-type':{
            default:null,
            parseHTML:function(el){ return el.getAttribute('data-note-type') || null; },
            renderHTML:function(attrs){ return attrs['data-note-type'] ? { 'data-note-type':attrs['data-note-type'] } : {}; }
          },
          'data-note-nb':{
            default:null,
            parseHTML:function(el){ return el.getAttribute('data-note-nb') || null; },
            renderHTML:function(attrs){ return attrs['data-note-nb'] ? { 'data-note-nb':attrs['data-note-nb'] } : {}; }
          },
          'data-mn-block-id':{
            default:null,
            parseHTML:function(el){ return el.getAttribute('data-mn-block-id') || null; },
            renderHTML:function(attrs){ return attrs['data-mn-block-id'] ? { 'data-mn-block-id':attrs['data-mn-block-id'] } : {}; }
          }
        });
      },
      addKeyboardShortcuts:function(){
        var self = this;
        return {
          Enter:function(){
            var editor = self.editor;
            var $head = editor.state.selection.$head;
            // Delegate list items and code blocks to their own handlers
            for(var d = $head.depth; d >= 0; d--){
              var tn = $head.node(d).type.name;
              if(tn === 'listItem' || tn === 'codeBlock') return false;
            }
            var didSplit = editor.commands.splitBlock();
            if(!didSplit) return false;
            var nextHead = editor.state.selection.$head;
            if(nextHead && nextHead.parent && nextHead.parent.type && nextHead.parent.type.name === 'paragraph'){
              var paragraphPos = resolveParagraphPosFromSelection(nextHead);
              var mode = resolveParagraphIndentMode({
                doc:editor.state.doc,
                pos:paragraphPos,
                $pos:nextHead,
                node:nextHead.parent
              });
              editor.commands.updateAttributes('paragraph', { indentMode:mode });
            }
            return true;
          }
        };
      }
    });
  }

  function createApaHeading(T){
    return T.Heading.extend({
      addAttributes:function(){
        return Object.assign({}, this.parent ? this.parent() : {}, {
          class:{
            default:null,
            parseHTML:function(el){ return el.getAttribute('class') || null; },
            renderHTML:function(attrs){ return attrs.class ? { class:attrs.class } : {}; }
          },
          style:{
            default:null,
            parseHTML:function(el){ return el.getAttribute('style') || null; },
            renderHTML:function(attrs){ return attrs.style ? { style:attrs.style } : {}; }
          },
          'data-mn-block-id':{
            default:null,
            parseHTML:function(el){ return el.getAttribute('data-mn-block-id') || null; },
            renderHTML:function(attrs){ return attrs['data-mn-block-id'] ? { 'data-mn-block-id':attrs['data-mn-block-id'] } : {}; }
          }
        });
      }
    });
  }

  function createFontSizeExtension(T){
    return T.Extension.create({
      name:'fontSize',
      addGlobalAttributes:function(){
        return [{
          types:['textStyle'],
          attributes:{
            fontSize:{
              default:null,
              parseHTML:function(el){ return el.style.fontSize || null; },
              renderHTML:function(attrs){
                return attrs.fontSize ? { style:'font-size:' + attrs.fontSize } : {};
              }
            }
          }
        }];
      }
    });
  }

  function normalizeImageWidth(value){
    var text = String(value == null ? '' : value).trim();
    if(!text) return '70%';
    var pct = text.match(/^(\d+(?:\.\d+)?)%$/);
    if(pct){
      var pctNum = Math.max(10, Math.min(100, parseFloat(pct[1]) || 70));
      var pctText = String(Math.round(pctNum * 10) / 10);
      return pctText.replace(/\.0$/,'') + '%';
    }
    var px = text.match(/^(\d+(?:\.\d+)?)px$/i);
    if(px){
      var pxNum = Math.max(80, Math.min(1600, parseFloat(px[1]) || 320));
      return String(Math.round(pxNum)) + 'px';
    }
    var raw = parseFloat(text);
    if(isFinite(raw) && raw > 0){
      var rawNum = Math.max(10, Math.min(100, raw));
      var rawText = String(Math.round(rawNum * 10) / 10);
      return rawText.replace(/\.0$/,'') + '%';
    }
    return '70%';
  }

  function normalizeImageAlign(value){
    var next = String(value || 'left').toLowerCase();
    if(next === 'center' || next === 'right') return next;
    return 'left';
  }

  function createApaImage(T){
    return T.Image.extend({
      draggable:true,
      addAttributes:function(){
        return Object.assign({}, this.parent ? this.parent() : {}, {
          width:{
            default:'70%',
            parseHTML:function(el){
              return normalizeImageWidth(
                el.getAttribute('data-width')
                || el.style.width
                || el.getAttribute('width')
                || '70%'
              );
            },
            renderHTML:function(attrs){
              return attrs.width ? { 'data-width':normalizeImageWidth(attrs.width) } : {};
            }
          },
          align:{
            default:'left',
            parseHTML:function(el){
              var style = String(el.getAttribute('style') || '').toLowerCase();
              var inferred = 'left';
              if(style.indexOf('float:right') >= 0){
                inferred = 'right';
              }else if(style.indexOf('float:left') >= 0){
                inferred = 'left';
              }else if(style.indexOf('margin-left:auto') >= 0 && style.indexOf('margin-right:auto') >= 0){
                inferred = 'center';
              }else if(style.indexOf('margin-left:auto') >= 0 && style.indexOf('margin-right:0') >= 0){
                inferred = 'right';
              }
              return normalizeImageAlign(
                el.getAttribute('data-align')
                || el.getAttribute('align')
                || inferred
              );
            },
            renderHTML:function(attrs){
              return { 'data-align':normalizeImageAlign(attrs.align) };
            }
          },
          layout:{
            default:null,
            parseHTML:function(el){
              var layout = String(el.getAttribute('data-layout') || '').toLowerCase();
              return layout === 'side' ? 'side' : null;
            },
            renderHTML:function(attrs){
              var layout = String(attrs.layout || '').toLowerCase();
              return layout === 'side' ? { 'data-layout':'side' } : {};
            }
          }
        });
      },
      renderHTML:function(render){
        var attrs = Object.assign({}, render.HTMLAttributes || {});
        var width = normalizeImageWidth(attrs.width || attrs['data-width']);
        var align = normalizeImageAlign(attrs.align || attrs['data-align']);
        var layout = String(attrs.layout || attrs['data-layout'] || '').toLowerCase() === 'side' ? 'side' : '';
        delete attrs.width;
        delete attrs.align;
        delete attrs.layout;
        var styleParts = [];
        if(attrs.style) styleParts.push(String(attrs.style));
        styleParts.push('display:block');
        styleParts.push('height:auto');
        styleParts.push('max-width:100%');
        styleParts.push('text-indent:0');
        if(layout === 'side'){
          styleParts.push('width:100%');
          styleParts.push('float:none');
          styleParts.push('margin:0');
        }else{
          styleParts.push('width:' + width);
          if(align === 'center'){
            styleParts.push('float:none');
            styleParts.push('margin-left:auto');
            styleParts.push('margin-right:auto');
            styleParts.push('margin-top:4px');
            styleParts.push('margin-bottom:12px');
          }else if(align === 'right'){
            styleParts.push('float:right');
            styleParts.push('margin-left:14px');
            styleParts.push('margin-right:0');
            styleParts.push('margin-top:2px');
            styleParts.push('margin-bottom:10px');
          }else{
            styleParts.push('float:left');
            styleParts.push('margin-left:0');
            styleParts.push('margin-right:14px');
            styleParts.push('margin-top:2px');
            styleParts.push('margin-bottom:10px');
          }
        }
        attrs.style = styleParts.join(';') + ';';
        attrs['data-width'] = width;
        attrs['data-align'] = align;
        if(layout === 'side') attrs['data-layout'] = 'side';
        attrs.draggable = 'true';
        return ['img', T.mergeAttributes(this.options.HTMLAttributes, attrs)];
      },
      addCommands:function(){
        var parentCommands = this.parent ? (this.parent() || {}) : {};
        return Object.assign({}, parentCommands, {
          setImageWidth:function(width){
            var nextWidth = normalizeImageWidth(width);
            return function(ctx){
              return ctx.commands.updateAttributes('image', { width:nextWidth });
            };
          },
          setImageAlign:function(align){
            var nextAlign = normalizeImageAlign(align);
            return function(ctx){
              return ctx.commands.updateAttributes('image', { align:nextAlign });
            };
          }
        });
      }
    }).configure({ inline:false, allowBase64:true });
  }

  function getActiveListItemNode(editor){
    if(!editor || !editor.state || !editor.state.selection || !editor.state.selection.$from) return null;
    var $from = editor.state.selection.$from;
    for(var depth = $from.depth; depth >= 0; depth--){
      var node = $from.node(depth);
      if(node && node.type && node.type.name === 'listItem') return node;
    }
    return null;
  }

  function hasSelectionListContext(editor){
    if(!editor || !editor.state || !editor.state.selection || !editor.state.selection.$from) return false;
    var $from = editor.state.selection.$from;
    for(var depth = $from.depth; depth >= 0; depth--){
      var node = $from.node(depth);
      if(!node || !node.type) continue;
      var typeName = node.type.name;
      if(typeName === 'bulletList' || typeName === 'orderedList' || typeName === 'listItem'){
        return true;
      }
    }
    return false;
  }

  function isListContextActive(editor){
    if(!editor) return false;
    try{
      if(typeof editor.isActive === 'function'
        && (editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('listItem'))){
        return true;
      }
    }catch(_e){
      // Fall through to selection-based detection.
    }
    return hasSelectionListContext(editor);
  }

  function isCurrentListItemEmpty(editor){
    var node = getActiveListItemNode(editor);
    if(!node) return false;
    return !String(node.textContent || '').replace(/\u00a0/g, ' ').trim();
  }

  function handleWordListEnter(editor){
    if(!isListContextActive(editor) || !editor || !editor.chain) return false;
    try{
      if(isCurrentListItemEmpty(editor)){
        if(editor.commands && typeof editor.commands.liftListItem === 'function' && editor.commands.liftListItem('listItem')) return true;
        if(editor.chain().focus().liftListItem('listItem').run()) return true;
        if(editor.commands && typeof editor.commands.clearNodes === 'function'){
          return !!editor.chain().focus().clearNodes().run();
        }
        return false;
      }
      if(editor.commands && typeof editor.commands.splitListItem === 'function' && editor.commands.splitListItem('listItem')) return true;
      if(editor.chain().focus().splitListItem('listItem').run()) return true;
    }catch(_e){}
    return false;
  }

  function handleWordListTab(editor, outdent){
    if(!isListContextActive(editor) || !editor || !editor.chain) return false;
    try{
      if(outdent){
        if(editor.commands && typeof editor.commands.liftListItem === 'function' && editor.commands.liftListItem('listItem')) return true;
        return !!editor.chain().focus().liftListItem('listItem').run();
      }
      if(editor.commands && typeof editor.commands.sinkListItem === 'function' && editor.commands.sinkListItem('listItem')) return true;
      return !!editor.chain().focus().sinkListItem('listItem').run();
    }catch(_e){
      return false;
    }
  }

  // Word-like Backspace in lists: at the start of an empty list item, lift the
  // item out of the list (same effect as Shift+Tab when already at level 0).
  // For a non-empty item whose cursor is at the very start and at depth 0, also
  // lift it so typing flows back to normal paragraphs.
  function handleWordListBackspace(editor){
    if(!isListContextActive(editor) || !editor || !editor.state || !editor.chain) return false;
    try{
      var sel = editor.state.selection;
      if(!sel || sel.from !== sel.to) return false;
      var $from = sel.$from;
      if(!$from) return false;
      // Only intercept when cursor is at the very start of the list item's
      // paragraph AND the item is empty. Non-empty items fall through to
      // default Backspace so characters can be deleted normally.
      if($from.parentOffset !== 0) return false;
      if(!isCurrentListItemEmpty(editor)) return false;
      if(editor.commands && typeof editor.commands.liftListItem === 'function' && editor.commands.liftListItem('listItem')) return true;
      return !!editor.chain().focus().liftListItem('listItem').run();
    }catch(_e){
      return false;
    }
  }

  function createWordListKeymap(T){
    return T.Extension.create({
      name:'wordListKeymap',
      priority:1000,
      addKeyboardShortcuts:function(){
        var self = this;
        return {
          Enter:function(){ return handleWordListEnter(self.editor); },
          Tab:function(){ return handleWordListTab(self.editor, false); },
          'Shift-Tab':function(){ return handleWordListTab(self.editor, true); },
          Backspace:function(){ return handleWordListBackspace(self.editor); }
        };
      }
    });
  }

  function matchWordListAutoformatPattern(text){
    var raw = String(text || '').replace(/\u00a0/g, ' ').trim();
    if(!raw) return null;
    if(raw === '-' || raw === '*' || raw === '•'){
      return { listType:'bulletList', listStyleType:'disc' };
    }
    if(/^(?:ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\.$/i.test(raw)){
      return { listType:'orderedList', listStyleType:'lower-roman' };
    }
    if(/^\d+\.$/.test(raw)){
      return { listType:'orderedList', listStyleType:'decimal' };
    }
    if(/^[a-z]\.$/i.test(raw)){
      return { listType:'orderedList', listStyleType:'lower-alpha' };
    }
    return null;
  }

  function resolveWordListAutoformatCandidate(editor, from){
    if(!editor || !editor.state || !editor.state.doc || !editor.state.selection) return null;
    var state = editor.state;
    if(state.selection.from !== state.selection.to) return null;
    if(isListContextActive(editor)) return null;
    var clampedFrom = Math.max(0, Math.min(parseInt(from, 10) || 0, state.doc.content ? state.doc.content.size : 0));
    var $from = state.doc.resolve(clampedFrom);
    if(!$from || !$from.parent || !$from.parent.type || $from.parent.type.name !== 'paragraph') return null;
    var parentStart = clampedFrom - $from.parentOffset;
    var markerText = state.doc.textBetween(parentStart, clampedFrom, '', '');
    var matched = matchWordListAutoformatPattern(markerText);
    if(!matched) return null;
    return {
      from: parentStart,
      to: clampedFrom,
      listType: matched.listType,
      listStyleType: matched.listStyleType
    };
  }

  function applyWordListAutoformat(editor, candidate){
    if(!editor || !candidate || !editor.view || !editor.state) return false;
    try{
      var tr = editor.state.tr.delete(candidate.from, candidate.to);
      editor.view.dispatch(tr);
      var chain = editor.chain().focus();
      if(candidate.listType === 'orderedList'){
        if(typeof chain.toggleOrderedList !== 'function') return false;
        chain.toggleOrderedList();
        if(typeof chain.updateAttributes === 'function'){
          chain.updateAttributes('orderedList', { listStyleType:candidate.listStyleType || 'decimal' });
        }
      }else{
        if(typeof chain.toggleBulletList !== 'function') return false;
        chain.toggleBulletList();
        if(typeof chain.updateAttributes === 'function'){
          chain.updateAttributes('bulletList', { listStyleType:candidate.listStyleType || 'disc' });
        }
      }
      return !!chain.run();
    }catch(_e){
      return false;
    }
  }

  function createWordListAutoformat(T){
    return T.Extension.create({
      name:'wordListAutoformat',
      priority:1050,
      addProseMirrorPlugins:function(){
        var self = this;
        return [new T.PmPlugin({
          key:new T.PmPluginKey('wordListAutoformat'),
          props:{
            handleTextInput:function(_view, from, _to, text){
              if(String(text || '') !== ' ') return false;
              var candidate = resolveWordListAutoformatCandidate(self.editor, from);
              if(!candidate) return false;
              return applyWordListAutoformat(self.editor, candidate);
            }
          }
        })];
      }
    });
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

  function normalizeOrderedListTypeAttr(value){
    var next = normalizeListStyleType('orderedList', value);
    if(next === 'lower-alpha') return 'a';
    if(next === 'lower-roman') return 'i';
    if(next === 'upper-alpha') return 'A';
    if(next === 'upper-roman') return 'I';
    return null;
  }

  function parseListStyleTypeFromElement(listType, el){
    if(!el || typeof el.getAttribute !== 'function') return null;
    var dataAttr = normalizeListStyleType(listType, el.getAttribute('data-list-style'));
    if(dataAttr) return dataAttr;
    var inlineStyle = el.style && typeof el.style.listStyleType === 'string'
      ? normalizeListStyleType(listType, el.style.listStyleType)
      : null;
    if(inlineStyle) return inlineStyle;
    if(listType === 'orderedList'){
      var typeAttr = String(el.getAttribute('type') || '').trim();
      var typeAttrLower = typeAttr.toLowerCase();
      if(typeAttr === 'A') return 'upper-alpha';
      if(typeAttr === 'I') return 'upper-roman';
      if(typeAttrLower === 'a') return 'lower-alpha';
      if(typeAttrLower === 'i') return 'lower-roman';
      if(typeAttrLower === '1') return 'decimal';
    }
    return null;
  }

  function renderListStyleTypeAttrs(listType, value){
    var next = normalizeListStyleType(listType, value);
    if(!next) return {};
    var attrs = {
      'data-list-style':next,
      style:'list-style-type:' + next
    };
    if(listType === 'orderedList'){
      var typeAttr = normalizeOrderedListTypeAttr(next);
      if(typeAttr) attrs.type = typeAttr;
    }
    return attrs;
  }

  function createListStyleExtension(T){
    return T.Extension.create({
      name:'listStyleType',
      addGlobalAttributes:function(){
        return [{
          types:['bulletList'],
          attributes:{
            listStyleType:{
              default:null,
              parseHTML:function(el){
                return parseListStyleTypeFromElement('bulletList', el);
              },
              renderHTML:function(attrs){
                return renderListStyleTypeAttrs('bulletList', attrs.listStyleType);
              }
            }
          }
        },{
          types:['orderedList'],
          attributes:{
            listStyleType:{
              default:null,
              parseHTML:function(el){
                return parseListStyleTypeFromElement('orderedList', el);
              },
              renderHTML:function(attrs){
                return renderListStyleTypeAttrs('orderedList', attrs.listStyleType);
              }
            }
          }
        }];
      }
    });
  }

  function createExtensions(T, hooks){
    hooks = hooks || {};
    return [
      T.StarterKit.configure({
        paragraph:false,
        heading:false,
        // Keep a deeper history stack so long writing sessions do not lose undo granularity.
        history:{ depth:500, newGroupDelay:500 }
      }),
      createApaParagraph(T),
      createApaHeading(T).configure({ levels:[1,2,3,4,5] }),
      T.Underline,
      T.TextAlign.configure({ types:['heading','paragraph'] }),
      T.Placeholder.configure({ placeholder: hooks.placeholder || 'Yazmaya başlayın...' }),
      T.TextStyle,
      createFontSizeExtension(T),
      createListStyleExtension(T),
      T.FontFamily,
      T.Color,
      T.Highlight.configure({ multicolor:true }),
      createApaImage(T),
      T.Table.configure({ resizable:true }),
      T.TableRow,
      T.TableCell,
      T.TableHeader,
      createSuperscriptMark(T),
      createSubscriptMark(T),
      createCitationMark(T),
      createTrackInsertMark(T),
      createTrackDeleteMark(T),
      createApaPasteExtension(T, hooks),
      createSlashRTriggerExtension(T),
      createTrackChangesExtension(T, hooks),
      createApaIndentPlugin(T),
      createWordListKeymap(T),
      createWordListAutoformat(T),
      ...(typeof window !== 'undefined' && window.AQFootnotes ? [
        window.AQFootnotes.createFootnoteRefNode(T),
        window.AQFootnotes.createCrossRefMark(T)
      ] : [])
    ];
  }

  function createEditor(T, options){
    options = options || {};
    return new T.Editor({
      element: options.element,
      content: options.content || '<p></p>',
      extensions: createExtensions(T, options.hooks || {}),
      editorProps:{
        attributes:{
          class:'ProseMirror',
          spellcheck:'true'
        },
        handleKeyDown:function(_view, event){
          if(!event) return false;
          var key = String(event.key || '');
          var hasModifier = !!(event.ctrlKey || event.metaKey || event.altKey);
          var activeEditor = null;
          if(typeof window !== 'undefined' && window.editor) activeEditor = window.editor;
          else if(typeof globalThis !== 'undefined' && globalThis.editor) activeEditor = globalThis.editor;
          if(key === 'Enter' && !hasModifier){
            return handleWordListEnter(activeEditor) || false;
          }
          if(key === 'Tab' && !hasModifier){
            return handleWordListTab(activeEditor, !!event.shiftKey) || false;
          }
          if(key === 'Backspace' && !hasModifier){
            return handleWordListBackspace(activeEditor) || false;
          }
          return false;
        }
      },
      onUpdate:function(ctx){
        if(typeof options.onUpdate === 'function') options.onUpdate(ctx);
      },
      onSelectionUpdate:function(ctx){
        if(typeof options.onSelectionUpdate === 'function') options.onSelectionUpdate(ctx);
      }
    });
  }

  return {
    createExtensions:createExtensions,
    createEditor:createEditor,
    createListStyleExtension:createListStyleExtension,
    isTrackChangesActive:isTrackChangesActive,
    resolveTrackChangeAuthor:resolveTrackChangeAuthor,
    createTrackMarkAttrs:createTrackMarkAttrs,
    rangeHasTrackDeleteMark:rangeHasTrackDeleteMark,
    applyTrackedInsert:applyTrackedInsert,
    resolveTrackDeleteRange:resolveTrackDeleteRange,
    applyTrackedDelete:applyTrackedDelete,
    resolvePastedPlainText:resolvePastedPlainText,
    applyTrackedPaste:applyTrackedPaste,
    normalizeListStyleType:normalizeListStyleType,
    parseListStyleTypeFromElement:parseListStyleTypeFromElement,
    renderListStyleTypeAttrs:renderListStyleTypeAttrs,
    isListContextActive:isListContextActive,
    isCurrentListItemEmpty:isCurrentListItemEmpty,
    handleWordListEnter:handleWordListEnter,
    handleWordListTab:handleWordListTab,
    handleWordListBackspace:handleWordListBackspace,
    matchWordListAutoformatPattern:matchWordListAutoformatPattern,
    resolveWordListAutoformatCandidate:resolveWordListAutoformatCandidate,
    applyWordListAutoformat:applyWordListAutoformat
  };
});
