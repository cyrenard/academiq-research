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
      createApaImage(T),
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
          'data-enable-grammarly':'true',
          'data-grammarly-part':'true',
          'data-grammarly-integration':'true'
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
