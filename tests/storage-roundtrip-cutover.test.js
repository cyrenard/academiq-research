const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..');

function cargoTest(filter) {
  const result = spawnSync('cargo', ['test', filter, '--', '--nocapture'], {
    cwd: path.join(rootDir, 'src-tauri'),
    encoding: 'utf8',
    timeout: 240000
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout + result.stderr;
}

test('cutover storage keeps Electron data.json backup for rollback', () => {
  const source = fs.readFileSync(path.join(rootDir, 'src-tauri', 'src', 'db', 'migrate.rs'), 'utf8');
  assert.match(source, /data\.json\.bak/);
  assert.match(source, /rollback_restores_latest_backup_and_removes_sqlite/);
});

test('legacy data.json to SQLite and rollback roundtrip stays green', () => {
  const migrate = cargoTest('db::migrate::tests::migrates_legacy_json_and_preserves_backup');
  const rollback = cargoTest('db::migrate::tests::rollback_restores_latest_backup_and_removes_sqlite');
  assert.match(migrate, /migrates_legacy_json_and_preserves_backup \.\.\. ok/);
  assert.match(rollback, /rollback_restores_latest_backup_and_removes_sqlite \.\.\. ok/);
});
