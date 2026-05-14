/**
 * Bibliography Navigation
 *
 * Helpers for locating + scrolling to the "Kaynakça / References /
 * Bibliography" heading block within the AQ Engine document model.
 * Extracted from TopToolbar.tsx so the editor surface can be tested
 * independently from the toolbar component.
 *
 * Detection is done by either:
 *   - block._isBibHeading flag (set explicitly by legacy code), or
 *   - normalized block text matching one of: kaynakca / references /
 *     bibliography (Turkish locale lowercase, NFD-decomposed, diacritic-
 *     stripped, whitespace-collapsed).
 */
import { legacyWin } from './legacy-window';

/**
 * Locale-aware heading text normalization: Turkish lowercase, NFD decomp,
 * strip combining diacritics, strip whitespace.
 */
export function normalizeHeadingText(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Extract plain text from an AQ Engine block (paragraph or heading).
 * Handles both the run-based format (`block.runs[].text`) and legacy
 * plain text (`block.text`).
 */
export function getBlockText(block: any) {
  if (!block) return '';
  return Array.isArray(block.runs)
    ? block.runs.map((run: any) => String(run?.text || '')).join('')
    : String(block.text || '');
}

/**
 * Find the index of the bibliography heading block in the active AQ
 * Engine editor. Returns -1 when no editor or no matching block.
 *
 * Matches:
 *   1. block._isBibHeading === true
 *   2. normalized block text === 'kaynakca' | 'references' | 'bibliography'
 */
export function findBibliographyBlockIndex() {
  const editor = (legacyWin() as any).editor;
  const blocks = editor?._aqEngine && editor?._docModel?.get?.()?.blocks;
  if (!Array.isArray(blocks)) return -1;
  return blocks.findIndex((block: any) => {
    if (block?._isBibHeading) return true;
    const text = normalizeHeadingText(getBlockText(block));
    return text === 'kaynakca' || text === 'references' || text === 'bibliography';
  });
}

/**
 * Compute the editor selection offset (char index) at the START of the
 * given block. Used to restore selection on the bibliography heading
 * after scrolling.
 */
export function getBlockStartOffset(blockIndex: number) {
  const editor = (legacyWin() as any).editor;
  const blocks = editor?._docModel?.get?.()?.blocks;
  if (!Array.isArray(blocks) || blockIndex < 0) return 0;
  let offset = 0;
  for (let index = 0; index < blockIndex; index += 1) {
    const blockLength = typeof editor._docModel.blockTextLength === 'function'
      ? editor._docModel.blockTextLength(index)
      : getBlockText(blocks[index]).length;
    offset += blockLength + 1;
  }
  return offset;
}

/**
 * Scroll the bibliography heading into view + place the AQ Engine
 * selection on the heading. Returns true on success.
 */
export function scrollToBibliographyBlock() {
  const blockIndex = findBibliographyBlockIndex();
  if (blockIndex < 0) return false;
  const line = document.querySelector(`.aq-engine-line[data-block-index="${blockIndex}"]`) as HTMLElement | null;
  if (!line) return false;
  line.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  const editor = (legacyWin() as any).editor;
  const offset = getBlockStartOffset(blockIndex);
  editor?._restoreSelection?.({ type: 'aq', from: offset, to: offset, anchor: offset, focus: offset });
  editor?._reflow?.();
  return true;
}
