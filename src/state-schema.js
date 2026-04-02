(function(root){
  var SCHEMA_VERSION = 2;

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
    if(!Array.isArray(ws.lib)) ws.lib = [];
    ws.lib = ws.lib.map(normalizeReference);
    return ws;
  }

  function normalizeDoc(doc, idx, sanitize){
    doc = doc || {};
    return {
      id: doc.id || ('doc' + (idx + 1)),
      name: doc.name || ('Belge ' + (idx + 1)),
      content: sanitize(doc.content || blankDoc()),
      bibliographyHTML: typeof doc.bibliographyHTML === 'string' ? doc.bibliographyHTML : '',
      bibliographyManual: !!doc.bibliographyManual,
      coverHTML: typeof doc.coverHTML === 'string' ? doc.coverHTML : '',
      tocHTML: typeof doc.tocHTML === 'string' ? doc.tocHTML : ''
    };
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
      customLabels: clone(state.customLabels || [])
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

    linkWorkspaceDocs(state, sanitize);

    if(typeof state.showPageNumbers === 'undefined') state.showPageNumbers = false;
    if(!Array.isArray(state.customLabels)) state.customLabels = [];
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
