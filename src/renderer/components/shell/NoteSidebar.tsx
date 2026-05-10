import { useEffect, useMemo, useState } from 'react';
import type { AcademiqNote, AcademiqReference } from '../../lib/app-state';
import { referenceAuthors, referenceTitle } from '../../lib/app-state';
import { legacyFeatures, runLegacyFeature } from '../../lib/legacy-feature-adapter';

export type NoteSidebarTab = 'refs' | 'pdf' | 'notes' | 'matrix';

type NoteSidebarProps = {
  activeTab: NoteSidebarTab;
  onTabChange: (tab: NoteSidebarProps['activeTab']) => void;
  notes: AcademiqNote[];
  references: AcademiqReference[];
  workspaceName: string;
  documentName: string;
  activeReferenceId: string;
  onSelectReference: (id: string) => void;
  onAddNote: (input: { text: string; tag?: string; noteType?: string }) => void;
  onUpdateNote: (id: string, patch: Record<string, unknown>) => void;
  onDeleteNote: (id: string) => void;
  onDeleteNoteTag: (tag: string) => void;
  onInsertNote: (note: AcademiqNote) => void;
  onInsertCitation: (refId: string) => void;
  onEditReference: (refId: string) => void;
  onReferencePdfAction: (action: 'open' | 'show' | 'delete' | 'download', refId: string) => void;
  onOpenPDF: () => void;
  onOpenMatrix: () => void;
  onAction: (message: string) => void;
};

