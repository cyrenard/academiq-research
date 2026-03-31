/**
 * Build step: restores academiq-research.html from backup after electron-builder.
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'academiq-research.html');
const backupPath = htmlPath + '.original';

if (fs.existsSync(backupPath)) {
  fs.writeFileSync(htmlPath, fs.readFileSync(backupPath, 'utf8'), 'utf8');
  fs.unlinkSync(backupPath);
  console.log('[restore-src] Restored academiq-research.html from backup.');
} else {
  console.log('[restore-src] No backup found, nothing to restore.');
}
