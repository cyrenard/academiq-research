import { useEffect, useState } from 'react';
import { Modal } from '../../ui/Modal';

type Target = {
  id: string;
  type: 'heading' | 'table' | 'figure' | 'footnote' | 'endnote';
  label: string;
  title?: string;
};

type CrossRefModalProps = {
  open: boolean;
  onClose: () => void;
  onStatus: (message: string) => void;
};

type FilterType = 'all' | 'heading' | 'table' | 'figure' | 'footnote' | 'endnote';
type DisplayMode = 'context' | 'label' | 'number';

export function CrossRefModal({ open, onClose, onStatus }: CrossRefModalProps) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [activeMode, setActiveMode] = useState<DisplayMode>('context');

  useEffect(() => {
    if (!open) return;

    const win = window as any;
    if (win.AQFootnotes && typeof win.AQFootnotes.collectCrossRefTargets === 'function') {
      try {
        const collected = win.AQFootnotes.collectCrossRefTargets() || [];
        setTargets(collected);
      } catch (error) {
        console.error('[CrossRefModal] Failed to collect targets:', error);
        onStatus('Çapraz referans hedefleri alınamadı');
      }
    } else {
      onStatus('Çapraz referans modülü bulunamadı');
    }
  }, [open, onStatus]);

  const handleSelectTarget = (target: Target) => {
    const win = window as any;
    const editor = typeof win.getActiveEditorInstance === 'function'
      ? win.getActiveEditorInstance()
      : win.editor;

    if (!editor) {
      onStatus('Aktif editör bulunamadı');
      return;
    }

    if (win.AQFootnotes && typeof win.AQFootnotes.insertCrossRef === 'function') {
      try {
        win.AQFootnotes.insertCrossRef(editor, target, activeMode);
        onStatus(`Referans eklendi: ${target.label.trim()}`);
        onClose();
      } catch (error) {
        console.error('[CrossRefModal] Failed to insert cross ref:', error);
        onStatus('Referans eklenirken hata oluştu');
      }
    } else {
      onStatus('Referans ekleme fonksiyonu bulunamadı');
    }
  };

  const getBadgeStyle = (type: string) => {
    switch (type) {
      case 'heading':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'table':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'figure':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'footnote':
      case 'endnote':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      default:
        return 'bg-zinc-50 text-zinc-700 border-zinc-200';
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      heading: 'Başlık',
      table: 'Tablo',
      figure: 'Şekil',
      footnote: 'Dipnot',
      endnote: 'Sonnot'
    };
    return labels[type] || type;
  };

  const filteredTargets = targets.filter((t) => {
    const matchesFilter = activeFilter === 'all' || t.type === activeFilter;
    const hay = `${t.label || ''} ${t.title || ''}`.toLowerCase();
    const matchesSearch = hay.includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <Modal title="Çapraz Referans Ekle" open={open} onClose={onClose}>
      <div className="space-y-4">
        {/* Search */}
        <div>
          <input
            type="text"
            className="h-10 w-full rounded-lg border border-aq-line bg-white px-3 text-sm outline-none placeholder:text-aq-muted focus:border-aq-navy/40"
            placeholder="Hedef ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filter Chips */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted mb-2">Kategori Filtresi</div>
          <div className="flex flex-wrap gap-1.5">
            {([
              ['all', 'Tümü'],
              ['heading', 'Başlık'],
              ['table', 'Tablo'],
              ['figure', 'Şekil'],
              ['footnote', 'Dipnot'],
              ['endnote', 'Sonnot']
            ] as const).map(([id, label]) => (
              <button
                type="button"
                key={id}
                onClick={() => setActiveFilter(id)}
                className={[
                  'rounded-full border px-3 py-1 text-xs font-medium transition',
                  activeFilter === id
                    ? 'border-aq-navy/45 bg-aq-navy/10 text-aq-navy font-semibold'
                    : 'border-aq-line bg-white text-aq-muted hover:bg-aq-panel hover:text-aq-ink'
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Format Options */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted mb-2">Referans Biçimi</div>
          <div className="flex gap-2">
            {[
              ['context', 'bkz. Nesne 1'],
              ['label', 'Nesne 1'],
              ['number', '1']
            ].map(([mode, label]) => (
              <button
                type="button"
                key={mode}
                onClick={() => setActiveMode(mode as DisplayMode)}
                className={[
                  'flex-1 rounded-lg border py-2 text-center text-xs font-semibold transition',
                  activeMode === mode
                    ? 'border-aq-navy bg-aq-navy text-white shadow-sm'
                    : 'border-aq-line bg-white text-aq-muted hover:bg-aq-panel hover:text-aq-ink'
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Targets List */}
        <div className="border-t border-aq-line pt-2">
          <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
            {filteredTargets.map((target, index) => (
              <article
                key={target.id || index}
                onClick={() => handleSelectTarget(target)}
                className="group flex cursor-pointer items-start gap-3 rounded-xl border border-aq-line/60 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)] transition hover:border-aq-navy/30 hover:bg-aq-panel/20 hover:shadow-sm"
              >
                <span className={['rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase', getBadgeStyle(target.type)].join(' ')}>
                  {getTypeLabel(target.type)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-aq-ink group-hover:text-aq-navy transition text-sm">
                    {target.label.trim()}
                  </div>
                  {target.title && (
                    <div className="mt-0.5 text-xs text-aq-muted truncate">
                      {target.title}
                    </div>
                  )}
                </div>
              </article>
            ))}
            {!filteredTargets.length && (
              <div className="rounded-xl border border-dashed border-aq-line p-8 text-center text-sm text-aq-muted bg-white/50">
                Arama kriterlerine uygun referans hedefi bulunamadı.
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
