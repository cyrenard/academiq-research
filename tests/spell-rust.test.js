const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..');
const tauriDir = path.join(rootDir, 'src-tauri');

test('Rust spellbook commands cover Turkish, suggestions, user dictionary and perf', () => {
  const result = spawnSync('cargo', [
    'test',
    '--release',
    'phase4_spell_',
    '--',
    '--nocapture'
  ], {
    cwd: tauriDir,
    encoding: 'utf8',
    timeout: 600000
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /phase4_spell_accepts_turkish_and_suggests/);
  assert.match(result.stdout + result.stderr, /phase4_spell_checks_10000_words_under_budget/);
});
