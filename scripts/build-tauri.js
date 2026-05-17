const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const srcTauriDir = path.join(rootDir, 'src-tauri');
const distDir = path.join(rootDir, 'dist', 'tauri');

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

function findInstallers() {
  const nsisDir = path.join(srcTauriDir, 'target', 'release', 'bundle', 'nsis');
  if (!fs.existsSync(nsisDir)) return [];
  return fs.readdirSync(nsisDir)
    .filter((name) => name.toLowerCase().endsWith('.exe'))
    .map((name) => path.join(nsisDir, name));
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function copyArtifacts(installers) {
  fs.mkdirSync(distDir, { recursive: true });
  const copied = [];
  for (const installer of installers) {
    const target = path.join(distDir, path.basename(installer));
    fs.copyFileSync(installer, target);
    const sig = `${installer}.sig`;
    if (fs.existsSync(sig)) {
      fs.copyFileSync(sig, `${target}.sig`);
    }
    copied.push(target);
  }
  return copied;
}

function latestJsonFor(installerPath) {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const sigPath = `${installerPath}.sig`;
  const signature = fs.existsSync(sigPath) ? fs.readFileSync(sigPath, 'utf8').trim() : '';
  const url = `https://updates.academiq.research/windows-x86_64/${pkg.version}/${path.basename(installerPath)}`;
  return {
    version: pkg.version,
    notes: 'AcademiQ Research Tauri release',
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
  runNpmScript('build:renderer');

  const signingKeyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH
    || path.join(process.env.USERPROFILE || '', '.tauri', 'academiq-updater.key');
  const env = {};
  if (signingKeyPath && fs.existsSync(signingKeyPath)) {
    env.TAURI_SIGNING_PRIVATE_KEY_PATH = signingKeyPath;
  }

  run('cargo', ['tauri', 'build'], 'cargo tauri build', { cwd: srcTauriDir, env });

  const installers = findInstallers();
  if (!installers.length) {
    throw new Error('No NSIS installer found under src-tauri/target/release/bundle/nsis');
  }
  for (const installer of installers) {
    signInstaller(installer);
  }
  const copied = copyArtifacts(installers);
  const primary = copied[0];
  const manifest = latestJsonFor(primary);
  fs.writeFileSync(path.join(distDir, 'latest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(distDir, 'SHA256SUMS.txt'),
    copied.map((file) => `${sha256(file)}  ${path.basename(file)}`).join('\n') + '\n',
    'utf8'
  );
  console.log(`[build-tauri] wrote ${path.relative(rootDir, path.join(distDir, 'latest.json'))}`);
}

try {
  main();
} catch (error) {
  console.error('[build-tauri] FAIL:', error && error.message ? error.message : error);
  process.exit(1);
}
