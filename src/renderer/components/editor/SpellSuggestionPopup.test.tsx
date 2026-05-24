import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpellSuggestionPopup } from './SpellSuggestionPopup';
import { suggestWord } from '../../lib/spellcheck';

const mockSpellState = vi.hoisted(() => ({
  matches: [] as any[],
  workspaceId: ''
}));

vi.mock('../../lib/spellcheck', () => ({
  suggestWord: vi.fn().mockResolvedValue(['yanl\u0131\u015f'])
}));

vi.mock('../../lib/spellcheck-controller', () => ({
  getSpellcheckState: vi.fn(() => ({
    matches: mockSpellState.matches,
    workspaceId: mockSpellState.workspaceId
  }))
}));

describe('SpellSuggestionPopup', () => {
  beforeEach(() => {
    mockSpellState.matches = [];
    mockSpellState.workspaceId = '';
    vi.clearAllMocks();
  });

  it('opens on left click over spell underline and applies a suggestion', async () => {
    (window as any).electronAPI = { spell: { suggest: vi.fn().mockResolvedValue(['yan\u0131\u015f']) } };
    const ref = { current: null };
    render(<SpellSuggestionPopup editorRef={ref as any} />);
    const span = document.createElement('span');
    span.className = 'aq-spell-error';
    span.textContent = 'yannl\u0131\u015f';
    document.body.appendChild(span);

    fireEvent.click(span, { clientX: 24, clientY: 32 });
    expect(await screen.findByRole('menu', { name: 'Yaz\u0131m \u00f6nerileri' })).toBeInTheDocument();
    await waitFor(() => expect(suggestWord).toHaveBeenCalledWith('yannl\u0131\u015f', { maxSuggestions: 8, preferNative: true, workspaceId: '' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'yanl\u0131\u015f' }));

    expect(span.textContent).toBe('yanl\u0131\u015f');
    expect(span.classList.contains('aq-spell-error')).toBe(false);
  });

  it('opens when the click target is inside a marked spell span', async () => {
    (window as any).electronAPI = { spell: { suggest: vi.fn().mockResolvedValue(['yan\u0131\u015f']) } };
    render(<SpellSuggestionPopup editorRef={{ current: null } as any} />);
    const span = document.createElement('span');
    span.className = 'aq-spell-error';
    const child = document.createElement('em');
    child.textContent = 'yannl\u0131\u015f';
    span.appendChild(child);
    document.body.appendChild(span);

    fireEvent.pointerUp(child, { clientX: 12, clientY: 18 });

    expect(await screen.findByRole('menu', { name: 'Yaz\u0131m \u00f6nerileri' })).toBeInTheDocument();
    await waitFor(() => expect(suggestWord).toHaveBeenCalledWith('yannl\u0131\u015f', { maxSuggestions: 8, preferNative: true, workspaceId: '' }));
  });

  it('uses cached match suggestions immediately without recalculating suggestions', async () => {
    mockSpellState.matches = [{
      offset: 0,
      length: 6,
      text: 'her\u015fey',
      message: 'Turkce yazim onerisi',
      replacements: [{ value: 'her \u015fey' }],
      ruleId: 'AQ_TR_HER_SEY',
      category: 'LANGUAGE_RULE'
    }];
    render(<SpellSuggestionPopup editorRef={{ current: null } as any} />);
    const span = document.createElement('span');
    span.className = 'aq-spell-error';
    span.dataset.spellOffset = '0';
    span.textContent = 'her\u015fey';
    document.body.appendChild(span);

    fireEvent.click(span, { clientX: 10, clientY: 10 });

    expect(await screen.findByRole('menuitem', { name: 'her \u015fey' })).toBeInTheDocument();
    expect(screen.queryByText(/y\u00fckleniyor/i)).not.toBeInTheDocument();
    expect(suggestWord).not.toHaveBeenCalled();
  });

  it('updates editor HTML when an editor adapter is available', async () => {
    (window as any).electronAPI = { spell: { suggest: vi.fn().mockResolvedValue(['yan\u0131\u015f']) } };
    const editor = {
      getHTML: vi.fn(() => '<p>Bu yannl\u0131\u015f kelime.</p>'),
      setHTML: vi.fn()
    };
    render(<SpellSuggestionPopup editorRef={{ current: editor } as any} />);
    const span = document.createElement('span');
    span.className = 'aq-spell-error';
    span.textContent = 'yannl\u0131\u015f';
    document.body.appendChild(span);

    fireEvent.click(span, { clientX: 10, clientY: 10 });
    await userEvent.click(await screen.findByRole('menuitem', { name: 'yanl\u0131\u015f' }));

    expect(editor.setHTML).toHaveBeenCalledWith('<p>Bu yanl\u0131\u015f kelime.</p>');
  });
});
