import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpellSuggestionPopup } from './SpellSuggestionPopup';
import { suggestWord } from '../../lib/spellcheck';

vi.mock('../../lib/spellcheck', () => ({
  suggestWord: vi.fn().mockResolvedValue(['yanlış'])
}));

describe('SpellSuggestionPopup', () => {
  it('opens on left click over spell underline and applies a suggestion', async () => {
    (window as any).electronAPI = { spell: { suggest: vi.fn().mockResolvedValue(['yanış']) } };
    const ref = { current: null };
    render(<SpellSuggestionPopup editorRef={ref as any} />);
    const span = document.createElement('span');
    span.className = 'aq-spell-error';
    span.textContent = 'yannlış';
    document.body.appendChild(span);

    fireEvent.click(span, { clientX: 24, clientY: 32 });
    expect(await screen.findByRole('menu', { name: 'Yazım önerileri' })).toBeInTheDocument();
    await waitFor(() => expect(suggestWord).toHaveBeenCalledWith('yannlış', { maxSuggestions: 8 }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'yanlış' }));

    expect(span.textContent).toBe('yanlış');
    expect(span.classList.contains('aq-spell-error')).toBe(false);
  });

  it('opens when the click target is inside a marked spell span', async () => {
    (window as any).electronAPI = { spell: { suggest: vi.fn().mockResolvedValue(['yanış']) } };
    render(<SpellSuggestionPopup editorRef={{ current: null } as any} />);
    const span = document.createElement('span');
    span.className = 'aq-spell-error';
    const child = document.createElement('em');
    child.textContent = 'yannlış';
    span.appendChild(child);
    document.body.appendChild(span);

    fireEvent.pointerUp(child, { clientX: 12, clientY: 18 });

    expect(await screen.findByRole('menu', { name: 'Yazım önerileri' })).toBeInTheDocument();
    await waitFor(() => expect(suggestWord).toHaveBeenCalledWith('yannlış', { maxSuggestions: 8 }));
  });

  it('updates editor HTML when an editor adapter is available', async () => {
    (window as any).electronAPI = { spell: { suggest: vi.fn().mockResolvedValue(['yanış']) } };
    const editor = {
      getHTML: vi.fn(() => '<p>Bu yannlış kelime.</p>'),
      setHTML: vi.fn()
    };
    render(<SpellSuggestionPopup editorRef={{ current: editor } as any} />);
    const span = document.createElement('span');
    span.className = 'aq-spell-error';
    span.textContent = 'yannlış';
    document.body.appendChild(span);

    fireEvent.click(span, { clientX: 10, clientY: 10 });
    await userEvent.click(await screen.findByRole('menuitem', { name: 'yanlış' }));

    expect(editor.setHTML).toHaveBeenCalledWith('<p>Bu yanlış kelime.</p>');
  });
});
