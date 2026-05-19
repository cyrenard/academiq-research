/**
 * File-Import Helpers
 *
 * Pulls images, Word documents and bibliography files (BibTeX/RIS) from
 * <input type="file"> elements and dispatches them to the legacy editor
 * runtime. Extracted from LegacyCompatibilityHost.tsx.
 *
 * Bug fixes during extraction:
 *   - importBibliographyFile referenced `win.AQReferenceParseç` (stray ç).
 *     If the renderer-side `parseBibTeX`/`parseRIS` weren't on window,
 *     the fallback threw because AQReferenceParseç is undefined. Now
 *     falls back to the correctly-spelled `AQReferenceParse` object,
 *     and surfaces a real "parser hazır değil" error if neither is
 *     present.
 */

import type { ChangeEvent } from 'react';
import { legacyWin } from './legacy-window';
import { syncReactFromLegacy } from './legacy-dom-helpers';

type StatusFn = (message: string) => void;

// ───────────────────────────────────────────────────────────────────────────
// FileReader Promise wrappers
// ───────────────────────────────────────────────────────────────────────────

export function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(String(event.target?.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Dosya okunamadı'));
    reader.readAsText(file);
  });
}

export function readFileAsDataURL(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(String(event.target?.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Görsel okunamadı'));
    reader.readAsDataURL(file);
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Image upload → editor
// ───────────────────────────────────────────────────────────────────────────

export async function insertImageFile(event: ChangeEvent<HTMLInputElement>, onStatus: StatusFn) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  const win = legacyWin();
  try {
    const editor = win.editor;
    const tipTapContent = (win as any).AQTipTapWordContent;
    if (typeof tipTapContent?.insertImageFile === 'function') {
      const handled = tipTapContent.insertImageFile({
        file,
        editor: editor || null,
        host: document.getElementById('apaed'),
        getSavedRange: () => null,
        setSavedRange: () => undefined
      });
      if (handled) {
        onStatus('Görsel eklendi');
        return;
      }
    }

    const src = await readFileAsDataURL(file);
    const buildImageHTML = (win as any).AQTipTapWordDocument?.buildImageHTML;
    const html = typeof buildImageHTML === 'function'
      ? buildImageHTML(src, file.name)
      : `<img src="${src}" data-width="70%" data-align="left" style="display:block;float:left;width:70%;max-width:100%;height:auto;text-indent:0;margin-left:0;margin-right:14px;margin-top:2px;margin-bottom:10px;" alt="${file.name}"/><p><br></p>`;
    if (typeof win.restoreEditorListStyleSelection === 'function') {
      try { win.restoreEditorListStyleSelection(); } catch (_error) {}
    }
    if (editor?.chain) {
      editor.chain().focus().insertContent(html, { parseOptions: { preserveWhitespace: false } }).run();
      if (typeof win.runEditorMutationEffects === 'function') {
        win.runEditorMutationEffects({ layout: true, syncChrome: true, syncTOC: false, syncRefs: false, refreshTrigger: false });
      }
      onStatus('Görsel eklendi');
      return;
    }
    if (typeof (win as any).handleImgUpload === 'function') {
      (win as any).handleImgUpload(event.nativeEvent || (event as unknown as Event));
      onStatus('Görsel eklendi');
      return;
    }
    onStatus('Görsel eklenemedi');
  } catch (error) {
    console.error('[legacy-image]', error);
    onStatus('Görsel eklenemedi');
  } finally {
    input.value = '';
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Word import
// ───────────────────────────────────────────────────────────────────────────

function fallbackPlainTextAPA(text: string) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('') || '<p><br></p>';
}

function decodeWordBytes(bytes: ArrayBuffer) {
  const buffer = bytes || new ArrayBuffer(0);
  const decoders = ['utf-8', 'windows-1254', 'windows-1252', 'iso-8859-9', 'latin1'];
  for (const encoding of decoders) {
    try {
      const text = new TextDecoder(encoding).decode(buffer);
      if (text && text.trim()) return text;
    } catch (_error) {}
  }
  return '';
}

function wordImportMammothOptions() {
  return {
    styleMap: [
      "p[style-name='Title'] => h1:fresh",
      "p[style-name='Subtitle'] => h2:fresh",
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
      "p[style-name='Heading 4'] => h4:fresh",
      "p[style-name='Heading 5'] => h5:fresh",
      "p[style-name='Başlık 1'] => h1:fresh",
      "p[style-name='Başlık 2'] => h2:fresh",
      "p[style-name='Başlık 3'] => h3:fresh",
      "p[style-name='Başlık 4'] => h4:fresh",
      "p[style-name='Başlık 5'] => h5:fresh",
      "p[style-name='Baslik 1'] => h1:fresh",
      "p[style-name='Baslik 2'] => h2:fresh",
      "p[style-name='Baslik 3'] => h3:fresh",
      "p[style-name='Baslik 4'] => h4:fresh",
      "p[style-name='Baslik 5'] => h5:fresh"
    ],
    includeDefaultStyleMap: true
  };
}

async function persistImportedWordDocument(onStatus?: StatusFn) {
  const win = legacyWin();
  const w = win as any;
  const editorHTML = currentImportedEditorHTML(win);
  if (editorHTML) {
    patchLegacyActiveDocumentHTML(win, editorHTML);
    try {
      window.dispatchEvent(new CustomEvent('aq:word-import-committed', {
        detail: { html: editorHTML }
      }));
    } catch (_error) {}
  }
  try { if (typeof win.save === 'function') win.save(); } catch (_error) {}
  try {
    if (typeof win.runEditorMutationEffects === 'function') {
      win.runEditorMutationEffects({ layout: true, syncChrome: true, syncTOC: false, syncRefs: false, refreshTrigger: false });
    }
  } catch (_error) {}
  try { if (typeof w.flushCurrentDocFromEditor === 'function') w.flushCurrentDocFromEditor(); } catch (_error) {}
  try { if (typeof w.__aqCommitActiveDoc === 'function') w.__aqCommitActiveDoc(); } catch (_error) {}
  try { if (typeof win.save === 'function') win.save(); } catch (_error) {}
  try { if (typeof win.__aqReactSyncFromLegacy === 'function') win.__aqReactSyncFromLegacy(win.S || {}); } catch (_error) {}

  try {
    const json = typeof w.__aqBuildPersistedStateJSON === 'function'
      ? w.__aqBuildPersistedStateJSON()
      : JSON.stringify(win.S || {});
    if (typeof window.electronAPI?.saveEditorDraft === 'function') await window.electronAPI.saveEditorDraft(json);
    if (typeof window.electronAPI?.saveData === 'function') {
      const result = await window.electronAPI.saveData(json) as { ok?: boolean; error?: string } | undefined;
      if (!result || result.ok === false) throw new Error(result?.error || 'Kaydetme başarısız');
    } else if (typeof w.syncSave === 'function') {
      await w.syncSave();
    }
    try { if (typeof w.setAutosaveSaved === 'function') w.setAutosaveSaved(); } catch (_error) {}
  } catch (error) {
    console.error('[word-import:persist]', error);
    onStatus?.('Word içeriği aktarıldı ama kaydedilemedi');
    return;
  }

  syncReactFromLegacy();
}

function currentImportedEditorHTML(win: Window & Record<string, any>) {
  try {
    const editor = win.getActiveEditorInstance?.() || win.editor;
    const html = editor?.getHTML?.();
    if (typeof html === 'string' && html.trim()) return html;
  } catch (_error) {}
  try {
    const host = document.getElementById('apaed');
    const html = host?.innerHTML || '';
    if (html.trim()) return html;
  } catch (_error) {}
  return '';
}

function patchLegacyActiveDocumentHTML(win: Window & Record<string, any>, html: string) {
  const state = win.S;
  if (!state || typeof state !== 'object' || !html) return;
  const docId = String(state.curDoc || '');
  state.doc = html;
  if (Array.isArray(state.docs)) {
    state.docs = state.docs.map((doc: any) => (
      doc && String(doc.id || '') === docId
        ? { ...doc, content: html }
        : doc
    ));
  }
}

function scheduleImportedWordPersist(onStatus: StatusFn) {
  void persistImportedWordDocument(onStatus);
  window.setTimeout(() => { void persistImportedWordDocument(onStatus); }, 400);
  window.setTimeout(() => { void persistImportedWordDocument(onStatus); }, 1400);
}

function applyImportedWordHTML(html: string, onStatus: StatusFn) {
  const win = legacyWin();
  const w = win as any;
  const editor = win.editor;
  const io = w.AQTipTapWordIO;
  const formatPlainTextAPA = w.formatPlainTextAPA;
  const normalizedImport = typeof io?.normalizeImportHTML === 'function'
    ? io.normalizeImportHTML(html, formatPlainTextAPA || fallbackPlainTextAPA)
    : html;
  const normalized = typeof io?.repairWordImportHTML === 'function'
    ? io.repairWordImportHTML(normalizedImport || html)
    : normalizedImport;
  const source = normalized || html;
  try {
    if (typeof io?.applyImportedHTML === 'function') {
      const ok = io.applyImportedHTML({
        editor: editor || null,
        html: source || '<p><br></p>',
        cleanPastedHTML: w.cleanPastedHTML,
        setCurrentEditorHTML: w.setCurrentEditorHTML,
        afterEditorImport: () => {
          if (typeof win.runEditorMutationEffects === 'function') {
            win.runEditorMutationEffects({ layout: true, syncChrome: true, syncTOC: false, syncRefs: false, refreshTrigger: false });
          }
          if (typeof win.save === 'function') win.save();
        },
        afterDomImport: () => {
          if (typeof win.runEditorMutationEffects === 'function') {
            win.runEditorMutationEffects({ layout: true, syncChrome: true, syncTOC: false, syncRefs: false, refreshTrigger: false });
          }
          if (typeof win.save === 'function') win.save();
        }
      });
      if (ok) {
        onStatus('Word dosyası içe aktarıldı');
        scheduleImportedWordPersist(onStatus);
        return true;
      }
    }
    if (editor?.commands?.setContent) {
      editor.commands.setContent(source || '<p><br></p>', false);
      editor.commands.focus?.('end');
      onStatus('Word dosyası içe aktarıldı');
      scheduleImportedWordPersist(onStatus);
      return true;
    }
  } catch (error) {
    console.error('[word-import:apply]', error);
  }
  return false;
}

export async function importWordFileDirect(event: ChangeEvent<HTMLInputElement>, onStatus: StatusFn) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  const lowerName = file.name.toLowerCase();
  try {
    let html = '';
    const nativePath = String((file as any).path || '').trim();
    if (nativePath && /\.(doc|docx)$/i.test(lowerName) && typeof window.electronAPI?.wordToHtml === 'function') {
      try {
        const result = await window.electronAPI.wordToHtml(nativePath) as { ok?: boolean; html?: string } | undefined;
        if (result?.ok && result.html) html = String(result.html || '');
      } catch (_error) {}
    }

    if (!html && /\.docx$/i.test(lowerName)) {
      const mammoth = (legacyWin() as any).mammoth;
      if (typeof mammoth?.convertToHtml === 'function') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer }, wordImportMammothOptions());
        html = String(result?.value || '');
      }
    }

    if (!html) {
      const arrayBuffer = await file.arrayBuffer();
      html = decodeWordBytes(arrayBuffer);
    }

    if (!html.trim()) {
      onStatus('Word dosyası okunamadı');
      return;
    }

    if (!applyImportedWordHTML(html, onStatus)) {
      onStatus('Word dosyası içe aktarılamadı');
    }
  } catch (error) {
    console.error('[word-import]', error);
    onStatus('Word dosyası içe aktarılamadı');
  } finally {
    input.value = '';
  }
}

