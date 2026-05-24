import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CrossRefModal } from './CrossRefModal';

describe('CrossRefModal', () => {
  let mockCollect: any;
  let mockInsert: any;
  let mockEditor: any;

  beforeEach(() => {
    mockCollect = vi.fn(() => [
      { id: 'h-1', type: 'heading', label: 'Bölüm 1', title: 'Giriş' },
      { id: 't-1', type: 'table', label: 'Tablo 1', title: 'Veriler' },
      { id: 'f-1', type: 'figure', label: 'Şekil 1', title: 'Grafik' },
    ]);
    mockInsert = vi.fn();
    mockEditor = { id: 'test-editor' };

    (window as any).AQFootnotes = {
      collectCrossRefTargets: mockCollect,
      insertCrossRef: mockInsert,
    };
    (window as any).editor = mockEditor;
  });

  afterEach(() => {
    delete (window as any).AQFootnotes;
    delete (window as any).editor;
    vi.restoreAllMocks();
  });

  it('renders nothing when open=false', () => {
    const { container } = render(
      <CrossRefModal open={false} onClose={() => {}} onStatus={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('collects and renders targets on open', () => {
    render(<CrossRefModal open onClose={() => {}} onStatus={() => {}} />);
    expect(mockCollect).toHaveBeenCalled();
    expect(screen.getByText('Bölüm 1')).toBeInTheDocument();
    expect(screen.getByText('Tablo 1')).toBeInTheDocument();
    expect(screen.getByText('Şekil 1')).toBeInTheDocument();
  });

  it('filters targets by search query', async () => {
    render(<CrossRefModal open onClose={() => {}} onStatus={() => {}} />);
    const searchInput = screen.getByPlaceholderText('Hedef ara...');
    await userEvent.type(searchInput, 'bölüm');
    expect(screen.getByText('Bölüm 1')).toBeInTheDocument();
    expect(screen.queryByText('Tablo 1')).not.toBeInTheDocument();
  });

  it('filters targets by category filter chip', async () => {
    render(<CrossRefModal open onClose={() => {}} onStatus={() => {}} />);
    const tableChip = screen.getByRole('button', { name: 'Tablo' });
    await userEvent.click(tableChip);
    expect(screen.getByText('Tablo 1')).toBeInTheDocument();
    expect(screen.queryByText('Bölüm 1')).not.toBeInTheDocument();
  });

  it('inserts cross reference on item click and calls onClose & onStatus', async () => {
    const onClose = vi.fn();
    const onStatus = vi.fn();
    render(<CrossRefModal open onClose={onClose} onStatus={onStatus} />);

    const item = screen.getByText('Bölüm 1');
    await userEvent.click(item);

    expect(mockInsert).toHaveBeenCalledWith(mockEditor, { id: 'h-1', type: 'heading', label: 'Bölüm 1', title: 'Giriş' }, 'context');
    expect(onStatus).toHaveBeenCalledWith('Referans eklendi: Bölüm 1');
    expect(onClose).toHaveBeenCalled();
  });

  it('respects selected display modes', async () => {
    render(<CrossRefModal open onClose={() => {}} onStatus={() => {}} />);
    const numberMode = screen.getByRole('button', { name: '1' });
    await userEvent.click(numberMode);

    const item = screen.getByText('Tablo 1');
    await userEvent.click(item);

    expect(mockInsert).toHaveBeenCalledWith(mockEditor, { id: 't-1', type: 'table', label: 'Tablo 1', title: 'Veriler' }, 'number');
  });
});
