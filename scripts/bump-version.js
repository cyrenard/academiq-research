#!/usr/bin/env node
/*
 * Single-source version bump. Keeps every place the version is hard-coded in
 * sync so release-gate's version-sync test can never fail on a forgotten file.
 *
 *   node scripts/bump-version.js 1.24.1
 *   node scripts/bump-version.js 1.25.0-beta.1
 *
 * Files updated: package.json, package-lock.json, src-tauri/tauri.conf.json,
 * src-tauri/Cargo.toml, src-tauri/Cargo.lock, tests/release-pipeline.test.js.
 * Uses field-specific patterns (never a blind global replace) so unrelated
 * dependency versions are never touched.
 */
const fs = require('fs');
const path = require('path');

const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;
const next = process.argv[2];
if (!next || !SEMVER.test(next)) {
  console.error('usage: node scripts/bump-version.js <semver>  (e.g. 1.24.1 or 1.25.0-beta.1)');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const write = (f, s) => fs.writeFileSync(path.join(root, f), s);
const exists = (f) => fs.existsSync(path.join(root, f));

const pkg = JSON.parse(read('package.json'));
const cur = pkg.version;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const curRe = esc(cur);

if (cur === next) {
  console.log(`already at ${next}; nothing to do`);
  process.exit(0);
}

// Each entry: [file, regex, replacement]. Regex must be anchored to the
// version FIELD, not the bare version string, to avoid touching dependencies.
const edits = [
  ['package.json',               new RegExp(`("version":\\s*")${curRe}(")`),               `$1${next}$2`],
  // package-lock has the root version twice: top-level and packages[""].
  ['package-lock.json',          new RegExp(`("version":\\s*")${curRe}(")`, 'g'),          `$1${next}$2`],
  ['src-tauri/tauri.conf.json',  new RegExp(`("version":\\s*")${curRe}(")`),               `$1${next}$2`],
  ['src-tauri/Cargo.toml',       new RegExp(`(^version\\s*=\\s*")${curRe}(")`, 'm'),        `$1${next}$2`],
  // Cargo.lock: only the academiq-research-tauri package entry.
  ['src-tauri/Cargo.lock',       new RegExp(`(name = "academiq-research-tauri"\\r?\\nversion = ")${curRe}(")`), `$1${next}$2`],
  ['tests/release-pipeline.test.js', new RegExp(`(assert\\.equal\\(pkg\\.version,\\s*')${curRe}('\\))`), `$1${next}$2`]
];

let changed = 0;
const missed = [];
for (const [file, re, repl] of edits) {
  if (!exists(file)) { missed.push(`${file} (not found)`); continue; }
  const before = read(file);
  const after = before.replace(re, repl);
  if (after === before) { missed.push(`${file} (pattern not matched)`); continue; }
  write(file, after);
  console.log(`  updated ${file}`);
  changed += 1;
}

console.log(`\nbumped ${cur} -> ${next} (${changed}/${edits.length} files)`);
if (missed.length) {
  console.error('WARNING — not updated:\n  ' + missed.join('\n  '));
  process.exit(1);
}
console.log('Next: review `git diff`, run `npm run gate:release`, commit, then tag v' + next + '.');
