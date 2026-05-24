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

test('npm build now targets Tauri while Electron build remains available', () => {
  const pkg = json('package.json');
  assert.equal(pkg.scripts.build, 'node scripts/build-tauri.js');
  assert.equal(pkg.scripts['build:electron'], 'node scripts/build-win.js');
  assert.equal(pkg.scripts['gate:tauri-bundle'], 'node scripts/tauri-bundle-gate.js');
  assert.equal(pkg.scripts['release:baseline'], 'npm run build && npm run gate:release');
});

test('release versions stay synchronized for the beta cutover build', () => {
  const pkg = json('package.json');
  const lock = json('package-lock.json');
  const conf = json('src-tauri', 'tauri.conf.json');
  const cargoToml = read('src-tauri', 'Cargo.toml');

  assert.equal(pkg.version, '1.24.0-beta.8');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(conf.version, pkg.version);
  assert.match(cargoToml, new RegExp(`^version = "${pkg.version.replace(/\./g, '\\.')}"$`, 'm'));
});


test('NSIS bundle metadata keeps Electron parity where Tauri supports it', () => {
  const conf = json('src-tauri', 'tauri.conf.json');
  assert.equal(conf.productName, 'AcademiQ Research');
  assert.deepEqual(conf.bundle.targets, ['nsis']);
  assert.equal(conf.bundle.publisher, 'AcademiQ');
  assert.equal(conf.bundle.copyright, 'Copyright (c) 2024 AcademiQ');
  assert.equal(conf.bundle.windows.nsis.installMode, 'currentUser');
  assert.deepEqual(conf.bundle.windows.nsis.languages, ['Turkish', 'English']);
  assert.equal(conf.bundle.windows.nsis.displayLanguageSelector, false);
  assert.equal(conf.bundle.windows.nsis.installerIcon, '../icon.ico');
  assert.equal(conf.bundle.windows.nsis.startMenuFolder, 'AcademiQ Research');
  assert.equal(conf.bundle.windows.nsis.compression, 'lzma');
  assert.ok(conf.bundle.resources.includes('../THIRD_PARTY_NOTICES.md'));
});

test('signing scripts keep private material out of git and document SmartScreen limits', () => {
  const gitignore = read('.gitignore');
  const envExample = read('.env.example');
  const generate = read('scripts', 'generate-signing-cert.ps1');
  const sign = read('scripts', 'sign-installer.ps1');
  const notice = read('docs', 'SMARTSCREEN_NOTICE.md');
  const pipeline = read('docs', 'RELEASE_PIPELINE.md');

  assert.match(gitignore, /scripts\/\.signing-thumbprint/);
  assert.match(gitignore, /\*\.pfx/);
  assert.match(gitignore, /\*\.key/);
  assert.match(envExample, /TAURI_SIGNING_PRIVATE_KEY_PATH/);
  assert.match(generate, /New-SelfSignedCertificate/);
  assert.doesNotMatch(generate, /CurrentUser\\Root|TrustedPublisher|Import-Certificate/);
  assert.match(sign, /signtool/);
  assert.match(sign, /verify \/v/);
  assert.doesNotMatch(sign, /verify \/pa/);
  assert.match(sign, /Signing Certificate Chain:/);
  assert.match(notice, /Unknown publisher|Bilinmeyen/);
  assert.match(pipeline, /latest\.json/);
});

test('Tauri build pipeline emits signed installer artifacts and updater manifest', () => {
  const build = read('scripts', 'build-tauri.js');
  const gate = read('scripts', 'tauri-bundle-gate.js');
  const releaseGate = read('scripts', 'release-gate.js');
  const mainRs = read('src-tauri', 'src', 'main.rs');

  assert.match(build, /cargo['"], \['tauri', 'build'\]/);
  assert.match(build, /sign-installer\.ps1/);
  assert.match(build, /SHA256SUMS\.txt/);
  assert.match(build, /latest\.json/);
  assert.match(build, /AcademiQ-Setup-\$\{pkg\.version\}\.exe/);
  assert.match(build, /currentVersionInstallers/);
  assert.match(build, /No NSIS installer for \$\{pkg\.version\}/);
  assert.match(build, /endsWith\('\.exe'\)/);
  assert.match(build, /Beta release - see CHANGELOG\.md/);
  assert.match(build, /THIRD_PARTY_NOTICES\.md/);
  assert.match(build, /dist['"], 'THIRD_PARTY_NOTICES\.md'/);
  assert.match(gate, /signtool/);
  assert.match(gate, /'\/v'/);
  assert.match(gate, /latest\.json/);
  assert.match(gate, /dist['"], 'THIRD_PARTY_NOTICES\.md'/);
  assert.match(releaseGate, /tauri-bundle-gate\.js/);
  assert.match(mainRs, /windows_subsystem = "windows"/);
});
