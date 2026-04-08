(function(root){
  var SCHEMA_VERSION = 3;

  function clone(value){
    if(Array.isArray(value)) return value.map(clone);
    if(value && typeof value === 'object'){
      var out = {};
      Object.keys(value).forEach(function(key){
        out[key] = clone(value[key]);
      });
      return out;
    }
    return value;
  }

  function blankDoc(){
    return '<p></p>';
  }

  function normalizeDoi(value){
    var raw = String(value || '').trim();
    if(!raw) return '';
    try{ raw = decodeURIComponent(raw); }catch(e){}
    raw = raw
      .replace(/^doi:\s*/i, '')
      .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, '')
      .replace(/[)\].,;:]+$/g, '');
    var match = raw.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
    var doi = (match && match[0]) ? match[0] : raw;
    doi = doi
      .replace(/(?:\/|\.)(BIBTEX|RIS|ABSTRACT|FULLTEXT|FULL|PDF|XML|HTML|EPUB)$/i, '')
      .replace(/\/[A-Za-z]$/i, '')
      .replace(/[)\].,;:]+$/g, '')
      .toLowerCase();
    if(!/^10\.\d{4,9}\//i.test(doi)) return '';
    return doi;
  }

  function normalizeYear(value){
    var text = String(value || '').trim();
    if(!text) return '';
    var match = text.match(/\b(19|20)\d{2}\b/);
    return match ? match[0] : text;
  }

  function normalizeText(value){
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeReference(ref){
    ref = ref || {};
    if(!ref.id && root && typeof root.uid === 'function') ref.id = root.uid();
    if(!Array.isArray(ref.authors)) ref.authors = ref.authors ? [String(ref.authors)] : [];
    ref.authors = ref.authors.map(function(author){ return normalizeText(author); }).filter(Boolean);
    if(!Array.isArray(ref.labels)) ref.labels = [];
    ref.labels = ref.labels.map(function(label){
      if(typeof label === 'string') return normalizeText(label);
      if(label && typeof label === 'object' && label.name) return normalizeText(label.name);
      return '';
    }).filter(Boolean);
    if(typeof ref.title !== 'string') ref.title = ref.title ? String(ref.title) : '';
    if(typeof ref.year !== 'string') ref.year = ref.year ? String(ref.year) : '';
    if(typeof ref.journal !== 'string') ref.journal = ref.journal ? String(ref.journal) : '';
    if(typeof ref.volume !== 'string') ref.volume = ref.volume ? String(ref.volume) : '';
    if(typeof ref.issue !== 'string') ref.issue = ref.issue ? String(ref.issue) : '';
    if(typeof ref.fp !== 'string') ref.fp = ref.fp ? String(ref.fp) : '';
    if(typeof ref.lp !== 'string') ref.lp = ref.lp ? String(ref.lp) : '';
    if(typeof ref.doi !== 'string') ref.doi = ref.doi ? String(ref.doi) : '';
    if(typeof ref.url !== 'string') ref.url = ref.url ? String(ref.url) : '';
    if(typeof ref.pdfUrl !== 'string') ref.pdfUrl = ref.pdfUrl ? String(ref.pdfUrl) : '';
    if(!Array.isArray(ref.collectionIds)) ref.collectionIds = [];
    ref.collectionIds = ref.collectionIds.map(function(id){ return normalizeText(id); }).filter(Boolean);
    ref.title = normalizeText(ref.title);
    ref.year = normalizeYear(ref.year);
    ref.journal = normalizeText(ref.journal);
    ref.volume = normalizeText(ref.volume);
    ref.issue = normalizeText(ref.issue);
    ref.fp = normalizeText(ref.fp);
    ref.lp = normalizeText(ref.lp);
    ref.url = normalizeText(ref.url);
    ref.pdfUrl = normalizeText(ref.pdfUrl);
    ref.doi = normalizeDoi(ref.doi || ref.url || '');
    return ref;
  }

  function normalizeWorkspace(ws, idx){
    ws = ws || {};
    if(!ws.id) ws.id = 'ws' + (idx + 1);
    if(!ws.name) ws.name = '\u00c7al\u0131\u015fma Alan\u0131 ' + (idx + 1);
    if(typeof ws.docId !== 'string') ws.docId = ws.docId ? String(ws.docId) : '';
    if(!Array.isArray(ws.collections)) ws.collections = [];
    ws.collections = ws.collections
      .filter(function(col){ return col && typeof col === 'object'; })
      .map(function(col){
        return {
          id: normalizeText(col.id || ('col-' + Math.random().toString(36).slice(2, 8))),
          name: normalizeText(col.name || 'Koleksiyon')
        };
      })
      .filter(function(col){ return col.id && col.name; });
    if(!Array.isArray(ws.lib)) ws.lib = [];
    ws.lib = ws.lib.map(normalizeReference);
    return ws;
  }

  function normalizeDoc(doc, idx, sanitize){
    doc = doc || {};
    var citationStyle = String(doc.citationStyle || '').trim().toLowerCase();
    if(!citationStyle) citationStyle = 'apa7';
    return {
      id: doc.id || ('doc' + (idx + 1)),
      name: doc.name || ('Belge ' + (idx + 1)),
      content: sanitize(doc.content || blankDoc()),
      bibliographyHTML: typeof doc.bibliographyHTML === 'string' ? doc.bibliographyHTML : '',
      bibliographyManual: !!doc.bibliographyManual,
      coverHTML: typeof doc.coverHTML === 'string' ? doc.coverHTML : '',
      tocHTML: typeof doc.tocHTML === 'string' ? doc.tocHTML : '',
      citationStyle: citationStyle
    };
  }

  function normalizeNotes(notes, notebooks, currentNotebookId){
    var list = Array.isArray(notes) ? notes : [];
    var notebookIds = {};
    (Array.isArray(notebooks) ? notebooks : []).forEach(function(nb){
      if(nb && nb.id) notebookIds[nb.id] = true;
    });
    var fallbackNotebookId = currentNotebookId || ((Array.isArray(notebooks) && notebooks[0] && notebooks[0].id) ? notebooks[0].id : 'nb1');

    return list
      .filter(function(note){ return note && typeof note === 'object'; })
      .map(function(note){
        var out = clone(note);
        var nbId = out.nbId || out.notebookId || out.nb || fallbackNotebookId;
        if(!notebookIds[nbId]) nbId = fallbackNotebookId;
        out.nbId = nbId;
        if(typeof out.id !== 'string' || !out.id){
          out.id = (root && typeof root.uid === 'function') ? root.uid() : ('note-' + Math.random().toString(36).slice(2, 10));
        }
        if(typeof out.type !== 'string' || !out.type){
          out.type = out.q ? 'hl' : 'm';
        }
        out.txt = typeof out.txt === 'string' ? out.txt : (out.txt ? String(out.txt) : '');
        out.q = typeof out.q === 'string' ? out.q : (out.q ? String(out.q) : '');
        out.src = typeof out.src === 'string' ? out.src : (out.src ? String(out.src) : '');
        out.rid = typeof out.rid === 'string' ? out.rid : (out.rid ? String(out.rid) : '');
        out.tag = typeof out.tag === 'string' ? out.tag : (out.tag ? String(out.tag) : '');
        out.dt = typeof out.dt === 'string' ? out.dt : (out.dt ? String(out.dt) : '');
        out.hlColor = typeof out.hlColor === 'string' ? out.hlColor : (out.hlColor ? String(out.hlColor) : '');
        out.noteType = typeof out.noteType === 'string' && out.noteType.trim()
          ? out.noteType
          : (out.type === 'hl' ? 'direct_quote' : 'summary');
        out.sourceExcerpt = typeof out.sourceExcerpt === 'string'
          ? out.sourceExcerpt
          : (out.q ? String(out.q) : '');
        out.comment = typeof out.comment === 'string'
          ? out.comment
          : (out.txt ? String(out.txt) : '');
        out.sourcePage = typeof out.sourcePage === 'string'
          ? out.sourcePage
          : (out.tag ? String(out.tag) : '');
        out.inserted = !!out.inserted;
        return out;
      });
  }

  function normalizeMatrixCell(cell){
    function normalizeCellText(value){
      return String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim();
    }
    if(typeof cell === 'string'){
      return {
        text: normalizeCellText(cell),
        noteIds: [],
        source: { page: '', snippet: '', updatedAt: 0 }
      };
    }
    cell = cell && typeof cell === 'object' ? cell : {};
    var source = cell.source && typeof cell.source === 'object' ? cell.source : {};
    return {
      text: normalizeCellText(cell.text || ''),
      noteIds: (Array.isArray(cell.noteIds) ? cell.noteIds : [])
        .map(function(noteId){ return normalizeText(noteId); })
        .filter(Boolean),
      source: {
        page: normalizeText(source.page || ''),
        snippet: normalizeCellText(source.snippet || ''),
        updatedAt: Number(source.updatedAt) > 0 ? Number(source.updatedAt) : 0
      }
    };
  }

  function normalizeLiteratureMatrix(rawMatrix){
    var matrix = rawMatrix && typeof rawMatrix === 'object' ? clone(rawMatrix) : {};
    var editableColumns = ['purpose', 'method', 'sample', 'findings', 'limitations', 'myNotes'];
    var out = {};
    Object.keys(matrix).forEach(function(workspaceId){
      var wsKey = normalizeText(workspaceId);
      if(!wsKey) return;
      var source = matrix[workspaceId] && typeof matrix[workspaceId] === 'object' ? matrix[workspaceId] : {};
      var rows = Array.isArray(source.rows) ? source.rows : [];
      var seenRef = {};
      var normalizedRows = rows.map(function(row){
        row = row && typeof row === 'object' ? row : {};
        var referenceId = normalizeText(row.referenceId || '');
        if(!referenceId) return null;
        var refKey = referenceId.toLowerCase();
        if(seenRef[refKey]) return null;
        seenRef[refKey] = true;
        var cells = {};
        editableColumns.forEach(function(column){
          cells[column] = normalizeMatrixCell(row.cells && row.cells[column]);
        });
        return {
          id: normalizeText(row.id || ('mxr-' + Math.random().toString(36).slice(2, 11))),
          workspaceId: wsKey,
          referenceId: referenceId,
          cells: cells,
          createdAt: Number(row.createdAt) > 0 ? Number(row.createdAt) : Date.now(),
          updatedAt: Number(row.updatedAt) > 0 ? Number(row.updatedAt) : Date.now()
        };
      }).filter(Boolean);

      var selected = source.selectedCell && typeof source.selectedCell === 'object'
        ? {
            rowId: normalizeText(source.selectedCell.rowId || ''),
            columnKey: normalizeText(source.selectedCell.columnKey || '')
          }
        : null;
      var dismissedReferenceIds = (Array.isArray(source.dismissedReferenceIds) ? source.dismissedReferenceIds : [])
        .map(function(referenceId){ return normalizeText(referenceId); })
        .filter(Boolean);
      if(selected && !selected.rowId){
        selected = null;
      }
      out[wsKey] = {
        rows: normalizedRows,
        selectedCell: selected,
        dismissedReferenceIds: dismissedReferenceIds,
        updatedAt: Number(source.updatedAt) > 0 ? Number(source.updatedAt) : Date.now()
      };
    });
    return out;
  }

  function scopeLiteratureMatrixToWorkspaces(state){
    var matrix = normalizeLiteratureMatrix(state.literatureMatrix || {});
    var workspaceMap = {};
    (Array.isArray(state.wss) ? state.wss : []).forEach(function(ws){
      if(ws && ws.id){
        workspaceMap[ws.id] = ws;
      }
    });
    var scoped = {};
    Object.keys(matrix).forEach(function(workspaceId){
      if(!workspaceMap[workspaceId]) return;
      var bucket = matrix[workspaceId];
      var libMap = {};
      (workspaceMap[workspaceId].lib || []).forEach(function(ref){
        if(ref && ref.id) libMap[String(ref.id).toLowerCase()] = true;
      });
      var rows = (bucket.rows || []).filter(function(row){
        var rid = normalizeText(row && row.referenceId);
        return !!(rid && libMap[rid.toLowerCase()]);
      });
      var selected = bucket.selectedCell;
      if(selected && !rows.some(function(row){ return row.id === selected.rowId; })){
        selected = null;
      }
      scoped[workspaceId] = {
        rows: rows,
        selectedCell: selected,
        dismissedReferenceIds: (bucket.dismissedReferenceIds || []).filter(function(referenceId){
          var rid = normalizeText(referenceId);
          return !!(rid && libMap[rid.toLowerCase()]);
        }),
        updatedAt: bucket.updatedAt
      };
    });
    return scoped;
  }

  function linkWorkspaceDocs(state, sanitize){
    if(!Array.isArray(state.wss) || !state.wss.length){
      state.wss = [normalizeWorkspace(null, 0)];
    }
    if(!Array.isArray(state.docs) || !state.docs.length){
      state.docs = [{ id:'doc1', name:'Belge 1', content: sanitize(state.doc || blankDoc()) }];
    }

    state.wss = state.wss.map(normalizeWorkspace);
    state.docs = state.docs.map(function(doc, idx){
      return normalizeDoc(doc, idx, sanitize);
    });

    var docsById = {};
    state.docs.forEach(function(doc){
      docsById[doc.id] = doc;
    });

    var claimedDocIds = {};
    state.wss.forEach(function(ws, idx){
      var linkedId = ws.docId && docsById[ws.docId] && !claimedDocIds[ws.docId] ? ws.docId : '';
      if(!linkedId){
        var candidate = state.docs[idx];
        if(candidate && !claimedDocIds[candidate.id]){
          linkedId = candidate.id;
        }else{
          candidate = normalizeDoc({
            name: ws.name,
            content: blankDoc()
          }, state.docs.length, sanitize);
          state.docs.push(candidate);
          docsById[candidate.id] = candidate;
          linkedId = candidate.id;
        }
      }
      ws.docId = linkedId;
      if(docsById[linkedId]){
        docsById[linkedId].name = ws.name;
      }
      claimedDocIds[linkedId] = true;
    });

    state.docs = state.docs.filter(function(doc){
      return doc && claimedDocIds[doc.id];
    });

    if(!state.cur || !state.wss.some(function(ws){ return ws.id === state.cur; })){
      state.cur = state.wss[0].id;
    }

    var currentWs = state.wss.find(function(ws){ return ws.id === state.cur; }) || state.wss[0];
    state.curDoc = currentWs ? currentWs.docId : state.docs[0].id;
    var currentDoc = state.docs.find(function(doc){ return doc.id === state.curDoc; }) || state.docs[0];

    // Migration: only recover from legacy state.doc if schemaVersion is missing (pre-v2 data)
    if(!state.schemaVersion){
      var legacyDoc = state.doc && state.doc.trim() && state.doc.trim() !== blankDoc() ? state.doc.trim() : '';
      if(legacyDoc && currentDoc && (!currentDoc.content || currentDoc.content.trim() === '' || currentDoc.content.trim() === blankDoc())){
        currentDoc.content = sanitize(legacyDoc);
      }
    }
    // state.doc always reflects current doc's content
    state.doc = sanitize((currentDoc && currentDoc.content) || blankDoc());
  }

  function serialize(state, options){
    options = options || {};
    var sanitize = options.sanitize || function(html){ return html || blankDoc(); };
    return {
      schemaVersion: SCHEMA_VERSION,
      wss: (state.wss || []).map(function(ws){
        return {
          id: ws.id,
          name: ws.name,
          docId: ws.docId,
          collections: clone(ws.collections || []),
          lib: (ws.lib || []).map(function(ref){
            var clean = clone(ref);
            delete clean.pdfData;
            return clean;
          })
        };
      }),
      cur: state.cur,
      notebooks: clone(state.notebooks || []),
      curNb: state.curNb,
      notes: clone(state.notes || []),
      doc: sanitize(state.doc || blankDoc()),
      cm: state.cm,
      docs: (state.docs || []).map(function(doc, idx){
        return normalizeDoc(doc, idx, sanitize);
      }),
      curDoc: state.curDoc,
      showPageNumbers: !!state.showPageNumbers,
      customLabels: clone(state.customLabels || []),
      literatureMatrix: scopeLiteratureMatrixToWorkspaces(state)
    };
  }

  function hydrate(raw, options){
    options = options || {};
    var sanitize = options.sanitize || function(html){ return html || blankDoc(); };
    var state = raw && typeof raw === 'object' ? clone(raw) : {};

    if(!Array.isArray(state.notebooks) || !state.notebooks.length){
      state.notebooks = [{ id:'nb1', name:'Genel Notlar' }];
    }
    if(!state.curNb) state.curNb = state.notebooks[0].id;
    if(!Array.isArray(state.notes)) state.notes = [];
    state.notes = normalizeNotes(state.notes, state.notebooks, state.curNb);

    linkWorkspaceDocs(state, sanitize);

    if(typeof state.showPageNumbers === 'undefined') state.showPageNumbers = false;
    if(!Array.isArray(state.customLabels)) state.customLabels = [];
    state.literatureMatrix = scopeLiteratureMatrixToWorkspaces(state);
    state.schemaVersion = state.schemaVersion || 0;
    return state;
  }

  var api = {
    version: SCHEMA_VERSION,
    blankDoc: blankDoc,
    serialize: serialize,
    hydrate: hydrate
  };

  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.AQStateSchema = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
