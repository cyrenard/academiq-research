import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistoryModal } from './HistoryModal';

let originalElectronAPI: any;

beforeEach(() => {
  originalElectronAPI = (window as any).electronAPI;
  (window as any).electronAPI = {
    getDocumentHistory: vi.fn(async () => ({ snapshots: [] })),
    restoreDocumentHistorySnapshot: vi.fn(async () => ({ ok: true }))
  };
});

afterEach(() => {
  (window as any).electronAPI = originalElectronAPI;
});

describe('HistoryModal', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <HistoryModal
        open={false}
        docId="d1"
        onClose={() => {}}
        onStatus={() => {}}
        onRestoreState={() => {}}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('fetches getDocumentHistory on open with docId + default limit 30', async () => {
    render(
      <HistoryModal
        open
        docId="doc-x"
        onClose={() => {}}
        onStatus={() => {}}
        onRestoreState={() => {}}
      />
    );
    await waitFor(() => {
      expect((window as any).electronAPI.getDocumentHistory).toHaveBeenCalledWith('doc-x', 30);
    });
  });

  it('respects custom limit prop', async () => {
    render(
      <HistoryModal
        open
        docId="doc-x"
        limit={5}
        onClose={() => {}}
        onStatus={() => {}}
        onRestoreState={() => {}}
      />
    );
    await waitFor(() => {
      expect((window as any).electronAPI.getDocumentHistory).toHaveBeenCalledWith('doc-x', 5);
    });
  });

  it('handles array result format (no snapshots wrapper)', async () => {
    (window as any).electronAPI.getDocumentHistory = vi.fn(async () => [
      { id: 's1', createdAt: '2024-01-01' },
      { id: 's2', createdAt: '2024-01-02' }
    ]);
    render(
      <HistoryModal
        open
        docId="d"
        onClose={() => {}}
        onStatus={() => {}}
        onRestoreState={() => {}}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('2024-01-01')).toBeInTheDocument();
      expect(screen.getByText('2024-01-02')).toBeInTheDocument();
    });
  });

  it('renders snapshot count and shows empty state when none', async () => {
    render(
      <HistoryModal
        open
        docId="d"
        onClose={() => {}}
        onStatus={() => {}}
        onRestoreState={() => {}}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Snapshot bulunamadı.')).toBeInTheDocument();
    });
  });

  it('reports IPC failure via onStatus on initial fetch', async () => {
    (window as any).electronAPI.getDocumentHistory = vi.fn(async () => { throw new Error('boom'); });
    const onStatus = vi.fn();
    render(
      <HistoryModal
        open
        docId="d"
        onClose={() => {}}
        onStatus={onStatus}
        onRestoreState={() => {}}
      />
    );
    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith('Belge geçmişi alınamadı');
    });
  });

  it('clicking "Geri Yükle" calls restore + onStatus + onRestoreState + onClose', async () => {
    (window as any).electronAPI.getDocumentHistory = vi.fn(async () => ({
      snapshots: [{ id: 'snap-1', createdAt: '2024-01-01', size: '12KB' }]
    }));
    const onStatus = vi.fn();
    const onRestore = vi.fn();
    const onClose = vi.fn();
    render(
      <HistoryModal
        open
        docId="doc-x"
        onClose={onClose}
        onStatus={onStatus}
        onRestoreState={onRestore}
      />
    );
    await waitFor(() => screen.getByRole('button', { name: 'Geri Yükle' }));
    await userEvent.click(screen.getByRole('button', { name: 'Geri Yükle' }));
    await waitFor(() => {
      expect((window as any).electronAPI.restoreDocumentHistorySnapshot).toHaveBeenCalledWith('doc-x', 'snap-1');
      expect(onStatus).toHaveBeenCalledWith('Snapshot geri yüklendi');
      expect(onRestore).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('reports failure via onStatus when restore IPC rejects', async () => {
    (window as any).electronAPI.getDocumentHistory = vi.fn(async () => ({
      snapshots: [{ id: 'snap-1', createdAt: '2024-01-01' }]
    }));
    (window as any).electronAPI.restoreDocumentHistorySnapshot = vi.fn(async () => { throw new Error('fail'); });
    const onStatus = vi.fn();
    render(
      <HistoryModal
        open
        docId="d"
        onClose={() => {}}
        onStatus={onStatus}
        onRestoreState={() => {}}
      />
    );
    await waitFor(() => screen.getByRole('button', { name: 'Geri Yükle' }));
    await userEvent.click(screen.getByRole('button', { name: 'Geri Yükle' }));
    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith('Snapshot geri yüklenemedi');
    });
  });

  it('falls back to snapshotId when item.id missing', async () => {
    (window as any).electronAPI.getDocumentHistory = vi.fn(async () => [
      { snapshotId: 'alt-id', createdAt: 'x' }
    ]);
    render(
      <HistoryModal
        open
        docId="d"
        onClose={() => {}}
        onStatus={() => {}}
        onRestoreState={() => {}}
      />
    );
    await waitFor(() => screen.getByRole('button', { name: 'Geri Yükle' }));
    await userEvent.click(screen.getByRole('button', { name: 'Geri Yükle' }));
    await waitFor(() => {
      expect((window as any).electronAPI.restoreDocumentHistorySnapshot).toHaveBeenCalledWith('d', 'alt-id');
    });
  });

  it('skips restore when neither id nor snapshotId is present', async () => {
    (window as any).electronAPI.getDocumentHistory = vi.fn(async () => [{ createdAt: '2024' }]);
    render(
      <HistoryModal
        open
        docId="d"
        onClose={() => {}}
        onStatus={() => {}}
        onRestoreState={() => {}}
      />
    );
    await waitFor(() => screen.getByRole('button', { name: 'Geri Yükle' }));
    await userEvent.click(screen.getByRole('button', { name: 'Geri Yükle' }));
    expect((window as any).electronAPI.restoreDocumentHistorySnapshot).not.toHaveBeenCalled();
  });
});
