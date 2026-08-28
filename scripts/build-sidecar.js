const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sidecar = path.join(root, 'src-sidecar', 'capture-agent');
const targets = {
  'win32-x64': {
    pkg: 'node18-win-x64',
    binary: 'capture-agent-x86_64-pc-windows-msvc.exe'
  },
  'linux-x64': {
    pkg: 'node18-linux-x64',
    binary: 'capture-agent-x86_64-unknown-linux-gnu'
  },
  'darwin-x64': {
    pkg: 'node18-macos-x64',
    binary: 'capture-agent-x86_64-apple-darwin'
  },
  'darwin-arm64': {
    pkg: 'node18-macos-arm64',
    binary: 'capture-agent-aarch64-apple-darwin'
  }
};

const target = targets[`${process.platform}-${process.arch}`];
if (!target) {
  console.error(`unsupported sidecar build platform: ${process.platform}-${process.arch}`);
  process.exit(1);
}

const pkgExecutable = path.join(
  sidecar,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'pkg.cmd' : 'pkg'
);
if (!fs.existsSync(pkgExecutable)) {
  console.error('pkg is not installed; run npm ci in src-sidecar/capture-agent first');
  process.exit(1);
}

const result = spawnSync(pkgExecutable, [
  'index.js',
  '--targets',
  target.pkg,
  '--output',
  path.join(root, 'src-tauri', 'binaries', target.binary)
], {
  cwd: sidecar,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (result.error) {
  console.error(result.error.message || String(result.error));
}
process.exit(result.status == null ? 1 : result.status);
