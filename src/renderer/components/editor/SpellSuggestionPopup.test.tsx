import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpellSuggestionPopup } from './SpellSuggestionPopup';

describe('SpellSuggestionPopup', () => {
  it('opens on left click over spell underline and applies a suggestion', async () => {
    (window as any).electronAPI = {
      spell: {
        suggest: vi.fn().mockResolvedValue(['yanlış'])
      }
    };
    const ref = { current: null };
    render(<SpellSuggestionPopup editorRef={ref as any} />);
    const span = document.createElement('span');
    span.className = 'aq-spell-error';
    span.textContent = 'yannlış';
    document.body.appendChild(span);

    fireEvent.click(span, { clientX: 24, clientY: 32 });
    expect(await screen.findByRole('menu', { name: 'Yazım önerileri' })).toBeInTheDocument();
    await waitFor(() => expect((window as any).electronAPI.spell.suggest).toHaveBeenCalledWith('yannlış', 'tr'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'yanlış' }));

    expect(span.textContent).toBe('yanlış');
    expect(span.classList.contains('aq-spell-error')).toBe(false);
  });

  it('updates editor HTML when an editor adapter is available', async () => {
    (window as any).electronAPI = {
      spell: {
        suggest: vi.fn().mockResolvedValue(['yanlış'])
      }
    };
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
