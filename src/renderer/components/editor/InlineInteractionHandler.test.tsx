import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InlineInteractionHandler } from './InlineInteractionHandler';

describe('InlineInteractionHandler', () => {
  it('opens citation actions on left click and dispatches reference edit', async () => {
    const listener = vi.fn();
    window.addEventListener('aq:react-edit-reference', listener);
    document.body.innerHTML = '<span class="aq-citation" data-ref-id="r1">(Yilmaz, 2025)</span>';
    render(<InlineInteractionHandler />);

    fireEvent.click(document.querySelector('.aq-citation') as HTMLElement, { clientX: 24, clientY: 32 });
    expect(screen.getByRole('menu', { name: 'Atıf' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Kaynağı düzenle' }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({ refId: 'r1' });
    window.removeEventListener('aq:react-edit-reference', listener);
  });

  it('routes links through electronAPI.openExternalUrl', () => {
    const openExternalUrl = vi.fn();
    (window as any).electronAPI = { openExternalUrl };
    document.body.innerHTML = '<span class="aq-link" data-href="https://example.org/paper">link</span>';
    render(<InlineInteractionHandler />);

    fireEvent.click(document.querySelector('.aq-link') as HTMLElement, { clientX: 24, clientY: 32 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tarayıcıda aç' }));

    expect(openExternalUrl).toHaveBeenCalledWith('https://example.org/paper');
  });

  it('exposes footnote, cross-reference, image and table click routes', () => {
    const source = InlineInteractionHandler.toString();
    expect(source).toContain('.aq-fn-ref, [data-fnid]');
    expect(source).toContain('.aq-cross-ref, [data-ref-id]');
    expect(source).toContain('.aq-engine-image, img');
    expect(source).toContain('.aq-engine-table-cell, td, th');
  });
});