export function NoteSidebar({
  activeTab,
  onTabChange,
  notes,
  references,
  workspaceName,
  activeReferenceId,
  onSelectReference,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onDeleteNoteTag,
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
  const [typeFilter, setTypeFilter] = useState('all');
  const [usageFilter, setUsageFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [refFilter, setRefFilter] = useState('all');
  const [noteMenu, setNoteMenu] = useState<{ noteId: string; x: number; y: number } | null>(null);
  const [tagPopup, setTagPopup] = useState<{ noteId: string; x: number; y: number } | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const visibleTab: 'notes' | 'refs' = activeTab === 'refs' ? 'refs' : 'notes';
  const editingNote = notes.find((note) => note.id === editingNoteId) || null;
  const menuNote = noteMenu ? notes.find((note) => note.id === noteMenu.noteId) || null : null;
  const tagPopupNote = tagPopup ? notes.find((note) => note.id === tagPopup.noteId) || null : null;
  const getNoteTags = (note: AcademiqNote) => String(note.tag || note.sourcePage || '')
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const noteTags = useMemo(() => Array.from(new Set(notes
    .flatMap((note) => getNoteTags(note)))).sort((a, b) => a.localeCompare(b)), [notes]);
  const filteredNotes = useMemo(() => notes.filter((note) => {
    const noteTypeValue = String(note.noteType || (note.type === 'hl' ? 'direct_quote' : note.type || 'summary'));
    const noteTagList = getNoteTags(note);
    if (typeFilter !== 'all' && noteTypeValue !== typeFilter) return false;
    if (usageFilter === 'inserted' && !note.inserted) return false;
    if (usageFilter === 'not_inserted' && note.inserted) return false;
    if (tagFilter !== 'all' && !noteTagList.includes(tagFilter)) return false;
    if (refFilter !== 'all' && String(note.rid || '') !== refFilter) return false;
    return true;
  }), [notes, refFilter, tagFilter, typeFilter, usageFilter]);

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
    setEditingNoteId(note.id);
    setEditingText(String(note.txt || note.q || note.comment || note.sourceExcerpt || ''));
    setEditingTag(String(note.tag || note.sourcePage || ''));
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
    onAction('Etiket eklendi');
  };

  const openTagPopup = (note: AcademiqNote, x: number, y: number) => {
    setNewTagName('');
    setTagPopup({ noteId: note.id, x: Math.min(x + 12, window.innerWidth - 300), y: Math.min(y, window.innerHeight - 260) });
    setNoteMenu(null);
  };

  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-col border-l border-aq-line bg-[#fbfaf7] p-3">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-aq-muted">Workspace</div>
          <h2 className="mt-1 text-lg font-semibold leading-none">{workspaceName || 'Genel Notlar'}</h2>
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

          <div className="mt-4 min-h-0 flex-1 overflow-auto">
            {filteredNotes.length ? filteredNotes.map((note) => (
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
            )) : (
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
          {references.length ? references.map((ref) => (
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
      {editingNote ? (
        <div className="fixed inset-0 z-[2800] bg-black/20" onClick={() => setEditingNoteId('')}>
          <section
            className="absolute bottom-8 left-1/2 top-16 flex w-[min(920px,calc(100vw-40px))] -translate-x-1/2 flex-col rounded-xl border border-aq-line bg-[#fbfaf7] p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            aria-label="Not defteri"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-aq-muted">Not Defteri</div>
                <h3 className="mt-1 text-lg font-semibold text-aq-ink">Not Defteri</h3>
              </div>
              <button type="button" onClick={() => setEditingNoteId('')} className="rounded-md border border-aq-line bg-white px-3 py-1.5 text-xs font-semibold hover:bg-aq-panel">Kapat</button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(220px,38%)_1fr] gap-3">
              <div className="min-h-0 overflow-auto rounded-xl border border-aq-line bg-white/70 p-3">
                {notes.length ? notes.map((note) => (
                  <button
                    type="button"
                    key={note.id}
                    onClick={() => openNoteEditor(note)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setNoteMenu({ noteId: note.id, x: event.clientX, y: event.clientY });
                    }}
                    className={[
                      'mb-2 block w-full rounded-lg border p-3 text-left text-xs transition hover:border-aq-navy',
                      note.id === editingNote.id ? 'border-aq-navy bg-white shadow-sm ring-1 ring-aq-navy/15' : 'border-aq-line bg-white'
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-aq-muted">
                      <span>{String(note.noteType || note.type || 'not')}</span>
                      {note.dt ? <span>{String(note.dt)}</span> : null}
                    </div>
                    <div className="mt-2 line-clamp-2 font-semibold leading-5 text-aq-ink">
                      {String(note.txt || note.q || note.comment || note.sourceExcerpt || '(bos not)')}
                    </div>
                    {getNoteTags(note).length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {getNoteTags(note).map((item) => (
                          <span key={item} className="inline-flex rounded-full border border-aq-line bg-aq-panel px-2 py-0.5 text-[10px] text-aq-muted">{item}</span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                )) : (
                  <div className="rounded-lg border border-dashed border-aq-line p-4 text-center text-xs text-aq-muted">Not yok.</div>
                )}
              </div>
              <div className="flex min-h-0 flex-col rounded-xl border border-aq-line bg-white p-3">
                <div className="mb-3 rounded-lg border border-aq-line bg-[#fbfaf7] p-3 text-xs text-aq-muted">
                  <span className="font-semibold text-aq-ink">{String(editingNote.noteType || editingNote.type || 'not')}</span>
                  {editingNote.src ? <span> · {String(editingNote.src)}</span> : null}
                  {editingNote.dt ? <span> · {String(editingNote.dt)}</span> : null}
                </div>
                <label className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-aq-muted">Not metni</label>
                <textarea
                  value={editingText}
                  onChange={(event) => setEditingText(event.target.value)}
                  className="min-h-0 flex-1 resize-none rounded-lg border border-aq-line bg-white p-3 text-sm leading-6 outline-none focus:border-aq-navy"
                />
                <label className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-aq-muted">Etiket / sayfa</label>
                <input
                  value={editingTag}
                  onChange={(event) => setEditingTag(event.target.value)}
                  className="h-9 rounded-lg border border-aq-line bg-white px-3 text-sm outline-none focus:border-aq-navy"
                  placeholder="genel, metodoloji, s.12..."
                />
                <div className="mt-4 flex justify-between gap-2">
                  <button type="button" onClick={() => { onDeleteNote(editingNote.id); setEditingNoteId(notes.find((note) => note.id !== editingNote.id)?.id || ''); }} className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Notu Sil</button>
                  <button type="button" onClick={saveEditingNote} className="rounded-lg bg-aq-navy px-5 py-2 text-sm font-semibold text-white hover:bg-[#172852]">Kaydet</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {menuNote && noteMenu ? (
        <div className="fixed inset-0 z-[2900]" onClick={() => setNoteMenu(null)}>
          <div
            className="absolute w-48 rounded-lg border border-aq-line bg-white p-1 text-xs text-aq-ink shadow-xl"
            style={{ left: Math.min(noteMenu.x, window.innerWidth - 210), top: Math.min(noteMenu.y, window.innerHeight - 190) }}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" onClick={() => { openNoteEditor(menuNote); setNoteMenu(null); }} className="block w-full rounded-md px-3 py-2 text-left hover:bg-aq-panel">Not defterinde a?</button>
            <button type="button" onClick={() => { openNoteEditor(menuNote); setNoteMenu(null); }} className="block w-full rounded-md px-3 py-2 text-left hover:bg-aq-panel">Düzenle</button>
            <button type="button" onClick={() => openTagPopup(menuNote, noteMenu.x, noteMenu.y)} className="block w-full rounded-md px-3 py-2 text-left hover:bg-aq-panel">Etiket ekle</button>
            <button type="button" onClick={() => { insertNoteToDocument(menuNote); setNoteMenu(null); }} className="block w-full rounded-md px-3 py-2 text-left hover:bg-aq-panel">Belgeye ekle</button>
            {menuNote.rid ? (
              <button type="button" onClick={() => { onOpenMatrix(); setNoteMenu(null); }} className="block w-full rounded-md px-3 py-2 text-left hover:bg-aq-panel">Matrise gonder</button>
            ) : null}
            <div className="my-1 border-t border-aq-line" />
            <button type="button" onClick={() => { onDeleteNote(menuNote.id); setNoteMenu(null); }} className="block w-full rounded-md px-3 py-2 text-left text-red-700 hover:bg-red-50">Notu sil</button>
          </div>
        </div>
      ) : null}
      {tagPopup && tagPopupNote ? (
        <div className="fixed inset-0 z-[2950]" onClick={() => setTagPopup(null)}>
          <div
            className="absolute w-72 rounded-xl border border-aq-line bg-white p-3 text-xs text-aq-ink shadow-2xl"
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
