const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { session } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { createStorageService } = require('./src/main-process-storage.js');
const {
  buildUpdateCheckResult,
  normalizeDownloadUrl,
  applyDownloadedUpdate
} = require('./src/main-process-updater.js');
const { followRedirects, fetchJSON } = require('./src/main-process-net.js');

// â”€â”€ PATHS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const APP_DIR = path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'AcademiQ');
const storage = createStorageService({ appDir: APP_DIR });

// â”€â”€ WINDOW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let mainWindow;
const UPDATE_ALLOWED_HOSTS = [
  /^api\.github\.com$/i,
  /^github\.com$/i,
  /^raw\.githubusercontent\.com$/i,
  /^objects\.githubusercontent\.com$/i,
  /^release-assets\.githubusercontent\.com$/i,
  /^github-releases\.githubusercontent\.com$/i,
  /^codeload\.github\.com$/i
];
const NET_ALLOWED_HOSTS = [
  /^api\.crossref\.org$/i,
  /^api\.unpaywall\.org$/i,
  /^api\.semanticscholar\.org$/i,
  /^www\.semanticscholar\.org$/i,
  /^api\.openalex\.org$/i,
  /^api\.core\.ac\.uk$/i,
  /^www\.ebi\.ac\.uk$/i,
  /^eutils\.ncbi\.nlm\.nih\.gov$/i,
  /^www\.ncbi\.nlm\.nih\.gov$/i,
  /^pubmed\.ncbi\.nlm\.nih\.gov$/i,
  /^doaj\.org$/i,
  /^api\.openaire\.eu$/i,
  /^api\.datacite\.org$/i,
  /^zenodo\.org$/i,
  /^doi\.org$/i,
  /^dx\.doi\.org$/i,
  /^dergipark\.org\.tr$/i,
  /^www\.dergipark\.org\.tr$/i,
  /^europepmc\.org$/i
];

function psQuote(value) {
  return "'" + String(value || '').replace(/'/g, "''") + "'";
}

function normalizeHost(hostname) {
  return String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
}

function isBlockedHost(hostname) {
  const host = normalizeHost(hostname);
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '0.0.0.0') return true;
  if (host === '::1' || host === '[::1]') return true;
  if (host.endsWith('.local')) return true;
  return false;
}

function isSafeHttpURL(rawUrl, options = {}) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    const protocol = String(parsed.protocol || '').toLowerCase();
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    if (options.httpsOnly && protocol !== 'https:') return false;
    if (isBlockedHost(parsed.hostname)) return false;
    return true;
  } catch (_e) {
    return false;
  }
}

function normalizeRefId(refId) {
  const value = String(refId || '').trim();
  if (!value) throw new Error('Geçersiz referans kimliği');
  if (value.length > 320) throw new Error('Referans kimliği çok uzun');
  return value;
}

function safeDecodeURIComponent(value) {
  const raw = String(value || '');
  try { return decodeURIComponent(raw); } catch (_e) { return raw; }
}

function normalizeDoi(value) {
  let doi = String(value || '').trim().toLowerCase();
  if (!doi) return '';
  doi = safeDecodeURIComponent(doi);
  doi = doi.replace(/^doi:\s*/i, '');
  doi = doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
  doi = doi.replace(/\s+/g, '');
  doi = doi.replace(/[)\].,;:]+$/g, '');
  const match = doi.match(/10\.\d{4,9}\/[-._;()/:a-z0-9]+/i);
  doi = (match && match[0] ? match[0] : doi).toLowerCase();
  doi = doi
    .replace(/(?:\/|\.)(bibtex|ris|abstract|fulltext|full|pdf|xml|html|epub)$/i, '')
    .replace(/\/[a-z]$/i, '')
    .replace(/[)\].,;:]+$/g, '');
  if (!/^10\.\d{4,9}\//i.test(doi)) return '';
  return doi;
}

