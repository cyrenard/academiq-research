const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8');
}

test('local matrix assistant has Tauri IPC parity and native behavior samples', () => {
  const shim = read('src', 'tauri-api.ts');
  const lib = read('src-tauri', 'src', 'lib.rs');
  const command = read('src-tauri', 'src', 'commands', 'local_matrix.rs');
  const ipcTest = read('tests', 'ipc-parity.test.js');

  for (const [apiName, commandName] of [
    ['getLocalMatrixAssistantStatus', 'local_matrix_assistant_get_status'],
    ['rankLocalMatrixCandidates', 'local_matrix_assistant_rank_candidates'],
    ['composeLocalMatrixCells', 'local_matrix_assistant_compose_cells']
  ]) {
    assert.match(shim, new RegExp(`${apiName}: \\([^)]*\\) => invokeCommand\\('${commandName}'`), apiName);
    assert.match(lib, new RegExp(`commands::local_matrix::${commandName}`), commandName);
    assert.match(ipcTest, new RegExp(`\\['${apiName}', '${commandName}'`), apiName);
  }

  assert.match(command, /assistant:sample-evidence/);
  assert.match(command, /assistant:reference-like-penalty/);
  assert.match(command, /local-assistant-compose/);
  assert.match(command, /"writesManuscriptText": false/);
});
