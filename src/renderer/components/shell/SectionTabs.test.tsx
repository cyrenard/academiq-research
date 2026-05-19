import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SectionTabs } from './SectionTabs';

const makeEditor = () => ({
  commands: {
    focus: vi.fn(),
    insertContent: vi.fn()
  },
  _captureSelection: vi.fn(() => ({ type: 'aq', from: 8, to: 8, anchor: 8, focus: 8 })),
  _restoreSelection: vi.fn(),
  _docModel: {
    get: vi.fn(() => ({
      blocks: [
        { type: 'paragraph', runs: [{ text: 'Intro' }] },
        { type: 'heading', level: 1, runs: [{ text: 'Birinci Bolum' }] }
      ]
    }))
  }
});

describe('SectionTabs', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="apaed"></div>';
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as any).AQDocumentOutline;
    delete (window as any).editor;
    delete (window as any).runEditorMutationEffects;
  });

  it('renders only H1 headings as tabs', () => {
    (window as any).editor = makeEditor();
    (window as any).AQDocumentOutline = {
      collectEntries: vi.fn(() => [
        { id: 'h1-a', type: 'heading', level: 1, label: 'Bölüm 1' },
        { id: 'h2-a', type: 'heading', level: 2, label: 'Alt Başlık' },
        { id: 'table-a', type: 'table', label: 'Tablo 1' }
      ]),
      findActiveEntry: vi.fn(() => ({ id: 'h1-a' }))
    };

    render(<SectionTabs />);

    expect(screen.getByText('Bölüm 1')).toBeInTheDocument();
    expect(screen.queryByText('Alt Başlık')).not.toBeInTheDocument();
    expect(screen.queryByText('Tablo 1')).not.toBeInTheDocument();
  });

  it('limits visible tab names to the first 10 characters of the H1', () => {
    (window as any).editor = makeEditor();
    (window as any).AQDocumentOutline = {
      collectEntries: vi.fn(() => [
        { id: 'h1-long', type: 'heading', level: 1, label: 'ÜNİVERSİTE ÖĞRENCİLERİNİN İNCELENMESİ' },
        { id: 'h1-short', type: 'heading', level: 1, label: 'YÖNTEM' }
      ]),
      findActiveEntry: vi.fn(() => null)
    };

    render(<SectionTabs />);

    expect(screen.getByText('ÜNİVERSİTE')).toBeInTheDocument();
    expect(screen.getByText('YÖNTEM')).toBeInTheDocument();
    expect(screen.queryByText('ÜNİVERSİTE ÖĞRENCİLERİNİN İNCELENMESİ')).not.toBeInTheDocument();
  });

  it('jumps to the selected H1 tab', () => {
    const editor = makeEditor();
    const scrollToEntry = vi.fn();
    editor._stageEl = document.getElementById('apaed');
    const line = document.createElement('div');
    line.className = 'aq-engine-line';
    line.dataset.blockIndex = '1';
    line.scrollIntoView = vi.fn();
    document.getElementById('apaed')?.appendChild(line);
    (window as any).editor = editor;
    (window as any).AQDocumentOutline = {
      collectEntries: vi.fn(() => [
        { id: 'h1-a', type: 'heading', level: 1, label: 'Bölüm 1', blockIndex: 1 }
      ]),
      findActiveEntry: vi.fn(() => null),
      scrollToEntry
    };

    render(<SectionTabs />);
    fireEvent.click(screen.getByText('Bölüm 1'));

    expect(line.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }));
    expect(scrollToEntry).not.toHaveBeenCalled();
    expect(editor._restoreSelection).toHaveBeenCalledWith(expect.objectContaining({ from: 6, to: 6 }));
    expect(editor.commands.focus).toHaveBeenCalled();
  });

  it('adds a new H1 section from the plus button and selects its title', () => {
    vi.useFakeTimers();
    const editor = makeEditor();
    const scrollToEntry = vi.fn();
    (window as any).editor = editor;
    (window as any).runEditorMutationEffects = vi.fn();
    (window as any).AQDocumentOutline = {
      collectEntries: vi.fn(() => [
        { id: 'new-h1', type: 'heading', level: 1, label: 'Yeni Bölüm', blockIndex: 1 }
      ]),
      findActiveEntry: vi.fn(() => null),
      scrollToEntry
    };

    render(<SectionTabs />);
    fireEvent.click(screen.getByRole('button', { name: 'Yeni H1 bölüm ekle' }));

    expect(editor.commands.insertContent).toHaveBeenCalledWith('<h1>Yeni Bölüm</h1><p><br></p>');
    expect((window as any).runEditorMutationEffects).toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(scrollToEntry).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-h1' }));
    expect(editor._restoreSelection).toHaveBeenCalledWith(expect.objectContaining({ from: 6, to: 16 }));
  });
});
