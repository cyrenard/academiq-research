// Local OCR service (Tesseract.js) — replaces the previous AI-based OCR.
// Runs entirely in the main process, offline after first language-data download.
// Language data is cached under <userData>/tesseract-cache so it survives restarts.

const path = require('path');
const fs = require('fs');

let _tesseract = null;
function loadTesseract() {
  if (_tesseract) return _tesseract;
  try {
    _tesseract = require('tesseract.js');
  } catch (e) {
    _tesseract = null;
    throw Object.assign(new Error('tesseract.js yuklu degil: ' + (e && e.message ? e.message : e)), { code: 'OCR_MODULE_MISSING' });
  }
  return _tesseract;
}

function createLocalOcr(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const appDir = typeof opts.appDir === 'string' && opts.appDir ? opts.appDir : process.cwd();
  const cacheDir = path.join(appDir, 'tesseract-cache');
  try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (_e) {}

  // Worker lifecycle: lazy create, reuse across calls, terminate on dispose.
  let workerPromise = null;
  let activeLangs = '';

  async function getWorker(langs) {
    const wantedLangs = (typeof langs === 'string' && langs.trim()) ? langs.trim() : 'tur+eng';
    if (workerPromise && activeLangs === wantedLangs) return workerPromise;

    if (workerPromise) {
      // Lang changed — dispose old worker.
      try {
        const old = await workerPromise;
        if (old && typeof old.terminate === 'function') await old.terminate();
      } catch (_e) {}
      workerPromise = null;
    }

    const tess = loadTesseract();
    activeLangs = wantedLangs;
    workerPromise = (async () => {
      const worker = await tess.createWorker(wantedLangs, 1, {
        cachePath: cacheDir,
        // Silence tesseract's progress/log noise in production logs.
        logger: () => {}
      });
      return worker;
    })().catch((err) => {
      workerPromise = null;
      activeLangs = '';
      throw err;
    });

    return workerPromise;
  }

  async function recognize(payload) {
    const p = payload && typeof payload === 'object' ? payload : {};
    const imageDataUrl = typeof p.imageDataUrl === 'string' ? p.imageDataUrl : '';
    if (!imageDataUrl) {
      return { ok: false, code: 'OCR_NO_IMAGE', message: 'Resim verisi yok' };
    }
    const langs = typeof p.lang === 'string' && p.lang.trim() ? p.lang.trim() : 'tur+eng';
    try {
      const worker = await getWorker(langs);
      // Tesseract accepts data URLs, Buffers, file paths, HTMLCanvas etc. in browser.
      // In Node we must convert the data URL to a Buffer.
      let input = imageDataUrl;
      const m = /^data:([^;,]+);base64,(.+)$/i.exec(imageDataUrl);
      if (m) {
        try { input = Buffer.from(m[2], 'base64'); } catch (_e) { /* keep data URL as fallback */ }
      }
      const { data } = await worker.recognize(input);
      const text = data && typeof data.text === 'string' ? data.text : '';
      return { ok: true, text: text, lang: langs };
    } catch (e) {
      const message = e && e.message ? String(e.message) : 'OCR hatasi';
      const code = e && e.code ? String(e.code) : 'OCR_FAILED';
      return { ok: false, code: code, message: message };
    }
  }

  async function dispose() {
    if (!workerPromise) return;
    try {
      const worker = await workerPromise;
      if (worker && typeof worker.terminate === 'function') await worker.terminate();
    } catch (_e) {}
    workerPromise = null;
    activeLangs = '';
  }

  return {
    recognize,
    dispose,
    getCacheDir: () => cacheDir
  };
}

module.exports = { createLocalOcr };
