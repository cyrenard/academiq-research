import { defaultAISettings, sanitizeAISettings } from '../ai/settings';

export type AcademiqReference = {
  id: string;
  title?: string;
  authors?: string[];
  year?: string;
  doi?: string;
  url?: string;
  journal?: string;
  labels?: Array<string | { name?: string; color?: string }>;
  [key: string]: unknown;
};

export type AcademiqWorkspace = {
  id: string;
  name: string;
  docId?: string;
  lib: AcademiqReference[];
  [key: string]: unknown;
};

export type AcademiqDocument = {
  id: string;
  name?: string;
  content: string;
  [key: string]: unknown;
};

export type AcademiqNote = {
  id: string;
  wsId?: string;
  nbId?: string;
  type?: string;
  txt?: string;
  q?: string;
  src?: string;
  rid?: string;
  tag?: string;
  dt?: string;
  noteType?: string;
  inserted?: boolean;
  [key: string]: unknown;
};

export type AcademiqAppState = {
  schemaVersion?: number;
  wss: AcademiqWorkspace[];
  cur: string;
  docs: AcademiqDocument[];
  curDoc: string;
  doc: string;
  notes: AcademiqNote[];
  notebooks?: Array<{ id: string; name: string; wsId?: string }>;
  curNb?: string;
  cm?: string;
  /**
   * AI matrix worker settings (model selection, install state, runtime
   * preferences). Populated by sanitizeAISettings(); when missing the
   * defaults from defaultAISettings() apply. Persists with main state.
   */
  ai?: ReturnType<typeof defaultAISettings>;
  [key: string]: unknown;
};

const blankDoc = '<p></p>';

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function repairWordImportText(text: string) {
  let out = String(text || '')
    .replace(/\u00ad/g, '')
    .replace(/[\u200b-\u200d\ufeff]/g, ' ');
  if (!out) return out;

  const nextWords = [
    'birlikte', 'gelmi\u015ftir', 'gelmistir', 'g\u00f6r\u00fclmektedir', 'gorulmektedir',
    'yaln\u0131zca', 'yalnizca', '\u00f6\u011frenme', 'ogrenme', 'ileti\u015fim', 'iletisim',
    'bilgi', '\u00fcretimi', 'uretimi', 'gibi', '\u00e7e\u015fitli', 'cesitli', 'alanlarda',
    'aktif', '\u015fekilde', 'sekilde', 'kullan\u0131lmaya', 'kullanilmaya',
    'ba\u015flad\u0131\u011f\u0131', 'basladigi', 'hayat\u0131m\u0131z\u0131n', 'hayatimizin',
    'alan\u0131na', 'alanina', 'giren', 'bireyler', '\u00fczerinde', 'uzerinde',
    'bili\u015fsel', 'bilissel', 'izler', 'b\u0131rakan', 'birakan', 'kavram', 'olarak',
    'ortaya', 'konmaktad\u0131r', 'konmaktadir', 'durum', 'insan', 'bili\u015finin',
    'bilisinin', 'sadece', 'i\u00e7sel', 'icsel', 'unsurlarla', 'de\u011fil', 'degil',
    'teknoloji', 'd\u0131\u015fsal', 'dissal', 'etkile\u015fim', 'etkilesim', 'i\u00e7erisine',
    'icerisine', 'girdi\u011fini', 'girdigini', 'sayesinde', 'yo\u011fun', 'yogun',
    'ak\u0131\u015f\u0131', 'akisi', 'y\u00fck\u00fcn\u00fc', 'yukunu', 'art\u0131rabilmekte',
    'artirabilmekte', 'd\u00fczenleme', 'duzenleme', 'yeniden', 'organize', 'etme',
    'becerilerinin', '\u00f6nemini', 'onemini', 'ili\u015fkileri', 'iliskileri',
    'ili\u015fkiler', 'iliskiler', 'bulunabilmektedir', 'bulunabilmekte', 'bulunabilir',
    'dijitalle\u015fmenin', 'dijitallesmenin', 'yayg\u0131nla\u015fmas\u0131yla',
    'yayginlasmasiyla', 'teknolojilerin', 'platformlar', 'arac\u0131l\u0131\u011f\u0131yla',
    'araciligiyla', 'kullan\u0131lan', 'kullanilan', 'olmaktan', '\u00e7\u0131k\u0131p',
    'cikip', 'ba\u011flamda', 'baglamda', 'bireylerin', 'becerileri',
    'art\u0131rmaktad\u0131r', 'artirmaktadir', 'd\u00fczenlenmesi', 'duzenlenmesi'
  ];
  const letterClass = '0-9A-Za-z\\u00c0-\\u024f\\u1e00-\\u1eff\\u00c7\\u011e\\u0130\\u00d6\\u015e\\u00dc\\u00e7\\u011f\\u0131\\u00f6\\u015f\\u00fc';

  nextWords
    .slice()
    .sort((a, b) => b.length - a.length)
    .forEach((word) => {
      if (word.length < 5) return;
      const escaped = escapeRegExp(word);
      const middle = new RegExp(`([${letterClass}])(${escaped})(?=[${letterClass}])`, 'gi');
      const end = new RegExp(`([${letterClass}])(${escaped})(?=$|[^${letterClass}])`, 'gi');
      const split = (match: string, prev: string, next: string, offset: number, source: string) => {
        const before = source.slice(Math.max(0, offset - 18), offset + 1).toLowerCase();
        if (/(?:https?|doi|www)\.?$/i.test(before)) return match;
        return `${prev} ${next}`;
      };
      out = out.replace(middle, split).replace(end, split);
    });

  return out
    .replace(/(^|\s)(\u00e7e\u015fitli|cesitli)\s+leri\s+(bulunabilmektedir|bulunabilmekte|bulunabilir)\b/gi, '$1$2 ili\u015fkileri $3')
    .replace(/,([A-Za-z\u00c0-\u024f\u1e00-\u1eff\u00c7\u011e\u0130\u00d6\u015e\u00dc\u00e7\u011f\u0131\u00f6\u015f\u00fc])/g, ', $1')
    .replace(/;([A-Za-z\u00c0-\u024f\u1e00-\u1eff\u00c7\u011e\u0130\u00d6\u015e\u00dc\u00e7\u011f\u0131\u00f6\u015f\u00fc])/g, '; $1')
    .replace(/\.([A-Z\u00c0-\u024f\u1e00-\u1eff\u00c7\u011e\u0130\u00d6\u015e\u00dc])/g, '. $1')
    .replace(/\s{2,}/g, ' ');
}

