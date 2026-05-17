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

function findInstallers(pkg) {
  const nsisDir = path.join(srcTauriDir, 'target', 'release', 'bundle', 'nsis');
  if (!fs.existsSync(nsisDir)) return [];
  const allInstallers = fs.readdirSync(nsisDir)
    .filter((name) => name.toLowerCase().endsWith('.exe'))
    .map((name) => path.join(nsisDir, name));
  const currentVersionInstallers = allInstallers.filter((installer) => {
    const name = path.basename(installer).toLowerCase();
    return name.includes(pkg.version.toLowerCase());
  });
  return currentVersionInstallers;
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function releaseInstallerName(pkg) {
  return `AcademiQ-Setup-${pkg.version}.exe`;
}

function copyArtifacts(installers, pkg) {
  fs.mkdirSync(distDir, { recursive: true });
  fs.readdirSync(distDir)
    .filter((name) => name.toLowerCase().endsWith('.exe') || name.toLowerCase().endsWith('.exe.sig'))
    .forEach((name) => fs.rmSync(path.join(distDir, name), { force: true }));
  const rootDist = path.join(rootDir, 'dist');
  if (fs.existsSync(rootDist)) {
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
  fs.rmSync(path.join(rootDir, 'dist', releaseInstallerName(pkg)), { force: true });
  fs.rmSync(path.join(distDir, releaseInstallerName(pkg)), { force: true });
  const copied = [];
  installers.forEach((installer, index) => {
    const name = index === 0 ? releaseInstallerName(pkg) : path.basename(installer);
    const target = path.join(distDir, name);
    fs.copyFileSync(installer, target);
    if (index === 0) {
      fs.copyFileSync(installer, path.join(rootDir, 'dist', name));
    }
    const sig = `${installer}.sig`;
    if (fs.existsSync(sig)) {
      fs.copyFileSync(sig, `${target}.sig`);
      if (index === 0) {
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

function latestJsonFor(installerPath) {
  const pkg = readPackage();
  const sigPath = `${installerPath}.sig`;
  const signature = fs.existsSync(sigPath) ? fs.readFileSync(sigPath, 'utf8').trim() : '';
  const url = `https://updates.academiq.research/windows-x86_64/${pkg.version}/${path.basename(installerPath)}`;
  return {
    version: pkg.version,
    notes: pkg.version.includes('-beta') ? 'Beta release - see CHANGELOG.md' : 'AcademiQ Research Tauri release',
    pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': {
        signature,
        url
      },
      'windows-x86_64-nsis': {
        signature,
        url
      }
    }
  };
}

function signInstaller(installerPath) {
  if (process.env.ACADEMIQ_SKIP_SIGN === '1') {
    console.warn('[build-tauri] ACADEMIQ_SKIP_SIGN=1, skipping Authenticode signing.');
    return;
  }
  const script = path.join(rootDir, 'scripts', 'sign-installer.ps1');
  run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-InstallerPath', installerPath], 'sign installer');
}

function main() {
  const pkg = readPackage();
  runNpmScript('build:renderer');

  const signingKeyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH
    || path.join(process.env.USERPROFILE || '', '.tauri', 'academiq-updater.key');
  const env = {};
  if (signingKeyPath && fs.existsSync(signingKeyPath)) {
    env.TAURI_SIGNING_PRIVATE_KEY_PATH = signingKeyPath;
  }

  run('cargo', ['tauri', 'build'], 'cargo tauri build', { cwd: srcTauriDir, env });

  const installers = findInstallers(pkg);
  if (!installers.length) {
    throw new Error(`No NSIS installer for ${pkg.version} found under src-tauri/target/release/bundle/nsis`);
  }
  for (const installer of installers) {
    signInstaller(installer);
  }
  const copied = copyArtifacts(installers, pkg);
  const primary = copied[0];
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

try {
  main();
} catch (error) {
  console.error('[build-tauri] FAIL:', error && error.message ? error.message : error);
  process.exit(1);
}
