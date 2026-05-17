const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..');

function cargoTest(filter) {
  const result = spawnSync('cargo', ['test', filter, '--', '--nocapture'], {
    cwd: path.join(rootDir, 'src-tauri'),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout + result.stderr;
}

test('library FTS uses bundled SQLite FTS5 and external-content triggers', () => {
  const cargo = fs.readFileSync(path.join(rootDir, 'src-tauri', 'Cargo.toml'), 'utf8');
  const schema = fs.readFileSync(path.join(rootDir, 'src-tauri', 'migrations', '0001_init.sql'), 'utf8');
  assert.match(cargo, /rusqlite = \{ version = "0\.37", features = \["bundled"\] \}/);
  assert.match(schema, /CREATE VIRTUAL TABLE IF NOT EXISTS library_fts USING fts5/);
  assert.match(schema, /content=library_items/);
});

test('library_search finds Turkish characters through FTS5', () => {
  const output = cargoTest('db::migrate::tests::fts_finds_turkish_library_terms');
  assert.match(output, /fts_finds_turkish_library_terms \.\.\. ok/);
});

test('library_search handles 1000+ entries under the Phase 2 budget', () => {
  const output = cargoTest('db::migrate::tests::fts_searches_1000_entries_under_budget');
  assert.match(output, /fts_searches_1000_entries_under_budget \.\.\. ok/);
});
