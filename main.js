const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

// ── PATHS ────────────────────────────────────────────────────────────────────
const APP_DIR = path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'AcademiQ');
const SETTINGS_FILE = path.join(APP_DIR, 'settings.json');
const LOCAL_PDF_DIR = path.join(APP_DIR, 'pdfs');

// Ensure dirs exist
[APP_DIR, LOCAL_PDF_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── SETTINGS ─────────────────────────────────────────────────────────────────
let settings = { syncDir: '', theme: 'dark' };

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch (e) { console.warn('Settings load error:', e); }
}

function saveSettings() {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch (e) {}
}

function getSyncDataPath() {
  if (settings.syncDir) {
    const dir = path.join(settings.syncDir, 'AcademiQ');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'academiq-data.json');
  }
  return path.join(APP_DIR, 'academiq-data.json');
}

function getSyncPDFDir() {
  if (settings.syncDir) {
    const dir = path.join(settings.syncDir, 'AcademiQ', 'pdfs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  return LOCAL_PDF_DIR;
}

// ── WINDOW ───────────────────────────────────────────────────────────────────
let mainWindow;

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
      webSecurity: false   // PDF fetch CORS bypass
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  loadSettings();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ── IPC: DATA ────────────────────────────────────────────────────────────────
ipcMain.handle('data:load', async () => {
  try {
    const fp = getSyncDataPath();
    if (fs.existsSync(fp)) {
      const data = fs.readFileSync(fp, 'utf8');
      return { ok: true, data, dir: settings.syncDir || 'Yerel' };
    }
    return { ok: true, data: null, dir: settings.syncDir || 'Yerel' };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('data:save', async (_ev, json) => {
  try {
    const fp = getSyncDataPath();
    // Write atomic: temp → rename
    const tmp = fp + '.tmp';
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, fp);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ── IPC: PDF FILES (dual-write: local cache + sync folder) ──────────────────
ipcMain.handle('pdf:save', async (_ev, refId, buffer) => {
  try {
    const buf = Buffer.from(buffer);
    const localFp = path.join(LOCAL_PDF_DIR, refId + '.pdf');
    fs.writeFileSync(localFp, buf);
    if (settings.syncDir) {
      const syncFp = path.join(getSyncPDFDir(), refId + '.pdf');
      try { fs.writeFileSync(syncFp, buf); } catch (e) { console.warn('Sync PDF write failed:', e.message); }
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('pdf:load', async (_ev, refId) => {
  try {
    const localFp = path.join(LOCAL_PDF_DIR, refId + '.pdf');
    if (fs.existsSync(localFp)) {
      const buf = fs.readFileSync(localFp);
      return { ok: true, buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    }
    // Fallback: sync folder → lazy copy to local
    if (settings.syncDir) {
      const syncFp = path.join(getSyncPDFDir(), refId + '.pdf');
      if (fs.existsSync(syncFp)) {
        const buf = fs.readFileSync(syncFp);
        try { fs.writeFileSync(localFp, buf); } catch (e) {}
        return { ok: true, buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
      }
    }
    return { ok: false, error: 'not found' };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('pdf:exists', async (_ev, refId) => {
  const localFp = path.join(LOCAL_PDF_DIR, refId + '.pdf');
  if (fs.existsSync(localFp)) return true;
  if (settings.syncDir) {
    const syncFp = path.join(getSyncPDFDir(), refId + '.pdf');
    return fs.existsSync(syncFp);
  }
  return false;
});

ipcMain.handle('pdf:delete', async (_ev, refId) => {
  try {
    const localFp = path.join(LOCAL_PDF_DIR, refId + '.pdf');
    if (fs.existsSync(localFp)) fs.unlinkSync(localFp);
    if (settings.syncDir) {
      const syncFp = path.join(getSyncPDFDir(), refId + '.pdf');
      if (fs.existsSync(syncFp)) fs.unlinkSync(syncFp);
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('pdf:syncAll', async () => {
  if (!settings.syncDir) return { ok: false, error: 'No sync dir' };
  const syncDir = getSyncPDFDir();
  let copied = 0;
  const syncFiles = fs.existsSync(syncDir) ? fs.readdirSync(syncDir).filter(f => f.endsWith('.pdf')) : [];
  for (const f of syncFiles) {
    const localFp = path.join(LOCAL_PDF_DIR, f);
    if (!fs.existsSync(localFp)) { fs.copyFileSync(path.join(syncDir, f), localFp); copied++; }
  }
  const localFiles = fs.readdirSync(LOCAL_PDF_DIR).filter(f => f.endsWith('.pdf'));
  for (const f of localFiles) {
    const syncFp = path.join(syncDir, f);
    if (!fs.existsSync(syncFp)) { fs.copyFileSync(path.join(LOCAL_PDF_DIR, f), syncFp); copied++; }
  }
  return { ok: true, copied };
});

// ── IPC: PDF DOWNLOAD (CORS BYPASS) ─────────────────────────────────────────
function followRedirects(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'AcademiQ/1.0 (academic research tool)',
        'Accept': 'application/pdf,*/*'
      },
      timeout: 30000
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const loc = res.headers.location;
        if (!loc) return reject(new Error('Redirect without location'));
        const next = loc.startsWith('http') ? loc : new URL(loc, url).href;
        followRedirects(next, maxRedirects - 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

ipcMain.handle('pdf:download', async (_ev, url, refId) => {
  try {
    const buf = await followRedirects(url);
    if (buf.length < 100) return { ok: false, error: 'Too small: ' + buf.length + ' bytes' };
    const headerStr = buf.slice(0, 1024).toString('ascii');
    const pdfIdx = headerStr.indexOf('%PDF-');
    if (pdfIdx < 0 || pdfIdx > 64) {
      const isHTML = headerStr.toLowerCase().includes('<html') || headerStr.toLowerCase().includes('<!doctype');
      return { ok: false, error: isHTML ? 'HTML page, not PDF' : 'No PDF header in first 64 bytes' };
    }
    const pdfBuf = pdfIdx > 0 ? buf.slice(pdfIdx) : buf;
    // Write to local cache
    const localFp = path.join(LOCAL_PDF_DIR, refId + '.pdf');
    fs.writeFileSync(localFp, pdfBuf);
    // Also write to sync folder
    if (settings.syncDir) {
      const syncFp = path.join(getSyncPDFDir(), refId + '.pdf');
      try { fs.writeFileSync(syncFp, pdfBuf); } catch (e) { console.warn('Sync PDF write failed:', e.message); }
    }
    return { ok: true, size: pdfBuf.length };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ── IPC: DIALOG ──────────────────────────────────────────────────────────────
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

// ── IPC: SYNC SETTINGS ──────────────────────────────────────────────────────
ipcMain.handle('sync:getSettings', async () => {
  return { syncDir: settings.syncDir || '' };
});

ipcMain.handle('sync:setSyncDir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Sync Klasoru Sec (OneDrive, Proton Drive, Google Drive vb.)',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) return { ok: false };

  // Migrate: sync ↔ local smart merge
  const oldPath = getSyncDataPath();
  settings.syncDir = result.filePaths[0];
  saveSettings();
  const newPath = getSyncDataPath();

  if (oldPath !== newPath) {
    const localExists = fs.existsSync(oldPath);
    const syncExists = fs.existsSync(newPath);

    if (localExists && !syncExists) {
      // First computer: copy local → sync
      try { fs.copyFileSync(oldPath, newPath); } catch (e) {}
    } else if (syncExists && !localExists) {
      // Second computer: copy sync → local (cache)
      try { fs.copyFileSync(newPath, oldPath); } catch (e) {}
    } else if (localExists && syncExists) {
      // Both exist: keep the newer one, backup the older
      try {
        const localStat = fs.statSync(oldPath);
        const syncStat = fs.statSync(newPath);
        if (localStat.mtimeMs > syncStat.mtimeMs) {
          fs.copyFileSync(newPath, newPath + '.bak');
          fs.copyFileSync(oldPath, newPath);
        } else {
          fs.copyFileSync(oldPath, oldPath + '.bak');
          fs.copyFileSync(newPath, oldPath);
        }
      } catch (e) {}
    }
  }

  // Auto-sync PDFs
  try {
    const syncPdfDir = getSyncPDFDir();
    const syncFiles = fs.existsSync(syncPdfDir) ? fs.readdirSync(syncPdfDir).filter(f => f.endsWith('.pdf')) : [];
    for (const f of syncFiles) {
      const localFp = path.join(LOCAL_PDF_DIR, f);
      if (!fs.existsSync(localFp)) fs.copyFileSync(path.join(syncPdfDir, f), localFp);
    }
    const localFiles = fs.readdirSync(LOCAL_PDF_DIR).filter(f => f.endsWith('.pdf'));
    for (const f of localFiles) {
      const syncFp = path.join(syncPdfDir, f);
      if (!fs.existsSync(syncFp)) fs.copyFileSync(path.join(LOCAL_PDF_DIR, f), syncFp);
    }
  } catch (e) { console.warn('PDF sync error:', e.message); }

  return { ok: true, dir: settings.syncDir };
});

ipcMain.handle('sync:clearSyncDir', async () => {
  settings.syncDir = '';
  saveSettings();
  return { ok: true };
});

// ── IPC: APP INFO ────────────────────────────────────────────────────────────
const APP_VERSION = '2.0.0';
const UPDATE_URL = 'https://api.github.com/repos/cyrenard/academiq-research/releases/latest';

ipcMain.handle('app:getInfo', async () => {
  return {
    version: APP_VERSION,
    appDir: APP_DIR,
    syncDir: settings.syncDir || '',
    pdfDir: LOCAL_PDF_DIR,
    pdfCount: fs.readdirSync(LOCAL_PDF_DIR).filter(f => f.endsWith('.pdf')).length
  };
});

// ── IPC: AUTO-UPDATE ────────────────────────────────────────────────────────
ipcMain.handle('update:check', async () => {
  const checkUrl = settings.updateUrl || UPDATE_URL;
  try {
    const data = await fetchJSON(checkUrl);
    if (!data || !data.tag_name) return { available: false, current: APP_VERSION };
    const remote = data.tag_name.replace(/^v/, '');
    const available = compareVersions(remote, APP_VERSION) > 0;
    let htmlAsset = null;
    if (data.assets && data.assets.length) {
      htmlAsset = data.assets.find(a => a.name && a.name.endsWith('.html'));
      if (!htmlAsset) htmlAsset = data.assets.find(a => a.name && a.name.endsWith('.zip'));
    }
    return {
      available,
      current: APP_VERSION,
      remote,
      notes: data.body || '',
      downloadUrl: htmlAsset ? htmlAsset.browser_download_url : (data.html_url || ''),
      publishedAt: data.published_at || ''
    };
  } catch (e) {
    return { available: false, current: APP_VERSION, error: e.message };
  }
});

ipcMain.handle('update:download', async (_ev, url) => {
  try {
    if (!url) return { ok: false, error: 'No URL' };
    const buf = await followRedirects(url);
    if (!buf || buf.length < 100) return { ok: false, error: 'Empty download' };

    const fileName = url.split('/').pop() || 'update';

    if (fileName.endsWith('.html')) {
      const target = path.join(APP_DIR, 'src', 'index.html');
      const backup = target + '.bak';
      const targetDir = path.dirname(target);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      if (fs.existsSync(target)) fs.copyFileSync(target, backup);
      fs.writeFileSync(target, buf);
      return { ok: true, type: 'html', restart: true };
    } else if (fileName.endsWith('.zip')) {
      const zipPath = path.join(APP_DIR, 'update.zip');
      fs.writeFileSync(zipPath, buf);
      return { ok: true, type: 'zip', path: zipPath, restart: true };
    } else {
      return { ok: false, error: 'Unknown file type: ' + fileName };
    }
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('update:setUrl', async (_ev, url) => {
  settings.updateUrl = url || '';
  saveSettings();
  return { ok: true };
});

ipcMain.handle('update:restart', async () => {
  app.relaunch();
  app.exit(0);
});

// Helper: fetch JSON
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, {
      headers: { 'User-Agent': 'AcademiQ-Updater/1.0', 'Accept': 'application/json' },
      timeout: 15000
    }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        const loc = res.headers.location;
        if (loc) return fetchJSON(loc).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

// Helper: compare semver
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}
