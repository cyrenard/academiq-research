import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReferenceImportModal } from './ReferenceImportModal';
import { fetchDoiReference, fetchLegacyReference } from '../../../lib/reference-import';
import { parseExternalReferenceText } from '../../../lib/external-reference-import';

vi.mock('../../../lib/reference-import', () => ({
  fetchDoiReference: vi.fn(),
  fetchLegacyReference: vi.fn(),
}));

vi.mock('../../../lib/external-reference-import', () => ({
  parseExternalReferenceText: vi.fn(),
  runExternalReferenceFileImport: vi.fn(),
}));

describe('ReferenceImportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).electronAPI;
  });

  it('renders nothing when open=false', () => {
    const { container } = render(
      <ReferenceImportModal open={false} onClose={() => {}} onStatus={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('switches tabs correctly', async () => {
    render(<ReferenceImportModal open onClose={() => {}} onStatus={() => {}} />);
    expect(screen.getByText('Hızlı Getir (DOI/ISBN/PMID)')).toHaveClass('border-aq-navy');
    
    const bulkTab = screen.getByRole('button', { name: 'Dosya / Metin Yükle' });
    await userEvent.click(bulkTab);
    expect(screen.getByPlaceholderText(/BibTeX kodu, RIS verisi veya APA/)).toBeInTheDocument();
  });

  it('successfully queries DOI metadata, previews, and imports', async () => {
    const onStatus = vi.fn();
    const mockRef = {
      id: 'ref-mock',
      title: 'Mock Article Title',
      authors: ['John Doe'],
      year: '2026',
      journal: 'Mock Journal',
      doi: '10.1000/xyz123',
      referenceType: 'article'
    } as any;
    vi.mocked(fetchDoiReference).mockResolvedValue(mockRef);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(<ReferenceImportModal open onClose={() => {}} onStatus={onStatus} />);
    const input = screen.getByPlaceholderText(/DOI girin/);
    await userEvent.type(input, '10.1000/xyz123');
    await userEvent.click(screen.getByRole('button', { name: 'Sorgula' }));

    await waitFor(() => {
      expect(fetchDoiReference).toHaveBeenCalledWith('10.1000/xyz123');
      expect(screen.getByText('Mock Article Title')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Kütüphaneye Ekle' }));

    expect(dispatchSpy).toHaveBeenCalled();
    const event = dispatchSpy.mock.calls.find(call => call[0].type === 'aq:import-references')?.[0] as CustomEvent;
    expect(event).toBeDefined();
    expect(event.detail.entries[0].title).toBe('Mock Article Title');
    expect(onStatus).toHaveBeenCalledWith('Kaynak eklendi: Mock Article Title');
  });

  it('queries PubMed IDs (PMID) using mocked API', async () => {
    const onStatus = vi.fn();
    const mockPmidData = {
      ok: true,
      data: {
        result: {
          '123456': {
            title: 'PubMed Title',
            authors: [{ name: 'Jane Doe' }],
            pubdate: '2025 Jan 1',
            source: 'NCBI Journal',
            articleids: [{ idtype: 'doi', value: '10.1000/pmiddoi' }],
          }
        }
      }
    };
    
    (window as any).electronAPI = {
      netFetchJSON: vi.fn().mockResolvedValue(mockPmidData)
    };

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(<ReferenceImportModal open onClose={() => {}} onStatus={onStatus} />);
    
    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'pmid');

    const input = screen.getByPlaceholderText(/PMID girin/);
    await userEvent.type(input, '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Sorgula' }));

    await waitFor(() => {
      expect(screen.getByText('PubMed Title')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Kütüphaneye Ekle' }));
    expect(dispatchSpy).toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('Kaynak eklendi: PubMed Title');
  });

  it('imports bulk text references', async () => {
    const onStatus = vi.fn();
    const mockEntries = [
      { title: 'Bulk Reference Title 1', authors: ['Author 1'], year: '2026' }
    ];
    vi.mocked(parseExternalReferenceText).mockReturnValue(mockEntries);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(<ReferenceImportModal open onClose={() => {}} onStatus={onStatus} />);
    const bulkTab = screen.getByRole('button', { name: 'Dosya / Metin Yükle' });
    await userEvent.click(bulkTab);

    const textarea = screen.getByPlaceholderText(/BibTeX kodu, RIS verisi veya APA/);
    await userEvent.type(textarea, 'Some raw data');

    await userEvent.click(screen.getByRole('button', { name: 'Metinden Aktar' }));

    expect(parseExternalReferenceText).toHaveBeenCalledWith('Some raw data', 'auto');
    expect(dispatchSpy).toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('1 kaynak aktarıldı');
  });

  it('imports bibliography files through the native Tauri dialog', async () => {
    const onStatus = vi.fn();
    const mockEntries = [
      { title: 'BibTeX Reference', authors: ['Author 1'], year: '2026' }
    ];
    vi.mocked(parseExternalReferenceText).mockReturnValue(mockEntries);
    (window as any).electronAPI = {
      openBibliographyDialog: vi.fn(async () => ({
        ok: true,
        files: [{ name: 'refs.bib', text: '@article{demo,title={BibTeX Reference}}' }]
      }))
    };

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(<ReferenceImportModal open onClose={() => {}} onStatus={onStatus} />);
    await userEvent.click(screen.getByRole('button', { name: /Dosya \/ Metin/ }));
    await userEvent.click(screen.getByRole('button', { name: /\.bib/ }));

    await waitFor(() => {
      expect((window as any).electronAPI.openBibliographyDialog).toHaveBeenCalled();
    });
    expect(parseExternalReferenceText).toHaveBeenCalledWith('@article{demo,title={BibTeX Reference}}', 'bibtex');
    expect(dispatchSpy).toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalled();
  });
});
