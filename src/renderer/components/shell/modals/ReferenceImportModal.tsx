import { useRef, useState, type ChangeEvent } from 'react';
import { Modal } from '../../ui/Modal';
import { fetchDoiReference, fetchLegacyReference } from '../../../lib/reference-import';
import { parseExternalReferenceText, runExternalReferenceFileImport } from '../../../lib/external-reference-import';

type ReferenceImportModalProps = {
  open: boolean;
  onClose: () => void;
  onStatus: (message: string) => void;
};

type TabType = 'quick' | 'bulk';
type IdentifierType = 'doi' | 'isbn' | 'pmid';

export function ReferenceImportModal({ open, onClose, onStatus }: ReferenceImportModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('quick');
  
  // Tab 1: Quick Fetch State
  const [idType, setIdType] = useState<IdentifierType>('doi');
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Tab 2: Bulk Upload State
  const [textFormat, setTextFormat] = useState<'auto' | 'bibtex' | 'ris' | 'apa'>('auto');
  const [bulkText, setBulkText] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchPmidReference = async (pmid: string) => {
    const pmidClean = pmid.trim().replace(/[^0-9]/g, '');
    if (!pmidClean) return null;
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmidClean}&retmode=json`;
    const response = await (window as any).electronAPI?.netFetchJSON?.(url, { timeoutMs: 8000 }) as any;
    if (response?.ok && response.data) {
      const docInfo = response.data?.result?.[pmidClean];
      if (docInfo) {
        const title = docInfo.title || '';
        const authors = Array.isArray(docInfo.authors) ? docInfo.authors.map((a: any) => a.name) : [];
        const pubDate = docInfo.pubdate || docInfo.sortpubdate || '';
        const yearMatch = pubDate.match(/\b(19|20)\d{2}\b/);
        const year = yearMatch ? yearMatch[0] : '';
        const source = docInfo.source || '';
        return {
          id: `ref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
          title,
          authors,
          year,
          journal: source,
          volume: docInfo.volume || '',
          issue: docInfo.issue || '',
          fp: docInfo.pages || '',
          lp: '',
          doi: docInfo.articleids?.find((id: any) => id.idtype === 'doi')?.value || '',
          url: `https://pubmed.ncbi.nlm.nih.gov/${pmidClean}/`,
          pmid: pmidClean,
          referenceType: 'article'
        };
      }
    }
    return null;
  };

  const handleQuery = async () => {
    const val = inputValue.trim();
    if (!val) {
      setErrorMsg('Lütfen geçerli bir kimlik girin.');
      return;
    }

    setLoading(true);
    setPreview(null);
    setErrorMsg('');

    try {
      let ref: any = null;
      if (idType === 'doi') {
        ref = await fetchDoiReference(val);
      } else if (idType === 'isbn') {
        // fetchLegacyReference wraps the window.fetchISBN callback
        ref = await fetchLegacyReference('fetchISBN', val);
      } else if (idType === 'pmid') {
        ref = await fetchPmidReference(val);
      }

      if (ref) {
        setPreview(ref);
      } else {
        setErrorMsg('Metadata bulunamadı. Lütfen kimliği kontrol edip tekrar deneyin.');
      }
    } catch (err: any) {
      console.error('[ReferenceImportModal] Fetch error:', err);
      setErrorMsg(err.message || 'Sorgulama sırasında bir ağ hatası oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleImportPreview = () => {
    if (!preview) return;
    try {
      window.dispatchEvent(new CustomEvent('aq:import-references', {
        detail: {
          entries: [preview],
          sourceLabel: `${idType.toUpperCase()} Sorgu`,
          includeInBibliography: true,
          revealBibliography: true
        }
      }));
      onStatus(`Kaynak eklendi: ${preview.title}`);
      setPreview(null);
      setInputValue('');
    } catch (e) {
      onStatus('Kaynak eklenemedi');
    }
  };

  const handleBulkTextImport = () => {
    const val = bulkText.trim();
    if (!val) {
      setBulkStatus('Metin alanı boş.');
      return;
    }
    
    try {
      const entries = parseExternalReferenceText(val, textFormat);
      if (!entries.length) {
        setBulkStatus('Eşleşen kaynak bulunamadı. Lütfen biçimi kontrol edin.');
        return;
      }
      window.dispatchEvent(new CustomEvent('aq:import-references', {
        detail: {
          entries,
          sourceLabel: 'Metin Aktarım',
          includeInBibliography: true,
          revealBibliography: true
        }
      }));
      onStatus(`${entries.length} kaynak aktarıldı`);
      setBulkStatus(`${entries.length} kaynak başarıyla kütüphaneye eklendi.`);
      setBulkText('');
    } catch (e) {
      setBulkStatus('Aktarım sırasında hata oluştu.');
    }
  };

  const handleFileImport = (event: ChangeEvent<HTMLInputElement>) => {
    setBulkStatus('Dosya işleniyor...');
    runExternalReferenceFileImport(event, (msg) => {
      onStatus(msg);
      setBulkStatus(msg);
    });
    event.currentTarget.value = '';
  };

  const importBibliographyText = (text: string, sourceLabel: string) => {
    const raw = text.trim();
    if (!raw) return false;

    const lower = sourceLabel.toLowerCase();
    const format = lower.endsWith('.bib')
      ? 'bibtex'
      : lower.endsWith('.ris') || lower.endsWith('.enw')
        ? 'ris'
        : 'auto';
    const entries = parseExternalReferenceText(raw, format);
    if (!entries.length) return false;

    window.dispatchEvent(new CustomEvent('aq:import-references', {
      detail: {
        entries,
        sourceLabel,
        includeInBibliography: true,
        revealBibliography: true
      }
    }));
    onStatus(`${entries.length} kaynak aktarÄ±ldÄ±`);
    setBulkStatus(`${entries.length} kaynak baÅŸarÄ±yla kÃ¼tÃ¼phaneye eklendi.`);
    return true;
  };

  const handleNativeFileImport = async () => {
    const api = (window as any).electronAPI;
    if (typeof api?.openBibliographyDialog !== 'function') {
      fileInputRef.current?.click();
      return;
    }

    try {
      setBulkStatus('Dosya seÃ§iliyor...');
      const result = await api.openBibliographyDialog();
      const files = Array.isArray(result?.files) ? result.files : [];
      if (!files.length) {
        setBulkStatus('Dosya seÃ§ilmedi.');
        return;
      }

      let imported = false;
      for (const file of files) {
        imported = importBibliographyText(
          String(file?.text || ''),
          String(file?.name || file?.path || 'references.bib')
        ) || imported;
      }
      if (!imported) {
        setBulkStatus('BibTeX/RIS kaynaÄŸÄ± bulunamadÄ±.');
      }
    } catch (err) {
      console.error('[ReferenceImportModal] Native file import failed:', err);
      setBulkStatus('Dosya seÃ§im penceresi aÃ§Ä±lamadÄ±.');
      fileInputRef.current?.click();
    }
  };

  return (
    <Modal title="Dışarıdan Kaynakça Ekle" open={open} onClose={onClose}>
      <div className="space-y-4">
        {/* Tab Headers */}
        <div className="flex border-b border-aq-line">
          <button
            type="button"
            onClick={() => setActiveTab('quick')}
            className={[
              'flex-1 pb-2.5 text-center text-xs font-semibold border-b-2 transition',
              activeTab === 'quick' ? 'border-aq-navy text-aq-navy' : 'border-transparent text-aq-muted hover:text-aq-ink'
            ].join(' ')}
          >
            Hızlı Getir (DOI/ISBN/PMID)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bulk')}
            className={[
              'flex-1 pb-2.5 text-center text-xs font-semibold border-b-2 transition',
              activeTab === 'bulk' ? 'border-aq-navy text-aq-navy' : 'border-transparent text-aq-muted hover:text-aq-ink'
            ].join(' ')}
          >
            Dosya / Metin Yükle
          </button>
        </div>

        {/* Tab 1: Quick Fetch */}
        {activeTab === 'quick' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <select
                className="h-10 rounded-lg border border-aq-line bg-white px-2 text-xs font-semibold outline-none focus:border-aq-navy/40"
                value={idType}
                onChange={(e) => setIdType(e.target.value as IdentifierType)}
              >
                <option value="doi">DOI</option>
                <option value="isbn">ISBN</option>
                <option value="pmid">PubMed ID</option>
              </select>
              <input
                type="text"
                className="h-10 flex-1 rounded-lg border border-aq-line bg-white px-3 text-xs outline-none placeholder:text-aq-muted focus:border-aq-navy/40"
                placeholder={`${idType.toUpperCase()} girin (örn: ${
                  idType === 'doi' ? '10.1016/j.cell.2019.01.001' : idType === 'isbn' ? '9783161484100' : '25324512'
                })`}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
              />
              <button
                type="button"
                onClick={handleQuery}
                disabled={loading}
                className="h-10 rounded-lg bg-aq-navy px-4 text-xs font-semibold text-white hover:bg-aq-navy/90 disabled:opacity-50"
              >
                {loading ? 'Aranıyor...' : 'Sorgula'}
              </button>
            </div>

            {errorMsg && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center py-6">
                <span className="text-xs text-aq-muted animate-pulse">Kataloglar taranıyor, lütfen bekleyin...</span>
              </div>
            )}

            {preview && (
              <div className="rounded-xl border border-aq-line bg-white p-4 shadow-[0_10px_28px_rgba(16,24,40,0.04)]">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">Bulunan Metadata</div>
                <h4 className="mt-2 text-sm font-semibold text-aq-ink leading-snug">{preview.title}</h4>
                
                <dl className="mt-3 grid grid-cols-[80px_1fr] gap-x-2 gap-y-1.5 text-xs text-aq-ink">
                  <dt className="font-semibold text-aq-muted">Yazarlar:</dt>
                  <dd>{Array.isArray(preview.authors) ? preview.authors.join(', ') : '-'}</dd>
                  
                  <dt className="font-semibold text-aq-muted">Yıl:</dt>
                  <dd>{preview.year || '-'}</dd>
                  
                  <dt className="font-semibold text-aq-muted">Kaynak:</dt>
                  <dd>{preview.journal || preview.publisher || '-'}</dd>
                  
                  {preview.doi && (
                    <>
                      <dt className="font-semibold text-aq-muted">DOI:</dt>
                      <dd className="break-all font-mono text-[10px] text-aq-muted">{preview.doi}</dd>
                    </>
                  )}
                </dl>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={handleImportPreview}
                    className="h-9 flex-1 rounded-lg bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 shadow-sm"
                  >
                    Kütüphaneye Ekle
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    className="h-9 rounded-lg border border-aq-line bg-white px-3 text-xs font-semibold text-aq-muted hover:bg-aq-panel"
                  >
                    Vazgeç
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Bulk Upload */}
        {activeTab === 'bulk' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-aq-ink">Yapıştır veya Yükle</span>
              <select
                className="h-8 rounded-lg border border-aq-line bg-white px-2 text-xs font-semibold outline-none focus:border-aq-navy/40"
                value={textFormat}
                onChange={(e) => setTextFormat(e.target.value as any)}
              >
                <option value="auto">Biçim: Otomatik Algıla</option>
                <option value="apa">Biçim: APA 7 Referans Satırı</option>
                <option value="bibtex">Biçim: BibTeX</option>
                <option value="ris">Biçim: RIS</option>
              </select>
            </div>

            <textarea
              rows={6}
              className="w-full rounded-lg border border-aq-line bg-white p-3 text-xs outline-none placeholder:text-aq-muted focus:border-aq-navy/40 font-mono"
              placeholder="BibTeX kodu, RIS verisi veya APA kaynakça satırlarını buraya yapıştırın..."
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleBulkTextImport}
                className="h-9 flex-1 rounded-lg bg-aq-navy text-xs font-semibold text-white hover:bg-aq-navy/90"
              >
                Metinden Aktar
              </button>

              <button
                type="button"
                onClick={handleNativeFileImport}
                className="h-9 rounded-lg border border-aq-line bg-white px-4 text-xs font-semibold text-aq-ink flex items-center justify-center cursor-pointer hover:bg-aq-panel shadow-sm"
              >
                Dosya Seç (.bib, .ris, .txt)
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".bib,.ris,.enw,.txt,.apa"
                hidden
                onChange={handleFileImport}
              />
            </div>

            {bulkStatus && (
              <div className="rounded-lg border border-aq-line bg-aq-panel p-3 text-xs text-aq-muted leading-relaxed">
                {bulkStatus}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
