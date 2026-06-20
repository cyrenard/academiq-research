const fs = require('fs');
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
  return true;
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
  verifyTauriConfig(platform);
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
  if (!latest.version || !latest.platforms || !latest.platforms[platformKey(platform)]) {
    fail('latest.json does not match the Tauri updater manifest shape');
  }

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
  shouldVerifySignature,
  verifyTauriConfig
};
