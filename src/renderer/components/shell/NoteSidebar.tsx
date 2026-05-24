import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import type { AcademiqNote, AcademiqReference } from '../../lib/app-state';
import { referenceAuthors, referenceTitle } from '../../lib/app-state';
import { legacyFeatures, runLegacyFeature } from '../../lib/legacy-feature-adapter';
import { VirtualList } from '../ui/VirtualList';

export type NoteSidebarTab = 'refs' | 'pdf' | 'notes' | 'matrix';

type NoteSidebarProps = {
  activeTab: NoteSidebarTab;
  onTabChange: (tab: NoteSidebarProps['activeTab']) => void;
  notes: AcademiqNote[];
  notebooks?: Array<{ id: string; name: string; wsId?: string }>;
  references: AcademiqReference[];
  usedReferences?: AcademiqReference[];
  workspaceName: string;
  documentName: string;
  activeReferenceId: string;
  onSelectReference: (id: string) => void;
  onAddNote: (input: { text: string; tag?: string; noteType?: string }) => void;
  onUpdateNote: (id: string, patch: Record<string, unknown>) => void;
  onDeleteNote: (id: string) => void;
  onDeleteNoteTag: (tag: string) => void;
  onCreateNotebook: (name: string) => void;
  onRenameNotebook: (id: string, name: string) => void;
  onDeleteNotebook: (id: string) => void;
  onMoveNoteToNotebook: (noteId: string, notebookId: string) => void;
  onInsertNote: (note: AcademiqNote) => void;
  onInsertCitation: (refId: string) => void;
  onEditReference: (refId: string) => void;
  onReferencePdfAction: (action: 'open' | 'show' | 'delete' | 'download' | 'browser', refId: string) => void;
  onOpenPDF: () => void;
  onOpenMatrix: () => void;
  onAction: (message: string) => void;
};