function repairImportedWordHTML(value: string) {
  const runtime = typeof window !== 'undefined' ? (window as any).AQTipTapWordIO : null;
  if (runtime && typeof runtime.repairWordImportHTML === 'function') {
    try {
      return String(runtime.repairWordImportHTML(value) || value);
    } catch (_error) {}
  }
  const html = String(value || '').replace(/<(span|sup|sub|b|strong|i|em|u|s|strike)\b[^>]*>(?:\s|&nbsp;|\u00a0|\u200b|\u200c|\u200d|\ufeff|\u00ad)*<\/\1\s*>/gi, '');
  if (/<[a-z][\s\S]*>/i.test(html)) {
    return html.replace(/>([^<>]+)</g, (_match, text) => `>${repairWordImportText(text)}<`);
  }
  return repairWordImportText(html);
}

function normalizeHTML(value: unknown) {
  const html = repairImportedWordHTML(String(value || '')).trim();
  return html || blankDoc;
}

export function createBlankState(): AcademiqAppState {
  return {
    schemaVersion: 2,
    wss: [{ id: 'ws1', name: 'Calisma Alani 1', docId: 'doc1', lib: [] }],
    cur: 'ws1',
    docs: [{ id: 'doc1', name: 'Calisma Alani 1', content: blankDoc }],
    curDoc: 'doc1',
    doc: blankDoc,
    notes: [],
    notebooks: [{ id: 'ws1:nb1', wsId: 'ws1', name: 'Genel Notlar' }],
    curNb: 'ws1:nb1',
    cm: 'apa7',
    localMatrixAssistant: {
      enabled: false,
      provider: 'rule-guard',
      allowModelProvider: false,
      composeCells: false,
      maxCandidatesPerColumn: 4,
      maxSnippetChars: 1200,
      minConfidence: 0.5,
      updatedAt: 0
    },
    ai: defaultAISettings()
  };
}

