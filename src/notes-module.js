(function(){
  var legacyInsCiteNote = null;

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
    var citationHTML = '<span class="cit" data-ref="' + escHTML(refId) + '" contenteditable="false">(' + escHTML(citeText) + ')</span>';
    var lastIndex = paragraphs.length - 1;
    paragraphs[lastIndex] = ensureFinalSentencePunctuation(paragraphs[lastIndex]);
    return '<blockquote>' + paragraphs.map(function(paragraph, index){
      var firstClass = index === 0 ? ' class="ni"' : '';
      var citationTail = index === lastIndex ? (' ' + citationHTML) : '';
      return '<p' + firstClass + '>' + escHTML(paragraph) + citationTail + '</p>';
    }).join('') + '</blockquote>';
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
      return buildAPA7BlockQuoteHTML(quoteSource, ref.id, citeText, locator);
    }
    if(typeof window.buildCitationHTML === 'function'){
      try{
        var html = window.buildCitationHTML([ref]);
        if(html) return html;
      }catch(e){}
    }
    return '<span class="cit" data-ref="' + escHTML(ref.id) + '" contenteditable="false">' + escHTML(getInlineCitationTextSafe(ref)) + '</span> ';
  }

  function insertHTMLIntoEditor(html){
    if(!html) return false;
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

  function renderNotes(){
    if(typeof window.rNotes === 'function') return window.rNotes();
  }

  function saveNote(){
    if(typeof window.saveNote === 'function') return window.saveNote();
  }

  function insertNoteIntoEditor(id){
    if(window.AQCitationRuntime && typeof window.AQCitationRuntime.insertNoteCitation === 'function'){
      try{
        if(window.AQCitationRuntime.insertNoteCitation(id)) return true;
      }catch(e){}
    }
    if(typeof legacyInsCiteNote === 'function'){
      try{
        if(legacyInsCiteNote(id)) return true;
      }catch(e){}
    }
    return fallbackInsertNoteCitation(id);
  }

  function init(){
    if(typeof window.insCiteNote === 'function' && window.insCiteNote !== insertNoteIntoEditor){
      legacyInsCiteNote = window.insCiteNote;
    }
    window.insCiteNote = function(id){
      return insertNoteIntoEditor(id);
    };
  }

  window.AQNotes = {
    init: init,
    getNotes: getNotes,
    findNote: findNote,
    renderNotes: renderNotes,
    saveNote: saveNote,
    insertNoteIntoEditor: insertNoteIntoEditor
  };
})();
