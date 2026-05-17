const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(rootDir, ...parts), 'utf8');
}

function json(...parts) {
  return JSON.parse(read(...parts));
}

test('Tauri updater plugin is configured with public key and release endpoint', () => {
  const cargo = read('src-tauri', 'Cargo.toml');
  assert.match(cargo, /tauri-plugin-updater\s*=\s*"2"/);

  const conf = json('src-tauri', 'tauri.conf.json');
  assert.equal(conf.plugins.updater.endpoints[0], 'https://updates.academiq.research/{{target}}/{{current_version}}');
  assert.match(conf.plugins.updater.pubkey, /^[A-Za-z0-9+/=\n]+$/);
  assert.equal(conf.plugins.updater.windows.installMode, 'passive');

  const capabilities = json('src-tauri', 'capabilities', 'default.json');
  assert.ok(capabilities.permissions.includes('updater:default'));
});

test('update commands use tauri-plugin-updater and preserve setUrl channel workaround', () => {
  const source = read('src-tauri', 'src', 'commands', 'update.rs');
  assert.match(source, /use tauri_plugin_updater::UpdaterExt;/);
  assert.match(source, /\.updater\(\)[\s\S]*\.check\(\)/);
  assert.match(source, /\.download_and_install\(/);
  assert.match(source, /"update:progress"/);
  assert.match(source, /UPDATE_CHANNEL_KEY/);
  assert.match(source, /"runtimeEndpointMutable": false/);
});

test('external URL opening uses tauri-plugin-opener instead of deprecated shell open', () => {
  const cargo = read('src-tauri', 'Cargo.toml');
  const lib = read('src-tauri', 'src', 'lib.rs');
  const app = read('src-tauri', 'src', 'commands', 'app.rs');
  const capabilities = json('src-tauri', 'capabilities', 'default.json');

  assert.match(cargo, /tauri-plugin-opener\s*=\s*"2"/);
  assert.match(lib, /tauri_plugin_opener::init\(\)/);
  assert.match(app, /tauri_plugin_opener::open_url/);
  assert.doesNotMatch(app, /ShellExt|\.shell\(\)\.open/);
  assert.ok(capabilities.permissions.includes('opener:default'));
});
