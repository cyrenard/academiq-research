(function(root, factory){
  var api = factory();
  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  root.AQNotesState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function escHTML(value){
    return String(value == null ? '' : value)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function createManualNote(input){
    input = input || {};
    var text = String(input.text || '').trim();
    if(!text) return null;
    var noteType = String(input.noteType || 'summary').trim() || 'summary';
    return {
      id: input.id,
      nbId: input.notebookId,
      type: 'm',
      txt: text,
      q: '',
      src: input.source || '',
      rid: input.referenceId || '',
      tag: String(input.tag || '').trim() || 'genel',
      dt: input.dateText || '',
      noteType: noteType,
      sourceExcerpt: '',
      comment: text,
      sourcePage: String(input.tag || '').trim() || '',
      inserted: !!input.inserted
    };
  }

  function createHighlightNote(input){
    input = input || {};
    var quoteText = String(input.quoteText || '').trim() || '(metin yok)';
    var noteType = String(input.noteType || 'direct_quote').trim() || 'direct_quote';
    return {
      id: input.id,
      nbId: input.notebookId,
      type: 'hl',
      txt: '',
      q: quoteText,
      src: input.source || '',
      rid: input.referenceId || '',
      tag: input.pageTag || '',
      dt: input.dateText || '',
      hlColor: input.highlightColor || '',
      noteType: noteType,
      sourceExcerpt: quoteText,
      comment: '',
      sourcePage: String(input.pageTag || '').trim(),
      inserted: !!input.inserted
    };
  }

  function deleteNote(notes, noteId){
    return (Array.isArray(notes) ? notes : []).filter(function(note){
      return note && note.id != noteId;
    });
  }

  function renderNotesHTML(notes, options){
    options = options || {};
    var noteTypeLabel = typeof options.noteTypeLabel === 'function'
      ? options.noteTypeLabel
      : function(type){ return String(type || 'Not'); };
    var list = Array.isArray(notes) ? notes : [];
    if(!list.length){
      return '<div style="color:var(--txt3);font-size:12px;padding:14px;text-align:center;">PDF\'ten metin se&#231; &#8594; Nota Kaydet<br/>veya a&#351;a&#287;&#305;dan yaz.</div>';
    }
    var cardStyle = options.cardStyle || '';
    var srcStyle = options.srcStyle || '';
    var txtStyle = options.txtStyle || '';
    var quoteStyle = options.quoteStyle || '';
    var btnStyle = options.btnStyle || '';
    var delStyle = options.delStyle || '';

    return list.map(function(note){
      note = note || {};
      var isHL = note.type === 'hl';
      var borderColor = isHL && note.hlColor ? note.hlColor : 'var(--acc-d)';
      var noteId = escHTML(note.id);
      var nType = escHTML(note.noteType || (isHL ? 'direct_quote' : 'summary'));
      var nTypeLabel = escHTML(noteTypeLabel(note.noteType || (isHL ? 'direct_quote' : 'summary')));
      var usageLabel = note.inserted ? 'Belgede kullanıldı' : 'Kullanılmadı';
      var usageClass = note.inserted ? 'note-used' : 'note-unused';
      return '<div class="nc" data-note-id="' + noteId + '" style="' + cardStyle + '">'
        + '<div class="ncmeta"><span class="nctype ' + nType + '">' + nTypeLabel + '</span><span class="ncusage ' + usageClass + '">' + usageLabel + '</span></div>'
        + (note.src ? '<div class="ncsrc" style="' + srcStyle + '">' + escHTML(note.src) + (note.tag ? ' &middot; ' + escHTML(note.tag) : '') + '</div>' : '')
        + (note.txt ? '<div class="nctxt" style="' + txtStyle + '">' + escHTML(note.txt) + '</div>' : '')
        + (note.q ? '<div class="ncq" style="border-left-color:' + escHTML(borderColor) + ';' + quoteStyle + '">' + escHTML(note.q) + '</div>' : '')
        + '<div class="ncacts">'
        + (note.rid ? '<button class="ncb" style="' + btnStyle + '" data-note-action="copy-cite" data-note-id="' + noteId + '">At&#305;f&#305; Kopyala</button>' : '')
        + (note.rid ? '<button class="ncb" style="' + btnStyle + '" data-note-action="insert-cite" data-note-id="' + noteId + '">Metne Ekle</button>' : '')
        + (note.rid ? '<button class="ncb" style="' + btnStyle + '" data-note-action="send-matrix" data-note-id="' + noteId + '">Matrise G&#246;nder</button>' : '')
        + (isHL && note.rid ? '<button class="ncb" style="' + btnStyle + '" data-note-action="open-source" data-note-id="' + noteId + '">Kayna&#287;a Git</button>' : '')
        + '</div>'
        + '<button class="ncdel" style="' + delStyle + '" data-note-action="delete-note" data-note-id="' + noteId + '">&#215;</button></div>';
    }).join('');
  }

  return {
    createManualNote: createManualNote,
    createHighlightNote: createHighlightNote,
    deleteNote: deleteNote,
    renderNotesHTML: renderNotesHTML
  };
});
