(function(){
  var currentView = 'writing';
  var bound = false;
  var saveTimer = 0;
  var autoFillPassByWorkspace = {};
  var autoSeedPassByWorkspace = {};
  var autoSeedStatusTokenByWorkspace = {};
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

  function getTopMatrixButton(){
    return document.getElementById('tbMatrixBtn');
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
    if(pdfPanel && pdfPanel.style.display === 'none'){
      var pdfBtn = document.getElementById('togglePdfBtn');
      if(pdfBtn) pdfBtn.click();
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
      hint.style.display = 'block';
    }else{
      hint.style.display = 'none';
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
    if(topBtn) return topBtn;
    var exportBtn = document.getElementById('tbExportMenuBtn');
    if(!exportBtn || !exportBtn.parentElement) return null;
    topBtn = document.createElement('button');
    topBtn.className = 'btn';
    topBtn.id = 'tbMatrixBtn';
    topBtn.type = 'button';
    topBtn.textContent = 'Literatür Matrisi';
    exportBtn.parentElement.insertAdjacentElement('afterend', topBtn);
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

    var oldBar = document.getElementById('workspaceViewBar');
    if(oldBar) oldBar.style.display = 'none';

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
        + '</div>'
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

    var quick = document.getElementById('matrixQuickGrp');
    if(quick) quick.style.display = 'none';
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
      var autoCells = api.inferAutoCellsFromReference(item.ref, {
        notes: Array.isArray(st.notes) ? st.notes : [],
        extraText: pdfText
      });
      api.applyAutoCellsToRow(st, wsId, item.row.id, autoCells, { overwrite: false });
      if(Number(item.row.updatedAt || 0) !== before){
        changed = true;
      }
    });
    if(changed){
      saveSoon();
    }
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
        var autoCells = api.inferAutoCellsFromReference(item.ref, {
          notes: Array.isArray(st.notes) ? st.notes : [],
          extraText: extraText
        });
        api.applyAutoCellsToRow(st, wsId, item.row.id, autoCells, { overwrite: false });
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

  function renderMatrix(){
    var api = getMatrixApi();
    var st = state();
    var wsId = getCurrentWorkspaceId();
    var table = document.getElementById('matrixTable');
    var empty = document.getElementById('matrixEmptyState');
    if(!(api && st && wsId && table)) return;

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
    var query = getMatrixSearchQuery();
    var filteredRows = rows.filter(function(row){
      var ref = findReferenceInWorkspace(row.referenceId);
      return rowMatchesQuery(row, ref, query, api);
    });

    if(!filteredRows.length){
      table.innerHTML = '';
      if(empty){
        empty.style.display = 'block';
        empty.textContent = rows.length
          ? 'Filtreye uyan satir bulunamadi.'
          : 'Henüz kaynak eklenmedi. Sol panelde bir kaynağa sağ tık yapıp "Literatür Matrisine Ekle" seçebilirsiniz.';
      }
      return;
    }
    if(empty) empty.style.display = 'none';

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
        return '<td class="mx-cell" data-row-id="' + escHTML(row.id) + '" data-col-id="' + escHTML(columnKey) + '">'
          + (noteCount ? '<span class="mx-note-count">' + noteCount + ' not</span>' : '')
          + '<div class="mx-cell-actions"><button type="button" class="mx-cell-btn" data-matrix-action="show-in-pdf" data-row-id="' + escHTML(row.id) + '" data-col-id="' + escHTML(columnKey) + '">PDFte Goster</button></div>'
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
    var autoCells = api.inferAutoCellsFromReference(ref, {
      notes: Array.isArray(st.notes) ? st.notes : [],
      extraText: pdfText
    });
    api.applyAutoCellsToRow(st, wsId, result.row.id, autoCells, { overwrite: false });
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
      var autoCells = api.inferAutoCellsFromReference(ref, {
        notes: Array.isArray(st.notes) ? st.notes : [],
        extraText: pdfText
      });
      api.applyAutoCellsToRow(st, wsId, ensured.row.id, autoCells, { overwrite: false });
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

    if(escroll) escroll.style.display = writing ? '' : 'none';
    if(matrixView) matrixView.style.display = writing ? 'none' : 'flex';
    if(zoomBar) zoomBar.style.display = writing ? '' : 'none';
    if(findbar && !writing) findbar.style.display = 'none';
    if(matrixBtn){
      matrixBtn.classList.toggle('on', !writing);
      matrixBtn.textContent = writing ? 'Literatür Matrisi' : 'Yazıya Dön';
    }
    applyMatrixFullscreenState();

    if(!writing){
      renderMatrix();
      var selected = getSelectedCellFromState();
      if(selected && selected.rowId && selected.columnKey){
        setSelectedCell(selected.rowId, selected.columnKey);
      }else{
        syncRightPanelWithLinkedNotes([]);
      }
    }
  }

  function onMatrixClick(event){
    var target = event && event.target ? event.target : null;
    if(!target) return;

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
      toggleMatrixFullscreen();
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

    if(matrixView){
      matrixView.addEventListener('click', onMatrixClick);
      matrixView.addEventListener('input', onMatrixInput);
      matrixView.addEventListener('focusin', onMatrixFocusIn);
    }
    if(search){
      search.addEventListener('input', function(){ renderMatrix(); });
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
    setView: setView,
    toggleView: function(){ setView(currentView === 'matrix' ? 'writing' : 'matrix'); },
    setFullscreen: setMatrixFullscreen,
    toggleFullscreen: toggleMatrixFullscreen,
    addReferenceToMatrix: addReferenceToMatrix,
    sendNoteToMatrix: sendNoteToMatrix
  };

  window.openLiteratureMatrix = function(){ setView('matrix'); };
  window.closeLiteratureMatrix = function(){ setView('writing'); };
  window.toggleLiteratureMatrix = function(){ setView(currentView === 'matrix' ? 'writing' : 'matrix'); };

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, { once: true });
  }else{
    setTimeout(init, 0);
  }
})();
