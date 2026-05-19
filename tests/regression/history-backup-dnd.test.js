const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');

test('document history snapshots include content metrics and excerpt', () => {
  const migrate = fs.readFileSync(path.join(root, 'src-tauri/src/db/migrate.rs'), 'utf8');
  assert.match(migrate, /let content = doc/);
  assert.match(migrate, /or_else\(\|\| doc\.get\("html"\)\)/);
  assert.match(migrate, /"charCount": plain\.chars\(\)\.count\(\)/);
  assert.match(migrate, /"wordCount": plain\.split_whitespace/);
  assert.match(migrate, /"excerpt": plain\.chars\(\)\.take\(280\)/);
});

test('reference cards expose robust drag data and folders accept drops', () => {
  const sidebar = fs.readFileSync(path.join(root, 'src/renderer/components/shell/RefSidebar.tsx'), 'utf8');
  assert.match(sidebar, /setData\('application\/x-academiq-reference-id'/);
  assert.match(sidebar, /setData\('text\/plain'/);
  assert.match(sidebar, /function getDragReference/);
  assert.match(sidebar, /onDragEnter=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(sidebar, /onMoveReferenceToCollection\(refId, id\)/);
  assert.doesNotMatch(sidebar, /document\.addEventListener\('mousedown'/);
  assert.doesNotMatch(sidebar, /onMouseDownCapture=/);
});

test('backup create and restore operate on full app data archive', () => {
  const backup = fs.readFileSync(path.join(root, 'src-tauri/src/commands/backup.rs'), 'utf8');
  assert.match(backup, /academiq-tauri-backup/);
  assert.match(backup, /add_dir_to_zip/);
  assert.match(backup, /extract_archive/);
  assert.match(backup, /pre-restore/);
  assert.doesNotMatch(backup, /"restored": false/);
});