export function hydrateAppState(raw: unknown): AcademiqAppState {
  const source = raw && typeof raw === 'object' ? raw as Partial<AcademiqAppState> : {};
  const fallback = createBlankState();
  const wss = Array.isArray(source.wss) && source.wss.length
    ? source.wss.map((ws, index) => ({
        ...ws,
        id: String(ws?.id || `ws${index + 1}`),
        name: String(ws?.name || `Workspace ${index + 1}`),
        docId: String(ws?.docId || ''),
        lib: Array.isArray(ws?.lib) ? ws.lib.map((ref, refIndex) => ({ ...ref, id: String(ref?.id || `ref_${index}_${refIndex}`) })) : []
      }))
    : fallback.wss;
  const docs = Array.isArray(source.docs) && source.docs.length
    ? source.docs.map((doc, index) => ({
        ...doc,
        id: String(doc?.id || `doc${index + 1}`),
        name: String(doc?.name || `Belge ${index + 1}`),
        content: normalizeHTML(doc?.content)
      }))
    : fallback.docs;

  const currentWorkspace = wss.find((ws) => ws.id === source.cur) || wss[0];
  const curDoc = currentWorkspace.docId && docs.some((doc) => doc.id === currentWorkspace.docId)
    ? currentWorkspace.docId
    : String(source.curDoc || docs[0].id);
  const currentDoc = docs.find((doc) => doc.id === curDoc) || docs[0];
  const workspaceIds = new Set(wss.map((workspace) => workspace.id));
  const inferNoteWorkspaceId = (note: any) => {
    const explicit = String(note?.wsId || note?.workspaceId || '').trim();
    if (explicit && workspaceIds.has(explicit)) return explicit;
    const rid = String(note?.rid || note?.referenceId || '').trim();
    if (rid) {
      const owner = wss.find((workspace) => Array.isArray(workspace.lib) && workspace.lib.some((ref) => ref.id === rid));
      if (owner) return owner.id;
    }
    return currentWorkspace.id;
  };
  const notebooks = Array.isArray(source.notebooks) && source.notebooks.length
    ? source.notebooks.map((notebook, index) => {
        const rawWsId = String((notebook as any)?.wsId || (notebook as any)?.workspaceId || currentWorkspace.id);
        const wsId = workspaceIds.has(rawWsId) ? rawWsId : currentWorkspace.id;
        return {
          ...notebook,
          id: String(notebook?.id || `${wsId}:nb${index + 1}`),
          wsId,
          name: String(notebook?.name || 'Genel Notlar')
        };
      })
    : [];
  wss.forEach((workspace) => {
    if (!notebooks.some((notebook) => notebook.wsId === workspace.id)) {
      notebooks.push({ id: `${workspace.id}:nb1`, wsId: workspace.id, name: 'Genel Notlar' });
    }
  });
  const notebookIds = new Set(notebooks.map((notebook) => notebook.id));
  const activeNotebook = notebooks.find((notebook) => notebook.wsId === currentWorkspace.id) || notebooks[0];

  return {
    ...source,
    wss,
    cur: currentWorkspace.id,
    docs,
    curDoc: currentDoc.id,
    doc: normalizeHTML(currentDoc.content || source.doc),
    notes: Array.isArray(source.notes) ? source.notes.map((note, index) => {
      const wsId = inferNoteWorkspaceId(note);
      const fallbackNotebook = notebooks.find((notebook) => notebook.wsId === wsId)?.id || `${wsId}:nb1`;
      const nbId = String(note?.nbId || note?.notebookId || fallbackNotebook);
      return {
        ...note,
        id: String(note?.id || `note${index + 1}`),
        wsId,
        nbId: notebookIds.has(nbId) ? nbId : fallbackNotebook
      };
    }) : [],
    notebooks,
    curNb: notebookIds.has(String(source.curNb || '')) ? String(source.curNb) : activeNotebook?.id || fallback.curNb,
    cm: source.cm || 'apa7',
    localMatrixAssistant: {
      ...((fallback.localMatrixAssistant && typeof fallback.localMatrixAssistant === 'object') ? fallback.localMatrixAssistant as Record<string, unknown> : {}),
      ...((source.localMatrixAssistant && typeof source.localMatrixAssistant === 'object') ? source.localMatrixAssistant as Record<string, unknown> : {})
    },
    ai: sanitizeAISettings(source.ai)
  };
}

