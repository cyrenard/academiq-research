const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..');
const migrateSource = path.join(rootDir, 'src-tauri', 'src', 'db', 'migrate.rs');
const schemaSource = path.join(rootDir, 'src-tauri', 'migrations', '0001_init.sql');

function cargoTest(filter) {
  const result = spawnSync('cargo', ['test', filter, '--', '--nocapture'], {
    cwd: path.join(rootDir, 'src-tauri'),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout + result.stderr;
}

test('SQLite schema includes required lossless migration tables and FTS triggers', () => {
  const sql = fs.readFileSync(schemaSource, 'utf8');
  for (const name of [
    'schema_version',
    'documents',
    'revisions',
    'tabs',
    'library_items',
    'library_fts',
    'citations',
    'bibliography_entries',
    'annotations',
    'highlights',
    'kv'
  ]) {
    assert.match(sql, new RegExp(name));
  }
  assert.match(sql, /CREATE TRIGGER IF NOT EXISTS library_items_ai/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_revisions_doc_id/);
});

test('data migration Rust coverage exercises empty, small, large, interrupted, idempotent and rollback cases', () => {
  const source = fs.readFileSync(migrateSource, 'utf8');
  for (const name of [
    'clean_init_without_legacy_json_creates_schema',
    'migrates_legacy_json_and_preserves_backup',
    'large_fixture_roundtrips_semantically',
    'interrupted_invalid_migration_preserves_backup',
    'migration_is_idempotent',
    'rollback_restores_latest_backup_and_removes_sqlite'
  ]) {
    assert.match(source, new RegExp(`fn ${name}`), name);
  }
});

test('legacy data.json migration preserves semantic blob equality and mandatory backup guard', () => {
  const output = cargoTest('db::migrate::tests::migrates_legacy_json_and_preserves_backup');
  assert.match(output, /migrates_legacy_json_and_preserves_backup \.\.\. ok/);
});

test('migration interruption leaves the backup in place', () => {
  const output = cargoTest('db::migrate::tests::interrupted_invalid_migration_preserves_backup');
  assert.match(output, /interrupted_invalid_migration_preserves_backup \.\.\. ok/);
});

test('schema_version idempotency and rollback stay functional', () => {
  const idempotent = cargoTest('db::migrate::tests::migration_is_idempotent');
  const rollback = cargoTest('db::migrate::tests::rollback_restores_latest_backup_and_removes_sqlite');
  assert.match(idempotent, /migration_is_idempotent \.\.\. ok/);
  assert.match(rollback, /rollback_restores_latest_backup_and_removes_sqlite \.\.\. ok/);
});
