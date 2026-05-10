/* One-shot restore: replaces inline AQ module script blocks in academiq-research.html
 * with <script src="./src/foo.js"></script> tags so src/ becomes the single source of
 * truth. The reverse operation (inline-src.js) handles production builds.
 *
 * Strategy:
 *   1. Build a map: AQ module name -> src/file
 *   2. Scan HTML for <script>...</script> blocks
 *   3. For each block, find which root.AQ___ names it exports
 *   4. If the block exports exactly one known AQ module and exports nothing else,
 *      replace it with <script src="./src/<file>"></script>
 *   5. If a block has multiple modules or the module isn't in src/, skip it
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'academiq-research.html');
const srcDir = path.join(root, 'src');

const ROOT_EXPORT = /root\.(AQ\w+)\s*=/g;

// Build module -> src/file map
const moduleToFile = {};
for(const file of fs.readdirSync(srcDir)){
  if(!file.endsWith('.js')) continue;
  if(file.startsWith('main-process-')) continue;
  const text = fs.readFileSync(path.join(srcDir, file), 'utf8');
  const m = /root\.(AQ\w+)\s*=/.exec(text);
  if(m) moduleToFile[m[1]] = file;
}
console.log(`Mapped ${Object.keys(moduleToFile).length} src/ modules.`);

const html = fs.readFileSync(htmlPath, 'utf8');
const SCRIPT_BLOCK = /<script>\r?\n([\s\S]*?)\r?\n<\/script>/g;

let replaced = 0;
let skippedMultiModule = 0;
let skippedNoSrcMatch = 0;
let skippedNoModule = 0;

const out = html.replace(SCRIPT_BLOCK, function(match, body){
  const exports = new Set();
  let m;
  ROOT_EXPORT.lastIndex = 0;
  while((m = ROOT_EXPORT.exec(body)) !== null) exports.add(m[1]);
  if(exports.size === 0){
    skippedNoModule++;
    return match;
  }
  if(exports.size > 1){
    skippedMultiModule++;
    console.log(`  [multi] script block exports: ${[...exports].join(', ')} — left inline`);
    return match;
  }
  const moduleName = [...exports][0];
  const file = moduleToFile[moduleName];
  if(!file){
    skippedNoSrcMatch++;
    console.log(`  [no-src] ${moduleName} — no matching src/ file, left inline`);
    return match;
  }
  replaced++;
  return `<script src="./src/${file}"></script>`;
});

if(replaced === 0){
  console.log('Nothing to replace — already restored.');
  process.exit(0);
}

fs.writeFileSync(htmlPath, out, 'utf8');
console.log('');
console.log(`Replaced: ${replaced} inline modules with src/ script tags`);
console.log(`Kept inline (multi-module block): ${skippedMultiModule}`);
console.log(`Kept inline (no src/ match):       ${skippedNoSrcMatch}`);
console.log(`Kept inline (no AQ module):        ${skippedNoModule}`);
