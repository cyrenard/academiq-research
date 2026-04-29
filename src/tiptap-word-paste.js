(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordPaste = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  var ALLOWED_BULLET_STYLES = ['disc','circle','square'];
  var ALLOWED_ORDERED_STYLES = ['decimal','lower-alpha','lower-roman','upper-alpha','upper-roman'];

  function normalizeListStyleType(listType, value){
    var next = String(value == null ? '' : value).trim().toLowerCase();
    if(!next) return null;
    if(listType === 'bulletList'){
      return ALLOWED_BULLET_STYLES.indexOf(next) >= 0 ? next : null;
    }
    if(listType === 'orderedList'){
      return ALLOWED_ORDERED_STYLES.indexOf(next) >= 0 ? next : null;
    }
    return null;
  }

  function normalizeStyleAttribute(styleText){
    var text = String(styleText || '');
    if(!text.trim()) return '';
    var declarations = [];
    var allowedTextDecoration = ['underline','line-through','none'];
    function isSafeCssValue(value){
      var v = String(value || '').trim();
      if(!v) return false;
      if(/[<>]/.test(v)) return false;
      if(/expression\s*\(|javascript\s*:|url\s*\(/i.test(v)) return false;
      return true;
    }
    function isSafeCssLength(value){
      return /^-?\d+(?:\.\d+)?(?:pt|px|em|rem|cm|mm|in|%)$/i.test(String(value || '').trim())
        || /^0$/.test(String(value || '').trim());
    }
    function isSafeCssColor(value){
      var v = String(value || '').trim();
      return /^#[0-9a-f]{3,8}$/i.test(v)
        || /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(v)
        || /^[a-z]+$/i.test(v);
    }
    text.split(';').forEach(function(part){
      var seg = String(part || '');
      if(!seg.trim()) return;
      var idx = seg.indexOf(':');
      if(idx <= 0) return;
      var prop = seg.slice(0, idx).trim().toLowerCase();
      var value = seg.slice(idx + 1).trim();
      if(!prop || !value) return;
      if(prop.indexOf('mso-') === 0) return;
      if(!isSafeCssValue(value)) return;
      if(prop === 'font-family'){
        value = value.replace(/["']/g, '').split(',').map(function(item){ return item.trim(); }).filter(Boolean).slice(0, 3).join(', ');
        if(!value) return;
      }
      if(prop === 'font-size'){
        if(!isSafeCssLength(value)) return;
      }
      if(prop === 'color'){
        if(!isSafeCssColor(value)) return;
      }
      if(prop === 'background-color'){
        if(!isSafeCssColor(value)) return;
      }
      if(prop === 'line-height'){
        if(!/^\d+(?:\.\d+)?$/.test(value) && !isSafeCssLength(value)) return;
      }
      if(prop === 'font-weight'){
        if(!/^(normal|bold|bolder|lighter|[1-9]00)$/i.test(value)) return;
      }
      if(prop === 'font-style'){
        if(!/^(normal|italic|oblique)$/i.test(value)) return;
      }
      if(prop === 'text-decoration'){
        value = value.toLowerCase().split(/\s+/).filter(function(token){
          return allowedTextDecoration.indexOf(token) >= 0;
        }).join(' ');
        if(!value) return;
      }
      if(prop === 'text-align'){
        if(!/^(left|right|center|justify)$/i.test(value)) return;
      }
      if(/^margin-(left|right|top|bottom)$/.test(prop) || /^padding-(left|right|top|bottom)$/.test(prop) || prop === 'text-indent' || prop === 'width' || prop === 'height'){
        if(!isSafeCssLength(value)) return;
      }
      if(/^border(?:-(left|right|top|bottom))?(?:-(width|style|color))?$/.test(prop)){
        if(!/^[#a-z0-9\s.,()%+-]+$/i.test(value)) return;
      }
      if([
        'font-family','font-size','font-weight','font-style','text-decoration',
        'text-align','line-height','list-style-type','color','background-color',
        'vertical-align','margin-left','margin-right','margin-top','margin-bottom',
        'padding-left','padding-right','padding-top','padding-bottom',
        'text-indent','width','height',
        'border','border-left','border-right','border-top','border-bottom',
        'border-width','border-style','border-color',
        'border-left-width','border-left-style','border-left-color',
        'border-right-width','border-right-style','border-right-color',
        'border-top-width','border-top-style','border-top-color',
        'border-bottom-width','border-bottom-style','border-bottom-color'
      ].indexOf(prop) < 0){
        return;
      }
      declarations.push(prop + ':' + value);
    });
    return declarations.join(';');
  }

  function pickStyleDeclarations(styleText, allowed){
    var out = [];
    var allow = allowed || {};
    String(styleText || '').split(';').forEach(function(part){
      var idx = String(part || '').indexOf(':');
      if(idx <= 0) return;
      var prop = part.slice(0, idx).trim().toLowerCase();
      var value = part.slice(idx + 1).trim();
      if(prop && value && allow[prop]) out.push(prop + ':' + value);
    });
    return out.join(';');
  }

  function normalizeContentStyleForElement(el, styleText){
    var tag = String(el && el.tagName || '').toLowerCase();
    var safe = normalizeStyleAttribute(styleText);
    if(/^(p|div|h1|h2|h3|h4|h5|h6|li|blockquote)$/i.test(tag)){
      return pickStyleDeclarations(safe, {'text-align':1});
    }
    if(/^(table|tr|td|th|thead|tbody|tfoot)$/i.test(tag)){
      return pickStyleDeclarations(safe, {
        'text-align':1,
        'border':1,
        'border-left':1,
        'border-right':1,
        'border-top':1,
        'border-bottom':1,
        'border-width':1,
        'border-style':1,
        'border-color':1,
        'background-color':1
      });
    }
    if(tag === 'span' || tag === 'a' || tag === 'strong' || tag === 'em' || tag === 'u' || tag === 's' || tag === 'sup' || tag === 'sub'){
      return pickStyleDeclarations(safe, {
        'font-family':1,
        'font-size':1,
        'font-weight':1,
        'font-style':1,
        'text-decoration':1,
        'color':1,
        'background-color':1,
        'vertical-align':1
      });
    }
    return safe;
  }

  function stripBrokenWordInlineFragments(html){
    return String(html || '')
      .replace(/^\uFEFF+/, '')
      // Invalid Word font-span fragments should never become editor text.
      .replace(/<p>\s*<span(?![\s>/])[^>]{0,220}>\s*(?:\uFEFF|&nbsp;|\s)*<\/span\s*>\s*<\/p>/gi, '')
      .replace(/<span(?![\s>/])[^>]{0,220}>\s*(?:\uFEFF|&nbsp;|\s)*<\/span\s*>/gi, '')
      .replace(/<span(?![\s>/])[^>]{0,220}>/gi, '')
      .replace(/<p(?:\s[^>]*)?>\s*(?:<[^>]+>\s*)*(?:\uFEFF|&nbsp;|\s)*(?:\s*<\/[^>]+>)*\s*<\/p>/gi, '')
      .replace(/<p>\s*(?:\uFEFF|&nbsp;|\s)*<\/p>/gi, '');
  }

  function cleanPastedHTMLFallback(html){
    var out = String(html || '');
    // Drop HTML/MSO conditional comments in full
    out = out.replace(/<!--[\s\S]*?-->/g, '');
    // Drop Word/VML drawing payloads before namespace stripping can leak textbox text.
    out = out.replace(/<((?:v|o|w|m|wp|a|pic):(?:shape|shapetype|group|rect|roundrect|line|polyline|oval|textbox|imagedata|stroke|fill|path|shadow|anchorlock|drawing|pict|object|oleobject|diagram|background|wrap|lock|handles|formulas|f))\b[\s\S]*?<\/\1\s*>/gi, '');
    out = out.replace(/<(?:v|o|w|m|wp|a|pic):(?:shape|shapetype|group|rect|roundrect|line|polyline|oval|textbox|imagedata|stroke|fill|path|shadow|anchorlock|drawing|pict|object|oleobject|diagram|background|wrap|lock|handles|formulas|f)\b[^>]*\/?>/gi, '');
    // Drop entire <style>/<script> blocks including their text content
    out = out.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
    // Drop self-closing or unclosed <meta>/<link> tags (no inner content)
    out = out.replace(/<\/?(script|style|link|meta)[^>]*>/gi, '');
    out = out
      .replace(/<head\b[\s\S]*?<\/head\s*>/gi, '')
      .replace(/<\/?(?:html|body)\b[^>]*>/gi, '')
      .replace(/<div\b[^>]*class\s*=\s*(?:(["'])[^"']*\bWordSection\d*\b[^"']*\1|[^\s>]*\bWordSection\d*\b[^\s>]*)[^>]*>/gi, '')
      .replace(/<\/div>\s*$/i, '');
    out = stripBrokenWordInlineFragments(out);
    out = out.replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '');
    out = out.replace(/\s(?:id|class)\s*=\s*("[^"]*Mso[^"]*"|'[^']*Mso[^']*')/gi, '');
    out = out.replace(/<([a-z0-9]+)([^>]*?)\sstyle\s*=\s*("([^"]*)"|'([^']*)')([^>]*)>/gi, function(_match, tagName, before, _all, quotedDouble, quotedSingle, after){
      var raw = quotedDouble != null ? quotedDouble : quotedSingle;
      var fakeEl = { tagName: String(tagName || '').toUpperCase() };
      var next = normalizeContentStyleForElement(fakeEl, raw);
      return '<' + tagName + before + (next ? ' style="' + next + '"' : '') + after + '>';
    });
    return out;
  }

  function normalizeListStyleFromElement(listType, el){
    if(!el || typeof el.getAttribute !== 'function') return null;
    var byData = normalizeListStyleType(listType, el.getAttribute('data-list-style'));
    if(byData) return byData;
    var byInline = el.style && typeof el.style.listStyleType === 'string'
      ? normalizeListStyleType(listType, el.style.listStyleType)
      : null;
    if(byInline) return byInline;
    if(listType === 'orderedList'){
      var t = String(el.getAttribute('type') || '').trim();
      if(t === 'a') return 'lower-alpha';
      if(t === 'A') return 'upper-alpha';
      if(t === 'i') return 'lower-roman';
      if(t === 'I') return 'upper-roman';
      if(t === '1') return 'decimal';
    }
    return null;
  }

  function applyListStyleToElement(listType, el, styleType){
    if(!el) return;
    var safeStyle = normalizeListStyleType(listType, styleType) || (listType === 'orderedList' ? 'decimal' : 'disc');
    el.setAttribute('data-list-style', safeStyle);
    if(el.style) el.style.listStyleType = safeStyle;
    if(listType === 'orderedList'){
      if(safeStyle === 'lower-alpha') el.setAttribute('type', 'a');
      else if(safeStyle === 'upper-alpha') el.setAttribute('type', 'A');
      else if(safeStyle === 'lower-roman') el.setAttribute('type', 'i');
      else if(safeStyle === 'upper-roman') el.setAttribute('type', 'I');
      else el.removeAttribute('type');
    }
  }

  function cleanPastedHTML(html){
    if(typeof document === 'undefined') return cleanPastedHTMLFallback(html);
    var div = document.createElement('div');
    div.innerHTML = html || '';
    var importedBody = div.querySelector && div.querySelector('body');
    if(importedBody){
      div.innerHTML = importedBody.innerHTML || '';
    }

    // Remove potentially dangerous and editor-hostile nodes first.
    div.querySelectorAll('script,style,link,meta,o\\:p').forEach(function(el){ el.remove(); });
    div.querySelectorAll('html,head,body').forEach(function(node){
      if(!node.parentNode) return;
      while(node.firstChild) node.parentNode.insertBefore(node.firstChild, node);
      node.remove();
    });
    div.querySelectorAll('div[class*="WordSection"],section[class*="WordSection"]').forEach(function(node){
      if(!node.parentNode) return;
      while(node.firstChild) node.parentNode.insertBefore(node.firstChild, node);
      node.remove();
    });
    Array.from(div.querySelectorAll('*')).forEach(function(el){
      var tag = String(el.tagName || '').toLowerCase();
      var localName = tag.indexOf(':') >= 0 ? tag.split(':').pop() : tag;
      var style = String(el.getAttribute && el.getAttribute('style') || '');
      var cls = String(el.getAttribute && el.getAttribute('class') || '');
      if(/^(shape|shapetype|group|rect|roundrect|line|polyline|oval|textbox|imagedata|stroke|fill|path|shadow|anchorlock|drawing|pict|object|oleobject|diagram|background|wrap|lock|handles|formulas|f)$/i.test(localName)){
        el.remove();
        return;
      }
      if(/position\s*:\s*absolute/i.test(style) || /mso-element\s*:\s*frame/i.test(style) || /\bMsoShape\b/i.test(cls)){
        el.remove();
      }
    });
    div.querySelectorAll('br.Apple-interchange-newline').forEach(function(el){ el.remove(); });

    div.querySelectorAll('[style]').forEach(function(el){
      var nextStyle = normalizeContentStyleForElement(el, el.getAttribute('style') || '');
      if(nextStyle){
        el.setAttribute('style', nextStyle);
      }else{
        el.removeAttribute('style');
      }
    });

    div.querySelectorAll('span').forEach(function(span){
      if(!span.getAttribute('style') && !span.className){
        while(span.firstChild) span.parentNode.insertBefore(span.firstChild, span);
        span.remove();
      }
    });

    div.querySelectorAll('[contenteditable="false"]').forEach(function(el){ el.removeAttribute('contenteditable'); });
    div.querySelectorAll('*').forEach(function(el){
      Array.from(el.attributes).forEach(function(attr){
        var attrName = String(attr.name || '').toLowerCase();
        if(attrName.indexOf('on') === 0) el.removeAttribute(attr.name);
        if(attrName.indexOf('xmlns') === 0) el.removeAttribute(attr.name);
        if(attrName.indexOf(':') >= 0) el.removeAttribute(attr.name);
      });
      var className = String(el.getAttribute('class') || '');
      if(/\bmso/i.test(className)){
        var kept = className
          .split(/\s+/)
          .filter(function(token){
            return token && !/^mso/i.test(token) && token !== 'Apple-converted-space';
          })
          .join(' ');
        if(kept) el.setAttribute('class', kept);
        else el.removeAttribute('class');
      }
      if(el.tagName === 'A'){
        var href = String(el.getAttribute('href') || '').trim();
        if(href && !/^(https?:|mailto:|#)/i.test(href)){
          el.removeAttribute('href');
        }
      }
    });

    div.querySelectorAll('ul').forEach(function(ul){
      applyListStyleToElement('bulletList', ul, normalizeListStyleFromElement('bulletList', ul) || 'disc');
    });
    div.querySelectorAll('ol').forEach(function(ol){
      applyListStyleToElement('orderedList', ol, normalizeListStyleFromElement('orderedList', ol) || 'decimal');
    });

    div.querySelectorAll('p').forEach(function(p){
      var isNoIndent = p.classList.contains('ni') || p.classList.contains('refe') ||
        p.classList.contains('indent-none') ||
        p.getAttribute('data-indent-mode') === 'none' ||
        /^0(?:pt|px|cm|mm|in|%)?$/i.test(String(p.style && p.style.textIndent || '').trim());
      p.setAttribute('data-indent-mode', isNoIndent ? 'none' : 'first-line');
    });
    return div.innerHTML;
  }

  function escapeHTML(text){
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatPlainTextAPA(text){
    if(!text) return '';
    var lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    var html = [];
    var listBuffer = null;

    function detectListLine(line){
      var input = String(line || '').trim();
      if(!input) return null;
      var bullet = input.match(/^([•\-*])\s+(.+)$/);
      if(bullet){
        return { listType:'bulletList', style:'disc', text:bullet[2] };
      }
      var decimal = input.match(/^(\d+)[\.\)]\s+(.+)$/);
      if(decimal){
        return { listType:'orderedList', style:'decimal', text:decimal[2] };
      }
      var alpha = input.match(/^([a-z])[\.\)]\s+(.+)$/i);
      if(alpha){
        return { listType:'orderedList', style:'lower-alpha', text:alpha[2] };
      }
      var roman = input.match(/^([ivxlcdm]+)[\.\)]\s+(.+)$/i);
      if(roman){
        return { listType:'orderedList', style:'lower-roman', text:roman[2] };
      }
      return null;
    }

    function flushListBuffer(){
      if(!listBuffer || !listBuffer.items.length) return;
      if(listBuffer.listType === 'bulletList'){
        html.push(
          '<ul data-list-style="' + listBuffer.style + '" style="list-style-type:' + listBuffer.style + '">' +
          listBuffer.items.map(function(item){ return '<li>' + escapeHTML(item) + '</li>'; }).join('') +
          '</ul>'
        );
      }else{
        var typeAttr = '';
        if(listBuffer.style === 'lower-alpha') typeAttr = ' type="a"';
        else if(listBuffer.style === 'upper-alpha') typeAttr = ' type="A"';
        else if(listBuffer.style === 'lower-roman') typeAttr = ' type="i"';
        else if(listBuffer.style === 'upper-roman') typeAttr = ' type="I"';
        html.push(
          '<ol data-list-style="' + listBuffer.style + '"' + typeAttr + ' style="list-style-type:' + listBuffer.style + '">' +
          listBuffer.items.map(function(item){ return '<li>' + escapeHTML(item) + '</li>'; }).join('') +
          '</ol>'
        );
      }
      listBuffer = null;
    }

    lines.forEach(function(rawLine){
      var listLine = detectListLine(rawLine);
      if(listLine){
        if(!listBuffer || listBuffer.listType !== listLine.listType || listBuffer.style !== listLine.style){
          flushListBuffer();
          listBuffer = {
            listType:listLine.listType,
            style:listLine.style,
            items:[]
          };
        }
        listBuffer.items.push(listLine.text);
        return;
      }
      flushListBuffer();
      var trimmed = String(rawLine || '').trim();
      if(!trimmed) return;
      html.push('<p data-indent-mode="first-line">' + escapeHTML(trimmed) + '</p>');
    });

    flushListBuffer();
    return html.join('');
  }

  return {
    cleanPastedHTML: cleanPastedHTML,
    normalizeStyleAttribute: normalizeStyleAttribute,
    formatPlainTextAPA: formatPlainTextAPA
  };
});
