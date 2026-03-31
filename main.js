const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
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

function psQuote(value) {
  return "'" + String(value || '').replace(/'/g, "''") + "'";
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
      sandbox: false,
      webSecurity: false   // file:// → https:// fetch için (CDN, DOI, Crossref API)
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
    // Ensure JS dependencies exist alongside the AppData HTML.
    // Use readFileSync+writeFileSync (not copyFileSync) so it works from inside ASAR archives.
    const bundleDst = path.join(storage.appDir, 'tiptap-bundle.js');
    if (!fs.existsSync(bundleDst)) {
      try {
        const bundleSrc = path.join(__dirname, 'tiptap-bundle.js');
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
      } catch (_e) {}
    }
    htmlPath = updatedHtml;
  } else if (fs.existsSync(bundledHtml)) htmlPath = bundledHtml;
  mainWindow.loadFile(htmlPath);

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
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

app.whenReady().then(() => {
  storage.loadSettings();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// â”€â”€ IPC: DATA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('data:load', async () => {
  try { return storage.loadData(); } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('data:save', async (_ev, json) => {
  try { return storage.saveData(json); } catch (e) { return { ok: false, error: e.message }; }
});

// â”€â”€ IPC: PDF FILES (dual-write: local cache + sync folder) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('pdf:save', async (_ev, refId, buffer) => {
  try { return storage.savePDF(refId, buffer); } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('pdf:load', async (_ev, refId) => {
  try { return storage.loadPDF(refId); } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('pdf:exists', async (_ev, refId) => storage.pdfExists(refId));

ipcMain.handle('pdf:delete', async (_ev, refId) => {
  try { return storage.deletePDF(refId); } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('pdf:syncAll', async () => storage.syncAllPDFs());

ipcMain.handle('pdf:download', async (_ev, url, refId, options = {}) => {
  if (!url || !/^https?:\/\//i.test(url)) return { ok: false, error: 'Geçersiz URL şeması' };
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
    const visited = new Set();
    async function tryUrl(targetUrl, depth) {
      if (!targetUrl || visited.has(targetUrl) || depth > 2) return { ok: false, error: 'No PDF candidate succeeded' };
      visited.add(targetUrl);
      const meta = await followRedirects(targetUrl, 8, { timeout: timeoutMs, returnMeta: true });
      const buf = meta && meta.buffer ? meta.buffer : meta;
      if (!buf || !Buffer.isBuffer(buf)) return { ok: false, error: 'Invalid response buffer' };
      if (buf.length < 100) return { ok: false, error: 'Too small: ' + buf.length + ' bytes' };
      const headerStr = buf.slice(0, 4096).toString('ascii');
      const pdfIdx = headerStr.indexOf('%PDF-');
      if (pdfIdx >= 0) {
        return { ok: true, buffer: pdfIdx > 0 ? buf.slice(pdfIdx) : buf };
      }
      const isHTML = headerStr.toLowerCase().includes('<html') || headerStr.toLowerCase().includes('<!doctype');
      if (!isHTML) {
        return { ok: false, error: 'No PDF header found in first 4096 bytes' };
      }
      const finalUrl = (meta && meta.finalUrl) || targetUrl;
      const html = buf.slice(0, Math.min(buf.length, 300000)).toString('utf8');
      const candidates = extractPdfCandidatesFromHTML(html, finalUrl).slice(0, 10);
      for (const cand of candidates) {
        const tried = await tryUrl(cand, depth + 1);
        if (tried && tried.ok) return tried;
      }
      return { ok: false, error: 'HTML page, no PDF link candidate' };
    }
    return tryUrl(startUrl, 0);
  }
  try {
    const timeoutMs = Math.max(5000, Math.min(Number(options.timeoutMs) || 30000, 90000));
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
    const html = await convertWordWithOfficeComToHtml(resolved);
    return { ok: true, html };
  } catch (e) {
    return { ok: false, error: e.message };
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
  return storage.setSyncDir(result.filePaths[0]);
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
    const data = await fetchJSON(checkUrl);
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
    const buf = await followRedirects(url);
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





