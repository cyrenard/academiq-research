import { useEffect, useState } from 'react';
import { findCitations, type FoundCandidate } from '../../lib/citation-finder/search';
import { appStore } from '../../lib/app-store';
import { addReferenceToActiveWorkspace } from '../../lib/app-state';

function newRefId(): string {
  return 'ref_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function candidateToReference(c: FoundCandidate, id: string): any {
  return {
    id,
    title: c.title,
    authors: Array.isArray(c.authors) ? c.authors : [],
    year: c.year ? String(c.year) : '',
    doi: c.doi || '',
    url: c.oaPdfUrl || (c.doi ? `https://doi.org/${c.doi}` : ''),
    journal: c.venue || '',
    referenceType: 'article',
    abstract: c.abstract || '',
    source: c.source || 'crossref'
  };
}

function insertCitationForRef(refId: string, caretOffset: number | null) {
  const win = window as any;
  try {
    if (caretOffset != null && win.__aqEngineComments?.setCaret) win.__aqEngineComments.setCaret(caretOffset);
  } catch (_e) { /* noop */ }
  if (typeof win.insertCitation === 'function') { try { win.insertCitation(refId); return true; } catch (_e) { /* fall through */ } }
  if (win.AQCitationRuntime?.insertSelection) { try { return !!win.AQCitationRuntime.insertSelection(refId); } catch (_e) { /* noop */ } }
  return false;
}

interface Props {
  sentence: string;
  caretOffset: number | null;
  onClose: () => void;
}

export function CitationFinderModal({ sentence, caretOffset, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<FoundCandidate[]>([]);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    findCitations(sentence, { currentYear: new Date().getFullYear() })
      .then((res) => {
        if (!alive) return;
        setCandidates(res.candidates.slice(0, 12));
        if (!res.candidates.length) setError('Bu cümleye uygun kaynak bulunamadı. Sorguyu sadeleştirip tekrar deneyin.');
      })
      .catch(() => alive && setError('Arama başarısız (internet/ağ köprüsü gerekir).'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [sentence]);

  const cite = (c: FoundCandidate) => {
    const id = newRefId();
    appStore.setState(addReferenceToActiveWorkspace(appStore.getState(), candidateToReference(c, id)));
    const ok = insertCitationForRef(id, caretOffset);
    (window as any).setStatusText?.(ok ? 'Atıf eklendi' : 'Kaynak kütüphaneye eklendi (atıf elle yapılabilir)', ok ? 'ok' : 'warn');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[2400] flex items-start justify-center bg-black/30 p-6" onClick={onClose}>
      <div
        className="mt-12 flex max-h-[80vh] w-[640px] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-aq-line bg-white shadow-[0_30px_80px_rgba(22,27,34,0.30)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-aq-line px-4 py-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-aq-ink">Atıf bul</div>
            <div className="mt-0.5 truncate text-[12px] text-aq-muted" title={sentence}>“{sentence}”</div>
          </div>
          <button type="button" className="rounded px-2 text-[18px] leading-none text-aq-muted hover:bg-aq-panel" onClick={onClose}>×</button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
          {loading ? (
            <div className="px-2 py-10 text-center text-[12px] text-aq-muted">Aranıyor… (Crossref · Semantic Scholar)</div>
          ) : error ? (
            <div className="px-2 py-10 text-center text-[12px] text-aq-muted">{error}</div>
          ) : (
            candidates.map((c) => {
              const isV = !!verified[c.id];
              return (
                <div key={c.id} className="rounded-lg border border-aq-line p-3 text-[12px]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold leading-snug text-aq-ink">{c.title || 'Başlıksız'}</div>
                    <div className="flex shrink-0 items-center gap-1">
                      {c.isOpenAccess ? <span className="rounded bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-700">OA</span> : null}
                      {c.quartile ? <span className="rounded bg-aq-navy/10 px-1.5 text-[10px] font-semibold text-aq-navy">{c.quartile}</span> : null}
                    </div>
                  </div>
                  <div className="mt-0.5 text-[11px] text-aq-muted">
                    {(c.authors || []).slice(0, 4).join(', ')}{(c.authors || []).length > 4 ? ' vd.' : ''}
                    {c.year ? ` · ${c.year}` : ''}{c.venue ? ` · ${c.venue}` : ''}
                    {typeof c.citationCount === 'number' ? ` · ${c.citationCount} atıf` : ''}
                  </div>

                  {c.supporting ? (
                    <div className="mt-2 rounded border-l-2 border-amber-400 bg-amber-50 px-2 py-1 text-[11px] text-aq-ink/85">
                      <span className="font-semibold text-amber-700">Destekleyen cümle (özetten): </span>
                      “{c.supporting.sentence}”
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] italic text-aq-muted">Özet bulunamadı — uygunluğu DOI/PDF'ten doğrula.</div>
                  )}

                  <div className="mt-2 flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-[11px] text-aq-ink">
                      <input
                        type="checkbox"
                        checked={isV}
                        onChange={(e) => setVerified((v) => ({ ...v, [c.id]: e.target.checked }))}
                      />
                      Bu kaynağın cümlemi desteklediğini doğruladım
                    </label>
                    <div className="flex items-center gap-1">
                      {c.doi ? (
                        <a className="rounded px-2 py-1 text-[11px] text-aq-navy hover:bg-aq-panel" href={`https://doi.org/${c.doi}`} target="_blank" rel="noreferrer">Kaynağı aç</a>
                      ) : null}
                      <button
                        type="button"
                        disabled={!isV}
                        className="rounded bg-aq-navy px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-aq-navy/90 disabled:opacity-40"
                        onClick={() => cite(c)}
                      >
                        Ekle & atıf yap
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-aq-line px-4 py-2 text-[10px] text-aq-muted">
          Öneriler otomatiktir; atıf eklemeden önce kaynağın cümleni gerçekten desteklediğini doğrula (etik sorumluluk sende).
        </div>
      </div>
    </div>
  );
}
