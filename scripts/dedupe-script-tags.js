/* Removes duplicate <script src="./src/foo.js"></script> tags from
 * academiq-research.html — keeps the LAST occurrence so the override-style
 * load order is preserved (later definition wins, same as before).
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'academiq-research.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const TAG = /<script src="\.\/src\/([^"]+)"><\/script>/g;
const lastIndex = {};
let m;
while((m = TAG.exec(html)) !== null){
  lastIndex[m[1]] = m.index;
}

let removed = 0;
TAG.lastIndex = 0;
const out = html.replace(TAG, function(match, file, offset){
  if(offset !== lastIndex[file]){
    removed++;
    return ''; // drop the earlier duplicate
  }
  return match;
});

if(removed === 0){
  console.log('No duplicates found.');
  process.exit(0);
}

// Collapse runs of blank lines left behind by removed tags.
const cleaned = out.replace(/(\r?\n){3,}/g, '\n\n');
fs.writeFileSync(htmlPath, cleaned, 'utf8');
console.log(`Removed ${removed} duplicate src/ script tags.`);
