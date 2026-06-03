import {
  importBibliographyFileObject,
  importWordFileObject,
  importZoteroFileObject,
  insertImageFileObject,
  readFileAsText,
  importWordFileByPath,
  importBibliographyFileByPath,
  insertImageFileByPath
} from './file-import';
import { syncReactFromLegacy } from './legacy-dom-helpers';
import { legacyWin } from './legacy-window';

type StatusFn = (message: string) => void;

export type DroppedFileKind = 'pdf' | 'word' | 'image' | 'bibliography' | 'zotero' | 'unknown';

export function droppedFileKind(file: File): DroppedFileKind {
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  if (name.endsWith('.pdf') || type === 'application/pdf') return 'pdf';
  if (/\.(docx?|html?|rtf)$/i.test(name)) return 'word';
  if (/\.(bib|ris|enw|apa)$/i.test(name)) return 'bibliography';
  if (/\.(json|rdf)$/i.test(name)) return 'zotero';
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) return 'image';
  if (name.endsWith('.txt')) return 'word';
  return 'unknown';
}

async function classifyTextFile(file: File): Promise<DroppedFileKind> {
  if (!String(file.name || '').toLowerCase().endsWith('.txt')) return droppedFileKind(file);
  try {
    const sample = (await readFileAsText(file)).slice(0, 4096);
    if (/@\w+\s*\{|(^|\n)\s*TY\s*-/i.test(sample)) return 'bibliography';
    if (/^\s*[A-Z][A-Za-z-]+,\s+[A-Z]/m.test(sample) && /\(\d{4}\)/.test(sample)) return 'bibliography';
  } catch (_error) {}
  return 'word';
}

function importPdfFiles(files: File[], onStatus: StatusFn) {
  const win = legacyWin() as any;
  if (typeof win.hPDFs !== 'function') {
    onStatus('PDF içe aktarma hazır değil');
    return;
  }
  try {
    win.hPDFs({ target: { files, value: '' } });
    [500, 1500, 3500].forEach((delay) => window.setTimeout(syncReactFromLegacy, delay));
    onStatus(`${files.length} PDF içe aktarılıyor`);
  } catch (error) {
    console.error('[drop-router:pdf]', error);
    onStatus('PDF drop içe aktarılamadı');
  }
}

export async function handleDroppedFiles(files: File[], onStatus: StatusFn) {
  const list = files.filter(Boolean);
  if (!list.length) return false;

  const buckets: Record<DroppedFileKind, File[]> = {
    pdf: [],
    word: [],
    image: [],
    bibliography: [],
    zotero: [],
    unknown: []
  };

  for (const file of list) {
    buckets[await classifyTextFile(file)].push(file);
  }

  if (buckets.pdf.length) importPdfFiles(buckets.pdf, onStatus);
  for (const file of buckets.bibliography) await importBibliographyFileObject(file, onStatus);
  for (const file of buckets.zotero) importZoteroFileObject(file, onStatus);
  for (const file of buckets.word) await importWordFileObject(file, onStatus);
  for (const file of buckets.image) await insertImageFileObject(file, onStatus);

  if (buckets.unknown.length) {
    onStatus(`${buckets.unknown.length} dosya türü desteklenmiyor`);
  } else {
    onStatus(`${list.length} dosya işlendi`);
  }
  return true;
}

export async function handleTauriDroppedPaths(paths: string[], onStatus: StatusFn): Promise<boolean> {
  const list = paths.filter(Boolean);
  if (!list.length) return false;

  let pdfCount = 0;
  for (const filePath of list) {
    const name = filePath.toLowerCase();
    if (name.endsWith('.pdf')) {
      const win = legacyWin() as any;
      if (typeof window.electronAPI?.pdf?.ingest === 'function') {
        try {
          await window.electronAPI.pdf.ingest(filePath);
          pdfCount++;
        } catch (error) {
          console.error('[tauri-drop:pdf]', error);
        }
      } else if (typeof win.hPDFs === 'function') {
        onStatus('PDF ingest servisi hazır değil');
      }
    } else if (/\.(docx?|html?|rtf|txt)$/i.test(name)) {
      await importWordFileByPath(filePath, onStatus);
    } else if (/\.(bib|ris|enw|apa)$/i.test(name)) {
      await importBibliographyFileByPath(filePath, onStatus);
    } else if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) {
      await insertImageFileByPath(filePath, onStatus);
    } else {
      onStatus(`Dosya türü desteklenmiyor: ${filePath.split(/[/\\]/).pop()}`);
    }
  }

  if (pdfCount > 0) {
    [500, 1500, 3500].forEach((delay) => window.setTimeout(syncReactFromLegacy, delay));
    onStatus(`${pdfCount} PDF kütüphaneye eklendi`);
  }

  return true;
}
