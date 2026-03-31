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
fs.writeFileSync(backupPath, html, 'utf8');
// Write inlined version
fs.writeFileSync(htmlPath, inlined, 'utf8');
console.log('[inline-src] Inlined ' + count + ' src/ scripts into academiq-research.html');
