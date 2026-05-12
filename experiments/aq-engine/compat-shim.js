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
      return ensureNonEmptyBlocks(repairBlockRuns(window.AQEngineTipTapAdapter.convertDoc(tiptapDoc)));
    }
    // Fallback
    return ensureNonEmptyBlocks([{ type: 'paragraph', runs: [{ text: repairJoinedWordImportText(body.textContent || '') }] }]);
  }

  function ensureNonEmptyBlocks(blocks){
    if(!Array.isArray(blocks) || !blocks.length) return [{ type: 'paragraph', runs: [{ text: '' }] }];
    return blocks;
  }

  function repairJoinedWordImportText(text){
    var out = String(text || '')
      .replace(/\u00ad/g, '')
      .replace(/[\u200b-\u200d\ufeff]/g, ' ');
    if(!out) return out;
    var nextWords = [
      'birlikte','gelmiştir','gelmistir','görülmektedir','gorulmektedir','gostermektedir','göstermektedir',
      'yalnızca','yalnizca','öğrenme','ogrenme','iletişim','iletisim','bilgi',
      'üretimi','uretimi','gibi','çeşitli','cesitli','alanlarda','aktif',
      'şekilde','sekilde','kullanılmaya','kullanilmaya','başladığı','basladigi',
      'hayatımızın','hayatimizin','alanına','alanina','giren','bireyler',
      'üzerinde','uzerinde','bilişsel','bilissel','izler','bırakan','birakan',
      'kavram','olarak','ortaya','konmaktadır','konmaktadir','durum','insan',
      'bilişinin','bilisinin','sadece','içsel','icsel','unsurlarla','değil',
      'degil','teknoloji','dışsal','dissal','etkileşim','etkilesim','içerisine',
      'icerisine','girdiğini','girdigini','sayesinde','yoğun','yogun','akışı',
      'akisi','yükünü','yukunu','artırabilmekte','artirabilmekte','düzenleme',
      'duzenleme','yeniden','organize','etme','becerilerinin','önemini','onemini',
      'yaygınlaşmasıyla','yayginlasmasiyla','teknolojilerin','platformlar',
      'aracılığıyla','araciligiyla','kullanılan','kullanilan','olmaktan',
      'çıkıp','cikip','bağlamda','baglamda','dijitalleşme','dijitallesme'
    ];
    nextWords.forEach(function(word){
      var escaped = String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp('([0-9A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛûÄäËëÏïÖöÜüÀ-ÖØ-öø-ÿ])(' + escaped + ')(?=\\b)', 'gi');
      out = out.replace(re, function(match, prev, next, offset, source){
        var before = source.slice(Math.max(0, offset - 18), offset + 1).toLowerCase();
        if(/\s$/.test(prev)) return match;
        if(/(?:https?|doi|www)\.?$/i.test(before)) return match;
        return prev + ' ' + next;
      });
    });
    var letterClass = '0-9A-Za-z\\u00c0-\\u024f\\u1e00-\\u1effÇĞİÖŞÜçğıöşü';
    var chainWords = nextWords.concat([
      '\u00e7e\u015fitli','cesitli','ili\u015fkileri','iliskileri','ili\u015fkiler','iliskiler',
      'bulunabilmektedir','bulunabilmekte','bulunabilir','dijitalle\u015fmenin','dijitallesmenin',
      'yayg\u0131nla\u015fmas\u0131yla','yayginlasmasiyla','teknolojilerin','platformlar',
      'arac\u0131l\u0131\u011f\u0131yla','araciligiyla','kullan\u0131lan','kullanilan',
      'olmaktan','\u00e7\u0131k\u0131p','cikip','ba\u011flamda','baglamda',
      'bireylerin','becerileri','art\u0131rmaktad\u0131r','artirmaktadir',
      'd\u00fczenlenmesi','duzenlenmesi','ili\u015fkiler','iliskiler'
    ]);
    chainWords.sort(function(a,b){ return String(b).length - String(a).length; });
    chainWords.forEach(function(word){
      if(String(word).length < 5) return;
      var escaped = String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp('([' + letterClass + '])(' + escaped + ')(?=[' + letterClass + '])', 'gi');
      out = out.replace(re, function(match, prev, next, offset, source){
        var before = source.slice(Math.max(0, offset - 18), offset + 1).toLowerCase();
        if(/(?:https?|doi|www)\.?$/i.test(before)) return match;
        return prev + ' ' + next;
      });
    });
    chainWords.forEach(function(word){
      if(String(word).length < 5) return;
      var escaped = String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp('([' + letterClass + '])(' + escaped + ')(?=$|[^' + letterClass + '])', 'gi');
      out = out.replace(re, function(match, prev, next, offset, source){
        var before = source.slice(Math.max(0, offset - 18), offset + 1).toLowerCase();
        if(/(?:https?|doi|www)\.?$/i.test(before)) return match;
        return prev + ' ' + next;
      });
    });
    out = out
      .replace(/(^|\s)(\u00e7e\u015fitli|cesitli)\s+leri\s+(bulunabilmektedir|bulunabilmekte|bulunabilir)\b/gi, '$1$2 ili\u015fkileri $3');
    return out
      .replace(/,([A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛûÄäËëÏïÖöÜüÀ-ÖØ-öø-ÿ])/g, ', $1')
      .replace(/;([A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛûÄäËëÏïÖöÜüÀ-ÖØ-öø-ÿ])/g, '; $1')
      .replace(/\.([A-ZÇĞİÖŞÜ])/g, '. $1');
  }

  function repairBlockRuns(blocks){
    (blocks || []).forEach(function(block){
      if(block && Array.isArray(block.runs)){
        block.runs.forEach(function(run){
          if(run && typeof run.text === 'string') run.text = repairJoinedWordImportText(run.text);
        });
        repairRunBoundarySpacing(block.runs);
      }
      if(block && Array.isArray(block.rows)){
        block.rows.forEach(function(row){
          (row.cells || []).forEach(function(cell){ repairBlockRuns(cell.blocks || []); });
        });
      }
    });
    return blocks;
  }

  function repairRunBoundarySpacing(runs){
    if(!Array.isArray(runs) || runs.length < 2) return runs;
    var letter = /[0-9A-Za-z\u00c0-\u024f\u1e00-\u1eff\u00c7\u011e\u0130\u00d6\u015e\u00dc\u00e7\u011f\u0131\u00f6\u015f\u00fc]/;
    var starts = /^(birlikte|gelmi\u015ftir|gelmistir|g\u00f6r\u00fclmektedir|gorulmektedir|gostermektedir|yaln\u0131zca|yalnizca|\u00f6\u011frenme|ogrenme|ileti\u015fim|iletisim|bilgi|\u00fcretimi|uretimi|gibi|\u00e7e\u015fitli|cesitli|alanlarda|aktif|\u015fekilde|sekilde|kullan\u0131lmaya|kullanilmaya|ba\u015flad\u0131\u011f\u0131|basladigi|hayat\u0131m\u0131z\u0131n|hayatimizin|alan\u0131na|alanina|giren|bireyler|\u00fczerinde|uzerinde|bili\u015fsel|bilissel|izler|b\u0131rakan|birakan|kavram|olarak|ortaya|konmaktad\u0131r|konmaktadir|durum|insan|bili\u015finin|bilisinin|sadece|i\u00e7sel|icsel|unsurlarla|de\u011fil|degil|teknoloji|d\u0131\u015fsal|dissal|etkile\u015fim|etkilesim|i\u00e7erisine|icerisine|girdi\u011fini|girdigini|sayesinde|yo\u011fun|yogun|ak\u0131\u015f\u0131|akisi|y\u00fck\u00fcn\u00fc|yukunu|art\u0131rabilmekte|artirabilmekte|d\u00fczenleme|duzenleme|yeniden|organize|etme|becerilerinin|\u00f6nemini|onemini|ili\u015fkileri|iliskileri|ili\u015fkiler|iliskiler|bulunabilmektedir|bulunabilmekte|bulunabilir|dijitalle\u015fmenin|dijitallesmenin|yayg\u0131nla\u015fmas\u0131yla|yayginlasmasiyla|teknolojilerin|platformlar|arac\u0131l\u0131\u011f\u0131yla|araciligiyla|kullan\u0131lan|kullanilan|olmaktan|\u00e7\u0131k\u0131p|cikip|ba\u011flamda|baglamda|bireylerin|becerileri|art\u0131rmaktad\u0131r|artirmaktadir|d\u00fczenlenmesi|duzenlenmesi)\b/i;
    for(var i = 0; i < runs.length - 1; i++){
      var left = runs[i];
      var right = runs[i + 1];
      if(!left || !right || typeof left.text !== 'string' || typeof right.text !== 'string') continue;
      if(!left.text || !right.text || /\s$/.test(left.text) || /^\s/.test(right.text)) continue;
      if(!letter.test(left.text.slice(-1)) || !letter.test(right.text.charAt(0))) continue;
      if(starts.test(String(right.text || '').toLocaleLowerCase('tr-TR'))) right.text = ' ' + right.text;
    }
    return runs;
  }

  function normalizeHeadingLevel(level){
    var n = parseInt(level, 10) || 1;
    return Math.max(1, Math.min(5, n));
  }

  function uppercaseAPAHeadingRuns(runs){
    if(!Array.isArray(runs)) return;
    runs.forEach(function(run){
      if(!run || typeof run.text !== 'string') return;
      try{ run.text = run.text.toLocaleUpperCase('tr-TR'); }
      catch(_e){ run.text = run.text.toUpperCase(); }
    });
  }

  function applyAPA7HeadingStyle(block, level){
    level = normalizeHeadingLevel(level);
    block.type = 'heading';
    block.level = level;
    if(level === 1) uppercaseAPAHeadingRuns(block.runs);
    block.font = { sizePt: 12, weight: '700', style: (level === 3 || level === 5) ? 'italic' : 'normal' };
    block.align = level === 1 ? 'center' : 'left';
    block.firstLineIndentPx = (level === 4 || level === 5) ? 36 : 0;
    block.spaceAfterPx = 0;
    block.runInHeading = level === 4 || level === 5;
    return block;
  }

  function applyAPA7BibliographyEntryStyle(block){
    block.type = block.type || 'paragraph';
    block._isBibEntry = true;
    block.leftIndentPx = 48;
    block.firstLineIndentPx = -48;
    block.spaceAfterPx = 0;
    block.lineHeightFactor = 2.0;
    block.font = { sizePt: 12, weight: '400', style: 'normal' };
    return block;
  }

  function domToTipTapJSON(el){
    var content = [];
    var inlineBuf = [];
    function flushInline(){
      if(inlineBuf.length){
        content.push({ type: 'paragraph', content: inlineBuf });
        inlineBuf = [];
      }
    }
    for(var i = 0; i < el.childNodes.length; i++){
      var node = el.childNodes[i];
      var n = domNodeToJSON(node);
      if(n){
        // If n is inline (from domNodeToJSON fallthrough), buffer it
        var isBlock = false;
        if(!Array.isArray(n)){
          if(/^(paragraph|heading|bulletList|orderedList|blockquote|horizontalRule|table|image)$/.test(n.type)) isBlock = true;
        }
        if(isBlock){ flushInline(); content.push(n); }
        else {
          var arr = Array.isArray(n) ? n : [n];
          inlineBuf = inlineBuf.concat(arr);
        }
      }
    }
    flushInline();
    return { type: 'doc', content: content };
  }

  function domNodeToJSON(node){
    if(node.nodeType === 3){ var t = repairJoinedWordImportText(node.textContent); if(!t) return null; return { type: 'text', text: t, marks: [] }; }
    if(node.nodeType !== 1) return null;
    var tag = node.tagName.toLowerCase();
    if(node.classList && (
      node.classList.contains('aq-mn-store') ||
      node.classList.contains('aq-fn-store') ||
      node.classList.contains('cit-gap') ||
      node.classList.contains('page-number') ||
      node.classList.contains('page-break-overlay')
    )) return null;
    if(node.getAttribute && (node.getAttribute('data-editor-only') || node.getAttribute('data-export-ignore') === 'true')) return null;
    var attrs = {};
    if(tag === 'p'){
      var align = node.style.textAlign || node.getAttribute('data-text-align') || '';
      if(align) attrs.textAlign = align;
      var className = node.getAttribute('class');
      if(className) attrs.class = className;
      var refId = node.getAttribute('data-ref-id');
      if(refId) attrs.refId = refId;
      return { type: 'paragraph', attrs: attrs, content: inlineChildren(node) };
    }
    if(/^h([1-6])$/.test(tag)){
      attrs.level = normalizeHeadingLevel(RegExp.$1);
      var headingClass = node.getAttribute('class');
      if(headingClass) attrs.class = headingClass;
      var appendixId = node.getAttribute('data-appendix-id');
      if(appendixId) attrs.appendixId = appendixId;
      return { type: 'heading', attrs: attrs, content: inlineChildren(node) };
    }
    if(tag === 'ul') return { type: 'bulletList',  content: listItemsToJSON(node) };
    if(tag === 'ol') return { type: 'orderedList', content: listItemsToJSON(node) };
    if(tag === 'li') return { type: 'listItem',    content: blockChildren(node) };
    if(tag === 'blockquote') return { type: 'blockquote', content: blockChildren(node) };
    if(tag === 'hr') return { type: 'horizontalRule' };
    if(tag === 'table') return tableToJSON(node);
    if(tag === 'img') return { type: 'image', attrs: {
      src: node.src || '',
      alt: node.alt || '',
      width: node.getAttribute('data-width') || node.getAttribute('width') || node.style.width || '',
      align: node.getAttribute('data-align') || ''
    } };
    if(tag === 'figure') return blockChildren(node);
    if(tag === 'figcaption'){
      var capAttrs = { textAlign: node.style.textAlign || 'center' };
      var capClass = node.getAttribute('class');
      if(capClass) capAttrs.class = capClass;
      return { type: 'paragraph', attrs: capAttrs, content: inlineChildren(node) };
    }
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
      if(ch.nodeType === 3){ var t = repairJoinedWordImportText(ch.textContent); if(t) inlineBuf.push({ type: 'text', text: t, marks: [] }); continue; }
      if(ch.nodeType !== 1) continue;
      var tag = ch.tagName.toLowerCase();
      if(/^(p|h[1-6]|ul|ol|blockquote|hr|table|img|figure|figcaption|div|section)$/.test(tag)){
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
      if(ch.nodeType === 3){ var t = repairJoinedWordImportText(ch.textContent); if(t) out.push({ type: 'text', text: t, marks: [] }); }
      else if(ch.nodeType === 1) out = out.concat(inlineNodeToJSON(ch));
    }
    return out;
  }

  function inlineNodeToJSON(el){
    var tag = el.tagName.toLowerCase();
    if(tag === 'br') return [{ type: 'hardBreak' }];
    if(tag === 'img') return [{ type: 'image', attrs: {
      src: el.src || '',
      alt: el.alt || '',
      width: el.getAttribute('data-width') || el.getAttribute('width') || el.style.width || '',
      align: el.getAttribute('data-align') || ''
    } }];
    if(el.classList && (el.classList.contains('fn-ref') || el.classList.contains('aq-fn-ref')))
      return [{ type: 'footnoteRef', attrs: {
        fnId: el.getAttribute('data-fn-id') || el.textContent || '',
        fnType: el.getAttribute('data-fn-type') || 'footnote'
      } }];
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
    if(el.getAttribute('data-track-change') === 'insert' || (el.classList && el.classList.contains('aq-track-insert'))) marks.push({ type: 'trackInsert' });
    if(el.getAttribute('data-track-change') === 'delete' || (el.classList && el.classList.contains('aq-track-delete'))) marks.push({ type: 'trackDelete' });
    if(tag === 'sub') marks.push({ type: 'subscript' });
    if(tag === 'sup') marks.push({ type: 'superscript' });
    if(tag === 'a' && el.classList && el.classList.contains('cross-ref')){
      marks.push({ type: 'crossRef', attrs: {
        refType: el.getAttribute('data-ref-type') || 'heading',
        refId: el.getAttribute('data-ref-id') || '',
        refLabel: el.getAttribute('data-ref-label') || '',
        display: el.getAttribute('data-ref-display') || 'context'
      } });
    }else if(tag === 'a' && el.href) marks.push({ type: 'link', attrs: { href: el.href } });
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
      if(b.type === 'heading') { var lvl = normalizeHeadingLevel(b.level); return '<h' + lvl + '>' + text + '</h' + lvl + '>'; }
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
        else if(m.type === 'trackInsert') t = '<span class="aq-track-insert" data-track-change="insert">' + t + '</span>';
        else if(m.type === 'trackDelete') t = '<span class="aq-track-delete" data-track-change="delete">' + t + '</span>';
        else if(m.type === 'strike') t = '<s>' + t + '</s>';
        else if(m.type === 'superscript') t = '<sup>' + t + '</sup>';
        else if(m.type === 'subscript') t = '<sub>' + t + '</sub>';
        else if(m.type === 'link') t = '<a href="' + escHTML((m.attrs||{}).href || '') + '">' + t + '</a>';
        else if(m.type === 'crossRef'){
          var ra = m.attrs || {};
          var refId = ra.refId || ra['data-ref-id'] || '';
          var rattr = ' class="cross-ref"';
          rattr += ' data-ref-type="' + escHTML(ra.refType || ra['data-ref-type'] || 'heading') + '"';
          rattr += ' data-ref-id="' + escHTML(refId) + '"';
          rattr += ' data-ref-label="' + escHTML(ra.refLabel || ra['data-ref-label'] || '') + '"';
          rattr += ' data-ref-display="' + escHTML(ra.display || ra['data-ref-display'] || 'context') + '"';
          rattr += ' href="#' + escHTML(refId) + '"';
          t = '<a' + rattr + '>' + t + '</a>';
        }
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
    var blockAttr = '';
    if(attrs.class) blockAttr += ' class="' + escHTML(attrs.class) + '"';
    if(attrs.refId) blockAttr += ' data-ref-id="' + escHTML(attrs.refId) + '"';
    if(attrs.appendixId) blockAttr += ' data-appendix-id="' + escHTML(attrs.appendixId) + '"';
    if(attrs.textAlign) blockAttr += ' style="text-align:' + escHTML(attrs.textAlign) + '"';
    if(node.type === 'paragraph')   return '<p' + blockAttr + '>' + (children || '') + '</p>';
    if(node.type === 'heading')     { var lvl = normalizeHeadingLevel(attrs.level); return '<h' + lvl + blockAttr + '>' + children + '</h' + lvl + '>'; }
    if(node.type === 'bulletList')  return '<ul>' + children + '</ul>';
    if(node.type === 'orderedList') return '<ol>' + children + '</ol>';
    if(node.type === 'listItem')    return '<li>' + children + '</li>';
    if(node.type === 'blockquote')  return '<blockquote>' + children + '</blockquote>';
    if(node.type === 'horizontalRule') return '<hr>';
    if(node.type === 'hardBreak')   return '<br>';
    if(node.type === 'image')       {
      var imgAttr = ' src="' + escHTML(attrs.src||'') + '" alt="' + escHTML(attrs.alt||'') + '"';
      if(attrs.width) imgAttr += ' data-width="' + escHTML(attrs.width) + '"';
      if(attrs.align) imgAttr += ' data-align="' + escHTML(attrs.align) + '"';
      if(attrs.refId) imgAttr += ' data-ref-id="' + escHTML(attrs.refId) + '"';
      return '<img' + imgAttr + '>';
    }
    if(node.type === 'table')       {
      var tableAttr = '';
      if(attrs.refId) tableAttr += ' data-ref-id="' + escHTML(attrs.refId) + '"';
      return '<table' + tableAttr + '>' + children + '</table>';
    }
    if(node.type === 'tableRow')    return '<tr>' + children + '</tr>';
    if(node.type === 'tableHeader') return '<th>' + children + '</th>';
    if(node.type === 'tableCell')   return '<td>' + children + '</td>';
    if(node.type === 'footnoteRef') return '<sup class="fn-ref" data-fn-id="' + escHTML((attrs.fnId||'')) + '" data-fn-type="' + escHTML(attrs.fnType || 'footnote') + '">' + escHTML(attrs.fnId||'') + '</sup>';
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

  // ── Image interaction (selection, resize, alignment toolbar) ─────────────
  // Adds click-to-select + 4 corner resize handles + a small floating toolbar
  // on every <img.aq-engine-image> in the rendered stage. All mutations go
  // through docModel so the model stays the source of truth.
  function wireImageInteraction(stageEl, docModel, onMutate){
    if(!stageEl) return;
    if(typeof stageEl._aqImageInteractionCleanup === 'function'){
      try { stageEl._aqImageInteractionCleanup(); } catch(_cleanupErr){}
      stageEl._aqImageInteractionCleanup = null;
    }

    var selectedImg = null;
    var overlay = null;

    function clearSelection(){
      if(overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
      if(selectedImg) selectedImg.classList.remove('aq-image-selected');
      selectedImg = null;
    }

    function applyBlockUpdate(blockIdx, mutator){
      var doc = docModel.get();
      var nextBlocks = doc.blocks.map(function(b, i){
        if(i !== blockIdx) return b;
        var copy = Object.assign({}, b);
        mutator(copy);
        return copy;
      });
      docModel.replace(nextBlocks);
      onMutate();
    }

    function deleteBlock(blockIdx){
      var doc = docModel.get();
      var nextBlocks = doc.blocks.filter(function(_b, i){ return i !== blockIdx; });
      if(!nextBlocks.length) nextBlocks = [{ type: 'paragraph', runs: [{ text: '' }] }];
      docModel.replace(nextBlocks);
      onMutate();
    }

    function resolveBlockIdx(imgEl){
      var raw = imgEl && imgEl.dataset ? imgEl.dataset.blockIndex : null;
      var n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : -1;
    }

    function buildOverlay(imgEl){
      clearSelection();
      var blockIdx = resolveBlockIdx(imgEl);
      if(blockIdx < 0) return;
      selectedImg = imgEl;
      imgEl.classList.add('aq-image-selected');

      var pageEl = imgEl.closest('.aq-engine-page');
      if(!pageEl) return;

      overlay = document.createElement('div');
      overlay.className = 'aq-image-overlay';
      overlay.style.cssText = 'position:absolute;pointer-events:none;z-index:5;';
      var rect = imgEl.getBoundingClientRect();
      var pageRect = pageEl.getBoundingClientRect();
      overlay.style.left   = (rect.left - pageRect.left - 2) + 'px';
      overlay.style.top    = (rect.top  - pageRect.top  - 2) + 'px';
      overlay.style.width  = (rect.width  + 4) + 'px';
      overlay.style.height = (rect.height + 4) + 'px';
      overlay.style.border = '2px solid #2a7ade';
      overlay.style.boxSizing = 'border-box';

      // Resize handles (4 corners)
      ['nw','ne','sw','se'].forEach(function(corner){
        var h = document.createElement('div');
        h.className = 'aq-resize-handle aq-resize-' + corner;
        h.dataset.corner = corner;
        h.style.cssText = 'position:absolute;width:10px;height:10px;background:#2a7ade;border:1px solid #fff;pointer-events:auto;';
        if(corner.indexOf('n') >= 0) h.style.top = '-6px'; else h.style.bottom = '-6px';
        if(corner.indexOf('w') >= 0) h.style.left = '-6px'; else h.style.right = '-6px';
        h.style.cursor = (corner === 'nw' || corner === 'se') ? 'nwse-resize' : 'nesw-resize';
        h.addEventListener('mousedown', function(e){ startResize(e, corner, blockIdx); });
        overlay.appendChild(h);
      });

      // Floating toolbar above the image
      var bar = document.createElement('div');
      bar.className = 'aq-image-toolbar';
      bar.style.cssText = 'position:absolute;left:0;top:-38px;display:flex;gap:4px;background:#fff;padding:4px;border:1px solid #ccc;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,.15);pointer-events:auto;font-family:Arial,sans-serif;font-size:12px;';
      var btns = [
        { label: 'Sol',  action: function(){ applyBlockUpdate(blockIdx, function(b){ b.align = 'left';   }); } },
        { label: 'Orta', action: function(){ applyBlockUpdate(blockIdx, function(b){ b.align = 'center'; }); } },
        { label: 'Sağ',  action: function(){ applyBlockUpdate(blockIdx, function(b){ b.align = 'right';  }); } },
        { label: 'Sil',  action: function(){ deleteBlock(blockIdx); clearSelection(); } }
      ];
      btns.forEach(function(b){
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = b.label;
        btn.style.cssText = 'padding:2px 8px;border:1px solid #999;background:#f5f5f5;border-radius:3px;cursor:pointer;font-size:12px;';
        btn.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); });
        btn.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); b.action(); });
        bar.appendChild(btn);
      });
      overlay.appendChild(bar);

      pageEl.appendChild(overlay);
    }

    function startResize(e, corner, blockIdx){
      e.preventDefault();
      e.stopPropagation();
      var startX = e.clientX;
      var startY = e.clientY;
      var startRect = selectedImg.getBoundingClientRect();
      var startW = startRect.width;
      var startH = startRect.height;
      var aspect = startH > 0 ? (startW / startH) : 1;

      function onMove(ev){
        var dx = ev.clientX - startX;
        // Mirror dx for west handles
        if(corner.indexOf('w') >= 0) dx = -dx;
        var newW = Math.max(40, startW + dx);
        var newH = newW / aspect;
        if(selectedImg){
          selectedImg.style.width  = newW + 'px';
          selectedImg.style.height = newH + 'px';
        }
        if(overlay){
          var pageEl = selectedImg.closest('.aq-engine-page');
          var rect = selectedImg.getBoundingClientRect();
          var pageRect = pageEl.getBoundingClientRect();
          overlay.style.left = (rect.left - pageRect.left - 2) + 'px';
          overlay.style.top  = (rect.top  - pageRect.top  - 2) + 'px';
          overlay.style.width  = (rect.width  + 4) + 'px';
          overlay.style.height = (rect.height + 4) + 'px';
        }
      }
      function onUp(ev){
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        var finalW = selectedImg ? selectedImg.getBoundingClientRect().width : startW;
        // Persist as a percentage of the page content area (601 px ≈ 6.27 in)
        // so the size survives reflows and zoom changes proportionally.
        applyBlockUpdate(blockIdx, function(b){
          b.width = Math.round(finalW);
        });
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    function findDropTarget(x, y){
      var el = document.elementFromPoint(x, y);
      if(!el) return null;
      var pageEl = el.closest && el.closest('.aq-engine-page');
      if(!pageEl) return null;
      var pageRect = pageEl.getBoundingClientRect();
      var relY = y - pageRect.top;
      var nodes = pageEl.querySelectorAll('.aq-engine-line, img.aq-engine-image');
      var bestLine = null, bestBlockIdx = -1, bestPos = 'after', bestDist = Infinity;
      Array.prototype.forEach.call(nodes, function(node){
        var bIdx = parseInt(node.dataset && node.dataset.blockIndex, 10);
        if(!Number.isFinite(bIdx) || bIdx < 0) return;
        var nRect = node.getBoundingClientRect();
        var nMid = (nRect.top + nRect.bottom) / 2 - pageRect.top;
        var dist = Math.abs(relY - nMid);
        if(dist < bestDist){
          bestDist = dist;
          bestLine = node;
          bestBlockIdx = bIdx;
          bestPos = relY < nMid ? 'before' : 'after';
        }
      });
      return bestLine ? { line: bestLine, blockIdx: bestBlockIdx, position: bestPos, pageEl: pageEl } : null;
    }

    function performMove(sourceBlockIdx, target){
      if(!target || target.blockIdx < 0) return;
      var doc = docModel.get();
      var imageBlock = doc.blocks[sourceBlockIdx];
      if(!imageBlock) return;
      var targetIdx = target.blockIdx;
      if(target.position === 'after') targetIdx += 1;
      if(targetIdx === sourceBlockIdx || targetIdx === sourceBlockIdx + 1) return;
      if(targetIdx > sourceBlockIdx) targetIdx -= 1;
      var newBlocks = doc.blocks.filter(function(_b, i){ return i !== sourceBlockIdx; });
      newBlocks.splice(targetIdx, 0, imageBlock);
      docModel.replace(newBlocks);
      onMutate();
    }

    function onImageMouseDown(e, imgEl){
      e.preventDefault();
      e.stopPropagation();
      var startX = e.clientX, startY = e.clientY;
      var dragging = false;
      var blockIdx = resolveBlockIdx(imgEl);
      var ghost = null;
      var indicator = null;

      function ensureDragUI(){
        ghost = imgEl.cloneNode(false);
        ghost.style.position = 'fixed';
        ghost.style.opacity = '0.55';
        ghost.style.pointerEvents = 'none';
        ghost.style.zIndex = '99999';
        ghost.style.width = '120px';
        ghost.style.height = 'auto';
        ghost.style.border = '2px dashed #2a7ade';
        document.body.appendChild(ghost);
        indicator = document.createElement('div');
        indicator.style.cssText = 'position:absolute;height:3px;background:#2a7ade;pointer-events:none;z-index:50;left:96px;width:601px;';
      }

      function onMove(ev){
        if(!dragging){
          var dx = ev.clientX - startX, dy = ev.clientY - startY;
          if(dx*dx + dy*dy < 25) return; // 5px threshold
          dragging = true;
          ensureDragUI();
          // Hide existing overlay during drag
          if(overlay) overlay.style.display = 'none';
          // Make the source image transparent to elementFromPoint so the
          // drop target search can hit lines that sit underneath it.
          imgEl.style.pointerEvents = 'none';
          imgEl.style.opacity = '0.3';
        }
        if(ghost){
          ghost.style.left = (ev.clientX - 60) + 'px';
          ghost.style.top  = (ev.clientY - 30) + 'px';
        }
        var target = findDropTarget(ev.clientX, ev.clientY);
        if(indicator){
          if(target && target.line){
            if(indicator.parentNode !== target.pageEl) target.pageEl.appendChild(indicator);
            var lRect = target.line.getBoundingClientRect();
            var pageRect = target.pageEl.getBoundingClientRect();
            var y = (target.position === 'before' ? lRect.top : lRect.bottom) - pageRect.top - 1;
            indicator.style.top = y + 'px';
          } else if(indicator.parentNode){
            indicator.parentNode.removeChild(indicator);
          }
        }
      }

      function onUp(ev){
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if(ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
        if(indicator && indicator.parentNode) indicator.parentNode.removeChild(indicator);
        imgEl.style.pointerEvents = '';
        imgEl.style.opacity = '';
        if(!dragging){
          if(selectedImg !== imgEl) buildOverlay(imgEl);
          return;
        }
        var target = findDropTarget(ev.clientX, ev.clientY);
        clearSelection();
        if(target) performMove(blockIdx, target);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    function onStageImageMouseDown(e){
      var img = e.target && e.target.classList && e.target.classList.contains('aq-engine-image') ? e.target : null;
      if(img){
        onImageMouseDown(e, img);
        return;
      }
      // Click outside an image clears selection
      if(selectedImg && !(e.target.closest && e.target.closest('.aq-image-overlay'))){
        clearSelection();
      }
    }
    stageEl.addEventListener('mousedown', onStageImageMouseDown);

    // ── Table cell editing ────────────────────────────────────────────────
    // Click a cell → render a textarea overlay on top of it. The textarea
    // captures input; on blur we write its value back into the cell's runs.
    // Using a separate element sidesteps the engine's input/selection capture
    // (which would otherwise steal focus from a contenteditable cell).
    var activeEditor_cell = null;       // the table cell DOM element
    var activeEditor_textarea = null;   // the floating textarea
    var activeEditor_keepAlive = 0;
    var tableToolbar = null;

    function clearTableToolbar(){
      if(tableToolbar && tableToolbar.parentNode) tableToolbar.parentNode.removeChild(tableToolbar);
      tableToolbar = null;
    }

    function setEngineCaptureEnabled(enabled){
      var capture = document.querySelector('.aq-input-capture');
      if(!capture) return;
      if(enabled){
        capture.disabled = false;
        capture.style.pointerEvents = '';
      } else {
        capture.disabled = true;
        capture.style.pointerEvents = 'none';
        try{ capture.blur(); }catch(_e){}
      }
    }

    function commitActiveCell(){
      if(!activeEditor_cell || !activeEditor_textarea) return;
      var cell = activeEditor_cell;
      var ta = activeEditor_textarea;
      var newText = ta.value || '';
      activeEditor_cell = null;
      activeEditor_textarea = null;
      if(activeEditor_keepAlive){ clearInterval(activeEditor_keepAlive); activeEditor_keepAlive = 0; }
      if(ta.parentNode) ta.parentNode.removeChild(ta);
      cell.style.outline = '';
      setEngineCaptureEnabled(true);
      var blockIdx = parseInt(cell.dataset.tableBlockIndex, 10);
      var rowIdx   = parseInt(cell.dataset.tableRowIndex,   10);
      var colIdx   = parseInt(cell.dataset.tableColIndex,   10);
      if(!Number.isFinite(blockIdx) || !Number.isFinite(rowIdx) || !Number.isFinite(colIdx)) return;
      var doc = docModel.get();
      var newBlocks = doc.blocks.map(function(b, i){
        if(i !== blockIdx) return b;
        var copy = Object.assign({}, b);
        copy.rows = (b.rows || []).map(function(row, ri){
          if(ri !== rowIdx) return row;
          var rowCopy = Object.assign({}, row);
          // Pad sparse rows: render uses numCols (max across all rows), so a
          // user can click a column that doesn't yet have a cell entry. Build
          // a filled array of length max(existing, colIdx + 1).
          var existing = row.cells || [];
          var len = Math.max(existing.length, colIdx + 1);
          var filled = [];
          for(var ci = 0; ci < len; ci++){
            if(ci === colIdx){
              filled.push({ runs: [{ text: newText }] });
            } else if(existing[ci]){
              filled.push(existing[ci]);
            } else {
              filled.push({ runs: [{ text: '' }] });
            }
          }
          rowCopy.cells = filled;
          return rowCopy;
        });
        return copy;
      });
      docModel.replace(newBlocks);
      onMutate();
    }

    function deleteTableBlock(blockIdx){
      var doc = docModel.get();
      var nextBlocks = doc.blocks.filter(function(_b, i){ return i !== blockIdx; });
      if(!nextBlocks.length) nextBlocks = [{ type: 'paragraph', runs: [{ text: '' }] }];
      docModel.replace(nextBlocks);
      onMutate();
    }

    function getTableShape(blockIdx){
      var doc = docModel.get();
      var b = doc.blocks[blockIdx];
      if(!b || b.type !== 'table') return null;
      var rows = b.rows || [];
      var cols = 0;
      rows.forEach(function(r){ cols = Math.max(cols, (r.cells || []).length); });
      return { rows: rows.length, cols: cols };
    }

    function mutateTable(blockIdx, mutator){
      var doc = docModel.get();
      var newBlocks = doc.blocks.map(function(b, i){
        if(i !== blockIdx) return b;
        var copy = Object.assign({}, b);
        copy.rows = (b.rows || []).map(function(row){
          return Object.assign({}, row, { cells: (row.cells || []).slice() });
        });
        mutator(copy);
        return copy;
      });
      docModel.replace(newBlocks);
      onMutate();
    }

    function addRowAfter(blockIdx, rowIdx){
      var shape = getTableShape(blockIdx);
      if(!shape) return;
      mutateTable(blockIdx, function(b){
        var emptyCells = [];
        for(var i = 0; i < shape.cols; i++) emptyCells.push({ runs: [{ text: '' }] });
        b.rows.splice(rowIdx + 1, 0, { cells: emptyCells });
      });
    }

    function deleteRow(blockIdx, rowIdx){
      var shape = getTableShape(blockIdx);
      if(!shape || shape.rows <= 1) return; // keep at least one row
      mutateTable(blockIdx, function(b){
        b.rows.splice(rowIdx, 1);
      });
    }

    function addColAfter(blockIdx, colIdx){
      var shape = getTableShape(blockIdx);
      if(!shape) return;
      mutateTable(blockIdx, function(b){
        b.rows.forEach(function(row){
          row.cells.splice(colIdx + 1, 0, { runs: [{ text: '' }] });
        });
      });
    }

    function deleteCol(blockIdx, colIdx){
      var shape = getTableShape(blockIdx);
      if(!shape || shape.cols <= 1) return; // keep at least one column
      mutateTable(blockIdx, function(b){
        b.rows.forEach(function(row){
          if(colIdx < row.cells.length) row.cells.splice(colIdx, 1);
        });
      });
    }

    function showTableToolbar(cell){
      clearTableToolbar();
      var blockIdx = parseInt(cell.dataset.tableBlockIndex, 10);
      var rowIdx   = parseInt(cell.dataset.tableRowIndex,   10);
      var colIdx   = parseInt(cell.dataset.tableColIndex,   10);
      var pageEl = cell.closest('.aq-engine-page');
      if(!pageEl || !Number.isFinite(blockIdx)) return;
      var firstRow = pageEl.querySelector('.aq-engine-table-row[data-table-block-index="' + blockIdx + '"][data-table-row-index="0"]');
      if(!firstRow) firstRow = cell.parentElement;
      var rowRect = firstRow.getBoundingClientRect();
      var pageRect = pageEl.getBoundingClientRect();
      tableToolbar = document.createElement('div');
      tableToolbar.className = 'aq-table-toolbar';
      tableToolbar.style.cssText = 'position:absolute;display:flex;gap:4px;background:#fff;padding:4px;border:1px solid #ccc;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,.15);z-index:50;font-family:Arial,sans-serif;font-size:12px;pointer-events:auto;flex-wrap:wrap;';
      tableToolbar.style.left = (rowRect.left - pageRect.left) + 'px';
      tableToolbar.style.top  = (rowRect.top  - pageRect.top - 32) + 'px';

      function makeBtn(label, action, danger){
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        btn.style.cssText = 'padding:2px 8px;border:1px solid ' + (danger ? '#c44' : '#999') + ';background:' + (danger ? '#fee' : '#f5f5f5') + ';color:' + (danger ? '#a22' : '#333') + ';border-radius:3px;cursor:pointer;font-size:12px;';
        btn.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopImmediatePropagation(); });
        btn.addEventListener('click', function(e){ e.preventDefault(); e.stopImmediatePropagation(); action(); });
        return btn;
      }

      tableToolbar.appendChild(makeBtn('+ Satır', function(){
        commitActiveCell();
        addRowAfter(blockIdx, rowIdx);
      }));
      tableToolbar.appendChild(makeBtn('+ Sütun', function(){
        commitActiveCell();
        addColAfter(blockIdx, colIdx);
      }));
      tableToolbar.appendChild(makeBtn('Satır Sil', function(){
        commitActiveCell();
        clearTableToolbar();
        deleteRow(blockIdx, rowIdx);
      }, true));
      tableToolbar.appendChild(makeBtn('Sütun Sil', function(){
        commitActiveCell();
        clearTableToolbar();
        deleteCol(blockIdx, colIdx);
      }, true));
      tableToolbar.appendChild(makeBtn('Tabloyu Sil', function(){
        commitActiveCell();
        clearTableToolbar();
        deleteTableBlock(blockIdx);
      }, true));
      pageEl.appendChild(tableToolbar);
    }

    function moveActiveCell(direction){
      if(!activeEditor_cell) return;
      var blockIdx = parseInt(activeEditor_cell.dataset.tableBlockIndex, 10);
      var rowIdx   = parseInt(activeEditor_cell.dataset.tableRowIndex,   10);
      var colIdx   = parseInt(activeEditor_cell.dataset.tableColIndex,   10);
      var shape = getTableShape(blockIdx);
      if(!shape) return;
      var nextRow = rowIdx, nextCol = colIdx;
      if(direction === 'next'){
        nextCol += 1;
        if(nextCol >= shape.cols){ nextCol = 0; nextRow += 1; }
        if(nextRow >= shape.rows) return; // past end of table
      } else if(direction === 'prev'){
        nextCol -= 1;
        if(nextCol < 0){ nextCol = shape.cols - 1; nextRow -= 1; }
        if(nextRow < 0) return;
      }
      commitActiveCell();
      var fresh = stageEl.querySelector(
        '.aq-engine-table-cell[data-table-block-index="' + blockIdx + '"]' +
        '[data-table-row-index="' + nextRow + '"]' +
        '[data-table-col-index="' + nextCol + '"]'
      );
      if(fresh) startCellEdit(fresh);
    }

    function startCellEdit(cell){
      if(activeEditor_cell === cell) return;
      // Capture cell coordinates BEFORE commit (which would tear down DOM).
      var bIdx = cell.dataset.tableBlockIndex;
      var rIdx = cell.dataset.tableRowIndex;
      var cIdx = cell.dataset.tableColIndex;
      if(activeEditor_cell) commitActiveCell();
      // commitActiveCell can trigger reflow → cell DOM node is stale. Re-resolve
      // from the freshly rendered stage.
      var fresh = stageEl.querySelector(
        '.aq-engine-table-cell[data-table-block-index="' + bIdx + '"]' +
        '[data-table-row-index="' + rIdx + '"]' +
        '[data-table-col-index="' + cIdx + '"]'
      );
      if(!fresh) return;
      cell = fresh;
      activeEditor_cell = cell;
      cell.style.outline = '2px solid #2a7ade';

      var pageEl = cell.closest('.aq-engine-page');
      if(!pageEl){ activeEditor_cell = null; return; }
      var cellRect = cell.getBoundingClientRect();
      var pageRect = pageEl.getBoundingClientRect();
      var ta = document.createElement('textarea');
      activeEditor_textarea = ta;
      ta.value = cell.textContent || '';
      ta.style.cssText = 'position:absolute;background:#fff;border:none;outline:none;resize:none;padding:4px;box-sizing:border-box;font:' + getComputedStyle(cell).font + ';color:#000;z-index:55;overflow:hidden;';
      ta.style.left   = (cellRect.left   - pageRect.left) + 'px';
      ta.style.top    = (cellRect.top    - pageRect.top ) + 'px';
      ta.style.width  = cellRect.width  + 'px';
      ta.style.height = cellRect.height + 'px';
      // Stop the engine's selection/input handlers from acting on these events.
      // Tab and Escape need preventDefault before the browser's native
      // focus-shift kicks in, so handle them here in the capture phase along
      // with stopPropagation.
      ['mousedown','pointerdown','click','keydown','keyup','keypress','input'].forEach(function(evt){
        ta.addEventListener(evt, function(e){
          if(evt === 'keydown' && (e.key === 'Tab' || e.key === 'Escape')){
            e.preventDefault();
            e.stopImmediatePropagation();
            if(e.key === 'Tab'){
              moveActiveCell(e.shiftKey ? 'prev' : 'next');
            } else {
              commitActiveCell();
              clearTableToolbar();
            }
            return;
          }
          e.stopPropagation();
        }, true);
      });
      // The engine's input.js auto-focuses its hidden capture textarea
      // (.aq-input-capture) on every pointer event. Reclaim focus only when
      // it landed there — any other target means the user clicked elsewhere
      // intentionally and we should commit.
      if(activeEditor_keepAlive) clearInterval(activeEditor_keepAlive);
      activeEditor_keepAlive = setInterval(function(){
        if(activeEditor_textarea !== ta){ clearInterval(activeEditor_keepAlive); activeEditor_keepAlive = 0; return; }
        var ae = document.activeElement;
        if(ae === ta) return;
        if(ae && ae.classList && ae.classList.contains('aq-input-capture')){
          try{ ta.focus(); }catch(_e){}
        }
      }, 50);
      ta.addEventListener('blur', function(){
        setTimeout(function(){
          if(activeEditor_textarea !== ta) return;
          var dest = document.activeElement;
          if(dest === ta) return;
          // Engine's hidden capture textarea — keep-alive will fix it.
          if(dest && dest.classList && dest.classList.contains('aq-input-capture')) return;
          // Toolbar button — let its own click run.
          if(dest && dest.closest && dest.closest('.aq-table-toolbar')) return;
          commitActiveCell();
          clearTableToolbar();
        }, 50);
      });
      pageEl.appendChild(ta);
      // Disable engine's main capture textarea so it doesn't fight us for focus
      // or insert duplicate text into the document model while we're editing.
      setEngineCaptureEnabled(false);
      setTimeout(function(){
        try{ ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }catch(_e){}
      }, 16);
      showTableToolbar(cell);
    }

    function onStageTableMouseDown(e){
      if(e.target.closest && e.target.closest('.aq-table-toolbar')) return;
      // Click inside an active cell editor — let the textarea handle it.
      if(activeEditor_textarea && e.target === activeEditor_textarea) return;
      var cell = e.target && e.target.closest && e.target.closest('.aq-engine-table-cell');
      if(!cell){
        if(activeEditor_cell) commitActiveCell();
        clearTableToolbar();
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      startCellEdit(cell);
    }
    stageEl.addEventListener('mousedown', onStageTableMouseDown, true);

    // Delete/Backspace removes the currently selected image (when no cell is
    // being edited). Listening on the document is fine: the keydown only
    // matters when there's a selected image and no other editable surface
    // owns the keystroke.
    function onDocumentImageKeyDown(e){
      if(activeEditor_textarea) return;        // table cell editor active
      if(!selectedImg) return;
      if(e.key !== 'Delete' && e.key !== 'Backspace') return;
      var ae = document.activeElement;
      if(ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA') && !ae.classList.contains('aq-input-capture')) return;
      var blockIdx = parseInt(selectedImg.dataset && selectedImg.dataset.blockIndex, 10);
      if(!Number.isFinite(blockIdx)) return;
      e.preventDefault();
      clearSelection();
      var doc = docModel.get();
      var nextBlocks = doc.blocks.filter(function(_b, i){ return i !== blockIdx; });
      if(!nextBlocks.length) nextBlocks = [{ type: 'paragraph', runs: [{ text: '' }] }];
      docModel.replace(nextBlocks);
      onMutate();
    }
    document.addEventListener('keydown', onDocumentImageKeyDown);

    stageEl._aqImageInteractionCleanup = function(){
      if(activeEditor_keepAlive){ clearInterval(activeEditor_keepAlive); activeEditor_keepAlive = 0; }
      if(activeEditor_textarea && activeEditor_textarea.parentNode) activeEditor_textarea.parentNode.removeChild(activeEditor_textarea);
      activeEditor_textarea = null;
      activeEditor_cell = null;
      clearTableToolbar();
      clearSelection();
      setEngineCaptureEnabled(true);
      stageEl.removeEventListener('mousedown', onStageImageMouseDown);
      stageEl.removeEventListener('mousedown', onStageTableMouseDown, true);
      document.removeEventListener('keydown', onDocumentImageKeyDown);
    };
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
    stageEl.style.cssText = 'display:block;width:100%;outline:none;cursor:text;min-height:100%;position:relative;z-index:200;pointer-events:auto;';

    element.innerHTML = '';
    element.style.cssText = 'display:block;width:100%;min-height:100%;position:relative;z-index:190;pointer-events:auto;';
    element.appendChild(stageEl);
    var _boundScrollHost = null;
    try {
      _boundScrollHost = document.getElementById('escroll') || stageEl.parentElement;
      if(_boundScrollHost && _boundScrollHost.addEventListener) _boundScrollHost.addEventListener('scroll', scheduleViewportRender, { passive: true });
    } catch(_scrollBindErr){}

    var blocks   = htmlToBlocks(initialHTML);
    var docModel = window.AQEngineDocument.create(blocks);

    var selection  = null;
    var input      = null;
    var _editable  = true;
    var _destroyed = false;
    var _reflowing = false;
    var _setupDone = false;
    var _refSyncTimer = 0;
    var _lastLayout = null;
    var _scrollRenderTimer = 0;

    function scheduleTypingRefSync(){
      if(typeof window === 'undefined' || typeof window.scheduleRefSectionSync !== 'function') return;
      try {
        if(_refSyncTimer) window.clearTimeout(_refSyncTimer);
        _refSyncTimer = window.setTimeout(function(){
          _refSyncTimer = 0;
          try { window.scheduleRefSectionSync(); } catch(_e){}
        }, 900);
      } catch(_e){}
    }

    function pageIndexForOffset(layout, off){
      if(!layout || !layout.pages || !layout.pages.length) return 0;
      off = Math.max(0, Number(off || 0));
      for(var p = 0; p < layout.pages.length; p++){
        var lines = layout.pages[p].lines || [];
        for(var li = 0; li < lines.length; li++){
          var line = lines[li];
          if(!line) continue;
          if(off >= Number(line.offsetStart || 0) && off <= Number(line.offsetEnd || line.offsetStart || 0)) return p;
        }
      }
      return Math.max(0, Math.min(layout.pages.length - 1, 0));
    }

    function pageRangeAround(layout, pageIndex){
      var max = layout && layout.pages ? layout.pages.length - 1 : 0;
      pageIndex = Math.max(0, Math.min(max, Number(pageIndex || 0)));
      return { from: Math.max(0, pageIndex - 2), to: Math.min(max, pageIndex + 2) };
    }

    function visiblePageRange(layout){
      var scrollEl = document.getElementById('escroll') || stageEl.parentElement;
      if(!layout || !layout.pages || !layout.pages.length || !scrollEl) return pageRangeAround(layout, 0);
      var pageStep = layout.pageHeightPx + (engineOpts.pageGapPx || 0);
      var top = Math.max(0, Number(scrollEl.scrollTop || 0) - 48);
      var bottom = top + Number(scrollEl.clientHeight || window.innerHeight || layout.pageHeightPx) + 96;
      var from = Math.floor(Math.max(0, top - 32) / pageStep) - 1;
      var to = Math.ceil(Math.max(0, bottom - 32) / pageStep) + 1;
      var max = layout.pages.length - 1;
      return { from: Math.max(0, from), to: Math.min(max, to) };
    }

    function renderLayout(layout, range){
      if(_destroyed || !layout) return;
      _lastLayout = layout;
      window.AQEngine.renderToDOM(layout, stageEl, Object.assign({}, engineOpts, { renderPageRange: range || visiblePageRange(layout) }));
      wireImageInteraction(stageEl, docModel, function(){ reflow(); onUpdate({ editor: editorObj }); });
    }

    function scheduleViewportRender(){
      if(_destroyed || !_lastLayout) return;
      try { if(_scrollRenderTimer) window.clearTimeout(_scrollRenderTimer); } catch(_e){}
      try {
        _scrollRenderTimer = window.setTimeout(function(){
          _scrollRenderTimer = 0;
          renderLayout(_lastLayout, visiblePageRange(_lastLayout));
          if(selection && selection.repaint) selection.repaint();
          if(input && input.syncCapturePosition) input.syncCapturePosition();
        }, 80);
      } catch(_e){}
    }

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
            if(b._isBibEntry || (b.attrs && b.attrs.class && String(b.attrs.class).indexOf('refe') >= 0)){
              applyAPA7BibliographyEntryStyle(b);
            } else {
              if(!b.list) b.firstLineIndentPx = 36; else b.firstLineIndentPx = 0;
              if(!b.font) b.font = { sizePt: 12, weight: '400' };
            }
          } else if(b.type === 'heading'){
            applyAPA7HeadingStyle(b, b.level);
          }
        }
        var layout = window.AQEngine.paginate(d.blocks, engineOpts);
        editorObj._aqLayout = layout;
        editorObj._aqLayoutOptions = engineOpts;
        var activePageIndex = 0;
        try {
          var activeRange = selection && typeof selection.getRange === 'function' ? selection.getRange() : null;
          activePageIndex = pageIndexForOffset(layout, activeRange ? activeRange.focus : 0);
        } catch(_pageErr){}
        renderLayout(layout, _setupDone ? pageRangeAround(layout, activePageIndex) : visiblePageRange(layout));

        // Empty-document placeholder. Shown when the doc has a single empty
        // paragraph block — fades on the first keystroke. Pure visual hint.
        try{
          var hasContent = d.blocks.some(function(b){
            if(!b) return false;
            if(b.type === 'image' || b.type === 'table' || b.type === 'horizontalRule') return true;
            return (b.runs || []).some(function(r){ return r && r.text && r.text.length; });
          });
          var existingPh = stageEl.querySelector('.aq-empty-placeholder');
          if(!hasContent){
            if(!existingPh){
              var ph = document.createElement('div');
              ph.className = 'aq-empty-placeholder';
              ph.textContent = 'Yazmaya başlayın…';
              ph.style.cssText = 'position:absolute;top:' + (layout.marginTopPx + 12) + 'px;left:' + (layout.marginLeftPx) + 'px;color:#9ca3af;font:italic 13px "Times New Roman",Times,serif;pointer-events:none;user-select:none;z-index:1;';
              var firstPage = stageEl.querySelector('.aq-engine-page');
              if(firstPage) firstPage.appendChild(ph);
            }
          } else if(existingPh){
            existingPh.remove();
          }
        }catch(_phErr){}
        try{
          var modelText = docModel && typeof docModel.getPlainText === 'function' ? docModel.getPlainText() : '';
          var stageText = stageEl ? String(stageEl.textContent || '') : '';
          var citationPattern = /\([^)]+vd\.,\s*\d{4}[a-z]?\)/g;
          var legacyCitCount = stageEl && stageEl.querySelectorAll ? stageEl.querySelectorAll('.cit,[data-ref]').length : 0;
          var aqCitCount = stageEl && stageEl.querySelectorAll ? stageEl.querySelectorAll('.aq-cit,[data-aq-ref]').length : 0;
          (typeof window!=='undefined'&&window.__aqCiteDiag)&&console.warn('[AQ-CITE-DIAG] ' + JSON.stringify({
            t: Date.now(),
            event: 'render.afterReflow',
            modelCitationCount: (modelText.match(citationPattern) || []).length,
            stageCitationCount: (stageText.match(citationPattern) || []).length,
            legacyCitCount: legacyCitCount,
            aqCitCount: aqCitCount,
            modelText: modelText.slice(0, 500),
            stageText: stageText.slice(0, 500),
            lineTexts: Array.prototype.map.call(stageEl.querySelectorAll('.aq-engine-line'), function(line){ return line.textContent || ''; }).slice(0, 8),
            selection: selection && selection.getRange ? selection.getRange() : null
          }));
        }catch(_renderDiagErr){}

        if(!_setupDone){
          selection = window.AQEngineSelection.create({ container: stageEl, docModel: docModel });
          selection.attach();
          selection.onChange(function(ev){
            if(_redirectSelectionOutOfBibliography()) return;
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
              scheduleTypingRefSync();
            }
          });
          if(input && typeof input.attach === 'function') input.attach();
          _setupDone = true;
        } else {
          if(selection && selection.repaint) selection.repaint();
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

    function _blockPlainText(block){
      return ((block && block.runs) || []).map(function(run){ return String(run && run.text || ''); }).join('');
    }

    function _normalizeBibTitle(text){
      return String(text || '')
        .trim()
        .toLowerCase()
        .replace(/\u00e7/g, 'c')
        .replace(/\u0131/g, 'i')
        .replace(/\u015f/g, 's')
        .replace(/\u011f/g, 'g')
        .replace(/\u00fc/g, 'u')
        .replace(/\u00f6/g, 'o');
    }

    function _isBibliographyHeading(block){
      var text = _normalizeBibTitle(_blockPlainText(block));
      return !!(block && (block._isBibHeading || (block.type === 'heading' && (text === 'kaynakca' || text === 'references' || text === 'bibliography' || text === 'kaynaklar'))));
    }

    function _isBibliographyEntry(block){
      var cls = String(block && block.attrs && block.attrs.class || '');
      return !!(block && (block._isBibEntry || (block.attrs && block.attrs.refId) || /\b(refe|aq-ref-entry)\b/.test(cls)));
    }

    function _findBibliographyHeadingIndex(blocks){
      blocks = Array.isArray(blocks) ? blocks : [];
      for(var i = 0; i < blocks.length; i++){
        if(_isBibliographyHeading(blocks[i])) return i;
      }
      return -1;
    }

    function _blockStartOffset(blocks, blockIdx){
      var out = 0;
      for(var i = 0; i < blockIdx && i < blocks.length; i++){
        out += _blockPlainText(blocks[i]).length + 1;
      }
      return out;
    }

    var _redirectingBibliographySelection = false;
    function _redirectSelectionOutOfBibliography(){
      if(_redirectingBibliographySelection || !selection || !docModel) return false;
      var range = selection.getRange ? selection.getRange() : null;
      if(!range || typeof range.from !== 'number') return false;
      var blocks = docModel.get().blocks || [];
      var loc = docModel.locate(range.from);
      var block = blocks[loc.blockIdx];
      if(!_isBibliographyHeading(block) && !_isBibliographyEntry(block)) return false;
      var headingIdx = _isBibliographyHeading(block) ? loc.blockIdx : _findBibliographyHeadingIndex(blocks);
      if(headingIdx < 0) return false;
      var at = _blockStartOffset(blocks, headingIdx);
      _redirectingBibliographySelection = true;
      setTimeout(function(){
        try{ if(selection && selection.setRange) selection.setRange(at, at); }catch(_e){}
        _redirectingBibliographySelection = false;
      }, 0);
      return true;
    }

    // ── TipTap-compatible editor object ──────────────────────────────────────
    var editorObj = {
      _aqEngine: true,
      _docModel: docModel,
      _reflow:   reflow,
      _clearInputCapture: function(){
        if(input && typeof input.clearCapture === 'function') input.clearCapture();
      },
      _stageEl:  stageEl,
      _onSelCb:  null,
      _eventHandlers: {},
      isDestroyed: false,
      _captureSelection: function(){
        if(!selection || typeof selection.getRange !== 'function') return null;
        var range = selection.getRange();
        return {
          type: 'aq',
          from: range.from,
          to: range.to,
          anchor: range.anchor,
          focus: range.focus
        };
      },
      _restoreSelection: function(saved){
        if(!saved || !selection || typeof selection.setRange !== 'function') return false;
        var anchor = saved.anchor;
        var focus = saved.focus;
        if(typeof anchor !== 'number') anchor = typeof saved.from === 'number' ? saved.from : 0;
        if(typeof focus !== 'number') focus = typeof saved.to === 'number' ? saved.to : anchor;
        selection.setRange(anchor, focus);
        return true;
      },

      getHTML: function(){ return blocksToHTML(docModel.get().blocks); },
      getJSON: function(){
        if(window.AQEngineTipTapAdapter && window.AQEngineTipTapAdapter.exportToTipTap)
          return window.AQEngineTipTapAdapter.exportToTipTap(docModel.get().blocks);
        return { type: 'doc', content: [] };
      },
      getText: function(opts){
        return docModel.getPlainText();
      },
      getAttributes: function(markOrNode){
        if(!selection) return {};
        var range = selection.getRange();
        var loc   = docModel.locate(range.from);
        var block = docModel.get().blocks[loc.blockIdx];
        if(!block) return {};
        if(markOrNode === 'heading')   return block.type === 'heading' ? { level: normalizeHeadingLevel(block.level) } : {};
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
        if(markOrNode === 'crossRef') return run.crossRef || {};
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

        if(name === 'heading')     { if(block.type !== 'heading') return false; if(a.level !== undefined) return normalizeHeadingLevel(block.level) === normalizeHeadingLevel(a.level); return true; }
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
            textBetween: function(from, to, blockSeparator){
              var sep = (typeof blockSeparator === 'string') ? blockSeparator : '\n';
              var blocks = docModel.get().blocks;
              var fullText = '';
              for(var i = 0; i < blocks.length; i++){
                var bText = (blocks[i].runs || []).map(function(r){ return String(r.text || ''); }).join('');
                fullText += bText;
                if(i < blocks.length - 1) fullText += sep;
              }
              return fullText.slice(from, to);
            },
            descendants: function(cb){
              var blocks = docModel.get().blocks, offset = 0;
              for(var i = 0; i < blocks.length; i++){
                var b = blocks[i], bLen = docModel.blockTextLength(i);
                var blockNode = { 
                  type: { name: b.type || 'paragraph' }, 
                  attrs: { level: b.level, textAlign: b.align }, 
                  textContent: (b.runs||[]).map(function(r){ return r.text||''; }).join(''), 
                  content: { size: bLen } 
                };
                if(cb(blockNode, offset) === false) { offset += bLen + 1; continue; }
                
                var runOffset = 0;
                (b.runs || []).forEach(function(r){
                  var rLen = (r.text || '').length;
                  var marks = [];
                  if(r.bold) marks.push({ type: 'bold' });
                  if(r.italic) marks.push({ type: 'italic' });
                  if(r.underline) marks.push({ type: 'underline' });
                  if(r.strike) marks.push({ type: 'strike' });
                  if(r.trackInsert) marks.push({ type: 'trackInsert' });
                  if(r.trackDelete) marks.push({ type: 'trackDelete' });
                  if(r.citation) marks.push({ type: 'citation', attrs: { 
                    'data-ref': r.citation.ref, 
                    'data-id': r.citation.id, 
                    'data-mode': r.citation.mode, 
                    'data-note-id': r.citation.noteId 
                  }});
                  if(r.highlight) marks.push({ type: 'highlight', attrs: { color: r.highlight } });
                  if(r.crossRef) marks.push({ type: 'crossRef', attrs: r.crossRef });
                  else if(r.href) marks.push({ type: 'link', attrs: { href: r.href } });
                  
                  var runNode = {
                    type: { name: 'text' },
                    text: r.text || '',
                    textContent: r.text || '',
                    nodeSize: rLen,
                    marks: marks
                  };
                  cb(runNode, offset + 1 + runOffset);
                  runOffset += rLen;
                });

                offset += bLen + 1;
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
      get schema(){ return { marks: { trackInsert:{ name:'trackInsert' }, trackDelete:{ name:'trackDelete' } }, nodes: {}, text: function(t){ return { type: 'text', text: t }; } }; },

      get isEditable(){ return _editable; },
      setEditable: function(val){ _editable = !!val; },
      storage: {},
      extensionManager: { extensions: [] },

      on:   function(ev, cb){ if(!this._eventHandlers[ev]) this._eventHandlers[ev] = []; this._eventHandlers[ev].push(cb); },
      off:  function(ev, cb){ var h = this._eventHandlers[ev]; if(!h) return; this._eventHandlers[ev] = h.filter(function(x){ return x !== cb; }); },
      emit: function(ev){ var h = this._eventHandlers[ev]||[]; for(var i=0;i<h.length;i++) try{ h[i]({ editor: this }); }catch(e){} },

      destroy: function(){
        _destroyed = true; this.isDestroyed = true;
        try { if(_refSyncTimer) window.clearTimeout(_refSyncTimer); } catch(_e){}
        try { if(_scrollRenderTimer) window.clearTimeout(_scrollRenderTimer); } catch(_e){}
        _refSyncTimer = 0;
        _scrollRenderTimer = 0;
        try {
          if(_boundScrollHost && _boundScrollHost.removeEventListener) _boundScrollHost.removeEventListener('scroll', scheduleViewportRender);
          _boundScrollHost = null;
        } catch(_scrollUnbindErr){}
        try {
          if(stageEl && typeof stageEl._aqImageInteractionCleanup === 'function'){
            stageEl._aqImageInteractionCleanup();
            stageEl._aqImageInteractionCleanup = null;
          }
        } catch(_imageCleanupErr){}
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
    function normalizeCitationText(value){
      return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function htmlLooksLikeCitationInsert(html){
      var s = String(html || '');
      return /\bclass=(["'])[^"']*\bcit\b/i.test(s) || /\bdata-ref=(["'])[^"']+\1/i.test(s);
    }
    function shouldIgnoreDuplicateCitationHTML(html, at){
      if(!htmlLooksLikeCitationInsert(html)) return false;
      if(typeof window !== 'undefined' && (window.__aqCitationTransactionActive || Date.now() < (window.__aqCitationInputBlockedUntil || 0))){
        return true;
      }
      var citationText = normalizeCitationText(html);
      if(!citationText) return false;
      var plain = docModel && typeof docModel.getPlainText === 'function' ? docModel.getPlainText() : '';
      var before = normalizeCitationText(plain.slice(Math.max(0, at - citationText.length - 16), at));
      var after = normalizeCitationText(plain.slice(at, at + citationText.length + 16));
      return before.endsWith(citationText) || after.indexOf(citationText) === 0;
    }

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
      insertContent: function(html, opts){
        if(!selection) return;
        var range = selection.getRange();
        var at = Math.min(range.from, range.to);
        try{
          if(htmlLooksLikeCitationInsert(html)){
            (typeof window!=='undefined'&&window.__aqCiteDiag)&&console.warn('[AQ-CITE-DIAG] ' + JSON.stringify({
              t: Date.now(),
              event: 'compat.insertContent.citationHTML',
              at: at,
              range: range,
              htmlText: normalizeCitationText(html),
              ignored: shouldIgnoreDuplicateCitationHTML(html, at)
            }));
          }
        }catch(_diagErr){}
        if(shouldIgnoreDuplicateCitationHTML(html, at)) return;
        var newBlocks = htmlToBlocks(html || '');
        if(range.from !== range.to) docModel.deleteRange(range.from, range.to);
        docModel.insertBlocks(at, newBlocks);
        var insertedLen = getBlocksTextLength(newBlocks);
        reflow();
        if(selection) selection.setRange(at + insertedLen, at + insertedLen);
        onUpdate({ editor: editorObj });
      },
      insertContentAt: function(pos, html, opts){
        var newBlocks = htmlToBlocks(html || '');
        var at = 0;
        if(typeof pos === 'object' && pos.from !== undefined){ 
          docModel.deleteRange(pos.from, pos.to); 
          at = pos.from; 
        } else {
          at = Number(pos) || 0;
        }
        try{
          if(htmlLooksLikeCitationInsert(html)){
            (typeof window!=='undefined'&&window.__aqCiteDiag)&&console.warn('[AQ-CITE-DIAG] ' + JSON.stringify({
              t: Date.now(),
              event: 'compat.insertContentAt.citationHTML',
              at: at,
              pos: pos,
              htmlText: normalizeCitationText(html),
              ignored: shouldIgnoreDuplicateCitationHTML(html, at)
            }));
          }
        }catch(_diagErr2){}
        if(shouldIgnoreDuplicateCitationHTML(html, at)) return;
        docModel.insertBlocks(at, newBlocks);
        var insertedLen = getBlocksTextLength(newBlocks);
        reflow();
        if(selection) selection.setRange(at + insertedLen, at + insertedLen);
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
        } else if(markName === 'crossRef'){
          docModel.applyMark(range.from, range.to, 'crossRef', attrs || false);
          docModel.applyMark(range.from, range.to, 'href', attrs && attrs.refId ? ('#' + attrs.refId) : false);
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
        if(blk && blk.type === 'heading' && normalizeHeadingLevel(blk.level) === normalizeHeadingLevel(attrs && attrs.level))
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
      indent: function(){
        if(!selection) return;
        var range = selection.getRange();
        var blk = docModel.get().blocks[docModel.blockIndexAt(range.from)];
        if(blk && blk.list) docModel.changeListLevel(docModel.blockIndexAt(range.from), 1);
        else if(typeof docModel.setLeftIndentForRange === 'function') docModel.setLeftIndentForRange(range.from, range.to, 36);
        reflow(); onUpdate({ editor: editorObj });
      },
      outdent: function(){
        if(!selection) return;
        var range = selection.getRange();
        var blk = docModel.get().blocks[docModel.blockIndexAt(range.from)];
        if(blk && blk.list) docModel.changeListLevel(docModel.blockIndexAt(range.from), -1);
        else if(typeof docModel.setLeftIndentForRange === 'function') docModel.setLeftIndentForRange(range.from, range.to, -36);
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
        if(attrs.listStyleType && (nodeType === 'orderedList' || nodeType === 'bulletList')){
          docModel.setListStyleForRange(range.from, range.to, attrs.listStyleType);
        }
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

  return { 
    createEditor: createEditor,
    htmlToBlocks: htmlToBlocks,
    domToTipTapJSON: domToTipTapJSON
  };
});
