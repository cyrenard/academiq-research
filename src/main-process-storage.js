const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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

  function buildPdfFileName(refId) {
    const raw = String(refId || '');
    const base = (raw || 'ref')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'ref';
    const trimmed = base.length > 80 ? base.slice(0, 80) : base;
    const hash = crypto.createHash('sha1').update(raw).digest('hex').slice(0, 10);
    return `${trimmed}__${hash}.pdf`;
  }

  function resolvePdfPaths(dir, refId) {
    const safeName = buildPdfFileName(refId);
    const legacyName = String(refId || '') + '.pdf';
    return {
      safe: path.join(dir, safeName),
      legacy: path.join(dir, legacyName)
    };
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
    const localPaths = resolvePdfPaths(localPdfDir, refId);
    fs.writeFileSync(localPaths.safe, buf);
    if (settings.syncDir) {
      const syncPaths = resolvePdfPaths(getSyncPDFDir(), refId);
      try { fs.writeFileSync(syncPaths.safe, buf); } catch (e) { console.warn('Sync PDF write failed:', e.message); }
    }
    return { ok: true };
  }

  function loadPDF(refId) {
    const localPaths = resolvePdfPaths(localPdfDir, refId);
    if (fs.existsSync(localPaths.safe)) {
      const buf = fs.readFileSync(localPaths.safe);
      return { ok: true, buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    }
    // Legacy filename migration (old builds used refId + '.pdf' directly)
    if (fs.existsSync(localPaths.legacy)) {
      const buf = fs.readFileSync(localPaths.legacy);
      try { fs.writeFileSync(localPaths.safe, buf); } catch (e) {}
      return { ok: true, buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    }
    if (settings.syncDir) {
      const syncPaths = resolvePdfPaths(getSyncPDFDir(), refId);
      const syncFp = fs.existsSync(syncPaths.safe) ? syncPaths.safe : (fs.existsSync(syncPaths.legacy) ? syncPaths.legacy : null);
      if (syncFp) {
        const buf = fs.readFileSync(syncFp);
        try { fs.writeFileSync(localPaths.safe, buf); } catch (e) {}
        return { ok: true, buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
      }
    }
    return { ok: false, error: 'not found' };
  }

  function pdfExists(refId) {
    const localPaths = resolvePdfPaths(localPdfDir, refId);
    if (fs.existsSync(localPaths.safe) || fs.existsSync(localPaths.legacy)) return true;
    if (settings.syncDir) {
      const syncPaths = resolvePdfPaths(getSyncPDFDir(), refId);
      return fs.existsSync(syncPaths.safe) || fs.existsSync(syncPaths.legacy);
    }
    return false;
  }

  function deletePDF(refId) {
    const localPaths = resolvePdfPaths(localPdfDir, refId);
    if (fs.existsSync(localPaths.safe)) fs.unlinkSync(localPaths.safe);
    if (fs.existsSync(localPaths.legacy)) fs.unlinkSync(localPaths.legacy);
    if (settings.syncDir) {
      const syncPaths = resolvePdfPaths(getSyncPDFDir(), refId);
      if (fs.existsSync(syncPaths.safe)) fs.unlinkSync(syncPaths.safe);
      if (fs.existsSync(syncPaths.legacy)) fs.unlinkSync(syncPaths.legacy);
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
