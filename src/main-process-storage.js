const path = require('path');
const fs = require('fs');

function createStorageService(options) {
  const appDir = options.appDir;
  const settingsFile = path.join(appDir, 'settings.json');
  const localPdfDir = path.join(appDir, 'pdfs');
  let settings = { syncDir: '', theme: '' };

  ensureDir(appDir);
  ensureDir(localPdfDir);

  function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  function loadSettings() {
    try {
      if (fs.existsSync(settingsFile)) {
        settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      }
    } catch (e) {
      console.warn('Settings load error:', e);
    }
    return settings;
  }

  function saveSettings() {
    try { fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2)); } catch (e) {}
  }

  function getSettingsSnapshot() {
    return Object.assign({}, settings);
  }

  function getSyncDataPath() {
    if (settings.syncDir) {
      const dir = path.join(settings.syncDir, 'AcademiQ');
      ensureDir(dir);
      return path.join(dir, 'academiq-data.json');
    }
    return path.join(appDir, 'academiq-data.json');
  }

  function getSyncPDFDir() {
    if (settings.syncDir) {
      const dir = path.join(settings.syncDir, 'AcademiQ', 'pdfs');
      ensureDir(dir);
      return dir;
    }
    return localPdfDir;
  }

  function loadData() {
    const fp = getSyncDataPath();
    const bak = fp + '.bak';
    if (fs.existsSync(fp)) {
      const data = fs.readFileSync(fp, 'utf8');
      if (data && data.trim()) return { ok: true, data, dir: settings.syncDir || 'Yerel' };
    }
    if (fs.existsSync(bak)) {
      const data = fs.readFileSync(bak, 'utf8');
      if (data && data.trim()) return { ok: true, data, dir: settings.syncDir || 'Yerel', restoredFromBackup: true };
    }
    return { ok: true, data: null, dir: settings.syncDir || 'Yerel' };
  }

  function saveData(json) {
    const fp = getSyncDataPath();
    const bak = fp + '.bak';
    const tmp = fp + '.tmp';
    if (fs.existsSync(fp)) {
      try { fs.copyFileSync(fp, bak); } catch (e) {}
    }
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, fp);
    return { ok: true };
  }

  function savePDF(refId, buffer) {
    const buf = Buffer.from(buffer);
    const localFp = path.join(localPdfDir, refId + '.pdf');
    fs.writeFileSync(localFp, buf);
    if (settings.syncDir) {
      const syncFp = path.join(getSyncPDFDir(), refId + '.pdf');
      try { fs.writeFileSync(syncFp, buf); } catch (e) { console.warn('Sync PDF write failed:', e.message); }
    }
    return { ok: true };
  }

  function loadPDF(refId) {
    const localFp = path.join(localPdfDir, refId + '.pdf');
    if (fs.existsSync(localFp)) {
      const buf = fs.readFileSync(localFp);
      return { ok: true, buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    }
    if (settings.syncDir) {
      const syncFp = path.join(getSyncPDFDir(), refId + '.pdf');
      if (fs.existsSync(syncFp)) {
        const buf = fs.readFileSync(syncFp);
        try { fs.writeFileSync(localFp, buf); } catch (e) {}
        return { ok: true, buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
      }
    }
    return { ok: false, error: 'not found' };
  }

  function pdfExists(refId) {
    const localFp = path.join(localPdfDir, refId + '.pdf');
    if (fs.existsSync(localFp)) return true;
    if (settings.syncDir) return fs.existsSync(path.join(getSyncPDFDir(), refId + '.pdf'));
    return false;
  }

  function deletePDF(refId) {
    const localFp = path.join(localPdfDir, refId + '.pdf');
    if (fs.existsSync(localFp)) fs.unlinkSync(localFp);
    if (settings.syncDir) {
      const syncFp = path.join(getSyncPDFDir(), refId + '.pdf');
      if (fs.existsSync(syncFp)) fs.unlinkSync(syncFp);
    }
    return { ok: true };
  }

  function syncAllPDFs() {
    if (!settings.syncDir) return { ok: false, error: 'No sync dir' };
    const syncDir = getSyncPDFDir();
    let copied = 0;
    const syncFiles = fs.existsSync(syncDir) ? fs.readdirSync(syncDir).filter(file => file.endsWith('.pdf')) : [];
    for (const file of syncFiles) {
      const localFp = path.join(localPdfDir, file);
      if (!fs.existsSync(localFp)) {
        fs.copyFileSync(path.join(syncDir, file), localFp);
        copied++;
      }
    }
    const localFiles = fs.readdirSync(localPdfDir).filter(file => file.endsWith('.pdf'));
    for (const file of localFiles) {
      const syncFp = path.join(syncDir, file);
      if (!fs.existsSync(syncFp)) {
        fs.copyFileSync(path.join(localPdfDir, file), syncFp);
        copied++;
      }
    }
    return { ok: true, copied };
  }

  function getSyncSettings() {
    return { syncDir: settings.syncDir || '' };
  }

  function setSyncDir(dirPath) {
    const oldPath = getSyncDataPath();
    settings.syncDir = dirPath;
    saveSettings();
    const newPath = getSyncDataPath();
    if (oldPath !== newPath) {
      const localExists = fs.existsSync(oldPath);
      const syncExists = fs.existsSync(newPath);
      if (localExists && !syncExists) {
        try { fs.copyFileSync(oldPath, newPath); } catch (e) {}
      } else if (syncExists && !localExists) {
        try { fs.copyFileSync(newPath, oldPath); } catch (e) {}
      } else if (localExists && syncExists) {
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
    try { syncAllPDFs(); } catch (e) { console.warn('PDF sync error:', e.message); }
    return { ok: true, dir: settings.syncDir };
  }

  function clearSyncDir() {
    settings.syncDir = '';
    saveSettings();
    return { ok: true };
  }

  function setUpdateUrl(url) {
    settings.updateUrl = url || '';
    saveSettings();
    return { ok: true };
  }

  function getAppInfo(version) {
    return {
      version,
      appDir,
      syncDir: settings.syncDir || '',
      pdfDir: localPdfDir,
      pdfCount: fs.readdirSync(localPdfDir).filter(file => file.endsWith('.pdf')).length
    };
  }

  return {
    appDir,
    localPdfDir,
    loadSettings,
    saveSettings,
    getSettingsSnapshot,
    getSyncDataPath,
    getSyncPDFDir,
    loadData,
    saveData,
    savePDF,
    loadPDF,
    pdfExists,
    deletePDF,
    syncAllPDFs,
    getSyncSettings,
    setSyncDir,
    clearSyncDir,
    setUpdateUrl,
    getAppInfo
  };
}

module.exports = { createStorageService };