// ───────────────────────────────────────────────────────────────────────────
// BibTeX/RIS file import
// ───────────────────────────────────────────────────────────────────────────

export async function importBibliographyFile(event: ChangeEvent<HTMLInputElement>, onStatus: StatusFn) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  const win = legacyWin();
  const w = win as any;
  try {
    const text = await readFileAsText(file);
    const lowerName = file.name.toLowerCase();
    const refParse = win.AQReferenceParse;
    const parser = lowerName.endsWith('.bib')
      ? (w.parseBibTeX || refParse?.parseBibTeX)
      : (w.parseRIS || refParse?.parseRIS);
    if (typeof parser !== 'function') {
      const importFromFileInput = w.__importFromFileInput;
      if (typeof importFromFileInput === 'function') {
        importFromFileInput({ target: input }, { allowJson: false, prefix: 'Kaynak aktarımı' });
        [500, 1500, 3500].forEach((delay) => window.setTimeout(syncReactFromLegacy, delay));
        return;
      }
      throw new Error('Parser hazır değil');
    }
    const entries = parser(text, { createId: w.uid, workspaceId: win.S?.cur });
    if (!Array.isArray(entries) || !entries.length) {
      onStatus('Kaynak bulunamadı');
      return;
    }
    window.dispatchEvent(new CustomEvent('aq:import-references', {
      detail: { entries, sourceLabel: lowerName.endsWith('.bib') ? 'BibTeX' : 'RIS' }
    }));
  } catch (error) {
    console.error('[bibliography-import]', error);
    onStatus('BibTeX/RIS aktarılamadı');
  } finally {
    input.value = '';
  }
}