export function getActiveWorkspace(state: AcademiqAppState) {
  return state.wss.find((workspace) => workspace.id === state.cur) || state.wss[0];
}

export function getActiveDocument(state: AcademiqAppState) {
  return state.docs.find((doc) => doc.id === state.curDoc) || state.docs[0];
}

export function updateActiveDocumentHTML(state: AcademiqAppState, html: string): AcademiqAppState {
  const nextHTML = normalizeHTML(html);
  return {
    ...state,
    doc: nextHTML,
    docs: state.docs.map((doc) => doc.id === state.curDoc ? { ...doc, content: nextHTML } : doc)
  };
}

export function addDocument(state: AcademiqAppState, name?: string): AcademiqAppState {
  const docId = uid('doc');
  const docName = (name || `Belge ${state.docs.length + 1}`).trim();
  return {
    ...state,
    docs: [...state.docs, {
      id: docId,
      name: docName,
      content: blankDoc,
      bibliographyHTML: '',
      bibliographyManual: false,
      bibliographyExtraRefIds: [],
      coverHTML: '',
      tocHTML: '',
      abstractHTML: '',
      appendicesHTML: '',
      citationStyle: state.cm || 'apa7'
    }],
    curDoc: docId,
    doc: blankDoc
  };
}

export function switchDocument(state: AcademiqAppState, docId: string): AcademiqAppState {
  const doc = state.docs.find((item) => item.id === docId);
  if (!doc) return state;
  return { ...state, curDoc: doc.id, doc: normalizeHTML(doc.content) };
}

export function renameDocument(state: AcademiqAppState, docId: string, name: string): AcademiqAppState {
  const nextName = name.trim();
  if (!nextName) return state;
  return {
    ...state,
    docs: state.docs.map((doc) => doc.id === docId ? { ...doc, name: nextName } : doc)
  };
}

export function deleteDocument(state: AcademiqAppState, docId: string): AcademiqAppState {
  if (state.docs.length <= 1) return state;
  const docs = state.docs.filter((doc) => doc.id !== docId);
  if (docs.length === state.docs.length) return state;
  const current = docs.find((doc) => doc.id === state.curDoc) || docs[0];
  return {
    ...state,
    docs,
    wss: state.wss.map((workspace) => workspace.docId === docId ? { ...workspace, docId: current.id } : workspace),
    curDoc: current.id,
    doc: normalizeHTML(current.content)
  };
}

export function switchWorkspace(state: AcademiqAppState, workspaceId: string): AcademiqAppState {
  const workspace = state.wss.find((item) => item.id === workspaceId);
  if (!workspace) return state;
  const docId = workspace.docId && state.docs.some((doc) => doc.id === workspace.docId)
    ? workspace.docId
    : state.curDoc;
  const doc = state.docs.find((item) => item.id === docId) || getActiveDocument(state);
  const workspaceNotebook = (state.notebooks || []).find((notebook) => notebook.wsId === workspace.id);
  return { ...state, cur: workspace.id, curDoc: doc.id, doc: normalizeHTML(doc.content), curNb: workspaceNotebook?.id || `${workspace.id}:nb1` };
}

export function addWorkspace(state: AcademiqAppState, name?: string): AcademiqAppState {
  const workspaceId = uid('ws');
  const docId = uid('doc');
  const workspaceName = (name || `Workspace ${state.wss.length + 1}`).trim();
  const notebookId = `${workspaceId}:nb1`;
  return {
    ...state,
    wss: [...state.wss, { id: workspaceId, name: workspaceName, docId, lib: [] }],
    docs: [...state.docs, { id: docId, name: workspaceName, content: blankDoc }],
    cur: workspaceId,
    curDoc: docId,
    doc: blankDoc,
    notebooks: [...(state.notebooks || []), { id: notebookId, wsId: workspaceId, name: 'Genel Notlar' }],
    curNb: notebookId
  };
}

export function renameWorkspace(state: AcademiqAppState, workspaceId: string, name: string): AcademiqAppState {
  const nextName = name.trim();
  if (!nextName) return state;
  return {
    ...state,
    wss: state.wss.map((workspace) => workspace.id === workspaceId ? { ...workspace, name: nextName } : workspace),
    docs: state.docs.map((doc) => {
      const owner = state.wss.find((workspace) => workspace.id === workspaceId && workspace.docId === doc.id);
      return owner ? { ...doc, name: nextName } : doc;
    })
  };
}

