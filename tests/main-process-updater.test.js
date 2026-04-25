const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const updater = require('../src/main-process-updater.js');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'academiq-updater-'));
}

function writeRendererRuntime(dir, label) {
  fs.writeFileSync(path.join(dir, 'academiq-research.html'), '<html>' + label + '</html>');
  fs.writeFileSync(path.join(dir, 'tiptap-bundle.js'), 'bundle-' + label);
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'renderer.js'), 'console.log("' + label + '")');
}

function writeRuntimeOverride(appDir, version, signature, label) {
  const overrideDir = path.join(appDir, 'runtime-overrides', version);
  fs.mkdirSync(overrideDir, { recursive: true });
  writeRendererRuntime(overrideDir, label);
  fs.writeFileSync(path.join(overrideDir, 'manifest.json'), JSON.stringify({
    version: 1,
    targetVersion: version,
    runtimeSignature: signature
  }));
  return overrideDir;
}

test('compareVersions compares semver triples', () => {
  assert.equal(updater.compareVersions('2.0.0', '1.9.9'), 1);
  assert.equal(updater.compareVersions('1.2.3', '1.2.3'), 0);
  assert.equal(updater.compareVersions('1.2.2', '1.2.3'), -1);
});

test('buildUpdateCheckResult derives availability and download url', () => {
  const result = updater.buildUpdateCheckResult({
    tag_name: 'v2.2.0',
    assets: [{ name: 'academiq-research.html', browser_download_url: 'https://example.com/u.html' }],
    body: 'notes',
    published_at: '2026-01-01'
  }, '2.1.0');

  assert.equal(result.available, true);
  assert.equal(result.remote, '2.2.0');
  assert.equal(result.downloadUrl, 'https://example.com/u.html');
});

test('normalizeDownloadUrl converts release pages and unknown files', () => {
  assert.equal(
    updater.normalizeDownloadUrl('https://github.com/x/y/releases/tag/v2.0.0'),
    'https://raw.githubusercontent.com/cyrenard/academiq-research/v2.0.0/academiq-research.html'
  );
  assert.equal(
    updater.normalizeDownloadUrl('https://example.com/update'),
    'https://raw.githubusercontent.com/cyrenard/academiq-research/main/academiq-research.html'
  );
});

test('applyDownloadedUpdate writes html updates to versioned runtime override dir', async () => {
  const appDir = makeTempDir();
  const repoDir = makeTempDir();
  const html = Buffer.from('<!DOCTYPE html><html><head><title>AcademiQ Research</title></head><body>AQTipTap</body></html>', 'utf8');
  fs.writeFileSync(path.join(repoDir, 'tiptap-bundle.js'), 'bundle');
  fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'src', 'browser-capture.js'), 'console.log("ok")');

  const result = await updater.applyDownloadedUpdate({
    appDir,
    dirname: repoDir,
    url: 'https://raw.githubusercontent.com/cyrenard/academiq-research/v1.1.1/academiq-research.html',
    buffer: html,
    appVersion: '1.1.0',
    isPackaged: true,
    fetchBuffer: async () => Buffer.from('')
  });

  assert.equal(result.ok, true);
  assert.equal(result.runtimeVersion, '1.1.1');
  assert.equal(fs.existsSync(path.join(appDir, 'runtime-overrides', '1.1.1', 'academiq-research.html')), true);
  assert.equal(fs.existsSync(path.join(appDir, 'runtime-overrides', '1.1.1', 'tiptap-bundle.js')), true);
  assert.equal(fs.existsSync(path.join(appDir, 'runtime-overrides', '1.1.1', 'src', 'browser-capture.js')), true);
});

test('validateRuntimeHtmlBuffer rejects unrelated or remote-script html updates', () => {
  assert.equal(updater.validateRuntimeHtmlBuffer(Buffer.from('not html')).ok, false);
  assert.equal(updater.validateRuntimeHtmlBuffer(Buffer.from('<!DOCTYPE html><html><body>Other app</body></html>')).ok, false);
  assert.equal(
    updater.validateRuntimeHtmlBuffer(Buffer.from('<!DOCTYPE html><html><head><title>AcademiQ Research</title><script src="https://evil.example/a.js"></script></head></html>')).ok,
    false
  );
  assert.equal(
    updater.validateRuntimeHtmlBuffer(Buffer.from('<!DOCTYPE html><html><head><title>AcademiQ Research</title></head><body>AQTipTap</body></html>')).ok,
    true
  );
});

test('applyDownloadedUpdate refuses invalid html before writing runtime override', async () => {
  const appDir = makeTempDir();
  const repoDir = makeTempDir();

  const result = await updater.applyDownloadedUpdate({
    appDir,
    dirname: repoDir,
    url: 'https://raw.githubusercontent.com/cyrenard/academiq-research/v1.1.1/academiq-research.html',
    buffer: Buffer.from('<!DOCTYPE html><html><body>Wrong app</body></html>', 'utf8'),
    appVersion: '1.1.0',
    isPackaged: true,
    fetchBuffer: async () => Buffer.from('')
  });

  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(path.join(appDir, 'runtime-overrides', '1.1.1')), false);
});

