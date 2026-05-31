/**
 * aq-engine appendix manipulation — faithful 1:1 TS ports of the legacy
 * `legacy-runtime.js` functions (normalizeAQAppendixTitle, getAppendixTitleText,
 * isAQAppendixHeading, renumberAppendicesHTML, renumberAQEngineAppendicesInBlocks,
 * deleteAQEngineAppendix).
 *
 * These reproduce the legacy behavior EXACTLY (same regexes, same `parseInt`
 * coercion, same block splice + renumber + docModel.replace + reflow/emit
 * order). Side-effectful dependencies that the legacy reads from globals
 * (getCurrentDocRecord / sanitizeAuxPageHTML / save) are INJECTED so the core
 * is decoupled + testable; callers pass the existing legacy-doc-helpers.
 *
 * Phase 4 of the strangler migration (aq-engine ownership). The editor-mutating
 * path (docModel.replace + editorRef._reflow on the live aq-engine) must be
 * verified in the real app (`tauri:dev`): add 2-3 appendices, delete a middle
 * one, confirm the rest renumber to EK-1, EK-2, ….
 */

/** Legacy `normalizeAQAppendixTitle` — lowercase + fold Turkish letters. */
export function normalizeAQAppendixTitle(text: unknown): string {
  return String(text ?? '').trim().toLowerCase()
    .replace(/ç/g, 'c').replace(/ı/g, 'i').replace(/ş/g, 's')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o');
}

/** Legacy `getAppendixTitleText` — "EK-N". */
export function getAppendixTitleText(index: unknown): string {
  const n = Math.max(1, parseInt(String(index), 10) || 1);
  return 'EK-' + n;
}

/** Legacy `isAQAppendixHeading`. */
export function isAQAppendixHeading(block: any): boolean {
  if (!block) return false;
  const txt = (block.runs || []).map((run: any) => String(run && run.text || '')).join('').trim();
  const t = normalizeAQAppendixTitle(txt);
  return !!(block._isAppendixHeading || /^ek(?:ler)?(?:[-\s]+[a-z0-9]+)?$/.test(t) || /^appendix(?:[-\s]+[a-z0-9]+)?$/.test(t));
}

/** Legacy `renumberAppendicesHTML` — DOM-based renumber of `.appendix-block` / `h1.appendix-title`. */
export function renumberAppendicesHTML(html: unknown): string {
  const text = String(html ?? '').trim();
  if (!text) return '';
  if (typeof document === 'undefined' || !document.createElement) return text;
  const div = document.createElement('div');
  div.innerHTML = text;
  const blocks = Array.prototype.slice.call(div.querySelectorAll('.appendix-block')) as Element[];
  if (!blocks.length) {
    const headings = Array.prototype.slice.call(div.querySelectorAll('h1.appendix-title')) as Element[];
    headings.forEach((h, idx) => {
      h.textContent = getAppendixTitleText(idx + 1);
      h.setAttribute('data-appendix-id', 'appendix-' + (idx + 1));
    });
    return div.innerHTML;
  }
  blocks.forEach((block, idx) => {
    const n = idx + 1;
    block.setAttribute('data-appendix-id', 'appendix-' + n);
    const heading = block.querySelector('h1.appendix-title') || block.querySelector('h1');
    if (heading) heading.textContent = getAppendixTitleText(n);
  });
  return div.innerHTML;
}

/** Legacy `renumberAQEngineAppendicesInBlocks` — mutates + returns the blocks array. */
export function renumberAQEngineAppendicesInBlocks(blocks: any[]): any[] {
  const list = Array.isArray(blocks) ? blocks : [];
  let appendixIndex = 0;
  let currentId = '';
  list.forEach((block) => {
    if (!block) return;
    if (block._isAppendixHeading || isAQAppendixHeading(block)) {
      appendixIndex++;
      currentId = 'appendix-' + appendixIndex;
      block.type = 'heading';
      block.level = 1;
      block.pageBreak = true;
      block.align = 'center';
      block._isAppendixHeading = true;
      block._appendixId = currentId;
      block.runs = [{ text: getAppendixTitleText(appendixIndex), bold: true }];
    } else if (block._isAppendixEntry || block._appendixId) {
      block._isAppendixEntry = true;
      block._appendixId = currentId || block._appendixId || 'appendix-' + Math.max(1, appendixIndex || 1);
    }
  });
  return list;
}

export interface AppendixDeleteDeps {
  /** Active document record (legacy getCurrentDocRecord / getActiveDocRecord). */
  getDocRecord: () => any | null;
  /** Auxiliary HTML sanitizer (legacy sanitizeAuxPageHTML / sanitizeAuxiliaryHTML). */
  sanitize: (html: string) => string;
  /** Persist (legacy save / saveAuxiliaryChange). */
  save: () => void;
}

