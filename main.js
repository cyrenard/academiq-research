const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
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
  // Prefer downloaded UI override so "Check update" applies immediately.
  // Fall back to bundled UI, then legacy src/index.html.
  const bundledHtml = path.join(__dirname, 'academiq-research.html');
  const updatedHtml = path.join(storage.appDir, 'academiq-research.html');
  const fallbackHtml = path.join(__dirname, 'src', 'index.html');
  let htmlPath = fallbackHtml;
  if (fs.existsSync(updatedHtml)) htmlPath = updatedHtml;
  else if (fs.existsSync(bundledHtml)) htmlPath = bundledHtml;
  mainWindow.loadFile(htmlPath);

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
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
  return storage.setUpdateUrl(url);
});

ipcMain.handle('update:restart', async () => {
  app.relaunch();
  app.exit(0);
});