test('resolveRuntimeOverride only returns exact app version match', () => {
  const appDir = makeTempDir();
  const repoDir = makeTempDir();
  const overrideDir = path.join(appDir, 'runtime-overrides', '1.1.1');
  fs.mkdirSync(overrideDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'academiq-research.html'), '<html>current</html>');
  fs.writeFileSync(path.join(repoDir, 'main.js'), 'console.log("main")');
  fs.writeFileSync(path.join(repoDir, 'preload.js'), 'console.log("preload")');
  fs.writeFileSync(path.join(repoDir, 'tiptap-bundle.js'), 'bundle');
  fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'src', 'browser-capture.js'), 'console.log("ok")');
  fs.writeFileSync(path.join(overrideDir, 'academiq-research.html'), '<html>current</html>');
  fs.writeFileSync(path.join(overrideDir, 'tiptap-bundle.js'), 'bundle');
  fs.mkdirSync(path.join(overrideDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(overrideDir, 'src', 'browser-capture.js'), 'console.log("ok")');
  fs.writeFileSync(path.join(overrideDir, 'manifest.json'), JSON.stringify({
    version: 1,
    targetVersion: '1.1.1',
    runtimeSignature: updater.computeRendererRuntimeSignature(repoDir)
  }));

  assert.equal(!!updater.resolveRuntimeOverride(appDir, '1.1.1', updater.computeRendererRuntimeSignature(repoDir)), true);
  assert.equal(updater.resolveRuntimeOverride(appDir, '1.1.2', updater.computeRendererRuntimeSignature(repoDir)), null);
});

test('resolveRuntimeOverride rejects stale override with mismatched runtime signature', () => {
  const appDir = makeTempDir();
  const repoDir = makeTempDir();
  const overrideDir = path.join(appDir, 'runtime-overrides', '1.1.1');
  fs.mkdirSync(overrideDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'academiq-research.html'), '<html>current</html>');
  fs.writeFileSync(path.join(repoDir, 'main.js'), 'console.log("main")');
  fs.writeFileSync(path.join(repoDir, 'preload.js'), 'console.log("preload")');
  fs.writeFileSync(path.join(overrideDir, 'academiq-research.html'), '<html>stale</html>');
  fs.writeFileSync(path.join(overrideDir, 'manifest.json'), JSON.stringify({
    version: 1,
    targetVersion: '1.1.1',
    runtimeSignature: 'old-signature'
  }));

  assert.equal(updater.resolveRuntimeOverride(appDir, '1.1.1', updater.computeRuntimeSignature(repoDir)), null);
});

test('archiveRuntimeOverride moves mismatched version override out of active directory', () => {
  const appDir = makeTempDir();
  const overrideDir = path.join(appDir, 'runtime-overrides', '1.1.1');
  fs.mkdirSync(overrideDir, { recursive: true });
  fs.writeFileSync(path.join(overrideDir, 'academiq-research.html'), '<html>stale</html>');
  fs.writeFileSync(path.join(overrideDir, 'manifest.json'), JSON.stringify({
    version: 1,
    targetVersion: '1.1.1',
    runtimeSignature: 'old-signature'
  }));

  const result = updater.archiveRuntimeOverride(appDir, '1.1.1', 'signature-mismatch');
  assert.equal(result.ok, true);
  assert.equal(result.archived, true);
  assert.equal(fs.existsSync(overrideDir), false);
  assert.equal(fs.existsSync(path.join(result.dir, 'manifest.json')), true);
});

test('archiveStaleRuntimeOverrides keeps current valid override and archives stale entries', () => {
  const appDir = makeTempDir();
  const repoDir = makeTempDir();
  writeRendererRuntime(repoDir, 'current');
  const signature = updater.computeRendererRuntimeSignature(repoDir);
  const currentOverride = writeRuntimeOverride(appDir, '1.1.1', signature, 'current');
  const oldOverride = writeRuntimeOverride(appDir, '1.1.0', 'old-signature', 'old');
  const badCurrentOverride = path.join(appDir, 'runtime-overrides', '1.1.1-bad');
  fs.mkdirSync(badCurrentOverride, { recursive: true });
  fs.writeFileSync(path.join(badCurrentOverride, 'academiq-research.html'), '<html>ignored bad folder</html>');

  const result = updater.archiveStaleRuntimeOverrides(appDir, '1.1.1', signature);

  assert.equal(result.ok, true);
  assert.equal(result.archived.length, 1);
  assert.equal(fs.existsSync(currentOverride), true);
  assert.equal(fs.existsSync(oldOverride), false);
  assert.equal(fs.existsSync(badCurrentOverride), true);
  assert.equal(fs.existsSync(path.join(result.archived[0], 'manifest.json')), true);
});

