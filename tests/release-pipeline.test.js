const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..');
const buildTauri = require('../scripts/build-tauri.js');
const bundleGate = require('../scripts/tauri-bundle-gate.js');
const linuxConfig = require('../scripts/configure-tauri-linux.js');

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

test('release versions stay synchronized for the Fedora beta build', () => {
  const pkg = json('package.json');
  const lock = json('package-lock.json');
  const conf = json('src-tauri', 'tauri.conf.json');
  const cargoToml = read('src-tauri', 'Cargo.toml');

  assert.equal(pkg.version, '1.24.1-beta.7');
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

  assert.match(build, /const buildArgs = \['tauri', 'build'\]/);
  assert.match(build, /ACADEMIQ_TAURI_BUNDLES/);
  assert.match(build, /buildArgs\.push\('--bundles', bundleOverride\)/);
  assert.match(build, /sign-installer\.ps1/);
  assert.match(build, /SHA256SUMS\.txt/);
  assert.match(build, /latest\.json/);
  assert.match(build, /AcademiQ-Setup-\$\{pkg\.version\}\.exe/);
  assert.match(build, /linux-x86_64/);
  assert.match(build, /appimage/);
  assert.match(build, /rpm/);
  assert.match(build, /Beta release - see CHANGELOG\.md/);
  assert.match(build, /THIRD_PARTY_NOTICES\.md/);
  assert.match(build, /dist['"], 'THIRD_PARTY_NOTICES\.md'/);
  assert.match(gate, /signtool/);
  assert.match(gate, /'\/v'/);
  assert.match(gate, /ACADEMIQ_SKIP_SIGN/);
  assert.match(gate, /linux-x86_64/);
  assert.match(gate, /latest\.json/);
  assert.match(gate, /dist['"], 'THIRD_PARTY_NOTICES\.md'/);
  assert.match(releaseGate, /tauri-bundle-gate\.js/);
  assert.match(mainRs, /windows_subsystem = "windows"/);
});

test('Linux bundle helpers prepare Fedora beta resources without changing Windows defaults', () => {
  const conf = json('src-tauri', 'tauri.conf.json');
  const configured = linuxConfig.configureLinuxBundle(conf, ['rpm', 'appimage']);

  assert.deepEqual(conf.bundle.targets, ['nsis']);
  assert.ok(conf.bundle.resources.includes('binaries/pdfium.dll'));
  assert.deepEqual(configured.bundle.targets, ['rpm', 'appimage']);
  assert.ok(configured.bundle.icon.includes('../icon.png'));
  assert.equal(configured.bundle.resources.includes('binaries/pdfium.dll'), false);
  assert.ok(configured.bundle.resources.includes('binaries/libpdfium.so'));
  assert.deepEqual(linuxConfig.parseTargets('rpm, appimage'), ['rpm', 'appimage']);
});

test('bundle gate validates Windows and Fedora beta platform expectations', () => {
  const conf = json('src-tauri', 'tauri.conf.json');
  const linuxBundle = linuxConfig.configureLinuxBundle(conf, ['rpm', 'appimage']);

  assert.equal(bundleGate.verifyTauriConfig('win32', conf), true);
  assert.equal(bundleGate.verifyTauriConfig('linux', linuxBundle), true);
  assert.deepEqual(bundleGate.parseBundleTargets('rpm,appimage'), ['rpm', 'appimage']);
  assert.equal(bundleGate.platformKey('linux'), 'linux-x86_64');
  assert.equal(bundleGate.expectedPdfiumResource('linux'), 'binaries/libpdfium.so');
  assert.equal(bundleGate.shouldVerifySignature('win32', { ACADEMIQ_SKIP_SIGN: '1' }), false);
  assert.equal(bundleGate.shouldVerifySignature('win32', {}), true);
  assert.equal(bundleGate.installerPattern('linux').test('AcademiQ-Research-1.24.1-beta.1.x86_64.rpm'), true);
});

test('build helper emits platform-specific updater manifests', () => {
  const windowsManifest = buildTauri.latestJsonFor(path.join(rootDir, 'dist', 'tauri', 'AcademiQ-Setup-1.24.1-beta.1.exe'), 'win32');
  const linuxManifest = buildTauri.latestJsonFor(path.join(rootDir, 'dist', 'tauri', 'academiq-research_1.24.1-beta.1_amd64.AppImage'), 'linux');

  assert.ok(windowsManifest.platforms['windows-x86_64']);
  assert.ok(windowsManifest.platforms['windows-x86_64-nsis']);
  assert.ok(linuxManifest.platforms['linux-x86_64']);
  assert.match(linuxManifest.platforms['linux-x86_64'].url, /linux-x86_64/);
  assert.equal(buildTauri.bundleProfile('linux').installerPattern.test('AcademiQ.AppImage'), true);
});

test('GitHub release workflow publishes Windows and Fedora beta artifacts together', () => {
  const workflow = read('.github', 'workflows', 'release.yml');

  assert.match(workflow, /build-windows:/);
  assert.match(workflow, /build-linux:/);
  assert.match(workflow, /Publish GitHub release/);
  assert.match(workflow, /ACADEMIQ_TAURI_BUNDLES: rpm,appimage/);
  assert.match(workflow, /libpdfium\.so/);
  assert.match(workflow, /capture-agent-x86_64-unknown-linux-gnu/);
  assert.match(workflow, /\*\.rpm/);
  assert.match(workflow, /\*\.AppImage/);
  assert.match(workflow, /contains\(github\.ref_name, 'beta'\)/);
});
