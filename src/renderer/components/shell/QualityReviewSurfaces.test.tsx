import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QualityReviewSurfaces } from './QualityReviewSurfaces';

const summary = { total: 2, complete: 1, incomplete: 1, suspicious: 0, issueText: 'missing_doi 1' };

describe('QualityReviewSurfaces', () => {
  it('renders metadata health rows and routes review actions', () => {
    const onFilterChange = vi.fn();
    const onMetadataAction = vi.fn();
    render(
      <QualityReviewSurfaces
        rows={[{ ref: { id: 'r1', title: 'Paper', authors: ['Doe'], year: '2024' }, report: { status: 'incomplete', issues: [{ message: 'DOI eksik' }] } }]}
        summary={summary}
        filter="all"
        candidate={null}
        busyId=""
        onFilterChange={onFilterChange}
        onMetadataAction={onMetadataAction}
        onApplyCandidate={() => {}}
        onDismissCandidate={() => {}}
        onRefreshMetadata={() => {}}
      />
    );
    expect(screen.getByText('Toplam 2 · Tam 1 · Eksik 1 · Şüpheli 0 · missing_doi 1')).toBeInTheDocument();
    expect(screen.getByText('DOI eksik')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /incomplete/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Normalize Et' }));
    expect(onFilterChange).toHaveBeenCalledWith('incomplete');
    expect(onMetadataAction).toHaveBeenCalledWith('normalize', expect.objectContaining({ id: 'r1' }));
  });

  it('keeps candidate merge decisions explicit', () => {
    const onApplyCandidate = vi.fn();
    const onDismissCandidate = vi.fn();
    render(
      <QualityReviewSurfaces
        rows={[]}
        summary={{ total: 0, complete: 0, incomplete: 0, suspicious: 0, issueText: '' }}
        filter="all"
        candidate={{
          ref: { title: 'Current' },
          fetched: { title: 'Found', doi: '10.1/test' },
          score: 0.92,
          source: 'Crossref',
          evidence: ['başlık']
        }}
        busyId=""
        onFilterChange={() => {}}
        onMetadataAction={() => {}}
        onApplyCandidate={onApplyCandidate}
        onDismissCandidate={onDismissCandidate}
        onRefreshMetadata={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Birleştir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sadece DOI Ekle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yoksay' }));
    expect(onApplyCandidate.mock.calls).toEqual([['merge'], ['doi-only']]);
    expect(onDismissCandidate).toHaveBeenCalledOnce();
  });
});