export function deleteWorkspace(state: AcademiqAppState, workspaceId: string): AcademiqAppState {
  if (state.wss.length <= 1) return state;
  const removed = state.wss.find((workspace) => workspace.id === workspaceId);
  const wss = state.wss.filter((workspace) => workspace.id !== workspaceId);
  const docs = removed?.docId ? state.docs.filter((doc) => doc.id !== removed.docId) : state.docs;
  const fallback = wss.find((workspace) => workspace.id === state.cur) || wss[0];
  const fallbackDoc = docs.find((doc) => doc.id === fallback.docId) || docs[0];
  return {
    ...state,
    wss,
    docs,
    cur: fallback.id,
    curDoc: fallbackDoc.id,
    doc: normalizeHTML(fallbackDoc.content),
    notes: state.notes.filter((note) => note.wsId !== workspaceId),
    notebooks: (state.notebooks || []).filter((notebook) => notebook.wsId !== workspaceId),
    curNb: (state.notebooks || []).find((notebook) => notebook.wsId === fallback.id)?.id || `${fallback.id}:nb1`
  };
}

export function addReferenceToActiveWorkspace(state: AcademiqAppState, reference: AcademiqReference): AcademiqAppState {
  const workspace = getActiveWorkspace(state);
  const nextRef = { ...reference, id: reference.id || uid('ref') };
  return {
    ...state,
    wss: state.wss.map((item) => item.id === workspace.id
      ? { ...item, lib: [nextRef, ...(Array.isArray(item.lib) ? item.lib : [])] }
      : item)
  };
}

export function updateReferenceInActiveWorkspace(state: AcademiqAppState, referenceId: string, patch: Partial<AcademiqReference>): AcademiqAppState {
  const workspace = getActiveWorkspace(state);
  return {
    ...state,
    wss: state.wss.map((item) => item.id === workspace.id
      ? {
          ...item,
          lib: (item.lib || []).map((ref) => ref.id === referenceId ? { ...ref, ...patch } : ref)
        }
      : item)
  };
}

export function removeReferenceFromActiveWorkspace(state: AcademiqAppState, referenceId: string): AcademiqAppState {
  const workspace = getActiveWorkspace(state);
  return {
    ...state,
    wss: state.wss.map((item) => item.id === workspace.id
      ? { ...item, lib: (item.lib || []).filter((ref) => ref.id !== referenceId) }
      : item),
    notes: state.notes.map((note) => note.wsId === workspace.id && note.rid === referenceId ? { ...note, rid: '' } : note)
  };
}

export function addManualNote(state: AcademiqAppState, input: { text: string; tag?: string; noteType?: string; referenceId?: string }): AcademiqAppState {
  const text = input.text.trim();
  if (!text) return state;
  const note: AcademiqNote = {
    id: uid('note'),
    wsId: state.cur,
    nbId: state.curNb || `${state.cur}:nb1`,
    type: 'm',
    txt: text,
    q: '',
    src: '',
    rid: input.referenceId || '',
    tag: input.tag?.trim() || 'genel',
    dt: new Date().toISOString().slice(0, 10),
    noteType: input.noteType || 'summary',
    sourceExcerpt: '',
    comment: text,
    sourcePage: input.tag?.trim() || '',
    inserted: false
  };
  return { ...state, notes: [note, ...state.notes] };
}

export function deleteNote(state: AcademiqAppState, noteId: string): AcademiqAppState {
  return { ...state, notes: state.notes.filter((note) => note.id !== noteId) };
}

export function referenceTitle(ref: AcademiqReference) {
  return String(ref.title || ref.doi || ref.url || 'Başlıksız kaynak');
}

export function referenceAuthors(ref: AcademiqReference) {
  return Array.isArray(ref.authors) && ref.authors.length ? ref.authors.join(', ') : 'Yazar yok';
}

export function referenceTags(ref: AcademiqReference) {
  return (Array.isArray(ref.labels) ? ref.labels : [])
    .map((label) => typeof label === 'string' ? label : String(label?.name || ''))
    .filter(Boolean)
    .slice(0, 3);
}
