const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..', '..');

function runCargoTest(filter) {
  const result = spawnSync(
    'cargo',
    [
      'test',
      filter,
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
  return output;
}

test('SQLite data layer loads kv.state_blob as ground truth for references', () => {
  const output = runCargoTest('db::migrate::tests::state_blob_is_ground_truth_for_reference_persistence');
  assert.match(output, /state_blob_is_ground_truth_for_reference_persistence \.\.\. ok/);
});

test('autosave cannot shrink externally imported references, while explicit delete still works', () => {
  const mergeOutput = runCargoTest('db::migrate::tests::editor_autosave_merges_missing_references_instead_of_shrinking_library');
  const deleteOutput = runCargoTest('db::migrate::tests::explicit_persist_state_allows_reference_deletion');
  assert.match(mergeOutput, /editor_autosave_merges_missing_references_instead_of_shrinking_library \.\.\. ok/);
  assert.match(deleteOutput, /explicit_persist_state_allows_reference_deletion \.\.\. ok/);
});
