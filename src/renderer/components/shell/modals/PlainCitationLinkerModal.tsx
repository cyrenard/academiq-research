import { useEffect, useState } from 'react';
import { Modal } from '../../ui/Modal';
import type { AcademiqAppState, AcademiqReference } from '../../../lib/app-state';

type PlainCitationLinkerModalProps = {
  open: boolean;
  state: AcademiqAppState;
  singleMatch?: any | null;
  onClose: () => void;
  onStatus: (message: string) => void;
};

export function PlainCitationLinkerModal({
  open,
  state,
  singleMatch,
  onClose,
  onStatus
}: PlainCitationLinkerModalProps) {
  const [matches, setMatches] = useState<any[]>([]);
  const [selectedRefs, setSelectedRefs] = useState<Record<number, string>>({});
  const [searchQueries, setSearchQueries] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);

  const currentWorkspace = state.wss?.find((w) => w.id === state.cur) || state.wss?.[0];
  const references: AcademiqReference[] = currentWorkspace?.lib || [];

  const getEditor = () => {
    const win = window as any;
    return typeof win.getActiveEditorInstance === 'function'
      ? win.getActiveEditorInstance()
      : win.editor;
  };

  const runScan = () => {
    if (singleMatch) {
      setMatches([singleMatch]);
      // Initialize selected reference for the single match
      const candidates = getCandidates(singleMatch);
      if (candidates.length > 0) {
        setSelectedRefs({ 0: candidates[0].id });
      }
      return;
    }

    const editor = getEditor();
    if (!editor) return;

    setLoading(true);
    try {
      const win = window as any;
      if (win.AQPlainCitationLinking && typeof win.AQPlainCitationLinking.scanAQEngine === 'function') {
        const results = win.AQPlainCitationLinking.scanAQEngine(editor, references) || [];
        setMatches(results);
        
        // Initialize default selected references for each match
        const initialSelected: Record<number, string> = {};
        results.forEach((match: any, index: number) => {
          const candidates = getCandidates(match);
          if (candidates.length > 0) {
            initialSelected[index] = candidates[0].id;
          }
        });
        setSelectedRefs(initialSelected);
      } else {
        onStatus('Düz atıf bağlama modülü bulunamadı');
      }
    } catch (error) {
      console.error('[PlainCitationLinkerModal] Scan error:', error);
      onStatus('Atıflar taranırken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      runScan();
    } else {
      setMatches([]);
      setSelectedRefs({});
      setSearchQueries({});
    }
  }, [open, singleMatch]);

  const getCandidates = (match: any): AcademiqReference[] => {
    if (match.complete && match.refIds?.length) {
      return match.refIds
        .map((id: string) => references.find((ref) => String(ref.id) === String(id)))
        .filter(Boolean) as AcademiqReference[];
    }
    if (match.ambiguous?.length) {
      const allCandidates = match.ambiguous.reduce((acc: AcademiqReference[], group: any) => {
        return acc.concat(group.matches || []);
      }, []);
      // Unique candidates by ID
      const seen = new Set<string>();
      return allCandidates.filter((ref: AcademiqReference) => {
        if (!ref?.id || seen.has(ref.id)) return false;
        seen.add(ref.id);
        return true;
      });
    }
    return [];
  };

  const handleLink = (index: number) => {
    const match = matches[index];
    const refId = selectedRefs[index];
    if (!match || !refId) return;

    const editor = getEditor();
    if (!editor) {
      onStatus('Aktif editör bulunamadı');
      return;
    }

    const win = window as any;
    if (win.AQPlainCitationLinking && typeof win.AQPlainCitationLinking.linkRange === 'function') {
      try {
        const mode = match.occurrence.mode === 'textual' ? 'textual' : 'inline';
        const ok = win.AQPlainCitationLinking.linkRange(editor, match.occurrence, [refId], mode);
        if (ok) {
          onStatus('Atıf başarıyla bağlandı.');
          if (singleMatch) {
            onClose();
          } else {
            runScan();
          }
        } else {
          onStatus('Atıf bağlanamadı.');
        }
      } catch (error) {
        console.error('[PlainCitationLinkerModal] Link error:', error);
        onStatus('Atıf bağlanırken hata oluştu.');
      }
    }
  };

  const handleBulkLink = () => {
    const editor = getEditor();
    if (!editor) return;

    const win = window as any;
    if (win.AQPlainCitationLinking && typeof win.AQPlainCitationLinking.linkHighConfidence === 'function') {
      try {
        const result = win.AQPlainCitationLinking.linkHighConfidence(editor, references, { root: window }) || {};
        if (result.linked) {
          onStatus(`${result.linked} güvenli atıf otomatik bağlandı.`);
          runScan();
        } else {
          onStatus('Bağlanacak güvenli eşleşme bulunamadı.');
        }
      } catch (error) {
        console.error('[PlainCitationLinkerModal] Bulk link error:', error);
        onStatus('Otomatik atıf bağlama hatası.');
      }
    }
  };

  const getStatusBadge = (match: any) => {
    if (match.complete) {
      return <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 uppercase">Güvenli</span>;
    }
    if (match.ambiguous?.length) {
      return <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 uppercase">Belirsiz</span>;
    }
    return <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 uppercase">Kaynaksız</span>;
  };

  const getReferenceLabel = (ref: AcademiqReference) => {
    const meta = [ref.year, ref.journal || ref.publisher, ref.doi ? 'DOI' : ''].filter(Boolean).join(' · ');
    return `${ref.title} (${ref.year || 'Yıl yok'})${meta ? ` — ${meta}` : ''}`;
  };

  return (
    <Modal title={singleMatch ? "Tekil Atıf Bağlantısı" : "Düz Atıfları Kaynaklara Bağla"} open={open} onClose={onClose} wide>
      <div className="space-y-4">
        {/* Header Summary & Bulk Action */}
        <div className="flex items-center justify-between flex-wrap gap-3 border-b border-aq-line pb-3">
          <div className="text-xs text-aq-muted">
            {loading ? (
              <span>Belge taranıyor...</span>
            ) : matches.length ? (
              <span>
                {matches.length} düz atıf bulundu ·{' '}
                {matches.filter((m) => m.complete).length} güvenli ·{' '}
                {matches.filter((m) => m.ambiguous?.length).length} belirsiz ·{' '}
                {matches.filter((m) => !m.complete && !m.ambiguous?.length).length} kaynaksız
              </span>
            ) : (
              <span>Belgede bağlanacak düz APA atıfı bulunamadı.</span>
            )}
          </div>

          {!singleMatch && matches.some((m) => m.complete) && (
            <button
              type="button"
              onClick={handleBulkLink}
              className="h-8 rounded-lg bg-aq-navy px-3 text-xs font-semibold text-white hover:bg-aq-navy/90 shadow-sm transition"
            >
              Güvenli Eşleşmeleri Otomatik Bağla
            </button>
          )}
        </div>

        {/* Scan Status / Results */}
        {loading ? (
          <div className="py-12 text-center text-xs text-aq-muted animate-pulse">
            Belge içeriği taranıyor, lütfen bekleyin...
          </div>
        ) : (
          <div className="max-h-[520px] space-y-3 overflow-auto pr-1">
            {matches.map((match, index) => {
              const occ = match.occurrence || {};
              const candidates = getCandidates(match);
              
              // Filter the entire reference list based on search query for this item if needed
              const query = (searchQueries[index] || '').toLowerCase().trim();
              const searchedRefs = query
                ? references.filter((ref) => {
                    const title = String(ref.title || '').toLowerCase();
                    const author = Array.isArray(ref.authors) ? ref.authors.join(' ').toLowerCase() : '';
                    const journal = String(ref.journal || ref.publisher || '').toLowerCase();
                    const year = String(ref.year || '');
                    return title.includes(query) || author.includes(query) || journal.includes(query) || year.includes(query);
                  }).slice(0, 100)
                : [];

              return (
                <article
                  key={index}
                  className="rounded-xl border border-aq-line bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.01)] hover:shadow-sm transition"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(match)}
                        <span className="text-[10px] text-aq-muted font-mono">
                          Konum: {occ.from}–{occ.to}
                        </span>
                      </div>
                      <div className="font-serif text-base text-aq-ink font-medium leading-relaxed">
                        {occ.text}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                      {/* Search/Select input combo */}
                      <div className="flex flex-col gap-1.5 min-w-[280px]">
                        {/* Selector */}
                        <select
                          className="h-9 w-full rounded-lg border border-aq-line bg-white px-2 text-xs font-semibold outline-none focus:border-aq-navy/40"
                          value={selectedRefs[index] || ''}
                          onChange={(e) => setSelectedRefs({ ...selectedRefs, [index]: e.target.value })}
                        >
                          <option value="">-- Kaynak Seçin --</option>
                          {/* Recommended Candidates */}
                          {candidates.length > 0 && (
                            <optgroup label="Önerilen Eşleşmeler">
                              {candidates.map((ref) => (
                                <option key={ref.id} value={ref.id}>
                                  {getReferenceLabel(ref)}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {/* Searched references from search bar */}
                          {searchedRefs.length > 0 && (
                            <optgroup label="Arama Sonuçları">
                              {searchedRefs.map((ref) => (
                                <option key={ref.id} value={ref.id}>
                                  {getReferenceLabel(ref)}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>

                        {/* Search library field */}
                        <input
                          type="text"
                          className="h-8 w-full rounded-lg border border-aq-line bg-white px-2.5 text-[11px] outline-none placeholder:text-aq-muted focus:border-aq-navy/30"
                          placeholder="Kütüphanede ara (yazar, başlık, yıl)..."
                          value={searchQueries[index] || ''}
                          onChange={(e) => {
                            setSearchQueries({ ...searchQueries, [index]: e.target.value });
                          }}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleLink(index)}
                        disabled={!selectedRefs[index]}
                        className="h-9 rounded-lg bg-aq-navy px-4 text-xs font-semibold text-white hover:bg-aq-navy/90 disabled:opacity-40 transition"
                      >
                        Bağla
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}

            {!matches.length && (
              <div className="rounded-xl border border-dashed border-aq-line p-10 text-center text-sm text-aq-muted bg-white/50">
                Belgede taranacak düz atıf bulunamadı.
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
