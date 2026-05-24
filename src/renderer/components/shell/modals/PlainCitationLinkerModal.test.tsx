import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlainCitationLinkerModal } from './PlainCitationLinkerModal';

describe('PlainCitationLinkerModal', () => {
  let mockScan: any;
  let mockLinkRange: any;
  let mockLinkHighConfidence: any;
  let mockEditor: any;
  let mockState: any;

  beforeEach(() => {
    mockScan = vi.fn(() => [
      {
        occurrence: { from: 10, to: 25, text: '(Doe, 2026)', mode: 'inline' },
        complete: true,
        refIds: ['ref-1'],
        ambiguous: []
      },
      {
        occurrence: { from: 50, to: 65, text: '(Smith, 2025)', mode: 'inline' },
        complete: false,
        refIds: [],
        ambiguous: [
          {
            matches: [
              { id: 'ref-2', title: 'Smith Book', authors: ['Smith J'], year: '2025' }
            ]
          }
        ]
      }
    ]);
    mockLinkRange = vi.fn(() => true);
    mockLinkHighConfidence = vi.fn(() => ({ linked: 1 }));
    mockEditor = { id: 'test-editor' };

    mockState = {
      cur: 'ws-1',
      wss: [
        {
          id: 'ws-1',
          lib: [
            { id: 'ref-1', title: 'Doe Article', authors: ['Doe J'], year: '2026' },
            { id: 'ref-2', title: 'Smith Book', authors: ['Smith J'], year: '2025' }
          ]
        }
      ]
    };

    (window as any).AQPlainCitationLinking = {
      scanAQEngine: mockScan,
      linkRange: mockLinkRange,
      linkHighConfidence: mockLinkHighConfidence,
    };
    (window as any).editor = mockEditor;
  });

  afterEach(() => {
    delete (window as any).AQPlainCitationLinking;
    delete (window as any).editor;
    vi.restoreAllMocks();
  });

  it('renders nothing when open=false', () => {
    const { container } = render(
      <PlainCitationLinkerModal open={false} state={mockState} onClose={() => {}} onStatus={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('runs scan on open and displays matches and status badges', async () => {
    render(<PlainCitationLinkerModal open state={mockState} onClose={() => {}} onStatus={() => {}} />);
    expect(mockScan).toHaveBeenCalled();

    expect(screen.getByText('(Doe, 2026)')).toBeInTheDocument();
    expect(screen.getByText('(Smith, 2025)')).toBeInTheDocument();
    expect(screen.getByText('Güvenli')).toBeInTheDocument();
    expect(screen.getByText('Belirsiz')).toBeInTheDocument();
  });

  it('allows single linking and triggers onStatus', async () => {
    const onStatus = vi.fn();
    const onClose = vi.fn();
    render(<PlainCitationLinkerModal open state={mockState} onClose={onClose} onStatus={onStatus} />);

    const linkButtons = screen.getAllByRole('button', { name: 'Bağla' });
    // First match has a pre-selected candidate ref-1
    await userEvent.click(linkButtons[0]);

    expect(mockLinkRange).toHaveBeenCalledWith(mockEditor, { from: 10, to: 25, text: '(Doe, 2026)', mode: 'inline' }, ['ref-1'], 'inline');
    expect(onStatus).toHaveBeenCalledWith('Atıf başarıyla bağlandı.');
  });

  it('allows searching references in library to select and link', async () => {
    render(<PlainCitationLinkerModal open state={mockState} onClose={() => {}} onStatus={() => {}} />);

    const searchInputs = screen.getAllByPlaceholderText(/Kütüphanede ara/);
    // Search for 'Smith' in the second item search bar
    await userEvent.type(searchInputs[1], 'Smith');

    // Wait for search result option to appear in dropdown
    const selectDropdowns = screen.getAllByRole('combobox');
    await userEvent.selectOptions(selectDropdowns[1], 'ref-2');

    const linkButtons = screen.getAllByRole('button', { name: 'Bağla' });
    await userEvent.click(linkButtons[1]);

    expect(mockLinkRange).toHaveBeenCalledWith(mockEditor, { from: 50, to: 65, text: '(Smith, 2025)', mode: 'inline' }, ['ref-2'], 'inline');
  });

  it('triggers bulk auto-linking', async () => {
    const onStatus = vi.fn();
    render(<PlainCitationLinkerModal open state={mockState} onClose={() => {}} onStatus={onStatus} />);

    const bulkButton = screen.getByRole('button', { name: 'Güvenli Eşleşmeleri Otomatik Bağla' });
    await userEvent.click(bulkButton);

    expect(mockLinkHighConfidence).toHaveBeenCalledWith(mockEditor, mockState.wss[0].lib, { root: window });
    expect(onStatus).toHaveBeenCalledWith('1 güvenli atıf otomatik bağlandı.');
  });

  it('handles singleMatch mode without scanning', async () => {
    const singleMatch = {
      occurrence: { from: 100, to: 115, text: '(Single, 2024)', mode: 'textual' },
      complete: false,
      refIds: [],
      ambiguous: []
    };

    render(<PlainCitationLinkerModal open state={mockState} singleMatch={singleMatch} onClose={() => {}} onStatus={() => {}} />);
    
    expect(mockScan).not.toHaveBeenCalled();
    expect(screen.getByText('(Single, 2024)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Güvenli Eşleşmeleri Otomatik Bağla' })).not.toBeInTheDocument();
  });
});
