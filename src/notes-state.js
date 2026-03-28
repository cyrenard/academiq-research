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
    return {
      id: input.id,
      nbId: input.notebookId,
      type: 'm',
      txt: text,
      q: '',
      src: input.source || '',
      rid: input.referenceId || '',
      tag: String(input.tag || '').trim() || 'genel',
      dt: input.dateText || ''
    };
  }

  function createHighlightNote(input){
    input = input || {};
    return {
      id: input.id,
      nbId: input.notebookId,
      type: 'hl',
      txt: '',
      q: String(input.quoteText || '').trim() || '(metin yok)',
      src: input.source || '',
      rid: input.referenceId || '',
      tag: input.pageTag || '',
      dt: input.dateText || '',
      hlColor: input.highlightColor || ''
    };
  }

  function deleteNote(notes, noteId){
    return (Array.isArray(notes) ? notes : []).filter(function(note){
      return note && note.id != noteId;
    });
  }

  function renderNotesHTML(notes, options){
    options = options || {};
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
      return '<div class="nc" style="' + cardStyle + '">'
        + (note.src ? '<div class="ncsrc" style="' + srcStyle + '">' + escHTML(note.src) + (note.tag ? ' &middot; ' + escHTML(note.tag) : '') + '</div>' : '')
        + (note.txt ? '<div class="nctxt" style="' + txtStyle + '">' + escHTML(note.txt) + '</div>' : '')
        + (note.q ? '<div class="ncq" style="border-left-color:' + escHTML(borderColor) + ';' + quoteStyle + '">' + escHTML(note.q) + '</div>' : '')
        + '<div class="ncacts">'
        + (note.rid ? '<button class="ncb" style="' + btnStyle + '" onclick="cpCite(\'' + escHTML(note.id) + '\')">At&#305;f&#305; Kopyala</button>' : '')
        + (note.rid ? '<button class="ncb" style="' + btnStyle + '" onmousedown="if(window.AQEditorCore&&typeof window.AQEditorCore.captureSelection===\'function\'){window.AQEditorCore.captureSelection();}" onclick="if(window.AQNotes&&typeof window.AQNotes.insertNoteIntoEditor===\'function\'){window.AQNotes.insertNoteIntoEditor(\'' + escHTML(note.id) + '\');}else{insCiteNote(\'' + escHTML(note.id) + '\');}">Metne Ekle</button>' : '')
        + '</div>'
        + '<button class="ncdel" style="' + delStyle + '" onclick="dNote(\'' + escHTML(note.id) + '\')">&#215;</button></div>';
    }).join('');
  }

  return {
    createManualNote: createManualNote,
    createHighlightNote: createHighlightNote,
    deleteNote: deleteNote,
    renderNotesHTML: renderNotesHTML
  };
});
