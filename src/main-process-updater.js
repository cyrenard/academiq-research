const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const RUNTIME_OVERRIDE_ROOT = 'runtime-overrides';
const RUNTIME_LEGACY_ROOT = 'runtime-legacy';
const RUNTIME_MANIFEST_NAME = 'manifest.json';
const LEGACY_RUNTIME_NAMES = ['academiq-research.html', 'academiq-research.html.bak', 'main.js', 'preload.js', 'tiptap-bundle.js', 'src', 'vendor'];
const APPDATA_PERSISTED_NAMES = new Set([
  'academiq-data.json',
  'academiq-data.json.bak',
  'academiq-data.json.recovery.json',
  'document-history.json',
  'editor-draft.json',
  'session-state.json',
  'settings.json',
  'settings.json.bak',
  'capture-queue.json',
  'capture-targets.json',
  'capture-agent-state.json',
  'capture-agent.pid',
  'browser-capture-extension',
  'pdfs',
  'runtime-overrides',
  'runtime-legacy',
  'update.zip'
]);

function compareVersions(a, b) {
  const pa = String(a || '').split('.').map(Number);
  const pb = String(b || '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function buildUpdateCheckResult(data, currentVersion) {
  if (!data || !data.tag_name) return { available: false, current: currentVersion };
  const remote = data.tag_name.replace(/^v/, '');
  const available = compareVersions(remote, currentVersion) > 0;
  let htmlAsset = null;
  if (data.assets && data.assets.length) {
    htmlAsset = data.assets.find(asset => asset.name && asset.name.endsWith('.html'));
    if (!htmlAsset) htmlAsset = data.assets.find(asset => asset.name && asset.name.endsWith('.zip'));
  }
  const downloadUrl = htmlAsset
    ? htmlAsset.browser_download_url
    : 'https://raw.githubusercontent.com/cyrenard/academiq-research/' + data.tag_name + '/academiq-research.html';
  return {
    available,
    current: currentVersion,
    remote,
    notes: data.body || '',
    downloadUrl,
    publishedAt: data.published_at || ''
  };
}

const ALLOWED_UPDATE_HOST = /^https:\/\/(raw\.githubusercontent\.com\/cyrenard|github\.com\/cyrenard|api\.github\.com\/repos\/cyrenard)\//i;

function normalizeDownloadUrl(origUrl) {
  if (!origUrl) return '';
  let url = origUrl;
  if (url.includes('/releases/tag/')) {
    const tag = url.split('/releases/tag/').pop().replace(/[^a-zA-Z0-9._-]/g, '');
    url = 'https://raw.githubusercontent.com/cyrenard/academiq-research/' + tag + '/academiq-research.html';
  }
  if (!ALLOWED_UPDATE_HOST.test(url)) {
    return 'https://raw.githubusercontent.com/cyrenard/academiq-research/main/academiq-research.html';
  }
  const fileName = url.split('/').pop() || 'update';
  const isKnownType = fileName.endsWith('.html') || fileName.endsWith('.zip');
  if (!isKnownType) {
    url = 'https://raw.githubusercontent.com/cyrenard/academiq-research/main/academiq-research.html';
  }
  return url;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeVersionTag(value) {
  const raw = String(value || '').trim().replace(/^v/i, '');
  return /^\d+\.\d+\.\d+$/.test(raw) ? raw : '';
}

function inferTargetVersionFromUrl(url, fallbackVersion) {
  const source = String(url || '');
  const match = source.match(/\/v?(\d+\.\d+\.\d+)(?:\/|$)/i);
  return normalizeVersionTag(match && match[1] ? match[1] : fallbackVersion);
}

function getRuntimeOverridePaths(appDir, version) {
  const safeVersion = normalizeVersionTag(version) || 'unversioned';
  const dir = path.join(appDir, RUNTIME_OVERRIDE_ROOT, safeVersion);
  return {
    version: safeVersion,
    dir,
    htmlPath: path.join(dir, 'academiq-research.html'),
    manifestPath: path.join(dir, RUNTIME_MANIFEST_NAME),
    srcDir: path.join(dir, 'src'),
    vendorDir: path.join(dir, 'vendor'),
    tiptapBundlePath: path.join(dir, 'tiptap-bundle.js')
  };
}

function hashRuntimeFile(hasher, filePath, relativeLabel) {
  if (!fs.existsSync(filePath)) return;
  hasher.update(relativeLabel);
  hasher.update('\n');
  hasher.update(fs.readFileSync(filePath));
  hasher.update('\n');
}

function hashRuntimeDir(hasher, dirPath, relativeRoot) {
  if (!fs.existsSync(dirPath)) return;
  fs.readdirSync(dirPath).sort().forEach((entry) => {
    const fullPath = path.join(dirPath, entry);
    const relativePath = path.join(relativeRoot, entry).replace(/\\/g, '/');
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      hashRuntimeDir(hasher, fullPath, relativePath);
      return;
    }
    hashRuntimeFile(hasher, fullPath, relativePath);
  });
}

function computeRuntimeSignature(dirname) {
  const root = String(dirname || '').trim();
  if (!root) return '';
  const hasher = crypto.createHash('sha256');
  hashRuntimeFile(hasher, path.join(root, 'academiq-research.html'), 'academiq-research.html');
  hashRuntimeFile(hasher, path.join(root, 'main.js'), 'main.js');
  hashRuntimeFile(hasher, path.join(root, 'preload.js'), 'preload.js');
  hashRuntimeFile(hasher, path.join(root, 'tiptap-bundle.js'), 'tiptap-bundle.js');
  hashRuntimeDir(hasher, path.join(root, 'src'), 'src');
  hashRuntimeDir(hasher, path.join(root, 'vendor'), 'vendor');
  return hasher.digest('hex');
}

function computeRendererRuntimeSignature(dirname) {
  const root = String(dirname || '').trim();
  if (!root) return '';
  const hasher = crypto.createHash('sha256');
  hashRuntimeFile(hasher, path.join(root, 'academiq-research.html'), 'academiq-research.html');
  hashRuntimeFile(hasher, path.join(root, 'tiptap-bundle.js'), 'tiptap-bundle.js');
  hashRuntimeDir(hasher, path.join(root, 'src'), 'src');
  hashRuntimeDir(hasher, path.join(root, 'vendor'), 'vendor');
  return hasher.digest('hex');
}

function resetDir(dirPath) {
  if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function validateRuntimeHtmlBuffer(buffer) {
  const text = Buffer.from(buffer || []).slice(0, 512 * 1024).toString('utf8');
  const hasHtmlShell = /<!doctype\s+html/i.test(text) || /<html[\s>]/i.test(text);
  if (!hasHtmlShell) return { ok: false, error: 'Downloaded update is not an HTML runtime' };
  const hasAcademiqMarker = /AcademiQ|academiq-research|AQTipTap|tiptap-bundle/i.test(text);
  if (!hasAcademiqMarker) return { ok: false, error: 'Downloaded HTML does not look like an AcademiQ runtime' };
  if (/<script[^>]+src=["']https?:\/\//i.test(text)) return { ok: false, error: 'Downloaded runtime contains remote script references' };
  return { ok: true };
}

function resolveRuntimeOverride(appDir, appVersion, expectedSignature) {
  const paths = getRuntimeOverridePaths(appDir, appVersion);
  try {
    if (!fs.existsSync(paths.manifestPath) || !fs.existsSync(paths.htmlPath)) return null;
    const manifest = JSON.parse(fs.readFileSync(paths.manifestPath, 'utf8'));
    if (normalizeVersionTag(manifest && manifest.targetVersion) !== normalizeVersionTag(appVersion)) return null;
    if (expectedSignature && String(manifest && manifest.runtimeSignature || '') !== String(expectedSignature)) return null;
    if (expectedSignature && computeRendererRuntimeSignature(paths.dir) !== String(expectedSignature)) return null;
    return Object.assign({}, paths, { manifest });
  } catch (_e) {
    return null;
  }
}

function archiveRuntimeOverride(appDir, version, reason) {
  const paths = getRuntimeOverridePaths(appDir, version);
  if (!fs.existsSync(paths.dir)) return { ok: true, archived: false };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = String(reason || 'stale').replace(/[^a-z0-9._-]/gi, '-');
  const targetDir = path.join(appDir, RUNTIME_LEGACY_ROOT, stamp + '-' + suffix + '-' + paths.version);
  ensureDir(path.dirname(targetDir));
  try {
    fs.renameSync(paths.dir, targetDir);
    return { ok: true, archived: true, dir: targetDir };
  } catch (_e) {
    return { ok: false, archived: false };
  }
}

function archiveLegacyRuntimeOverrides(appDir) {
  const present = LEGACY_RUNTIME_NAMES.filter((name) => fs.existsSync(path.join(appDir, name)));
  if (!present.length) return { ok: true, archived: false };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetDir = path.join(appDir, RUNTIME_LEGACY_ROOT, stamp);
  ensureDir(targetDir);
  present.forEach((name) => {
    const sourcePath = path.join(appDir, name);
    const targetPath = path.join(targetDir, name);
    try {
      fs.renameSync(sourcePath, targetPath);
    } catch (_e) {}
  });
  return { ok: true, archived: true, dir: targetDir };
}

function archiveUnexpectedAppRuntimeFiles(appDir) {
  if (!fs.existsSync(appDir)) return { ok: true, archived: false, dir: '' };
  const names = fs.readdirSync(appDir);
  const unexpected = names.filter((name) => {
    if (APPDATA_PERSISTED_NAMES.has(name)) return false;
    if (LEGACY_RUNTIME_NAMES.includes(name)) return true;
    if (/\.html?$/i.test(name)) return true;
    if (/\.js$/i.test(name)) return true;
    if (/^vendor$/i.test(name)) return true;
    if (/^src$/i.test(name)) return true;
    return false;
  });
  if (!unexpected.length) return { ok: true, archived: false, dir: '' };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetDir = path.join(appDir, RUNTIME_LEGACY_ROOT, stamp + '-app-runtime-cleanup');
  ensureDir(targetDir);
  unexpected.forEach((name) => {
    const sourcePath = path.join(appDir, name);
    const targetPath = path.join(targetDir, name);
    try {
      fs.renameSync(sourcePath, targetPath);
    } catch (_e) {}
  });
  return { ok: true, archived: true, dir: targetDir };
}

function archiveStaleRuntimeOverrides(appDir, currentVersion, expectedSignature) {
  const rootDir = path.join(appDir, RUNTIME_OVERRIDE_ROOT);
  if (!fs.existsSync(rootDir)) return { ok: true, archived: [] };
  const archived = [];
  fs.readdirSync(rootDir).forEach((entry) => {
    const version = normalizeVersionTag(entry);
    if (!version) return;
    const dir = path.join(rootDir, entry);
    let shouldArchive = false;
    let reason = 'stale-version';
    if (version !== normalizeVersionTag(currentVersion)) {
      shouldArchive = true;
    } else {
      const resolved = resolveRuntimeOverride(appDir, version, expectedSignature);
      if (!resolved) {
        shouldArchive = true;
        reason = 'signature-mismatch';
      }
    }
    if (!shouldArchive) return;
    const result = archiveRuntimeOverride(appDir, version, reason);
    if (result && result.archived) archived.push(result.dir || dir);
  });
  return { ok: true, archived };
}

function writeRuntimeOverrideBundle(options) {
  const appDir = options.appDir;
  const dirname = options.dirname;
  const version = options.targetVersion;
  const htmlBuffer = options.htmlBuffer;
  const sourceUrl = options.sourceUrl;
  const runtimeSignature = String(options.runtimeSignature || '');
  const paths = getRuntimeOverridePaths(appDir, version);
  resetDir(paths.dir);
  ensureDir(paths.srcDir);
  ensureDir(paths.vendorDir);
  fs.writeFileSync(paths.htmlPath, htmlBuffer);
  try {
    const bundleSrc = path.join(dirname, 'tiptap-bundle.js');
    if (fs.existsSync(bundleSrc)) fs.writeFileSync(paths.tiptapBundlePath, fs.readFileSync(bundleSrc));
    const srcDir = path.join(dirname, 'src');
    if (fs.existsSync(srcDir)) {
      fs.readdirSync(srcDir).forEach(function(file) {
        try {
          fs.writeFileSync(path.join(paths.srcDir, file), fs.readFileSync(path.join(srcDir, file)));
        } catch (_e) {}
      });
    }
    const vendorDir = path.join(dirname, 'vendor');
    if (fs.existsSync(vendorDir)) {
      fs.readdirSync(vendorDir).forEach(function(file) {
        try {
          fs.writeFileSync(path.join(paths.vendorDir, file), fs.readFileSync(path.join(vendorDir, file)));
        } catch (_e) {}
      });
    }
  } catch (_e) {}
  fs.writeFileSync(paths.manifestPath, JSON.stringify({
    version: 1,
    targetVersion: paths.version,
    runtimeSignature,
    sourceUrl: String(sourceUrl || ''),
    updatedAt: Date.now()
  }, null, 2), 'utf8');
  return paths;
}

async function applyDownloadedUpdate(options) {
  const appDir = options.appDir;
  const dirname = options.dirname;
  const url = options.url;
  const buf = options.buffer;
  const isPackaged = !!options.isPackaged;
  const fetchBuffer = options.fetchBuffer;
  const targetVersion = inferTargetVersionFromUrl(url, options.targetVersion || options.appVersion);

  const finalName = url.split('/').pop() || 'update';
  if (finalName.endsWith('.html')) {
    const validation = validateRuntimeHtmlBuffer(buf);
    if (!validation.ok) return validation;
    const runtimePaths = writeRuntimeOverrideBundle({
      appDir,
      dirname,
      targetVersion: targetVersion || '0.0.0',
      htmlBuffer: buf,
      sourceUrl: url,
      runtimeSignature: computeRendererRuntimeSignature(dirname)
    });
    if (!isPackaged) {
      try {
        const baseUrl = url.replace(/\/[^\/]+$/, '/');
        const src1 = path.join(dirname, 'academiq-research.html');
        const src2 = path.join(dirname, 'src', 'index.html');
        if (fs.existsSync(src1)) { fs.copyFileSync(src1, src1 + '.bak'); fs.writeFileSync(src1, buf); }
        if (fs.existsSync(path.join(dirname, 'src'))) {
          if (fs.existsSync(src2)) fs.copyFileSync(src2, src2 + '.bak');
          fs.writeFileSync(src2, buf);
        }
        const mainBuf = await fetchBuffer(baseUrl + 'main.js');
        if (mainBuf && mainBuf.length > 100) {
          const mt = path.join(dirname, 'main.js');
          fs.copyFileSync(mt, mt + '.bak');
          fs.writeFileSync(mt, mainBuf);
        }
        const preBuf = await fetchBuffer(baseUrl + 'preload.js');
        if (preBuf && preBuf.length > 10) {
          const prePath = path.join(dirname, 'preload.js');
          if (fs.existsSync(prePath)) fs.copyFileSync(prePath, prePath + '.bak');
          fs.writeFileSync(prePath, preBuf);
        }
      } catch (e) {}
    }
    return { ok: true, type: 'html', restart: true, runtimeVersion: runtimePaths.version, runtimeDir: runtimePaths.dir };
  }

  if (finalName.endsWith('.zip')) {
    const zipPath = path.join(appDir, 'update.zip');
    fs.writeFileSync(zipPath, buf);
    return { ok: true, type: 'zip', path: zipPath, restart: true };
  }

  const headerStr = buf.slice(0, 200).toString('utf8');
  if (headerStr.includes('<!DOCTYPE') || headerStr.includes('<html')) {
    const validation = validateRuntimeHtmlBuffer(buf);
    if (!validation.ok) return validation;
    const runtimePaths = writeRuntimeOverrideBundle({
      appDir,
      dirname,
      targetVersion: targetVersion || '0.0.0',
      htmlBuffer: buf,
      sourceUrl: url,
      runtimeSignature: computeRendererRuntimeSignature(dirname)
    });
    return { ok: true, type: 'html', restart: true, runtimeVersion: runtimePaths.version, runtimeDir: runtimePaths.dir };
  }

  return { ok: false, error: 'Unknown file type: ' + finalName + ' (url: ' + url + ')' };
}

module.exports = {
  compareVersions,
  buildUpdateCheckResult,
  normalizeDownloadUrl,
  computeRuntimeSignature,
  computeRendererRuntimeSignature,
  validateRuntimeHtmlBuffer,
  applyDownloadedUpdate,
  resolveRuntimeOverride,
  archiveLegacyRuntimeOverrides,
  archiveRuntimeOverride,
  archiveStaleRuntimeOverrides,
  archiveUnexpectedAppRuntimeFiles
};
