import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LabelManagerModal } from './LabelManagerModal';

const labels = [
  { name: 'Important', color: '#ff0000' },
  { name: 'Method', color: '#00ff00' }
];

describe('LabelManagerModal', () => {
  it('creates a label with its selected color', async () => {
    const onCreate = vi.fn();
    render(<LabelManagerModal open labels={labels} references={[]} onClose={() => {}} onCreate={onCreate} onUpdate={() => {}} onDelete={() => {}} />);
    fireEvent.change(screen.getByLabelText('Yeni etiket adı'), { target: { value: 'Theory' } });
    fireEvent.change(screen.getByLabelText('Yeni etiket rengi'), { target: { value: '#123456' } });
    await userEvent.click(screen.getByRole('button', { name: 'Ekle' }));
    expect(onCreate).toHaveBeenCalledWith('Theory', '#123456');
  });

  it('renames and recolors an existing label', async () => {
    const onUpdate = vi.fn();
    render(<LabelManagerModal open labels={labels} references={[]} onClose={() => {}} onCreate={() => {}} onUpdate={onUpdate} onDelete={() => {}} />);
    fireEvent.change(screen.getByLabelText('Important adı'), { target: { value: 'Critical' } });
    fireEvent.change(screen.getByLabelText('Important rengi'), { target: { value: '#abcdef' } });
    await userEvent.click(screen.getAllByRole('button', { name: 'Kaydet' })[0]!);
    expect(onUpdate).toHaveBeenCalledWith('Important', { name: 'Critical', color: '#abcdef' });
  });

  it('blocks duplicate names case-insensitively', () => {
    render(<LabelManagerModal open labels={labels} references={[]} onClose={() => {}} onCreate={() => {}} onUpdate={() => {}} onDelete={() => {}} />);
    fireEvent.change(screen.getByLabelText('Important adı'), { target: { value: 'method' } });
    expect(screen.getByText('Bu adda başka bir etiket var.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Kaydet' })[0]).toBeDisabled();
  });

  it('requires an inline confirmation before deleting', async () => {
    const onDelete = vi.fn();
    render(<LabelManagerModal open labels={labels} references={[]} onClose={() => {}} onCreate={() => {}} onUpdate={() => {}} onDelete={onDelete} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Sil' })[0]!);
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getAllByRole('button', { name: 'Sil' })[1]!);
    expect(onDelete).toHaveBeenCalledWith('Important', { skipConfirm: true });
  });
});
