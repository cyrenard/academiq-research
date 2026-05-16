#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Download the Adoptium Temurin 17 JRE into <repo>/vendor/jre/.
 *
 * NOTE: this script was previously named for LanguageTool, but the
 * Türkçe integration switched to Zemberek (which LT does not support).
 * What we still need from this script is the JRE — Zemberek needs Java
 * to run, but we don't want to force users to install Java themselves.
 *
 * Layout produced (consumed by src/main-process-languagetool.js):
 *   vendor/
 *     jre/
 *       bin/java(.exe)
 *       ...
 *
 * Separately, run `npm run setup:zemberek` to build the Zemberek fat
 * jar that lands under vendor/languagetool/zemberek-server.jar. That
 * one needs a JDK (not just JRE) and is a one-shot build step.
 *
 * Idempotent: if vendor/jre/bin/java(.exe) exists the script exits 0.
 *
 * Source:
 *   - Eclipse Adoptium Temurin 17 JRE (free, GPL-2.0 with classpath exception)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor');
const JRE_DIR = path.join(VENDOR, 'jre');
const LT_DIR = path.join(VENDOR, 'languagetool');
const TMP_DIR = path.join(VENDOR, '_tmp');

// Pinned versions — bump deliberately so reproducible builds keep working.
const TEMURIN_VERSION = '17.0.11+9';
const TEMURIN_VERSION_SAFE = TEMURIN_VERSION.replace('+', '_');
const LT_VERSION = '6.4';

function temurinUrl() {
  const platform = process.platform;
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
  if (platform === 'win32') {
    return `https://github.com/adoptium/temurin17-binaries/releases/download/jdk-${encodeURIComponent(TEMURIN_VERSION)}/OpenJDK17U-jre_${arch}_windows_hotspot_${TEMURIN_VERSION_SAFE}.zip`;
  }
  if (platform === 'darwin') {
    return `https://github.com/adoptium/temurin17-binaries/releases/download/jdk-${encodeURIComponent(TEMURIN_VERSION)}/OpenJDK17U-jre_${arch}_mac_hotspot_${TEMURIN_VERSION_SAFE}.tar.gz`;
  }
  // linux + others assume linux
  return `https://github.com/adoptium/temurin17-binaries/releases/download/jdk-${encodeURIComponent(TEMURIN_VERSION)}/OpenJDK17U-jre_${arch}_linux_hotspot_${TEMURIN_VERSION_SAFE}.tar.gz`;
}

function ltUrl() {
  return `https://languagetool.org/download/LanguageTool-${LT_VERSION}.zip`;
}

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    mkdirp(path.dirname(dest));
    const file = fs.createWriteStream(dest);
    let downloaded = 0;
    let total = 0;
    let lastPercent = -1;

    function follow(currentUrl, redirectsLeft) {
      const request = https.get(currentUrl, (response) => {
        const status = response.statusCode || 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          if (redirectsLeft <= 0) {
            reject(new Error(`Too many redirects for ${url}`));
            return;
          }
          response.resume();
          follow(new URL(response.headers.location, currentUrl).toString(), redirectsLeft - 1);
          return;
        }
        if (status !== 200) {
          reject(new Error(`HTTP ${status} for ${currentUrl}`));
          response.resume();
          return;
        }
        total = Number(response.headers['content-length']) || 0;
        response.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = Math.floor((downloaded / total) * 100);
            if (pct !== lastPercent && pct % 5 === 0) {
              process.stdout.write(`\r  ${pct}% (${(downloaded / 1048576).toFixed(1)} MB)`);
              lastPercent = pct;
            }
          }
        });
        response.pipe(file);
        file.on('finish', () => file.close(() => {
          process.stdout.write('\n');
          resolve(dest);
        }));
      });
      request.on('error', (err) => {
        try { file.close(); fs.unlinkSync(dest); } catch (_e) {}
        reject(err);
      });
    }
    follow(url, 5);
  });
}

