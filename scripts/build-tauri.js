const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const srcTauriDir = path.join(rootDir, 'src-tauri');
const distDir = path.join(rootDir, 'dist', 'tauri');

function readPackage() {
  return JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
}

function run(command, args, label, options = {}) {
  console.log(`[build-tauri] ${label}: ${command} ${(args || []).join(' ')}`);
  const result = spawnSync(command, args || [], {
    cwd: options.cwd || rootDir,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ...(options.env || {}) }
  });
  if (result.error) throw result.error;
  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

function runNpmScript(scriptName) {
  if (process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)) {
    run(process.execPath, [process.env.npm_execpath, 'run', scriptName], `npm run ${scriptName}`);
    return;
  }
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (fs.existsSync(npmCli)) {
    run(process.execPath, [npmCli, 'run', scriptName], `npm run ${scriptName}`);
    return;
  }
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', scriptName], `npm run ${scriptName}`);
}

function bundleProfile(platform = process.platform) {
  if (platform === 'win32') {
    return {
      platformKey: 'windows-x86_64',
      extraPlatformKeys: ['windows-x86_64-nsis'],
      bundleDirs: ['nsis'],
      installerPattern: /\.exe$/i,
      distCleanupPattern: /\.exe(\.sig)?$/i,
      currentVersionOnly: true,
      signed: true,
      releaseInstallerName: (pkg) => `AcademiQ-Setup-${pkg.version}.exe`
    };
  }
  if (platform === 'linux') {
    return {
      platformKey: 'linux-x86_64',
      extraPlatformKeys: [],
      bundleDirs: ['appimage', 'rpm', 'deb'],
      installerPattern: /\.(appimage|rpm|deb)$/i,
      distCleanupPattern: /\.(appimage|rpm|deb)(\.sig)?$/i,
      currentVersionOnly: false,
      signed: false,
      releaseInstallerName: null
    };
  }
  if (platform === 'darwin') {
    return {
      platformKey: 'darwin-x86_64',
      extraPlatformKeys: [],
      bundleDirs: ['dmg', 'macos'],
      installerPattern: /\.(dmg|app\.tar\.gz)$/i,
      distCleanupPattern: /\.(dmg|app\.tar\.gz)(\.sig)?$/i,
      currentVersionOnly: false,
      signed: false,
      releaseInstallerName: null
    };
  }
  throw new Error(`Unsupported Tauri bundle platform: ${platform}`);
}

function findInstallers(pkg, platform = process.platform) {
  const profile = bundleProfile(platform);
  const bundleRoot = path.join(srcTauriDir, 'target', 'release', 'bundle');
  const allInstallers = profile.bundleDirs.flatMap((dirName) => {
    const dir = path.join(bundleRoot, dirName);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((name) => profile.installerPattern.test(name))
      .map((name) => path.join(dir, name));
  });
  const installers = profile.currentVersionOnly
    ? allInstallers.filter((installer) => path.basename(installer).toLowerCase().includes(pkg.version.toLowerCase()))
    : allInstallers;
  return installers.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function releaseInstallerName(pkg) {
  return bundleProfile('win32').releaseInstallerName(pkg);
}

function selectPrimaryInstaller(installers, platform = process.platform) {
  if (!Array.isArray(installers) || !installers.length) return '';
  if (platform === 'linux') {
    return installers.find((file) => /\.AppImage$/i.test(file)) || installers[0];
  }
  return installers[0];
}

function copyArtifacts(installers, pkg, platform = process.platform) {
  const profile = bundleProfile(platform);
  fs.mkdirSync(distDir, { recursive: true });
  fs.readdirSync(distDir)
    .filter((name) => profile.distCleanupPattern.test(name))
    .forEach((name) => fs.rmSync(path.join(distDir, name), { force: true }));
  const rootDist = path.join(rootDir, 'dist');
  if (platform === 'win32' && fs.existsSync(rootDist)) {
    fs.readdirSync(rootDist, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => /^AcademiQ-Setup-.*\.exe(\.sig)?$/i.test(name))
      .filter((name) => name !== releaseInstallerName(pkg) && name !== `${releaseInstallerName(pkg)}.sig`)
      .forEach((name) => {
        const source = path.join(rootDist, name);
        const backup = `${source}.bak`;
        fs.rmSync(backup, { force: true });
        fs.renameSync(source, backup);
      });
  }
  if (platform === 'win32') {
    fs.rmSync(path.join(rootDir, 'dist', releaseInstallerName(pkg)), { force: true });
    fs.rmSync(path.join(distDir, releaseInstallerName(pkg)), { force: true });
  }
  const copied = [];
  installers.forEach((installer, index) => {
    const name = platform === 'win32' && index === 0 ? releaseInstallerName(pkg) : path.basename(installer);
    const target = path.join(distDir, name);
    fs.copyFileSync(installer, target);
    if (platform === 'win32' && index === 0) {
      fs.copyFileSync(installer, path.join(rootDir, 'dist', name));
    }
    const sig = `${installer}.sig`;
    if (fs.existsSync(sig)) {
      fs.copyFileSync(sig, `${target}.sig`);
      if (platform === 'win32' && index === 0) {
        fs.copyFileSync(sig, path.join(rootDir, 'dist', `${name}.sig`));
      }
    }
    copied.push(target);
  });
  return copied;
}

function copyThirdPartyNotices() {
  const source = path.join(rootDir, 'THIRD_PARTY_NOTICES.md');
  if (!fs.existsSync(source)) {
    throw new Error('THIRD_PARTY_NOTICES.md is missing');
  }
  const target = path.join(rootDir, 'dist', 'THIRD_PARTY_NOTICES.md');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`[build-tauri] copied ${path.relative(rootDir, target)}`);
}

