import { appStore } from '../app-store';
import { sanitizeAuxiliaryHTML } from '../legacy-doc-helpers';

export function normalizeAQAppendixTitle(text: string): string {
  return String(text || '').trim().toLowerCase()
    .replace(/\u00e7/g, 'c').replace(/\u0131/g, 'i').replace(/\u015f/g, 's')
    .replace(/\u011f/g, 'g').replace(/\u00fc/g, 'u').replace(/\u00f6/g, 'o');
}

export function isAQAppendixHeading(block: any): boolean {
  if (!block) return false;
  const runs = Array.isArray(block.runs) ? block.runs : [];
  const txt = runs.map((run: any) => String(run && run.text || '')).join('').trim();
  const t = normalizeAQAppendixTitle(txt);
  return !!(block._isAppendixHeading || /^ek(?:ler)?(?:[-\s]+[a-z0-9]+)?$/.test(t) || /^appendix(?:[-\s]+[a-z0-9]+)?$/.test(t));
}

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

export function buildAppendixHTML(index: number | string): string {
  const n = Math.max(1, parseInt(String(index), 10) || 1);
  return `<div class="appendix-block" data-appendix-id="appendix-${n}"><h1 class="appendix-title">EK-${n}</h1><p class="ni">Ek içeriği...</p></div>`;
}

export function getAppendixTitleText(index: number | string): string {
  const n = Math.max(1, parseInt(String(index), 10) || 1);
  return `EK-${n}`;
}

export function countAppendicesInHTML(html: string): number {
  const text = String(html || '');
  let count = 0;
  if (typeof document !== 'undefined' && document.createElement) {
    const div = document.createElement('div');
    div.innerHTML = text;
    count = div.querySelectorAll('.appendix-block,h1.appendix-title').length;
    if (count) return count;
  }
  const matches = text.match(/class=["'][^"']*appendix-title[^"']*["']/gi);
  return matches ? matches.length : 0;
}

export function appendAppendixHTML(existingHTML: string): string {
  const current = String(existingHTML || '').trim();
  const nextIndex = countAppendicesInHTML(current) + 1;
  return (current ? current : '') + buildAppendixHTML(nextIndex);
}

export function renumberAppendicesHTML(html: string): string {
  const text = String(html || '').trim();
  if (!text) return '';
  if (typeof document === 'undefined' || !document.createElement) return text;
  const div = document.createElement('div');
  div.innerHTML = text;
  const blocks = Array.from(div.querySelectorAll('.appendix-block'));
  if (!blocks.length) {
    const headings = Array.from(div.querySelectorAll('h1.appendix-title'));
    headings.forEach((h, idx) => {
      h.textContent = getAppendixTitleText(idx + 1);
      h.setAttribute('data-appendix-id', `appendix-${idx + 1}`);
    });
    return div.innerHTML;
  }
  blocks.forEach((block, idx) => {
    const n = idx + 1;
    block.setAttribute('data-appendix-id', `appendix-${n}`);
    const heading = block.querySelector('h1.appendix-title') || block.querySelector('h1');
    if (heading) heading.textContent = getAppendixTitleText(n);
  });
  return div.innerHTML;
}

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
      block._appendixId = `appendix-${appendixIndex}`;
      block.runs = [{ text: getAppendixTitleText(appendixIndex), bold: true }];
    } else {
      block._isAppendixEntry = true;
      block._appendixId = `appendix-${Math.max(1, appendixIndex || 1)}`;
      if (!block.type) block.type = 'paragraph';
      if (block.type === 'paragraph') {
        block.firstLineIndentPx = 0;
        block.leftIndentPx = 0;
      }
    }
  });
  return list;
}

export function renumberAQEngineAppendicesInBlocks(blocks: any[]): any[] {
  const list = Array.isArray(blocks) ? blocks : [];
  let appendixIndex = 0;
  let currentId = '';
  list.forEach((block) => {
    if (!block) return;
    if (block._isAppendixHeading || isAQAppendixHeading(block)) {
      appendixIndex++;
      currentId = `appendix-${appendixIndex}`;
      block.type = 'heading';
      block.level = 1;
      block.pageBreak = true;
      block.align = 'center';
      block._isAppendixHeading = true;
      block._appendixId = currentId;
      block.runs = [{ text: getAppendixTitleText(appendixIndex), bold: true }];
    } else if (block._isAppendixEntry || block._appendixId) {
      block._isAppendixEntry = true;
      block._appendixId = currentId || block._appendixId || `appendix-${Math.max(1, appendixIndex || 1)}`;
    }
  });
  return list;
}