function extract(archivePath, destDir) {
  mkdirp(destDir);
  const isZip = archivePath.endsWith('.zip');
  if (isZip) {
    if (process.platform === 'win32') {
      // PowerShell's Expand-Archive is built-in everywhere.
      const r = spawnSync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -Path "${archivePath}" -DestinationPath "${destDir}" -Force`
      ], { stdio: 'inherit' });
      if (r.status !== 0) throw new Error(`Expand-Archive failed for ${archivePath}`);
    } else {
      // unzip is preinstalled on macOS and most Linux distros.
      const r = spawnSync('unzip', ['-q', '-o', archivePath, '-d', destDir], { stdio: 'inherit' });
      if (r.status !== 0) throw new Error(`unzip failed for ${archivePath}`);
    }
    return;
  }
  // .tar.gz
  const r = spawnSync('tar', ['-xzf', archivePath, '-C', destDir], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`tar failed for ${archivePath}`);
}

/** After extracting, find the actual root inside the archive and flatten. */
function flatten(extractedRoot, finalDir, markerName) {
  // The downloaded archive nests one level: jdk-17.0.11+9-jre/, or
  // LanguageTool-6.4/. Walk one level and move its contents up.
  const entries = fs.readdirSync(extractedRoot);
  const candidates = entries.filter((e) => fs.statSync(path.join(extractedRoot, e)).isDirectory());
  if (candidates.length === 0) {
    throw new Error(`No directory found inside ${extractedRoot}`);
  }
  // Pick the one that contains the marker (bin/java for JRE,
  // languagetool-server.jar for LT) directly OR one level down.
  let chosen = null;
  for (const c of candidates) {
    const inner = path.join(extractedRoot, c);
    if (exists(path.join(inner, markerName))) { chosen = inner; break; }
    if (exists(path.join(inner, 'Contents', 'Home', markerName))) {
      chosen = path.join(inner, 'Contents', 'Home');
      break;
    }
  }
  if (!chosen) chosen = path.join(extractedRoot, candidates[0]);
  if (exists(finalDir)) fs.rmSync(finalDir, { recursive: true, force: true });
  fs.renameSync(chosen, finalDir);
}

async function setupJre() {
  const javaName = process.platform === 'win32' ? 'java.exe' : 'java';
  if (exists(path.join(JRE_DIR, 'bin', javaName))) {
    console.log('[setup-lt] JRE already present, skipping');
    return;
  }
  const url = temurinUrl();
  const archive = path.join(TMP_DIR, path.basename(url));
  console.log(`[setup-lt] downloading JRE: ${url}`);
  await download(url, archive);
  const extractRoot = path.join(TMP_DIR, 'jre-extract');
  if (exists(extractRoot)) fs.rmSync(extractRoot, { recursive: true, force: true });
  console.log('[setup-lt] extracting JRE...');
  extract(archive, extractRoot);
  flatten(extractRoot, JRE_DIR, path.join('bin', javaName));
  console.log(`[setup-lt] JRE ready at ${JRE_DIR}`);
}

async function setupLanguageTool() {
  if (exists(path.join(LT_DIR, 'languagetool-server.jar'))) {
    console.log('[setup-lt] LanguageTool already present, skipping');
    return;
  }
  const url = ltUrl();
  const archive = path.join(TMP_DIR, path.basename(url));
  console.log(`[setup-lt] downloading LanguageTool: ${url}`);
  await download(url, archive);
  const extractRoot = path.join(TMP_DIR, 'lt-extract');
  if (exists(extractRoot)) fs.rmSync(extractRoot, { recursive: true, force: true });
  console.log('[setup-lt] extracting LanguageTool...');
  extract(archive, extractRoot);
  flatten(extractRoot, LT_DIR, 'languagetool-server.jar');
  console.log(`[setup-lt] LanguageTool ready at ${LT_DIR}`);
}

async function main() {
  mkdirp(VENDOR);
  mkdirp(TMP_DIR);
  try {
    await setupJre();
    // Best-effort cleanup of downloaded archives.
    try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch (_e) {}
    console.log('[setup-lt] JRE ready. Next: `npm run setup:zemberek` to build the spell-check jar.');
  } catch (err) {
    console.error('[setup-lt] FAILED:', err && err.message ? err.message : err);
    console.error('  Re-run after fixing network access; partial downloads are in', TMP_DIR);
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { setupJre, setupLanguageTool, temurinUrl, ltUrl };