function fileInputEvent(file: File) {
  const target = { files: [file], value: '' };
  return {
    currentTarget: target,
    target,
    nativeEvent: { target }
  } as unknown as ChangeEvent<HTMLInputElement>;
}

export async function insertImageFileObject(file: File, onStatus: StatusFn) {
  await insertImageFile(fileInputEvent(file), onStatus);
}

export async function importWordFileObject(file: File, onStatus: StatusFn) {
  await importWordFileDirect(fileInputEvent(file), onStatus);
}

export async function importBibliographyFileObject(file: File, onStatus: StatusFn) {
  await importBibliographyFile(fileInputEvent(file), onStatus);
}

export function importZoteroFileObject(file: File, onStatus: StatusFn) {
  const win = legacyWin() as any;
  const target = { files: [file], value: '' };
  const importer = win.__importFromFileInput || win.importZotero;
  if (typeof importer !== 'function') {
    onStatus('Zotero aktarımı hazır değil');
    return false;
  }
  try {
    if (importer === win.__importFromFileInput) {
      importer({ target }, { allowJson: true, prefix: 'Zotero aktarımı' });
    } else {
      importer({ target });
    }
    [500, 1500, 3500].forEach((delay) => window.setTimeout(syncReactFromLegacy, delay));
    return true;
  } catch (error) {
    console.error('[zotero-import]', error);
    onStatus('Zotero aktarımı çalıştırılamadı');
    return false;
  }
}
