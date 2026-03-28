const path = require('path');
const fs = require('fs');

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

function normalizeDownloadUrl(origUrl) {
  if (!origUrl) return '';
  let url = origUrl;
  if (url.includes('/releases/tag/')) {
    const tag = url.split('/releases/tag/').pop();
    url = 'https://raw.githubusercontent.com/cyrenard/academiq-research/' + tag + '/academiq-research.html';
  }
  const fileName = url.split('/').pop() || 'update';
  const isKnownType = fileName.endsWith('.html') || fileName.endsWith('.zip');
  if (!isKnownType) {
    url = 'https://raw.githubusercontent.com/cyrenard/academiq-research/main/academiq-research.html';
  }
  return url;
}

async function applyDownloadedUpdate(options) {
  const appDir = options.appDir;
  const dirname = options.dirname;
  const url = options.url;
  const buf = options.buffer;
  const isPackaged = !!options.isPackaged;
  const fetchBuffer = options.fetchBuffer;

  const finalName = url.split('/').pop() || 'update';
  if (finalName.endsWith('.html')) {
    const target = path.join(appDir, 'academiq-research.html');
    const bakTarget = target + '.bak';
    if (fs.existsSync(target)) fs.copyFileSync(target, bakTarget);
    fs.writeFileSync(target, buf);
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
        if (preBuf && preBuf.length > 10) fs.writeFileSync(path.join(dirname, 'preload.js'), preBuf);
      } catch (e) {}
    }
    return { ok: true, type: 'html', restart: true };
  }

  if (finalName.endsWith('.zip')) {
    const zipPath = path.join(appDir, 'update.zip');
    fs.writeFileSync(zipPath, buf);
    return { ok: true, type: 'zip', path: zipPath, restart: true };
  }

  const headerStr = buf.slice(0, 200).toString('utf8');
  if (headerStr.includes('<!DOCTYPE') || headerStr.includes('<html')) {
    const target = path.join(appDir, 'academiq-research.html');
    if (fs.existsSync(target)) fs.copyFileSync(target, target + '.bak');
    fs.writeFileSync(target, buf);
    return { ok: true, type: 'html', restart: true };
  }

  return { ok: false, error: 'Unknown file type: ' + finalName + ' (url: ' + url + ')' };
}

module.exports = {
  compareVersions,
  buildUpdateCheckResult,
  normalizeDownloadUrl,
  applyDownloadedUpdate
};
