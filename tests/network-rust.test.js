const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..');
const tauriDir = path.join(rootDir, 'src-tauri');

test('Rust network layer covers rate scoping and ETag cache', () => {
  const result = spawnSync('cargo', [
    'test',
    'phase4_network_',
    '--',
    '--nocapture'
  ], {
    cwd: tauriDir,
    encoding: 'utf8',
    timeout: 300000
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /phase4_network_host_rate_limits_are_scoped/);
  assert.match(result.stdout + result.stderr, /phase4_network_etag_cache_returns_body_on_304/);
  assert.match(result.stdout + result.stderr, /phase4_network_timeout_defaults_to_30s/);
});