function textHasExpectedDoi(text, expectedDoi) {
  const expected = normalizeDoi(expectedDoi);
  if (!expected) return false;
  const hay = String(text || '').toLowerCase();
  if (!hay) return false;
  if (hay.includes(expected)) return true;
  const encoded = expected.replace(/\//g, '%2f');
  if (hay.includes(encoded)) return true;
  const escaped = expected.replace(/\//g, '\\/');
  if (hay.includes(escaped)) return true;
  return false;
}

function urlLikelyMatchesExpectedDoi(url, expectedDoi) {
  const expected = normalizeDoi(expectedDoi);
  if (!expected) return false;
  const raw = String(url || '');
  if (textHasExpectedDoi(raw, expected)) return true;
  return textHasExpectedDoi(safeDecodeURIComponent(raw), expected);
}

function urlContainsDifferentDoi(url, expectedDoi) {
  const expected = normalizeDoi(expectedDoi);
  if (!expected) return false;
  const hay = safeDecodeURIComponent(String(url || '').toLowerCase());
  const match = hay.match(/10\.\d{4,9}\/[-._;()/:a-z0-9]+/i);
  if (!match || !match[0]) return false;
  return normalizeDoi(match[0]) !== expected;
}

function bufferLikelyMatchesExpectedDoi(buffer, expectedDoi) {
  const expected = normalizeDoi(expectedDoi);
  if (!expected || !Buffer.isBuffer(buffer)) return false;
  const sampleSize = Math.min(buffer.length, 2 * 1024 * 1024);
  const sample = buffer.slice(0, sampleSize).toString('latin1');
  return textHasExpectedDoi(sample, expected);
}

function normalizeTitleText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[“”"'"`´’]/g, ' ')
    .replace(/[^a-z0-9çğıöşü\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTitleTokens(value) {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'from', 'into', 'between', 'among', 'over', 'under',
    'study', 'analysis', 'effects', 'effect', 'using', 'use', 'based', 'open', 'access',
    'bir', 've', 'ile', 'için', 'olarak', 'üzerine', 'çalışma', 'araştırma', 'etkisi'
  ]);
  const parts = normalizeTitleText(value).split(' ').filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const part of parts) {
    if (part.length < 4) continue;
    if (stop.has(part)) continue;
    if (seen.has(part)) continue;
    seen.add(part);
    out.push(part);
    if (out.length >= 8) break;
  }
  return out;
}

function bufferLikelyMatchesExpectedTitle(buffer, expectedTitle) {
  const tokens = buildTitleTokens(expectedTitle);
  if (!tokens.length || !Buffer.isBuffer(buffer)) return false;
  const sampleSize = Math.min(buffer.length, 3 * 1024 * 1024);
  const sample = normalizeTitleText(buffer.slice(0, sampleSize).toString('latin1'));
  if (!sample) return false;
  let hits = 0;
  for (const token of tokens) {
    if (sample.includes(token)) hits += 1;
  }
  if (tokens.length >= 5) return hits >= 3;
  if (tokens.length >= 3) return hits >= 2;
  return hits >= 1;
}

function extractDoiCandidates(text) {
  const out = [];
  const seen = new Set();
  const src = String(text || '');
  const re = /10\.\d{4,9}\/[-._;()/:a-z0-9]+/ig;
  let m;
  while ((m = re.exec(src))) {
    const norm = normalizeDoi(m[0]);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

function isLowSignalDiscoveryURL(url) {
  const value = String(url || '').toLowerCase();
  if (!value) return false;
  return (
    /scholar\.google/.test(value) ||
    /semanticscholar\.org\/search/.test(value) ||
    /dergipark\.org\.tr\/.*search/.test(value) ||
    /\/search\?/.test(value) ||
    /[?&]q=/.test(value)
  );
}

function sanitizeDataPayload(json) {
  if (typeof json !== 'string') throw new Error('Kayit verisi metin olmalidir');
  const maxLen = 60 * 1024 * 1024;
  if (json.length > maxLen) throw new Error('Kayit verisi cok buyuk');
  return json;
}

function sanitizePDFBuffer(buffer) {
  if (Buffer.isBuffer(buffer)) return buffer;
  if (buffer instanceof ArrayBuffer) return Buffer.from(buffer);
  if (ArrayBuffer.isView(buffer)) return Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  throw new Error('Gecersiz PDF veri formati');
}

function sanitizeDownloadOptions(input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  if (src.timeoutMs != null && Number.isFinite(Number(src.timeoutMs))) out.timeoutMs = Number(src.timeoutMs);
  if (src.maxBytes != null && Number.isFinite(Number(src.maxBytes))) out.maxBytes = Number(src.maxBytes);
  if (src.expectedDoi != null) out.expectedDoi = String(src.expectedDoi || '').slice(0, 256);
  if (src.expectedTitle != null) out.expectedTitle = String(src.expectedTitle || '').slice(0, 1024);
  if (src.requireDoiEvidence != null) out.requireDoiEvidence = !!src.requireDoiEvidence;
  return out;
}

function sanitizeNetFetchOptions(input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  if (src.timeoutMs != null && Number.isFinite(Number(src.timeoutMs))) {
    out.timeoutMs = Number(src.timeoutMs);
  }
  if (src.maxBytes != null && Number.isFinite(Number(src.maxBytes))) {
    out.maxBytes = Number(src.maxBytes);
  }
  return out;
}

function runPowerShell(command, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      {
        windowsHide: true,
        timeout: Math.max(5000, Math.min(parseInt(timeoutMs, 10) || 45000, 180000)),
        maxBuffer: 10 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          const msg = (stderr || error.message || '').toString().trim() || 'PowerShell failed';
          reject(new Error(msg));
          return;
        }
        resolve(String(stdout || '').trim());
      }
    );
  });
}

async function convertWordWithOfficeComToHtml(inputPath) {
  const inPath = path.resolve(String(inputPath || ''));
  if (!inPath || !fs.existsSync(inPath)) throw new Error('Word dosyasi bulunamadi');
  const tempHtml = path.join(app.getPath('temp'), `aq_word_import_${Date.now()}_${Math.random().toString(16).slice(2)}.html`);
  const script = [
    "$ErrorActionPreference='Stop'",
    `$inPath=${psQuote(inPath)}`,
    `$outPath=${psQuote(tempHtml)}`,
    "$word=$null",
    "$doc=$null",
    "try {",
    "  $word = New-Object -ComObject Word.Application",
    "  $word.Visible = $false",
    "  $word.DisplayAlerts = 0",
    "  $doc = $word.Documents.Open($inPath, $false, $true)",
    "  $wdFormatFilteredHTML = 10",
    "  $doc.SaveAs([ref]$outPath, [ref]$wdFormatFilteredHTML)",
    "} finally {",
    "  if($doc -ne $null){ try { $doc.Close([ref]0) } catch {} }",
    "  if($word -ne $null){ try { $word.Quit() } catch {} }",
    "}",
    "Write-Output $outPath"
  ].join(';');
  const outPath = await runPowerShell(script, 120000);
  const finalPath = outPath && fs.existsSync(outPath) ? outPath : (fs.existsSync(tempHtml) ? tempHtml : '');
  if (!finalPath) throw new Error('Office COM HTML donusumu basarisiz');
  const raw = fs.readFileSync(finalPath);
  let html = raw.toString('utf8');
  const head = html.slice(0, 2000).toLowerCase();
  if (head.includes('charset=windows-1254') || head.includes('charset=iso-8859-9')) {
    try { html = new TextDecoder('windows-1254').decode(raw); } catch (_e) {}
  }
  try { fs.unlinkSync(finalPath); } catch (_e) {}
  return html;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'AcademiQ Research',
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  // Prefer downloaded UI override so "Check update" applies immediately.
  // In development (npm start / unpackaged), always use bundled files directly.
  // Fall back to bundled UI, then legacy src/index.html.
  const bundledHtml = path.join(__dirname, 'academiq-research.html');
  const updatedHtml = path.join(storage.appDir, 'academiq-research.html');
  const fallbackHtml = path.join(__dirname, 'src', 'index.html');
  let htmlPath = fallbackHtml;
  if (app.isPackaged && fs.existsSync(updatedHtml)) {
    // Always sync JS dependencies from ASAR to AppData so updates pick up new code.
    // Use readFileSync+writeFileSync (not copyFileSync) so it works from inside ASAR archives.
    try {
      const bundleSrc = path.join(__dirname, 'tiptap-bundle.js');
      const bundleDst = path.join(storage.appDir, 'tiptap-bundle.js');
      if (fs.existsSync(bundleSrc)) fs.writeFileSync(bundleDst, fs.readFileSync(bundleSrc));
      const srcDir = path.join(__dirname, 'src');
      const dstSrcDir = path.join(storage.appDir, 'src');
      if (fs.existsSync(srcDir)) {
        try { fs.mkdirSync(dstSrcDir, { recursive: true }); } catch (_e) {}
        fs.readdirSync(srcDir).forEach(function(file) {
          try {
            fs.writeFileSync(path.join(dstSrcDir, file), fs.readFileSync(path.join(srcDir, file)));
          } catch (_e) {}
        });
      }
      const vendorDir = path.join(__dirname, 'vendor');
      const dstVendorDir = path.join(storage.appDir, 'vendor');
      if (fs.existsSync(vendorDir)) {
        try { fs.mkdirSync(dstVendorDir, { recursive: true }); } catch (_e) {}
        fs.readdirSync(vendorDir).forEach(function(file) {
          try {
            fs.writeFileSync(path.join(dstVendorDir, file), fs.readFileSync(path.join(vendorDir, file)));
          } catch (_e) {}
        });
      }
    } catch (_e) {}
    htmlPath = updatedHtml;
  } else if (fs.existsSync(bundledHtml)) htmlPath = bundledHtml;
  mainWindow.loadFile(htmlPath);

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeHttpURL(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Never navigate away from local UI inside the app window.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow && mainWindow.webContents ? mainWindow.webContents.getURL() : '';
    if (url === currentUrl) return;
    event.preventDefault();
    if (isSafeHttpURL(url)) shell.openExternal(url);
  });

  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  // Close confirmation â€” ask user if they want to save
  let forceClose = false;
  mainWindow.on('close', (e) => {
    if (forceClose) return;
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Kaydet ve Kapat', 'Kaydetmeden Kapat', 'Ä°ptal'],
      defaultId: 0,
      cancelId: 2,
      title: 'AcademiQ Research',
      message: 'DeÄŸiÅŸiklikler kaydedilsin mi?'
    });
    if (choice === 0) {
      // Save then close
      mainWindow.webContents.executeJavaScript('(async function(){try{await syncSave();}catch(e){}})()')
        .then(() => { forceClose = true; mainWindow.close(); })
        .catch(() => { forceClose = true; mainWindow.close(); });
    } else if (choice === 1) {
      // Close without saving
      forceClose = true;
      mainWindow.close();
    }
    // choice === 2: Cancel â€” do nothing
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });
  });

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    try {
      session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
        callback(permission === 'clipboard-sanitized-write');
      });
    } catch (_e) {}
    storage.loadSettings();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// â”€â”€ IPC: DATA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('data:load', async () => {
  try { return storage.loadData(); } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('data:save', async (_ev, json) => {
  try { return storage.saveData(sanitizeDataPayload(json)); } catch (e) { return { ok: false, error: e.message }; }
});

// â”€â”€ IPC: PDF FILES (dual-write: local cache + sync folder) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('pdf:save', async (_ev, refId, buffer) => {
  try {
    normalizeRefId(refId);
    const pdfBuffer = sanitizePDFBuffer(buffer);
    if (pdfBuffer.length > 150 * 1024 * 1024) throw new Error('PDF dosyasi cok buyuk');
    return storage.savePDF(refId, pdfBuffer);
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('pdf:load', async (_ev, refId) => {
  try {
    normalizeRefId(refId);
    return storage.loadPDF(refId);
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('pdf:exists', async (_ev, refId) => {
  try {
    normalizeRefId(refId);
    return storage.pdfExists(refId);
  } catch (_e) {
    return false;
  }
});

ipcMain.handle('pdf:delete', async (_ev, refId) => {
  try {
    normalizeRefId(refId);
    return storage.deletePDF(refId);
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('pdf:syncAll', async () => storage.syncAllPDFs());

ipcMain.handle('pdf:download', async (_ev, url, refId, options = {}) => {
  if (!isSafeHttpURL(url)) return { ok: false, error: 'Geçersiz veya güvenli olmayan URL' };
  try { normalizeRefId(refId); } catch (e) { return { ok: false, error: e.message }; }
  const safeOptions = sanitizeDownloadOptions(options);
  const expectedDoi = normalizeDoi(safeOptions.expectedDoi || '');
  const expectedTitle = String(safeOptions.expectedTitle || '').trim();
  const requireDoiEvidence = expectedDoi ? (safeOptions.requireDoiEvidence !== false) : false;
  function extractPdfCandidatesFromHTML(html, baseUrl) {
    const out = [];
    const seen = new Set();
    if (!html || typeof html !== 'string') return out;
    function pushCandidate(link) {
      try {
        if (!link || typeof link !== 'string') return;
        const normalized = new URL(link, baseUrl).href;
        if (!/^https?:\/\//i.test(normalized)) return;
        if (seen.has(normalized)) return;
        seen.add(normalized);
        out.push(normalized);
      } catch (_e) {}
    }
    const hrefRe = /href\s*=\s*["']([^"']+)["']/ig;
    let match;
    while ((match = hrefRe.exec(html))) {
      const link = String(match[1] || '').trim();
      if (!link) continue;
      if (/\.pdf($|[?#])/i.test(link)) pushCandidate(link);
      else if (/\/pdf(\/|$|[?#])/i.test(link)) pushCandidate(link);
      else if (/download/i.test(link) && /article|paper|fulltext|file|view/i.test(link)) pushCandidate(link);
    }
    const metaPdfRe = /<meta[^>]+(?:name|property)\s*=\s*["'](?:citation_pdf_url|dc\.identifier|og:pdf|twitter:image:src)["'][^>]+content\s*=\s*["']([^"']+)["']/ig;
    while ((match = metaPdfRe.exec(html))) {
      const link = String(match[1] || '').trim();
      if (!link) continue;
      if (/\.pdf($|[?#])/i.test(link) || /\/pdf(\/|$|[?#])/i.test(link)) pushCandidate(link);
    }
    const dataPdfRe = /"(?:pdfUrl|pdf_url|citation_pdf_url)"\s*:\s*"([^"]+)"/ig;
    while ((match = dataPdfRe.exec(html))) {
      const raw = String(match[1] || '').replace(/\\\//g, '/').trim();
      if (!raw) continue;
      pushCandidate(raw);
    }
    return out;
  }
  async function fetchPdfBufferWithFallback(startUrl, timeoutMs) {
    const maxBytes = Math.max(512 * 1024, Math.min(Number(safeOptions.maxBytes) || (50 * 1024 * 1024), 150 * 1024 * 1024));
    const visited = new Set();
    function scoreCandidate(candidateUrl) {
      let score = 0;
      if (/\.pdf($|[?#])/i.test(candidateUrl)) score += 4;
      if (/\/pdf(\/|$|[?#])/i.test(candidateUrl)) score += 3;
      if (expectedDoi && urlLikelyMatchesExpectedDoi(candidateUrl, expectedDoi)) score += 8;
      if (isLowSignalDiscoveryURL(candidateUrl)) score -= 10;
      return score;
    }
    async function tryUrl(targetUrl, depth) {
      if (!targetUrl || visited.has(targetUrl) || depth > 2) return { ok: false, error: 'No PDF candidate succeeded' };
      if (!isSafeHttpURL(targetUrl)) return { ok: false, error: 'Blocked URL candidate' };
      if (isLowSignalDiscoveryURL(targetUrl)) {
        return { ok: false, error: 'Low-signal discovery URL skipped' };
      }
      visited.add(targetUrl);
      const meta = await followRedirects(targetUrl, 8, {
        timeout: timeoutMs,
        returnMeta: true,
        maxBytes,
        blockPrivate: true
      });
      const buf = meta && meta.buffer ? meta.buffer : meta;
      if (!buf || !Buffer.isBuffer(buf)) return { ok: false, error: 'Invalid response buffer' };
      if (buf.length < 100) return { ok: false, error: 'Too small: ' + buf.length + ' bytes' };
      const headerStr = buf.slice(0, 4096).toString('ascii');
      const pdfIdx = headerStr.indexOf('%PDF-');
      const finalUrl = (meta && meta.finalUrl) || targetUrl;
      if (pdfIdx >= 0) {
        const pdfBuffer = pdfIdx > 0 ? buf.slice(pdfIdx) : buf;
        if (expectedDoi || expectedTitle) {
          const sampleSize = Math.min(pdfBuffer.length, 3 * 1024 * 1024);
          const sample = pdfBuffer.slice(0, sampleSize).toString('latin1');
          if (expectedDoi) {
            const doiInUrl = urlLikelyMatchesExpectedDoi(finalUrl, expectedDoi) || urlLikelyMatchesExpectedDoi(targetUrl, expectedDoi);
            const doiInBody = bufferLikelyMatchesExpectedDoi(pdfBuffer, expectedDoi);
            const doiCandidates = extractDoiCandidates(sample);
            const hasDifferentDoi = doiCandidates.length > 0 && !doiCandidates.includes(expectedDoi);
            if (hasDifferentDoi) {
              return { ok: false, error: 'PDF DOI mismatch (different DOI found)' };
            }
            if (!doiInBody && !doiInUrl) {
              if (requireDoiEvidence) {
                return { ok: false, error: 'PDF DOI kanıtı yok' };
              }
              if (!(expectedTitle && bufferLikelyMatchesExpectedTitle(pdfBuffer, expectedTitle))) {
                return { ok: false, error: 'PDF DOI mismatch' };
              }
            }
          } else if (expectedTitle && !bufferLikelyMatchesExpectedTitle(pdfBuffer, expectedTitle)) {
            return { ok: false, error: 'PDF title mismatch' };
          }
        }
        return { ok: true, buffer: pdfBuffer, finalUrl };
      }
      const isHTML = headerStr.toLowerCase().includes('<html') || headerStr.toLowerCase().includes('<!doctype');
      if (!isHTML) {
        return { ok: false, error: 'No PDF header found in first 4096 bytes' };
      }
      const html = buf.slice(0, Math.min(buf.length, 300000)).toString('utf8');
      if (expectedDoi) {
        if (!textHasExpectedDoi(html, expectedDoi) && !urlLikelyMatchesExpectedDoi(finalUrl, expectedDoi)) {
          return { ok: false, error: 'Landing page DOI mismatch' };
        }
      }
      const candidates = extractPdfCandidatesFromHTML(html, finalUrl)
        .filter(candidate => isSafeHttpURL(candidate))
        .filter(candidate => !isLowSignalDiscoveryURL(candidate))
        .filter(candidate => !(expectedDoi && urlContainsDifferentDoi(candidate, expectedDoi)))
        .filter(candidate => !(expectedDoi && !urlLikelyMatchesExpectedDoi(candidate, expectedDoi) && !/\/pdf(\/|$|[?#])|\.pdf($|[?#])/i.test(candidate)))
        .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))
        .slice(0, 10);
      for (const cand of candidates) {
        const tried = await tryUrl(cand, depth + 1);
        if (tried && tried.ok) return tried;
      }
      return { ok: false, error: 'HTML page, no PDF link candidate' };
    }
    return tryUrl(startUrl, 0);
  }
  try {
    const timeoutMs = Math.max(5000, Math.min(Number(safeOptions.timeoutMs) || 30000, 90000));
    const fetched = await fetchPdfBufferWithFallback(url, timeoutMs);
    if (!fetched || !fetched.ok || !fetched.buffer) {
      return { ok: false, error: (fetched && fetched.error) ? fetched.error : 'PDF download failed' };
    }
    const pdfBuf = fetched.buffer;
    storage.savePDF(refId, pdfBuf);
    return { ok: true, size: pdfBuf.length };
  } catch (e) { return { ok: false, error: e.message }; }
});

// â”€â”€ IPC: DIALOG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('dialog:openPDF', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'PDF Dosyasi Sec',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile', 'multiSelections']
  });
  if (result.canceled || !result.filePaths.length) return { ok: false };
  const files = [];
  for (const fp of result.filePaths) {
    if (!/\.pdf$/i.test(fp)) continue;
    const stat = fs.statSync(fp);
    if (!stat.isFile()) continue;
    if (stat.size > 120 * 1024 * 1024) continue;
    const buf = fs.readFileSync(fp);
    files.push({
      name: path.basename(fp),
      buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    });
  }
  return { ok: true, files };
});

ipcMain.handle('word:toHtml', async (_ev, filePath) => {
  try {
    const resolved = path.resolve(String(filePath || ''));
    if (!/\.(docx?|rtf)$/i.test(resolved)) return { ok: false, error: 'Desteklenmeyen dosya türü (.doc/.docx/.rtf gerekli)' };
    if (!fs.existsSync(resolved)) return { ok: false, error: 'Dosya bulunamadı' };
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) return { ok: false, error: 'Dosya okunamadı' };
    if (stat.size > 40 * 1024 * 1024) return { ok: false, error: 'Dosya çok büyük' };
    const html = await convertWordWithOfficeComToHtml(resolved);
    return { ok: true, html };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('net:fetch-json', async (_ev, url, options = {}) => {
  if (!isSafeHttpURL(url)) return { ok: false, error: 'Geçersiz veya güvenli olmayan URL' };
  try {
    const safeOptions = sanitizeNetFetchOptions(options);
    const timeout = Math.max(2500, Math.min(parseInt(safeOptions.timeoutMs, 10) || 8000, 30000));
    const data = await fetchJSON(url, {
      timeout,
      blockPrivate: true,
      allowedHosts: NET_ALLOWED_HOSTS
    });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle('net:fetch-text', async (_ev, url, options = {}) => {
  if (!isSafeHttpURL(url)) return { ok: false, error: 'Geçersiz veya güvenli olmayan URL' };
  try {
    const safeOptions = sanitizeNetFetchOptions(options);
    const timeout = Math.max(2500, Math.min(parseInt(safeOptions.timeoutMs, 10) || 8000, 30000));
    const maxBytes = Math.max(32 * 1024, Math.min(parseInt(safeOptions.maxBytes, 10) || (4 * 1024 * 1024), 12 * 1024 * 1024));
    const meta = await followRedirects(url, 6, {
      timeout,
      maxBytes,
      returnMeta: true,
      blockPrivate: true,
      allowedHosts: NET_ALLOWED_HOSTS,
      headers: {
        'User-Agent': 'AcademiQ/1.0 (academic research tool)',
        'Accept': 'text/html,application/xhtml+xml,application/xml,text/plain,*/*'
      }
    });
    const buf = meta && meta.buffer ? meta.buffer : meta;
    const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : '';
    return { ok: true, text, finalUrl: meta && meta.finalUrl ? String(meta.finalUrl) : String(url) };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle('export:pdf', async (event, options = {}) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (!win) return { ok: false, error: 'Pencere bulunamadi' };
    const saveResult = await dialog.showSaveDialog(win, {
      title: 'PDF Olarak Kaydet',
      defaultPath: String(options.defaultPath || 'makale.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (saveResult.canceled || !saveResult.filePath) return { ok: false, canceled: true };
    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape: false,
      preferCSSPageSize: true,
      margins: { top: 0, right: 0, bottom: 0, left: 0 }
    });
    fs.writeFileSync(saveResult.filePath, pdfBuffer);
    return { ok: true, filePath: saveResult.filePath, size: pdfBuffer.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// â”€â”€ IPC: SYNC SETTINGS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('sync:getSettings', async () => {
  return storage.getSyncSettings();
});

ipcMain.handle('sync:setSyncDir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Sync Klasoru Sec (OneDrive, Proton Drive, Google Drive vb.)',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) return { ok: false };
  try {
    return storage.setSyncDir(result.filePaths[0]);
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('sync:clearSyncDir', async () => {
  return storage.clearSyncDir();
});

// â”€â”€ IPC: APP INFO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const APP_VERSION = require('./package.json').version;
const UPDATE_URL = 'https://api.github.com/repos/cyrenard/academiq-research/releases/latest';

ipcMain.handle('app:getInfo', async () => {
  return storage.getAppInfo(APP_VERSION);
});

// â”€â”€ IPC: AUTO-UPDATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('update:check', async () => {
  const checkUrl = storage.getSettingsSnapshot().updateUrl || UPDATE_URL;
  try {
    const data = await fetchJSON(checkUrl, {
      blockPrivate: true,
      allowedHosts: UPDATE_ALLOWED_HOSTS
    });
    return buildUpdateCheckResult(data, APP_VERSION);
  } catch (e) {
    return { available: false, current: APP_VERSION, error: e.message };
  }
});

ipcMain.handle('update:download', async (_ev, origUrl) => {
  try {
    if (!origUrl) return { ok: false, error: 'No URL' };
    if (!/^https:\/\/(raw\.githubusercontent\.com\/cyrenard|github\.com\/cyrenard|api\.github\.com\/repos\/cyrenard)\//i.test(origUrl)) {
      return { ok: false, error: 'Güncelleme yalnızca github.com/cyrenard adresinden yapılabilir' };
    }
    const url = normalizeDownloadUrl(origUrl);
    console.log('[UPDATE] Downloading from:', url, '(original:', origUrl, ')');
    const buf = await followRedirects(url, 8, {
      blockPrivate: true,
      allowedHosts: UPDATE_ALLOWED_HOSTS,
      maxBytes: 200 * 1024 * 1024,
      timeout: 45000
    });
    if (!buf || buf.length < 100) return { ok: false, error: 'Empty download (' + (buf ? buf.length : 0) + ' bytes)' };
    return applyDownloadedUpdate({
      appDir: APP_DIR,
      dirname: __dirname,
      url,
      buffer: buf,
      isPackaged: app.isPackaged,
      fetchBuffer: followRedirects
    });
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('update:setUrl', async (_ev, url) => {
  if (url && !/^https:\/\/api\.github\.com\//i.test(url)) {
    return { ok: false, error: 'Güncelleme URL\'si https://api.github.com/ ile başlamalı' };
  }
  return storage.setUpdateUrl(url);
});

ipcMain.handle('update:restart', async () => {
  app.relaunch();
  app.exit(0);
});





