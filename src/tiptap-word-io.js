(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordIO = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  function stripDangerousTags(html){
    return String(html || '')
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
      .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '')
      .replace(/<embed[\s\S]*?>[\s\S]*?<\/embed>/gi, '');
  }

  function normalizeWhitespace(text){
    return String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isWordSectionBreakText(text){
    var normalized = normalizeWhitespace(text)
      .replace(/[\s:;,\.\-\u2013\u2014]+$/g, '')
      .toLowerCase();
    if(!normalized) return false;
    if(/^section break(?:\s*\((?:next|odd|even)\s+page\))?$/.test(normalized)) return true;
    if(/^bolum sonu(?:\s*\((?:sonraki|tek|cift)\s+sayfa\))?$/.test(normalized)) return true;
    if(/^b[o\u00f6]l[u\u00fc]m sonu(?:\s*\((?:sonraki|tek|cift)\s+sayfa\))?$/.test(normalized)) return true;
    return false;
  }

  function stripOfficeConditionalMarkup(html){
    return stripOfficeArtifactBlocks(String(html || ''))
      .replace(/<style[^>]*>[\s\S]*?<\/style\s*>/gi, '')
      .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
      .replace(/<xml[\s\S]*?<\/xml>/gi, '')
      .replace(/<\/?o:p[^>]*>/gi, '')
      .replace(/<o:[^>]+>[\s\S]*?<\/o:[^>]+>/gi, '')
      .replace(/<\/?(?:w|v|o|m):[^>]*>/gi, '');
  }

  function stripOfficeArtifactBlocks(html){
    var artifactNames = [
      'shape','shapetype','group','rect','roundrect','line','polyline','oval',
      'textbox','imagedata','stroke','fill','path','shadow','anchorlock',
      'drawing','pict','object','oleobject','diagram','background','wrap',
      'lock','handles','formulas','f'
    ].join('|');
    var namespacedBlock = new RegExp('<((?:v|o|w|m|wp|a|pic):(?:' + artifactNames + '))\\b[\\s\\S]*?<\\/\\1\\s*>', 'gi');
    var namespacedSingle = new RegExp('<(?:v|o|w|m|wp|a|pic):(?:' + artifactNames + ')\\b[^>]*\\/?>', 'gi');
    return String(html || '')
      // Word shape/VML payloads are layout artifacts, not editable prose. Remove the
      // whole block before generic namespace tag stripping can leak their text nodes.
      .replace(namespacedBlock, '')
      .replace(namespacedSingle, '');
  }

  function normalizeImportStyle(styleText){
    var pasteApi = (typeof window !== 'undefined' && window.AQTipTapWordPaste)
      ? window.AQTipTapWordPaste
      : (typeof globalThis !== 'undefined' ? globalThis.AQTipTapWordPaste : null);
    if(pasteApi && typeof pasteApi.normalizeStyleAttribute === 'function'){
      return pasteApi.normalizeStyleAttribute(styleText);
    }
    return String(styleText || '')
      .split(';')
      .map(function(part){ return String(part || '').trim(); })
      .filter(function(part){
        return part && !/^mso-/i.test(part) && !/expression\s*\(|javascript\s*:|url\s*\(/i.test(part);
      })
      .join(';');
  }

  function mergeStyleText(baseStyle, extraStyle){
    var map = {};
    [baseStyle, extraStyle].forEach(function(styleText){
      String(styleText || '').split(';').forEach(function(part){
        var idx = String(part || '').indexOf(':');
        if(idx <= 0) return;
        var prop = part.slice(0, idx).trim().toLowerCase();
        var value = part.slice(idx + 1).trim();
        if(prop && value) map[prop] = value;
      });
    });
    return Object.keys(map).map(function(prop){ return prop + ':' + map[prop]; }).join(';');
  }

  function extractWordClassStyles(html){
    var out = {};
    String(html || '').replace(/<style[^>]*>([\s\S]*?)<\/style\s*>/gi, function(_match, css){
      String(css || '').replace(/(?:^|})\s*([a-z0-9_-]+)?\.([a-z0-9_-]+)\s*\{([^}]*)\}/gi, function(_rule, _tag, className, body){
        var safe = normalizeImportStyle(body);
        if(!safe) return '';
        var key = String(className || '').toLowerCase();
        out[key] = mergeStyleText(out[key] || '', safe);
        return '';
      });
      return '';
    });
    return out;
  }

  function inlineWordClassStyles(wrapper, classStyles){
    if(!wrapper || !classStyles) return;
    Array.from(wrapper.querySelectorAll('[class]')).forEach(function(node){
      var merged = String(node.getAttribute('style') || '');
      String(node.getAttribute('class') || '').split(/\s+/).forEach(function(cls){
        var safe = classStyles[String(cls || '').toLowerCase()];
        if(safe) merged = mergeStyleText(safe, merged);
      });
      merged = normalizeImportStyle(merged);
      if(merged) node.setAttribute('style', merged);
    });
  }

  function decodeEntityNoise(text){
    return String(text || '')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#34;/gi, '"')
      .replace(/&amp;/gi, '&');
  }

  function looksLikeWordStyleText(text){
    var value = decodeEntityNoise(normalizeWhitespace(text)).toLowerCase();
    if(!value) return false;
    var cssSignals = 0;
    if(/[.#]?\bmso[a-z0-9_-]*\b/.test(value) || /\bmso-/.test(value)) cssSignals++;
    if(/\bfont-family\s*:|\bfont-size\s*:|\bfont-weight\s*:|\btext-decoration\s*:|\bmargin-(?:left|right|top|bottom)\s*:/.test(value)) cssSignals++;
    if(/@font-face|@page|mso-style-name|mso-style-link|mso-style-priority/.test(value)) cssSignals++;
    if(/[{};]/.test(value)) cssSignals++;
    if(/(?:^|\s)(?:p|span|a|div|table|td|li)\.[a-z0-9_-]+\s*\{/.test(value)) cssSignals++;
    return cssSignals >= 2;
  }

  function looksLikeEscapedMarkupText(text){
    var value = decodeEntityNoise(normalizeWhitespace(text));
    if(!value) return false;
    var tagMatches = value.match(/<\/?(?:span|p|div|style|font|xml|o:p|v:shape|w:[a-z0-9_-]+)\b/gi) || [];
    if(tagMatches.length >= 2) return true;
    if(tagMatches.length >= 1 && /\b(?:style|class|data-[a-z0-9_-]+)\s*=/i.test(value)) return true;
    return /\bspan\b[^\n]{0,120}\b(?:style|class|data-[a-z0-9_-]+)\s*=/i.test(value) || /\/span\b/i.test(value);
  }

  function isWordImportArtifactText(text){
    return looksLikeWordStyleText(text) || looksLikeEscapedMarkupText(text);
  }

  function cleanWordArtifactTextValue(text){
    var original = String(text || '');
    if(!original) return '';
    var decoded = decodeEntityNoise(original);
    var cleaned = decoded
      .replace(/<style[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
      // Fully escaped tag fragments (e.g. leaked Word "<span style=...>X</span>"
      // sitting as visible text inside a <p>) carry no real prose — drop the
      // inner text along with the wrapping tags so artifacts don't survive.
      .replace(/<(span|font|a|div|p|h[1-6]|style|xml|o:p|v:shape|w:[a-z0-9_-]+)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      // Unmatched opening/closing tags from half-broken leaked markup.
      // Without this, `[{}<>]` stripping below would leave attribute text like
      // `p class=ag-... data-indent-mode=first-line` visible as prose.
      .replace(/<\/?(?:span|font|a|div|p|h[1-6]|style|xml|o:p|v:shape|w:[a-z0-9_-]+)\b[^>]*>?/gi, ' ')
      .replace(/\bspan\b(?=[^<>\n]{0,120}\b(?:style|class|data-[a-z0-9_-]+|height|color)\s*[:=])[^<>\n]{0,220}?\/span\b/gi, ' ')
      .replace(/\/span\b/gi, ' ')
      .replace(/(?:^|\s)(?:p|span|a|div|table|td|li)\.[a-z0-9_-]+\s*\{[^}]*\}/gi, ' ')
      .replace(/@(?:font-face|page)\s*\{[^}]*\}/gi, ' ')
      .replace(/\b(?:mso-[a-z0-9_-]+|font-family|font-size|font-weight|text-decoration|margin-(?:left|right|top|bottom)|color|height|line-height)\s*:\s*[^;{}\n]{0,220};?/gi, ' ')
      .replace(/\bmso-style-(?:name|link|priority|type)\s*:[^;{}\n]{0,220};?/gi, ' ')
      .replace(/[{}<>]/g, ' ')
      .replace(/[�□■]+/g, ' ')
      .replace(/\s+/g, ' ');
    return cleaned.trim();
  }

  function hasClassName(className, expected){
    return (' ' + String(className || '').toLowerCase() + ' ').indexOf(' ' + String(expected || '').toLowerCase() + ' ') >= 0;
  }

  function extractWordNoteRefLabel(text, fallbackNumber){
    var normalized = normalizeWhitespace(text);
    var digits = normalized.match(/\d+/);
    if(digits && digits[0]) return digits[0];
    if(/\*/.test(normalized)) return '*';
    return String(fallbackNumber || '');
  }

  function resolveWordNoteRefKind(tagName, probeText){
    var tag = String(tagName || '').toLowerCase();
    var probe = String(probeText || '').toLowerCase();
    if(tag === 'a'){
      if(/_(?:edn|ednref)\d*|mso-endnote-id|mso-special-character\s*:\s*endnote|msoendnotereference/.test(probe)) return 'endnote';
      if(/_(?:ftn|ftnref)\d*|mso-footnote-id|mso-special-character\s*:\s*footnote|msofootnotereference/.test(probe)) return 'footnote';
      return '';
    }
    if(tag === 'span'){
      if(/msoendnotereference|mso-special-character\s*:\s*endnote/.test(probe)) return 'endnote';
      if(/msofootnotereference|mso-special-character\s*:\s*footnote/.test(probe)) return 'footnote';
      return '';
    }
    return '';
  }

  function buildWordNoteRefSup(doc, kind, label){
    var sup = doc.createElement('sup');
    sup.setAttribute('class', 'aq-word-note-ref');
    sup.setAttribute('data-note-kind', kind === 'endnote' ? 'endnote' : 'footnote');
    sup.textContent = String(label || '');
    return sup;
  }

  function normalizeWordNoteReferencesWithDOM(wrapper){
    if(!wrapper || !wrapper.querySelectorAll) return;
    var doc = wrapper.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if(!doc || !doc.createElement) return;
    var counters = { footnote: 0, endnote: 0 };

    function consumeLabel(kind, text){
      counters[kind] = (counters[kind] || 0) + 1;
      return extractWordNoteRefLabel(text, counters[kind]);
    }

    // Process anchors first so nested Word spans don't create duplicate refs.
    Array.from(wrapper.querySelectorAll('a')).forEach(function(node){
      if(!node.parentNode) return;
      var probe = [
        node.getAttribute('href') || '',
        node.getAttribute('name') || '',
        node.getAttribute('class') || '',
        node.getAttribute('style') || '',
        node.textContent || ''
      ].join(' ');
      var kind = resolveWordNoteRefKind('a', probe);
      if(!kind) return;
      var label = consumeLabel(kind, node.textContent || '');
      node.replaceWith(buildWordNoteRefSup(doc, kind, label));
    });

    Array.from(wrapper.querySelectorAll('span')).forEach(function(node){
      if(!node.parentNode) return;
      if(node.closest && node.closest('sup.aq-word-note-ref')) return;
      var probe = [
        node.getAttribute('class') || '',
        node.getAttribute('style') || '',
        node.textContent || ''
      ].join(' ');
      var kind = resolveWordNoteRefKind('span', probe);
      if(!kind) return;
      var label = consumeLabel(kind, node.textContent || '');
      node.replaceWith(buildWordNoteRefSup(doc, kind, label));
    });
  }

  function normalizeWordNoteReferencesFallback(html){
    var counters = { footnote: 0, endnote: 0 };
    function consumeLabel(kind, text){
      counters[kind] = (counters[kind] || 0) + 1;
      return extractWordNoteRefLabel(String(text || '').replace(/<[^>]+>/g, ' '), counters[kind]);
    }
    function toSup(kind, label){
      return '<sup class="aq-word-note-ref" data-note-kind="' + (kind === 'endnote' ? 'endnote' : 'footnote') + '">' + label + '</sup>';
    }
    var out = String(html || '');
    out = out.replace(
      /<span\b[^>]*style\s*=\s*(?:"[^"]*mso-special-character\s*:\s*(?:footnote|endnote)[^"]*"|'[^']*mso-special-character\s*:\s*(?:footnote|endnote)[^']*')[^>]*>\s*<\/span>/gi,
      ''
    );
    out = out.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, function(match, attrs, content){
      var probe = String(attrs || '') + ' ' + String(content || '');
      var kind = resolveWordNoteRefKind('a', probe);
      if(!kind) return match;
      return toSup(kind, consumeLabel(kind, content || ''));
    });
    out = out.replace(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi, function(match, attrs, content){
      var probe = String(attrs || '') + ' ' + String(content || '');
      var kind = resolveWordNoteRefKind('span', probe);
      if(!kind) return match;
      return toSup(kind, consumeLabel(kind, content || ''));
    });
    return out;
  }

  function isReferenceHeadingText(text){
    var normalized = normalizeWhitespace(text)
      .replace(/[\s:;,\.\-\u2013\u2014]+$/g, '')
      .toLowerCase();
    return /^(kaynak(?:\u00e7|c)a|kaynaklar|references?|bibliography)$/.test(normalized);
  }

  function detectHeadingTag(className, text){
    var cls = String(className || '');
    if(hasClassName(cls, 'MsoTitle')) return 'h1';
    if(hasClassName(cls, 'MsoSubtitle')) return 'h2';
    if(/(?:^|\s)msoheading([1-5])(?:\s|$)/i.test(cls)) return 'h' + RegExp.$1;
    if(/^(abstract|özet|ozet|giriş|giris|yöntem|yontem|bulgular|tartışma|tartisma|sonuç|sonuc|kaynakça|kaynakca|references)$/i.test(normalizeWhitespace(text))){
      return 'h1';
    }
    return '';
  }

function resolveWordHeadingTag(className, text){
  var headingTag = detectHeadingTag(className, text);
  if(headingTag) return headingTag;
  if(isReferenceHeadingText(text)) return 'h1';
  return '';
}

function parseRomanNumeral(value){
  var source = String(value || '').trim();
  if(!source || !/^[ivxlcdm]+$/i.test(source)) return null;
  var map = { i:1, v:5, x:10, l:50, c:100, d:500, m:1000 };
  var total = 0;
  var prev = 0;
  for(var i = source.length - 1; i >= 0; i--){
    var current = map[source.charAt(i).toLowerCase()] || 0;
    if(!current) return null;
    if(current < prev) total -= current;
    else{
      total += current;
      prev = current;
    }
  }
  return total > 0 ? total : null;
}

function parseWordListMarker(text, allowExtended){
  var source = normalizeWhitespace(text);
  if(!source) return null;
  var bulletMatch = source.match(/^([•·▪◦●○■\-–—])\s+/);
  if(bulletMatch){
    var bullet = bulletMatch[1];
    var style = 'disc';
    if(bullet === '◦' || bullet === '○') style = 'circle';
    else if(bullet === '▪' || bullet === '■') style = 'square';
    return { listTag:'ul', listStyleType:style, markerLength:bulletMatch[0].length };
  }
  var decimalMatch = source.match(/^(\d+)[.)]\s+/);
  if(decimalMatch){
    return {
      listTag:'ol',
      listStyleType:'decimal',
      start:Math.max(1, parseInt(decimalMatch[1], 10) || 1),
      markerLength:decimalMatch[0].length
    };
  }
  if(!allowExtended) return null;
  var alphaLowerMatch = source.match(/^([a-z])[.)]\s+/);
  if(alphaLowerMatch){
    return {
      listTag:'ol',
      listStyleType:'lower-alpha',
      typeAttr:'a',
      start:Math.max(1, alphaLowerMatch[1].charCodeAt(0) - 96 || 1),
      markerLength:alphaLowerMatch[0].length
    };
  }
  var alphaUpperMatch = source.match(/^([A-Z])[.)]\s+/);
  if(alphaUpperMatch){
    return {
      listTag:'ol',
      listStyleType:'upper-alpha',
      typeAttr:'A',
      start:Math.max(1, alphaUpperMatch[1].charCodeAt(0) - 64 || 1),
      markerLength:alphaUpperMatch[0].length
    };
  }
  var romanLowerMatch = source.match(/^([ivxlcdm]+)[.)]\s+/);
  if(romanLowerMatch){
    return {
      listTag:'ol',
      listStyleType:'lower-roman',
      typeAttr:'i',
      start:parseRomanNumeral(romanLowerMatch[1]) || 1,
      markerLength:romanLowerMatch[0].length
    };
  }
  var romanUpperMatch = source.match(/^([IVXLCDM]+)[.)]\s+/);
  if(romanUpperMatch){
    return {
      listTag:'ol',
      listStyleType:'upper-roman',
      typeAttr:'I',
      start:parseRomanNumeral(romanUpperMatch[1]) || 1,
      markerLength:romanUpperMatch[0].length
    };
  }
  return null;
}

