(function(){
  var legacyInsCiteNote = null;
  var activeLinkedNoteId = '';
  var boundLinkedSelection = false;
  var missingLinkedNoteToastAt = 0;
  var activeNotebookDetailNoteId = '';

  function escHTML(value){
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeLocator(rawTag){
    var tag = String(rawTag || '').trim();
    if(!tag || /^genel$/i.test(tag)) return '';
    var compact = tag.replace(/\s+/g, ' ').trim();
    if(/^(p|pp)\.\s*\d+/i.test(compact)) return compact;
    var pageMarker = compact.match(/^(s|sayfa)\.?\s*(.+)$/i);
    if(pageMarker){
      var pValue = String(pageMarker[2] || '').trim();
      if(!pValue) return '';
      return /\d+\s*[\-\u2013]\s*\d+/.test(pValue) ? ('pp. ' + pValue) : ('p. ' + pValue);
    }
    if(/^\d+\s*[\-\u2013]\s*\d+$/.test(compact)) return 'pp. ' + compact;
    if(/^\d+$/.test(compact)) return 'p. ' + compact;
    return compact;
  }

  function stripOuterQuotes(text){
    var t = String(text || '').trim();
    if(!t) return '';
    if((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'")){
      return t.slice(1, -1).trim();
    }
    if((t[0] === '“' && t[t.length - 1] === '”') || (t[0] === '‘' && t[t.length - 1] === '’')){
      return t.slice(1, -1).trim();
    }
    return t;
  }

  function splitQuoteParagraphs(text){
    var normalized = stripOuterQuotes(String(text || '').replace(/\r\n?/g, '\n')).trim();
    if(!normalized) return [];
    var blocks = normalized.split(/\n{2,}/).map(function(part){
      return String(part || '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
    if(blocks.length) return blocks;
    return [normalized.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()].filter(Boolean);
  }

  function ensureFinalSentencePunctuation(text){
    var t = String(text || '').trim();
    if(!t) return '';
    if(/[.!?\u2026]["')\]]*$/.test(t)) return t;
    return t + '.';
  }

  function buildAPA7BlockQuoteHTML(quoteSource, refId, citationCore, locator){
    var paragraphs = splitQuoteParagraphs(quoteSource);
    if(!paragraphs.length) return '';
    var citeText = String(citationCore || '').replace(/^\(|\)$/g, '').trim() || 'Bilinmeyen, t.y.';
    if(locator) citeText += ', ' + locator;
    var citationHTML = '<span class="cit" data-ref="' + escHTML(refId) + '">(' + escHTML(citeText) + ')</span>';
    var lastIndex = paragraphs.length - 1;
    paragraphs[lastIndex] = ensureFinalSentencePunctuation(paragraphs[lastIndex]);
    return '<blockquote>' + paragraphs.map(function(paragraph, index){
      var firstClass = index === 0 ? ' class="ni"' : '';
      var citationTail = index === lastIndex ? (' ' + citationHTML) : '';
      return '<p' + firstClass + '>' + escHTML(paragraph) + citationTail + '</p>';
    }).join('') + '</blockquote>';
  }

  function decorateLinkedNoteHTML(html, note, ref){
    var out = String(html || '');
    var linking = window.AQNoteLinking || null;
    if(!linking || typeof linking.decorateNoteInsertionHTML !== 'function') return out;
    try{
      return linking.decorateNoteInsertionHTML(out, {
        noteId: note && note.id,
        referenceId: (ref && ref.id) || (note && note.rid) || '',
        page: (note && note.tag) || (note && note.sourcePage) || '',
        noteType: (note && note.noteType) || (note && note.type) || '',
        notebookId: (note && note.nbId) || ''
      });
    }catch(_e){
      return out;
    }
  }

  function getInlineCitationTextFallback(ref){
    var year = ref && ref.year ? ref.year : 't.y.';
    var authors = ref && Array.isArray(ref.authors) ? ref.authors.filter(Boolean) : [];
    if(!authors.length) return '(Bilinmeyen, ' + year + ')';
    var names = authors.map(function(raw){
      var name = String(raw || '').trim();
      if(!name) return '';
      if(name.indexOf(',') >= 0) return name.split(',')[0].trim();
      var parts = name.split(/\s+/).filter(Boolean);
      return parts.length ? parts[parts.length - 1] : '';
    }).filter(Boolean);
    if(!names.length) return '(Bilinmeyen, ' + year + ')';
    if(names.length === 1) return '(' + names[0] + ', ' + year + ')';
    if(names.length === 2) return '(' + names[0] + ' & ' + names[1] + ', ' + year + ')';
    return '(' + names[0] + ' vd., ' + year + ')';
  }

  function getInlineCitationTextSafe(ref){
    if(window.AQReferenceManager && typeof window.AQReferenceManager.getInlineCitation === 'function'){
      try{
        var fromManager = window.AQReferenceManager.getInlineCitation(ref);
        if(fromManager) return String(fromManager);
      }catch(e){}
    }
    if(typeof window.getInlineCitationText === 'function'){
      try{
        var fromGlobal = window.getInlineCitationText(ref);
        if(fromGlobal) return String(fromGlobal);
      }catch(e){}
    }
    return getInlineCitationTextFallback(ref);
  }

  function getReferenceForNote(note){
    if(!note || !note.rid) return null;
    var workspaceId = window.S && window.S.cur;
    if(window.AQReferenceManager && typeof window.AQReferenceManager.findReference === 'function'){
      try{
        var fromManager = window.AQReferenceManager.findReference(note.rid, workspaceId);
        if(fromManager) return fromManager;
      }catch(e){}
    }
    if(typeof window.findRef === 'function'){
      try{
        return window.findRef(note.rid, workspaceId);
      }catch(e){}
    }
    return null;
  }

  function buildNoteCitationHTML(note, ref){
    var quoteSource = String((note && (note.q || note.txt)) || '').trim();
    if(quoteSource){
      var citeRaw = getInlineCitationTextSafe(ref);
      var citeText = String(citeRaw || '').replace(/^\(|\)$/g, '') || 'Bilinmeyen, t.y.';
      var locator = normalizeLocator(note && note.tag);
      return decorateLinkedNoteHTML(buildAPA7BlockQuoteHTML(quoteSource, ref.id, citeText, locator), note, ref);
    }
    if(typeof window.buildCitationHTML === 'function'){
      try{
        var html = window.buildCitationHTML([ref]);
        if(html) return decorateLinkedNoteHTML(html, note, ref);
      }catch(e){}
    }
    return decorateLinkedNoteHTML('<span class="cit" data-ref="' + escHTML(ref.id) + '">' + escHTML(getInlineCitationTextSafe(ref)) + '</span> ', note, ref);
  }

  function buildPlainNoteHTML(note){
    var text = getNoteTextForDetail(note);
    if(!text) return '';
    var paragraphs = String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map(function(part){
      return String(part || '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
    if(!paragraphs.length) return '';
    var isQuote = note && (note.noteType === 'direct_quote' || note.type === 'hl' || note.q);
    var body = paragraphs.map(function(paragraph, index){
      var firstClass = index === 0 ? ' class="ni"' : '';
      return '<p' + firstClass + '>' + escHTML(paragraph) + '</p>';
    }).join('');
    var html = isQuote ? ('<blockquote>' + body + '</blockquote>') : body;
    return decorateLinkedNoteHTML(html, note, null);
  }

  function insertHTMLIntoEditor(html){
    if(!html) return false;
    var editorRef = (window.AQEditorCore && typeof window.AQEditorCore.getEditor === 'function')
      ? window.AQEditorCore.getEditor()
      : (window.editor || null);
    if(editorRef && editorRef._aqEngine && editorRef.commands && typeof editorRef.commands.insertContent === 'function'){
      try{
        if(window.AQEditorCore && typeof window.AQEditorCore.restoreSelection === 'function'){
          try{ window.AQEditorCore.restoreSelection(null, { focusAtEnd:false }); }catch(_restoreErr){}
        }
        editorRef.commands.insertContent(html, { parseOptions:{ preserveWhitespace:false } });
        if(typeof editorRef.emit === 'function') editorRef.emit('update');
        return true;
      }catch(_aqErr){}
    }
    if(window.AQEditorCore && typeof window.AQEditorCore.restoreSelection === 'function'){
      try{ window.AQEditorCore.restoreSelection(null, { focusAtEnd:false }); }catch(e){}
    }
    if(window.AQEditorCore && typeof window.AQEditorCore.insertHTML === 'function'){
      try{
        if(window.AQEditorCore.insertHTML(html)) return true;
      }catch(e){}
    }
    if(window.editor && window.editor.chain){
      try{
        if(window.editor.chain().focus().insertContent(html, { parseOptions:{ preserveWhitespace:false } }).run()) return true;
      }catch(e){}
    }
    if(typeof window.iHTML === 'function'){
      try{
        window.iHTML(html);
        return true;
      }catch(e){}
    }
    return false;
  }

  function syncReferencesAfterInsert(){
    if(typeof window.rRefs === 'function'){
      try{ window.rRefs(); }catch(e){}
    }
    if(typeof window.updateRefSection === 'function'){
      try{ window.updateRefSection(true); }catch(e){}
    }
    if(typeof window.save === 'function'){
      try{ window.save(); }catch(e){}
    }
  }

  function markInserted(noteId){
    if(typeof window.markNoteInserted === 'function'){
      try{ window.markNoteInserted(noteId); }catch(e){}
    }
  }

  function fallbackInsertNoteCitation(id){
    var note = findNote(id);
    if(!note || !note.rid) return false;
    var ref = getReferenceForNote(note);
    if(!ref) return false;
    var html = buildNoteCitationHTML(note, ref);
    if(!html) return false;
    var inserted = insertHTMLIntoEditor(html);
    if(inserted){
      syncReferencesAfterInsert();
      markInserted(id);
      return true;
    }
    return false;
  }

  function fallbackInsertPlainNote(id){
    var note = findNote(id);
    if(!note) return false;
    var html = buildPlainNoteHTML(note);
    if(!html) return false;
    var inserted = insertHTMLIntoEditor(html);
    if(inserted){
      syncReferencesAfterInsert();
      markInserted(id);
      return true;
    }
    return false;
  }

  function getNotes(){
    return window.S && Array.isArray(window.S.notes) ? window.S.notes : [];
  }

  function findNote(id){
    return getNotes().find(function(note){ return note && note.id == id; }) || null;
  }

  function cssEscape(value){
    var text = String(value == null ? '' : value);
    if(typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function'){
      try{ return CSS.escape(text); }catch(_e){}
    }
    return text.replace(/(["\\])/g, '\\$1');
  }

  function clearLinkedNoteHighlight(){
    var list = document.getElementById('notelist');
    if(!list) return;
    list.querySelectorAll('.nc.note-linked-active').forEach(function(card){
      card.classList.remove('note-linked-active');
    });
  }

  function findNoteCardById(noteId){
    var list = document.getElementById('notelist');
    if(!list) return null;
    var byCard = list.querySelector('.nc[data-note-id="' + cssEscape(noteId) + '"]');
    if(byCard) return byCard;
    var actionNode = Array.from(list.querySelectorAll('[data-note-id]')).find(function(node){
      return String(node.getAttribute('data-note-id') || '') === String(noteId || '');
    });
    return actionNode && actionNode.closest ? actionNode.closest('.nc') : null;
  }

  function revealNoteCard(noteId){
    var card = findNoteCardById(noteId);
    if(card) return card;
    var changed = false;
    if(typeof window.setNoteFilterType === 'function'){ try{ window.setNoteFilterType('all'); changed = true; }catch(_e){} }
    if(typeof window.setNoteFilterUsage === 'function'){ try{ window.setNoteFilterUsage('all'); changed = true; }catch(_e){} }
    if(typeof window.setNoteFilterTag === 'function'){ try{ window.setNoteFilterTag(''); changed = true; }catch(_e){} }
    if(typeof window.setNoteFilterRef === 'function'){ try{ window.setNoteFilterRef('all'); changed = true; }catch(_e){} }
    if(changed && typeof window.rNotes === 'function'){
      try{ window.rNotes(); }catch(_e){}
    }
    return findNoteCardById(noteId);
  }

  function applyLinkedNoteHighlight(noteId, options){
    options = options || {};
    if(!noteId){
      activeLinkedNoteId = '';
      clearLinkedNoteHighlight();
      return false;
    }
    var card = revealNoteCard(noteId);
    clearLinkedNoteHighlight();
    if(!card) return false;
    card.classList.add('note-linked-active');
    activeLinkedNoteId = String(noteId);
    if(options.scrollIntoView !== false){
      try{
        card.scrollIntoView({ block:'nearest', inline:'nearest', behavior: options.behavior || 'smooth' });
      }catch(_e){}
    }
    return true;
  }

  function ensureNotesPanelOpen(){
    if(typeof window.swR !== 'function') return false;
    try{
      var tabBtn = document.getElementById('rtypeNotesBtn') || (document.querySelectorAll('.rtab')[0] || null);
      window.swR('notes', tabBtn || null);
      return true;
    }catch(_e){
      return false;
    }
  }

  function ensureNotebookForNote(note){
    if(!note || !note.nbId || !window.S) return;
    if(String(window.S.curNb || '') === String(note.nbId)) return;
    window.S.curNb = note.nbId;
    if(typeof window.rNB === 'function'){
      try{ window.rNB(); }catch(_e){}
    }
  }

  function getNoteTextForDetail(note){
    if(!note) return '';
    return String(note.comment || note.txt || note.q || note.sourceExcerpt || '').trim();
  }

  function getNotesForCurrentNotebook(){
    var current = window.S && window.S.curNb ? String(window.S.curNb) : '';
    return getNotes().filter(function(note){
      if(!note) return false;
      return !current || String(note.nbId || '') === current;
    });
  }

  function renderNotebookDetailList(selectedId){
    var list = document.getElementById('notebookDetailList');
    if(!list) return;
    var notes = getNotesForCurrentNotebook();
    if(!notes.length){
      list.innerHTML = '<div class="notebook-detail-empty">Bu not defterinde not yok.</div>';
      return;
    }
    list.innerHTML = notes.map(function(note){
      var id = escHTML(note && note.id);
      var text = escHTML(getNoteTextForDetail(note) || '(bos not)');
      var type = escHTML((note && (note.noteType || note.type)) || 'not');
      var meta = escHTML([note && note.src, note && (note.tag || note.sourcePage), note && note.dt].filter(Boolean).join(' · '));
      var active = String(id) === String(selectedId || '') ? ' on' : '';
      return '<button type="button" class="notebook-detail-item' + active + '" data-notebook-detail-note-id="' + id + '">'
        + '<div class="notebook-detail-item-top"><span class="notebook-detail-item-chip">' + type + '</span><span class="notebook-detail-item-date">' + escHTML((note && note.dt) || '') + '</span></div>'
        + '<div class="notebook-detail-item-title">' + text + '</div>'
        + (meta ? '<div class="notebook-detail-item-meta">' + meta + '</div>' : '')
        + '</button>';
    }).join('');
  }

  function selectNotebookDetailNote(noteId, options){
    options = options || {};
    var note = findNote(noteId);
    if(!note) return false;
    ensureNotebookForNote(note);
    activeNotebookDetailNoteId = String(note.id || '');
    renderNotebookDetailList(activeNotebookDetailNoteId);
    var empty = document.getElementById('notebookDetailEmpty');
    var form = document.getElementById('notebookDetailForm');
    var text = document.getElementById('notebookDetailText');
    var tag = document.getElementById('notebookDetailTag');
    var meta = document.getElementById('notebookDetailMeta');
    if(empty) empty.style.display = 'none';
    if(form) form.style.display = '';
    if(text) text.value = getNoteTextForDetail(note);
    if(tag) tag.value = String(note.tag || note.sourcePage || '').trim();
    if(meta) meta.textContent = [note.src, note.rid ? ('ref: ' + note.rid) : '', note.noteType || note.type || '', note.dt].filter(Boolean).join(' · ');
    if(options.focusText !== false && text && typeof text.focus === 'function'){
      try{ text.focus({ preventScroll:true }); }catch(_e){}
    }
    return true;
  }

  function openNotebookDetail(noteId){
    var modal = document.getElementById('notebookDetailModal');
    if(!modal) return false;
    if(noteId){
      var note = findNote(noteId);
      if(note) ensureNotebookForNote(note);
    }
    modal.classList.add('show');
    renderNotebookDetailList(noteId || activeNotebookDetailNoteId || '');
    if(noteId && selectNotebookDetailNote(noteId, { focusText:true })) return true;
    var empty = document.getElementById('notebookDetailEmpty');
    var form = document.getElementById('notebookDetailForm');
    if(empty) empty.style.display = '';
    if(form) form.style.display = 'none';
    return true;
  }

  function closeNotebookDetail(){
    var modal = document.getElementById('notebookDetailModal');
    if(modal) modal.classList.remove('show');
  }

  function saveNotebookDetailNote(){
    var note = findNote(activeNotebookDetailNoteId);
    if(!note) return false;
    var text = document.getElementById('notebookDetailText');
    var tag = document.getElementById('notebookDetailTag');
    var nextText = text ? String(text.value || '').trim() : '';
    var nextTag = tag ? String(tag.value || '').trim() : '';
    if(note.q && !note.txt){
      note.q = nextText;
      note.sourceExcerpt = nextText;
    }else{
      note.txt = nextText;
      note.comment = nextText;
    }
    note.tag = nextTag;
    note.sourcePage = nextTag;
    if(typeof window.save === 'function'){
      try{ window.save(); }catch(_e){}
    }
    if(typeof window.rNotes === 'function'){
      try{ window.rNotes(); }catch(_e){}
    }
    renderNotebookDetailList(activeNotebookDetailNoteId);
    applyLinkedNoteHighlight(activeNotebookDetailNoteId, { scrollIntoView:false });
    return true;
  }

  function deleteNotebookDetailNote(){
    var noteId = activeNotebookDetailNoteId;
    if(!noteId) return false;
    if(typeof window.dNote === 'function'){
      try{ window.dNote(noteId); }catch(_e){}
    }else if(window.S && Array.isArray(window.S.notes)){
      window.S.notes = window.S.notes.filter(function(note){ return note && String(note.id || '') !== String(noteId); });
      if(typeof window.save === 'function'){ try{ window.save(); }catch(_saveErr){} }
      if(typeof window.rNotes === 'function'){ try{ window.rNotes(); }catch(_renderErr){} }
    }
    activeNotebookDetailNoteId = '';
    renderNotebookDetailList('');
    var empty = document.getElementById('notebookDetailEmpty');
    var form = document.getElementById('notebookDetailForm');
    if(empty) empty.style.display = '';
    if(form) form.style.display = 'none';
    return true;
  }

  function focusLinkedNoteById(noteId, options){
    options = options || {};
    var note = findNote(noteId);
    if(!note){
      if(options.clearWhenMissing !== false){
        applyLinkedNoteHighlight('', { scrollIntoView:false });
      }
      if(options.silentMissing) return false;
      var now = Date.now();
      if(now - missingLinkedNoteToastAt > 1500 && typeof window.setDst === 'function'){
        missingLinkedNoteToastAt = now;
        try{
          window.setDst('Bagli not bulunamadi.','er');
          setTimeout(function(){
            try{ if(typeof window.setDst === 'function') window.setDst('',''); }catch(_e){}
          }, 1700);
        }catch(_e){}
      }
      return false;
    }
    ensureNotebookForNote(note);
    ensureNotesPanelOpen();
    if(typeof window.rNotes === 'function'){
      try{ window.rNotes(); }catch(_e){}
    }
    return applyLinkedNoteHighlight(note.id, {
      scrollIntoView: options.scrollIntoView !== false,
      behavior: options.behavior || 'smooth'
    });
  }

  function getEditorForSelectionSync(){
    if(window.AQEditorCore && typeof window.AQEditorCore.getEditor === 'function'){
      try{
        var coreEditor = window.AQEditorCore.getEditor();
        if(coreEditor) return coreEditor;
      }catch(_e){}
    }
    return window.editor || null;
  }

  function resolveCurrentLinkedNote(){
    var linking = window.AQNoteLinking || null;
    if(!linking || typeof linking.resolveLinkFromEditorSelection !== 'function') return null;
    try{
      return linking.resolveLinkFromEditorSelection({
        editor: getEditorForSelectionSync(),
        root: document.getElementById('apaed')
      });
    }catch(_e){
      return null;
    }
  }

  function syncLinkedNoteFromEditorSelection(options){
    options = options || {};
    var link = resolveCurrentLinkedNote();
    if(!link || !link.noteId){
      if(options.clearOnUnlinked !== false){
        applyLinkedNoteHighlight('', { scrollIntoView:false });
      }
      return null;
    }
    if(String(activeLinkedNoteId || '') === String(link.noteId || '')){
      return link;
    }
    focusLinkedNoteById(link.noteId, {
      scrollIntoView: options.scrollIntoView !== false,
      behavior: options.behavior || 'smooth',
      silentMissing: true,
      clearWhenMissing: false
    });
    return link;
  }

  function bindEditorLinkedSelectionSync(){
    if(boundLinkedSelection) return;
    var host = document.getElementById('apaed');
    if(!host || !host.addEventListener) return;
    boundLinkedSelection = true;
    var scheduled = 0;
    function scheduleSync(){
      if(scheduled) return;
      scheduled = setTimeout(function(){
        scheduled = 0;
        syncLinkedNoteFromEditorSelection({ clearOnUnlinked:true, scrollIntoView:true, behavior:'auto' });
      }, 0);
    }
    function syncFromTarget(target){
      var linking = window.AQNoteLinking || null;
      if(!linking || typeof linking.resolveLinkFromDOMNode !== 'function') return false;
      var meta = null;
      try{ meta = linking.resolveLinkFromDOMNode(target || null, host); }catch(_e){ meta = null; }
      if(meta && meta.noteId){
        focusLinkedNoteById(meta.noteId, { scrollIntoView:true, behavior:'auto', silentMissing:true, clearWhenMissing:false });
        return true;
      }
      return false;
    }
    host.addEventListener('click', function(event){
      if(!syncFromTarget(event && event.target ? event.target : null)){
        scheduleSync();
      }
    }, true);
    host.addEventListener('mouseup', scheduleSync);
    host.addEventListener('keyup', scheduleSync);
  }

  function renderNotes(){
    if(typeof window.rNotes !== 'function') return;
    var out = window.rNotes();
    if(activeLinkedNoteId){
      setTimeout(function(){
        applyLinkedNoteHighlight(activeLinkedNoteId, { scrollIntoView:false });
      }, 0);
    }
    return out;
  }

  function saveNote(){
    if(typeof window.saveNote === 'function') return window.saveNote();
  }

  function openNoteSource(id){
    var note = findNote(id);
    if(!note || !note.rid) return false;
    if(typeof window.openRef === 'function'){
      try{
        window.openRef(note.rid);
        return true;
      }catch(e){}
    }
    return false;
  }

  function insertNoteIntoEditor(id){
    var editorRef = (window.AQEditorCore && typeof window.AQEditorCore.getEditor === 'function')
      ? window.AQEditorCore.getEditor()
      : (window.editor || null);
    if(editorRef && editorRef._aqEngine && fallbackInsertNoteCitation(id)){
      return true;
    }
    if(editorRef && editorRef._aqEngine && fallbackInsertPlainNote(id)){
      return true;
    }
    if(window.AQCitationRuntime && typeof window.AQCitationRuntime.insertNoteCitation === 'function'){
      try{
        if(window.AQCitationRuntime.insertNoteCitation(id)){
          markInserted(id);
          return true;
        }
      }catch(e){}
    }
    if(fallbackInsertNoteCitation(id)){
      return true;
    }
    if(fallbackInsertPlainNote(id)){
      return true;
    }
    if(typeof legacyInsCiteNote === 'function'){
      try{
        if(legacyInsCiteNote(id)){
          markInserted(id);
          return true;
        }
      }catch(e){}
    }
    return false;
  }

  function bindNoteListEvents(){
    if(document.__aqNotesBound) return;
    document.__aqNotesBound = true;

    function getNoteActionTarget(event){
      if(!event || !event.target || !event.target.closest) return null;
      var target = event.target.closest('[data-note-action][data-note-id]');
      if(!target) return null;
      var noteList = target.closest('#notelist');
      if(!noteList) return null;
      return target;
    }

    function getNoteCardTarget(event){
      if(!event || !event.target || !event.target.closest) return null;
      if(event.target.closest('[data-note-action],button,input,textarea,select,a')) return null;
      var card = event.target.closest('.nc[data-note-id]');
      if(!card || !card.closest('#notelist')) return null;
      return card;
    }

    function captureBeforeNoteAction(event){
      var target = getNoteActionTarget(event);
      if(!target) return;
      var action = target.getAttribute('data-note-action');
      if(action === 'insert-cite' && window.AQEditorCore && typeof window.AQEditorCore.captureSelection === 'function'){
        try{ window.AQEditorCore.captureSelection(); }catch(e){}
      }
    }

    document.addEventListener('pointerdown', captureBeforeNoteAction, true);
    document.addEventListener('mousedown', captureBeforeNoteAction, true);

    document.addEventListener('click', function(event){
      var target = getNoteActionTarget(event);
      if(!target){
        var card = getNoteCardTarget(event);
        if(card){
          var cardNoteId = String(card.getAttribute('data-note-id') || '');
          if(cardNoteId) openNotebookDetail(cardNoteId);
        }
        return;
      }
      var action = String(target.getAttribute('data-note-action') || '');
      var noteId = String(target.getAttribute('data-note-id') || '');
      if(!noteId) return;

      if(action === 'delete-note'){
        if(typeof window.dNote === 'function') window.dNote(noteId);
        return;
      }
      if(action === 'copy-cite'){
        if(typeof window.cpCite === 'function') window.cpCite(noteId);
        return;
      }
      if(action === 'insert-cite'){
        insertNoteIntoEditor(noteId);
        return;
      }
      if(action === 'send-matrix'){
        if(window.AQLiteratureMatrix && typeof window.AQLiteratureMatrix.sendNoteToMatrix === 'function'){
          window.AQLiteratureMatrix.sendNoteToMatrix(noteId, { openView: true });
        }
        return;
      }
      if(action === 'open-source'){
        openNoteSource(noteId);
      }
    });

    document.addEventListener('click', function(event){
      var target = event && event.target && event.target.closest ? event.target.closest('[data-notebook-detail-note-id]') : null;
      if(!target) return;
      var noteId = String(target.getAttribute('data-notebook-detail-note-id') || '');
      if(noteId) selectNotebookDetailNote(noteId, { focusText:true });
    });

    var openBtn = document.getElementById('nb-open');
    if(openBtn && !openBtn.__aqNotebookDetailBound){
      openBtn.__aqNotebookDetailBound = true;
      openBtn.addEventListener('click', function(){ openNotebookDetail(''); });
    }
    var closeBtn = document.getElementById('notebookDetailCloseBtn');
    if(closeBtn && !closeBtn.__aqNotebookDetailBound){
      closeBtn.__aqNotebookDetailBound = true;
      closeBtn.addEventListener('click', closeNotebookDetail);
    }
    var saveBtn = document.getElementById('notebookDetailSaveBtn');
    if(saveBtn && !saveBtn.__aqNotebookDetailBound){
      saveBtn.__aqNotebookDetailBound = true;
      saveBtn.addEventListener('click', saveNotebookDetailNote);
    }
    var deleteBtn = document.getElementById('notebookDetailDeleteBtn');
    if(deleteBtn && !deleteBtn.__aqNotebookDetailBound){
      deleteBtn.__aqNotebookDetailBound = true;
      deleteBtn.addEventListener('click', deleteNotebookDetailNote);
    }
  }

  function init(){
    if(typeof window.rNotes === 'function' && !window.__aqNotesLinkedRenderPatched){
      window.__aqNotesLinkedRenderPatched = true;
      var legacyRenderNotes = window.rNotes;
      window.rNotes = function(){
        var result = legacyRenderNotes.apply(this, arguments);
        if(activeLinkedNoteId){
          setTimeout(function(){
            applyLinkedNoteHighlight(activeLinkedNoteId, { scrollIntoView:false });
          }, 0);
        }
        return result;
      };
    }
    if(typeof window.insCiteNote === 'function' && window.insCiteNote !== insertNoteIntoEditor){
      legacyInsCiteNote = window.insCiteNote;
    }
    window.insCiteNote = function(id){
      return insertNoteIntoEditor(id);
    };
    bindNoteListEvents();
    bindEditorLinkedSelectionSync();
  }

  window.AQNotes = {
    init: init,
    getNotes: getNotes,
    findNote: findNote,
    renderNotes: renderNotes,
    saveNote: saveNote,
    openNotebookDetail: openNotebookDetail,
    openNoteSource: openNoteSource,
    insertNoteIntoEditor: insertNoteIntoEditor,
    focusLinkedNoteById: focusLinkedNoteById,
    syncLinkedNoteFromEditorSelection: syncLinkedNoteFromEditorSelection,
    clearLinkedNoteHighlight: clearLinkedNoteHighlight
  };

  function safeInit(){
    if(window.__aqNotesInitDone) return;
    window.__aqNotesInitDone = true;
    try{ init(); }catch(_e){}
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', safeInit, { once:true });
  }else{
    setTimeout(safeInit, 0);
  }
})();
