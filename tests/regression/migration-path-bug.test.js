const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..', '..');
const fixtureDir = path.join(rootDir, 'tests', 'fixtures', 'legacy-electron-data');

test('hotfix migration fixture mirrors LOCALAPPDATA/AcademiQ schema', () => {
  for (const relativePath of [
    'academiq-data.json',
    'document-history.json',
    'settings.json',
    'session-state.json',
    'capture-agent-state.json',
    'capture-queue.json',
    'capture-targets.json',
    path.join('pdfs', 'ref-fixt.pdf'),
    path.join('pdfs', 'ref-second.pdf'),
    path.join('workspaces', 'AcademiQ-EĞT. ARŞ-fixt', 'workspace.json')
  ]) {
    assert.equal(fs.existsSync(path.join(fixtureDir, relativePath)), true, relativePath);
  }
});

test('LOCALAPPDATA/AcademiQ migrates into SQLite and app data without touching source', () => {
  const result = spawnSync(
    'cargo',
    [
      'test',
      'db::migrate::tests::migration_path_hotfix_migrates_localappdata_academiq_fixture',
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
  assert.match(output, /migration_path_hotfix_migrates_localappdata_academiq_fixture \.\.\. ok/);
});
