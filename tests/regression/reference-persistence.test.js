const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..', '..');

test('SQLite data layer loads kv.state_blob as ground truth for references', () => {
  const result = spawnSync(
    'cargo',
    [
      'test',
      'db::migrate::tests::state_blob_is_ground_truth_for_reference_persistence',
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
  assert.match(output, /state_blob_is_ground_truth_for_reference_persistence \.\.\. ok/);
});
