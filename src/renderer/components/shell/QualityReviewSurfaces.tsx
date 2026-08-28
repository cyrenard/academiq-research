import type { MetadataLookupCandidate } from '../../lib/metadata-lookup';
import {
  handleDuplicateReviewClick,
  renderDuplicateReviewFallback
} from '../../lib/quality-surface';
import { hideLegacyModal } from '../../lib/legacy-dom-helpers';

export type MetadataHealthRow = {
  ref: any;
  report: any;
};

export type MetadataHealthSummary = {
  total: number;
  complete: number;
  incomplete: number;
  suspicious: number;
  issueText: string;
};

type QualityReviewSurfacesProps = {
  rows: MetadataHealthRow[];
  summary: MetadataHealthSummary;
  filter: string;
  candidate: MetadataLookupCandidate | null;
  busyId: string;
  onFilterChange: (filter: string) => void;
  onMetadataAction: (action: string, ref: any) => void;
  onApplyCandidate: (mode: 'merge' | 'doi-only') => void;
  onDismissCandidate: () => void;
  onRefreshMetadata: () => void;
};

export function QualityReviewSurfaces({
  rows,
  summary,
  filter,
  candidate,
  busyId,
  onFilterChange,
  onMetadataAction,
  onApplyCandidate,
  onDismissCandidate,
  onRefreshMetadata
}: QualityReviewSurfacesProps) {
  return (
    <>
      <div className="modal-bg" id="dupModal" onMouseDown={(event) => {
        if (event.target === event.currentTarget) hideLegacyModal('dupModal');
      }}>
        <div className="modal aq-legacy-modal-lg">
          <div className="mt">Duplicate Review</div>
          <div id="dupSummary" />
          <div className="mb">
            <button className="mbtn p" id="dupMergeAllBtn" type="button" onClick={() => {
              const win = window as any;
              if (typeof win.__mergeAllDuplicateGroups === 'function') win.__mergeAllDuplicateGroups();
              window.setTimeout(renderDuplicateReviewFallback, 0);
            }}>Tümünü Birleştir</button>
            <button className="mbtn s" id="dupDismissAllBtn" type="button" onClick={() => {
              const win = window as any;
              if (typeof win.__dismissAllDuplicateGroups === 'function') win.__dismissAllDuplicateGroups();
              window.setTimeout(renderDuplicateReviewFallback, 0);
            }}>Tümünü Yoksay</button>
          </div>
          <div id="dupGroups" onClick={handleDuplicateReviewClick} />
          <div className="mb"><button className="mbtn s" id="dupCloseBtn" type="button" onClick={() => hideLegacyModal('dupModal')}>Kapat</button></div>
        </div>
      </div>

      <div className="modal-bg" id="metaHealthModal" onMouseDown={(event) => {
        if (event.target === event.currentTarget) hideLegacyModal('metaHealthModal');
      }}>
        <div className="modal aq-legacy-modal-lg">
          <div className="mt">Metadata Health</div>
          <div id="metaHealthSummary">
            Toplam {summary.total} · Tam {summary.complete} · Eksik {summary.incomplete} · Şüpheli {summary.suspicious}
            {summary.issueText ? ` · ${summary.issueText}` : ''}
          </div>
          <div className="mh-sortbar" id="metaHealthSortBar">
            {[
              ['all', summary.total],
              ['incomplete', summary.incomplete],
              ['suspicious', summary.suspicious],
              ['complete', summary.complete]
            ].map(([sort, count]) => (
              <button
                key={String(sort)}
                type="button"
                className={`mh-sortbtn ${filter === sort ? 'on' : ''}`}
                data-mh-sort={String(sort)}
                onClick={() => onFilterChange(String(sort))}
              >
                {String(sort)}<span className="mh-sortcount">{String(count)}</span>
              </button>
            ))}
          </div>
          <div id="metaHealthList">
            {rows.length ? rows.map((row, index) => {
              const ref = row.ref || {};
              const report = row.report || { status: 'complete', issues: [] };
              const status = String(report.status || 'complete');
              const statusLabel = status === 'complete' ? 'Tam' : (status === 'incomplete' ? 'Eksik' : 'Şüpheli');
              const authors = (Array.isArray(ref.authors) ? ref.authors : []).slice(0, 2).join('; ');
              const issues = Array.isArray(report.issues) ? report.issues : [];
              return (
                <div className="mh-card" data-ref-id={ref.id || ''} key={`${ref.id || 'ref'}-${index}`}>
                  <div className="mh-card-head">
                    <span className={`mh-status mh-${status}`}>{statusLabel}</span>
                    <span className="mh-title">{ref.title || 'Başlıksız'}</span>
                  </div>
                  <div className="mh-meta">{authors || 'Yazar yok'} · {ref.year || 'yıl yok'} · {ref.journal || 'dergi yok'}</div>
                  <div className="mh-issues">
                    {issues.length ? issues.map((issue: any, issueIndex: number) => (
                      <span className="mh-issue" key={issueIndex}>{issue.message || issue.code}</span>
                    )) : <span className="mh-issue">Sorun yok</span>}
                  </div>
                  <div className="mb">
                    <button className="mbtn s" type="button" onClick={() => onMetadataAction('edit', ref)}>Manuel Düzenle</button>
                    <button className="mbtn s" type="button" onClick={() => onMetadataAction('refetch', ref)}>DOI Yeniden Çek</button>
                    <button className="mbtn p" type="button" onClick={() => onMetadataAction('normalize', ref)}>Normalize Et</button>
                  </div>
                </div>
              );
            }) : <div className="aq-empty-note">Kaynak bulunamadı.</div>}
          </div>
          {candidate ? (
            <div className="mh-card mh-candidate-card">
              <div className="mh-card-head">
                <span className="mh-status mh-complete">{Math.round(candidate.score * 100)}%</span>
                <span className="mh-title">Metadata eşleşmesi bulundu</span>
              </div>
              <div className="mh-meta">
                {candidate.source} · {candidate.evidence.join(' · ') || 'web araması'}
              </div>
              <div className="mh-compare-grid">
                <div>
                  <div className="mh-compare-label">Mevcut</div>
                  <b>{candidate.ref.title || 'Başlıksız'}</b>
                  <span>{(Array.isArray(candidate.ref.authors) ? candidate.ref.authors : []).slice(0, 3).join('; ') || 'Yazar yok'}</span>
                  <span>{candidate.ref.year || 'Yıl yok'} · {candidate.ref.doi || 'DOI yok'}</span>
                </div>
                <div>
                  <div className="mh-compare-label">Bulunan</div>
                  <b>{candidate.fetched.title || 'Başlıksız'}</b>
                  <span>{(Array.isArray(candidate.fetched.authors) ? candidate.fetched.authors : []).slice(0, 3).join('; ') || 'Yazar yok'}</span>
                  <span>{candidate.fetched.year || 'Yıl yok'} · {candidate.fetched.doi || 'DOI yok'}</span>
                </div>
              </div>
              <div className="mb">
                <button className="mbtn p" type="button" disabled={Boolean(busyId)} onClick={() => onApplyCandidate('merge')}>{busyId ? 'İşleniyor...' : 'Birleştir'}</button>
                <button className="mbtn s" type="button" disabled={Boolean(busyId) || !candidate.fetched.doi} onClick={() => onApplyCandidate('doi-only')}>Sadece DOI Ekle</button>
                <button className="mbtn s" type="button" onClick={onDismissCandidate}>Yoksay</button>
              </div>
            </div>
          ) : null}
          <div className="mb">
            <button className="mbtn s" id="metaHealthRefreshBtn" type="button" onClick={onRefreshMetadata}>Yenile</button>
            <button className="mbtn s" id="metaHealthCloseBtn" type="button" onClick={() => hideLegacyModal('metaHealthModal')}>Kapat</button>
          </div>
        </div>
      </div>
    </>
  );
}
