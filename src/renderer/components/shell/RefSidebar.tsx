import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import type { AcademiqReference } from '../../lib/app-state';
import { referenceAuthors, referenceTags, referenceTitle } from '../../lib/app-state';
import { legacyFeatures, runLegacyFeature } from '../../lib/legacy-feature-adapter';

type SidebarCollection = {
  id: string;
  name: string;
};

type SidebarLabel = {
  name: string;
  color?: string;
};

type RefSidebarProps = {
  references: AcademiqReference[];
  collections: SidebarCollection[];
  labels: SidebarLabel[];
  activeCollectionId: string;
  activeReferenceId: string;
  onSelectReference: (id: string) => void;
  onSearch: (query: string) => void;
  onOpenCollections: () => void;
  onToggleFilters: () => void;
  onEditReference: (id: string) => void;
  onToggleReferenceLabel: (referenceId: string, label: SidebarLabel) => void;
  onCreateLabel: (name: string) => void;
  onDeleteLabel: (name: string) => void;
  onCreateCollection: (name: string) => void;
  onSelectCollection: (collectionId: string) => void;
  onRenameCollection: (collectionId: string) => void;
  onDeleteCollection: (collectionId: string) => void;
  onMoveReferenceToCollection: (referenceId: string, collectionId: string) => void;
  onToggleReferenceCollection: (referenceId: string, collectionId: string) => void;
  onReferencePdfAction: (action: 'open' | 'show' | 'delete' | 'download' | 'browser', referenceId: string) => void;
  onBatchOADownload: () => void;
  onShowReferenceInExplorer: (referenceId: string) => void;
  onOpenRelatedPapers: (reference: AcademiqReference) => void;
  onDeleteReference: (referenceId: string) => void;
  filtersOpen: boolean;
};

function refCollectionIds(ref: AcademiqReference) {
  return Array.isArray(ref.collectionIds) ? ref.collectionIds.map((id) => String(id)) : [];
}

function refLabelName(label: unknown) {
  if (typeof label === 'string') return label;
  if (label && typeof label === 'object' && 'name' in label) {
    return String((label as { name?: unknown }).name || '');
  }
  return '';
}

