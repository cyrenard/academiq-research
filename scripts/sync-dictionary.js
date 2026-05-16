#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Copy the Turkish Hunspell dictionary from node_modules/dictionary-tr/
 * into public/dictionary/tr/ so Vite serves it as a static asset and the
 * renderer can fetch it at runtime (`./dictionary/tr/index.dic`).
 *
 * Why a script and not just a Vite plugin / direct import:
 *   - The .dic is ~9 MB. Importing it as a string would gum up bundle
 *     analysis and balloon source maps. Serving it as a plain asset
 *     keeps it lazy-loaded.
 *   - postinstall runs this automatically after `npm install`, so the
 *     dev server boots cleanly without manual setup.
 *   - Idempotent: skips when the destination matches the source size.
 *
 * License: dictionary-tr is MIT (Harun Reşit Zafer, 2014). The original
 * license file is also copied alongside index.aff/index.dic so the
 * attribution travels with the data.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'node_modules', 'dictionary-tr');
const DST_DIR = path.join(ROOT, 'public', 'dictionary', 'tr');

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
    // node_modules not installed yet — postinstall called before deps?
    // Silently exit; the next `npm install` round will run us again.
    return;
  }
  let copied = 0;
  for (const f of FILES) {
    const src = path.join(SRC_DIR, f);
    const dst = path.join(DST_DIR, f === 'license' ? 'LICENSE' : f);
    if (copyIfChanged(src, dst)) {
      copied += 1;
      console.log(`[sync-dictionary] ${f} → public/dictionary/tr/`);
    }
  }
  if (copied === 0) {
    // Quiet success: nothing to do.
    return;
  }
  console.log(`[sync-dictionary] done (${copied} file${copied === 1 ? '' : 's'} updated)`);
}

if (require.main === module) main();