/** Legacy `deleteAQEngineAppendix` — faithful 1:1 (incl. parseInt(blockIndex) coercion). */
export function deleteAQEngineAppendix(
  editorRef: any,
  appendixId: string,
  blockIndex: number,
  deps: AppendixDeleteDeps
): boolean {
  if (!editorRef || !editorRef._aqEngine || !editorRef._docModel) return false;
  const docModel = editorRef._docModel;
  const blocks = (docModel.get().blocks || []).slice();
  let start = -1;
  const appId = String(appendixId || '');
  const idx = parseInt(String(blockIndex), 10);
  for (let i = 0; i < blocks.length; i++) {
    if (
      blocks[i] && blocks[i]._isAppendixHeading &&
      ((appId && blocks[i]._appendixId === appId) || (!appId && i === idx))
    ) {
      start = i;
      break;
    }
  }
  if (start < 0 && idx >= 0 && blocks[idx] && blocks[idx]._isAppendixHeading) start = idx;
  if (start < 0) return false;
  let end = start + 1;
  while (end < blocks.length && !(blocks[end] && blocks[end]._isAppendixHeading)) end++;
  blocks.splice(start, end - start);
  docModel.replace(renumberAQEngineAppendicesInBlocks(blocks));
  if (typeof editorRef._reflow === 'function') editorRef._reflow();
  if (typeof editorRef.emit === 'function') editorRef.emit('update');
  const doc = deps.getDocRecord();
  if (doc && String(doc.appendicesHTML || '').trim()) {
    try {
      const div = document.createElement('div');
      div.innerHTML = String(doc.appendicesHTML || '');
      const selector = appId ? '[data-appendix-id="' + appId.replace(/"/g, '') + '"]' : '';
      let target: Element | null = selector ? div.querySelector(selector) : null;
      if (!target) {
        const blocksDom = div.querySelectorAll('.appendix-block');
        const n = parseInt(String(appId || '').replace(/\D+/g, ''), 10);
        if (n && blocksDom[n - 1]) target = blocksDom[n - 1];
      }
      if (target && target.parentNode) target.parentNode.removeChild(target);
      doc.appendicesHTML = deps.sanitize(renumberAppendicesHTML(div.innerHTML));
    } catch (_e) { /* ignore, as legacy does */ }
  }
  deps.save();
  return true;
}

/** Legacy `findAQAppendixRange`. */
export function findAQAppendixRange(blocks: any[]): { start: number; end: number } {
  const list = Array.isArray(blocks) ? blocks : [];
  let start = -1;
  for (let i = 0; i < list.length; i++) {
    if (list[i] && list[i].type === 'heading' && isAQAppendixHeading(list[i])) {
      start = i;
      break;
    }
  }
  if (start < 0) return { start: -1, end: -1 };
  return { start, end: list.length };
}

/** Legacy `normalizeAQEngineAppendixBlocks`. */
export function normalizeAQEngineAppendixBlocks(appendixBlocks: any[]): any[] {
  const list = Array.isArray(appendixBlocks) ? appendixBlocks : [];
  let appendixIndex = 0;
  let inAppendix = false;
  list.forEach((block, idx) => {
    if (!block) return;
    const isHeading = (block.type === 'heading' && isAQAppendixHeading(block)) || (idx === 0 && !inAppendix);
    if (isHeading) {
      appendixIndex++;
      inAppendix = true;
      block.type = 'heading';
      block.level = 1;
      block.pageBreak = true;
      block.align = 'center';
      block._isAppendixHeading = true;
      block._appendixId = 'appendix-' + appendixIndex;
      block.runs = [{ text: getAppendixTitleText(appendixIndex), bold: true }];
    } else {
      block._isAppendixEntry = true;
      block._appendixId = 'appendix-' + Math.max(1, appendixIndex || 1);
      if (!block.type) block.type = 'paragraph';
      if (block.type === 'paragraph') {
        block.firstLineIndentPx = 0;
        block.leftIndentPx = 0;
      }
    }
  });
  return list;
}

export interface AQEngineCompatDeps {
  htmlToBlocks?: (html: string) => any[];
}

/** Legacy `updateAQEngineAppendices` — faithful 1:1. */
export function updateAQEngineAppendices(
  editorRef: any,
  appendixHTML: unknown,
  compat?: AQEngineCompatDeps
): boolean {
  if (!editorRef || !editorRef._aqEngine || !editorRef._docModel) return false;
  const docModel = editorRef._docModel;
  let blocks = (docModel.get().blocks || []).slice();
  const range = findAQAppendixRange(blocks);
  if (range.start >= 0) {
    blocks = blocks.slice(0, range.start).concat(blocks.slice(range.end));
  }
  const html = String(appendixHTML ?? '').trim();
  if (!html) {
    docModel.replace(blocks);
    if (typeof editorRef._reflow === 'function') editorRef._reflow();
    if (typeof editorRef.emit === 'function') editorRef.emit('update');
    return true;
  }
  let appendixBlocks: any[] = [];
  if (compat && typeof compat.htmlToBlocks === 'function') {
    appendixBlocks = compat.htmlToBlocks(html);
  } else if ((globalThis as any).window?.AQEngineCompat && typeof (globalThis as any).window.AQEngineCompat.htmlToBlocks === 'function') {
    appendixBlocks = (globalThis as any).window.AQEngineCompat.htmlToBlocks(html);
  } else {
    appendixBlocks = [
      { type: 'heading', level: 1, runs: [{ text: 'Ek', bold: true }] },
      { type: 'paragraph', runs: [{ text: 'Ek içeriği...' }] }
    ];
  }
  appendixBlocks = normalizeAQEngineAppendixBlocks(appendixBlocks);
  docModel.replace(blocks.concat(appendixBlocks));
  if (typeof editorRef._reflow === 'function') editorRef._reflow();
  if (typeof editorRef.emit === 'function') editorRef.emit('update');
  return true;
}
