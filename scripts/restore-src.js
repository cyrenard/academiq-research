/**
 * Build step: restores academiq-research.html from backup after electron-builder.
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'academiq-research.html');
const backupPath = htmlPath + '.original';

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeFileWithRetry(filePath, content) {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      fs.writeFileSync(filePath, content, 'utf8');
      return;
    } catch (error) {
      lastError = error;
      sleep(150 + attempt * 100);
    }
  }
  throw lastError;
}

function unlinkWithRetry(filePath) {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      fs.unlinkSync(filePath);
      return;
    } catch (error) {
      lastError = error;
      sleep(150 + attempt * 100);
    }
  }
  throw lastError;
}

if (fs.existsSync(backupPath)) {
  writeFileWithRetry(htmlPath, fs.readFileSync(backupPath, 'utf8'));
  unlinkWithRetry(backupPath);
  console.log('[restore-src] Restored academiq-research.html from backup.');
} else {
  console.log('[restore-src] No backup found, nothing to restore.');
}
