const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist', 'tauri');

function fail(message) {
  throw new Error(message);
}

function parseBundleTargets(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function platformKey(platform = process.platform) {
  if (platform === 'win32') return 'windows-x86_64';
  if (platform === 'linux') return 'linux-x86_64';
  if (platform === 'darwin') return 'darwin-x86_64';
  return `${platform}-x86_64`;
}

function installerPattern(platform = process.platform) {
  if (platform === 'win32') return /\.exe$/i;
  if (platform === 'linux') return /\.(rpm|deb|appimage)$/i;
  if (platform === 'darwin') return /\.(dmg|app\.tar\.gz)$/i;
  return /\.(exe|rpm|deb|appimage|dmg|app\.tar\.gz)$/i;
}

function expectedPdfiumResource(platform = process.platform) {
  if (platform === 'linux') return 'binaries/libpdfium.so';
  if (platform === 'darwin') return 'binaries/libpdfium.dylib';
  return 'binaries/pdfium.dll';
}

function shouldVerifySignature(platform = process.platform, env = process.env) {
  return platform === 'win32' && env.ACADEMIQ_SKIP_SIGN !== '1';
}

function shouldRequireUpdaterSignature(env = process.env) {
  return env.ACADEMIQ_REQUIRE_UPDATER_SIGNATURE === '1';
}

function sidecarBinaryName(platform = process.platform) {
  if (platform === 'win32') return 'capture-agent-x86_64-pc-windows-msvc.exe';
  if (platform === 'linux') return 'capture-agent-x86_64-unknown-linux-gnu';
  if (platform === 'darwin') {
    return process.arch === 'arm64'
      ? 'capture-agent-aarch64-apple-darwin'
      : 'capture-agent-x86_64-apple-darwin';
  }
  return '';
}

function verifyTauriConfig(
  platform = process.platform,
  configJson = null,
  targetOverride = process.env.ACADEMIQ_TAURI_BUNDLES || process.env.TAURI_BUNDLES || ''
) {
  const conf = configJson || JSON.parse(fs.readFileSync(path.join(rootDir, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const targets = targetOverride
    ? parseBundleTargets(targetOverride)
    : (conf.bundle && conf.bundle.targets) || [];
  if (platform === 'win32' && !targets.includes('nsis')) {
    fail('tauri.conf.json must include nsis for Windows release builds');
  }
  if (platform === 'linux' && !targets.some((target) => ['rpm', 'deb', 'appimage'].includes(String(target).toLowerCase()))) {
    fail('Linux release builds must target rpm, deb, or appimage');
  }
  const resources = (conf.bundle && conf.bundle.resources) || [];
  const expected = expectedPdfiumResource(platform);
  if (!resources.includes(expected)) {
    fail(`tauri.conf.json must bundle ${expected}`);
  }
  if (conf.bundle.createUpdaterArtifacts !== true) {
    fail('tauri.conf.json must enable bundle.createUpdaterArtifacts for signed releases');
  }
  if (!Array.isArray(conf.bundle.externalBin) || !conf.bundle.externalBin.includes('binaries/capture-agent')) {
    fail('tauri.conf.json must bundle the capture-agent sidecar');
  }
  const updater = conf.plugins && conf.plugins.updater;
  let decodedPublicKey = '';
  try {
    decodedPublicKey = Buffer.from(String(updater && updater.pubkey || ''), 'base64').toString('utf8');
  } catch (_error) {}
  if (!/minisign public key/i.test(decodedPublicKey) || !Array.isArray(updater.endpoints)
      || !updater.endpoints.every((endpoint) => /^https:\/\//i.test(String(endpoint)))) {
    fail('Tauri updater must have a valid embedded minisign public key and HTTPS endpoints');
  }
  return true;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function verifyChecksums(installers) {
  const checksumPath = path.join(distDir, 'SHA256SUMS.txt');
  if (!fs.existsSync(checksumPath)) fail('dist/tauri/SHA256SUMS.txt is missing');
  const entries = new Map(
    fs.readFileSync(checksumPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => /^(\w{64})\s{2}(.+)$/.exec(line.trim()))
      .filter(Boolean)
      .map((match) => [match[2], match[1].toLowerCase()])
  );
  for (const installer of installers) {
    const name = path.basename(installer);
    if (entries.get(name) !== sha256(installer)) {
      fail(`SHA256SUMS.txt does not match ${name}`);
    }
  }
}

function verifyUpdaterManifest(latest, installers, platform, env) {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const entry = latest.platforms && latest.platforms[platformKey(platform)];
  if (latest.version !== pkg.version || !entry) {
    fail('latest.json version/platform does not match this build');
  }
  if (!/^https:\/\//i.test(String(entry.url || ''))) {
    fail('latest.json updater URL must use HTTPS');
  }
  const artifactName = decodeURIComponent(String(entry.url).split('/').pop() || '');
  const installer = installers.find((file) => path.basename(file) === artifactName);
  if (!installer) fail('latest.json URL does not point at a bundled installer');
  if (shouldRequireUpdaterSignature(env)) {
    const signature = String(entry.signature || '').trim();
    if (signature.length < 40 || !fs.existsSync(`${installer}.sig`)) {
      fail('Signed release requires a non-empty updater signature and matching .sig artifact');
    }
  }
}

function findSignTool() {
  const kitsRoot = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin');
  if (!fs.existsSync(kitsRoot)) return null;
  const stack = [kitsRoot];
  const matches = [];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.toLowerCase() === 'signtool.exe' && /\\x64\\/i.test(full)) matches.push(full);
    }
  }
  return matches.sort().at(-1) || null;
}

function verifySignature(installerPath) {
  const signtool = findSignTool();
  if (!signtool) fail('signtool.exe not found');
  const result = spawnSync(signtool, ['verify', '/v', installerPath], { encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.status !== 0 && !/Signing Certificate Chain:/.test(output)) {
    fail(`signtool signature presence check failed for ${installerPath}`);
  }
}

function main(platform = process.platform, env = process.env) {
  const conf = JSON.parse(fs.readFileSync(path.join(rootDir, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  verifyTauriConfig(platform, conf);
  const sidecarName = sidecarBinaryName(platform);
  const sidecarPath = path.join(rootDir, 'src-tauri', 'binaries', sidecarName);
  if (!sidecarName || !fs.existsSync(sidecarPath) || fs.statSync(sidecarPath).size < 1024 * 1024) {
    fail(`Packaged capture sidecar is missing or unexpectedly small: ${sidecarName}`);
  }
  if (!fs.existsSync(distDir)) fail('dist/tauri does not exist; run npm run build first');
  const noticesPath = path.join(rootDir, 'dist', 'THIRD_PARTY_NOTICES.md');
  if (!fs.existsSync(noticesPath)) fail('dist/THIRD_PARTY_NOTICES.md is missing');
  const pattern = installerPattern(platform);
  const installers = fs.readdirSync(distDir)
    .filter((name) => pattern.test(name))
    .map((name) => path.join(distDir, name));
  if (!installers.length) fail('No Tauri installer in dist/tauri');

  const latestPath = path.join(distDir, 'latest.json');
  if (!fs.existsSync(latestPath)) fail('dist/tauri/latest.json is missing');
  const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
  verifyUpdaterManifest(latest, installers, platform, env);
  verifyChecksums(installers);

  for (const installer of installers) {
    const sizeMb = fs.statSync(installer).size / (1024 * 1024);
    if (sizeMb > 250) fail(`${path.basename(installer)} is unexpectedly large (${sizeMb.toFixed(1)} MB)`);
    if (shouldVerifySignature(platform, env)) {
      verifySignature(installer);
    }
  }

  console.log('[tauri-bundle-gate] PASS');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('[tauri-bundle-gate] FAIL:', error && error.message ? error.message : error);
    process.exit(1);
  }
}

module.exports = {
  expectedPdfiumResource,
  installerPattern,
  parseBundleTargets,
  platformKey,
  shouldRequireUpdaterSignature,
  shouldVerifySignature,
  sidecarBinaryName,
  verifyChecksums,
  verifyUpdaterManifest,
  verifyTauriConfig
};
