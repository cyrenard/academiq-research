import { useEffect, useState, useMemo } from 'react';
import { RotateCcw, Trash2, AlertTriangle, CheckCircle, RefreshCw, X, ArrowRight } from 'lucide-react';
import type { AcademiqReference } from '../../lib/app-state';
import { visibleCitationText } from '../../lib/citation-builder';

interface CitationAuditPanelProps {
  open: boolean;
  onClose: () => void;
  references: AcademiqReference[];
  onDeleteReference: (id: string) => void;
}

interface AuditIssue {
  type: 'missing' | 'unused' | 'mismatch';
  id: string;
  title: string;
  detail: string;
  refIds?: string[];
  domEl?: HTMLElement;
  refRecord?: any;
}

export function CitationAuditPanel({ open, onClose, references, onDeleteReference }: CitationAuditPanelProps) {
  const [issues, setIssues] = useState<AuditIssue[]>([]);
  const [scannedCount, setScannedCount] = useState(0);
  const [isScanning, setIsScanning] = useState(false);

  const runAudit = () => {
    setIsScanning(true);
    const win = window as any;
    const editor = win.getActiveEditorInstance?.() || win.editor;
    if (!editor) {
      setIssues([]);
      setIsScanning(false);
      return;
    }

    const domCitations = document.querySelectorAll('#apaed span.cit, .ProseMirror span.cit');
    setScannedCount(domCitations.length);

    const detectedIssues: AuditIssue[] = [];
    const citedIds = new Set<string>();

    domCitations.forEach((el) => {
      const refAttr = el.getAttribute('data-ref') || '';
      const ids = refAttr.split(',').map((id) => id.trim()).filter(Boolean);
      const text = el.textContent || '';
      const mode = el.getAttribute('data-mode') || 'inline';

      ids.forEach((id) => citedIds.add(id));

      const missingIds = ids.filter((id) => !references.some((r) => r.id === id));
      if (missingIds.length > 0) {
        detectedIssues.push({
          type: 'missing',
          id: refAttr + ':' + text,
          title: text,
          detail: `Bu atıf kütüphanede bulunamadı (Eksik ID: ${missingIds.join(', ')}).`,
          refIds: ids,
          domEl: el as HTMLElement
        });
      } else {
        const refs = ids.map((id) => references.find((r) => r.id === id)).filter(Boolean);
        let expectedText = '';
        try {
          expectedText = visibleCitationText(win, refs, { mode });
        } catch (_) {}

        const normalize = (t: string) => t.replace(/[()]/g, '').trim().toLowerCase();
        if (expectedText && normalize(text) !== normalize(expectedText)) {
          detectedIssues.push({
            type: 'mismatch',
            id: refAttr + ':' + text,
            title: text,
            detail: `Uyuşmayan atıf metni. Beklenen: "${expectedText}"`,
            refIds: ids,
            domEl: el as HTMLElement,
            refRecord: refs
          });
        }
      }
    });

    references.forEach((ref) => {
      if (!citedIds.has(ref.id)) {
        detectedIssues.push({
          type: 'unused',
          id: ref.id,
          title: ref.authors?.join(', ')
            ? `${ref.authors.slice(0, 2).join(', ')} (${ref.year || 't.y.'})`
            : (ref.title || ref.id),
          detail: `"${ref.title || 'Başlıksız'}" kaynağı kütüphanede kayıtlı fakat belgede hiç atıfta bulunulmadı.`,
          refRecord: ref
        });
      }
    });

    setIssues(detectedIssues);
    setIsScanning(false);
  };

  useEffect(() => {
    if (open) {
      runAudit();
    }
  }, [open, references]);

  const jumpToCitation = (el: HTMLElement) => {
    const win = window as any;
    const editor = win.getActiveEditorInstance?.() || win.editor;
    if (!editor) return;
    try {
      const pos = editor.view.posAtDOM(el, 0);
      editor.commands.setTextSelection({ from: pos, to: pos + el.textContent.length });
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('aq-spell-flash');
      setTimeout(() => el.classList.remove('aq-spell-flash'), 1200);
    } catch (e) {
      console.error(e);
    }
  };

  const removeCitationNode = (el: HTMLElement) => {
    const win = window as any;
    const editor = win.getActiveEditorInstance?.() || win.editor;
    if (!editor) return;
    try {
      const pos = editor.view.posAtDOM(el, 0);
      editor.chain().focus().deleteRange({ from: pos, to: pos + el.textContent.length }).run();
      setTimeout(runAudit, 100);
    } catch (e) {
      console.error(e);
    }
  };

  const fixCitationText = (el: HTMLElement, refIds: string[]) => {
    const win = window as any;
    const editor = win.getActiveEditorInstance?.() || win.editor;
    if (!editor) return;
    try {
      const refs = refIds.map((id) => references.find((r) => r.id === id)).filter(Boolean);
      const mode = el.getAttribute('data-mode') || 'inline';
      let expectedText = '';
      try {
        expectedText = visibleCitationText(win, refs, { mode });
      } catch (_) {}
      if (!expectedText) return;

      const pos = editor.view.posAtDOM(el, 0);
      const newHtml = `<span class="cit" data-ref="${refIds.join(',')}" data-mode="${mode}">${expectedText}</span>`;
      editor.chain().focus().insertContentAt({ from: pos, to: pos + el.textContent.length }, newHtml).run();
      setTimeout(runAudit, 100);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnusedDelete = (id: string) => {
    onDeleteReference(id);
    setTimeout(runAudit, 200);
  };

  const removeAllUnused = () => {
    const unused = issues.filter((i) => i.type === 'unused');
    unused.forEach((i) => {
      onDeleteReference(i.id);
    });
    setTimeout(runAudit, 250);
  };

  const fixAllMismatches = () => {
    const mismatches = issues.filter((i) => i.type === 'mismatch');
    const win = window as any;
    const editor = win.getActiveEditorInstance?.() || win.editor;
    if (!editor || !mismatches.length) return;

    const chain = editor.chain().focus();

    const itemsWithPos = mismatches
      .map((m) => {
        try {
          const pos = editor.view.posAtDOM(m.domEl, 0);
          return { m, pos };
        } catch (_) {
          return { m, pos: -1 };
        }
      })
      .filter((item) => item.pos >= 0);

    itemsWithPos.sort((a, b) => b.pos - a.pos);

    itemsWithPos.forEach(({ m, pos }) => {
      const el = m.domEl;
      if (!el) return;
      const refIds = m.refIds || [];
      const refs = refIds.map((id) => references.find((r) => r.id === id)).filter(Boolean);
      const mode = el.getAttribute('data-mode') || 'inline';
      let expectedText = '';
      try {
        expectedText = visibleCitationText(win, refs, { mode });
      } catch (_) {}
      if (expectedText) {
        const newHtml = `<span class="cit" data-ref="${refIds.join(',')}" data-mode="${mode}">${expectedText}</span>`;
        chain.insertContentAt({ from: pos, to: pos + el.textContent.length }, newHtml);
      }
    });

    chain.run();
    setTimeout(runAudit, 100);
  };

  const categoryIssues = useMemo(() => {
    return {
      missing: issues.filter((i) => i.type === 'missing'),
      unused: issues.filter((i) => i.type === 'unused'),
      mismatch: issues.filter((i) => i.type === 'mismatch')
    };
  }, [issues]);

  if (!open) return null;

  return (
    <aside
      role="complementary"
      aria-label="Atıf denetim paneli"
      className="aq-citation-audit-panel fixed right-0 top-0 z-[1100] flex h-full w-[360px] flex-col border-l border-aq-line bg-white shadow-[0_0_28px_rgba(22,27,34,0.16)] text-aq-ink"
    >
      <header className="flex h-12 items-center justify-between border-b border-aq-line px-4 shrink-0 bg-aq-panel/20">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aq-muted">Atıf Denetimi</div>
          <div className="text-sm font-semibold">
            {issues.length === 0 ? 'Sorun bulunmadı' : `${issues.length} olası tutarsızlık`}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={runAudit}
            disabled={isScanning}
            className="flex h-7 items-center gap-1 rounded-md border border-aq-line px-2 text-[11px] font-semibold text-aq-muted hover:bg-aq-panel"
            title="Atıfları tekrar tara"
          >
            <RefreshCw size={10} className={isScanning ? 'animate-spin' : ''} />
            Yenile
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Paneli kapat"
            className="flex h-7 w-7 items-center justify-center rounded-md text-aq-muted hover:bg-aq-panel"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle size={36} className="text-emerald-500 mb-3" />
            <div className="text-sm font-semibold text-zinc-800">Tebrikler, Atıf Hatası Yok!</div>
            <div className="text-xs text-aq-muted max-w-[200px] mt-1">
              Metin içi atıflarınız kütüphanenizle tam uyumlu ve {scannedCount} atıf doğrulandı.
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              {categoryIssues.unused.length > 0 && (
                <button
                  type="button"
                  onClick={removeAllUnused}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 bg-zinc-100 hover:bg-zinc-200 border border-aq-line rounded text-[11px] font-medium transition"
                >
                  <Trash2 size={12} />
                  Kullanılmayanları Sil
                </button>
              )}
              {categoryIssues.mismatch.length > 0 && (
                <button
                  type="button"
                  onClick={fixAllMismatches}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 bg-aq-navy text-white hover:bg-aq-navy/90 rounded text-[11px] font-medium transition shadow-sm"
                >
                  <RotateCcw size={12} />
                  Uyuşmayanları Onar
                </button>
              )}
            </div>

            {categoryIssues.missing.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-red-600 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  Kayıp Atıflar ({categoryIssues.missing.length})
                </div>
                <div className="space-y-2">
                  {categoryIssues.missing.map((issue) => (
                    <div key={issue.id} className="border border-red-100 bg-red-50/30 rounded p-2.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => issue.domEl && jumpToCitation(issue.domEl)}
                          className="text-left font-semibold text-xs text-red-800 hover:underline flex-1"
                          title="Belgede bu konuma git"
                        >
                          {issue.title}
                        </button>
                        <button
                          type="button"
                          onClick={() => issue.domEl && removeCitationNode(issue.domEl)}
                          className="text-red-600 hover:bg-red-50 p-1 rounded transition shrink-0"
                          title="Atıfı belgeden sil"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div className="text-[11px] text-red-700/80 leading-normal">{issue.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {categoryIssues.mismatch.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  Uyuşmayan Atıf Metinleri ({categoryIssues.mismatch.length})
                </div>
                <div className="space-y-2">
                  {categoryIssues.mismatch.map((issue) => (
                    <div key={issue.id} className="border border-amber-100 bg-amber-50/20 rounded p-2.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => issue.domEl && jumpToCitation(issue.domEl)}
                          className="text-left font-semibold text-xs text-amber-900 hover:underline flex-1"
                          title="Belgede bu konuma git"
                        >
                          {issue.title}
                        </button>
                        <button
                          type="button"
                          onClick={() => issue.domEl && fixCitationText(issue.domEl, issue.refIds || [])}
                          className="text-amber-700 hover:bg-amber-50 p-1 rounded transition shrink-0"
                          title="Atıf metnini sıfırla/düzelt"
                        >
                          <RotateCcw size={13} />
                        </button>
                      </div>
                      <div className="text-[11px] text-amber-800/80 leading-normal">{issue.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {categoryIssues.unused.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                  <ArrowRight size={12} />
                  Kullanılmayan Kaynaklar ({categoryIssues.unused.length})
                </div>
                <div className="space-y-2">
                  {categoryIssues.unused.map((issue) => (
                    <div key={issue.id} className="border border-zinc-200 bg-zinc-50/50 rounded p-2.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-xs text-zinc-700 flex-1 leading-normal">
                          {issue.title}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleUnusedDelete(issue.id)}
                          className="text-zinc-500 hover:bg-zinc-100 p-1 rounded transition shrink-0"
                          title="Kaynakçadan kaldır"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div className="text-[11px] text-zinc-500/90 leading-normal">{issue.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