export function updateAQEngineAppendices(editorRef: any, appendixHTML: string): boolean {
  if (!editorRef || !editorRef._aqEngine || !editorRef._docModel) return false;
  const docModel = editorRef._docModel;
  let blocks = (docModel.get().blocks || []).slice();
  const range = findAQAppendixRange(blocks);
  if (range.start >= 0) {
    blocks = blocks.slice(0, range.start).concat(blocks.slice(range.end));
  }
  const html = String(appendixHTML || '').trim();
  if (!html) {
    docModel.replace(blocks);
    if (typeof editorRef._reflow === 'function') editorRef._reflow();
    if (typeof editorRef.emit === 'function') editorRef.emit('update');
    return true;
  }
  let appendixBlocks: any[] = [];
  const win = window as any;
  if (win.AQEngineCompat && typeof win.AQEngineCompat.htmlToBlocks === 'function') {
    appendixBlocks = win.AQEngineCompat.htmlToBlocks(html);
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

export function deleteAQEngineAppendix(editorRef: any, appendixId: string, blockIndex: number): boolean {
  if (!editorRef || !editorRef._aqEngine || !editorRef._docModel) return false;
  const docModel = editorRef._docModel;
  let blocks = (docModel.get().blocks || []).slice();
  let start = -1;
  const appId = String(appendixId || '');
  for (let i = 0; i < blocks.length; i++) {
    if (
      blocks[i] &&
      blocks[i]._isAppendixHeading &&
      ((appId && blocks[i]._appendixId === appId) || (!appId && i === blockIndex))
    ) {
      start = i;
      break;
    }
  }
  if (start < 0 && blockIndex >= 0 && blocks[blockIndex] && blocks[blockIndex]._isAppendixHeading) {
    start = blockIndex;
  }
  if (start < 0) return false;
  const end = start + 1;
  // find the end index of the current appendix block
  let nextHeadingIdx = blocks.length;
  for (let i = end; i < blocks.length; i++) {
    if (blocks[i] && (blocks[i]._isAppendixHeading || isAQAppendixHeading(blocks[i]))) {
      nextHeadingIdx = i;
      break;
    }
  }
  blocks.splice(start, nextHeadingIdx - start);
  docModel.replace(renumberAQEngineAppendicesInBlocks(blocks));
  if (typeof editorRef._reflow === 'function') editorRef._reflow();
  if (typeof editorRef.emit === 'function') editorRef.emit('update');

  // Update store document
  const state = appStore.getState();
  const currentDoc = state.docs.find((doc) => doc.id === state.curDoc) || state.docs[0];
  if (currentDoc && String(currentDoc.appendicesHTML || '').trim()) {
    try {
      const div = document.createElement('div');
      div.innerHTML = String(currentDoc.appendicesHTML || '');
      const selector = appId ? `[data-appendix-id="${appId.replace(/"/g, '')}"]` : '';
      let target = selector ? div.querySelector(selector) : null;
      if (!target) {
        const blocksDom = div.querySelectorAll('.appendix-block');
        const n = parseInt(appId.replace(/\D+/g, ''), 10);
        if (n && blocksDom[n - 1]) target = blocksDom[n - 1];
      }
      if (target && target.parentNode) {
        target.parentNode.removeChild(target);
      }
      const nextHTML = sanitizeAuxiliaryHTML(renumberAppendicesHTML(div.innerHTML));
      appStore.setState((s) => ({
        docs: s.docs.map((doc) => doc.id === currentDoc.id ? { ...doc, appendicesHTML: nextHTML } : doc)
      }));
    } catch (_e) {
      console.warn('Failed to update store appendicesHTML in deleteAQEngineAppendix:', _e);
    }
  }
  return true;
}

let editorSavedPmSelection: any = null;
let editorSavedRange: Range | null = null;

export function saveEditorSelection(): void {
  if (typeof window === 'undefined') return;
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    const ed = document.getElementById('apaed');
    if (ed && ed.contains(range.commonAncestorContainer)) {
      editorSavedRange = range.cloneRange();
    }
  }
}

export function restoreEditorSelection(): boolean {
  if (editorSavedRange && typeof window !== 'undefined') {
    try {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(editorSavedRange);
        editorSavedRange = null;
        return true;
      }
    } catch (e) {
      editorSavedRange = null;
      return false;
    }
  }
  return false;
}

export function captureEditorListStyleSelection(activeEditor: any): boolean {
  editorSavedPmSelection = null;
  if (!activeEditor) return false;
  if (activeEditor._aqEngine && typeof activeEditor._captureSelection === 'function') {
    try {
      const aqRange = activeEditor._captureSelection();
      if (aqRange) {
        editorSavedPmSelection = {
          type: 'aq',
          editor: activeEditor,
          range: aqRange
        };
        saveEditorSelection();
        return true;
      }
    } catch (_e) {}
  }
  if (activeEditor.state && activeEditor.state.selection) {
    try {
      editorSavedPmSelection = {
        type: 'pm',
        from: activeEditor.state.selection.from,
        to: activeEditor.state.selection.to
      };
    } catch (_e) {}
  }
  saveEditorSelection();
  return true;
}

export function restoreEditorListStyleSelection(activeEditor: any): boolean {
  if (editorSavedPmSelection && editorSavedPmSelection.type === 'aq') {
    try {
      const aqEditor = editorSavedPmSelection.editor || activeEditor;
      if (aqEditor && typeof aqEditor._restoreSelection === 'function' && aqEditor._restoreSelection(editorSavedPmSelection.range)) {
        editorSavedPmSelection = null;
        return true;
      }
    } catch (_e) {
      editorSavedPmSelection = null;
    }
  }
  return restoreEditorSelection();
}
