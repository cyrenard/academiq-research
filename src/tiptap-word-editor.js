(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordEditor = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
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
          }
        };
      },
      parseHTML:function(){ return [{ tag:'span.cit' }]; },
      renderHTML:function(render){
        return ['span', T.mergeAttributes({ 'class':'cit' }, render.HTMLAttributes), 0];
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
              var html = event.clipboardData.getData('text/html');
              var text = event.clipboardData.getData('text/plain');
              if(html && html.includes('class="cit"')) return false;
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
        return [new T.PmPlugin({
          key:new T.PmPluginKey('slashRTrigger'),
          props:{
            handleKeyDown:function(){ return false; }
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

  function createApaParagraph(T){
    return T.Paragraph.extend({
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
          }
        });
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

  function createExtensions(T, hooks){
    hooks = hooks || {};
    return [
      T.StarterKit.configure({
        paragraph:false,
        heading:false,
        history:{ depth:100 }
      }),
      createApaParagraph(T),
      createApaHeading(T).configure({ levels:[1,2,3,4,5] }),
      T.Underline,
      T.TextAlign.configure({ types:['heading','paragraph'] }),
      T.Placeholder.configure({ placeholder: hooks.placeholder || 'Yazmaya başlayın...' }),
      T.TextStyle,
      createFontSizeExtension(T),
      T.FontFamily,
      T.Color,
      T.Highlight.configure({ multicolor:true }),
      T.Image.configure({ inline:false, allowBase64:true }),
      T.Table.configure({ resizable:true }),
      T.TableRow,
      T.TableCell,
      T.TableHeader,
      createSuperscriptMark(T),
      createSubscriptMark(T),
      createCitationMark(T),
      createApaPasteExtension(T, hooks),
      createSlashRTriggerExtension(T)
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
          spellcheck:'true',
          'data-gramm':'true',
          'data-gramm_editor':'true',
          'data-enable-grammarly':'true'
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
    createEditor:createEditor
  };
});
