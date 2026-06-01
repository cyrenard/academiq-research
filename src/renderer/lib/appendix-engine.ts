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
 * Parse an appendices-HTML string (`<div class="appendix-block">` wrappers,
 * each containing an `<h1 class="appendix-title">` + content) DIRECTLY into AQ
 * Engine blocks — one centered, page-broken heading per appendix plus one
 * entry paragraph per content element (text preserved).
 *
 * This deliberately bypasses `AQEngineCompat.htmlToBlocks`, which flattens the
 * whole appendices HTML into a SINGLE block (heading levels lost, every
 * appendix's text merged) — that collapse is why only one appendix ever
 * appeared no matter how many were added.
 */
export function parseAppendicesHTMLToEngineBlocks(appendicesHTML: string): any[] {
  if (typeof document === 'undefined' || !document.createElement) return [];
  const div = document.createElement('div');
  div.innerHTML = String(appendicesHTML || '');
  const appendixDivs = Array.prototype.slice.call(div.querySelectorAll('.appendix-block')) as Element[];
  const out: any[] = [];
  appendixDivs.forEach((blockEl, idx) => {
    const n = idx + 1;
    out.push({
      type: 'heading', level: 1, pageBreak: true, align: 'center',
      _isAppendixHeading: true, _appendixId: `appendix-${n}`,
      runs: [{ text: `EK-${n}`, bold: true }]
    });
    const contentEls = (Array.prototype.slice.call(blockEl.children) as Element[])
      .filter((el) => !(el.tagName === 'H1' || (el.classList && el.classList.contains('appendix-title'))));
    if (contentEls.length) {
      contentEls.forEach((el) => {
        out.push({
          type: 'paragraph', _isAppendixEntry: true, _appendixId: `appendix-${n}`,
          runs: [{ text: String(el.textContent || '').trim() }]
        });
      });
    } else {
      out.push({
        type: 'paragraph', _isAppendixEntry: true, _appendixId: `appendix-${n}`,
        runs: [{ text: 'Ek içeriği...' }]
      });
    }
  });
  return out;
}

/**
 * Replace the active engine's appendix section (first appendix heading → end of
 * document) with the appendices parsed from `appendicesHTML`. Returns true on
 * success. This is the corrected drop-in for the legacy
 * `updateAQEngineAppendices` (which used the collapsing htmlToBlocks path).
 */
export function syncAppendicesToEngine(editor: any, appendicesHTML: string): boolean {
  if (!editor?._aqEngine || !editor?._docModel?.get || !editor?._docModel?.replace) return false;
  const docModel = editor._docModel;
  const blocks = Array.isArray(docModel.get()?.blocks) ? docModel.get().blocks.slice() : [];
  const start = blocks.findIndex((block: any) => block?._isAppendixHeading);
  const base = start >= 0 ? blocks.slice(0, start) : blocks;
  const appendixBlocks = parseAppendicesHTMLToEngineBlocks(appendicesHTML);
  docModel.replace(base.concat(appendixBlocks));
  editor._reflow?.();
  editor.emit?.('update');
  return true;
}

/**
 * Apply the appendices HTML to the active AQ Engine editor by re-syncing the
 * whole appendix section from `appendicesHTML` (so adding the Nth appendix
 * keeps the previous N-1). Also overrides the global `updateAQEngineAppendices`
 * with the corrected parser so the editor-adapter's re-sync on every edit
 * stops collapsing the appendices back down to one.
 */
export function applyAppendicesToEngine(
  appendicesHTML: string,
  _getCount?: (html: string) => number
): boolean {
  const activeEditor = getActiveEditor();
  if (!activeEditor?._aqEngine) return false;
  const win = legacyWin() as any;
  win.updateAQEngineAppendices = (editor: any, html: string) => syncAppendicesToEngine(editor, html);
  return syncAppendicesToEngine(activeEditor, appendicesHTML);
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
