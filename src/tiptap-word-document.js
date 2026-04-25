(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordDocument = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  var runtimeState = {
    loadToken: 0
  };
  var hostRoot = typeof window !== 'undefined' ? window : globalThis;
  var apaStyleEngine = null;
  try{
    if(typeof require === 'function') apaStyleEngine = require('./apa-style-engine.js');
  }catch(_e){}
  if(!apaStyleEngine && hostRoot && hostRoot.AQApaStyleEngine) apaStyleEngine = hostRoot.AQApaStyleEngine;

  function resolveBlankHTML(blankHTML){
    if(typeof blankHTML === 'function'){
      return String(blankHTML() || '<p></p>');
    }
    return String(blankHTML || '<p></p>');
  }

  function issueLoadToken(){
    runtimeState.loadToken += 1;
    return runtimeState.loadToken;
  }

  function isLoadTokenActive(token){
    return token === runtimeState.loadToken;
  }

  function escapeAttr(text){
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildImageHTML(src, alt){
    return '<img src="' + String(src || '') + '" data-width="70%" data-align="left" style="display:block;float:left;width:70%;max-width:100%;height:auto;text-indent:0;margin-left:0;margin-right:14px;margin-top:2px;margin-bottom:10px;" alt="' + escapeAttr(alt || '') + '"/><p><br></p>';
  }

  function stripNoteLinkAttrs(html){
    var out = String(html || '');
    if(hostRoot && hostRoot.AQNoteLinking && typeof hostRoot.AQNoteLinking.stripNoteLinkAttributes === 'function'){
      try{ return String(hostRoot.AQNoteLinking.stripNoteLinkAttributes(out) || ''); }catch(_e){}
    }
    return out.replace(/\sdata-note-(?:id|ref|page|type|nb)="[^"]*"/gi, '');
  }

  function prepareExportSourceHTML(edHTML){
    var rawHTML = String(edHTML || '');
    // Inject footnotes/endnotes into export HTML before stripping editor-only stores.
    if(hostRoot && hostRoot.AQFootnotes && typeof hostRoot.AQFootnotes.injectFootnotesIntoExportHTML === 'function'){
      try{ rawHTML = hostRoot.AQFootnotes.injectFootnotesIntoExportHTML(rawHTML, true); }catch(_e){}
    }
    var cleanHTML = stripNoteLinkAttrs(rawHTML);
    if(hostRoot && hostRoot.AQMarginNotes && typeof hostRoot.AQMarginNotes.stripForExport === 'function'){
      cleanHTML = hostRoot.AQMarginNotes.stripForExport(cleanHTML);
    }
    cleanHTML = cleanHTML
      .replace(/<div class="aq-fn-store"[\s\S]*?<\/div>/gi, '')
      .replace(/<div class="aq-mn-store"[\s\S]*?<\/div>/gi, '')
      .trim();
    return cleanHTML;
  }

  function stripExportOnlyArtifacts(html){
    var source = String(html || '');
    if(typeof document !== 'undefined' && document.createElement){
      var container = document.createElement('div');
      container.innerHTML = source;
      var removeSelectors = [
        '.img-toolbar',
        '.img-resize-handle',
        '.aq-page-sheet',
        '.page-break-overlay',
        '.page-number',
        '.toc-delete',
        '.cit-gap',
        '.aq-fn-store',
        '.aq-mn-store',
        '[data-editor-only]',
        '[data-export-ignore="true"]',
        '.ProseMirror-gapcursor',
        '.ProseMirror-separator'
      ];
      container.querySelectorAll(removeSelectors.join(',')).forEach(function(node){ node.remove(); });
      container.querySelectorAll('*').forEach(function(node){
        if(node.hasAttribute('contenteditable')) node.removeAttribute('contenteditable');
        if(node.hasAttribute('draggable')) node.removeAttribute('draggable');
        Array.from(node.attributes || []).forEach(function(attr){
          var name = String(attr && attr.name || '');
          if(/^data-gramm/i.test(name)) node.removeAttribute(name);
          if(/^on/i.test(name)) node.removeAttribute(name);
        });
      });
      return container.innerHTML.trim();
    }
    return source
      .replace(/<[^>]*class="[^"]*(?:img-toolbar|img-resize-handle|aq-page-sheet|page-break-overlay|page-number|toc-delete|cit-gap|aq-fn-store|aq-mn-store)[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi, '')
      .replace(/\scontenteditable="[^"]*"/gi, '')
      .replace(/\sdraggable="[^"]*"/gi, '')
      .replace(/\son[a-z]+="[^"]*"/gi, '')
      .trim();
  }

  function normalizeExportSemantics(html){
    var source = String(html || '');
    source = source.replace(/<a([^>]*)class="([^"]*\bcross-ref\b[^"]*)"([^>]*)>/gi, function(match, before, cls, after){
      if(/\baq-cross-ref-export\b/.test(cls)) return match;
      return '<a' + before + 'class="' + cls + ' aq-cross-ref-export"' + after + '>';
    });
    source = source.replace(
      /((?:<p[^>]*class="[^"]*\bni\b[^"]*"[^>]*>\s*<strong>\s*Tablo\s+\d+\s*<\/strong>\s*<\/p>\s*)(?:<p[^>]*class="[^"]*\bni\b[^"]*"[^>]*>\s*<em>[\s\S]*?<\/em>\s*<\/p>\s*)?<table[\s\S]*?<\/table>(?:\s*<p[^>]*class="[^"]*\bni\b[^"]*"[^>]*>\s*<em>\s*Not\.<\/em>[\s\S]*?<\/p>)?)/gi,
      function(block){
        if(/aq-table-block/.test(block)) return block;
        var wrapped = block
          .replace(/<p([^>]*)>\s*<strong>(\s*Tablo\s+\d+\s*)<\/strong>\s*<\/p>/i, '<p$1 class="ni aq-table-label"><strong>$2</strong></p>')
          .replace(/<p([^>]*)>\s*<em>([\s\S]*?)<\/em>\s*<\/p>/i, '<p$1 class="ni aq-table-title"><em>$2</em></p>')
          .replace(/<table/i, '<table class="aq-export-table"')
          .replace(/<p([^>]*)>\s*<em>\s*Not\.<\/em>([\s\S]*?)<\/p>/i, '<p$1 class="ni aq-table-note"><em>Not.</em>$2</p>');
        return '<div class="aq-table-block aq-avoid-break">' + wrapped + '</div>';
      }
    );
    source = source.replace(
      /((?:<p[^>]*>\s*\[\s*(?:Şekil|Sekil|Figure)\s+\d+\s*\]\s*<\/p>\s*)(?:<p[^>]*>\s*(?:Şekil|Sekil|Figure)\s+\d+[\s\S]*?<\/p>))/gi,
      function(block){
        if(/aq-figure-block/.test(block)) return block;
        var wrapped = block
          .replace(/<p([^>]*)>\s*(\[\s*(?:Şekil|Sekil|Figure)\s+\d+\s*\])\s*<\/p>/i, '<p$1 class="ni aq-figure-placeholder">$2</p>')
          .replace(/<p([^>]*)>\s*((?:Şekil|Sekil|Figure)\s+\d+[\s\S]*?)<\/p>/i, '<p$1 class="ni aq-figure-caption"><em>$2</em></p>');
        return '<div class="aq-figure-block aq-avoid-break">' + wrapped + '</div>';
      }
    );
    return source;
  }

  function appendClass(node, className){
    if(!node || !className) return;
    var current = String(node.getAttribute('class') || '').trim();
    var parts = current ? current.split(/\s+/) : [];
    if(parts.indexOf(className) >= 0) return;
    parts.push(className);
    node.setAttribute('class', parts.join(' ').trim());
  }

  function normalizeNodeText(node){
    return String(node && node.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function isBibliographyHeadingNode(node){
    if(!node) return false;
    var tag = String(node.tagName || '').toLowerCase();
    if(!/^h[1-5]$/.test(tag)) return false;
    var text = normalizeNodeText(node);
    return text === 'kaynakça' || text === 'references' || text === 'bibliography';
  }

  function isCaptionLikeNode(node){
    if(!node) return false;
    var tag = String(node.tagName || '').toLowerCase();
    if(tag !== 'p' && tag !== 'div') return false;
    var text = normalizeNodeText(node);
    return /^(tablo|table|şekil|sekil|figure)\s+\d+/i.test(text);
  }

  function isKeepWithNextNode(node){
    if(!node) return false;
    var tag = String(node.tagName || '').toLowerCase();
    if(/^h[1-5]$/.test(tag)) return true;
    return isCaptionLikeNode(node);
  }

  function isEmptyParagraph(node){
    if(!node) return true;
    var tag = String(node.tagName || '').toLowerCase();
    if(tag !== 'p') return false;
    var text = normalizeNodeText(node);
    if(text) return false;
    return !node.querySelector || !node.querySelector('img,table,figure,blockquote,ul,ol');
  }

  function decorateExportLayout(html){
    var source = String(html || '');
    if(typeof document === 'undefined' || !document.createElement){
      return source
        .replace(
          /<p([^>]*)class="([^"]*\brefe\b[^"]*)"([^>]*)>/gi,
          '<p$1class="$2 aq-ref-entry aq-avoid-break"$3>'
        )
        .replace(
          /<(h[1-5])([^>]*)>(\s*(?:Kaynakça|References|Bibliography)\s*)<\/\1>\s*(<p[^>]*class="[^"]*\brefe\b[^"]*"[\s\S]*?<\/p>)/gi,
          function(match, tag, attrs, text, nextBlock){
            var nextWrapped = /aq-ref-entry/.test(nextBlock)
              ? nextBlock
              : nextBlock.replace(/class="([^"]*)"/i, 'class="$1 aq-ref-entry aq-avoid-break"');
            var headingAttrs = /class=/i.test(attrs)
              ? attrs.replace(/class="([^"]*)"/i, 'class="$1 aq-biblio-heading aq-keep-with-next"')
              : attrs + ' class="aq-biblio-heading aq-keep-with-next"';
            return '<div class="aq-keep-group"><' + tag + headingAttrs + '>' + text + '</' + tag + '>' + nextWrapped + '</div>';
          }
        )
        .replace(
          /<(h[1-5])([^>]*)>([\s\S]*?)<\/\1>\s*(<(?:p|div|table|figure|blockquote)[\s\S]*?<\/(?:p|div|table|figure|blockquote)>)/gi,
          function(match, tag, attrs, text, nextBlock){
            if(/aq-keep-group/.test(match)) return match;
            var headingAttrs = /class=/i.test(attrs)
              ? attrs.replace(/class="([^"]*)"/i, 'class="$1 aq-keep-with-next"')
              : attrs + ' class="aq-keep-with-next"';
            return '<div class="aq-keep-group"><' + tag + headingAttrs + '>' + text + '</' + tag + '>' + nextBlock + '</div>';
          }
        );
    }
    var container = document.createElement('div');
    container.innerHTML = source;
    var root = container;

    root.querySelectorAll('p.refe,.refe').forEach(function(node){
      appendClass(node, 'aq-ref-entry');
      appendClass(node, 'aq-avoid-break');
    });
    root.querySelectorAll('table,figure,figcaption,blockquote').forEach(function(node){
      appendClass(node, 'aq-avoid-break');
    });

    var children = Array.prototype.slice.call(root.children || []);
    var inBibliography = false;
    children.forEach(function(node){
      if(isBibliographyHeadingNode(node)){
        inBibliography = true;
        appendClass(node, 'aq-biblio-heading');
        appendClass(node, 'aq-keep-with-next');
        return;
      }
      var tag = String(node.tagName || '').toLowerCase();
      if(/^h[1-5]$/.test(tag)){
        inBibliography = false;
      }
      if(inBibliography && (tag === 'p' || tag === 'div')){
        if(String(node.getAttribute('class') || '').indexOf('refe') >= 0){
          appendClass(node, 'aq-ref-entry');
          appendClass(node, 'aq-avoid-break');
        }
      }
    });

    var current = root.firstElementChild;
    while(current){
      var next = current.nextElementSibling;
      if(isKeepWithNextNode(current)){
        appendClass(current, 'aq-keep-with-next');
        while(next && isEmptyParagraph(next)){
          next = next.nextElementSibling;
        }
        if(next && !/^h[1-5]$/i.test(String(next.tagName || ''))){
          var wrapper = document.createElement('div');
          wrapper.className = 'aq-keep-group';
          current.parentNode.insertBefore(wrapper, current);
          wrapper.appendChild(current);
          wrapper.appendChild(next);
          appendClass(next, 'aq-keep-target');
          current = wrapper.nextElementSibling;
          continue;
        }
      }
      current = current.nextElementSibling;
    }
    return root.innerHTML.trim();
  }

  function buildCleanExportHTML(edHTML){
    var cleanHTML = stripExportOnlyArtifacts(prepareExportSourceHTML(edHTML));
    if(hostRoot && hostRoot.AQAcademicObjects && typeof hostRoot.AQAcademicObjects.normalizeHTMLForExport === 'function'){
      try{
        cleanHTML = hostRoot.AQAcademicObjects.normalizeHTMLForExport(cleanHTML);
      }catch(_e){}
    }
    cleanHTML = normalizeExportSemantics(cleanHTML);
    return decorateExportLayout(cleanHTML);
  }

  function buildExportBaseCSS(){
    var headingCSS = apaStyleEngine && typeof apaStyleEngine.buildExportHeadingCSS === 'function'
      ? apaStyleEngine.buildExportHeadingCSS('.aq-export-root')
      : '.aq-export-root h1{font-size:12pt;font-weight:bold;text-align:center;margin:0;line-height:var(--aq-line-spacing,24pt);mso-line-height-rule:exactly;text-indent:0;break-after:avoid-page;page-break-after:avoid;}'
        + '.aq-export-root h2{font-size:12pt;font-weight:bold;text-align:left;margin:0;line-height:var(--aq-line-spacing,24pt);mso-line-height-rule:exactly;text-indent:0;break-after:avoid-page;page-break-after:avoid;}'
        + '.aq-export-root h3{font-size:12pt;font-weight:bold;font-style:italic;text-align:left;margin:0;line-height:var(--aq-line-spacing,24pt);mso-line-height-rule:exactly;text-indent:0;break-after:avoid-page;page-break-after:avoid;}'
        + '.aq-export-root h4{font-size:12pt;font-weight:bold;text-align:left;margin:0;line-height:var(--aq-line-spacing,24pt);mso-line-height-rule:exactly;text-indent:.5in;break-after:avoid-page;page-break-after:avoid;}'
        + '.aq-export-root h5{font-size:12pt;font-weight:bold;font-style:italic;text-align:left;margin:0;line-height:var(--aq-line-spacing,24pt);mso-line-height-rule:exactly;text-indent:.5in;break-after:avoid-page;page-break-after:avoid;}';
    var blockCSS = apaStyleEngine && typeof apaStyleEngine.buildExportBlockCSS === 'function'
      ? apaStyleEngine.buildExportBlockCSS('.aq-export-root')
      : '.aq-export-root p{margin:0;line-height:var(--aq-line-spacing,24pt);mso-line-height-rule:exactly;text-indent:.5in;orphans:3;widows:3;}'
        + '.aq-export-root p[data-indent-mode="first-line"],.aq-export-root p.indent-first-line{text-indent:.5in;}'
        + '.aq-export-root p[data-indent-mode="none"],.aq-export-root p.ni,.aq-export-root p.indent-none{text-indent:0;}'
        + '.aq-export-root blockquote{margin:0;padding-left:.5in;line-height:var(--aq-line-spacing,24pt);text-indent:0;break-inside:avoid;page-break-inside:avoid;}'
        + '.aq-export-root blockquote p{text-indent:0;}'
        + '.aq-export-root .refe,.aq-export-root .aq-ref-entry{margin:0;padding-left:.5in;line-height:var(--aq-line-spacing,24pt);text-indent:-.5in;break-inside:avoid;page-break-inside:avoid;}'
        + '.aq-export-root .aq-table-label,.aq-export-root .aq-figure-placeholder{margin:0;text-indent:0;text-align:center;font-weight:700;}'
        + '.aq-export-root .aq-table-title,.aq-export-root .aq-figure-caption{margin:0 0 6pt 0;text-indent:0;text-align:center;font-style:italic;}';
    return '@page{size:A4;margin:2.54cm;}'
      + 'html,body{margin:0;padding:0;background:#fff;color:#000;font-family:"Times New Roman",Times,serif;font-size:12pt;line-height:var(--aq-line-spacing,24pt);mso-line-height-rule:exactly;}'
      + 'body{counter-reset:page 0;}'
      + 'main.aq-export-root{width:100%;max-width:none;}'
      + '.aq-export-root .aq-export-page-break-before{break-before:page;page-break-before:always;}'
      + headingCSS
      + blockCSS
      + '.aq-export-root ul,.aq-export-root ol{margin:0 0 0 .5in;padding:0;line-height:var(--aq-line-spacing,24pt);}'
      + '.aq-export-root li{margin:0;line-height:var(--aq-line-spacing,24pt);mso-line-height-rule:exactly;text-indent:0;}'
      + '.aq-export-root table{width:100%;border-collapse:collapse;font-size:12pt;margin:6pt 0;break-inside:avoid;page-break-inside:auto;}'
      + '.aq-export-root thead{display:table-header-group;}'
      + '.aq-export-root tr,.aq-export-root img{break-inside:avoid;page-break-inside:avoid;}'
      + '.aq-export-root th{border-top:1.5px solid #000;border-bottom:1px solid #000;padding:4px 8px;font-weight:bold;line-height:var(--aq-line-spacing,24pt);}'
      + '.aq-export-root td{padding:4px 8px;line-height:var(--aq-line-spacing,24pt);vertical-align:top;}'
      + '.aq-export-root .cit{color:#000;border:none;white-space:normal;}'
      + '.aq-export-root .cit-gap{display:none!important;}'
      + '.aq-export-root .toc-entry{break-inside:avoid;page-break-inside:avoid;color:#000;text-decoration:none;}'
      + '.aq-export-root .toc-entry .toc-page{background:#fff;}'
      + '.aq-export-root .table-wrap,.aq-export-root .figure-wrap,.aq-export-root figure,.aq-export-root figcaption,.aq-export-root .aq-avoid-break,.aq-export-root .aq-ref-entry,.aq-export-root .aq-keep-group,.aq-export-root .aq-table-block,.aq-export-root .aq-figure-block{break-inside:avoid;page-break-inside:avoid;}'
      + '.aq-export-root .aq-keep-with-next{break-after:avoid-page;page-break-after:avoid;}'
      + '.aq-export-root .aq-biblio-heading{margin-bottom:0;}'
      + '.aq-export-root .aq-ref-entry + .aq-ref-entry{margin-top:0;}'
      + '.aq-export-root .aq-keep-target{break-before:auto;page-break-before:auto;}'
      + '.aq-export-root .aq-table-block,.aq-export-root .aq-figure-block{margin:6pt 0 10pt 0;}'
      + '.aq-export-root .aq-table-note{margin-top:4pt;text-indent:0;font-size:10.5pt;line-height:1.6;}'
      + '.aq-export-root .aq-cross-ref-export{color:#000;text-decoration:none;font-style:italic;}';
  }

  function buildExportDocHTML(edHTML){
    var cleanHTML = buildCleanExportHTML(edHTML);
    return '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><meta name="ProgId" content="Word.Document"><meta name="Generator" content="AcademiQ Research"><style>@page WordSection1{size:595pt 842pt;margin:72pt 72pt 72pt 72pt;}div.WordSection1{page:WordSection1;}' + buildExportBaseCSS() + '</style></head><body><div class="WordSection1"><main class="aq-export-root">' + String(cleanHTML || '') + '</main></div></body></html>';
  }

  function buildExportPDFHTML(edHTML){
    var cleanHTML = buildCleanExportHTML(edHTML);
    return '<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: blob: file:; style-src \'unsafe-inline\'; font-src data:;"><title>AcademiQ Export</title><style>' + buildExportBaseCSS() + '</style></head><body><main class="aq-export-root">' + String(cleanHTML || '') + '</main></body></html>';
  }

  function buildExportPreviewHTML(edHTML){
    var cleanHTML = buildCleanExportHTML(edHTML);
    var previewCSS = buildExportBaseCSS()
      + 'body{background:linear-gradient(180deg,#eff3f6 0%,#e6ebef 100%);padding:26px;}'
      + '.aq-preview-page{width:21cm;min-height:29.7cm;margin:0 auto;background:#fff;padding:2.54cm;box-shadow:0 18px 44px rgba(43,58,70,.16);}'
      + '.aq-export-root{width:100%;max-width:none;margin:0;}';
    return '<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: blob: file:; style-src \'unsafe-inline\'; font-src data:;"><title>AcademiQ Export Preview</title><style>' + previewCSS + '</style></head><body><div class="aq-preview-page"><main class="aq-export-root">' + String(cleanHTML || '') + '</main></div></body></html>';
  }

  function stripLegacyEditorArtifacts(html){
    return String(html || '')
      .replace(/<div[^>]*class="page-break[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<div[^>]*class="page-top-spacer[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<div[^>]*class="aq-page-sheet[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<div[^>]*class="page-break-overlay[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<div[^>]*class="page-number[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<hr[^>]*class="pg-spacer"[^>]*\/?>/gi, '')
      .replace(/<div[^>]*class="pg-spacer"[^>]*>[\s\S]*?<\/div>/gi, '');
  }

  function prepareLoadedHTML(html, blankHTML){
    var cleaned = stripLegacyEditorArtifacts(html);
    cleaned = String(cleaned || '').trim();
    return cleaned || String(blankHTML || '<p></p>');
  }

  function getEditorHTML(options){
    options = options || {};
    var editor = options.editor || null;
    var raw;
    if(editor && typeof editor.getHTML === 'function'){
      raw = editor.getHTML();
    } else {
      var shell = options.shell || null;
      if(shell && typeof shell.getHTML === 'function'){
        raw = shell.getHTML();
      } else {
        var host = options.host || (typeof document !== 'undefined' ? document.getElementById('apaed') : null);
        raw = host ? (host.innerHTML || '<p></p>') : '<p></p>';
      }
    }
    // Append footnote store
    if(hostRoot && hostRoot.AQFootnotes && typeof hostRoot.AQFootnotes.hookGetHTML === 'function'){
      raw = hostRoot.AQFootnotes.hookGetHTML(raw);
    }
    // Append margin notes store
    if(hostRoot && hostRoot.AQMarginNotes && typeof hostRoot.AQMarginNotes.hookGetHTML === 'function'){
      raw = hostRoot.AQMarginNotes.hookGetHTML(raw);
    }
    return raw;
  }

  function setEditorHTML(options){
    options = options || {};
    var html = String(options.html || '<p></p>');
    // Extract footnote store before passing to TipTap
    if(hostRoot && hostRoot.AQFootnotes && typeof hostRoot.AQFootnotes.hookSetHTML === 'function'){
      html = hostRoot.AQFootnotes.hookSetHTML(html);
    }
    // Extract margin notes store
    if(hostRoot && hostRoot.AQMarginNotes && typeof hostRoot.AQMarginNotes.hookSetHTML === 'function'){
      html = hostRoot.AQMarginNotes.hookSetHTML(html);
    }
    var editor = options.editor || null;
    if(editor && editor.commands && typeof editor.commands.setContent === 'function'){
      editor.commands.setContent(html);
      return true;
    }
    var shell = options.shell || null;
    if(shell && typeof shell.setHTML === 'function'){
      shell.setHTML(html);
      return true;
    }
    var host = options.host || (typeof document !== 'undefined' ? document.getElementById('apaed') : null);
    if(host){
      host.innerHTML = html;
      return true;
    }
    return false;
  }

  function ensureEditableContent(options){
    options = options || {};
    var editor = options.editor || null;
    if(!editor || !editor.commands || typeof editor.commands.setContent !== 'function') return false;
    var sanitizeHTML = typeof options.sanitizeHTML === 'function'
      ? options.sanitizeHTML
      : function(value){ return String(value || ''); };
    var html = sanitizeHTML(options.html != null ? options.html : (typeof editor.getHTML === 'function' ? editor.getHTML() : '')).trim();
    var emptyHTML = html
      .replace(/<p>\s*(<br\s*\/?>|\u00a0|&nbsp;|\s)*<\/p>/gi, '')
      .replace(/<blockquote>\s*(<br\s*\/?>|\u00a0|&nbsp;|\s)*<\/blockquote>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, '');
    if(!html || html === '<p></p>' || !emptyHTML){
      editor.commands.setContent('<p></p>', false);
      return true;
    }
    return false;
  }

  function commitActiveDocument(options){
    options = options || {};
    var state = options.state || null;
    var currentDocId = options.currentDocId;
    var blankHTML = String(options.blankHTML || '<p></p>');
    if(!state || !state.docs || !currentDocId){
      return blankHTML;
    }
    var html = typeof options.getHTML === 'function' ? options.getHTML() : blankHTML;
    if(typeof options.commitState === 'function'){
      html = options.commitState(state, html, { sanitize:options.sanitizeHTML });
      return html || blankHTML;
    }
    var sanitizeHTML = typeof options.sanitizeHTML === 'function'
      ? options.sanitizeHTML
      : function(value){ return String(value || ''); };
    html = sanitizeHTML(html);
    var current = state.docs.find(function(doc){ return doc && doc.id === currentDocId; });
    if(current) current.content = html;
    state.doc = html;
    return html || blankHTML;
  }

  function commitEditorDocument(options){
    options = options || {};
    var blankHTML = String(options.blankHTML || '<p></p>');
    if(options.isSwitching || !options.state || !options.state.docs || !options.currentDocId){
      return blankHTML;
    }
    return commitActiveDocument({
      state: options.state,
      currentDocId: options.currentDocId,
      blankHTML: blankHTML,
      getHTML: options.getHTML,
      sanitizeHTML: options.sanitizeHTML,
      commitState: options.commitState
    });
  }

  function commitEditorDocumentWithState(options){
    options = options || {};
    var documentStateApi = options.documentStateApi || null;
    return commitEditorDocument({
      isSwitching: !!options.isSwitching,
      state: options.state || null,
      currentDocId: options.currentDocId,
      blankHTML: options.blankHTML || '<p></p>',
      getHTML: options.getHTML,
      sanitizeHTML: options.sanitizeHTML,
      commitState: documentStateApi && typeof documentStateApi.commitActiveDoc === 'function'
        ? documentStateApi.commitActiveDoc
        : (options.commitState || null)
      });
  }

  function commitEditorDocumentFromContext(options){
    options = options || {};
    return commitEditorDocumentWithState({
      isSwitching: !!options.isSwitching,
      state: options.state || null,
      currentDocId: options.currentDocId,
      blankHTML: resolveBlankHTML(options.blankHTML),
      getHTML: typeof options.getHTML === 'function'
        ? options.getHTML
        : function(){
            return getEditorHTML({
              editor: options.editor || null,
              shell: options.shell || null,
              host: options.host || null
            });
          },
      sanitizeHTML: options.sanitizeHTML || null,
      documentStateApi: options.documentStateApi || null,
      commitState: options.commitState || null
    });
  }

  function setActiveDocument(options){
    options = options || {};
    var blankHTML = String(options.blankHTML || '<p></p>');
    var sanitizeHTML = typeof options.sanitizeHTML === 'function'
      ? options.sanitizeHTML
      : function(value){ return String(value || ''); };
    var html = sanitizeHTML(options.html || blankHTML);
    // Extract footnote and margin-note stores before passing to editor
    if(hostRoot && hostRoot.AQFootnotes && typeof hostRoot.AQFootnotes.hookSetHTML === 'function'){
      html = hostRoot.AQFootnotes.hookSetHTML(html);
    }
    if(hostRoot && hostRoot.AQMarginNotes && typeof hostRoot.AQMarginNotes.hookSetHTML === 'function'){
      html = hostRoot.AQMarginNotes.hookSetHTML(html);
    }
    var editor = options.editor || null;
    if(editor && editor.commands && typeof editor.commands.setContent === 'function'){
      try{
        editor.commands.setContent(html, false);
      }catch(e){
        return blankHTML;
      }
      if(typeof options.afterSet === 'function'){
        options.afterSet(editor && editor.view ? editor.view.dom : null, html);
      }
      return html;
    }
    setEditorHTML({
      editor: null,
      shell: options.shell || null,
      host: options.host || null,
      html: html
    });
    if(typeof options.afterSet === 'function'){
      options.afterSet(options.host || null, html);
    }
    return html;
  }

  function loadDocument(options){
    options = options || {};
    var blankHTML = String(options.blankHTML || '<p></p>');
    var html = prepareLoadedHTML(options.html || blankHTML, blankHTML);
    var hasTokenGuard = options.loadToken != null && typeof options.isLoadTokenActive === 'function';

    function isActiveLoad(){
      if(!hasTokenGuard) return true;
      try{
        return !!options.isLoadTokenActive(options.loadToken);
      }catch(e){
        return true;
      }
    }

    if(typeof options.beforeSet === 'function'){
      options.beforeSet(html);
    }

    function finalize(target, appliedHTML){
      if(!isActiveLoad()) return false;
      if(typeof options.runLoadEffects === 'function'){
        options.runLoadEffects({
          target: target || null,
          html: appliedHTML || html,
          beforeApply: function(){
            if(!isActiveLoad()) return;
            if(typeof options.beforeApply === 'function') options.beforeApply();
          },
          focusToEnd: !!options.focusAtEnd && !!options.editor,
          focusToEndFn: options.focusToEndFn || null,
          focusSurface: !!options.focusAtEnd && !options.editor,
          focusSurfaceFn: options.focusSurfaceFn || null,
          afterLayout: function(){
            if(!isActiveLoad()) return;
            if(typeof options.afterLayout === 'function') options.afterLayout();
          },
          token: options.loadToken != null ? options.loadToken : null,
          isTokenActive: typeof options.isLoadTokenActive === 'function' ? options.isLoadTokenActive : null
        });
        return true;
      }

      if(!isActiveLoad()) return false;
      if(typeof options.beforeApply === 'function'){
        options.beforeApply();
      }
      if(typeof options.normalize === 'function'){
        options.normalize(target || undefined);
      }
      if(options.focusAtEnd && options.editor && typeof options.focusToEndFn === 'function'){
        options.focusToEndFn();
      }else if(options.focusAtEnd && !options.editor && typeof options.focusSurfaceFn === 'function'){
        options.focusSurfaceFn();
      }
      if(typeof options.syncRefs === 'function'){
        options.syncRefs();
      }
      if(typeof options.syncChrome === 'function'){
        options.syncChrome();
      }
      if(typeof options.syncLayout === 'function'){
        options.syncLayout();
      }
      if(typeof options.afterLayout === 'function'){
        options.afterLayout();
      }
      return true;
    }

    return setActiveDocument({
      html: html,
      blankHTML: blankHTML,
      sanitizeHTML: options.sanitizeHTML,
      editor: options.editor || null,
      shell: options.shell || null,
      host: options.host || null,
      afterSet: function(target, appliedHTML){
        finalize(target || options.host || null, appliedHTML || html);
      }
    });
  }

  function loadEditorDocument(options){
    options = options || {};
    var blankHTML = String(options.blankHTML || '<p></p>');
    return loadDocument({
      html: options.html || blankHTML,
      blankHTML: blankHTML,
      sanitizeHTML: options.sanitizeHTML,
      editor: options.editor || null,
      shell: options.shell || null,
      host: options.host || null,
      beforeSet: function(nextHTML){
        if(typeof options.beforeSet === 'function'){
          options.beforeSet(nextHTML);
        }
      },
      beforeApply: function(){
        if(typeof options.beforeApply === 'function'){
          options.beforeApply();
        }
      },
      runLoadEffects: options.runLoadEffects || null,
      focusAtEnd: !!options.focusAtEnd,
      focusToEndFn: options.focusToEndFn || null,
      focusSurfaceFn: options.focusSurfaceFn || null,
      normalize: options.normalize || null,
      syncRefs: options.syncRefs || null,
      syncChrome: options.syncChrome || null,
      loadToken: options.loadToken != null ? options.loadToken : null,
      isLoadTokenActive: typeof options.isLoadTokenActive === 'function' ? options.isLoadTokenActive : null,
      syncLayout: options.syncLayout || null,
      afterLayout: options.afterLayout || null
    });
  }

  function loadEditorDocumentWithState(options){
    options = options || {};
    var runtimeApi = options.runtimeApi || null;
    return loadEditorDocument({
      html: options.html || options.blankHTML || '<p></p>',
      blankHTML: options.blankHTML || '<p></p>',
      sanitizeHTML: options.sanitizeHTML,
      editor: options.editor || null,
      shell: options.shell || null,
      host: options.host || null,
      beforeSet: function(nextHTML){
        if(typeof options.beforeSet === 'function'){
          options.beforeSet(nextHTML);
        }
      },
      beforeApply: function(){
        if(typeof options.beforeApply === 'function'){
          options.beforeApply();
        }
      },
      runLoadEffects: runtimeApi && typeof runtimeApi.runDocumentLoadEffects === 'function'
        ? runtimeApi.runDocumentLoadEffects
        : (options.runLoadEffects || null),
      focusAtEnd: !!options.focusAtEnd,
      focusToEndFn: options.focusToEndFn || null,
      focusSurfaceFn: options.focusSurfaceFn || null,
      normalize: options.normalize || null,
      syncRefs: options.syncRefs || null,
      syncChrome: options.syncChrome || null,
      loadToken: options.loadToken != null ? options.loadToken : null,
      isLoadTokenActive: typeof options.isLoadTokenActive === 'function' ? options.isLoadTokenActive : null,
      syncLayout: options.syncLayout || null,
      afterLayout: options.afterLayout || null
    });
  }

  function loadEditorDocumentFromContext(options){
    options = options || {};
    var blankHTML = resolveBlankHTML(options.blankHTML);
    var loadToken = issueLoadToken();
    return loadEditorDocumentWithState({
      html: options.html || blankHTML,
      blankHTML: blankHTML,
      sanitizeHTML: options.sanitizeHTML || null,
      editor: options.editor || null,
      shell: options.shell || null,
      host: options.host || null,
      runtimeApi: options.runtimeApi || null,
      loadToken: loadToken,
      isLoadTokenActive: isLoadTokenActive,
      beforeSet: function(nextHTML){
        if(typeof options.setSwitching === 'function'){
          options.setSwitching(true, nextHTML);
        }
        if(typeof options.setSuppressSave === 'function'){
          options.setSuppressSave(true, nextHTML);
        }
        if(typeof options.beforeSet === 'function'){
          options.beforeSet(nextHTML);
        }
      },
      beforeApply: function(){
        if(typeof options.setSuppressSave === 'function'){
          options.setSuppressSave(false);
        }
        if(typeof options.setSwitching === 'function'){
          options.setSwitching(false);
        }
        if(typeof options.ensureEditableRoot === 'function'){
          options.ensureEditableRoot();
        }
        if(typeof options.beforeApply === 'function'){
          options.beforeApply();
        }
      },
      focusAtEnd: !!options.focusAtEnd,
      focusToEndFn: options.focusToEndFn || null,
      focusSurfaceFn: options.focusSurfaceFn || null,
      normalize: options.normalize || null,
      syncRefs: options.syncRefs || null,
      syncChrome: options.syncChrome || null,
      syncLayout: typeof options.syncLayout === 'function'
        ? options.syncLayout
        : function(){
            var runtimeApi = options.runtimeApi || null;
            if(runtimeApi && typeof runtimeApi.syncPageLayout === 'function'){
              runtimeApi.syncPageLayout();
              return;
            }
            if(typeof options.updatePageHeight === 'function'){
              options.updatePageHeight();
            }
          },
      afterLayout: options.afterLayout || null
    });
  }

  function focusEditor(options){
    options = options || {};
    var editor = options.editor || null;
    var surface = options.surface || null;
    var pos = options.pos || 'end';
    if(editor && editor.commands && typeof editor.commands.focus === 'function'){
      try{ editor.commands.focus(pos); return true; }catch(e){}
    }
    if(surface && typeof surface.focus === 'function'){
      if(surface.focus({ toEnd: pos === 'end' })) return true;
    }
    var host = options.host || (typeof document !== 'undefined' ? document.getElementById('apaed') : null);
    if(host && typeof host.focus === 'function'){
      try{ host.focus(); return true; }catch(e){}
    }
    return false;
  }

  function insertHTML(options){
    options = options || {};
    var editor = options.editor || null;
    var html = String(options.html || '');
    if(editor && editor.chain){
      try{
        if(typeof options.beforeEditorInsert === 'function') options.beforeEditorInsert();
        editor.chain().focus().insertContent(html, { parseOptions:{ preserveWhitespace:false } }).run();
        if(typeof options.afterEditorInsert === 'function'){
          setTimeout(options.afterEditorInsert, 0);
        }
        return true;
      }catch(e){}
    }
    var host = options.host || (typeof document !== 'undefined' ? document.getElementById('apaed') : null);
    if(!host || typeof document === 'undefined') return false;
    host.focus();
    var ok = false;
    try{
      var savedRange = options.savedRangeRef && options.savedRangeRef.current;
      if(savedRange){
        try{
          var selSaved = window.getSelection();
          selSaved.removeAllRanges();
          selSaved.addRange(savedRange);
        }catch(e){}
        options.savedRangeRef.current = null;
      }
      var sel = window.getSelection();
      if(!sel || !sel.rangeCount || !host.contains(sel.anchorNode)){
        var range = document.createRange();
        range.selectNodeContents(host);
        range.collapse(false);
        sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      ok = document.execCommand('insertHTML', false, html);
    }catch(e){}
    if(!ok) host.insertAdjacentHTML('beforeend', html);
    if(typeof options.afterDomInsert === 'function') options.afterDomInsert(host);
    return true;
  }

  return {
    buildImageHTML: buildImageHTML,
    prepareExportSourceHTML: prepareExportSourceHTML,
    stripExportOnlyArtifacts: stripExportOnlyArtifacts,
    decorateExportLayout: decorateExportLayout,
    buildCleanExportHTML: buildCleanExportHTML,
    buildExportPDFHTML: buildExportPDFHTML,
    buildExportPreviewHTML: buildExportPreviewHTML,
    buildExportDocHTML: buildExportDocHTML,
    normalizeExportSemantics: normalizeExportSemantics,
    stripLegacyEditorArtifacts: stripLegacyEditorArtifacts,
    prepareLoadedHTML: prepareLoadedHTML,
    getEditorHTML: getEditorHTML,
    setEditorHTML: setEditorHTML,
    ensureEditableContent: ensureEditableContent,
    commitActiveDocument: commitActiveDocument,
    commitEditorDocument: commitEditorDocument,
    commitEditorDocumentWithState: commitEditorDocumentWithState,
    commitEditorDocumentFromContext: commitEditorDocumentFromContext,
    setActiveDocument: setActiveDocument,
    loadDocument: loadDocument,
    loadEditorDocument: loadEditorDocument,
    loadEditorDocumentWithState: loadEditorDocumentWithState,
    loadEditorDocumentFromContext: loadEditorDocumentFromContext,
    focusEditor: focusEditor,
    insertHTML: insertHTML
  };
});
