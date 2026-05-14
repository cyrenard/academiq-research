/**
 * AQ Engine Appendix Lifecycle
 *
 * Helpers for inserting / removing appendix headings + content directly
 * in the AQ Engine's document model, plus DOM-level "Eki sil" delete
 * button installation. Extracted from TopToolbar.tsx so the engine
 * surface is independently testable.
 *
 * The engine path uses the `_aqEngine` flag on the editor instance and
 * either the legacy `updateAQEngineAppendices` helper or direct
 * docModel.replace() calls.
 */

import { legacyWin } from './legacy-window';

/**
 * Resolve the currently-active editor instance. Falls back to the
 * `window.editor` global if no `getActiveEditorInstance` helper is
 * registered.
 */
function getActiveEditor() {
  const win = legacyWin() as any;
  return typeof win.getActiveEditorInstance === 'function'
    ? win.getActiveEditorInstance()
    : (win.editor || null);
}

/**
 * Apply the appendices HTML to the active AQ Engine editor. Tries
 * the legacy `updateAQEngineAppendices` helper first; falls back to
 * a direct docModel.replace() that appends a new appendix heading +
 * placeholder paragraph. Returns true on success.
 */
export function applyAppendicesToEngine(
  appendicesHTML: string,
  getCount: (html: string) => number
): boolean {
  const win = legacyWin() as any;
  const activeEditor = getActiveEditor();
  if (activeEditor?._aqEngine && typeof win.updateAQEngineAppendices === 'function') {
    return !!win.updateAQEngineAppendices(activeEditor, appendicesHTML);
  }
  if (activeEditor?._aqEngine && activeEditor?._docModel?.get && activeEditor?._docModel?.replace) {
    const docModel = activeEditor._docModel;
    const blocks = Array.isArray(docModel.get()?.blocks) ? docModel.get().blocks.slice() : [];
    const nextIndex = Math.max(1, getCount(appendicesHTML));
    docModel.replace(blocks.concat([
      {
        type: 'heading',
        level: 1,
        pageBreak: true,
        align: 'center',
        _isAppendixHeading: true,
        _appendixId: `appendix-${nextIndex}`,
        runs: [{ text: `EK-${nextIndex}`, bold: true }]
      },
      {
        type: 'paragraph',
        _isAppendixEntry: true,
        _appendixId: `appendix-${nextIndex}`,
        runs: [{ text: 'Ek içeriği...' }]
      }
    ]));
    activeEditor._reflow?.();
    activeEditor.emit?.('update');
    return true;
  }
  return false;
}

/**
 * Remove an appendix block (and its trailing content up to the next
 * appendix or end of document) from the AQ Engine doc model. Returns
 * true if a block was removed. If `appendixId` is omitted, removes
 * the first appendix found.
 */
export function removeAppendixFromEngine(appendixId?: string): boolean {
  const activeEditor = getActiveEditor();
  const docModel = activeEditor?._docModel;
  const blocks = docModel?.get?.()?.blocks;
  if (!activeEditor?._aqEngine || !docModel?.replace || !Array.isArray(blocks)) return false;
  const start = blocks.findIndex((block: any) =>
    block?._isAppendixHeading && (!appendixId || block._appendixId === appendixId)
  );
  if (start < 0) return false;
  let end = blocks.length;
  if (appendixId) {
    for (let index = start + 1; index < blocks.length; index += 1) {
      if (blocks[index]?._isAppendixHeading) {
        end = index;
        break;
      }
    }
  }
  docModel.replace(blocks.slice(0, start).concat(blocks.slice(end)));
  activeEditor._reflow?.();
  activeEditor.emit?.('update');
  return true;
}

/**
 * Scroll the most-recent appendix into view. Prefers the engine block
 * (smooth scroll to the heading line); falls back to the legacy
 * #appendixpage DOM element when the engine has no appendix or when
 * the auxiliary page is visible. Returns true if a scroll happened.
 */
export function scrollToLatestAppendix(): boolean {
  const activeEditor = getActiveEditor();
  const blocks = activeEditor?._docModel?.get?.()?.blocks;
  if (Array.isArray(blocks)) {
    let appendixIndex = -1;
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
      if (blocks[index]?._isAppendixHeading) {
        appendixIndex = index;
        break;
      }
    }
    if (appendixIndex >= 0) {
      const line = document.querySelector(`.aq-engine-line[data-block-index="${appendixIndex}"]`) as HTMLElement | null;
      if (line) {
        line.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        return true;
      }
    }
  }
  const appendixPage = document.getElementById('appendixpage');
  if (appendixPage && window.getComputedStyle(appendixPage).display !== 'none') {
    appendixPage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }
  return false;
}

/**
 * Install "Eki sil" delete buttons on every appendix block (both AQ
 * Engine heading lines and legacy #appendixbody .appendix-block
 * elements). Idempotent — re-running won't add duplicate buttons.
 *
 * The `onDelete` callback receives the resolved appendixId and the
 * block index (or -1 for legacy DOM blocks).
 */
export function installAppendixDeleteButtons(
  onDelete: (appendixId: string, blockIndex: number) => void
) {
  const activeEditor = getActiveEditor();
  const blocks = activeEditor?._docModel?.get?.()?.blocks;
  if (Array.isArray(blocks)) {
    blocks.forEach((block: any, index: number) => {
      if (!block?._isAppendixHeading) return;
      const appendixId = String(block._appendixId || `appendix-${index + 1}`);
      const line = document.querySelector(`.aq-engine-line[data-block-index="${index}"]`) as HTMLElement | null;
      if (!line || line.querySelector('.appendix-remove-btn')) return;
      line.classList.add('aq-appendix-heading-line');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'appendix-remove-btn aq-appendix-delete-btn';
      button.dataset.appendixId = appendixId;
      button.dataset.blockIndex = String(index);
      button.textContent = 'Eki sil';
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onDelete(appendixId, index);
      });
      line.appendChild(button);
    });
  }

  document.querySelectorAll<HTMLElement>('#appendixbody .appendix-block').forEach((block) => {
    if (block.querySelector('.appendix-remove-btn')) return;
    const appendixId = block.dataset.appendixId || '';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'appendix-remove-btn';
    button.dataset.appendixId = appendixId;
    button.textContent = 'Eki sil';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onDelete(appendixId, -1);
    });
    block.appendChild(button);
  });
}

/**
 * Resolve a delete-button's target appendix id. Looks for:
 *   1. button.dataset.appendixId / [data-appendix-id]
 *   2. nearest .appendix-block ancestor's dataset.appendixId
 *   3. nearest .aq-engine-line's blockIndex → engine blocks[index]._appendixId
 *
 * Returns '' if nothing resolves.
 */
export function resolveAppendixIdFromButton(button: HTMLElement): string {
  const direct = button.dataset.appendixId || button.getAttribute('data-appendix-id') || '';
  if (direct) return direct;
  const block = button.closest('.appendix-block') as HTMLElement | null;
  if (block?.dataset.appendixId) return block.dataset.appendixId;
  const line = button.closest('.aq-engine-line') as HTMLElement | null;
  const blockIndex = Number(line?.dataset.blockIndex);
  if (!Number.isFinite(blockIndex)) return '';
  const editor = getActiveEditor();
  const blocks = editor?._docModel?.get?.()?.blocks;
  if (!Array.isArray(blocks)) return '';
  return String(blocks[blockIndex]?._appendixId || '');
}
