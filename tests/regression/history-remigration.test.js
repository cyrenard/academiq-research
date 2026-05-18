const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..', '..');

test('existing SQLite DB with empty revisions auto-recovers document history', () => {
  const result = spawnSync(
    'cargo',
    [
      'test',
      'db::migrate::tests::existing_db_with_empty_revisions_auto_recovers_history',
      '--',
      '--nocapture'
    ],
    {
      cwd: path.join(rootDir, 'src-tauri'),
      encoding: 'utf8'
    }
  );
  const output = result.stdout + result.stderr;
  assert.equal(result.status, 0, output);
  assert.match(output, /existing_db_with_empty_revisions_auto_recovers_history \.\.\. ok/);
});

test('force remigrate command path restores legacy snapshot ids', () => {
  const result = spawnSync(
    'cargo',
    [
      'test',
      'db::migrate::tests::force_remigrate_history_and_restore_accept_legacy_snapshot_id',
      '--',
      '--nocapture'
    ],
    {
      cwd: path.join(rootDir, 'src-tauri'),
      encoding: 'utf8'
    }
  );
  const output = result.stdout + result.stderr;
  assert.equal(result.status, 0, output);
  assert.match(output, /force_remigrate_history_and_restore_accept_legacy_snapshot_id \.\.\. ok/);
});

test('Tauri API exposes db.forceRemigrateHistory and settings storage button calls it', () => {
  const tauriApi = fs.readFileSync(path.join(rootDir, 'src', 'tauri-api.ts'), 'utf8');
  const featureModals = fs.readFileSync(path.join(rootDir, 'src', 'renderer', 'components', 'shell', 'FeatureModals.tsx'), 'utf8');
  assert.match(tauriApi, /forceRemigrateHistory: \(\) => invokeCommand\('db_force_remigrate_history'\)/);
  assert.match(featureModals, /Eski belge geçmişini geri yükle/);
  assert.match(featureModals, /forceRemigrateHistory\?\.\(\)/);
});
