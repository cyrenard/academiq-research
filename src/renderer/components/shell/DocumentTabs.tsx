import type { AcademiqDocument } from '../../lib/app-state';

type DocumentTabsProps = {
  documents: AcademiqDocument[];
  activeDocumentId: string;
  onSelectDocument: (id: string) => void;
  onAddDocument: () => void;
  onRenameDocument: () => void;
  onDeleteDocument: () => void;
};

export function DocumentTabs({ documents, activeDocumentId, onSelectDocument, onAddDocument, onRenameDocument, onDeleteDocument }: DocumentTabsProps) {
  return (
    <div className="flex h-9 items-center gap-3 border-b border-aq-line bg-white px-5 text-xs">
      <span className="font-semibold uppercase tracking-[0.24em] text-aq-muted">Belgeler</span>
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {documents.map((doc) => (
          <button
            type="button"
            key={doc.id}
            title={doc.name || doc.id}
            onClick={() => onSelectDocument(doc.id)}
            className={doc.id === activeDocumentId
              ? 'max-w-36 truncate rounded-md bg-aq-navy px-3 py-1.5 font-semibold text-white'
              : 'max-w-32 truncate rounded-md border border-aq-line bg-aq-paper px-2 py-1.5 text-aq-muted hover:bg-aq-panel hover:text-aq-ink'}
          >
            {doc.name || 'Belge'}
          </button>
        ))}
      </div>
      <button type="button" onClick={onAddDocument} className="h-7 rounded-md border border-aq-line px-2 font-semibold hover:bg-aq-panel">Yeni</button>
      <button type="button" onClick={onRenameDocument} className="h-7 rounded-md border border-aq-line px-2 font-semibold hover:bg-aq-panel">Ad</button>
      <button type="button" onClick={onDeleteDocument} className="h-7 rounded-md border border-aq-line px-2 font-semibold text-red-700 hover:bg-red-50">Sil</button>
    </div>
  );
}
