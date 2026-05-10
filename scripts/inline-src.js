/**
 * Build step: inlines all ./src/*.js <script> tags into academiq-research.html
 * so the HTML is self-contained for in-app updates.
 * Saves a .original backup and restores it via restore-src.js after build.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'academiq-research.html');
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

const html = fs.readFileSync(htmlPath, 'utf8');

let count = 0;
const inlined = html.replace(/<script src="\.\/src\/([^"]+)"><\/script>/g, function(match, filename) {
  const srcPath = path.join(root, 'src', filename);
  if (!fs.existsSync(srcPath)) {
    console.warn('[inline-src] Missing:', srcPath);
    return match;
  }
  const content = fs.readFileSync(srcPath, 'utf8');
  count++;
  return '<script>\n' + content + '\n</script>';
});

if (count === 0) {
  console.log('[inline-src] No src/ scripts found to inline — already inlined or pattern mismatch.');
  process.exit(0);
}

// Backup original
writeFileWithRetry(backupPath, html);
// Write inlined version
writeFileWithRetry(htmlPath, inlined);
console.log('[inline-src] Inlined ' + count + ' src/ scripts into academiq-research.html');