export function RefSidebar({
  references,
  collections,
  labels,
  activeCollectionId,
  activeReferenceId,
  onSelectReference,
  onSearch,
  onOpenCollections,
  onToggleFilters,
  onEditReference,
  onToggleReferenceLabel,
  onCreateLabel,
  onDeleteLabel,
  onCreateCollection,
  onSelectCollection,
  onRenameCollection,
  onDeleteCollection,
  onMoveReferenceToCollection,
  onToggleReferenceCollection,
  onReferencePdfAction,
  onBatchOADownload,
  onShowReferenceInExplorer,
  onOpenRelatedPapers,
  onDeleteReference,
  filtersOpen
}: RefSidebarProps) {
  const [query, setQuery] = useState('');
  const [openMenu, setOpenMenu] = useState<'import' | 'pdf' | null>(null);
  const [referenceMenu, setReferenceMenu] = useState<{ refId: string; x: number; y: number } | null>(null);
  const [referenceSubmenu, setReferenceSubmenu] = useState<'labels' | 'collections' | null>(null);
  const [newLabelName, setNewLabelName] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [collapsedCollections, setCollapsedCollections] = useState<Record<string, boolean>>({});
  const [unfiledCollapsed, setUnfiledCollapsed] = useState(false);
  const activeMenuReference = useMemo(
    () => references.find((ref) => ref.id === referenceMenu?.refId) || null,
    [referenceMenu?.refId, references]
  );
  const needle = filtersOpen ? query.trim().toLowerCase() : '';
  const searchableReferences = useMemo(() => {
    if (!needle) return references;
    return references.filter((ref) => {
      const haystack = [referenceTitle(ref), referenceAuthors(ref), ref.doi, ref.year, referenceTags(ref).join(' ')].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [needle, references]);
  const groupedCollections = useMemo(() => collections.map((collection) => ({
    collection,
    references: searchableReferences.filter((ref) => refCollectionIds(ref).includes(String(collection.id)))
  })), [collections, searchableReferences]);
  const unfiledReferences = useMemo(
    () => searchableReferences.filter((ref) => refCollectionIds(ref).length === 0),
    [searchableReferences]
  );
  const allAssignedIds = useMemo(() => new Set(collections.map((collection) => String(collection.id))), [collections]);
  const orphanedReferences = useMemo(
    () => searchableReferences.filter((ref) => refCollectionIds(ref).some((id) => !allAssignedIds.has(id))),
    [allAssignedIds, searchableReferences]
  );
  const userLabelNames = useMemo(() => new Set(labels.map((label) => label.name)), [labels]);

  const submitSearch = () => {
    if (query.trim()) onSearch(query.trim());
  };

  const runFeature = (id: string) => {
    if (id === 'reference-batch-oa' || id === 'pdf-download') {
      onBatchOADownload();
      setOpenMenu(null);
      return;
    }
    const feature = legacyFeatures.find((item) => item.id === id);
    if (feature) {
      runLegacyFeature(feature);
      [750, 2500, 8000, 20000].forEach((delay) => {
        window.setTimeout(() => {
          const win = window as any;
          if (typeof win.__aqReactSyncFromLegacy === 'function') {
            try { win.__aqReactSyncFromLegacy(win.S || {}); } catch (_error) {}
          }
        }, delay);
      });
    }
    setOpenMenu(null);
  };

  const openReferenceMenu = (event: MouseEvent, refId: string) => {
    event.preventDefault();
    event.stopPropagation();
    onSelectReference(refId);
    setOpenMenu(null);
    setReferenceMenu({ refId, x: event.clientX, y: event.clientY });
  };

  const closeReferenceMenu = () => {
    setReferenceMenu(null);
    setReferenceSubmenu(null);
    setNewLabelName('');
    setNewCollectionName('');
  };

  useEffect(() => {
    if (!referenceMenu) return;
    const close = () => closeReferenceMenu();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeReferenceMenu();
    };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [referenceMenu]);

  const referenceHasLabel = (ref: AcademiqReference, labelName: string) => (
    Array.isArray(ref.labels) && ref.labels.some((label) => (
      refLabelName(label) === labelName
    ))
  );

  const cardTags = (ref: AcademiqReference) => {
    const rawLabels = Array.isArray(ref.labels) ? ref.labels.map(refLabelName).filter(Boolean) : [];
    const userAssignedLabels = rawLabels.filter((name) => userLabelNames.has(name));
    return Array.from(new Set([...userAssignedLabels, ...referenceTags(ref)])).slice(0, 3);
  };

  const menuButton = (id: 'import' | 'pdf', label: string, items: Array<[string, string]>) => (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpenMenu((value) => value === id ? null : id)}
        className="h-8 w-full rounded-md border border-aq-line bg-white text-[12px] font-semibold transition hover:bg-aq-panel active:translate-y-px"
      >
        {label}
      </button>
      {openMenu === id ? (
        <div className="absolute left-0 top-9 z-40 w-44 rounded-md border border-aq-line bg-white p-1.5 text-[11px] shadow-xl">
          {items.map(([featureId, itemLabel]) => (
            <button key={featureId} type="button" onClick={() => runFeature(featureId)} className="block w-full rounded px-2 py-2 text-left hover:bg-aq-panel">
              {itemLabel}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  const renderReferenceCard = (ref: AcademiqReference) => {
    const tags = cardTags(ref);
    const hasPdf = Boolean(ref.pdfAttached || ref.pdfData || ref.pdfPath);
    const hasPdfUrl = Boolean(String(ref.pdfUrl || '').trim());
    const hasDoi = Boolean(String(ref.doi || '').trim());
    const metadataIncomplete = !referenceTitle(ref) || !referenceAuthors(ref) || !String(ref.year || '').trim();
    return (
      <button
        type="button"
        key={ref.id}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData('text/academiq-reference', ref.id);
          event.dataTransfer.effectAllowed = 'move';
        }}
        onClick={() => {
          onSelectReference(ref.id);
          // Always open the PDF panel — even when there's no local PDF.
          // The legacy `showNoPDF` fallback now renders the article's
          // abstract (from ref.abstract or fetched on demand) so users
          // get a useful reading view regardless of PDF availability.
          onReferencePdfAction('open', ref.id);
        }}
        onContextMenu={(event) => openReferenceMenu(event, ref.id)}
        className={[
          'relative block w-full rounded-lg border bg-white p-3 pr-8 text-left transition hover:border-aq-navy hover:shadow-sm active:translate-y-px',
          activeReferenceId === ref.id ? 'border-aq-navy ring-1 ring-aq-navy/20' : 'border-aq-line'
        ].join(' ')}
      >
        <span
          role="button"
          tabIndex={0}
          onClick={(event) => openReferenceMenu(event, ref.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              onSelectReference(ref.id);
              setOpenMenu(null);
              setReferenceMenu({ refId: ref.id, x: rect.right - 8, y: rect.bottom + 6 });
            }
          }}
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-aq-muted opacity-70 transition hover:bg-aq-panel hover:text-aq-ink"
          title="Kaynak menüsü"
        >
          ...
        </span>
        <h3 className="line-clamp-2 text-[13px] font-semibold leading-5">{referenceTitle(ref)}</h3>
        <div className="mt-1 flex items-center gap-1 text-[10px] text-aq-muted">
          <span className="truncate">{referenceAuthors(ref)}</span>
          {ref.year ? <span>{String(ref.year)}</span> : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {hasPdf ? (
            <span className="rounded border border-aq-navy/20 bg-aq-navy/10 px-1.5 py-0.5 text-[9px] font-semibold text-aq-navy">PDF</span>
          ) : null}
          {!hasPdf && hasPdfUrl ? (
            <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700">PDF URL</span>
          ) : null}
          {hasDoi ? (
            <span className="rounded border border-aq-line bg-white px-1.5 py-0.5 text-[9px] font-semibold text-aq-muted">DOI</span>
          ) : null}
          {metadataIncomplete ? (
            <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">Eksik</span>
          ) : null}
          {tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded bg-aq-panel px-1.5 py-0.5 text-[9px] text-aq-ink">{tag}</span>
          ))}
        </div>
      </button>
    );
  };

  const renderFolderHeader = (
    id: string,
    name: string,
    count: number,
    collapsed: boolean,
    onToggle: () => void,
    canManage = true
  ) => (
    <div
      className={['group flex items-center gap-1 rounded-md border border-aq-line bg-white/80 px-2 py-1.5 transition', activeCollectionId === id ? 'ring-1 ring-aq-navy/25' : ''].join(' ')}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const refId = event.dataTransfer.getData('text/academiq-reference');
        if (refId) onMoveReferenceToCollection(refId, id);
      }}
    >
      <button
        type="button"
        onClick={() => {
          onSelectCollection(id);
          onToggle();
        }}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="text-[10px] text-aq-muted">{collapsed ? '>' : 'v'}</span>
        <span className="text-aq-navy">□</span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-aq-ink">{name}</span>
        <span className="rounded-full border border-aq-line bg-white px-1.5 py-0.5 text-[10px] text-aq-muted">{count}</span>
      </button>
      {canManage ? (
        <>
          <button
            type="button"
            onClick={() => onRenameCollection(id)}
            className="hidden h-6 w-6 rounded-md text-[11px] text-aq-muted hover:bg-aq-panel group-hover:block"
            title="Klasörü yeniden adlandır"
          >
            ...
          </button>
          <button
            type="button"
            onClick={() => onDeleteCollection(id)}
            className="hidden h-6 w-6 rounded-md text-[13px] text-red-600 hover:bg-red-50 group-hover:block"
            title="Klasörü sil"
          >
            x
          </button>
        </>
      ) : null}
    </div>
  );

  return (
    <aside className="relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-[#fbfaf7]">
      <div className="flex h-full flex-col gap-2 p-3">
        <div className="flex gap-1">
          <input
            id="doiinp"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitSearch();
            }}
            className="h-8 min-w-0 flex-1 rounded-md border border-aq-line bg-white px-3 text-xs outline-none placeholder:text-aq-muted focus:border-aq-navy"
            placeholder="DOI, URL veya ISBN gir..."
          />
          <button
            type="button"
            onClick={submitSearch}
            disabled={!query.trim()}
            className="h-8 rounded-md border border-aq-line bg-white px-3 text-xs font-semibold text-aq-ink transition hover:bg-aq-panel active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
          >
            Ara
          </button>
        </div>

        <div className="aq-ref-sidebar-actions grid grid-cols-2 gap-2">
          <button type="button" onClick={onOpenCollections} className="h-8 rounded-md border border-aq-line bg-white text-[12px] font-semibold transition hover:bg-aq-panel active:translate-y-px">Klasörler</button>
          <button type="button" onClick={onToggleFilters} className={['h-8 rounded-md border border-aq-line text-[12px] font-semibold transition hover:bg-aq-panel active:translate-y-px', filtersOpen ? 'bg-aq-panel text-aq-ink' : 'bg-white'].join(' ')}>Filtrele</button>
          {menuButton('import', 'İçe Aktar', [
            ['reference-import-bib', '.bib/.ris Aktar'],
            ['reference-import-zotero', "Zotero'dan Aktar"]
          ])}
          {menuButton('pdf', 'PDF', [
            ['pdf-upload', '+ PDF Yükle'],
            ['reference-batch-oa', 'OA PDF İndir']
          ])}
        </div>

        {filtersOpen ? (
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 w-full rounded-md border border-aq-line bg-white px-3 text-xs outline-none placeholder:text-aq-muted"
            placeholder="Filtrele..."
          />
        ) : null}

        <div className="pt-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-aq-muted">Kaynaklar</div>

        <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
          {groupedCollections.map(({ collection, references: folderRefs }) => {
            const collapsed = Boolean(collapsedCollections[collection.id]);
            return (
              <section key={collection.id} className="space-y-2">
                {renderFolderHeader(
                  collection.id,
                  collection.name,
                  folderRefs.length,
                  collapsed,
                  () => setCollapsedCollections((value) => ({ ...value, [collection.id]: !value[collection.id] }))
                )}
                {!collapsed ? (
                  <div className="space-y-2 pl-4">
                    {folderRefs.length ? folderRefs.map(renderReferenceCard) : (
                      <div className="rounded-lg border border-dashed border-aq-line p-4 text-center text-xs text-aq-muted">Kaynakları buraya sürükle.</div>
                    )}
                  </div>
                ) : null}
              </section>
            );
          })}

          {orphanedReferences.length ? (
            <section className="space-y-2">
              {renderFolderHeader('unfiled', 'Eksik Klasör Bağlantısı', orphanedReferences.length, false, () => undefined, false)}
              <div className="space-y-2 pl-4">{orphanedReferences.map(renderReferenceCard)}</div>
            </section>
          ) : null}

          <section className="space-y-2">
            {renderFolderHeader(
              'unfiled',
              'Klasörsüz',
              unfiledReferences.length,
              unfiledCollapsed,
              () => setUnfiledCollapsed((value) => !value),
              false
            )}
            {!unfiledCollapsed ? (
              <div className="space-y-2 pl-4">
                {unfiledReferences.length ? unfiledReferences.map(renderReferenceCard) : (
                  <div className="rounded-lg border border-dashed border-aq-line p-4 text-center text-xs text-aq-muted">Klasörsüz kaynak yok.</div>
                )}
              </div>
            ) : null}
          </section>

          {!searchableReferences.length ? (
            <div className="flex h-28 items-center justify-center text-center text-xs text-aq-muted">
              DOI/URL gir veya PDF yükle.
            </div>
          ) : null}
        </div>
      </div>

      {referenceMenu && activeMenuReference ? (
        <>
          <div
            className="fixed z-[2200] max-h-[min(520px,calc(100vh-24px))] w-56 overflow-auto rounded-[13px] border border-aq-line/90 bg-white/95 p-1.5 text-[11px] shadow-[0_24px_64px_rgba(22,27,34,0.20)] backdrop-blur-xl"
            style={{
              left: Math.min(referenceMenu.x, window.innerWidth - 232),
              top: Math.min(referenceMenu.y, window.innerHeight - 532)
            }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button type="button" className="block w-full rounded-md px-2.5 py-2 text-left font-medium text-aq-ink hover:bg-aq-panel" onClick={() => { onEditReference(activeMenuReference.id); closeReferenceMenu(); }}>
              Künyeyi Düzenle
            </button>
            <button type="button" className="block w-full rounded-md px-2.5 py-2 text-left font-medium text-aq-ink hover:bg-aq-panel" onClick={() => { onOpenRelatedPapers(activeMenuReference); closeReferenceMenu(); }}>
              Benzer Makaleler
            </button>

            <div className="my-1 h-px bg-aq-line" />
            <button
              type="button"
              className={['flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left font-medium text-aq-ink hover:bg-aq-panel', referenceSubmenu === 'labels' ? 'bg-aq-panel' : ''].join(' ')}
              onMouseEnter={() => setReferenceSubmenu('labels')}
              onFocus={() => setReferenceSubmenu('labels')}
              onClick={(event) => {
                event.stopPropagation();
                setReferenceSubmenu('labels');
              }}
            >
              <span>Etiketler</span>
              <span className="text-aq-muted">›</span>
            </button>
            <button
              type="button"
              className={['flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left font-medium text-aq-ink hover:bg-aq-panel', referenceSubmenu === 'collections' ? 'bg-aq-panel' : ''].join(' ')}
              onMouseEnter={() => setReferenceSubmenu('collections')}
              onFocus={() => setReferenceSubmenu('collections')}
              onClick={(event) => {
                event.stopPropagation();
                setReferenceSubmenu('collections');
              }}
            >
              <span>Klasörler</span>
              <span className="text-aq-muted">›</span>
            </button>

            <div className="my-1 h-px bg-aq-line" />
            <button type="button" className="block w-full rounded-md px-2.5 py-2 text-left font-medium text-aq-ink hover:bg-aq-panel" onClick={() => { onReferencePdfAction('open', activeMenuReference.id); closeReferenceMenu(); }}>
              PDF Reader Aç
            </button>
            <button type="button" disabled={!Boolean(activeMenuReference.doi || activeMenuReference.pdfUrl)} title={Boolean(activeMenuReference.doi || activeMenuReference.pdfUrl) ? 'OA PDF indir' : 'Bu kaynakta DOI/PDF URL yok'} className="block w-full rounded-md px-2.5 py-2 text-left font-medium text-aq-ink hover:bg-aq-panel disabled:cursor-not-allowed disabled:text-aq-muted disabled:hover:bg-transparent" onClick={() => { onReferencePdfAction('download', activeMenuReference.id); closeReferenceMenu(); }}>
              OA PDF indir
            </button>
            <button type="button" disabled={!Boolean(activeMenuReference.doi || activeMenuReference.url || activeMenuReference.pdfUrl)} title={Boolean(activeMenuReference.doi || activeMenuReference.url || activeMenuReference.pdfUrl) ? 'Varsayılan tarayıcıda aç' : 'Bu kaynakta URL/DOI yok'} className="block w-full rounded-md px-2.5 py-2 text-left font-medium text-aq-ink hover:bg-aq-panel disabled:cursor-not-allowed disabled:text-aq-muted disabled:hover:bg-transparent" onClick={() => { onReferencePdfAction('browser', activeMenuReference.id); closeReferenceMenu(); }}>
              Tarayıcıda aç
            </button>
            <button type="button" disabled={!Boolean(activeMenuReference.pdfAttached || activeMenuReference.pdfData || activeMenuReference.pdfPath)} title={Boolean(activeMenuReference.pdfAttached || activeMenuReference.pdfData || activeMenuReference.pdfPath) ? 'PDF dosyasını göster' : 'Bu kaynağa bağlı PDF yok'} className="block w-full rounded-md px-2.5 py-2 text-left font-medium text-aq-ink hover:bg-aq-panel disabled:cursor-not-allowed disabled:text-aq-muted disabled:hover:bg-transparent" onClick={() => { onShowReferenceInExplorer(activeMenuReference.id); closeReferenceMenu(); }}>
              Dosya gezgininde aç
            </button>
            <button type="button" disabled={!Boolean(activeMenuReference.pdfAttached || activeMenuReference.pdfData || activeMenuReference.pdfPath)} title={Boolean(activeMenuReference.pdfAttached || activeMenuReference.pdfData || activeMenuReference.pdfPath) ? 'PDF dosyasını sil' : 'Bu kaynağa bağlı PDF yok'} className="block w-full rounded-md px-2.5 py-2 text-left font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-aq-muted disabled:hover:bg-transparent" onClick={() => { onReferencePdfAction('delete', activeMenuReference.id); closeReferenceMenu(); }}>
              PDF Sil
            </button>
            <button type="button" className="mt-1 block w-full rounded-md px-2.5 py-2 text-left font-semibold text-red-700 hover:bg-red-50" onClick={() => { onDeleteReference(activeMenuReference.id); closeReferenceMenu(); }}>
              Kaynağı Sil
            </button>
          </div>

          {referenceSubmenu ? (
            <div
              className="fixed z-[2201] max-h-[min(420px,calc(100vh-24px))] w-64 overflow-auto rounded-[13px] border border-aq-line/90 bg-white/95 p-1.5 text-[11px] shadow-[0_24px_64px_rgba(22,27,34,0.20)] backdrop-blur-xl"
              style={{
                left: Math.min(referenceMenu.x + 226, window.innerWidth - 272),
                top: Math.min(referenceMenu.y + 70, window.innerHeight - 432)
              }}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              {referenceSubmenu === 'labels' ? (
                <>
                  <div className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-aq-muted">Etiketler</div>
                  {labels.length ? labels.map((label) => {
                    const selected = referenceHasLabel(activeMenuReference, label.name);
                    return (
                      <div key={label.name} className="flex items-center gap-1 rounded-md hover:bg-aq-panel">
                        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left font-medium text-aq-ink" onClick={() => onToggleReferenceLabel(activeMenuReference.id, label)}>
                          <span className={['flex h-4 w-4 items-center justify-center rounded border text-[10px]', selected ? 'border-aq-navy bg-aq-navy text-white' : 'border-aq-line text-transparent'].join(' ')}>✓</span>
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: label.color || '#9aa' }} />
                          <span className="truncate">{label.name}</span>
                        </button>
                        <button
                          type="button"
                          className="mr-1 h-6 w-6 rounded-md text-[12px] font-semibold text-red-600 hover:bg-red-50"
                          title="Etiketi sil"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteLabel(label.name);
                          }}
                        >
                          x
                        </button>
                      </div>
                    );
                  }) : <div className="px-2.5 py-2 text-aq-muted">Kullanici etiketi yok</div>}
                  <form className="mt-1 flex gap-1 px-1" onSubmit={(event) => { event.preventDefault(); const name = newLabelName.trim(); if (!name) return; onCreateLabel(name); if (activeMenuReference && !referenceHasLabel(activeMenuReference, name)) onToggleReferenceLabel(activeMenuReference.id, { name, color: '#9aa' }); setNewLabelName(''); }}>
                    <input value={newLabelName} onChange={(event) => setNewLabelName(event.target.value)} className="h-7 min-w-0 flex-1 rounded-md border border-aq-line bg-white px-2 text-[11px] outline-none focus:border-aq-navy" placeholder="Yeni etiket..." aria-label="Yeni etiket adı" />
                    <button type="submit" className="h-7 rounded-md border border-aq-line px-2 font-semibold hover:bg-aq-panel" aria-label="Etiket ekle">+</button>
                  </form>
                </>
              ) : (
                <>
                  <div className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-aq-muted">Klasörler</div>
                  {collections.length ? collections.map((collection) => {
                    const selected = refCollectionIds(activeMenuReference).includes(String(collection.id));
                    return (
                      <button key={collection.id} type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left font-medium text-aq-ink hover:bg-aq-panel" onClick={() => onToggleReferenceCollection(activeMenuReference.id, collection.id)}>
                        <span className={['flex h-4 w-4 items-center justify-center rounded border text-[10px]', selected ? 'border-aq-navy bg-aq-navy text-white' : 'border-aq-line text-transparent'].join(' ')}>✓</span>
                        <span className="truncate">{collection.name}</span>
                      </button>
                    );
                  }) : <div className="px-2.5 py-2 text-aq-muted">Klasör yok</div>}
                  <form className="mt-1 flex gap-1 px-1" onSubmit={(event) => { event.preventDefault(); const name = newCollectionName.trim(); if (!name) return; onCreateCollection(name); setNewCollectionName(''); }}>
                    <input value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} className="h-7 min-w-0 flex-1 rounded-md border border-aq-line bg-white px-2 text-[11px] outline-none focus:border-aq-navy" placeholder="Yeni klasör..." aria-label="Yeni klasör adı" />
                    <button type="submit" className="h-7 rounded-md border border-aq-line px-2 font-semibold hover:bg-aq-panel" aria-label="Klasör ekle">+</button>
                  </form>
                  <button type="button" className="mt-1 block w-full rounded-md px-2.5 py-2 text-left font-medium text-aq-ink hover:bg-aq-panel" onClick={() => { onOpenCollections(); closeReferenceMenu(); }}>
                    Klasörleri Yönet
                  </button>
                </>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </aside>
  );
}