function latestJsonFor(installerPath, platform = process.platform) {
  const pkg = readPackage();
  const profile = bundleProfile(platform);
  const sigPath = `${installerPath}.sig`;
  const signature = fs.existsSync(sigPath) ? fs.readFileSync(sigPath, 'utf8').trim() : '';
  const url = `https://updates.academiq.research/${profile.platformKey}/${pkg.version}/${path.basename(installerPath)}`;
  const platformEntry = {
    signature,
    url
  };
  const platforms = {
    [profile.platformKey]: platformEntry
  };
  for (const key of profile.extraPlatformKeys) {
    platforms[key] = platformEntry;
  }
  return {
    version: pkg.version,
    notes: pkg.version.includes('-beta') ? 'Beta release - see CHANGELOG.md' : 'AcademiQ Research Tauri release',
    pub_date: new Date().toISOString(),
    platforms
  };
}

function hasUpdaterSigningKey(env = process.env, signingKeyPath = '') {
  return Boolean(
    String(env.TAURI_SIGNING_PRIVATE_KEY || '').trim()
    || (signingKeyPath && fs.existsSync(signingKeyPath))
  );
}

function windowsSignCommand() {
  const script = path.join(rootDir, 'scripts', 'sign-installer.ps1');
  return `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${script}" -InstallerPath %1`;
}

function main() {
  const pkg = readPackage();
  runNpmScript('build:renderer');

  const signingKeyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH
    || path.join(process.env.USERPROFILE || '', '.tauri', 'academiq-updater.key');
  const env = {};
  if (signingKeyPath && fs.existsSync(signingKeyPath)) {
    // The bundler consistently accepts TAURI_SIGNING_PRIVATE_KEY as either
    // key contents or a path; normalize the documented *_PATH convenience
    // variable into that canonical channel.
    env.TAURI_SIGNING_PRIVATE_KEY = signingKeyPath;
  }
  const updaterSigningReady = hasUpdaterSigningKey(process.env, signingKeyPath);
  if (process.env.ACADEMIQ_REQUIRE_UPDATER_SIGNATURE === '1' && !updaterSigningReady) {
    throw new Error('Updater signing key is required for this release build');
  }

  const buildArgs = ['tauri', 'build'];
  const bundleOverride = process.env.ACADEMIQ_TAURI_BUNDLES || process.env.TAURI_BUNDLES || '';
  if (bundleOverride) {
    buildArgs.push('--bundles', bundleOverride);
  }
  const configPatch = { bundle: {} };
  if (!updaterSigningReady) {
    // Tauri requires a private key when createUpdaterArtifacts is enabled.
    // PR/local smoke installers remain buildable but cannot masquerade as a
    // signed update channel artifact.
    configPatch.bundle.createUpdaterArtifacts = false;
  }
  if (process.platform === 'win32' && process.env.ACADEMIQ_SKIP_SIGN !== '1') {
    // Run Authenticode inside Tauri's bundling phase. Tauri creates the updater
    // .sig after this command, so the updater signature covers the final
    // Authenticode-signed installer bytes.
    configPatch.bundle.windows = { signCommand: windowsSignCommand() };
  }
  if (Object.keys(configPatch.bundle).length) {
    buildArgs.push('--config', JSON.stringify(configPatch));
  }
  run('cargo', buildArgs, 'cargo tauri build', { cwd: srcTauriDir, env });

  const installers = findInstallers(pkg);
  if (!installers.length) {
    throw new Error(`No ${process.platform} installer for ${pkg.version} found under src-tauri/target/release/bundle`);
  }
  const copied = copyArtifacts(installers, pkg);
  const primary = selectPrimaryInstaller(copied, process.platform);
  const manifest = latestJsonFor(primary);
  fs.writeFileSync(path.join(distDir, 'latest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(distDir, 'SHA256SUMS.txt'),
    copied.map((file) => `${sha256(file)}  ${path.basename(file)}`).join('\n') + '\n',
    'utf8'
  );
  copyThirdPartyNotices();
  console.log(`[build-tauri] wrote ${path.relative(rootDir, path.join(distDir, 'latest.json'))}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('[build-tauri] FAIL:', error && error.message ? error.message : error);
    process.exit(1);
  }
}

module.exports = {
  bundleProfile,
  copyArtifacts,
  findInstallers,
  hasUpdaterSigningKey,
  latestJsonFor,
  releaseInstallerName,
  selectPrimaryInstaller,
  windowsSignCommand
};
