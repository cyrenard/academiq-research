/* AcademiQ Footnotes, Endnotes & Cross-References */
(function(root){
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────
  function uid(prefix){ return (prefix||'fn')+'-'+Math.random().toString(36).slice(2,9); }
  function escH(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escA(s){ return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }

  // ─────────────────────────────────────────────────────────────
  // TipTap: FootnoteRef inline atom node
  // ─────────────────────────────────────────────────────────────
  function createFootnoteRefNode(T){
    return T.Node.create({
      name: 'footnoteRef',
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      draggable: false,
      addAttributes: function(){
        return {
          fnId:   { default: '', parseHTML: function(el){ return el.getAttribute('data-fn-id')||''; } },
          fnType: { default: 'footnote', parseHTML: function(el){ return el.getAttribute('data-fn-type')||'footnote'; } }
        };
      },
      parseHTML: function(){
        return [{ tag: 'sup.fn-ref' }];
      },
      renderHTML: function(p){
        var attrs = p.node ? p.node.attrs : (p.attrs||{});
        return ['sup', {
          class: 'fn-ref',
          'data-fn-id': attrs.fnId,
          'data-fn-type': attrs.fnType,
          contenteditable: 'false',
          title: attrs.fnType === 'endnote' ? 'Sonnot' : 'Dipnot'
        }, '\u200b'];
      },
      addKeyboardShortcuts: function(){
        function deleteNodeBefore(editor){
          var sel = editor.state.selection;
          var nodeBefore = sel.$anchor.nodeBefore;
          if(nodeBefore && nodeBefore.type.name === 'footnoteRef'){
            var fnId = nodeBefore.attrs.fnId;
            editor.chain().focus().deleteRange({ from: sel.anchor - 1, to: sel.anchor }).run();
            removeFootnoteEntry(fnId);
            scheduleSync();
            return true;
          }
          return false;
        }
        function deleteNodeAfter(editor){
          var sel = editor.state.selection;
          var nodeAfter = sel.$anchor.nodeAfter;
          if(nodeAfter && nodeAfter.type.name === 'footnoteRef'){
            var fnId = nodeAfter.attrs.fnId;
            editor.chain().focus().deleteRange({ from: sel.anchor, to: sel.anchor + 1 }).run();
            removeFootnoteEntry(fnId);
            scheduleSync();
            return true;
          }
          return false;
        }
        return {
          Backspace: function(p){ return deleteNodeBefore(p.editor); },
          Delete:    function(p){ return deleteNodeAfter(p.editor); }
        };
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // TipTap: CrossRef mark
  // ─────────────────────────────────────────────────────────────
  function createCrossRefMark(T){
    return T.Mark.create({
      name: 'crossRef',
      inclusive: false,
      addAttributes: function(){
        return {
          refType:  { default: 'heading', parseHTML: function(el){ return el.getAttribute('data-ref-type')||'heading'; } },
          refId:    { default: '', parseHTML: function(el){ return el.getAttribute('data-ref-id')||''; } },
          refLabel: { default: '', parseHTML: function(el){ return el.getAttribute('data-ref-label')||''; } }
        };
      },
      parseHTML: function(){ return [{ tag: 'a.cross-ref' }]; },
      renderHTML: function(p){
        var attrs = p.mark ? p.mark.attrs : (p.attrs||{});
        return ['a', {
          class: 'cross-ref',
          'data-ref-type':  attrs.refType,
          'data-ref-id':    attrs.refId,
          'data-ref-label': attrs.refLabel,
          href: '#' + attrs.refId,
          title: 'Çapraz referans: ' + attrs.refLabel
        }, 0];
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Footnote Store (in-memory, persisted via HTML hooks)
  // ─────────────────────────────────────────────────────────────
  var fnStore = {}; // { fnId: { text, type } }

  function createFootnoteEntry(type){
    var id = uid('fn');
    fnStore[id] = { text: '', type: type || 'footnote' };
    return id;
  }

  function removeFootnoteEntry(fnId){
    delete fnStore[fnId];
    renderFootnotePanel();
  }

  function setFootnoteText(fnId, text){
    if(fnStore[fnId]) fnStore[fnId].text = String(text||'');
  }

  function getFootnoteText(fnId){
    return fnStore[fnId] ? fnStore[fnId].text : '';
  }

  // Serialize store to hidden HTML block
  function serializeFnStore(){
    var ids = Object.keys(fnStore);
    if(!ids.length) return '';
    var entries = ids.map(function(id){
      var f = fnStore[id];
      return '<div data-fn-id="'+escA(id)+'" data-fn-type="'+escA(f.type||'footnote')+'">'+escH(f.text||'')+'</div>';
    });
    return '<div class="aq-fn-store" style="display:none!important" aria-hidden="true">'+entries.join('')+'</div>';
  }

  // Extract store from HTML, return { store, cleanHtml }
  function extractFnStore(html){
    var src = String(html||'');
    var match = src.match(/<div class="aq-fn-store"[\s\S]*?<\/div>\s*<\/div>/);
    var store = {};
    if(match){
      var tmp = document.createElement('div');
      tmp.innerHTML = match[0];
      tmp.querySelectorAll('[data-fn-id]').forEach(function(el){
        var id = el.getAttribute('data-fn-id');
        var type = el.getAttribute('data-fn-type')||'footnote';
        store[id] = { text: el.textContent||'', type: type };
      });
    }
    var clean = src.replace(/<div class="aq-fn-store"[\s\S]*?<\/div>\s*<\/div>/, '').trim();
    return { store: store, clean: clean };
  }

  // ─────────────────────────────────────────────────────────────
  // HTML hooks (called from tiptap-word-document.js wrappers)
  // ─────────────────────────────────────────────────────────────
  function hookGetHTML(html){
    return String(html||'') + '\n' + serializeFnStore();
  }

  function hookSetHTML(html){
    var result = extractFnStore(html);
    fnStore = result.store;
    renderFootnotePanel();
    return result.clean;
  }

  // ─────────────────────────────────────────────────────────────
  // Number sync
  // ─────────────────────────────────────────────────────────────
  var _syncTimer = 0;
  function scheduleSync(){
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(syncFootnoteNumbers, 60);
  }

  function syncFootnoteNumbers(){
    // Numbers in editor are handled by CSS counters — just sync the panel
    renderFootnotePanel();
  }

  // ─────────────────────────────────────────────────────────────
  // Insert commands
  // ─────────────────────────────────────────────────────────────
  function insertFootnote(type){
    var editor = root.editor;
    if(!editor) return;
    var fnId = createFootnoteEntry(type||'footnote');
    editor.chain().focus().insertContent({
      type: 'footnoteRef',
      attrs: { fnId: fnId, fnType: type||'footnote' }
    }).run();
    scheduleSync();
    setTimeout(function(){
      var inp = document.querySelector('[data-fn-input="'+fnId+'"]');
      if(inp){ inp.scrollIntoView({ behavior:'smooth', block:'center' }); inp.focus(); }
    }, 200);
  }

  // ─────────────────────────────────────────────────────────────
  // Cross-reference dialog
  // ─────────────────────────────────────────────────────────────
  function showCrossRefDialog(){
    var editor = root.editor;
    if(!editor) return;
    var targets = collectCrossRefTargets();
    if(!targets.length){
      alert('Belge içinde referans alınabilecek başlık, tablo veya şekil bulunamadı.');
      return;
    }
    var old = document.getElementById('aq-crd');
    if(old) old.remove();
    var dlg = document.createElement('div');
    dlg.id = 'aq-crd';
    dlg.className = 'aq-crd';
    var rows = targets.map(function(t, i){
      return '<div class="aq-crd-row" data-i="'+i+'">'+
        '<span class="aq-crd-badge aq-crd-'+escH(t.type)+'">'+typeLabel(t.type)+'</span>'+
        '<span class="aq-crd-lbl">'+escH(t.label)+'</span></div>';
    }).join('');
    dlg.innerHTML = '<div class="aq-crd-head"><b>Çapraz Referans</b><button class="aq-crd-x">✕</button></div>'+
      '<div class="aq-crd-search"><input type="text" placeholder="Ara..." id="aq-crd-q" autocomplete="off"/></div>'+
      '<div class="aq-crd-body" id="aq-crd-body">'+rows+'</div>';
    document.body.appendChild(dlg);
    // Position near selection
    var sel = root.getSelection && root.getSelection();
    if(sel && sel.rangeCount){
      var r = sel.getRangeAt(0).getBoundingClientRect();
      var top = Math.max(8, (r.bottom||120) + 8);
      var left = Math.max(8, Math.min((r.left||200), root.innerWidth - 320));
      dlg.style.cssText = 'top:'+top+'px;left:'+left+'px';
    }
    dlg.querySelector('.aq-crd-x').onclick = function(){ dlg.remove(); };
    document.getElementById('aq-crd-q').addEventListener('input', function(){
      var q = this.value.toLowerCase();
      dlg.querySelectorAll('.aq-crd-row').forEach(function(row){
        var i = parseInt(row.getAttribute('data-i'),10);
        row.style.display = targets[i].label.toLowerCase().indexOf(q)>=0 ? '' : 'none';
      });
    });
    dlg.querySelectorAll('.aq-crd-row').forEach(function(row){
      row.addEventListener('click', function(){
        var t = targets[parseInt(row.getAttribute('data-i'),10)];
        insertCrossRef(editor, t);
        dlg.remove();
      });
    });
    document.getElementById('aq-crd-q').focus();
    // Close on outside click
    setTimeout(function(){
      function onOut(e){ if(!dlg.contains(e.target)){ dlg.remove(); document.removeEventListener('mousedown',onOut); } }
      document.addEventListener('mousedown', onOut);
    }, 100);
  }

  function typeLabel(type){
    return { heading:'Başlık', table:'Tablo', figure:'Şekil', footnote:'Dipnot', endnote:'Sonnot' }[type] || type;
  }

  function collectCrossRefTargets(){
    var host = document.getElementById('apaed');
    if(!host) return [];
    var targets = [];
    // Headings
    host.querySelectorAll('h1,h2,h3,h4,h5').forEach(function(h){
      var txt = (h.textContent||'').trim();
      if(!txt) return;
      var id = ensureElId(h,'hd');
      var lvl = parseInt(h.tagName[1],10);
      var indent = Array(lvl).join('  ');
      targets.push({ type:'heading', id:id, label: indent + txt });
    });
    // Tables
    var tblN = 1;
    host.querySelectorAll('table').forEach(function(tbl){
      var id = ensureElId(tbl,'tbl');
      targets.push({ type:'table', id:id, label:'Tablo '+tblN++ });
    });
    // Images
    var figN = 1;
    host.querySelectorAll('img').forEach(function(img){
      var id = ensureElId(img,'fig');
      var alt = (img.getAttribute('alt')||'').trim();
      targets.push({ type:'figure', id:id, label:'Şekil '+figN++ + (alt ? ': '+alt : '') });
    });
    // Footnotes (numbered ones in DOM)
    var fnN2 = 1;
    host.querySelectorAll('sup.fn-ref[data-fn-type="footnote"]').forEach(function(sup){
      var id = sup.getAttribute('data-fn-id');
      targets.push({ type:'footnote', id:id, label:'Dipnot '+fnN2++ });
    });
    return targets;
  }

  function ensureElId(el, prefix){
    if(!el.id) el.id = uid(prefix);
    return el.id;
  }

  function insertCrossRef(editor, target){
    var prefix = 'bkz. ';
    var text = prefix + target.label.trim();
    // Use mark if available
    if(editor.chain && editor.schema && editor.schema.marks && editor.schema.marks.crossRef){
      editor.chain().focus()
        .insertContent(
          '<a class="cross-ref" data-ref-type="'+escA(target.type)+'" data-ref-id="'+escA(target.id)+'" data-ref-label="'+escA(target.label.trim())+'">'+escH(text)+'</a>'
        ).run();
    } else {
      editor.chain().focus().insertContent(
        '<a class="cross-ref" data-ref-type="'+escA(target.type)+'" data-ref-id="'+escA(target.id)+'" data-ref-label="'+escA(target.label.trim())+'">'+escH(text)+'</a>'
      ).run();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Footnote panel rendering
  // ─────────────────────────────────────────────────────────────

  // Auto-resize a textarea to fit its content
  function autoResizeTa(ta){
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }

  // Build one fn-item row and attach events (returns DOM element)
  function buildFnItem(entry, isEndnote){
    var item = document.createElement('div');
    item.className = 'fn-item';
    item.setAttribute('data-fn-item', entry.id);

    var numSpan = document.createElement('span');
    numSpan.className = 'fn-num';

    var backBtn = document.createElement('button');
    backBtn.className = 'fn-back-btn';
    backBtn.setAttribute('data-fn-id', entry.id);
    backBtn.title = 'Metne dön';
    backBtn.textContent = '↑';
    backBtn.addEventListener('click', function(){ jumpToRef(entry.id); });

    var numSup = document.createElement('sup');
    numSup.className = 'fn-num-sup';
    numSup.textContent = String(entry.n);
    numSpan.appendChild(backBtn);
    numSpan.appendChild(numSup);
    // non-breaking space after number
    numSpan.appendChild(document.createTextNode('\u00a0'));

    var ta = document.createElement('textarea');
    ta.className = 'fn-inp';
    ta.setAttribute('data-fn-input', entry.id);
    ta.rows = 1;
    ta.placeholder = isEndnote ? 'Sonnot metnini girin...' : 'Dipnot metnini girin...';
    ta.value = getFootnoteText(entry.id);
    ta.addEventListener('input', function(){
      setFootnoteText(entry.id, ta.value);
      autoResizeTa(ta);
      triggerDocSave();
    });

    var delBtn = document.createElement('button');
    delBtn.className = 'fn-del-btn';
    delBtn.setAttribute('data-fn-id', entry.id);
    delBtn.title = 'Sil';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', function(){ removeFootnoteFromEditor(entry.id); });

    item.appendChild(numSpan);
    item.appendChild(ta);
    item.appendChild(delBtn);

    // Resize after insertion (needs to be in DOM first — called by caller)
    entry._ta = ta;
    return item;
  }

  function renderFootnotePanel(){
    var panel = document.getElementById('fn-panel');
    if(!panel) return;
    var host = document.getElementById('apaed');
    if(!host){ panel.style.display='none'; return; }

    var fns=[], ens=[];
    var fnN=1, enN=1;
    host.querySelectorAll('sup.fn-ref').forEach(function(sup){
      var id = sup.getAttribute('data-fn-id');
      var type = sup.getAttribute('data-fn-type')||'footnote';
      if(type==='endnote') ens.push({ id:id, n:enN++ });
      else fns.push({ id:id, n:fnN++ });
    });

    if(!fns.length && !ens.length){ panel.style.display='none'; return; }
    panel.style.display='';

    // Compute signature to detect structural changes (add/remove, not reorder)
    var sig = fns.map(function(f){ return 'f:'+f.id; }).join(',') +
              '|' + ens.map(function(e){ return 'e:'+e.id; }).join(',');
    var prevSig = panel.getAttribute('data-fn-sig') || '';

    if(sig === prevSig){
      // Structure unchanged — only update numbers in place (no focus loss)
      fns.forEach(function(f){
        var sup = panel.querySelector('[data-fn-item="'+f.id+'"] .fn-num-sup');
        if(sup) sup.textContent = String(f.n);
      });
      ens.forEach(function(en){
        var sup = panel.querySelector('[data-fn-item="'+en.id+'"] .fn-num-sup');
        if(sup) sup.textContent = String(en.n);
      });
      return;
    }

    // Structure changed — rebuild (focus will move, acceptable)
    var frag = document.createDocumentFragment();
    var newItems = [];

    if(fns.length){
      var sep = document.createElement('hr');
      sep.className = 'fn-sep';
      frag.appendChild(sep);
      var sec = document.createElement('div');
      sec.className = 'fn-sec';
      fns.forEach(function(f){
        var item = buildFnItem(f, false);
        sec.appendChild(item);
        newItems.push(f);
      });
      frag.appendChild(sec);
    }

    if(ens.length){
      var sep2 = document.createElement('hr');
      sep2.className = 'fn-sep fn-sep-en';
      frag.appendChild(sep2);
      var sec2 = document.createElement('div');
      sec2.className = 'fn-sec';
      ens.forEach(function(en){
        var item = buildFnItem(en, true);
        sec2.appendChild(item);
        newItems.push(en);
      });
      frag.appendChild(sec2);
    }

    panel.innerHTML = '';
    panel.setAttribute('data-fn-sig', sig);
    panel.appendChild(frag);

    // Resize all textareas after they're in DOM
    newItems.forEach(function(entry){
      if(entry._ta) autoResizeTa(entry._ta);
    });
  }

  function removeFootnoteFromEditor(fnId){
    var editor = root.editor;
    if(!editor) return;
    // Find and delete the node from ProseMirror doc
    var state = editor.state;
    var tr = state.tr;
    var found = false;
    state.doc.descendants(function(node, pos){
      if(found) return false;
      if(node.type.name === 'footnoteRef' && node.attrs.fnId === fnId){
        tr.delete(pos, pos + node.nodeSize);
        found = true;
        return false;
      }
    });
    if(found){
      editor.view.dispatch(tr);
      removeFootnoteEntry(fnId);
      scheduleSync();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Navigation
  // ─────────────────────────────────────────────────────────────
  function jumpToFootnote(fnId){
    renderFootnotePanel();
    setTimeout(function(){
      var inp = document.querySelector('[data-fn-input="'+fnId+'"]');
      if(inp){ inp.scrollIntoView({ behavior:'smooth', block:'center' }); inp.focus(); }
    }, 50);
  }

  function jumpToRef(fnId){
    var sup = document.querySelector('sup.fn-ref[data-fn-id="'+fnId+'"]');
    if(sup) sup.scrollIntoView({ behavior:'smooth', block:'center' });
  }

  function jumpToCrossRefTarget(refId){
    var target = document.getElementById(refId);
    if(target) target.scrollIntoView({ behavior:'smooth', block:'center' });
  }

  // ─────────────────────────────────────────────────────────────
  // Save trigger
  // ─────────────────────────────────────────────────────────────
  var _saveTimer = 0;
  function triggerDocSave(){
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function(){
      if(typeof root.save === 'function') root.save();
      else if(typeof root.__aqCommitActiveDoc === 'function') root.__aqCommitActiveDoc();
    }, 400);
  }

  // ─────────────────────────────────────────────────────────────
  // Event binding (called once after DOM ready)
  // ─────────────────────────────────────────────────────────────
  function bindEditorEvents(){
    var host = document.getElementById('apaed');
    if(!host) return;
    host.addEventListener('click', function(e){
      var sup = e.target.closest('sup.fn-ref');
      if(sup){ e.preventDefault(); jumpToFootnote(sup.getAttribute('data-fn-id')); return; }
      var cr = e.target.closest('a.cross-ref');
      if(cr){ e.preventDefault(); jumpToCrossRefTarget(cr.getAttribute('data-ref-id')); }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────────
  function init(){
    bindEditorEvents();
    var editor = root.editor;
    if(editor && typeof editor.on === 'function'){
      editor.on('update', scheduleSync);
    }
    scheduleSync();
  }

  // ─────────────────────────────────────────────────────────────
  // Export helpers
  // ─────────────────────────────────────────────────────────────

  // Build APA 7 footnote HTML for Word/PDF export
  // Reads footnote markers from current DOM to get order & numbers
  function buildExportFootnotesHTML(wordMode){
    var host = document.getElementById('apaed');
    if(!host) return { footnotes: '', endnotes: '' };

    var fns = [], ens = [];
    var fnN = 1, enN = 1;
    host.querySelectorAll('sup.fn-ref').forEach(function(sup){
      var id = sup.getAttribute('data-fn-id');
      var type = sup.getAttribute('data-fn-type') || 'footnote';
      var txt = getFootnoteText(id);
      if(type === 'endnote') ens.push({ n: enN++, text: txt });
      else fns.push({ n: fnN++, text: txt });
    });

    var fnHTML = '', enHTML = '';

    if(fns.length){
      if(wordMode){
        // Word-compatible: use mso styles
        fnHTML = '<div style="margin-top:12pt">'+
          '<hr style="width:2in;border:none;border-top:1px solid #000;margin:0 0 6pt 0"/>'+
          fns.map(function(f){
            return '<p style="margin:0;text-indent:0;font-size:10pt;font-family:\'Times New Roman\',serif;line-height:1.5">'+
              '<sup>'+f.n+'</sup> '+escH(f.text)+'</p>';
          }).join('')+'</div>';
      } else {
        // PDF/print: styled
        fnHTML = '<div style="margin-top:18pt;font-family:\'Times New Roman\',serif;font-size:10pt">'+
          '<hr style="width:2in;border:none;border-top:1px solid #000;margin:0 0 6pt 0"/>'+
          fns.map(function(f){
            return '<p style="margin:0;text-indent:0;line-height:1.5">'+
              '<sup style="font-size:7pt">'+f.n+'</sup> '+escH(f.text)+'</p>';
          }).join('')+'</div>';
      }
    }

    if(ens.length){
      if(wordMode){
        enHTML = '<div style="page-break-before:always">'+
          '<p style="margin:0;text-indent:0;text-align:center;font-weight:bold;font-size:12pt;font-family:\'Times New Roman\',serif">Sonnotlar</p>'+
          ens.map(function(en){
            return '<p style="margin:0;text-indent:.5in;font-size:12pt;font-family:\'Times New Roman\',serif;line-height:2">'+
              '<sup>'+en.n+'</sup> '+escH(en.text)+'</p>';
          }).join('')+'</div>';
      } else {
        enHTML = '<div style="margin-top:24pt;font-family:\'Times New Roman\',serif;font-size:12pt">'+
          '<p style="text-align:center;font-weight:bold;margin:0 0 12pt">Sonnotlar</p>'+
          ens.map(function(en){
            return '<p style="margin:0;text-indent:.5in;line-height:2">'+
              '<sup style="font-size:9pt">'+en.n+'</sup> '+escH(en.text)+'</p>';
          }).join('')+'</div>';
      }
    }

    return { footnotes: fnHTML, endnotes: enHTML };
  }

  // Inject footnote content into editor HTML for export (strips store, adds visible footnotes)
  function injectFootnotesIntoExportHTML(html, wordMode){
    // Strip hidden store first
    var result = extractFnStore(html);
    fnStore = Object.keys(result.store).length ? result.store : fnStore;
    var clean = result.clean;

    var parts = buildExportFootnotesHTML(!!wordMode);
    // Insert footnotes before endnotes, endnotes at end
    return clean + parts.footnotes + parts.endnotes;
  }

  // ─────────────────────────────────────────────────────────────
  // Export
  // ─────────────────────────────────────────────────────────────
  root.AQFootnotes = {
    createFootnoteRefNode: createFootnoteRefNode,
    createCrossRefMark: createCrossRefMark,
    insertFootnote: insertFootnote,
    showCrossRefDialog: showCrossRefDialog,
    syncFootnoteNumbers: syncFootnoteNumbers,
    renderFootnotePanel: renderFootnotePanel,
    hookGetHTML: hookGetHTML,
    hookSetHTML: hookSetHTML,
    injectFootnotesIntoExportHTML: injectFootnotesIntoExportHTML,
    init: init
  };

})(typeof window !== 'undefined' ? window : globalThis);
