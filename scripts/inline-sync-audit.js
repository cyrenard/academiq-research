/* Audit which src/ modules are out of sync with their HTML inline copies.
 * Module name is read directly from each src/ file's `root.AQ... = ...` line so
 * we don't have to second-guess casing.
 * Run: node scripts/inline-sync-audit.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'academiq-research.html'), 'utf8');
const srcDir = path.join(root, 'src');

const RETURN_BLOCK = /\breturn\s*\{([\s\S]*?)\};/g;
const KEY_NAME = /(?:^|[\s,{])([A-Za-z_$][\w$]*)\s*:/g;
const ROOT_EXPORT = /root\.(AQ\w+)\s*=/;

function topLevelExports(source){
  // Pull keys only from the IIFE's last `return { ... };` (the exported API),
  // not every nested return inside helper functions.
  let lastBody = null;
  let m;
  while((m = RETURN_BLOCK.exec(source)) !== null){
    lastBody = m[1];
  }
  if(!lastBody) return new Set();
  const keys = new Set();
  let k;
  while((k = KEY_NAME.exec(lastBody)) !== null){
    keys.add(k[1]);
  }
  return keys;
}

function moduleNameOf(source){
  const m = ROOT_EXPORT.exec(source);
  return m ? m[1] : null;
}

function findInlineModuleBody(htmlSrc, moduleName){
  const exportRe = new RegExp(`root\\.${moduleName}\\s*=`, 'g');
  const matches = [...htmlSrc.matchAll(exportRe)];
  if(!matches.length) return null;
  const tail = matches[matches.length - 1].index;
  const head = htmlSrc.lastIndexOf('(function(root', tail);
  if(head < 0) return null;
  // Find the IIFE close: `})(...);` after the export.
  const close = htmlSrc.indexOf('})(', tail);
  return htmlSrc.slice(head, close > 0 ? close + 100 : tail + 200);
}

const results = [];
for(const file of fs.readdirSync(srcDir)){
  if(!file.endsWith('.js')) continue;
  if(file.startsWith('main-process-')) continue;
  const srcPath = path.join(srcDir, file);
  const srcText = fs.readFileSync(srcPath, 'utf8');
  const moduleName = moduleNameOf(srcText);
  if(!moduleName) continue;
  const srcExports = topLevelExports(srcText);
  if(!srcExports.size) continue;
  // First check if the HTML loads this module via a <script src="./src/<file>">
  // tag — that is now the canonical pattern, so the module is up-to-date by
  // construction and we don't need to compare exports.
  const scriptTag = `<script src="./src/${file}"></script>`;
  if(html.includes(scriptTag)) continue;
  const inline = findInlineModuleBody(html, moduleName);
  if(!inline){
    results.push({ file, moduleName, status: 'NOT_INLINED', missing: [...srcExports] });
    continue;
  }
  const inlineExports = topLevelExports(inline);
  const missing = [...srcExports].filter(k => !inlineExports.has(k));
  if(missing.length){
    results.push({ file, moduleName, status: 'OUT_OF_SYNC', missing, srcCount: srcExports.size, inlineCount: inlineExports.size });
  }
}

results.sort((a, b) => (b.missing?.length || 0) - (a.missing?.length || 0));
for(const r of results){
  console.log(`\n[${r.status}] ${r.moduleName}  (src/${r.file})`);
  if(r.srcCount) console.log(`  src exports: ${r.srcCount}, inline exports: ${r.inlineCount}`);
  console.log(`  Eksik: ${r.missing.join(', ')}`);
}
console.log(`\nToplam senkronize değil: ${results.length}`);