function getWordListInfo(node){
  if(!node) return null;
  var style = String(node.getAttribute && node.getAttribute('style') || '');
  var cls = String(node.getAttribute && node.getAttribute('class') || '');
  var text = normalizeWhitespace(node.textContent || '');
  var hasWordListSignal = /mso-list:/i.test(style) || hasClassName(cls, 'MsoListParagraph');
  var info = parseWordListMarker(text, hasWordListSignal);
  if(info) return info;
  if(!hasWordListSignal) return null;
  return { listTag:'ul', listStyleType:'disc', markerLength:0 };
}

function isWordListParagraph(node){
    if(!node) return false;
    var style = String(node.getAttribute && node.getAttribute('style') || '');
    var cls = String(node.getAttribute && node.getAttribute('class') || '');
    var text = normalizeWhitespace(node.textContent || '');
    return /mso-list:/i.test(style) || hasClassName(cls, 'MsoListParagraph') || /^([•·▪◦\-–—]|\d+[.)])\s+/.test(text);
  }

  function stripListMarker(text){
    return normalizeWhitespace(text).replace(/^([•·▪◦\-–—]|\d+[.)])\s+/, '');
  }

  // Override legacy list helpers with style-aware parsing so Word alpha/roman
  // list markers can round-trip as ordered list styles.
  function isWordListParagraph(node){
    return !!getWordListInfo(node);
  }

  function stripListMarker(text){
    var source = normalizeWhitespace(text);
    var info = parseWordListMarker(source, true);
    if(!info || !info.markerLength) return source;
    return source.slice(info.markerLength);
  }

  function applyWordListAttributes(list, info){
    if(!list || !info) return;
    if(info.listStyleType){
      list.setAttribute('data-list-style', info.listStyleType);
      if(list.style) list.style.listStyleType = info.listStyleType;
    }
    if(info.typeAttr){
      list.setAttribute('type', info.typeAttr);
    }
    if(info.listTag === 'ol' && Number(info.start || 1) > 1){
      list.setAttribute('start', String(Number(info.start || 1)));
    }
  }

  function buildImportParagraph(doc, text, tagName){
    var node = doc.createElement(tagName || 'p');
    var safe = normalizeWhitespace(text);
    if(tagName === 'p'){
      if(!safe){
        node.innerHTML = '<br>';
      }else{
        node.textContent = safe;
      }
    }else{
      node.textContent = safe;
    }
    return node;
  }

  function isWordPageBreakNode(node){
    if(!node || !node.getAttribute) return false;
    var tag = String(node.tagName || '').toLowerCase();
    var style = String(node.getAttribute('style') || '');
    var cls = String(node.getAttribute('class') || '');
    var text = normalizeWhitespace(node.textContent || '');
    if(/page-break-before\s*:\s*always/i.test(style)) return true;
    if(/mso-special-character\s*:\s*line-break/i.test(style)) return true;
    if(/mso-break-type\s*:\s*page/i.test(style)) return true;
    if(hasClassName(cls, 'MsoPageBreak') || hasClassName(cls, 'PageBreak')) return true;
    if(tag === 'br' && /mso-special-character\s*:\s*line-break/i.test(style)) return true;
    if((tag === 'p' || tag === 'div') && isWordSectionBreakText(text)) return true;
    if((tag === 'p' || tag === 'div') && /^page break$/i.test(text)) return true;
    return false;
  }

  function createWordPageBreakParagraph(doc){
    var p = doc.createElement('p');
    p.setAttribute('class', 'aq-page-break');
    p.setAttribute('data-indent-mode', 'none');
    p.innerHTML = '<br>';
    return p;
  }

  function normalizeWordHtmlWithDOM(html){
    if(typeof document === 'undefined' || !document.createElement) return String(html || '');
    var rawHtml = stripDangerousTags(html);
    var classStyles = extractWordClassStyles(rawHtml);
    var wrapper = document.createElement('div');
    wrapper.innerHTML = stripOfficeConditionalMarkup(rawHtml);
    inlineWordClassStyles(wrapper, classStyles);

    wrapper.querySelectorAll('meta,link,style,title,base').forEach(function(node){ node.remove(); });
    removeOfficeArtifactElements(wrapper);
    normalizeWordNoteReferencesWithDOM(wrapper);
    removeWordTextArtifacts(wrapper);
    wrapper.querySelectorAll('[style],[class]').forEach(function(node){
      var tag = String(node.tagName || '').toLowerCase();
      if(tag === 'p' || tag === 'div'){
        var headingTag = resolveWordHeadingTag(node.getAttribute('class') || '', node.textContent || '');
        if(headingTag){
          var heading = document.createElement(headingTag);
          heading.innerHTML = node.innerHTML;
          node.replaceWith(heading);
          node = heading;
        }
      }
      if(node.hasAttribute('style')){
        var style = normalizeImportStyle(String(node.getAttribute('style') || '')
          .replace(/\btab-stops:[^;"]+;?/gi, ''));
        if(style) node.setAttribute('style', style);
        else node.removeAttribute('style');
      }
      if(node.hasAttribute('class')){
        var cls = String(node.getAttribute('class') || '')
          .split(/\s+/)
          .filter(function(part){ return part && !/^mso/i.test(part); })
          .join(' ')
          .trim();
        if(cls) node.setAttribute('class', cls);
        else node.removeAttribute('class');
      }
      Array.from(node.attributes || []).forEach(function(attr){
        var name = String(attr && attr.name || '');
        if(/^(lang|language|data-ogsc|data-ogsb)$/i.test(name)) node.removeAttribute(name);
      });
    });

    // Clean table markup — strip Word-specific col/row attributes, keep structure
    wrapper.querySelectorAll('table').forEach(function(table){
      if(table.style) table.style.cssText = normalizeImportStyle(table.style.cssText || '');
      table.querySelectorAll('td,th').forEach(function(cell){
        if(cell.style){
          cell.style.cssText = normalizeImportStyle(cell.style.cssText || '');
        }
      });
    });

    // Convert Word list paragraphs to proper lists, merging consecutive items
    var allNodes = Array.from(wrapper.querySelectorAll('p,div,br'));
    var i = 0;
    while(i < allNodes.length){
      var node = allNodes[i];
      if(!node.parentNode){ i++; continue; }
      if(isWordPageBreakNode(node)){
        node.replaceWith(createWordPageBreakParagraph(document));
        i++;
        continue;
      }
      if(isWordListParagraph(node)){
        var listInfo = getWordListInfo(node);
        if(!listInfo){ i++; continue; }
        var listTag = listInfo.listTag;
        // Detect indent level from Word style margin-left
        var marginLeft = (node.style && node.style.marginLeft) ? parseFloat(node.style.marginLeft) : 0;
        var indentLevel = marginLeft > 0 ? Math.max(0, Math.round(marginLeft / 36) - 1) : 0;
        var list = document.createElement(listTag);
        applyWordListAttributes(list, listInfo);
        var li = document.createElement('li');
        li.innerHTML = node.innerHTML;
        if(li.firstChild && li.firstChild.nodeType === 3){
          li.firstChild.nodeValue = stripListMarker(li.firstChild.nodeValue || '');
        }else{
          li.textContent = stripListMarker(li.textContent || '');
        }
        list.appendChild(li);
        // Merge consecutive list paragraphs into the same list
        var next = allNodes[i + 1];
        while(next && next.parentNode && isWordListParagraph(next)){
          var nextInfo = getWordListInfo(next);
          if(!nextInfo) break;
          if(nextInfo.listTag !== listTag) break;
          if(String(nextInfo.listStyleType || '') !== String(listInfo.listStyleType || '')) break;
          var nextLi = document.createElement('li');
          nextLi.innerHTML = next.innerHTML;
          if(nextLi.firstChild && nextLi.firstChild.nodeType === 3){
            nextLi.firstChild.nodeValue = stripListMarker(nextLi.firstChild.nodeValue || '');
          }else{
            nextLi.textContent = stripListMarker(nextLi.textContent || '');
          }
          // Detect nesting level from margin
          var nextMargin = (next.style && next.style.marginLeft) ? parseFloat(next.style.marginLeft) : 0;
          var nextLevel = nextMargin > 0 ? Math.max(0, Math.round(nextMargin / 36) - 1) : 0;
          if(nextLevel > indentLevel){
            // Create nested list
            var nested = document.createElement(nextInfo.listTag);
            applyWordListAttributes(nested, nextInfo);
            nested.appendChild(nextLi);
            var lastLi = list.lastElementChild;
            if(lastLi) lastLi.appendChild(nested);
            else list.appendChild(nested);
          }else{
            list.appendChild(nextLi);
          }
          next.remove();
          i++;
          next = allNodes[i + 1];
        }
        node.replaceWith(list);
        i++;
        continue;
      }
      var tag = String(node.tagName || '').toLowerCase();
      if(isWordImportArtifactText(node.textContent || '')){
        node.remove();
      }else if(tag === 'div'){
        var hasBlockChildren = !!node.querySelector('p,div,h1,h2,h3,h4,h5,h6,table,ul,ol,blockquote,section,article');
        if(hasBlockChildren){
          // Keep nested block structure and drop wrapper container.
          while(node.firstChild) node.parentNode.insertBefore(node.firstChild, node);
          node.remove();
        }else{
          var paragraph = document.createElement('p');
          paragraph.innerHTML = node.innerHTML || '';
          if(node.getAttribute('style')) paragraph.setAttribute('style', normalizeImportStyle(node.getAttribute('style') || ''));
          node.replaceWith(paragraph);
        }
      }else if(!normalizeWhitespace(node.textContent || '') && !node.querySelector('img,table,br,ul,ol,blockquote')){
        node.innerHTML = '<br>';
      }
      i++;
    }

    wrapper.querySelectorAll('span').forEach(function(node){
      if(!node.attributes.length && !normalizeWhitespace(node.className || '') && !normalizeWhitespace(node.style && node.style.cssText || '')){
        while(node.firstChild) node.parentNode.insertBefore(node.firstChild, node);
        node.remove();
      }
    });

    // Word "filtered HTML" (including AcademiQ round-trips) leaves block
    // elements littered with inline style/class/align attrs (line-height:200%,
    // text-indent:35.4pt, MsoNormal, etc). These collide with the editor's own
    // APA style engine — letting the Word styles win produces overlapping
    // lines and wrong indentation. Strip those per-element attributes so the
    // editor defaults take over. data-indent-mode and data-ref stay (they are
    // AcademiQ semantics). Inline align/direction on span is kept if it carried
    // a real style the editor cares about — here we only strip block/block-ish
    // elements.
    wrapper.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th,tr,table,thead,tbody,tfoot,div').forEach(function(node){
      var classes = String(node.getAttribute('class') || '').split(/\s+/).filter(Boolean);
      var keepClasses = classes.filter(function(cls){
        return cls === 'refe' || cls === 'aq-page-break';
      });
      if(keepClasses.length) node.setAttribute('class', keepClasses.join(' '));
      else node.removeAttribute('class');
      node.removeAttribute('lang');
      if(node.hasAttribute('style')){
        var blockStyle = normalizeImportStyle(node.getAttribute('style') || '');
        if(blockStyle) node.setAttribute('style', blockStyle);
        else node.removeAttribute('style');
      }
      var align = String(node.getAttribute('align') || '').toLowerCase();
      if(align && /^(left|right|center|justify)$/.test(align)){
        node.setAttribute('style', mergeStyleText(node.getAttribute('style') || '', 'text-align:' + align));
      }
      node.removeAttribute('align');
    });
    // Spans often carry color:black or font-size:12pt copied straight from Word.
    // Those hurt dark-mode and override editor font sizing; drop per-span styles
    // but keep the span wrapper so data-ref citations survive.
    wrapper.querySelectorAll('span').forEach(function(node){
      if(node.hasAttribute('style')){
        var spanStyle = normalizeImportStyle(node.getAttribute('style') || '');
        if(spanStyle) node.setAttribute('style', spanStyle);
        else node.removeAttribute('style');
      }
      node.removeAttribute('class');
    });

    // Mark paragraphs that follow a "KAYNAKÇA"/"REFERENCES"/"BIBLIOGRAPHY"
    // heading as reference entries so the APA style engine applies hanging
    // indent (first line flush, wrapped lines indented). Without this, imported
    // bibliographies render with Word's wrong first-line indent.
    var refHeadingRegex = /^(kaynak[cç]a|references?|bibliography|kaynaklar)\s*$/i;
    var children = Array.from(wrapper.children || []);
    // Flatten one level of divs (e.g. <div class=WordSection1>) so we iterate
    // a single pass of direct content.
    var flat = [];
    children.forEach(function(child){
      var tag = String(child.tagName || '').toLowerCase();
      if(tag === 'div'){
        Array.from(child.children || []).forEach(function(inner){ flat.push(inner); });
      }else{
        flat.push(child);
      }
    });
    var inRefSection = false;
    flat.forEach(function(node){
      var tag = String(node.tagName || '').toLowerCase();
      if(/^h[1-6]$/.test(tag)){
        var text = normalizeWhitespace(node.textContent || '');
        inRefSection = refHeadingRegex.test(text) || isReferenceHeadingText(text);
        return;
      }
      if(!inRefSection) return;
      if(tag !== 'p') return;
      var current = node.getAttribute('class') || '';
      if(!/\brefe\b/.test(current)){
        node.setAttribute('class', (current ? current + ' ' : '') + 'refe');
      }
    });

    return wrapper.innerHTML;
  }

  function removeWordTextArtifacts(wrapper){
    Array.from(wrapper.querySelectorAll('p,div,span,pre')).forEach(function(node){
      if(!node.parentNode) return;
      if(isWordListParagraph(node)) return;
      if(isWordImportArtifactText(node.textContent || '')){
        var cleaned = cleanWordArtifactTextValue(node.textContent || '');
        if(cleaned){
          node.textContent = cleaned;
        }else{
          node.remove();
        }
      }
    });
    var walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, null);
    var textNodes = [];
    while(walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(function(node){
      if(isWordImportArtifactText(node.nodeValue || '')){
        node.nodeValue = cleanWordArtifactTextValue(node.nodeValue || '');
      }
    });
    Array.from(wrapper.querySelectorAll('p,div,span,pre')).forEach(function(node){
      if(!node.parentNode) return;
      if(isWordImportArtifactText(node.textContent || '')) return;
      if(!normalizeWhitespace(node.textContent || '') && !node.querySelector('img,table,br,ul,ol,blockquote')) node.remove();
    });
  }

  function removeOfficeArtifactElements(wrapper){
    var artifactNames = {
      shape:1, shapetype:1, group:1, rect:1, roundrect:1, line:1, polyline:1, oval:1,
      textbox:1, imagedata:1, stroke:1, fill:1, path:1, shadow:1, anchorlock:1,
      drawing:1, pict:1, object:1, oleobject:1, diagram:1, background:1, wrap:1,
      lock:1, handles:1, formulas:1, f:1
    };
    Array.from(wrapper.querySelectorAll('*')).forEach(function(node){
      if(!node.parentNode) return;
      var tag = String(node.tagName || '').toLowerCase();
      var localName = tag.indexOf(':') >= 0 ? tag.split(':').pop() : tag;
      var style = String(node.getAttribute && node.getAttribute('style') || '');
      var cls = String(node.getAttribute && node.getAttribute('class') || '');
      if(tag === 'xml' || artifactNames[localName]){
        node.remove();
        return;
      }
      // Word sometimes exports floating text boxes as positioned normal HTML.
      // Main document prose is not absolutely positioned, so dropping these avoids
      // decorative shapes/random floating labels entering the editor as paragraphs.
      if(/position\s*:\s*absolute/i.test(style) || /mso-element\s*:\s*frame/i.test(style) || /\bMsoShape\b/i.test(cls)){
        node.remove();
        return;
      }
      // Hidden Word/comment helper nodes can leak non-prose payload into import.
      // Drop these before text extraction so visible document flow remains clean.
      if(/display\s*:\s*none|visibility\s*:\s*hidden|mso-hide\s*:\s*all|mso-element\s*:\s*comment/i.test(style)
        || /\bMsoComment(?:Reference|Text)?\b/i.test(cls)){
        node.remove();
      }
    });
  }

  function buildWordListOpenTag(info){
    var tag = info && info.listTag === 'ol' ? 'ol' : 'ul';
    var attrs = '';
    var styleType = info && info.listStyleType ? String(info.listStyleType) : '';
    if(styleType){
      attrs += ' data-list-style="' + styleType + '"';
      attrs += ' style="list-style-type:' + styleType + '"';
    }
    if(info && info.typeAttr){
      attrs += ' type="' + info.typeAttr + '"';
    }
    if(tag === 'ol' && info && Number(info.start || 1) > 1){
      attrs += ' start="' + String(Number(info.start || 1)) + '"';
    }
    return '<' + tag + attrs + '>';
  }

  function normalizeWordHtmlFallback(html){
    var out = stripOfficeConditionalMarkup(stripDangerousTags(html));
    out = out.replace(
      /<(p|div|span)[^>]*(?:class\s*=\s*(?:"[^"]*\bMsoComment(?:Reference|Text)?\b[^"]*"|'[^']*\bMsoComment(?:Reference|Text)?\b[^']*')|style\s*=\s*(?:"[^"]*(?:display\s*:\s*none|visibility\s*:\s*hidden|mso-hide\s*:\s*all|mso-element\s*:\s*comment)[^"]*"|'[^']*(?:display\s*:\s*none|visibility\s*:\s*hidden|mso-hide\s*:\s*all|mso-element\s*:\s*comment)[^']*'))[^>]*>[\s\S]*?<\/\1>/gi,
      ''
    );
    out = normalizeWordNoteReferencesFallback(out);
    out = out.replace(/<(p|div)([^>]*)class="([^"]*MsoTitle[^"]*)"([^>]*)>([\s\S]*?)<\/\1>/gi, '<h1>$5</h1>');
    out = out.replace(/<(p|div)([^>]*)class="([^"]*MsoSubtitle[^"]*)"([^>]*)>([\s\S]*?)<\/\1>/gi, '<h2>$5</h2>');
    out = out.replace(/<(p|div)([^>]*)class="([^"]*MsoHeading([1-5])[^"]*)"([^>]*)>([\s\S]*?)<\/\1>/gi, function(_m, _tag, _a, _b, level, _c, content){
      return '<h' + level + '>' + content + '</h' + level + '>';
    });
    out = out.replace(/<(p|div)([^>]*)>\s*(kaynak[cç]a|references?|bibliography|kaynaklar)\s*<\/\1>/gi, '<h1>$3</h1>');
    out = out.replace(/<(p|div)([^>]*)>\s*(kaynak[cÃ§]a|kaynakca|references?|bibliography|kaynaklar)\s*[:;,.â€“â€”-]\s*<\/\1>/gi, '<h1>$3</h1>');
    out = out.replace(/<(p|div)([^>]*)>\s*((?:kaynak(?:\u00e7|c)a)|kaynaklar|references?|bibliography)\s*[:;,\.\-\u2013\u2014]?\s*<\/\1>/gi, '<h1>$3</h1>');
    out = out.replace(/<(p|div)[^>]*style="[^"]*(?:page-break-before\s*:\s*always|mso-special-character\s*:\s*line-break|mso-break-type\s*:\s*page)[^"]*"[^>]*>[\s\S]*?<\/\1>/gi, '<p class="aq-page-break" data-indent-mode="none"><br></p>');
    // Word filtered HTML can encode page breaks as standalone <br> markers.
    out = out.replace(/<br\b[^>]*\/?>/gi, function(match){
      var lower = String(match || '').toLowerCase();
      if(/page-break-before\s*:\s*always|mso-special-character\s*:\s*line-break|mso-break-type\s*:\s*page|\bmso(page)?break\b/.test(lower)){
        return '<p class="aq-page-break" data-indent-mode="none"><br></p>';
      }
      return match;
    });
    out = out.replace(/<(p|div)[^>]*>\s*(?:section break(?:\s*\((?:next|odd|even)\s+page\))?|b[o\u00f6]l[u\u00fc]m sonu(?:\s*\((?:sonraki|tek|cift)\s+sayfa\))?|bolum sonu(?:\s*\((?:sonraki|tek|cift)\s+sayfa\))?|page break)\s*<\/\1>/gi, '<p class="aq-page-break" data-indent-mode="none"><br></p>');
    out = out.replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi, function(_match, _quoted, doubleValue, singleValue){
      var safe = normalizeImportStyle(doubleValue != null ? doubleValue : singleValue);
      return safe ? ' style="' + safe + '"' : '';
    });
    out = out.replace(/\sclass="[^"]*Mso[^"]*"/gi, '');
    out = out.replace(/<(p|div)[^>]*>(\s*(?:[•·▪◦\-–—]|\d+[.)])\s+)([\s\S]*?)<\/\1>/gi, function(_m, _tag, _marker, content){
      var listTag = /^\s*\d+[.)]/.test(_marker) ? 'ol' : 'ul';
      return '<' + listTag + '><li>' + content + '</li></' + listTag + '>';
    });
    out = out.replace(/<(p|div)([^>]*)>(\s*(?:[•·▪◦●○■\-–—]|\d+[.)]|[A-Za-z]+[.)])\s+)([\s\S]*?)<\/\1>/gi, function(_m, _tag, attrs, marker, content){
      var allowExtended = /mso-list:|MsoListParagraph/i.test(String(attrs || ''));
      // In fallback mode class/style signals may already be stripped; try extended
      // marker parsing first so alpha/roman Word lists still normalize correctly.
      var info = parseWordListMarker(String(marker || '') + 'x', true);
      if(!info){
        info = parseWordListMarker(String(marker || '') + 'x', allowExtended) || parseWordListMarker(String(marker || '') + 'x', false);
      }
      if(!info) return _m;
      return buildWordListOpenTag(info) + '<li>' + content + '</li></' + info.listTag + '>';
    });
    out = out.replace(/<(p|div|span|pre)([^>]*)>([\s\S]*?)<\/\1>/gi, function(match, tag, attrs, content){
      if(/mso-list:/i.test(attrs || '') || /MsoListParagraph/i.test(attrs || '')) return match;
      var text = String(content || '').replace(/<[^>]+>/g, ' ');
      if(!isWordImportArtifactText(text)) return match;
      var cleaned = cleanWordArtifactTextValue(text);
      return cleaned ? '<' + tag + '>' + cleaned + '</' + tag + '>' : '';
    });
    out = out.replace(/(?:^|>)([^<]{0,2000}(?:@font-face|@page|mso-style-name|mso-style-link|font-family\s*:|font-size\s*:|text-decoration\s*:)[^<]{0,2000})(?=<|$)/gi, function(match, text){
      return isWordImportArtifactText(text) ? match.charAt(0) === '>' ? '>' : '' : match;
    });
    out = markFallbackReferenceEntries(out);
    out = markFallbackReferenceEntriesFlexible(out);
    return out;
  }

  function markFallbackReferenceEntries(html){
    return String(html || '').replace(/(<h[1-6][^>]*>\s*(?:kaynak[cç]a|references?|bibliography|kaynaklar)\s*<\/h[1-6]>)([\s\S]*?)(?=<h[1-6]\b|$)/gi, function(_match, heading, body){
      return heading + String(body || '').replace(/<p\b([^>]*)>/gi, function(pTag, attrs){
        attrs = String(attrs || '');
        if(/\bclass\s*=/.test(attrs)){
          if(/\brefe\b/.test(attrs)) return pTag;
          return '<p' + attrs.replace(/\bclass\s*=\s*(["'])(.*?)\1/i, function(_m, quote, value){
            return 'class=' + quote + String(value || '').trim() + ' refe' + quote;
          }) + '>';
        }
        return '<p' + attrs + ' class="refe">';
      });
    });
  }

  function markFallbackReferenceEntriesFlexible(html){
    return String(html || '').replace(
      /(<h[1-6][^>]*>\s*(?:kaynak(?:\u00e7|c)a|kaynaklar|references?|bibliography)\s*[:;,\.\-\u2013\u2014]?\s*<\/h[1-6]>)([\s\S]*?)(?=<h[1-6]\b|$)/gi,
      function(_match, heading, body){
        return heading + String(body || '').replace(/<p\b([^>]*)>/gi, function(pTag, attrs){
          attrs = String(attrs || '');
          if(/\bclass\s*=/.test(attrs)){
            if(/\brefe\b/.test(attrs)) return pTag;
            return '<p' + attrs.replace(/\bclass\s*=\s*(["'])(.*?)\1/i, function(_m, quote, value){
              return 'class=' + quote + String(value || '').trim() + ' refe' + quote;
            }) + '>';
          }
          return '<p' + attrs + ' class="refe">';
        });
      }
    );
  }

  function normalizeWordHtml(html){
    if(typeof document !== 'undefined' && document.createElement){
      return normalizeWordHtmlWithDOM(html);
    }
    return normalizeWordHtmlFallback(html);
  }

  function normalizeInputText(text){
    return String(text || '')
      .replace(/^\uFEFF/, '')
      .replace(/\0/g, '')
      .replace(/\r\n?/g, '\n');
  }

  function looksLikeHTML(text){
    return /<\/?[a-z][\s\S]*>/i.test(String(text || ''));
  }

  function looksLikeWordArtifactLine(text){
    var value = normalizeWhitespace(text);
    if(!value) return false;
    if(isWordImportArtifactText(value)) return true;
    var lower = value.toLowerCase();
    return /\bmso-(?:style|list|hide|element|break-type)\b/.test(lower)
      || /\bmso(?:normal|heading[1-6]|hyperlink|comment(?:text|reference)?)\b/.test(lower)
      || (/^(?:[a-z][a-z0-9-]{1,24}\s*:\s*[^;]{1,180};\s*){2,}$/i.test(value) && /\bfont-|margin-|line-height|text-decoration|color\b/i.test(value));
  }

  function stripWordArtifactPlainText(text){
    var lines = String(text || '').split('\n');
    var kept = [];
    lines.forEach(function(line){
      var raw = String(line || '');
      var normalized = normalizeWhitespace(raw);
      if(!normalized){
        kept.push('');
        return;
      }
      // Some malformed Word imports lose angle brackets and arrive as plain text
      // style payload (Mso/style/class fragments). Keep only lines that can be
      // cleaned into human prose.
      var cleaned = cleanWordArtifactTextValue(raw);
      if(!cleaned) return;
      if(looksLikeWordArtifactLine(cleaned)) return;
      kept.push(cleaned);
    });
    while(kept.length && !normalizeWhitespace(kept[0])) kept.shift();
    while(kept.length && !normalizeWhitespace(kept[kept.length - 1])) kept.pop();
    return kept.join('\n');
  }

  function stripRtfControlCodes(text){
    var value = String(text || '');
    if(!value) return '';
    // Drop RTF font/colour/info groups whose contents are pure metadata noise.
    value = value.replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|listtable|listoverridetable|rsidtbl|generator|xmlnstbl|themedata|datastore|latentstyles|sn|sv|xmlopen|xmlclose|object|pict|nonshppict|shp|shpinst|sp|sn|sv)\b[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gi, '');
    // Convert RTF unicode escapes (\uNNNN) to actual chars; drop trailing fallback char.
    value = value.replace(/\\u(-?\d+)\??\s?\.?/g, function(_m, code){
      var n = parseInt(code, 10);
      if(!isFinite(n)) return '';
      if(n < 0) n += 65536;
      try { return String.fromCharCode(n); } catch(_e) { return ''; }
    });
    // Decode 8-bit hex escapes (\'XX) as Latin-1 codepoints.
    value = value.replace(/\\'([0-9a-f]{2})/gi, function(_m, hex){
      try { return String.fromCharCode(parseInt(hex, 16)); } catch(_e) { return ''; }
    });
    // Paragraph / line breaks → newline.
    value = value.replace(/\\par\b ?/gi, '\n').replace(/\\line\b ?/gi, '\n').replace(/\\sect\b ?/gi, '\n\n').replace(/\\page\b ?/gi, '\n\n');
    // Tab.
    value = value.replace(/\\tab\b ?/gi, '\t');
    // Drop remaining control words and groups.
    value = value.replace(/\\\*[a-z]+\b[^{}]*?(?=\\|\}|$)/gi, '');
    value = value.replace(/\\[a-z]+-?\d* ?/gi, '');
    value = value.replace(/[{}]/g, '');
    // Common literal escapes that survive the strip.
    value = value.replace(/\\([\\{}])/g, '$1');
    return value;
  }

  function normalizeImportHTML(text, formatPlainTextAPA){
    var value = normalizeInputText(text);
    // RTF buffers must be detokenized before any HTML/plain-text routing,
    // otherwise the editor would render raw control words like
    // "\rtf1\ansi\ansicpg1254..." as visible prose.
    if(/^\s*\{\\rtf/.test(value)){
      value = stripRtfControlCodes(value);
    }
    if(looksLikeHTML(value)) return normalizeWordHtml(value);
    if(String(value || '').split('\n').some(looksLikeWordArtifactLine)){
      value = stripWordArtifactPlainText(value);
      if(!normalizeWhitespace(value)) return '<p><br></p>';
    }
    if(typeof formatPlainTextAPA === 'function') return formatPlainTextAPA(value || '');
    return '<p>' + value.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
  }

  function applyImportedHTML(options){
    options = options || {};
    var editor = options.editor || null;
    var html = String(options.html || '');
    if(looksLikeHTML(html)){
      html = normalizeWordHtml(html);
    }
    if(typeof options.cleanPastedHTML === 'function'){
      html = options.cleanPastedHTML(html || '');
    }
    if(editor && editor.commands && typeof editor.commands.setContent === 'function'){
      editor.commands.setContent(html || '<p></p>', false);
      if(typeof window !== 'undefined' && window.AQEditorRuntime && typeof window.AQEditorRuntime.runContentApplyEffects === 'function'){
        window.AQEditorRuntime.runContentApplyEffects({
          target: editor && editor.view ? editor.view.dom : null,
          normalize: true,
          layout: true,
          syncChrome: true,
          syncTOC: false,
          syncRefs: false,
          refreshTrigger: false,
          onApplied: options.afterEditorImport
        });
        return true;
      }
      if(typeof options.afterEditorImport === 'function'){
        setTimeout(options.afterEditorImport, 0);
      }
      return true;
    }
    if(typeof options.setCurrentEditorHTML === 'function'){
      options.setCurrentEditorHTML(html || '<p></p>');
      if(typeof window !== 'undefined' && window.AQEditorRuntime && typeof window.AQEditorRuntime.runContentApplyEffects === 'function'){
        window.AQEditorRuntime.runContentApplyEffects({
          normalize: false,
          layout: true,
          syncChrome: true,
          syncTOC: false,
          syncRefs: false,
          refreshTrigger: false,
          onApplied: options.afterDomImport
        });
        return true;
      }
      if(typeof options.afterDomImport === 'function'){
        options.afterDomImport();
      }
      return true;
    }
    return false;
  }

  function buildPrintablePageClone(page){
    if(!page || typeof page.cloneNode !== 'function') return null;
    var clone = page.cloneNode(true);
    clone.querySelectorAll('.aq-page-sheet,.page-break-overlay,.page-number,.img-toolbar,.img-resize-handle,.toc-delete').forEach(function(el){ el.remove(); });
    clone.style.boxShadow = 'none';
    clone.style.margin = '0';
    clone.style.padding = '2.54cm';
    clone.style.width = '21cm';
    clone.style.minHeight = 'auto';
    clone.style.background = '#fff';
    clone.style.border = 'none';
    clone.style.borderRadius = '0';
    return clone;
  }

  function buildPDFExportOptions(){
    return {
      margin:[0,0,0,0],
      filename:'makale.pdf',
      image:{type:'jpeg',quality:0.99},
      html2canvas:{scale:3,useCORS:true,backgroundColor:'#ffffff',letterRendering:true,scrollX:0,scrollY:0},
      jsPDF:{unit:'pt',format:'a4',orientation:'portrait'},
      pagebreak:{mode:['css','legacy'],avoid:['blockquote','table','tr','img','h1','h2','h3','h4','h5','.toc-container']}
    };
  }

  return {
    looksLikeHTML: looksLikeHTML,
    normalizeWordHtml: normalizeWordHtml,
    normalizeImportHTML: normalizeImportHTML,
    stripRtfControlCodes: stripRtfControlCodes,
    applyImportedHTML: applyImportedHTML,
    buildPrintablePageClone: buildPrintablePageClone,
    buildPDFExportOptions: buildPDFExportOptions
  };
});
