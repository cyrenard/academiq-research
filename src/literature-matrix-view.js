(function(){
  var currentView = 'writing';
  var bound = false;
  var saveTimer = 0;
  var autoFillPassByWorkspace = {};
  var autoSeedPassByWorkspace = {};
  var autoSeedStatusTokenByWorkspace = {};
  var localAssistantPassByWorkspace = {};
  var matrixFullscreen = false;
  var onlineAbstractCache = {};

  // Fetch abstract from online APIs (Semantic Scholar + OpenAlex)
  function fetchOnlineAbstract(doi){
    if(!doi) return Promise.resolve('');
    var clean = String(doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim();
    if(!clean) return Promise.resolve('');
    var cacheKey = clean.toLowerCase();
    if(onlineAbstractCache[cacheKey] !== undefined) return Promise.resolve(onlineAbstractCache[cacheKey]);

    var fetcher = (typeof window.__aqNetFetchJSON === 'function')
      ? window.__aqNetFetchJSON
      : function(url, ms){ return fetch(url).then(function(r){ return r.ok ? r.json() : null; }); };

    var s2 = fetcher('https://api.semanticscholar.org/graph/v1/paper/DOI:' + encodeURIComponent(clean) + '?fields=abstract,tldr', 7000)
      .then(function(data){
        if(!data) return '';
        var parts = [];
        if(data.abstract) parts.push(data.abstract);
        if(data.tldr && data.tldr.text) parts.push('TLDR: ' + data.tldr.text);
        return parts.join('\n');
      }).catch(function(){ return ''; });

    var oa = fetcher('https://api.openalex.org/works/doi:' + encodeURIComponent(clean), 7000)
      .then(function(data){
        if(!data) return '';
        // OpenAlex has inverted abstract — reconstruct
        if(data.abstract_inverted_index && typeof data.abstract_inverted_index === 'object'){
          var pairs = [];
          Object.keys(data.abstract_inverted_index).forEach(function(word){
            var positions = data.abstract_inverted_index[word];
            if(Array.isArray(positions)){
              positions.forEach(function(pos){ pairs.push({ pos: pos, word: word }); });
            }
          });
          pairs.sort(function(a, b){ return a.pos - b.pos; });
          return pairs.map(function(p){ return p.word; }).join(' ');
        }
        return '';
      }).catch(function(){ return ''; });

    return Promise.all([s2, oa]).then(function(results){
      var combined = results.filter(Boolean).join('\n');
      onlineAbstractCache[cacheKey] = combined;
      return combined;
    });
  }

  function escHTML(value){
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function text(value){
    return String(value == null ? '' : value).trim();
  }

  function state(){
    return window.S || null;
  }

  function getMatrixApi(){
    return window.AQLiteratureMatrixState || null;
  }

  function getFilterApi(){
    return window.AQLiteratureMatrixFilters || null;
  }

  function getCurrentWorkspaceId(){
    return state() && state().cur ? state().cur : '';
  }

  function getCurrentWorkspace(){
    var st = state();
    if(!st || !Array.isArray(st.wss)) return null;
    var wsId = getCurrentWorkspaceId();
    return st.wss.find(function(ws){ return ws && ws.id === wsId; }) || null;
  }

  function getWorkspaceReferences(){
    var ws = getCurrentWorkspace();
    return ws && Array.isArray(ws.lib) ? ws.lib : [];
  }

  function getMatrixFilterState(wsId){
    var api = getFilterApi();
    var st = state();
    var safeWsId = text(wsId || getCurrentWorkspaceId());
    var bucket = st && st.literatureMatrixFilters && typeof st.literatureMatrixFilters === 'object'
      ? st.literatureMatrixFilters
      : {};
    var raw = safeWsId && bucket[safeWsId] ? bucket[safeWsId] : {};
    return api && typeof api.normalizeMatrixFilterState === 'function'
      ? api.normalizeMatrixFilterState(raw)
      : { search: getMatrixSearchQuery(), sort: { key: 'year', direction: 'desc' } };
  }

  function setMatrixFilterState(nextState){
    var api = getFilterApi();
    var st = state();
    var wsId = getCurrentWorkspaceId();
    if(!(api && st && wsId)) return null;
    if(!st.literatureMatrixFilters || typeof st.literatureMatrixFilters !== 'object'){
      st.literatureMatrixFilters = {};
    }
    st.literatureMatrixFilters[wsId] = api.normalizeMatrixFilterState(nextState);
    saveSoon();
    return st.literatureMatrixFilters[wsId];
  }

  function getTopMatrixButton(){
    return document.getElementById('tbMatrixBtn');
  }

  function getEditorToolbarMatrixHost(){
    var pageOne = document.querySelector('#etb .etb-page[data-page="1"]');
    if(!pageOne) return null;
    return pageOne.querySelector('.tbgrp-matrix');
  }

  function ensureMatrixFilterStyles(){
    if(document.getElementById('aq-matrix-filter-styles')) return;
    var style = document.createElement('style');
    style.id = 'aq-matrix-filter-styles';
    style.textContent = ''
      + '#matrixFilterPanel{border-bottom:1px solid rgba(153,171,182,.24);background:rgba(255,255,255,.58);padding:7px 10px}'
      + '.mx-filter-head{display:flex;align-items:center;gap:7px}'
      + '.mx-filter-toggle,.mx-filter-clear,.mx-filter-preset,.mx-filter-chip{border:1px solid rgba(153,171,182,.38);border-radius:8px;background:rgba(255,255,255,.9);color:#263746;font-family:var(--fm,system-ui);font-size:10px;font-weight:700;height:26px;padding:0 8px;cursor:pointer}'
      + '.mx-filter-toggle{background:#1f3a63;border-color:#1f3a63;color:#fff}.mx-filter-count{color:#617587;font-size:10px;font-weight:700}.mx-filter-clear{margin-left:auto}'
      + '.mx-filter-assistant{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(153,171,182,.36);border-radius:999px;background:transparent;color:#617587;font-family:var(--fm,system-ui);font-size:10px;font-weight:700;height:20px;line-height:18px;padding:0 8px;white-space:nowrap}.mx-filter-assistant::after{content:"";width:6px;height:6px;border-radius:999px;background:#c24135;box-shadow:0 0 0 2px rgba(194,65,53,.1)}.mx-filter-assistant.on{border-color:rgba(27,94,65,.34);background:transparent;color:#617587}.mx-filter-assistant.on::after{background:#168a4f;box-shadow:0 0 0 2px rgba(22,138,79,.1)}'
      + '.mx-filter-chips,.mx-filter-presets{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.mx-filter-chip{height:22px;border-radius:999px;background:#f6fbfd;color:#315873;font-family:var(--fm,system-ui);font-size:9px}'
      + '.mx-filter-empty{color:#8193a2;font-size:10px}.mx-filter-body{margin-top:7px;border:1px solid rgba(153,171,182,.28);border-radius:12px;background:rgba(251,250,247,.78);padding:8px}'
      + '.mx-filter-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:7px;margin-top:7px}.mx-filter-field{display:flex;flex-direction:column;gap:3px;min-width:0}'
      + '.mx-filter-field span{color:#789;font-family:var(--fm,system-ui);font-size:8px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}'
      + '.mx-filter-field input,.mx-filter-field select{min-width:0;border:1px solid rgba(153,171,182,.38);border-radius:8px;background:#fff;color:#263746;font-family:var(--fm,system-ui);font-size:10px;padding:5px 7px;outline:none}'
      + '.mx-filter-menu{position:relative;min-width:0}.mx-filter-menu summary{display:flex;align-items:center;justify-content:space-between;gap:8px;height:30px;border:1px solid rgba(153,171,182,.38);border-radius:8px;background:#fff;color:#263746;font-family:var(--fm,system-ui);font-size:10px;font-weight:700;padding:0 8px;cursor:pointer;list-style:none}.mx-filter-menu summary::-webkit-details-marker{display:none}'
      + '.mx-filter-menu summary span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mx-filter-menu summary b{color:#718497;font-size:9px;font-weight:800;white-space:nowrap}.mx-filter-menu-panel{position:absolute;z-index:55;top:calc(100% + 6px);left:0;right:0;max-height:230px;overflow:auto;border:1px solid rgba(153,171,182,.38);border-radius:10px;background:rgba(255,255,255,.98);box-shadow:0 18px 46px rgba(31,42,68,.16);padding:6px}.mx-filter-check{display:flex;align-items:center;gap:7px;border-radius:7px;padding:5px 6px;color:#263746;font-family:var(--fm,system-ui);font-size:10px;line-height:1.25}.mx-filter-check:hover{background:#f4f8fb}.mx-filter-check input{width:13px;height:13px;accent-color:#1f3a63}'
      + '#matrixExportBtn{border-color:rgba(95,124,147,.42);background:#fff;color:#244761}';
    (document.head || document.documentElement).appendChild(style);
  }

  function findReferenceInWorkspace(referenceId){
    var refId = text(referenceId);
    if(!refId) return null;
    return getWorkspaceReferences().find(function(ref){
      return String(ref && ref.id || '') === refId;
    }) || null;
  }

  function findAnyReference(referenceId){
    var refId = text(referenceId);
    if(!refId) return null;
    var st = state();
    if(!st || !Array.isArray(st.wss)) return null;
    for(var i = 0; i < st.wss.length; i += 1){
      var lib = Array.isArray(st.wss[i] && st.wss[i].lib) ? st.wss[i].lib : [];
      for(var j = 0; j < lib.length; j += 1){
        if(String(lib[j] && lib[j].id || '') === refId){
          return lib[j];
        }
      }
    }
    return null;
  }

  function findNotesByIds(noteIds){
    var ids = Array.isArray(noteIds) ? noteIds.map(text).filter(Boolean) : [];
    if(!ids.length) return [];
    var st = state();
    var notes = st && Array.isArray(st.notes) ? st.notes : [];
    return ids.map(function(noteId){
      return notes.find(function(note){ return String(note && note.id || '') === noteId; }) || null;
    }).filter(Boolean);
  }

  function parsePageNumber(value){
    var raw = String(value || '').trim();
    if(!raw) return 0;
    var hit = raw.match(/\d+/);
    var page = hit ? parseInt(hit[0], 10) : 0;
    return Number.isFinite(page) && page > 0 ? page : 0;
  }

  function waitForPdfReady(referenceId, timeoutMs){
    var refId = text(referenceId);
    var timeout = Number(timeoutMs || 2800);
    var started = Date.now();
    return new Promise(function(resolve){
      (function tick(){
        var activeRefId = text(window.curRef && window.curRef.id);
        var ready = Number(window.pdfTotal || 0) > 0;
        if((!refId || activeRefId === refId) && ready){
          resolve(true);
          return;
        }
        if(Date.now() - started >= timeout){
          resolve(false);
          return;
        }
        setTimeout(tick, 120);
      })();
    });
  }

  function ensurePdfSearchBarOpen(){
    var bar = document.getElementById('pdfsearchbar');
    var isOpen = !!(bar && bar.classList && bar.classList.contains('open'));
    if(!isOpen && typeof window.togglePdfSearch === 'function'){
      try{ window.togglePdfSearch(); }catch(_e){}
    }
  }

  function goToPdfPage(page){
    var target = parseInt(page, 10);
    if(!target || target < 1) return false;
    if(typeof window.scrollToPage !== 'function') return false;
    try{
      window.pdfPg = target;
      window.scrollToPage(target);
      if(typeof window.updPgLabel === 'function'){
        window.updPgLabel();
      }
      return true;
    }catch(_e){
      return false;
    }
  }

  async function preloadPdfForReference(ref){
    var item = ref && typeof ref === 'object' ? ref : null;
    if(!item) return false;
    if(item.pdfData) return true;
    if(window.electronAPI && typeof window.electronAPI.loadPDF === 'function' && item.id){
      try{
        var loaded = await window.electronAPI.loadPDF(item.id);
        if(loaded && loaded.ok && loaded.buffer){
          item.pdfData = loaded.buffer;
          return true;
        }
      }catch(_e){}
    }
    return !!item.pdfUrl;
  }

  function buildCellSearchQuery(cell){
    var source = cell && typeof cell === 'object' ? cell : {};
    var raw = text(source.searchText || (source.source && source.source.snippet) || source.text || '');
    if(!raw) return '';
    raw = raw.replace(/\s+/g, ' ').trim();
    if(raw.length < 5) return '';
    // Return full text — findBestMatchInPdf will handle finding the right fragment
    return raw;
  }

  // Search pdfTextCache directly for the best matching page and short query
  function findBestMatchInPdf(cellText){
    var cache = window.pdfTextCache;
    if(!cache || typeof cache !== 'object') return null;
    var hay = String(cellText || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if(!hay) return null;
    // Generate candidate phrases: sliding window of 3-5 words
    var words = hay.split(' ').filter(function(w){ return w.length > 0; });
    var candidates = [];
    var sizes = [5, 4, 3];
    for(var si = 0; si < sizes.length; si++){
      var sz = sizes[si];
      if(words.length < sz) continue;
      for(var i = 0; i <= words.length - sz; i++){
        candidates.push(words.slice(i, i + sz).join(' '));
      }
      if(candidates.length > 0) break; // use the largest window size that produces candidates
    }
    if(!candidates.length && words.length >= 2){
      candidates.push(words.slice(0, Math.min(3, words.length)).join(' '));
    }
    if(!candidates.length) return null;
    var keys = Object.keys(cache).map(Number).sort(function(a,b){return a-b;});
    // Try each candidate against each page
    for(var ci = 0; ci < candidates.length; ci++){
      var q = candidates[ci];
      for(var ki = 0; ki < keys.length; ki++){
        var pgNum = keys[ki];
        var items = cache[pgNum] || [];
        var pageText = items.map(function(it){return it.str;}).join(' ').toLowerCase();
        if(pageText.indexOf(q) >= 0){
          return { page: pgNum, query: q };
        }
      }
    }
    return null;
  }

  function cellHasPdfContext(cell){
    if(!cell || typeof cell !== 'object') return false;
    var noteIds = Array.isArray(cell.noteIds) ? cell.noteIds : [];
    var source = cell.source && typeof cell.source === 'object' ? cell.source : null;
    if(noteIds.length) return true;
    if(source && (text(source.page) || text(source.snippet))) return true;
    return !!text(cell.text);
  }

  function pickRowContextColumn(row, api, preferredColumnKey){
    if(!(row && row.cells && api)) return 'purpose';
    var preferred = text(preferredColumnKey);
    if(preferred && api.EDITABLE_COLUMN_KEYS.indexOf(preferred) >= 0){
      return preferred;
    }
    for(var i = 0; i < api.EDITABLE_COLUMN_KEYS.length; i += 1){
      var columnKey = api.EDITABLE_COLUMN_KEYS[i];
      if(cellHasPdfContext(row.cells[columnKey])) return columnKey;
    }
    return api.EDITABLE_COLUMN_KEYS[0] || 'purpose';
  }

  async function jumpToCellContext(referenceId, row, columnKey){
    var api = getMatrixApi();
    var st = state();
    var wsId = getCurrentWorkspaceId();
    if(!(api && st && wsId && row)) return;
    var ref = findReferenceInWorkspace(referenceId);
    if(!ref){
      status('Bu kaynak aktif workspace icinde degil.', 'er');
      return;
    }
    // Exit matrix fullscreen so PDF panel is visible
    if(matrixFullscreen) setMatrixFullscreen(false);
    // Ensure PDF panel is open
    var pdfPanel = document.getElementById('pdfpanel');
    if(pdfPanel){
      pdfPanel.classList.add('open');
      pdfPanel.classList.remove('fullscreen');
      pdfPanel.style.zIndex = '980';
    }
    var activeRefId = text(window.curRef && window.curRef.id);
    var readyNow = Number(window.pdfTotal || 0) > 0;
    if(activeRefId !== ref.id || !readyNow){
      var openedViaRef = false;
      if(typeof window.openRef === 'function'){
        try{
          await Promise.resolve(window.openRef(ref.id));
          openedViaRef = true;
        }catch(_e){}
      }
      if(!openedViaRef){
        var canOpenPdf = await preloadPdfForReference(ref);
        if(!canOpenPdf){
          status('Bu kaynakta acilabilir PDF bulunamadi.', 'er');
          return;
        }
        if(typeof window.__aqOpenPdfBuffer === 'function' && ref.pdfData){
          try{
            window.__aqOpenPdfBuffer({
              refId: ref.id,
              title: String(ref.title || ref.doi || 'PDF'),
              pdfData: ref.pdfData,
              workspaceId: wsId
            });
          }catch(_e){}
        }else if(typeof window.openRef === 'function'){
          try{ await Promise.resolve(window.openRef(ref.id)); }catch(_e){}
        }
      }
    }
    var readyAfterOpen = await waitForPdfReady(ref.id, 3200);
    if(!readyAfterOpen){
      status('PDF hazir degil, once kaynagi acin.', 'er');
      return;
    }
    // Pre-cache all PDF page text so findBestMatchInPdf can search
    if(typeof window.extractPdfFullTextForRef === 'function'){
      try{ await Promise.resolve(window.extractPdfFullTextForRef(ref.id)); }catch(_e){}
    }

    var cell = row.cells && row.cells[columnKey] ? row.cells[columnKey] : null;
    var noteIds = api.getCellLinkedNoteIds(st, wsId, row.id, columnKey);
    var linkedNotes = findNotesByIds(noteIds);
    var page = 0;
    for(var i = 0; i < linkedNotes.length; i += 1){
      page = parsePageNumber(linkedNotes[i].sourcePage || linkedNotes[i].tag);
      if(page > 0) break;
    }
    if(!page && cell && cell.source && cell.source.page){
      page = parsePageNumber(cell.source.page);
    }
    if(page > 0 && goToPdfPage(page)){
      status('Makalede ilgili sayfaya gidildi.', 'ok');
      return;
    }

    var cellFullText = buildCellSearchQuery(cell);
    if(!cellFullText){
      status('Bu hucrede PDF icinde aranacak baglam yok.', 'er');
      return;
    }

    // Try direct match in PDF text cache first
    var directMatch = findBestMatchInPdf(cellFullText);
    if(directMatch && directMatch.page > 0){
      goToPdfPage(directMatch.page);
      // Also run search to highlight the match
      ensurePdfSearchBarOpen();
      var inp = document.getElementById('pdfsearchinp');
      if(inp) inp.value = directMatch.query;
      if(typeof window.pdfSearchExec === 'function'){
        try{ await Promise.resolve(window.pdfSearchExec()); }catch(_e){}
      }
      status('Makalede ilgili bolum bulundu.', 'ok');
      return;
    }

    // Fallback: use first few words as search
    var fallbackWords = cellFullText.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    var fallbackQuery = fallbackWords.slice(0, 5).join(' ');
    if(fallbackQuery.length < 5){
      status('PDF icinde eslesen bolum bulunamadi.', 'er');
      return;
    }
    ensurePdfSearchBarOpen();
    var inp2 = document.getElementById('pdfsearchinp');
    if(inp2) inp2.value = fallbackQuery;
    if(typeof window.pdfSearchExec === 'function'){
      try{ await Promise.resolve(window.pdfSearchExec()); }catch(_e){}
      status('Makalede ilgili bolum araniyor.', 'ok');
    }
  }

  function status(message, cls){
    if(typeof window.setDst !== 'function') return;
    try{
      window.setDst(message || '', cls || '');
      if(message){
        setTimeout(function(){
          try{ window.setDst('', ''); }catch(_e){}
        }, 2200);
      }
    }catch(_e){}
  }

  function saveSoon(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function(){
      saveTimer = 0;
      if(typeof window.save === 'function'){
        try{ window.save(); }catch(_e){}
      }
    }, 180);
  }

  function ensureMatrixWorkspaceState(){
    var api = getMatrixApi();
    var st = state();
    var wsId = getCurrentWorkspaceId();
    if(!(api && st && wsId)) return null;
    return api.ensureWorkspaceMatrix(st, wsId);
  }

  function getAuthorYear(ref){
    if(!ref) return 'Kaynak silinmis';
    if(typeof window.shortRef === 'function'){
      try{
        var out = window.shortRef(ref);
        if(out) return String(out);
      }catch(_e){}
    }
    var authors = Array.isArray(ref.authors) ? ref.authors.filter(Boolean) : [];
    var lead = '';
    if(authors.length){
      var first = String(authors[0] || '').trim();
      if(first.indexOf(',') >= 0){
        lead = first.split(',')[0].trim();
      }else{
        var parts = first.split(/\s+/).filter(Boolean);
        lead = parts.length ? parts[parts.length - 1] : '';
      }
      if(authors.length > 1) lead += ' vd.';
    }
    if(!lead) lead = 'Bilinmeyen';
    return lead + ' (' + (ref.year || 't.y.') + ')';
  }

  function ensureNotesHint(){
    var host = document.getElementById('rpnotes');
    var list = document.getElementById('notelist');
    if(!host || !list) return null;
    var hint = document.getElementById('matrixNoteContextHint');
    if(!hint){
      hint = document.createElement('div');
      hint.id = 'matrixNoteContextHint';
      hint.className = 'matrix-note-context';
      host.insertBefore(hint, list);
    }
    return hint;
  }

  function setNotesHint(message){
    var hint = ensureNotesHint();
    if(!hint) return;
    if(message){
      hint.textContent = message;
      hint.classList.remove('aq-hidden');
    }else{
      hint.classList.add('aq-hidden');
      hint.textContent = '';
    }
  }

  function ensureNotesPanelOpen(){
    if(typeof window.swR !== 'function') return;
    try{
      var btn = document.getElementById('rtypeNotesBtn') || null;
      window.swR('notes', btn);
    }catch(_e){}
  }

  function markMatrixLinkedNotes(noteIds){
    var list = document.getElementById('notelist');
    if(!list) return 0;
    list.querySelectorAll('.nc.note-matrix-linked').forEach(function(card){
      card.classList.remove('note-matrix-linked');
    });
    var matched = 0;
    noteIds.forEach(function(noteId){
      var card = list.querySelector('.nc[data-note-id="' + String(noteId).replace(/"/g, '\\"') + '"]');
      if(card){
        card.classList.add('note-matrix-linked');
        matched += 1;
      }
    });
    return matched;
  }

  function syncRightPanelWithLinkedNotes(noteIds){
    var ids = Array.isArray(noteIds) ? noteIds.filter(Boolean) : [];
    ensureNotesPanelOpen();
    if(typeof window.rNotes === 'function'){
      try{ window.rNotes(); }catch(_e){}
    }
    if(!ids.length){
      if(window.AQNotes && typeof window.AQNotes.clearLinkedNoteHighlight === 'function'){
        try{ window.AQNotes.clearLinkedNoteHighlight(); }catch(_e){}
      }
      setNotesHint('Bu hucreye bagli not yok.');
      setTimeout(function(){ markMatrixLinkedNotes([]); }, 0);
      return;
    }
    setNotesHint('');
    if(window.AQNotes && typeof window.AQNotes.focusLinkedNoteById === 'function'){
      try{
        window.AQNotes.focusLinkedNoteById(ids[0], {
          scrollIntoView: true,
          behavior: 'auto',
          silentMissing: true,
          clearWhenMissing: false
        });
      }catch(_e){}
    }
    setTimeout(function(){
      var matched = markMatrixLinkedNotes(ids);
      if(!matched){
        setNotesHint('Bagli not bulunamadi (silinmis olabilir).');
      }
    }, 0);
  }

  function collectRowLinkedNoteIds(row){
    var api = getMatrixApi();
    if(!(api && row && row.cells)) return [];
    var out = [];
    api.EDITABLE_COLUMN_KEYS.forEach(function(columnKey){
      var cell = row.cells[columnKey] || {};
      var noteIds = Array.isArray(cell.noteIds) ? cell.noteIds : [];
      noteIds.forEach(function(noteId){
        var id = text(noteId);
        if(id && out.indexOf(id) < 0) out.push(id);
      });
    });
    return out;
  }

  function getSelectedCellFromState(){
    var api = getMatrixApi();
    var st = state();
    if(!(api && st)) return null;
    return api.getSelectedCell(st, getCurrentWorkspaceId());
  }

  function highlightSelectedCell(){
    var selected = getSelectedCellFromState();
    var table = document.getElementById('matrixTable');
    if(!table) return;
    table.querySelectorAll('.mx-cell.is-selected').forEach(function(cell){
      cell.classList.remove('is-selected');
    });
    if(!selected || !selected.rowId || !selected.columnKey) return;
    var selector = '.mx-cell[data-row-id="' + String(selected.rowId).replace(/"/g, '\\"') + '"][data-col-id="' + String(selected.columnKey).replace(/"/g, '\\"') + '"]';
    var target = table.querySelector(selector);
    if(target) target.classList.add('is-selected');
  }

  function setSelectedCell(rowId, columnKey){
    var api = getMatrixApi();
    var st = state();
    var wsId = getCurrentWorkspaceId();
    if(!(api && st && wsId)) return;
    api.setSelectedCell(st, wsId, rowId, columnKey);
    saveSoon();
    highlightSelectedCell();
    var row = api.findRowById(st, wsId, rowId);
    if(!row){
      syncRightPanelWithLinkedNotes([]);
      return;
    }
    if(columnKey === 'authorYear'){
      syncRightPanelWithLinkedNotes(collectRowLinkedNoteIds(row));
      return;
    }
    syncRightPanelWithLinkedNotes(api.getCellLinkedNoteIds(st, wsId, rowId, columnKey));
  }

  function getMatrixSearchQuery(){
    var input = document.getElementById('matrixSearchInp');
    return text(input && input.value || '').toLowerCase();
  }

  function ensureTopToolbarButton(){
    var topBtn = getTopMatrixButton();
    var host = getEditorToolbarMatrixHost();
    if(!host) return topBtn;
    if(topBtn && topBtn.parentElement !== host){
      host.appendChild(topBtn);
    }
    if(!topBtn){
      topBtn = document.createElement('button');
      topBtn.id = 'tbMatrixBtn';
      host.appendChild(topBtn);
    }
    topBtn.className = 'efmt';
    topBtn.type = 'button';
    topBtn.title = 'Literatür matrisini aç/kapat';
    if(!text(topBtn.textContent)) topBtn.textContent = 'Literatür Matrisi';
    return topBtn;
  }

  function bindTopMatrixButton(){
    var btn = ensureTopToolbarButton();
    if(!btn) return;
    if(btn.__aqMatrixBound) return;
    btn.__aqMatrixBound = true;
    btn.addEventListener('click', function(event){
      if(event && typeof event.preventDefault === 'function') event.preventDefault();
      setView(currentView === 'matrix' ? 'writing' : 'matrix');
    });
  }

  function ensureMatrixShell(){
    var ctr = document.getElementById('ctr');
    if(!ctr) return;
    ensureMatrixFilterStyles();

    var oldBar = document.getElementById('workspaceViewBar');
    if(oldBar) oldBar.classList.add('aq-hidden');

    ensureTopToolbarButton();
    bindTopMatrixButton();

    var matrixView = document.getElementById('matrixView');
    if(!matrixView){
      matrixView = document.createElement('div');
      matrixView.id = 'matrixView';
      matrixView.innerHTML = ''
        + '<div id="matrixToolbar">'
        + '  <input id="matrixSearchInp" type="text" placeholder="Kaynak veya hücre içinde ara..."/>'
        + '  <button id="matrixAddCurrentRefBtn" data-matrix-action="add-current-ref" type="button">Seçili Kaynağı Ekle</button>'
        + '  <button id="matrixFullscreenBtn" data-matrix-action="toggle-fullscreen" type="button">Tam Ekran</button>'
        + '  <button id="matrixExportBtn" data-matrix-action="export-excel" type="button">Dışarı Aktar</button>'
        + '  <button id="matrixCloseBtn" data-matrix-action="close" type="button">Kapat</button>'
        + '</div>'
        + '<div id="matrixFilterPanel"></div>'
        + '<div id="matrixTableWrap">'
        + '  <table id="matrixTable"></table>'
        + '  <div id="matrixEmptyState"></div>'
        + '</div>';
      var escroll = document.getElementById('escroll');
      var zoomBar = document.getElementById('zoomBar');
      if(escroll && escroll.parentElement === ctr){
        if(escroll.nextSibling) ctr.insertBefore(matrixView, escroll.nextSibling);
        else ctr.appendChild(matrixView);
      }else if(zoomBar && zoomBar.parentElement === ctr){
        ctr.insertBefore(matrixView, zoomBar);
      }else{
        ctr.appendChild(matrixView);
      }
    }

    var toolbar = document.getElementById('matrixToolbar');
    if(toolbar && !document.getElementById('matrixFilterPanel')){
      var filterPanel = document.createElement('div');
      filterPanel.id = 'matrixFilterPanel';
      if(toolbar.nextSibling) toolbar.parentElement.insertBefore(filterPanel, toolbar.nextSibling);
      else toolbar.parentElement.appendChild(filterPanel);
    }

    var quick = document.getElementById('matrixQuickGrp');
    if(quick) quick.classList.add('aq-hidden');
    ensureMatrixFullscreenButton();
  }

  function ensureMatrixFullscreenButton(){
    var toolbar = document.getElementById('matrixToolbar');
    if(!toolbar) return null;
    var btn = document.getElementById('matrixFullscreenBtn');
    if(!btn){
      btn = document.createElement('button');
      btn.id = 'matrixFullscreenBtn';
      btn.type = 'button';
      btn.setAttribute('data-matrix-action', 'toggle-fullscreen');
      btn.textContent = matrixFullscreen ? 'Tam Ekrandan Cik' : 'Tam Ekran';
      toolbar.appendChild(btn);
    }
    return btn;
  }

  function applyMatrixFullscreenState(){
    var on = !!(matrixFullscreen && currentView === 'matrix');
    var body = document.body || null;
    if(body){
      body.classList.toggle('aq-matrix-open', currentView === 'matrix');
    }
    if(body){
      body.classList.toggle('aq-matrix-fullscreen', on);
    }
    var btn = document.getElementById('matrixFullscreenBtn');
    if(btn){
      btn.textContent = matrixFullscreen ? 'Tam Ekrandan Çık' : 'Tam Ekran';
      btn.classList.toggle('on', matrixFullscreen);
    }
  }

  function setMatrixFullscreen(next){
    matrixFullscreen = !!next;
    applyMatrixFullscreenState();
  }

  function toggleMatrixFullscreen(){
    setMatrixFullscreen(!matrixFullscreen);
  }

  function rowMatchesQuery(row, ref, query, api){
    if(!query) return true;
    var haystack = [];
    haystack.push(ref && ref.title ? String(ref.title) : '');
    haystack.push(getAuthorYear(ref));
    api.EDITABLE_COLUMN_KEYS.forEach(function(key){
      var cell = row && row.cells ? row.cells[key] : null;
      haystack.push(cell && cell.text ? String(cell.text) : '');
    });
    return haystack.join(' ').toLowerCase().indexOf(query) >= 0;
  }

  function isAutoFillCandidate(row, api){
    if(!(row && row.cells && api)) return false;
    return api.EDITABLE_COLUMN_KEYS.some(function(columnKey){
      var cell = row.cells[columnKey] || {};
      return !text(cell.text);
    });
  }

  function applyAutoFillForReference(st, wsId, api, row, ref, extraText){
    if(!(st && wsId && api && row && ref)) return null;
    var assistantSettings = st.localMatrixAssistant || st.matrixAssistant || null;
    var options = {
      notes: Array.isArray(st.notes) ? st.notes : [],
      extraText: extraText || '',
      localMatrixAssistant: assistantSettings
    };
    if(assistantSettings && assistantSettings.enabled === true && assistantSettings.composeCells === true){
      return null;
    }
    if(typeof api.inferAutoCandidatesFromReference === 'function' && typeof api.applyAutoCandidatesToRow === 'function'){
      var candidates = api.inferAutoCandidatesFromReference(ref, options);
      if(candidates && candidates.length){
        return api.applyAutoCandidatesToRow(st, wsId, row.id, candidates, { overwrite: false });
      }
    }
    var autoCells = api.inferAutoCellsFromReference(ref, options);
    return api.applyAutoCellsToRow(st, wsId, row.id, autoCells, { overwrite: false, status: 'auto_suggested' });
  }

  function runLocalAssistantAutoFill(st, wsId, api, items){
    var settings = st && st.localMatrixAssistant && typeof st.localMatrixAssistant === 'object'
      ? st.localMatrixAssistant
      : null;
    if(!(settings && settings.enabled === true)) return;
    if(!(window.electronAPI && typeof window.electronAPI.rankLocalMatrixCandidates === 'function')) return;
    var token = String(wsId) + ':' + String((items || []).map(function(item){
      return String(item.row && item.row.id || '') + ':' + String(item.row && item.row.updatedAt || 0);
    }).join('|')) + ':' + String(settings.updatedAt || 0);
    if(localAssistantPassByWorkspace[wsId] === token) return;
    localAssistantPassByWorkspace[wsId] = token;
    var queue = (items || []).filter(function(item){
      return item && item.row && item.ref && isAutoFillCandidate(item.row, api);
    }).slice(0, 24);
    if(!queue.length) return;
    Promise.all(queue.map(function(item){
      var candidates = typeof api.inferAutoCandidatesFromReference === 'function'
        ? api.inferAutoCandidatesFromReference(item.ref, {
          notes: Array.isArray(st.notes) ? st.notes : [],
          localMatrixAssistant: { enabled: false }
        })
        : [];
      if(!candidates || !candidates.length) return false;
      var payload = {
        settings: settings,
        reference: {
          id: item.ref.id,
          title: item.ref.title,
          year: item.ref.year,
          doi: item.ref.doi
        },
        candidates: candidates
      };
      return window.electronAPI.rankLocalMatrixCandidates(payload).then(function(result){
        if(!(result && result.ok && Array.isArray(result.candidates) && result.candidates.length)) return false;
        if(settings.composeCells === true && window.electronAPI && typeof window.electronAPI.composeLocalMatrixCells === 'function'){
          return window.electronAPI.composeLocalMatrixCells(Object.assign({}, payload, {
            candidates: result.candidates
          })).then(function(composeResult){
            if(composeResult && composeResult.ok && Array.isArray(composeResult.candidates) && composeResult.candidates.length){
              return composeResult.candidates;
            }
            return result.candidates;
          }).catch(function(){
            return result.candidates;
          });
        }
        return result.candidates;
      }).then(function(finalCandidates){
        if(!(Array.isArray(finalCandidates) && finalCandidates.length)) return false;
        var before = Number(item.row.updatedAt || 0);
        api.applyAutoCandidatesToRow(st, wsId, item.row.id, finalCandidates, { overwrite: false });
        return Number(item.row.updatedAt || 0) !== before;
      }).catch(function(){ return false; });
    })).then(function(results){
      if(results.some(Boolean)){
        saveSoon();
        renderMatrix();
      }else{
        renderMatrix();
      }
    }).catch(function(){});
  }

  function rerunLocalAssistantAutoFill(){
    var api = getMatrixApi();
    var st = state();
    var wsId = getCurrentWorkspaceId();
    if(!(api && st && wsId)) return false;
    var wsState = api.ensureWorkspaceMatrix(st, wsId);
    if(!wsState) return false;
    var items = [];
    (wsState.rows || []).forEach(function(row){
      var ref = findReferenceInWorkspace(row.referenceId);
      if(ref) items.push({ row: row, ref: ref });
    });
    localAssistantPassByWorkspace[wsId] = '';
    autoFillPassByWorkspace[wsId] = '';
    runLocalAssistantAutoFill(st, wsId, api, items);
    return true;
  }

  function runWorkspaceAutoFill(st, wsId, wsState, api){
    if(!(st && wsId && wsState && api)) return false;
    var token = String(wsState.updatedAt || 0) + ':' + String((wsState.rows || []).length);
    if(autoFillPassByWorkspace[wsId] === token){
      return false;
    }
    autoFillPassByWorkspace[wsId] = token;
    var changed = false;
    var candidates = [];
    (wsState.rows || []).forEach(function(row){
      if(!isAutoFillCandidate(row, api)) return;
      var ref = findReferenceInWorkspace(row.referenceId);
      if(!ref) return;
      candidates.push({ row: row, ref: ref });
    });
    // First pass: sync fill with available data
    candidates.forEach(function(item){
      var before = Number(item.row.updatedAt || 0);
      var pdfText = typeof window.getPdfFullTextForRef === 'function'
        ? window.getPdfFullTextForRef(item.row.referenceId)
        : '';
      applyAutoFillForReference(st, wsId, api, item.row, item.ref, pdfText);
      if(Number(item.row.updatedAt || 0) !== before){
        changed = true;
      }
    });
    if(changed){
      saveSoon();
    }
    runLocalAssistantAutoFill(st, wsId, api, candidates);
    // Second pass: async fetch online abstracts for rows still needing fill
    var needOnline = candidates.filter(function(item){
      return isAutoFillCandidate(item.row, api) && text(item.ref.doi);
    });
    if(needOnline.length > 0){
      runOnlineAutoFill(st, wsId, api, needOnline);
    }
    autoFillPassByWorkspace[wsId] = String(wsState.updatedAt || 0) + ':' + String((wsState.rows || []).length);
    return changed;
  }

  function runOnlineAutoFill(st, wsId, api, items){
    var promises = items.map(function(item){
      return fetchOnlineAbstract(item.ref.doi).then(function(onlineText){
        if(!onlineText) return;
        if(!isAutoFillCandidate(item.row, api)) return;
        var pdfText = typeof window.getPdfFullTextForRef === 'function'
          ? window.getPdfFullTextForRef(item.row.referenceId)
          : '';
        var extraText = [pdfText, onlineText].filter(Boolean).join('\n');
        var before = Number(item.row.updatedAt || 0);
        applyAutoFillForReference(st, wsId, api, item.row, item.ref, extraText);
        return Number(item.row.updatedAt || 0) !== before;
      }).catch(function(){ return false; });
    });
    Promise.all(promises).then(function(results){
      var anyChanged = results.some(Boolean);
      if(anyChanged){
        saveSoon();
        renderMatrix();
        // Reset token so future renders don't skip
        autoFillPassByWorkspace[wsId] = '';
      }
    });
  }

  function seedWorkspaceReferences(st, wsId, wsState, api){
    if(!(st && wsId && wsState && api)) return false;
    var refs = getWorkspaceReferences();
    var signature = refs
      .map(function(ref){ return text(ref && ref.id); })
      .filter(Boolean)
      .sort()
      .join('|');
    if(autoSeedPassByWorkspace[wsId] === signature){
      return { changed: false, count: 0 };
    }
    autoSeedPassByWorkspace[wsId] = signature;
    var dismissed = Array.isArray(wsState.dismissedReferenceIds) ? wsState.dismissedReferenceIds : [];
    var changed = false;
    var createdCount = 0;
    refs.forEach(function(ref){
      var refId = text(ref && ref.id);
      if(!refId) return;
      var isDismissed = dismissed.some(function(id){
        return text(id).toLowerCase() === refId.toLowerCase();
      });
      if(isDismissed) return;
      var result = api.ensureRowForReference(st, wsId, ref);
      if(result && result.created){
        changed = true;
        createdCount += 1;
      }
    });
    if(changed) saveSoon();
    return { changed: changed, count: createdCount };
  }

  function pruneRowsOutsideWorkspace(st, wsId, wsState){
    if(!(st && wsId && wsState)) return false;
    var refIds = {};
    getWorkspaceReferences().forEach(function(ref){
      var id = text(ref && ref.id);
      if(id) refIds[id.toLowerCase()] = true;
    });
    var before = (wsState.rows || []).length;
    wsState.rows = (wsState.rows || []).filter(function(row){
      var key = text(row && row.referenceId).toLowerCase();
      return !!(key && refIds[key]);
    });
    var changed = wsState.rows.length !== before;
    if(wsState.selectedCell){
      var exists = wsState.rows.some(function(row){ return row.id === wsState.selectedCell.rowId; });
      if(!exists){
        wsState.selectedCell = null;
        changed = true;
      }
    }
    if(changed){
      wsState.updatedAt = Date.now();
      saveSoon();
    }
    return changed;
  }

  function formatEvidenceDate(value){
    var ts = Number(value || 0);
    if(!ts) return '';
    try{
      return new Date(ts).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
    }catch(_e){
      return '';
    }
  }

  function buildEvidenceItems(cell){
    var items = [];
    var source = cell && cell.source && typeof cell.source === 'object' ? cell.source : null;
    var sources = Array.isArray(cell && cell.sources) ? cell.sources : [];
    var candidates = Array.isArray(cell && cell.candidates) ? cell.candidates : [];
    sources.forEach(function(item){
      if(item && (text(item.snippet) || text(item.page) || text(item.section))){
        items.push({ type: 'Kanıt', source: item });
      }
    });
    if(source && (text(source.snippet) || text(source.page) || text(source.section)) && !items.length){
      items.push({ type: 'Kanıt', source: source });
    }
    candidates.forEach(function(candidate){
      var candidateSource = candidate && candidate.source ? candidate.source : {};
      if(text(candidate && candidate.text) || text(candidateSource.snippet)){
        items.push({
          type: Number(candidate.confidence || 0) >= 0.8 ? 'Otomatik' : 'İncele',
          source: candidateSource,
          text: candidate.text,
          confidence: candidate.confidence,
          reasons: Array.isArray(candidate.reasons) ? candidate.reasons : []
        });
      }
    });
    if(!items.length && text(cell && cell.text)){
      items.push({
        type: cell.status === 'auto_suggested' ? 'Otomatik' : 'Hücre',
        source: {
          snippet: text(cell.text),
          extractionType: text(cell.status || 'manual-cell'),
          confidence: cell.status === 'auto_suggested' ? 0.8 : 0,
          updatedAt: cell.updatedAt || 0
        },
        text: text(cell.text),
        confidence: cell.status === 'auto_suggested' ? 0.8 : 0,
        reasons: cell.status ? ['status:' + text(cell.status)] : []
      });
    }
    return items.slice(0, 8);
  }

  function renderEvidenceControl(cell){
    var items = buildEvidenceItems(cell);
    var statusLabel = text(cell && cell.status);
    if(!items.length && !statusLabel) return '';
    var count = items.length;
    var title = statusLabel === 'auto_suggested' ? 'Otomatik öneri'
      : statusLabel === 'needs_review' ? 'İnceleme gerekli'
      : statusLabel === 'user_confirmed' ? 'Kullanıcı onaylı'
      : 'Kanıt';
    var body = items.length ? items.map(function(item){
      var src = item.source || {};
      var confidence = item.confidence != null ? item.confidence : src.confidence;
      var meta = [
        item.type,
        text(src.extractionType),
        text(src.section),
        text(src.page) ? ('s. ' + text(src.page)) : '',
        confidence ? ('%' + Math.round(Number(confidence || 0) * 100)) : '',
        formatEvidenceDate(src.updatedAt)
      ].filter(Boolean).join(' · ');
      var snippet = text(src.snippet || item.text || '').slice(0, 700);
      var reasons = item.reasons && item.reasons.length ? '<div class="mx-evidence-reasons">' + escHTML(item.reasons.slice(0, 4).join(' · ')) + '</div>' : '';
      return '<div class="mx-evidence-item">'
        + '<div class="mx-evidence-meta">' + escHTML(meta || item.type) + '</div>'
        + '<div class="mx-evidence-snippet">' + escHTML(snippet || 'Snippet yok') + '</div>'
        + reasons
        + '</div>';
    }).join('') : '<div class="mx-evidence-empty">' + escHTML(title) + '</div>';
    return '<details class="mx-evidence" data-evidence-count="' + count + '">'
      + '<summary title="Kanıt ve otomatik doldurma kaynağı">' + escHTML(count ? ('Kanıt ' + count) : title) + '</summary>'
      + '<div class="mx-evidence-popover">' + body + '</div>'
      + '</details>';
  }

  function referenceHasPdf(ref){
    if(!ref || typeof ref !== 'object') return false;
    if(ref.hasPdf === true || ref.pdfSaved === true || ref.pdfAttached === true) return true;
    if(text(ref.pdfPath || ref.pdfFile || ref.pdfFileName || ref.pdfFilename || ref.pdfLocalPath || ref.localPdfPath)) return true;
    if(ref.pdf && typeof ref.pdf === 'object' && text(ref.pdf.path || ref.pdf.fileName || ref.pdf.filename || ref.pdf.localPath)) return true;
    if(text(ref.pdfUrl || ref.oaPdfUrl || ref.openAccessPdfUrl)) return true;
    return false;
  }

  function referenceHasAbstract(ref){
    if(!ref || typeof ref !== 'object') return false;
    return !!text(ref.abstract || ref.summary || ref.description || ref.browserCaptureMeta && ref.browserCaptureMeta.abstract);
  }

  function getBestCellCandidate(cell){
    var candidates = Array.isArray(cell && cell.candidates) ? cell.candidates : [];
    var best = null;
    candidates.forEach(function(candidate){
      if(!candidate) return;
      if(!best || Number(candidate.confidence || 0) > Number(best.confidence || 0)){
        best = candidate;
      }
    });
    return best;
  }

  function getEmptyCellHint(cell, columnKey, ref){
    if(text(cell && cell.text)) return null;
    if(columnKey === 'myNotes'){
      return { tone: 'manual', label: 'Kullanici notu', detail: 'Elle doldurulur' };
    }
    var best = getBestCellCandidate(cell);
    if(best){
      var confidence = Number(best.confidence || 0);
      return {
        tone: confidence >= 0.5 ? 'review' : 'low',
        label: confidence >= 0.5 ? 'Incele' : 'Dusuk guven',
        detail: '%' + Math.round(confidence * 100) + ' aday'
      };
    }
    if(referenceHasPdf(ref)){
      return { tone: 'muted', label: 'PDF tarandi', detail: 'Kanit bulunamadi' };
    }
    if(referenceHasAbstract(ref)){
      return { tone: 'muted', label: 'Abstract ile sinirli', detail: 'PDF yok' };
    }
    if(text(ref && (ref.doi || ref.url || ref.title))){
      return { tone: 'empty', label: 'Metadata sinirli', detail: 'PDF/abstract yok' };
    }
    return { tone: 'empty', label: 'Kaynak metni yok', detail: '' };
  }

  function renderEmptyCellHint(cell, columnKey, ref){
    var hint = getEmptyCellHint(cell, columnKey, ref);
    if(!hint) return '';
    return '<div class="mx-cell-hint ' + escHTML(hint.tone || 'muted') + '">'
      + '<span>' + escHTML(hint.label) + '</span>'
      + (hint.detail ? '<small>' + escHTML(hint.detail) + '</small>' : '')
      + '</div>';
  }

  function renderMatrixFilterPanel(result, rows, references){
    var filterApi = getFilterApi();
    var panel = document.getElementById('matrixFilterPanel');
    if(!(filterApi && panel)) return;
    var st = state();
    var filterState = result && result.state ? result.state : getMatrixFilterState();
    var chips = filterApi.buildActiveFilterChips(filterState);
    var countText = String(result ? result.filtered : 0) + ' / ' + String(result ? result.total : 0) + ' kaynak gosteriliyor';
    var presetButtons = [
      ['review-needed','Review Needed'],
      ['recent-evidence','Recent Evidence'],
      ['incomplete-matrix','Incomplete Matrix'],
      ['user-confirmed-evidence','User Confirmed'],
      ['method-gap-finder','Method Gap'],
      ['sample-gap-finder','Sample Gap'],
      ['limitation-based-gap','Limitation Gap']
    ].map(function(item){
      return '<button type="button" class="mx-filter-preset" data-matrix-filter-preset="' + escHTML(item[0]) + '">' + escHTML(item[1]) + '</button>';
    }).join('');
    var chipHtml = chips.length ? chips.map(function(chip){
      return '<button type="button" class="mx-filter-chip" data-matrix-filter-remove="' + escHTML(chip.id) + '">' + escHTML(chip.label) + ' x</button>';
    }).join('') : '<span class="mx-filter-empty">Aktif filtre yok.</span>';
    function option(value, label){
      return '<option value="' + escHTML(value) + '">' + escHTML(label || value) + '</option>';
    }
    function multiselect(id, label, selected, options){
      var selectedMap = {};
      (selected || []).forEach(function(value){ selectedMap[String(value)] = true; });
      var selectedCount = Object.keys(selectedMap).length;
      var summary = selectedCount ? (selectedCount + ' secili') : 'Tümü';
      return '<label class="mx-filter-field mx-filter-field-menu"><span>' + escHTML(label) + '</span>'
        + '<details class="mx-filter-menu" data-matrix-filter-menu="' + escHTML(id) + '">'
        + '<summary><span>' + escHTML(label) + '</span><b>' + escHTML(summary) + '</b></summary>'
        + '<div class="mx-filter-menu-panel">'
        + options.map(function(item){
          var value = Array.isArray(item) ? item[0] : item;
          var textValue = Array.isArray(item) ? item[1] : item;
          return '<label class="mx-filter-check"><input type="checkbox" data-matrix-filter-check="' + escHTML(id) + '" value="' + escHTML(value) + '"' + (selectedMap[String(value)] ? ' checked' : '') + '/><span>' + escHTML(textValue) + '</span></label>';
        }).join('')
        + '</div></details></label>';
    }
    var methodOptions = [
      ['quantitative','Quantitative / Nicel'],
      ['qualitative','Qualitative / Nitel'],
      ['mixed','Mixed / Karma'],
      ['review','Review']
    ];
    var designOptions = [
      ['cross-sectional','Cross-sectional'],
      ['longitudinal','Longitudinal'],
      ['experimental','Experimental'],
      ['quasi-experimental','Quasi-experimental'],
      ['phenomenology','Phenomenology / Fenomenoloji'],
      ['case study','Case study'],
      ['correlational','Correlational / Iliskisel']
    ];
    var sampleOptions = [
      ['undergraduate students','Universite ogrencileri'],
      ['adolescents','Ergenler'],
      ['teachers','Ogretmenler'],
      ['preservice teachers','Ogretmen adaylari'],
      ['counselors','Psikolojik danismanlar'],
      ['parents','Ebeveynler'],
      ['clinical sample','Klinik orneklem'],
      ['adult sample','Yetiskin orneklem'],
      ['Turkish sample','Turkiye orneklemi'],
      ['international sample','International sample']
    ];
    var analysisOptions = [
      ['regression','Regresyon'],
      ['correlation','Korelasyon'],
      ['SEM','Yapisal esitlik modeli'],
      ['ANOVA','ANOVA'],
      ['t-test','t-test'],
      ['mediation','Aracilik'],
      ['moderation','Duzenleyicilik'],
      ['thematic analysis','Tematik analiz'],
      ['content analysis','Icerik analizi'],
      ['descriptive analysis','Betimsel analiz']
    ];
    var findingOptions = [
      ['positive','Positive'],
      ['negative','Negative'],
      ['mixed','Mixed'],
      ['nonsignificant','No significant'],
      ['unclear','Unclear']
    ];
    var limitationOptions = [
      ['cross-sectional','Cross-sectional limitation'],
      ['self-report','Self-report limitation'],
      ['small sample','Small sample'],
      ['convenience sample','Convenience sample'],
      ['single country','Single country / culture'],
      ['generalizability','Generalizability'],
      ['causality','Causality'],
      ['measurement limitation','Measurement'],
      ['future research','Future research']
    ];
    var bodyOpen = panel.classList.contains('open');
    var assistantSettings = st && st.localMatrixAssistant && typeof st.localMatrixAssistant === 'object'
      ? st.localMatrixAssistant
      : {};
    var assistantOn = assistantSettings.enabled === true;
    var assistantLabel = assistantOn ? 'Yardımcı: Açık' : 'Yardımcı: Kapalı';
    panel.innerHTML = ''
      + '<div class="mx-filter-head">'
      + '  <button type="button" class="mx-filter-toggle" data-matrix-filter-action="toggle">' + (bodyOpen ? 'Filtreleri Gizle' : 'Filtreler') + '</button>'
      + '  <span class="mx-filter-count">' + escHTML(countText) + '</span>'
      + '  <span class="mx-filter-assistant ' + (assistantOn ? 'on' : '') + '" title="' + (assistantOn ? 'Yerel Matrix yardımcısı açık' : 'Yerel Matrix yardımcısı kapalı') + '">' + escHTML(assistantLabel) + '</span>'
      + '  <button type="button" class="mx-filter-clear" data-matrix-filter-action="clear">Tum filtreleri temizle</button>'
      + '</div>'
      + '<div class="mx-filter-chips">' + chipHtml + '</div>'
      + '<div class="mx-filter-body"' + (bodyOpen ? '' : ' hidden') + '>'
      + '  <div class="mx-filter-presets">' + presetButtons + '</div>'
      + '  <div class="mx-filter-grid">'
      + '    <label class="mx-filter-field"><span>Arama kapsami</span><select data-matrix-filter-field="searchScope">'
      + option('all','Tum matrix') + option('titleAuthor','Baslik / yazar') + option('cells','Hucreler') + option('purpose','Purpose') + option('method','Method') + option('sample','Sample') + option('findings','Findings') + option('limitations','Limitations')
      + '    </select></label>'
      + '    <label class="mx-filter-field"><span>Yil baslangic</span><input type="number" data-matrix-filter-field="yearFrom" value="' + escHTML(filterState.yearRange.from) + '" placeholder="2018"/></label>'
      + '    <label class="mx-filter-field"><span>Yil bitis</span><input type="number" data-matrix-filter-field="yearTo" value="' + escHTML(filterState.yearRange.to) + '" placeholder="2026"/></label>'
      + '    <label class="mx-filter-field"><span>DOI</span><select data-matrix-filter-field="hasDoi">' + option('','Farketmez') + option('true','DOI var') + option('false','DOI yok') + '</select></label>'
      + '    <label class="mx-filter-field"><span>PDF</span><select data-matrix-filter-field="hasPdf">' + option('','Farketmez') + option('true','PDF var') + option('false','PDF yok') + '</select></label>'
      + '    <label class="mx-filter-field"><span>Siralama</span><select data-matrix-filter-field="sortKey">' + option('year','Yil') + option('author','Yazar') + option('confidence','Confidence') + option('metadataHealth','Metadata Health') + option('missing','En eksik') + option('filled','En dolu') + option('updatedAt','Son guncellenen') + '</select></label>'
      + '    <label class="mx-filter-field"><span>Yon</span><select data-matrix-filter-field="sortDirection">' + option('desc','Azalan') + option('asc','Artan') + '</select></label>'
      + multiselect('metadataHealth','Metadata Health', filterState.metadata.metadataHealth, [['good','Iyi'],['medium','Orta'],['weak','Zayif']])
      + multiselect('cellStatus','Hucre durumu', filterState.cellStatus, [['incomplete','Eksik matrix'],['auto_suggested','Auto-suggested'],['user_confirmed','User-confirmed'],['needs_review','Needs-review'],['low_confidence','Low-confidence'],['purpose:empty','Purpose bos'],['method:empty','Method bos'],['sample:empty','Sample bos'],['findings:empty','Findings bos'],['limitations:empty','Limitations bos']])
      + multiselect('sourceTypes','Kaynak / Kanit', filterState.sourceTypes, [['pdf_selection','PDF selection'],['auto','Otomatik yakalama'],['user_edited','Kullanici duzenledi'],['source_snippet','Source snippet'],['page_number','Page number']])
      + multiselect('methodTypes','Yontem', filterState.methodTypes, methodOptions)
      + multiselect('designs','Desen', filterState.designs, designOptions)
      + multiselect('sampleGroups','Orneklem', filterState.sampleGroups, sampleOptions)
      + multiselect('analysisTypes','Analiz', filterState.analysisTypes, analysisOptions)
      + multiselect('findingDirections','Bulgular', filterState.findingDirections, findingOptions)
      + multiselect('limitationTags','Sinirliliklar', filterState.limitationTags, limitationOptions)
      + '    <label class="mx-filter-field"><span>Confidence min</span><input type="number" min="0" max="1" step="0.05" data-matrix-filter-field="confidenceMin" value="' + escHTML(filterState.confidence.min == null ? '' : filterState.confidence.min) + '" placeholder="0.80"/></label>'
      + '    <label class="mx-filter-field"><span>Confidence max</span><input type="number" min="0" max="1" step="0.05" data-matrix-filter-field="confidenceMax" value="' + escHTML(filterState.confidence.max == null ? '' : filterState.confidence.max) + '" placeholder="1"/></label>'
      + '  </div>'
      + '</div>';
    var fields = panel.querySelectorAll('[data-matrix-filter-field]');
    fields.forEach(function(field){
      var key = field.getAttribute('data-matrix-filter-field');
      if(key === 'searchScope') field.value = filterState.searchScope;
      if(key === 'hasDoi') field.value = filterState.metadata.hasDoi === null ? '' : String(filterState.metadata.hasDoi);
      if(key === 'hasPdf') field.value = filterState.metadata.hasPdf === null ? '' : String(filterState.metadata.hasPdf);
      if(key === 'sortKey') field.value = filterState.sort.key;
      if(key === 'sortDirection') field.value = filterState.sort.direction;
      field.onchange = function(event){
        updateMatrixFilterFromControl(event.currentTarget || field);
      };
      field.oninput = function(event){
        updateMatrixFilterFromControl(event.currentTarget || field);
      };
    });
    var lists = panel.querySelectorAll('[data-matrix-filter-list]');
    lists.forEach(function(list){
      list.onchange = function(event){
        updateMatrixFilterFromControl(event.currentTarget || list);
      };
      list.oninput = function(event){
        updateMatrixFilterFromControl(event.currentTarget || list);
      };
    });
    var checks = panel.querySelectorAll('[data-matrix-filter-check]');
    checks.forEach(function(check){
      check.onchange = function(event){
        updateMatrixFilterFromControl(event.currentTarget || check);
      };
    });
  }

  function renderMatrix(){
    var api = getMatrixApi();
    var st = state();
    var wsId = getCurrentWorkspaceId();
    var table = document.getElementById('matrixTable');
    var empty = document.getElementById('matrixEmptyState');
    if(!(api && st && table)) return;
    if(!wsId){
      table.innerHTML = '';
      if(empty){
        empty.classList.remove('aq-hidden');
        empty.textContent = 'Önce bir çalışma alanı seçin.';
      }
      return;
    }

    var wsState = api.ensureWorkspaceMatrix(st, wsId);
    var rows = wsState ? wsState.rows : [];
    if(wsState){
      var seeded = seedWorkspaceReferences(st, wsId, wsState, api);
      pruneRowsOutsideWorkspace(st, wsId, wsState);
      runWorkspaceAutoFill(st, wsId, wsState, api);
      rows = wsState.rows;
      if(seeded && seeded.count > 0){
        var statusToken = String(wsState.updatedAt || 0) + ':' + String(seeded.count);
        if(autoSeedStatusTokenByWorkspace[wsId] !== statusToken){
          autoSeedStatusTokenByWorkspace[wsId] = statusToken;
          status('Matrix otomatik senkron: ' + seeded.count + ' kaynak eklendi.', 'ok');
        }
      }
    }
    var references = getWorkspaceReferences();
    var filterApi = getFilterApi();
    var filterState = getMatrixFilterState(wsId);
    var searchEl = document.getElementById('matrixSearchInp');
    if(searchEl && !text(searchEl.value) && filterState.search){
      searchEl.value = filterState.search;
    }
    filterState.search = getMatrixSearchQuery();
    var filterResult = filterApi && typeof filterApi.applyMatrixFilters === 'function'
      ? filterApi.applyMatrixFilters(rows, references, filterState)
      : null;
    var filteredRows = filterResult ? filterResult.rows : rows.filter(function(row){
      var ref = findReferenceInWorkspace(row.referenceId);
      return rowMatchesQuery(row, ref, filterState.search, api);
    });
    renderMatrixFilterPanel(filterResult || { rows: filteredRows, total: rows.length, filtered: filteredRows.length, state: filterState }, rows, references);

    if(!filteredRows.length){
      table.innerHTML = '';
      if(empty){
        empty.classList.remove('aq-hidden');
        empty.textContent = rows.length
          ? 'Filtreye uyan satir bulunamadi.'
          : 'Henüz kaynak eklenmedi. Sol panelde bir kaynağa sağ tık yapıp "Literatür Matrisine Ekle" seçebilirsiniz.';
      }
      return;
    }
    if(empty) empty.classList.add('aq-hidden');

    var head = '<thead><tr>' + api.MATRIX_COLUMNS.map(function(column){
      return '<th>' + escHTML(column.label) + '</th>';
    }).join('') + '</tr></thead>';

    var body = '<tbody>' + filteredRows.map(function(row){
      var ref = findReferenceInWorkspace(row.referenceId);
      var refTitle = ref && ref.title ? String(ref.title) : 'Kaynak kaydi bulunamadi';
      var authorCell = '<td class="mx-cell mx-author-cell" data-row-id="' + escHTML(row.id) + '" data-col-id="authorYear">'
        + '<div class="mx-author-main">' + escHTML(getAuthorYear(ref)) + '</div>'
        + '<div class="mx-author-sub">' + escHTML(refTitle) + '</div>'
        + '<div class="mx-row-actions">'
        + '<button type="button" class="mx-row-btn" data-matrix-action="open-reference" data-ref-id="' + escHTML(row.referenceId) + '">Ac</button>'
        + '<button type="button" class="mx-row-btn" data-matrix-action="show-in-pdf" data-row-id="' + escHTML(row.id) + '" data-col-id="authorYear">PDFte Goster</button>'
        + '<button type="button" class="mx-row-btn danger" data-matrix-action="remove-row" data-row-id="' + escHTML(row.id) + '">Sil</button>'
        + '</div>'
        + '</td>';

      var otherCells = api.EDITABLE_COLUMN_KEYS.map(function(columnKey){
        var cell = row.cells && row.cells[columnKey] ? row.cells[columnKey] : { text: '', noteIds: [] };
        var noteCount = Array.isArray(cell.noteIds) ? cell.noteIds.length : 0;
        var evidenceControl = renderEvidenceControl(cell);
        var emptyHint = renderEmptyCellHint(cell, columnKey, ref);
        return '<td class="mx-cell" data-row-id="' + escHTML(row.id) + '" data-col-id="' + escHTML(columnKey) + '">'
          + (noteCount ? '<span class="mx-note-count">' + noteCount + ' not</span>' : '')
          + '<div class="mx-cell-actions">' + evidenceControl + '<button type="button" class="mx-cell-btn" data-matrix-action="show-in-pdf" data-row-id="' + escHTML(row.id) + '" data-col-id="' + escHTML(columnKey) + '">PDFte Goster</button></div>'
          + emptyHint
          + '<textarea class="mx-cell-input" data-row-id="' + escHTML(row.id) + '" data-col-id="' + escHTML(columnKey) + '" placeholder="Yaz..." spellcheck="true">'
          + escHTML(cell.text || '')
          + '</textarea>'
          + '</td>';
      }).join('');

      return '<tr data-row-id="' + escHTML(row.id) + '" data-ref-id="' + escHTML(row.referenceId) + '">' + authorCell + otherCells + '</tr>';
    }).join('') + '</tbody>';

    table.innerHTML = head + body;
    highlightSelectedCell();
  }

  function addReferenceToMatrix(referenceId, options){
    options = options || {};
    var api = getMatrixApi();
    var st = state();
    var wsId = getCurrentWorkspaceId();
    var refId = text(referenceId);
    if(!(api && st && wsId && refId)){
      status('Kaynak matrise eklenemedi.', 'er');
      return { ok: false };
    }
    var ref = findReferenceInWorkspace(refId);
    if(!ref){
      status('Kaynak aktif workspace icinde bulunamadi.', 'er');
      return { ok: false, reason: 'reference_outside_workspace' };
    }
    var result = api.ensureRowForReference(st, wsId, ref);
    if(!result || !result.row){
      status('Kaynak matrise eklenemedi.', 'er');
      return { ok: false };
    }
    var pdfText = typeof window.getPdfFullTextForRef === 'function'
      ? window.getPdfFullTextForRef(text(ref.id))
      : '';
    applyAutoFillForReference(st, wsId, api, result.row, ref, pdfText);
    if(typeof api.undismissReference === 'function'){
      api.undismissReference(st, wsId, refId);
    }
    if(options.openView !== false){
      setView('matrix');
    }
    setSelectedCell(result.row.id, 'authorYear');
    saveSoon();
    renderMatrix();
    if(options.silent !== true){
      status(result.created ? 'Kaynak literatür matrisine eklendi.' : 'Kaynak zaten matriste vardı.', 'ok');
    }
    return { ok: true, created: !!result.created, row: result.row };
  }

  function getNoteById(noteId){
    if(window.AQNotes && typeof window.AQNotes.findNote === 'function'){
      try{
        var hit = window.AQNotes.findNote(noteId);
        if(hit) return hit;
      }catch(_e){}
    }
    var st = state();
    var notes = st && Array.isArray(st.notes) ? st.notes : [];
    return notes.find(function(note){ return String(note && note.id || '') === String(noteId || ''); }) || null;
  }

  function noteTextForMatrix(note){
    if(!note) return '';
    var quote = text(note.q || note.sourceExcerpt);
    if(quote) return quote;
    var summary = text(note.txt || note.comment);
    if(summary) return summary;
    return '';
  }

  function sendNoteToMatrix(noteId, options){
    options = options || {};
    var api = getMatrixApi();
    var st = state();
    var wsId = getCurrentWorkspaceId();
    if(!(api && st && wsId)){
      status('Not matrise gonderilemedi.', 'er');
      return { ok: false };
    }
    var note = getNoteById(noteId);
    if(!note){
      status('Not bulunamadi.', 'er');
      return { ok: false, reason: 'missing_note' };
    }
    if(!note.rid){
      status('Not bir kaynaga bagli degil.', 'er');
      return { ok: false, reason: 'missing_reference' };
    }
    var ref = findReferenceInWorkspace(note.rid);
    if(!ref){
      status('Notun kaynagi aktif workspace icinde degil.', 'er');
      return { ok: false, reason: 'reference_outside_workspace' };
    }
    var ensured = api.ensureRowForReference(st, wsId, ref);
    if(!(ensured && ensured.row)){
      status('Matrix satiri olusturulamadi.', 'er');
      return { ok: false };
    }
    if(ensured.created){
      var pdfText = typeof window.getPdfFullTextForRef === 'function'
        ? window.getPdfFullTextForRef(text(ref.id))
        : '';
      applyAutoFillForReference(st, wsId, api, ensured.row, ref, pdfText);
    }
    var columnKey = text(options.columnKey) || api.inferColumnFromNoteType(note.noteType);
    var payload = noteTextForMatrix(note);
    api.appendNoteToCell(st, wsId, ensured.row.id, columnKey, note.id, payload, {
      joiner: '\n\n',
      sourcePage: note.sourcePage || note.tag || '',
      sourceSnippet: payload
    });
    if(typeof api.undismissReference === 'function'){
      api.undismissReference(st, wsId, note.rid);
    }
    api.setSelectedCell(st, wsId, ensured.row.id, columnKey);
    saveSoon();
    if(options.openView !== false){
      setView('matrix');
    }
    renderMatrix();
    syncRightPanelWithLinkedNotes(api.getCellLinkedNoteIds(st, wsId, ensured.row.id, columnKey));
    status('Not matrise eklendi: ' + columnKey + '.', 'ok');
    return { ok: true, rowId: ensured.row.id, columnKey: columnKey };
  }

  function setView(view){
    var next = view === 'matrix' ? 'matrix' : 'writing';
    currentView = next;
    var escroll = document.getElementById('escroll');
    var matrixView = document.getElementById('matrixView');
    var zoomBar = document.getElementById('zoomBar');
    var findbar = document.getElementById('findbar');
    var matrixBtn = getTopMatrixButton();
    var writing = next === 'writing';

    if(escroll) escroll.classList.remove('aq-hidden');
    if(matrixView) matrixView.classList.toggle('aq-hidden', !!writing);
    if(zoomBar) zoomBar.classList.toggle('aq-hidden', !writing);
    if(findbar && !writing) findbar.classList.add('aq-hidden');
    if(matrixBtn){
      matrixBtn.classList.toggle('on', !writing);
      matrixBtn.textContent = writing ? 'Literatür Matrisi' : 'Yazıya Dön';
    }
    applyMatrixFullscreenState();

    if(!writing){
      if(matrixView) matrixView.classList.add('open');
      renderMatrix();
      var selected = getSelectedCellFromState();
      if(selected && selected.rowId && selected.columnKey){
        setSelectedCell(selected.rowId, selected.columnKey);
      }else{
        syncRightPanelWithLinkedNotes([]);
      }
    }else if(matrixView){
      matrixView.classList.remove('open');
      if(document.body) document.body.classList.remove('aq-matrix-open');
    }
  }

  function readSelectedOptions(select){
    return Array.from(select && select.options ? select.options : []).filter(function(opt){ return opt.selected; }).map(function(opt){ return text(opt.value); }).filter(Boolean);
  }

  function readCheckedFilterValues(name){
    if(!name) return [];
    var panel = document.getElementById('matrixFilterPanel');
    if(!panel) return [];
    return Array.from(panel.querySelectorAll('[data-matrix-filter-check]:checked'))
      .filter(function(input){ return input.getAttribute('data-matrix-filter-check') === name; })
      .map(function(input){ return text(input.value); })
      .filter(Boolean);
  }

  function updateMatrixFilterFromControl(target){
    var filterApi = getFilterApi();
    var st = state();
    var wsId = getCurrentWorkspaceId();
    if(!(filterApi && st && wsId && target)) return false;
    var field = target.getAttribute && target.getAttribute('data-matrix-filter-field');
    var list = target.getAttribute && target.getAttribute('data-matrix-filter-list');
    var check = target.getAttribute && target.getAttribute('data-matrix-filter-check');
    if(!(field || list || check)) return false;
    var next = getMatrixFilterState(wsId);
    if(field === 'yearFrom') next.yearRange.from = text(target.value);
    else if(field === 'yearTo') next.yearRange.to = text(target.value);
    else if(field === 'searchScope') next.searchScope = text(target.value) || 'all';
    else if(field === 'hasDoi') next.metadata.hasDoi = target.value === '' ? null : target.value === 'true';
    else if(field === 'hasPdf') next.metadata.hasPdf = target.value === '' ? null : target.value === 'true';
    else if(field === 'sortKey') next.sort.key = text(target.value) || 'year';
    else if(field === 'sortDirection') next.sort.direction = text(target.value) === 'asc' ? 'asc' : 'desc';
    else if(field === 'confidenceMin') next.confidence.min = target.value === '' ? null : Number(target.value);
    else if(field === 'confidenceMax') next.confidence.max = target.value === '' ? null : Number(target.value);
    else if(list === 'metadataHealth') next.metadata.metadataHealth = readSelectedOptions(target);
    else if(list === 'cellStatus') next.cellStatus = readSelectedOptions(target);
    else if(list === 'sourceTypes') next.sourceTypes = readSelectedOptions(target);
    else if(list && Array.isArray(next[list])) next[list] = readSelectedOptions(target);
    else if(check === 'metadataHealth') next.metadata.metadataHealth = readCheckedFilterValues(check);
    else if(check === 'cellStatus') next.cellStatus = readCheckedFilterValues(check);
    else if(check === 'sourceTypes') next.sourceTypes = readCheckedFilterValues(check);
    else if(check && Array.isArray(next[check])) next[check] = readCheckedFilterValues(check);
    setMatrixFilterState(next);
    renderMatrix();
    return true;
  }

  function excelEscape(value){
    return escHTML(value).replace(/\r?\n/g, '<br>');
  }

  function safeExcelFileName(value){
    return text(value || 'matrix')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 70) || 'matrix';
  }

  function getReferenceYear(ref){
    var year = ref && (ref.year || ref.publishedDate || ref.date) ? String(ref.year || ref.publishedDate || ref.date) : '';
    var match = year.match(/\b(19|20)\d{2}\b/);
    return match ? match[0] : year;
  }

  function getVisibleMatrixRows(){
    var api = getMatrixApi();
    var st = state();
    var wsId = getCurrentWorkspaceId();
    if(!(api && st && wsId)) return { rows: [], allRows: [], references: [], filterState: null };
    var wsState = api.ensureWorkspaceMatrix(st, wsId);
    var rows = wsState && Array.isArray(wsState.rows) ? wsState.rows : [];
    var references = getWorkspaceReferences();
    var filterApi = getFilterApi();
    var filterState = getMatrixFilterState(wsId);
    var searchEl = document.getElementById('matrixSearchInp');
    if(searchEl) filterState.search = text(searchEl.value);
    var filterResult = filterApi && typeof filterApi.applyMatrixFilters === 'function'
      ? filterApi.applyMatrixFilters(rows, references, filterState)
      : null;
    return {
      rows: filterResult ? filterResult.rows : rows,
      allRows: rows,
      references: references,
      filterState: filterState
    };
  }

  function exportMatrixToExcel(){
    var api = getMatrixApi();
    var st = state();
    var wsId = getCurrentWorkspaceId();
    if(!(api && st && wsId)){
      status('Matrix dışa aktarılamadı.', 'er');
      return false;
    }
    var visible = getVisibleMatrixRows();
    var rows = visible.rows || [];
    if(!rows.length){
      status('Dışa aktarılacak matrix satırı yok.', 'er');
      return false;
    }
    var ws = Array.isArray(st.wss) ? st.wss.find(function(item){ return String(item && item.id || '') === String(wsId); }) : null;
    var headers = ['Author-Year', 'Başlık', 'Yıl', 'DOI', 'PDF', 'Purpose', 'Method', 'Sample', 'Findings', 'Limitations', 'My Notes'];
    var editable = ['purpose', 'method', 'sample', 'findings', 'limitations', 'myNotes'];
    var rowHtml = rows.map(function(row){
      var ref = findReferenceInWorkspace(row.referenceId) || {};
      var cells = row.cells || {};
      var values = [
        getAuthorYear(ref),
        ref.title || '',
        getReferenceYear(ref),
        ref.doi || '',
        ref.hasPdf || ref.pdfPath || ref.pdfUrl ? 'Var' : 'Yok'
      ];
      editable.forEach(function(key){
        values.push(cells[key] && cells[key].text ? cells[key].text : '');
      });
      return '<tr>' + values.map(function(value){ return '<td>' + excelEscape(value) + '</td>'; }).join('') + '</tr>';
    }).join('');
    var workbook = '\ufeff<html><head><meta charset="utf-8">'
      + '<style>table{border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt}th{background:#1e3a5f;color:white;font-weight:700}td,th{border:1px solid #d9d9d9;padding:6px;vertical-align:top;mso-number-format:"\\@";white-space:normal}</style>'
      + '</head><body><table><thead><tr>'
      + headers.map(function(label){ return '<th>' + excelEscape(label) + '</th>'; }).join('')
      + '</tr></thead><tbody>' + rowHtml + '</tbody></table></body></html>';
    var blob = new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = 'AcademiQ-Matrix-' + safeExcelFileName(ws && ws.name ? ws.name : wsId) + '-' + date + '.xls';
    document.body.appendChild(a);
    a.click();
    window.setTimeout(function(){
      try{ URL.revokeObjectURL(url); }catch(_e){}
      if(a && a.parentElement) a.parentElement.removeChild(a);
    }, 1000);
    status('Literatür matrisi Excel dosyası olarak dışa aktarıldı.', 'ok');
    return true;
  }

  function onMatrixClick(event){
    var target = event && event.target ? event.target : null;
    if(!target) return;

    var filterAction = target.closest('[data-matrix-filter-action]');
    if(filterAction){
      event.preventDefault();
      event.stopPropagation();
      var action = filterAction.getAttribute('data-matrix-filter-action');
      var panel = document.getElementById('matrixFilterPanel');
      if(action === 'toggle' && panel){
        panel.classList.toggle('open');
        renderMatrix();
      }else if(action === 'clear'){
        var apiClear = getFilterApi();
        var emptyState = apiClear && typeof apiClear.resetFilterState === 'function' ? apiClear.resetFilterState() : {};
        var searchInput = document.getElementById('matrixSearchInp');
        if(searchInput) searchInput.value = '';
        setMatrixFilterState(emptyState);
        renderMatrix();
      }
      return;
    }

    var removeFilterBtn = target.closest('[data-matrix-filter-remove]');
    if(removeFilterBtn){
      event.preventDefault();
      event.stopPropagation();
      var apiRemove = getFilterApi();
      var nextRemoved = apiRemove && typeof apiRemove.removeFilterChip === 'function'
        ? apiRemove.removeFilterChip(getMatrixFilterState(), removeFilterBtn.getAttribute('data-matrix-filter-remove'))
        : getMatrixFilterState();
      if(removeFilterBtn.getAttribute('data-matrix-filter-remove') === 'search'){
        var searchEl = document.getElementById('matrixSearchInp');
        if(searchEl) searchEl.value = '';
      }
      setMatrixFilterState(nextRemoved);
      renderMatrix();
      return;
    }

    var presetBtn = target.closest('[data-matrix-filter-preset]');
    if(presetBtn){
      event.preventDefault();
      event.stopPropagation();
      var apiPreset = getFilterApi();
      if(apiPreset && typeof apiPreset.buildPresetFilter === 'function'){
        var nextPreset = apiPreset.buildPresetFilter(presetBtn.getAttribute('data-matrix-filter-preset'));
        var currentSearch = document.getElementById('matrixSearchInp');
        if(currentSearch) currentSearch.value = '';
        setMatrixFilterState(nextPreset);
        renderMatrix();
      }
      return;
    }

    var exportBtn = target.closest('[data-matrix-action="export-excel"]');
    if(exportBtn){
      event.preventDefault();
      event.stopPropagation();
      exportMatrixToExcel();
      return;
    }

    var addCurrentBtn = target.closest('[data-matrix-action="add-current-ref"]');
    if(addCurrentBtn){
      if(window.curRef && window.curRef.id){
        addReferenceToMatrix(window.curRef.id, { openView: true });
      }else{
        status('Önce sol panelden bir kaynak seçin.', 'er');
      }
      return;
    }

    var fullscreenBtn = target.closest('[data-matrix-action="toggle-fullscreen"]');
    if(fullscreenBtn){
      event.preventDefault();
      event.stopPropagation();
      toggleMatrixFullscreen();
      return;
    }

    var closeBtn = target.closest('[data-matrix-action="close"]');
    if(closeBtn){
      event.preventDefault();
      event.stopPropagation();
      setView('writing');
      return;
    }

    var removeRowBtn = target.closest('[data-matrix-action="remove-row"]');
    if(removeRowBtn){
      var rowId = text(removeRowBtn.getAttribute('data-row-id'));
      if(!rowId) return;
      if(!window.confirm || window.confirm('Bu matrix satiri silinsin mi?')){
        var api = getMatrixApi();
        var st = state();
        var wsId = getCurrentWorkspaceId();
        if(api && st && wsId){
          var row = api.findRowById(st, wsId, rowId);
          if(row && row.referenceId && typeof api.dismissReference === 'function'){
            api.dismissReference(st, wsId, row.referenceId);
          }
          api.removeRow(st, wsId, rowId);
          saveSoon();
          renderMatrix();
          syncRightPanelWithLinkedNotes([]);
          status('Matrix satiri silindi.', 'ok');
        }
      }
      return;
    }

    var openRefBtn = target.closest('[data-matrix-action="open-reference"]');
    if(openRefBtn){
      var refId = text(openRefBtn.getAttribute('data-ref-id'));
      if(refId && typeof window.openRef === 'function'){
        try{ window.openRef(refId); }catch(_e){}
      }
      return;
    }

    var showInPdfBtn = target.closest('[data-matrix-action="show-in-pdf"]');
    if(showInPdfBtn){
      event.preventDefault();
      event.stopPropagation();
      var rowIdForPdf = text(showInPdfBtn.getAttribute('data-row-id'));
      var colIdForPdf = text(showInPdfBtn.getAttribute('data-col-id'));
      var apiForPdf = getMatrixApi();
      var stForPdf = state();
      var wsIdForPdf = getCurrentWorkspaceId();
      if(!(rowIdForPdf && apiForPdf && stForPdf && wsIdForPdf)){
        status('PDF baglami acilamadi.', 'er');
        return;
      }
      var rowForPdf = apiForPdf.findRowById(stForPdf, wsIdForPdf, rowIdForPdf);
      if(!rowForPdf || !rowForPdf.referenceId){
        status('Matrix satiri bulunamadi.', 'er');
        return;
      }
      var resolvedColumn = pickRowContextColumn(rowForPdf, apiForPdf, colIdForPdf);
      setSelectedCell(rowIdForPdf, resolvedColumn);
      jumpToCellContext(rowForPdf.referenceId, rowForPdf, resolvedColumn);
      return;
    }

    var cell = target.closest('.mx-cell[data-row-id][data-col-id]');
    if(cell){
      var rowId = text(cell.getAttribute('data-row-id'));
      var colId = text(cell.getAttribute('data-col-id'));
      setSelectedCell(rowId, colId);
    }
  }

  function onMatrixInput(event){
    var target = event && event.target ? event.target : null;
    if(target && target.id === 'matrixSearchInp'){
      var next = getMatrixFilterState();
      next.search = text(target.value);
      setMatrixFilterState(next);
      return;
    }
    if(target && updateMatrixFilterFromControl(target)) return;
    var api = getMatrixApi();
    var st = state();
    var wsId = getCurrentWorkspaceId();
    var input = event && event.target && event.target.closest ? event.target.closest('.mx-cell-input[data-row-id][data-col-id]') : null;
    if(!(api && st && wsId && input)) return;
    var rowId = text(input.getAttribute('data-row-id'));
    var colId = text(input.getAttribute('data-col-id'));
    api.setCellText(st, wsId, rowId, colId, input.value || '');
    saveSoon();
  }

  function onMatrixFocusIn(event){
    var input = event && event.target && event.target.closest ? event.target.closest('.mx-cell-input[data-row-id][data-col-id]') : null;
    if(!input) return;
    setSelectedCell(text(input.getAttribute('data-row-id')), text(input.getAttribute('data-col-id')));
  }

  function injectContextMenuAction(ref){
    var menu = document.getElementById('ctxmenu');
    if(!menu || !ref || !ref.id) return;
    if(menu.querySelector('[data-matrix-action="add-reference"]')) return;
    var sep = document.createElement('div');
    sep.className = 'ctx-sep';
    var btn = document.createElement('button');
    btn.className = 'ctxi';
    btn.setAttribute('data-matrix-action', 'add-reference');
    btn.textContent = 'Literatür Matrisine Ekle';
    btn.addEventListener('click', function(event){
      if(event){
        event.preventDefault();
        event.stopPropagation();
      }
      if(typeof window.hideCtx === 'function'){
        try{ window.hideCtx(); }catch(_e){}
      }
      addReferenceToMatrix(ref.id, { openView: true });
    });
    menu.appendChild(sep);
    menu.appendChild(btn);
  }

  function patchContextMenu(){
    if(typeof window.showLabelMenu !== 'function') return;
    if(window.showLabelMenu.__aqMatrixWrapped) return;
    var legacy = window.showLabelMenu;
    var wrapped = function(x, y, ref){
      legacy.call(window, x, y, ref);
      injectContextMenuAction(ref);
    };
    wrapped.__aqMatrixWrapped = true;
    window.showLabelMenu = wrapped;
  }

  function patchWorkspaceTransitions(){
    if(typeof window.switchWs === 'function' && !window.switchWs.__aqMatrixWrapped){
      var legacySwitch = window.switchWs;
      var wrappedSwitch = function(wsId){
        var result = legacySwitch.call(window, wsId);
        setTimeout(function(){
          ensureMatrixShell();
          bindTopMatrixButton();
          renderMatrix();
          setView(currentView);
        }, 0);
        return result;
      };
      wrappedSwitch.__aqMatrixWrapped = true;
      window.switchWs = wrappedSwitch;
    }
    if(typeof window.doAddWs === 'function' && !window.doAddWs.__aqMatrixWrapped){
      var legacyAdd = window.doAddWs;
      var wrappedAdd = function(){
        var result = legacyAdd.apply(window, arguments);
        setTimeout(function(){
          ensureMatrixShell();
          bindTopMatrixButton();
          renderMatrix();
          setView(currentView);
        }, 0);
        return result;
      };
      wrappedAdd.__aqMatrixWrapped = true;
      window.doAddWs = wrappedAdd;
    }
    if(typeof window.delWs === 'function' && !window.delWs.__aqMatrixWrapped){
      var legacyDelete = window.delWs;
      var wrappedDelete = function(){
        var result = legacyDelete.apply(window, arguments);
        setTimeout(function(){
          ensureMatrixShell();
          bindTopMatrixButton();
          renderMatrix();
          setView(currentView);
        }, 0);
        return result;
      };
      wrappedDelete.__aqMatrixWrapped = true;
      window.delWs = wrappedDelete;
    }
  }

  function bind(){
    if(bound) return;
    bound = true;
    ensureMatrixShell();
    bindTopMatrixButton();
    ensureMatrixFullscreenButton();
    var matrixView = document.getElementById('matrixView');
    var search = document.getElementById('matrixSearchInp');
    var searchTimer = null;

    if(matrixView){
      matrixView.addEventListener('input', onMatrixInput);
      matrixView.addEventListener('change', function(event){
        var target = event && event.target ? event.target : null;
        if(target && updateMatrixFilterFromControl(target)){
          event.preventDefault();
          event.stopPropagation();
        }
      });
      matrixView.addEventListener('focusin', onMatrixFocusIn);
    }
    document.addEventListener('click', function(event){
      var target = event && event.target ? event.target : null;
      if(target && target.closest && target.closest('#matrixView')){
        onMatrixClick(event);
      }
    }, true);
    if(search){
      search.addEventListener('input', function(){
        clearTimeout(searchTimer);
        searchTimer = setTimeout(renderMatrix, 180);
      });
    }
  }

  function init(){
    ensureMatrixShell();
    ensureMatrixWorkspaceState();
    bind();
    patchContextMenu();
    patchWorkspaceTransitions();
    renderMatrix();
    setView(currentView);
  }

  window.AQLiteratureMatrix = {
    init: init,
    render: renderMatrix,
    rerunLocalAssistantAutoFill: rerunLocalAssistantAutoFill,
    setView: setView,
    toggleView: function(){ setView(currentView === 'matrix' ? 'writing' : 'matrix'); },
    setFullscreen: setMatrixFullscreen,
    toggleFullscreen: toggleMatrixFullscreen,
    exportExcel: exportMatrixToExcel,
    addReferenceToMatrix: addReferenceToMatrix,
    sendNoteToMatrix: sendNoteToMatrix
  };

  // Expose abstract fetcher so the PDF panel ("no-PDF" fallback in
  // legacy-runtime.js showNoPDF) can pull a Crossref/OpenAlex/S2
  // abstract on demand without re-implementing the cache + dual-source
  // logic. Returns Promise<string>; '' when nothing found.
  window.__aqFetchAbstract = fetchOnlineAbstract;

  window.openLiteratureMatrix = function(){ setView('matrix'); };
  window.closeLiteratureMatrix = function(){ setView('writing'); };
  window.toggleLiteratureMatrix = function(){ setView(currentView === 'matrix' ? 'writing' : 'matrix'); };

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, { once: true });
  }else{
    setTimeout(init, 0);
  }
})();
