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
          refLabel: { default: '', parseHTML: function(el){ return el.getAttribute('data-ref-label')||''; } },
          display:  { default: 'context', parseHTML: function(el){ return el.getAttribute('data-ref-display')||'context'; } }
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
          'data-ref-display': attrs.display || 'context',
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
  var toolbarBound = false;

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

  function getActiveEditor(){
    if(typeof root.getActiveEditorInstance === 'function'){
      try{ return root.getActiveEditorInstance() || root.editor || null; }catch(_e){}
    }
    return root.editor || null;
  }

  function isAQEngineEditor(editor){
    return !!(editor && editor._aqEngine && editor._docModel);
  }

  function syncAQEngineFootnoteNumbers(editor){
    if(!isAQEngineEditor(editor)) return false;
    var docModel = editor._docModel;
    var doc = docModel.get();
    var blocks = (doc.blocks || []).map(function(block){
      return Object.assign({}, block, {
        runs: (block.runs || []).map(function(run){
          return Object.assign({}, run, {
            footnote: run.footnote ? Object.assign({}, run.footnote) : null,
            citation: run.citation ? Object.assign({}, run.citation) : null,
            font: run.font ? Object.assign({}, run.font) : null
          });
        }),
        font: block.font ? Object.assign({}, block.font) : null
      });
    });
    var fnN = 1, enN = 1, changed = false;
    blocks.forEach(function(block){
      (block.runs || []).forEach(function(run){
        if(!run || !run.footnote) return;
        var type = run.footnote.fnType === 'endnote' ? 'endnote' : 'footnote';
        var next = String(type === 'endnote' ? enN++ : fnN++);
        if(run.text !== next){
          run.text = next;
          changed = true;
        }
        run.baselineShift = 6;
        run.fontScale = 0.75;
      });
    });
    if(changed){
      docModel.replace(blocks);
      if(typeof editor._reflow === 'function') editor._reflow();
    }
    return true;
  }

  function insertAQEngineFootnote(editor, type){
    var fnType = type === 'endnote' ? 'endnote' : 'footnote';
    var fnId = createFootnoteEntry(fnType);
    var docModel = editor._docModel;
    var range = editor.state && editor.state.selection
      ? editor.state.selection
      : { from: docModel.length(), to: docModel.length() };
    var from = Math.min(Number(range.from || 0), Number(range.to || range.from || 0));
    var to = Math.max(Number(range.from || 0), Number(range.to || range.from || 0));
    if(from !== to) docModel.deleteRange(from, to);
    docModel.insertText(from, '1');
    docModel.applyMark(from, from + 1, 'footnote', { fnId: fnId, fnType: fnType });
    docModel.applyMark(from, from + 1, 'baselineShift', 6);
    docModel.applyMark(from, from + 1, 'fontScale', 0.75);
    docModel.applyMark(from, from + 1, 'color', '#1a4480');
    syncAQEngineFootnoteNumbers(editor);
    if(typeof editor._reflow === 'function') editor._reflow();
    if(editor.commands && typeof editor.commands.focus === 'function') editor.commands.focus(from + 1);
    if(typeof editor.emit === 'function') editor.emit('update');
    scheduleSync();
    setTimeout(function(){
      var inp = document.querySelector('[data-fn-input="'+fnId+'"]');
      if(inp){ inp.scrollIntoView({ behavior:'smooth', block:'center' }); inp.focus(); }
    }, 200);
    return true;
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
    var activeEditor = getActiveEditor();
    if(isAQEngineEditor(activeEditor)){
      syncAQEngineFootnoteNumbers(activeEditor);
    }
    // Numbers in editor are handled by CSS counters — just sync the panel
    renderFootnotePanel();
    if(root.AQAcademicObjects && typeof root.AQAcademicObjects.syncCrossRefLabels === 'function'){
      try{
        root.AQAcademicObjects.syncCrossRefLabels({
          root: document.getElementById('apaed')
        });
      }catch(_e){}
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Insert commands
  // ─────────────────────────────────────────────────────────────
  function insertFootnote(type){
    var editor = getActiveEditor();
    if(!editor){
      setTimeout(function(){
        var retryEditor = getActiveEditor();
        if(retryEditor) insertFootnote(type);
      }, 80);
      return;
    }
    if(isAQEngineEditor(editor)){
      insertAQEngineFootnote(editor, type || 'footnote');
      return;
    }
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
    // beta.8 race-condition fix: defer to the React shell's CrossRefModal
    // when it has registered an opener on the window. App.tsx installs
    // __aqOpenReactCrossRefModal at mount; if the React tree owns the
    // modal, render that instead of the legacy HTML dialog (the legacy
    // one ships with broken chip spacing and the format-preview buttons
    // collapse onto each other when Tailwind purges its utility classes).
    // We still keep the legacy renderer below as a fallback for the
    // pure-Electron build that has no React shell at all.
    var w = typeof window !== 'undefined' ? window : null;
    if(w && typeof w.__aqOpenReactCrossRefModal === 'function'){
      try{
        w.__aqOpenReactCrossRefModal();
        return;
      }catch(_e){
        // fall through to legacy renderer on failure
      }
    }
    var editor = getActiveEditor();
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
      var meta = '';
      if(t.title) meta = '<div class="aq-crd-meta">'+escH(String(t.title || ''))+'</div>';
      return '<div class="aq-crd-row" data-i="'+i+'" data-type="'+escA(t.type)+'">'+
        '<span class="aq-crd-badge aq-crd-'+escH(t.type)+'">'+typeLabel(t.type)+'</span>'+
        '<span class="aq-crd-copy"><span class="aq-crd-lbl">'+escH(t.label)+'</span>'+meta+'</span></div>';
    }).join('');
    // Inline style backup so the legacy modal still looks reasonable
    // when external CSS (e.g. Tailwind) has not loaded these classes —
    // the screenshot in the beta.7 soak report showed every filter chip
    // collapsed into "TümüBaşlıkTabloŞekilDipnotSonnot" because the
    // legacy aq-crd-* class rules weren't reaching the page. These
    // inline styles give the legacy renderer a deterministic look that
    // survives any CSS-purge / shell-mismatch scenario.
    var chipStyle = 'display:inline-block;margin:0 6px 6px 0;padding:5px 12px;font-size:12px;font-weight:500;border:1px solid #d4d4d8;background:#fff;border-radius:999px;cursor:pointer;line-height:1.2;';
    var chipActiveStyle = chipStyle + 'background:#1e3a5f;color:#fff;border-color:#1e3a5f;font-weight:600;';
    var modeStyle = 'flex:1;margin:0 4px;padding:8px 6px;font-size:12px;font-weight:600;border:1px solid #d4d4d8;background:#fff;border-radius:8px;cursor:pointer;text-align:center;';
    var modeActiveStyle = modeStyle + 'background:#1e3a5f;color:#fff;border-color:#1e3a5f;';
    var rowGroupStyle = 'display:flex;flex-wrap:wrap;margin-bottom:10px;';
    var modeRowStyle = 'display:flex;margin-bottom:10px;';

    dlg.innerHTML = '<div class="aq-crd-head"><b>Çapraz Referans</b><button class="aq-crd-x">✕</button></div>'+
      '<div class="aq-crd-controls">'+
        '<div class="aq-crd-search" style="margin-bottom:10px;"><input type="text" placeholder="Ara..." id="aq-crd-q" autocomplete="off" style="width:100%;padding:8px 10px;border:1px solid #d4d4d8;border-radius:8px;font-size:13px;"/></div>'+
        '<div class="aq-crd-filter" id="aq-crd-filter" style="'+rowGroupStyle+'">'+
          '<button type="button" class="aq-crd-chip active" data-filter="all" style="'+chipActiveStyle+'">Tümü</button>'+
          '<button type="button" class="aq-crd-chip" data-filter="heading" style="'+chipStyle+'">Başlık</button>'+
          '<button type="button" class="aq-crd-chip" data-filter="table" style="'+chipStyle+'">Tablo</button>'+
          '<button type="button" class="aq-crd-chip" data-filter="figure" style="'+chipStyle+'">Şekil</button>'+
          '<button type="button" class="aq-crd-chip" data-filter="footnote" style="'+chipStyle+'">Dipnot</button>'+
          '<button type="button" class="aq-crd-chip" data-filter="endnote" style="'+chipStyle+'">Sonnot</button>'+
        '</div>'+
        '<div class="aq-crd-mode" id="aq-crd-mode" style="'+modeRowStyle+'">'+
          '<button type="button" class="aq-crd-chip active" data-mode="context" style="'+modeActiveStyle+'">bkz. Tablo 1</button>'+
          '<button type="button" class="aq-crd-chip" data-mode="label" style="'+modeStyle+'">Tablo 1</button>'+
          '<button type="button" class="aq-crd-chip" data-mode="number" style="'+modeStyle+'">1</button>'+
        '</div>'+
      '</div>'+
      '<div class="aq-crd-body" id="aq-crd-body" style="max-height:340px;overflow:auto;border-top:1px solid #e4e4e7;padding-top:8px;">'+rows+'</div>';
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
    var queryInput=document.getElementById('aq-crd-q');
    var activeFilter='all';
    var activeMode='context';
    function renderRows(){
      var q=(queryInput&&queryInput.value?queryInput.value:'').toLowerCase();
      dlg.querySelectorAll('.aq-crd-row').forEach(function(row){
        var i=parseInt(row.getAttribute('data-i'),10);
        var target=targets[i]||null;
        var hay=((target&&target.label)||'')+' '+((target&&target.title)||'');
        var matchesQuery=hay.toLowerCase().indexOf(q)>=0;
        var matchesType=activeFilter==='all'||(target&&target.type===activeFilter);
        row.style.display=(matchesQuery&&matchesType)?'':'none';
      });
    }
    queryInput.addEventListener('input', renderRows);
    dlg.querySelectorAll('#aq-crd-filter .aq-crd-chip').forEach(function(btn){
      btn.addEventListener('click', function(){
        activeFilter=String(btn.getAttribute('data-filter')||'all');
        dlg.querySelectorAll('#aq-crd-filter .aq-crd-chip').forEach(function(chip){
          var on = chip===btn;
          chip.classList.toggle('active', on);
          // Mirror state via inline style too so chip activation is
          // visible even when the legacy aq-crd-chip.active CSS rule is
          // missing from the page (Tailwind purge, shell mismatch).
          chip.setAttribute('style', on ? chipActiveStyle : chipStyle);
        });
        renderRows();
      });
    });
    dlg.querySelectorAll('#aq-crd-mode .aq-crd-chip').forEach(function(btn){
      btn.addEventListener('click', function(){
        activeMode=String(btn.getAttribute('data-mode')||'context');
        dlg.querySelectorAll('#aq-crd-mode .aq-crd-chip').forEach(function(chip){
          var on = chip===btn;
          chip.classList.toggle('active', on);
          chip.setAttribute('style', on ? modeActiveStyle : modeStyle);
        });
      });
    });
    dlg.querySelectorAll('.aq-crd-row').forEach(function(row){
      row.addEventListener('click', function(){
        var t = targets[parseInt(row.getAttribute('data-i'),10)];
        insertCrossRef(editor, t, activeMode);
        dlg.remove();
      });
    });
    renderRows();
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

  function runsText(runs){
    return (runs || []).map(function(run){ return String(run && run.text || ''); }).join('').trim();
  }

  function slugRef(text){
    return String(text || '')
      .toLowerCase()
      .replace(/[^\w\u00c0-\u024f\u0400-\u04ff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 42) || 'ref';
  }

  function ensureAQEngineCrossRefIds(editor){
    if(!isAQEngineEditor(editor)) return [];
    var docModel = editor._docModel;
    var doc = docModel.get();
    var blocks = (doc.blocks || []).map(function(block){
      return Object.assign({}, block, {
        attrs: block.attrs ? Object.assign({}, block.attrs) : {},
        runs: (block.runs || []).map(function(run){
          return Object.assign({}, run, {
            citation: run.citation ? Object.assign({}, run.citation) : null,
            footnote: run.footnote ? Object.assign({}, run.footnote) : null,
            crossRef: run.crossRef ? Object.assign({}, run.crossRef) : null,
            font: run.font ? Object.assign({}, run.font) : null
          });
        })
      });
    });
    var changed = false;
    blocks.forEach(function(block, index){
      var text = runsText(block.runs);
      var prefix = block.type === 'table' ? 'tbl' : (block.type === 'image' ? 'fig' : 'hd');
      if(block.type !== 'heading' && block.type !== 'table' && block.type !== 'image') return;
      if(block._isBibHeading || block._isAppendixHeading) return;
      var semantic = text.toLocaleLowerCase ? text.toLocaleLowerCase('tr-TR') : text.toLowerCase();
      if(/^(kaynakça|içindekiler|ek-\d+)/i.test(semantic)) return;
      if(!block.attrs.refId && !block._refId){
        block.attrs.refId = prefix + '-' + (index + 1) + '-' + slugRef(text || prefix);
        changed = true;
      }
    });
    if(changed){
      docModel.replace(blocks);
      if(typeof editor._reflow === 'function') editor._reflow();
    }
    return docModel.get().blocks || [];
  }

  function collectAQEngineCrossRefTargets(editor){
    if(!isAQEngineEditor(editor)) return [];
    var blocks = ensureAQEngineCrossRefIds(editor);
    var targets = [];
    var tableN = 1, figureN = 1, fnN = 1, enN = 1;
    blocks.forEach(function(block){
      if(!block) return;
      var text = runsText(block.runs);
      if(block.type === 'heading' && !block._isBibHeading && !block._isAppendixHeading){
        var semantic = text.toLocaleLowerCase ? text.toLocaleLowerCase('tr-TR') : text.toLowerCase();
        if(text && !/^(kaynakça|içindekiler|ek-\d+)/i.test(semantic)){
          var level = Math.max(1, Math.min(5, parseInt(block.level, 10) || 1));
          targets.push({ type:'heading', id:(block.attrs && block.attrs.refId) || block._refId || uid('hd'), label:Array(level).join('  ') + text });
        }
      }else if(block.type === 'table'){
        targets.push({ type:'table', id:(block.attrs && block.attrs.refId) || block._refId || uid('tbl'), label:'Tablo ' + tableN++ });
      }else if(block.type === 'image'){
        targets.push({ type:'figure', id:(block.attrs && block.attrs.refId) || block._refId || uid('fig'), label:'Şekil ' + figureN++ + (block.alt ? ': ' + block.alt : '') });
      }
      (block.runs || []).forEach(function(run){
        if(!run || !run.footnote || !run.footnote.fnId) return;
        var type = run.footnote.fnType === 'endnote' ? 'endnote' : 'footnote';
        targets.push({ type:type, id:run.footnote.fnId, label:(type === 'endnote' ? 'Sonnot ' + enN++ : 'Dipnot ' + fnN++) });
      });
    });
    return targets;
  }

  function collectCrossRefTargets(){
    var activeEditor = getActiveEditor();
    if(isAQEngineEditor(activeEditor)){
      var aqTargets = collectAQEngineCrossRefTargets(activeEditor);
      if(aqTargets.length) return aqTargets;
    }
    if(root.AQAcademicObjects && typeof root.AQAcademicObjects.collectTargets === 'function'){
      try{
        var academicTargets = root.AQAcademicObjects.collectTargets({
          root: document.getElementById('apaed')
        });
        if(Array.isArray(academicTargets) && academicTargets.length) return academicTargets;
      }catch(_e){}
    }
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
    host.querySelectorAll('sup.fn-ref[data-fn-type="footnote"],.aq-fn-ref[data-fn-type="footnote"]').forEach(function(sup){
      var id = sup.getAttribute('data-fn-id');
      targets.push({ type:'footnote', id:id, label:'Dipnot '+fnN2++ });
    });
    return targets;
  }

  function ensureElId(el, prefix){
    if(!el.id) el.id = uid(prefix);
    return el.id;
  }

  function insertCrossRef(editor, target, mode){
    var label = target && target.label ? String(target.label).trim() : '';
    var text = root.AQAcademicObjects && typeof root.AQAcademicObjects.buildCrossRefText === 'function'
      ? root.AQAcademicObjects.buildCrossRefText(target || label, { mode: mode || 'context' })
      : ((mode === 'label' ? label : ('bkz. ' + label)) || 'bkz.');
    if(isAQEngineEditor(editor)){
      var docModel = editor._docModel;
      var range = editor.state && editor.state.selection
        ? editor.state.selection
        : { from: docModel.length(), to: docModel.length() };
      var from = Math.min(Number(range.from || 0), Number(range.to || range.from || 0));
      var to = Math.max(Number(range.from || 0), Number(range.to || range.from || 0));
      if(from !== to) docModel.deleteRange(from, to);
      docModel.insertText(from, text);
      docModel.applyMark(from, from + text.length, 'crossRef', {
        refType: target.type || 'heading',
        refId: target.id || '',
        refLabel: label,
        display: mode || 'context'
      });
      docModel.applyMark(from, from + text.length, 'href', '#' + (target.id || ''));
      docModel.applyMark(from, from + text.length, 'color', '#1a0dab');
      if(typeof editor._reflow === 'function') editor._reflow();
      if(editor.commands && typeof editor.commands.focus === 'function') editor.commands.focus(from + text.length);
      if(typeof editor.emit === 'function') editor.emit('update');
      scheduleSync();
      return;
    }
    // Use mark if available
    if(editor.chain && editor.schema && editor.schema.marks && editor.schema.marks.crossRef){
      editor.chain().focus()
        .insertContent(
          '<a class="cross-ref" data-ref-type="'+escA(target.type)+'" data-ref-id="'+escA(target.id)+'" data-ref-label="'+escA(label)+'" data-ref-display="'+escA(mode||'context')+'">'+escH(text)+'</a>'
        ).run();
    } else {
      editor.chain().focus().insertContent(
        '<a class="cross-ref" data-ref-type="'+escA(target.type)+'" data-ref-id="'+escA(target.id)+'" data-ref-label="'+escA(label)+'" data-ref-display="'+escA(mode||'context')+'">'+escH(text)+'</a>'
      ).run();
    }
    if(root.AQAcademicObjects && typeof root.AQAcademicObjects.syncCrossRefLabels === 'function'){
      try{
        root.AQAcademicObjects.syncCrossRefLabels({
          root: document.getElementById('apaed')
        });
      }catch(_e){}
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

  function getAQEngineLayout(editor){
    if(editor && editor._aqLayout) return editor._aqLayout;
    return null;
  }

  function styleAQPageFootnotePanel(panel, layout, itemCount){
    var linePx = 20;
    var height = Math.max(42, Math.min(130, 18 + (itemCount || 1) * linePx));
    var bottom = Math.max(18, (layout && layout.marginTopPx ? layout.marginTopPx : 96) * 0.35);
    panel.className = 'aq-page-fn-panel';
    panel.style.position = 'absolute';
    panel.style.left = ((layout && layout.marginLeftPx) || 96) + 'px';
    panel.style.width = ((layout && layout.contentWidthPx) || 600) + 'px';
    panel.style.top = (((layout && layout.pageHeightPx) || 1123) - bottom - height) + 'px';
    panel.style.minHeight = height + 'px';
    panel.style.boxSizing = 'border-box';
    panel.style.fontFamily = '"Times New Roman", Times, serif';
    panel.style.fontSize = '10pt';
    panel.style.lineHeight = '1.5';
    panel.style.color = '#000';
    panel.style.background = '#fff';
    panel.style.zIndex = '18';
  }

  function styleAQPageFootnoteItem(item){
    if(!item) return;
    item.style.display = 'flex';
    item.style.alignItems = 'baseline';
    item.style.gap = '0';
    item.style.marginBottom = '0';
    item.style.lineHeight = '1.5';
    var num = item.querySelector('.fn-num');
    if(num){
      num.style.fontSize = '10pt';
      num.style.display = 'inline';
      num.style.flexShrink = '0';
    }
    var ta = item.querySelector('.fn-inp');
    if(ta){
      ta.style.flex = '1';
      ta.style.minHeight = '1.5em';
      ta.style.resize = 'none';
      ta.style.border = 'none';
      ta.style.padding = '0';
      ta.style.background = 'transparent';
      ta.style.color = '#000';
      ta.style.fontFamily = '"Times New Roman", Times, serif';
      ta.style.fontSize = '10pt';
      ta.style.lineHeight = '1.5';
      ta.style.outline = 'none';
      ta.style.overflow = 'hidden';
    }
    var del = item.querySelector('.fn-del-btn');
    if(del){
      del.style.background = 'none';
      del.style.border = 'none';
      del.style.color = 'rgba(120,120,120,.55)';
      del.style.cursor = 'pointer';
      del.style.fontSize = '11px';
      del.style.padding = '0 4px';
    }
  }

  function renderAQEngineFootnotePanels(editor){
    if(!isAQEngineEditor(editor)) return false;
    var stage = editor._stageEl || document.querySelector('.aq-engine-root');
    if(!stage) return false;
    stage.querySelectorAll('.aq-page-fn-panel').forEach(function(node){ node.remove(); });
    var layout = getAQEngineLayout(editor) || {};
    var pageMap = {};
    stage.querySelectorAll('.aq-engine-page').forEach(function(pageEl){
      var pageIndex = parseInt(pageEl.getAttribute('data-page-index') || pageEl.dataset.pageIndex || '0', 10) || 0;
      pageEl.querySelectorAll('.aq-fn-ref').forEach(function(refEl){
        var id = refEl.getAttribute('data-fn-id') || '';
        if(!id) return;
        var type = refEl.getAttribute('data-fn-type') || 'footnote';
        if(type === 'endnote') return;
        if(!pageMap[pageIndex]) pageMap[pageIndex] = { pageEl: pageEl, items: [] };
        if(!pageMap[pageIndex].items.some(function(item){ return item.id === id; })){
          pageMap[pageIndex].items.push({ id: id, type: type, n: parseInt(refEl.textContent || '0', 10) || (pageMap[pageIndex].items.length + 1) });
        }
      });
    });
    Object.keys(pageMap).forEach(function(key){
      var group = pageMap[key];
      var panel = document.createElement('div');
      styleAQPageFootnotePanel(panel, layout, group.items.length);
      var sep = document.createElement('hr');
      sep.className = 'fn-sep';
      sep.style.width = '2in';
      sep.style.border = 'none';
      sep.style.borderTop = '1px solid #000';
      sep.style.margin = '0 0 2px 0';
      panel.appendChild(sep);
      var sec = document.createElement('div');
      sec.className = 'fn-sec';
      group.items.forEach(function(entry){
        var item = buildFnItem(entry, false);
        styleAQPageFootnoteItem(item);
        sec.appendChild(item);
      });
      panel.appendChild(sec);
      group.pageEl.appendChild(panel);
      group.items.forEach(function(entry){
        if(entry._ta) autoResizeTa(entry._ta);
      });
    });
    return true;
  }

  function renderFootnotePanel(){
    var panel = document.getElementById('fn-panel');
    var activeEditor = getActiveEditor();
    if(isAQEngineEditor(activeEditor)){
      renderAQEngineFootnotePanels(activeEditor);
      if(panel) panel.style.display = 'none';
      return;
    }
    if(!panel) return;
    var host = document.getElementById('apaed');
    if(!host){ panel.style.display='none'; return; }

    var fns=[], ens=[];
    var fnN=1, enN=1;
    host.querySelectorAll('sup.fn-ref,.aq-fn-ref').forEach(function(sup){
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
    var editor = getActiveEditor();
    if(!editor) return;
    if(isAQEngineEditor(editor)){
      var doc = editor._docModel.get();
      var offset = 0;
      var found = false;
      (doc.blocks || []).some(function(block, blockIndex){
        var runs = block.runs || [];
        for(var i = 0; i < runs.length; i++){
          var run = runs[i] || {};
          var len = String(run.text || '').length;
          if(run.footnote && run.footnote.fnId === fnId){
            editor._docModel.deleteRange(offset, offset + Math.max(1, len));
            found = true;
            return true;
          }
          offset += len;
        }
        if(blockIndex < (doc.blocks || []).length - 1) offset += 1;
        return false;
      });
      if(found){
        removeFootnoteEntry(fnId);
        syncAQEngineFootnoteNumbers(editor);
        if(typeof editor._reflow === 'function') editor._reflow();
        if(typeof editor.emit === 'function') editor.emit('update');
        scheduleSync();
      }
      return;
    }
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
    var sup = document.querySelector('sup.fn-ref[data-fn-id="'+fnId+'"],.aq-fn-ref[data-fn-id="'+fnId+'"]');
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
    if(host && !host.__aqFootnoteEventsBound){
      host.__aqFootnoteEventsBound = true;
      host.addEventListener('click', function(e){
        var sup = e.target.closest('sup.fn-ref,.aq-fn-ref');
        if(sup){ e.preventDefault(); jumpToFootnote(sup.getAttribute('data-fn-id')); return; }
        var cr = e.target.closest('a.cross-ref');
        if(cr){ e.preventDefault(); jumpToCrossRefTarget(cr.getAttribute('data-ref-id')); }
      });
    }
    bindToolbarEvents();
  }

  function bindToolbarEvents(){
    if(toolbarBound || !document || !document.addEventListener) return;
    toolbarBound = true;
    document.addEventListener('click', function(e){
      var target = e && e.target && e.target.closest ? e.target.closest('#btnFootnote,#btnEndnote,#btnCrossRef') : null;
      if(!target) return;
      if(target.id === 'btnFootnote'){
        e.preventDefault();
        e.stopPropagation();
        insertFootnote('footnote');
      }else if(target.id === 'btnEndnote'){
        e.preventDefault();
        e.stopPropagation();
        insertFootnote('endnote');
      }else if(target.id === 'btnCrossRef'){
        e.preventDefault();
        e.stopPropagation();
        showCrossRefDialog();
      }
    }, true);
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
    host.querySelectorAll('sup.fn-ref,.aq-fn-ref').forEach(function(sup){
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
    collectCrossRefTargets: collectCrossRefTargets,
    insertCrossRef: insertCrossRef,
    syncFootnoteNumbers: syncFootnoteNumbers,
    renderFootnotePanel: renderFootnotePanel,
    hookGetHTML: hookGetHTML,
    hookSetHTML: hookSetHTML,
    injectFootnotesIntoExportHTML: injectFootnotesIntoExportHTML,
    init: init
  };

})(typeof window !== 'undefined' ? window : globalThis);