export function NoteSidebar({
  activeTab,
  onTabChange,
  notes,
  notebooks = [],
  references,
  usedReferences,
  workspaceName,
  activeReferenceId,
  onSelectReference,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onDeleteNoteTag,
  onCreateNotebook,
  onRenameNotebook,
  onDeleteNotebook,
  onMoveNoteToNotebook,
  onInsertNote,
  onInsertCitation,
  onEditReference,
  onReferencePdfAction,
  onOpenMatrix,
  onAction
}: NoteSidebarProps) {
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState('summary');
  const [tag, setTag] = useState('');
  const [editingNoteId, setEditingNoteId] = useState('');
  const [editingText, setEditingText] = useState('');
  const [editingTag, setEditingTag] = useState('');
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [selectedNotebookId, setSelectedNotebookId] = useState('all');
  const [newNotebookName, setNewNotebookName] = useState('');
  const [renamingNotebookId, setRenamingNotebookId] = useState('');
  const [renamingNotebookName, setRenamingNotebookName] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [usageFilter, setUsageFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [refFilter, setRefFilter] = useState('all');
  const [noteMenu, setNoteMenu] = useState<{ noteId: string; x: number; y: number } | null>(null);
  const [tagPopup, setTagPopup] = useState<{ noteId: string; x: number; y: number } | null>(null);
  const [deleteNotebookConfirm, setDeleteNotebookConfirm] = useState<{ id: string; x: number; y: number } | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const visibleTab: 'notes' | 'refs' = activeTab === 'refs' ? 'refs' : 'notes';
  const bibliographyReferences = usedReferences || references;
  const editingNote = notes.find((note) => note.id === editingNoteId) || null;
  const menuNote = noteMenu ? notes.find((note) => note.id === noteMenu.noteId) || null : null;
  const tagPopupNote = tagPopup ? notes.find((note) => note.id === tagPopup.noteId) || null : null;
  const fallbackNotebookId = notebooks[0]?.id || '';
  const notebookCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of notes) {
      const nbId = String(note.nbId || '');
      counts.set(nbId, (counts.get(nbId) || 0) + 1);
    }
    return new Map(notebooks.map((notebook) => [
      notebook.id,
      counts.get(notebook.id) || 0
    ]));
  }, [notebooks, notes]);
  const isInboxNote = (note: AcademiqNote) => {
    const hasSource = Boolean(note.src || note.rid || note.q || note.sourceExcerpt);
    return hasSource && !note.inserted;
  };
  const inboxCount = useMemo(() => notes.filter(isInboxNote).length, [notes]);
  const getNoteTags = (note: AcademiqNote) => String(note.tag || note.sourcePage || '')
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const noteTags = useMemo(() => Array.from(new Set(notes
    .flatMap((note) => getNoteTags(note)))).sort((a, b) => a.localeCompare(b)), [notes]);
  const filteredNotes = useMemo(() => notes.filter((note) => {
    const noteTypeValue = String(note.noteType || (note.type === 'hl' ? 'direct_quote' : note.type || 'summary'));
    const noteTagList = getNoteTags(note);
    if (selectedNotebookId === 'inbox' && !isInboxNote(note)) return false;
    if (selectedNotebookId !== 'all' && selectedNotebookId !== 'inbox' && String(note.nbId || fallbackNotebookId) !== selectedNotebookId) return false;
    if (typeFilter !== 'all' && noteTypeValue !== typeFilter) return false;
    if (usageFilter === 'inserted' && !note.inserted) return false;
    if (usageFilter === 'not_inserted' && note.inserted) return false;
    if (tagFilter !== 'all' && !noteTagList.includes(tagFilter)) return false;
    if (refFilter !== 'all' && String(note.rid || '') !== refFilter) return false;
    return true;
  }), [notes, refFilter, tagFilter, typeFilter, usageFilter, selectedNotebookId, fallbackNotebookId]);

  useEffect(() => {
    if (!editingNoteId) return;
    const next = notes.find((note) => note.id === editingNoteId);
    if (!next) {
      setEditingNoteId('');
      return;
    }
    setEditingText(String(next.txt || next.q || next.comment || next.sourceExcerpt || ''));
    setEditingTag(String(next.tag || next.sourcePage || ''));
  }, [editingNoteId, notes]);

  const submitNote = () => {
    if (!noteText.trim()) {
      onAction('Not metni bos');
      return;
    }
    onAddNote({ text: noteText, tag, noteType });
    setNoteText('');
    setTag('');
  };

  const run = (id: string) => {
    const feature = legacyFeatures.find((item) => item.id === id);
    if (!feature || !runLegacyFeature(feature)) onAction('Komut hazır değil');
  };

  const openNoteEditor = (note: AcademiqNote) => {
    setNotebookOpen(true);
    setEditingNoteId(note.id);
    setEditingText(String(note.txt || note.q || note.comment || note.sourceExcerpt || ''));
    setEditingTag(String(note.tag || note.sourcePage || ''));
  };

  const openNotebook = () => {
    setNotebookOpen(true);
    if (!editingNoteId && filteredNotes[0]) openNoteEditor(filteredNotes[0]);
  };

  const notePreview = (note: AcademiqNote) => String(note.txt || note.q || note.comment || note.sourceExcerpt || '(bos not)');

  const submitNotebook = () => {
    const name = newNotebookName.trim();
    if (!name) {
      onAction('Not defteri adi bos');
      return;
    }
    onCreateNotebook(name);
    setNewNotebookName('');
  };

  const beginRenameNotebook = (notebook: { id: string; name: string }) => {
    setDeleteNotebookConfirm(null);
    setRenamingNotebookId(notebook.id);
    setRenamingNotebookName(notebook.name);
  };

  const submitRenameNotebook = () => {
    const name = renamingNotebookName.trim();
    if (!renamingNotebookId || !name) return;
    onRenameNotebook(renamingNotebookId, name);
    setRenamingNotebookId('');
    setRenamingNotebookName('');
  };

  const askDeleteNotebook = (event: MouseEvent<HTMLButtonElement>, notebook: { id: string }) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setRenamingNotebookId('');
    setDeleteNotebookConfirm({
      id: notebook.id,
      x: Math.max(12, Math.min(rect.right + 8, window.innerWidth - 286)),
      y: Math.max(12, Math.min(rect.top - 8, window.innerHeight - 158))
    });
  };

  const confirmDeleteNotebook = () => {
    if (!deleteNotebookConfirm) return;
    const notebookId = deleteNotebookConfirm.id;
    onDeleteNotebook(notebookId);
    if (selectedNotebookId === notebookId) setSelectedNotebookId('all');
    setDeleteNotebookConfirm(null);
  };

  const saveEditingNote = () => {
    if (!editingNote) return;
    const text = editingText.trim();
    const nextTag = editingTag.trim() || 'genel';
    const patch: Record<string, unknown> = {
      tag: nextTag,
      sourcePage: nextTag
    };
    if (editingNote.q && !editingNote.txt) {
      patch.q = text;
      patch.sourceExcerpt = text;
    } else {
      patch.txt = text;
      patch.comment = text;
    }
    onUpdateNote(editingNote.id, patch);
    onAction('Not güncellendi');
  };

  const insertNoteToDocument = (note: AcademiqNote) => {
    onInsertNote(note);
  };

  const addTagToNote = (note: AcademiqNote, value: string) => {
    const nextTag = String(value || '').trim();
    if (!nextTag) return;
    const currentTags = getNoteTags(note);
    if (currentTags.includes(nextTag)) {
      onAction('Etiket zaten ekli');
      return;
    }
    const merged = Array.from(new Set([...currentTags, nextTag])).join(', ');
    onUpdateNote(note.id, { tag: merged, sourcePage: merged });
    setNewTagName('');
    onAction('Etiket eklendi');
  };

  const openTagPopup = (note: AcademiqNote, x: number, y: number) => {
    setNewTagName('');
    setTagPopup({ noteId: note.id, x: Math.min(x + 12, window.innerWidth - 300), y: Math.min(y, window.innerHeight - 260) });
    setNoteMenu(null);
  };

  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-col bg-[#fbfaf7] p-3">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-aq-muted">Çalışma Alanı</div>
          <h2 className="mt-1 text-lg font-semibold leading-none">{workspaceName || 'Genel Notlar'}</h2>
        </div>
        <div className="aq-note-sidebar-actions flex gap-1">
          <button
            type="button"
            onClick={openNotebook}
            className="h-8 rounded-md border border-aq-line bg-white px-3 text-[12px] font-semibold text-aq-ink shadow-sm transition hover:bg-aq-panel"
            title="Not defterini aç"
          >
            Defter
          </button>
          <button
            type="button"
            onClick={onOpenMatrix}
            className="h-8 rounded-md border border-aq-line bg-white px-3 text-[12px] font-semibold text-aq-ink shadow-sm transition hover:bg-aq-panel"
            title="Literatür matrisini aç"
          >
            Matris
          </button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 rounded-lg bg-aq-panel p-1 text-[11px]">
        <button type="button" onClick={() => onTabChange('notes')} className={visibleTab === 'notes' ? 'h-7 rounded-md bg-white font-semibold shadow-sm' : 'h-7 rounded-md text-aq-muted'}>Notlar</button>
        <button type="button" onClick={() => onTabChange('refs')} className={visibleTab === 'refs' ? 'h-7 rounded-md bg-white font-semibold shadow-sm' : 'h-7 rounded-md text-aq-muted'}>Kaynakça</button>
      </div>

      {visibleTab === 'notes' ? (
        <>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-8 rounded-md border border-aq-line bg-white px-2">
              <option value="all">Tüm Tipler</option>
              <option value="summary">Ozet</option>
              <option value="direct_quote">Alinti</option>
              <option value="comment">Yorum</option>
            </select>
            <select value={usageFilter} onChange={(event) => setUsageFilter(event.target.value)} className="h-8 rounded-md border border-aq-line bg-white px-2">
              <option value="all">Tüm Durumlar</option>
              <option value="inserted">Eklenenler</option>
              <option value="not_inserted">Eklenmeyenler</option>
            </select>
            <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} className="h-8 rounded-md border border-aq-line bg-white px-2">
              <option value="all">Tüm Etiketler</option>
              {noteTags.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={refFilter} onChange={(event) => setRefFilter(event.target.value)} className="h-8 rounded-md border border-aq-line bg-white px-2">
              <option value="all">Tüm Kaynaklar</option>
              {references.map((ref) => <option key={ref.id} value={ref.id}>{referenceTitle(ref)}</option>)}
            </select>
          </div>
          {noteTags.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {noteTags.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setTagFilter(item)}
                  className={['inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                    tagFilter === item ? 'border-aq-navy bg-aq-navy text-white' : 'border-aq-line bg-white text-aq-muted hover:bg-aq-panel'
                  ].join(' ')}
                >
                  <span>{item}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`${item} etiketini sil`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteNoteTag(item);
                      if (tagFilter === item) setTagFilter('all');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        onDeleteNoteTag(item);
                        if (tagFilter === item) setTagFilter('all');
                      }
                    }}
                    className="ml-0.5 rounded-full px-1 hover:bg-black/10"
                  >
                    x
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-4 min-h-0 flex-1 overflow-hidden flex flex-col">
            {filteredNotes.length ? (
              <VirtualList
                items={filteredNotes}
                itemHeight={120}
                renderItem={(note) => (
                  <article
                    key={note.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openNoteEditor(note)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setNoteMenu({ noteId: note.id, x: event.clientX, y: event.clientY });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openNoteEditor(note);
                      }
                    }}
                    className="mb-2 cursor-pointer rounded-lg border border-aq-line bg-white p-3 text-xs transition hover:border-aq-navy hover:shadow-sm"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.16em] text-aq-muted">
                      <span>{String(note.noteType || (note.type === 'hl' ? 'quote' : 'summary'))}</span>
                      <button type="button" onClick={(event) => { event.stopPropagation(); onDeleteNote(note.id); }} className="rounded px-1 text-aq-muted hover:bg-aq-panel hover:text-aq-ink">Sil</button>
                    </div>
                    {note.txt ? <p className="leading-5 text-aq-ink">{String(note.txt)}</p> : null}
                    {note.q ? <blockquote className="border-l-2 border-aq-navy pl-2 leading-5 text-aq-ink">{String(note.q)}</blockquote> : null}
                    {getNoteTags(note).length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {getNoteTags(note).map((item) => (
                          <span key={item} className="inline-flex rounded-full border border-aq-line bg-aq-panel px-2 py-0.5 text-[10px] font-medium text-aq-muted">{item}</span>
                        ))}
                      </div>
                    ) : null}
                    {note.rid ? (
                      <div className="mt-2 flex gap-1">
                        <button type="button" onClick={(event) => { event.stopPropagation(); onInsertCitation(String(note.rid)); }} className="rounded-md border border-aq-line px-2 py-1 font-semibold hover:bg-aq-panel">Atıf</button>
                        <button type="button" onClick={(event) => { event.stopPropagation(); onOpenMatrix(); }} className="rounded-md border border-aq-line px-2 py-1 font-semibold hover:bg-aq-panel">Matris</button>
                      </div>
                    ) : null}
                  </article>
                )}
                containerHeight="100%"
              />
            ) : (
              <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-aq-line text-center text-xs leading-5 text-aq-muted">
                {notes.length ? 'Bu filtrelerde not yok.' : <>PDF'ten metin seç -&gt; Nota Kaydet<br />veya aşağıdan yaz.</>}
              </div>
            )}
          </div>

          <div className="pt-3">
            <textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} className="h-24 w-full resize-none rounded-md border border-aq-line bg-white p-3 text-sm outline-none" placeholder="Serbest not..." />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <select value={noteType} onChange={(event) => setNoteType(event.target.value)} className="h-8 rounded-md border border-aq-line bg-white px-2 text-xs">
                <option value="summary">Ozet</option>
                <option value="direct_quote">Alinti</option>
                <option value="method">Yontem</option>
                <option value="finding">Bulgular</option>
              </select>
              <input value={tag} onChange={(event) => setTag(event.target.value)} className="h-8 rounded-md border border-aq-line bg-white px-2 text-xs outline-none" placeholder="etiket..." />
            </div>
            <button type="button" onClick={submitNote} className="mt-2 h-8 w-full rounded-md bg-aq-navy text-sm font-semibold text-white transition hover:bg-[#172852] active:translate-y-px">Not Ekle</button>
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-auto text-xs">
          <div className="grid grid-cols-3 gap-1 pb-2">
            <button type="button" onClick={() => run('bibliography-refresh')} className="rounded-md border border-aq-line bg-white px-2 py-2 font-medium">Güncelle</button>
            <button type="button" onClick={() => run('bibliography-insert')} className="rounded-md border border-aq-line bg-white px-2 py-2 font-medium">Otomatik</button>
            <button type="button" onClick={() => run('bibliography-insert')} className="rounded-md border border-aq-line bg-white px-2 py-2 font-medium">Git</button>
          </div>
          {bibliographyReferences.length ? bibliographyReferences.map((ref) => (
            <button
              type="button"
              key={ref.id}
              onClick={() => onSelectReference(ref.id)}
              className={[
                'block w-full rounded-lg border bg-white p-3 text-left transition hover:border-aq-navy',
                ref.id === activeReferenceId ? 'border-aq-navy ring-1 ring-aq-navy/20' : 'border-aq-line'
              ].join(' ')}
            >
              <div className="font-semibold text-aq-ink">{referenceTitle(ref)}</div>
              <div className="mt-1 truncate text-aq-muted">{referenceAuthors(ref)} {ref.year ? `- ${String(ref.year)}` : ''}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                <button type="button" onClick={(event) => { event.stopPropagation(); onInsertCitation(ref.id); }} className="rounded border border-aq-line px-1.5 py-0.5 font-semibold text-aq-muted hover:bg-aq-panel">Atıf</button>
                <button type="button" onClick={(event) => { event.stopPropagation(); onEditReference(ref.id); }} className="rounded border border-aq-line px-1.5 py-0.5 font-semibold text-aq-muted hover:bg-aq-panel">Düzenle</button>
                <button type="button" onClick={(event) => { event.stopPropagation(); onReferencePdfAction('open', ref.id); }} className="rounded border border-aq-line px-1.5 py-0.5 font-semibold text-aq-muted hover:bg-aq-panel">PDF</button>
              </div>
            </button>
          )) : (
            <div className="rounded-xl border border-aq-line bg-white p-4 leading-5 text-aq-muted">Metinde atıf yok.</div>
          )}
        </div>
      )}
      {notebookOpen ? (
        <div className="fixed inset-0 z-[2800] bg-black/20" onClick={() => setNotebookOpen(false)}>
          <section
            className="absolute bottom-8 left-1/2 top-16 flex w-[min(1120px,calc(100vw-40px))] -translate-x-1/2 flex-col rounded-xl border border-aq-line bg-[#fbfaf7] p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            aria-label="Not defteri"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-aq-muted">Not Defteri</div>
                <h3 className="mt-1 text-lg font-semibold text-aq-ink">{workspaceName || 'Workspace'} notları</h3>
                <p className="mt-1 text-xs text-aq-muted">Gelen Kutusu, defterler, etiketler ve belgeye/matrise aktarma tek yerde.</p>
              </div>
              <button type="button" onClick={() => setNotebookOpen(false)} className="rounded-md border border-aq-line bg-white px-3 py-1.5 text-xs font-semibold hover:bg-aq-panel">Kapat</button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(260px,36%)_1fr] gap-3">
              <aside className="flex min-h-0 flex-col rounded-xl border border-aq-line bg-white/75 p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-aq-muted">Defterler</div>
                <div className="min-h-0 flex-1 overflow-auto pr-1">
                  <button type="button" onClick={() => setSelectedNotebookId('all')} className={['mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs', selectedNotebookId === 'all' ? 'bg-aq-navy text-white' : 'hover:bg-aq-panel'].join(' ')}>
                    <span>Tüm Notlar</span><span>{notes.length}</span>
                  </button>
                  <button type="button" onClick={() => setSelectedNotebookId('inbox')} className={['mb-2 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs', selectedNotebookId === 'inbox' ? 'bg-aq-navy text-white' : 'hover:bg-aq-panel'].join(' ')}>
                    <span>Gelen Kutusu</span><span>{inboxCount}</span>
                  </button>
                  {notebooks.map((notebook) => (
                    <div key={notebook.id} className="group mb-1 flex items-center gap-1 rounded-lg hover:bg-aq-panel">
                      <button type="button" onClick={() => setSelectedNotebookId(notebook.id)} className={['min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-xs', selectedNotebookId === notebook.id ? 'bg-aq-navy text-white' : ''].join(' ')}>
                        <span className="block truncate">{notebook.name}</span>
                        <span className="text-[10px] opacity-70">{notebookCounts.get(notebook.id) || 0} not</span>
                      </button>
                      <button type="button" onClick={() => beginRenameNotebook(notebook)} className="hidden rounded px-1.5 py-1 text-[10px] text-aq-muted hover:bg-white group-hover:block">Ad</button>
                      {notebooks.length > 1 ? (
                        <button
                          type="button"
                          onClick={(event) => askDeleteNotebook(event, notebook)}
                          className="hidden rounded px-1.5 py-1 text-[10px] text-red-700 hover:bg-red-50 group-hover:block"
                        >
                          Sil
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                {renamingNotebookId ? (
                  <div className="mt-3 rounded-lg border border-aq-line bg-[#fbfaf7] p-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-aq-muted">Yeniden adlandır</div>
                    <input value={renamingNotebookName} onChange={(event) => setRenamingNotebookName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitRenameNotebook(); }} className="h-8 w-full rounded-md border border-aq-line bg-white px-2 text-xs outline-none focus:border-aq-navy" />
                    <div className="mt-2 flex gap-1">
                      <button type="button" onClick={submitRenameNotebook} className="h-7 flex-1 rounded-md bg-aq-navy text-xs font-semibold text-white">Kaydet</button>
                      <button type="button" onClick={() => setRenamingNotebookId('')} className="h-7 rounded-md border border-aq-line bg-white px-2 text-xs font-semibold">İptal</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-aq-line bg-[#fbfaf7] p-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-aq-muted">Yeni defter</div>
                    <div className="flex gap-1">
                      <input value={newNotebookName} onChange={(event) => setNewNotebookName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitNotebook(); }} className="h-8 min-w-0 flex-1 rounded-md border border-aq-line bg-white px-2 text-xs outline-none focus:border-aq-navy" placeholder="Defter adı" />
                      <button type="button" onClick={submitNotebook} className="h-8 rounded-md bg-aq-navy px-3 text-xs font-semibold text-white">Ekle</button>
                    </div>
                  </div>
                )}
              </aside>

              <div className="min-h-0 flex flex-col rounded-xl border border-aq-line bg-white/70 p-3">
                <div className="mb-2 flex items-center justify-between gap-2 shrink-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aq-muted">Notlar</div>
                  <div className="text-[11px] text-aq-muted">{filteredNotes.length} / {notes.length}</div>
                </div>
                <div className="min-h-0 flex-1">
                  {filteredNotes.length ? (
                    <VirtualList
                      items={filteredNotes}
                      itemHeight={130}
                      renderItem={(note) => (
                        <button
                          type="button"
                          key={note.id}
                          onClick={() => openNoteEditor(note)}
                          onContextMenu={(event) => { event.preventDefault(); setNoteMenu({ noteId: note.id, x: event.clientX, y: event.clientY }); }}
                          className={['mb-2 block w-full rounded-lg border p-3 text-left text-xs transition hover:border-aq-navy', note.id === editingNoteId ? 'border-aq-navy bg-white shadow-sm ring-1 ring-aq-navy/15' : 'border-aq-line bg-white'].join(' ')}
                        >
                          <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-aq-muted">
                            <span>{String(note.noteType || note.type || 'not')}</span>
                            {note.dt ? <span>{String(note.dt)}</span> : null}
                          </div>
                          <div className="mt-2 line-clamp-3 font-semibold leading-5 text-aq-ink">{notePreview(note)}</div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {getNoteTags(note).slice(0, 4).map((item) => <span key={item} className="inline-flex rounded-full border border-aq-line bg-aq-panel px-2 py-0.5 text-[10px] text-aq-muted">{item}</span>)}
                            {isInboxNote(note) ? <span className="inline-flex rounded-full border border-aq-line bg-white px-2 py-0.5 text-[10px] text-aq-muted">gelen</span> : null}
                          </div>
                        </button>
                      )}
                      containerHeight="100%"
                    />
                  ) : <div className="rounded-lg border border-dashed border-aq-line p-4 text-center text-xs text-aq-muted">Bu görünümde not yok.</div>}
                </div>
              </div>

              <div className="flex min-h-0 flex-col rounded-xl border border-aq-line bg-white p-3">
                {editingNote ? (
                  <>
                    <div className="mb-3 rounded-lg border border-aq-line bg-[#fbfaf7] p-3 text-xs text-aq-muted">
                      <span className="font-semibold text-aq-ink">{String(editingNote.noteType || editingNote.type || 'not')}</span>
                      {editingNote.src ? <span> · {String(editingNote.src)}</span> : null}
                      {editingNote.dt ? <span> · {String(editingNote.dt)}</span> : null}
                    </div>
                    <label className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-aq-muted">Not metni</label>
                    <textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} className="min-h-0 flex-1 resize-none rounded-lg border border-aq-line bg-white p-3 text-sm leading-6 outline-none focus:border-aq-navy" />
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-aq-muted">Etiket / sayfa</span>
                        <input value={editingTag} onChange={(event) => setEditingTag(event.target.value)} className="h-9 w-full rounded-lg border border-aq-line bg-white px-3 text-sm outline-none focus:border-aq-navy" placeholder="genel, metodoloji, s.12..." />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-aq-muted">Defter</span>
                        <select value={String(editingNote.nbId || fallbackNotebookId)} onChange={(event) => onMoveNoteToNotebook(editingNote.id, event.target.value)} className="h-9 w-full rounded-lg border border-aq-line bg-white px-3 text-sm outline-none focus:border-aq-navy">
                          {notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.name}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="mt-4 flex flex-wrap justify-between gap-2">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => insertNoteToDocument(editingNote)} className="rounded-lg border border-aq-line bg-white px-4 py-2 text-sm font-semibold hover:bg-aq-panel">Belgeye ekle</button>
                        {editingNote.rid ? <button type="button" onClick={onOpenMatrix} className="rounded-lg border border-aq-line bg-white px-4 py-2 text-sm font-semibold hover:bg-aq-panel">Matrise gönder</button> : null}
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { onDeleteNote(editingNote.id); setEditingNoteId(filteredNotes.find((note) => note.id !== editingNote.id)?.id || ''); }} className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Notu Sil</button>
                        <button type="button" onClick={saveEditingNote} className="rounded-lg bg-aq-navy px-5 py-2 text-sm font-semibold text-white hover:bg-[#172852]">Kaydet</button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-aq-line text-center text-sm leading-6 text-aq-muted">Soldan bir not seç veya sidebar altından yeni not oluştur.</div>
                )}
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {deleteNotebookConfirm ? (
        <div className="fixed inset-0 z-[3050]" onClick={() => setDeleteNotebookConfirm(null)}>
          <div
            className="absolute w-[270px] rounded-[13px] border border-aq-line/90 bg-white/95 p-3 text-xs text-aq-ink shadow-[0_24px_64px_rgba(22,27,34,0.20)] backdrop-blur-xl"
            style={{ left: deleteNotebookConfirm.x, top: deleteNotebookConfirm.y }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Not defterini sil"
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aq-muted">Not defteri</div>
            <div className="mt-1 font-semibold">Not defteri silinsin mi?</div>
            <p className="mt-1 leading-5 text-aq-muted">Notlar Genel Notlar defterine taşınır.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteNotebookConfirm(null)}
                className="h-8 rounded-md border border-aq-line bg-white px-3 text-xs font-semibold text-aq-muted hover:bg-aq-panel"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={confirmDeleteNotebook}
                className="h-8 rounded-md bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-800"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {menuNote && noteMenu ? (
        <div className="fixed inset-0 z-[2900]" onClick={() => setNoteMenu(null)}>
          <div
            className="absolute w-48 rounded-[13px] border border-aq-line/90 bg-white/95 p-1.5 text-[11px] text-aq-ink shadow-[0_24px_64px_rgba(22,27,34,0.20)] backdrop-blur-xl"
            style={{ left: Math.min(noteMenu.x, window.innerWidth - 210), top: Math.min(noteMenu.y, window.innerHeight - 190) }}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" onClick={() => { openNoteEditor(menuNote); setNoteMenu(null); }} className="block w-full rounded-md px-3 py-2 text-left hover:bg-aq-panel">Not defterinde aç</button>
            <button type="button" onClick={() => { openNoteEditor(menuNote); setNoteMenu(null); }} className="block w-full rounded-md px-3 py-2 text-left hover:bg-aq-panel">Düzenle</button>
            <button type="button" onClick={() => openTagPopup(menuNote, noteMenu.x, noteMenu.y)} className="block w-full rounded-md px-3 py-2 text-left hover:bg-aq-panel">Etiket ekle</button>
            <button type="button" onClick={() => { insertNoteToDocument(menuNote); setNoteMenu(null); }} className="block w-full rounded-md px-3 py-2 text-left hover:bg-aq-panel">Belgeye ekle</button>
            {menuNote.rid ? (
              <button type="button" onClick={() => { onOpenMatrix(); setNoteMenu(null); }} className="block w-full rounded-md px-3 py-2 text-left hover:bg-aq-panel">Matrise gönder</button>
            ) : null}
            <div className="my-1 border-t border-aq-line" />
            <button type="button" onClick={() => { onDeleteNote(menuNote.id); setNoteMenu(null); }} className="block w-full rounded-md px-3 py-2 text-left text-red-700 hover:bg-red-50">Notu sil</button>
          </div>
        </div>
      ) : null}
      {tagPopup && tagPopupNote ? (
        <div className="fixed inset-0 z-[2950]" onClick={() => setTagPopup(null)}>
          <div
            className="absolute w-72 rounded-[13px] border border-aq-line/90 bg-white/95 p-3 text-[11px] text-aq-ink shadow-[0_24px_64px_rgba(22,27,34,0.20)] backdrop-blur-xl"
            style={{ left: tagPopup.x, top: tagPopup.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aq-muted">Etiket</div>
                <div className="font-semibold">Nota etiket ekle</div>
              </div>
              <button type="button" onClick={() => setTagPopup(null)} className="rounded-md px-2 py-1 text-aq-muted hover:bg-aq-panel">x</button>
            </div>
            <div className="mb-3 max-h-32 overflow-auto pr-1">
              {noteTags.length ? noteTags.map((item) => {
                const selected = getNoteTags(tagPopupNote).includes(item);
                return (
                  <button
                    type="button"
                    key={item}
                    disabled={selected}
                    onClick={() => addTagToNote(tagPopupNote, item)}
                    className={[
                      'mb-1 flex h-8 w-full items-center justify-between rounded-md border px-2 text-left',
                      selected ? 'cursor-default border-aq-line bg-aq-panel text-aq-muted' : 'border-aq-line bg-white hover:border-aq-navy hover:bg-aq-panel'
                    ].join(' ')}
                  >
                    <span>{item}</span>
                    <span>{selected ? 'ekli' : 'ekle'}</span>
                  </button>
                );
              }) : (
                <div className="rounded-md border border-dashed border-aq-line px-2 py-2 leading-4 text-aq-muted">
                  Henüz etiket yok. Aşağıdan ilk etiketi oluştur.
                </div>
              )}
            </div>
            <div className="border-t border-aq-line pt-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-aq-muted">Yeni etiket</div>
              <div className="flex gap-1">
                <input
                  value={newTagName}
                  onChange={(event) => setNewTagName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addTagToNote(tagPopupNote, newTagName);
                    }
                  }}
                  className="h-8 min-w-0 flex-1 rounded-md border border-aq-line bg-white px-2 outline-none focus:border-aq-navy"
                  placeholder="Yeni etiket..."
                  autoFocus
                />
                <button type="button" onClick={() => addTagToNote(tagPopupNote, newTagName)} className="h-8 rounded-md bg-aq-navy px-3 font-semibold text-white">Ekle</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
