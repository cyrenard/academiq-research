import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReferenceEditModal } from './ReferenceEditModal';
import type { AcademiqReference } from '../../../lib/app-state';

function makeRef(overrides: Partial<AcademiqReference> = {}): AcademiqReference {
  return {
    id: 'r1',
    title: 'A Title',
    authors: ['Smith, J.', 'Doe, K.'],
    year: '2020',
    doi: '10.1234/abc',
    url: 'https://x.com',
    journal: 'Nature',
    abstract: 'Body text',
    pdfUrl: '',
    isbn: '',
    labels: [],
    referenceType: 'article',
    ...overrides
  };
}

describe('ReferenceEditModal', () => {
  it('renders nothing visible when open=false', () => {
    const { container } = render(
      <ReferenceEditModal
        open={false}
        reference={makeRef()}
        onClose={() => {}}
        onUpdate={() => {}}
        onDelete={() => {}}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "Kaynak seçilmedi" when reference is null', () => {
    render(
      <ReferenceEditModal
        open
        reference={null}
        onClose={() => {}}
        onUpdate={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByText('Kaynak seçilmedi.')).toBeInTheDocument();
  });

  it('pre-populates form fields from reference prop', () => {
    render(
      <ReferenceEditModal
        open
        reference={makeRef()}
        onClose={() => {}}
        onUpdate={() => {}}
        onDelete={() => {}}
      />
    );
    expect((screen.getByLabelText('Başlık') as HTMLInputElement).value).toBe('A Title');
    // Authors joined by '; '
    expect((screen.getByLabelText('Yazarlar (; ile ayır)') as HTMLInputElement).value).toBe('Smith, J.; Doe, K.');
    expect((screen.getByLabelText('Yıl') as HTMLInputElement).value).toBe('2020');
    expect((screen.getByLabelText('DOI') as HTMLInputElement).value).toBe('10.1234/abc');
    expect((screen.getByLabelText('Abstract') as HTMLTextAreaElement).value).toBe('Body text');
  });

  it('save button calls onUpdate with edited fields then onClose', async () => {
    const onUpdate = vi.fn();
    const onClose = vi.fn();
    render(
      <ReferenceEditModal
        open
        reference={makeRef()}
        onClose={onClose}
        onUpdate={onUpdate}
        onDelete={() => {}}
      />
    );
    const titleInput = screen.getByLabelText('Başlık') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Updated Title' } });
    const yearInput = screen.getByLabelText('Yıl') as HTMLInputElement;
    fireEvent.change(yearInput, { target: { value: '2024' } });

    await userEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(onUpdate).toHaveBeenCalledWith('r1', expect.objectContaining({
      title: 'Updated Title',
      year: '2024',
      authors: ['Smith, J.', 'Doe, K.'] // unchanged, split by ;
    }));
    expect(onClose).toHaveBeenCalled();
  });

  it('save splits authors by semicolon and trims', async () => {
    const onUpdate = vi.fn();
    render(
      <ReferenceEditModal
        open
        reference={makeRef({ authors: [] })}
        onClose={() => {}}
        onUpdate={onUpdate}
        onDelete={() => {}}
      />
    );
    const authorsInput = screen.getByLabelText('Yazarlar (; ile ayır)') as HTMLInputElement;
    fireEvent.change(authorsInput, { target: { value: ' Smith ; Doe ; ;Jones ' } });
    await userEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(onUpdate).toHaveBeenCalledWith('r1', expect.objectContaining({
      authors: ['Smith', 'Doe', 'Jones']
    }));
  });

  it('save no-ops when reference is null', async () => {
    const onUpdate = vi.fn();
    const onClose = vi.fn();
    render(
      <ReferenceEditModal
        open
        reference={null}
        onClose={onClose}
        onUpdate={onUpdate}
        onDelete={() => {}}
      />
    );
    // No save button when reference null
    expect(screen.queryByRole('button', { name: 'Kaydet' })).not.toBeInTheDocument();
  });

  it('delete button calls onDelete with reference id', async () => {
    const onDelete = vi.fn();
    render(
      <ReferenceEditModal
        open
        reference={makeRef({ id: 'ref-x' })}
        onClose={() => {}}
        onUpdate={() => {}}
        onDelete={onDelete}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sil' }));
    expect(onDelete).toHaveBeenCalledWith('ref-x');
  });

  it('reloads draft when reference prop changes', async () => {
    const { rerender } = render(
      <ReferenceEditModal
        open
        reference={makeRef({ id: 'r1', title: 'First' })}
        onClose={() => {}}
        onUpdate={() => {}}
        onDelete={() => {}}
      />
    );
    expect((screen.getByLabelText('Başlık') as HTMLInputElement).value).toBe('First');

    rerender(
      <ReferenceEditModal
        open
        reference={makeRef({ id: 'r2', title: 'Second' })}
        onClose={() => {}}
        onUpdate={() => {}}
        onDelete={() => {}}
      />
    );
    expect((screen.getByLabelText('Başlık') as HTMLInputElement).value).toBe('Second');
  });
});
