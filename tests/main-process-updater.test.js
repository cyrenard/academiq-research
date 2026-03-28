const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const updater = require('../src/main-process-updater.js');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'academiq-updater-'));
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

test('applyDownloadedUpdate writes html updates to app dir', async () => {
  const appDir = makeTempDir();
  const repoDir = makeTempDir();
  const html = Buffer.from('<!DOCTYPE html><html></html>', 'utf8');

  const result = await updater.applyDownloadedUpdate({
    appDir,
    dirname: repoDir,
    url: 'https://example.com/academiq-research.html',
    buffer: html,
    isPackaged: true,
    fetchBuffer: async () => Buffer.from('')
  });

  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(appDir, 'academiq-research.html')), true);
});
