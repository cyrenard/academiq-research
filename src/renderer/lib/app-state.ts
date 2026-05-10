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
  notebooks?: Array<{ id: string; name: string }>;
  curNb?: string;
  cm?: string;
  [key: string]: unknown;
};

const blankDoc = '<p></p>';

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeHTML(value: unknown) {
  const html = String(value || '').trim();
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
    notebooks: [{ id: 'nb1', name: 'Genel Notlar' }],
    curNb: 'nb1',
    cm: 'apa7'
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

  return {
    ...source,
    wss,
    cur: currentWorkspace.id,
    docs,
    curDoc: currentDoc.id,
    doc: normalizeHTML(currentDoc.content || source.doc),
    notes: Array.isArray(source.notes) ? source.notes.map((note, index) => ({ ...note, id: String(note?.id || `note${index + 1}`) })) : [],
    notebooks: Array.isArray(source.notebooks) && source.notebooks.length ? source.notebooks : fallback.notebooks,
    curNb: source.curNb || fallback.curNb,
    cm: source.cm || 'apa7'
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
  return { ...state, cur: workspace.id, curDoc: doc.id, doc: normalizeHTML(doc.content) };
}

export function addWorkspace(state: AcademiqAppState, name?: string): AcademiqAppState {
  const workspaceId = uid('ws');
  const docId = uid('doc');
  const workspaceName = (name || `Workspace ${state.wss.length + 1}`).trim();
  return {
    ...state,
    wss: [...state.wss, { id: workspaceId, name: workspaceName, docId, lib: [] }],
    docs: [...state.docs, { id: docId, name: workspaceName, content: blankDoc }],
    cur: workspaceId,
    curDoc: docId,
    doc: blankDoc
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
    doc: normalizeHTML(fallbackDoc.content)
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
    notes: state.notes.map((note) => note.rid === referenceId ? { ...note, rid: '' } : note)
  };
}

export function addManualNote(state: AcademiqAppState, input: { text: string; tag?: string; noteType?: string; referenceId?: string }): AcademiqAppState {
  const text = input.text.trim();
  if (!text) return state;
  const note: AcademiqNote = {
    id: uid('note'),
    nbId: state.curNb || 'nb1',
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