test('archiveLegacyRuntimeOverrides moves old root override files out of app root', () => {
  const appDir = makeTempDir();
  fs.writeFileSync(path.join(appDir, 'academiq-research.html'), '<html>legacy</html>');
  fs.writeFileSync(path.join(appDir, 'main.js'), 'legacy-main');
  fs.writeFileSync(path.join(appDir, 'preload.js'), 'legacy-preload');
  fs.writeFileSync(path.join(appDir, 'tiptap-bundle.js'), 'bundle');
  fs.mkdirSync(path.join(appDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(appDir, 'src', 'legacy.js'), 'legacy');

  const result = updater.archiveLegacyRuntimeOverrides(appDir);

  assert.equal(result.ok, true);
  assert.equal(result.archived, true);
  assert.equal(fs.existsSync(path.join(appDir, 'academiq-research.html')), false);
  assert.equal(fs.existsSync(path.join(appDir, 'main.js')), false);
  assert.equal(fs.existsSync(path.join(appDir, 'preload.js')), false);
  assert.equal(fs.existsSync(path.join(result.dir, 'academiq-research.html')), true);
  assert.equal(fs.existsSync(path.join(result.dir, 'src', 'legacy.js')), true);
});

test('archiveUnexpectedAppRuntimeFiles preserves data but archives stray runtime files', () => {
  const appDir = makeTempDir();
  fs.writeFileSync(path.join(appDir, 'settings.json'), '{}');
  fs.writeFileSync(path.join(appDir, 'academiq-data.json'), '{}');
  fs.writeFileSync(path.join(appDir, 'academiq-data.json.bak'), '{}');
  fs.writeFileSync(path.join(appDir, 'academiq-data.json.recovery.json'), '{}');
  fs.writeFileSync(path.join(appDir, 'document-history.json'), '{}');
  fs.writeFileSync(path.join(appDir, 'editor-draft.json'), '{}');
  fs.writeFileSync(path.join(appDir, 'session-state.json'), '{}');
  fs.writeFileSync(path.join(appDir, 'capture-queue.json'), '{}');
  fs.writeFileSync(path.join(appDir, 'capture-targets.json'), '{}');
  fs.writeFileSync(path.join(appDir, 'capture-agent-state.json'), '{}');
  fs.writeFileSync(path.join(appDir, 'old-ui.html'), '<html>old</html>');
  fs.writeFileSync(path.join(appDir, 'main.js'), 'legacy-main');
  fs.mkdirSync(path.join(appDir, 'vendor'), { recursive: true });
  fs.writeFileSync(path.join(appDir, 'vendor', 'old.css'), 'body{}');
  fs.mkdirSync(path.join(appDir, 'browser-capture-extension'), { recursive: true });
  fs.writeFileSync(path.join(appDir, 'browser-capture-extension', 'config.js'), 'safe extension config');
  fs.mkdirSync(path.join(appDir, 'pdfs'), { recursive: true });
  fs.writeFileSync(path.join(appDir, 'pdfs', 'paper.pdf'), '%PDF');

  const result = updater.archiveUnexpectedAppRuntimeFiles(appDir);

  assert.equal(result.ok, true);
  assert.equal(result.archived, true);
  assert.equal(fs.existsSync(path.join(appDir, 'settings.json')), true);
  assert.equal(fs.existsSync(path.join(appDir, 'academiq-data.json')), true);
  assert.equal(fs.existsSync(path.join(appDir, 'academiq-data.json.bak')), true);
  assert.equal(fs.existsSync(path.join(appDir, 'academiq-data.json.recovery.json')), true);
  assert.equal(fs.existsSync(path.join(appDir, 'document-history.json')), true);
  assert.equal(fs.existsSync(path.join(appDir, 'editor-draft.json')), true);
  assert.equal(fs.existsSync(path.join(appDir, 'session-state.json')), true);
  assert.equal(fs.existsSync(path.join(appDir, 'capture-queue.json')), true);
  assert.equal(fs.existsSync(path.join(appDir, 'capture-targets.json')), true);
  assert.equal(fs.existsSync(path.join(appDir, 'capture-agent-state.json')), true);
  assert.equal(fs.existsSync(path.join(appDir, 'browser-capture-extension', 'config.js')), true);
  assert.equal(fs.existsSync(path.join(appDir, 'pdfs', 'paper.pdf')), true);
  assert.equal(fs.existsSync(path.join(appDir, 'old-ui.html')), false);
  assert.equal(fs.existsSync(path.join(appDir, 'main.js')), false);
  assert.equal(fs.existsSync(path.join(appDir, 'vendor')), false);
  assert.equal(fs.existsSync(path.join(result.dir, 'old-ui.html')), true);
  assert.equal(fs.existsSync(path.join(result.dir, 'main.js')), true);
  assert.equal(fs.existsSync(path.join(result.dir, 'vendor', 'old.css')), true);
});
