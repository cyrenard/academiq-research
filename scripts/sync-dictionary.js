#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Copy the Turkish Hunspell dictionary from node_modules/dictionary-tr/ into:
 *   - public/dictionary/tr/ for the legacy renderer fallback
 *   - src-tauri/resources/dict/tr/ for the Rust spell command bundle
 *
 * The .dic file is large, so both runtimes load it lazily from plain files
 * instead of bundling it into JavaScript.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'node_modules', 'dictionary-tr');
const DST_DIRS = [
  path.join(ROOT, 'public', 'dictionary', 'tr'),
  path.join(ROOT, 'src-tauri', 'resources', 'dict', 'tr')
];

const FILES = ['index.aff', 'index.dic', 'license'];

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }

function copyIfChanged(src, dst) {
  if (!exists(src)) {
    console.warn(`[sync-dictionary] source missing: ${src}`);
    return false;
  }
  if (exists(dst)) {
    const a = fs.statSync(src);
    const b = fs.statSync(dst);
    if (a.size === b.size && a.mtimeMs <= b.mtimeMs) return false;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return true;
}

function main() {
  if (!exists(SRC_DIR)) {
    return;
  }
  let copied = 0;
  for (const dstDir of DST_DIRS) {
    for (const f of FILES) {
      const src = path.join(SRC_DIR, f);
      const dst = path.join(dstDir, f === 'license' ? 'LICENSE' : f);
      if (copyIfChanged(src, dst)) {
        copied += 1;
        console.log(`[sync-dictionary] ${f} -> ${path.relative(ROOT, dstDir)}/`);
      }
    }
  }
  if (copied > 0) {
    console.log(`[sync-dictionary] done (${copied} file${copied === 1 ? '' : 's'} updated)`);
  }
}

if (require.main === module) main();
