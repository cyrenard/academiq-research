import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CitationAuditPanel } from './CitationAuditPanel';
import type { AcademiqReference } from '../../lib/app-state';

describe('CitationAuditPanel', () => {
  let mockEditor: any;
  let defaultReferences: AcademiqReference[];
  let onDeleteReferenceMock: any;

  beforeEach(() => {
    // Clear DOM before each test
    document.body.innerHTML = '';

    // Mock window methods and objects
    onDeleteReferenceMock = vi.fn();
    
    const chainMock = {
      focus: vi.fn().mockReturnThis(),
      deleteRange: vi.fn().mockReturnThis(),
      insertContentAt: vi.fn().mockReturnThis(),
      run: vi.fn().mockReturnThis(),
    };

    mockEditor = {
      view: {
        posAtDOM: vi.fn().mockReturnValue(10),
      },
      commands: {
        setTextSelection: vi.fn(),
      },
      chain: vi.fn().mockReturnValue(chainMock),
    };

    (window as any).getActiveEditorInstance = vi.fn().mockReturnValue(mockEditor);
    
    (window as any).AQCitationStyles = {
      visibleCitationText: vi.fn((refs, options) => {
        if (refs.length === 0) return '';
        const author = refs[0].authors?.[0] || 'Unknown';
        const year = refs[0].year || 'n.d.';
        return `(${author}, ${year})`;
      }),
    };

    defaultReferences = [
      {
        id: 'ref-1',
        title: 'Title One',
        authors: ['Author A'],
        year: '2021',
        type: 'journal',
      } as any,
      {
        id: 'ref-2',
        title: 'Title Two',
        authors: ['Author B'],
        year: '2022',
        type: 'book',
      } as any,
    ];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).getActiveEditorInstance;
    delete (window as any).AQCitationStyles;
  });

  it('renders "Sorun bulunmadı" when no issues exist', async () => {
    // Render editor area in DOM with correct citations
    const editorArea = document.createElement('div');
    editorArea.id = 'apaed';
    editorArea.innerHTML = '<span class="cit" data-ref="ref-1" data-mode="inline">(Author A, 2021)</span>';
    document.body.appendChild(editorArea);

    render(
      <CitationAuditPanel
        open={true}
        onClose={vi.fn()}
        references={[defaultReferences[0]]} // Only ref-1 is in the document and library
        onDeleteReference={onDeleteReferenceMock}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Tebrikler, Atıf Hatası Yok!')).toBeInTheDocument();
    });
  });

  it('detects missing citations when reference is not in library', async () => {
    const editorArea = document.createElement('div');
    editorArea.id = 'apaed';
    editorArea.innerHTML = '<span class="cit" data-ref="ref-missing" data-mode="inline">(Missing, 2020)</span>';
    document.body.appendChild(editorArea);

    render(
      <CitationAuditPanel
        open={true}
        onClose={vi.fn()}
        references={defaultReferences}
        onDeleteReference={onDeleteReferenceMock}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Kayıp Atıflar/i)).toBeInTheDocument();
      expect(screen.getAllByText('(Missing, 2020)').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('detects mismatched citation text and allows fixing it', async () => {
    const editorArea = document.createElement('div');
    editorArea.id = 'apaed';
    const citSpan = document.createElement('span');
    citSpan.className = 'cit';
    citSpan.setAttribute('data-ref', 'ref-1');
    citSpan.setAttribute('data-mode', 'inline');
    citSpan.textContent = '(Wrong Text)';
    editorArea.appendChild(citSpan);
    document.body.appendChild(editorArea);

    render(
      <CitationAuditPanel
        open={true}
        onClose={vi.fn()}
        references={[defaultReferences[0]]}
        onDeleteReference={onDeleteReferenceMock}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Uyuşmayan Atıf Metinleri/i)).toBeInTheDocument();
      expect(screen.getAllByText('(Wrong Text)').length).toBeGreaterThanOrEqual(1);
    });

    const fixButton = screen.getByTitle('Atıf metnini sıfırla/düzelt');
    fireEvent.click(fixButton);

    expect(mockEditor.chain).toHaveBeenCalled();
  });

  it('detects unused references and allows deleting them', async () => {
    // Document is empty, so both ref-1 and ref-2 are unused
    render(
      <CitationAuditPanel
        open={true}
        onClose={vi.fn()}
        references={defaultReferences}
        onDeleteReference={onDeleteReferenceMock}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Kullanılmayan Kaynaklar/i)).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByTitle('Kaynakçadan kaldır');
    expect(deleteButtons.length).toBe(2);

    fireEvent.click(deleteButtons[0]);
    expect(onDeleteReferenceMock).toHaveBeenCalled();
  });
});
