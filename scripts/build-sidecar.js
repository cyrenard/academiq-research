const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sidecar = path.join(root, 'src-sidecar', 'capture-agent');
const targets = {
  win32: {
    pkg: 'node18-win-x64',
    binary: 'capture-agent-x86_64-pc-windows-msvc.exe'
  },
  linux: {
    pkg: 'node18-linux-x64',
    binary: 'capture-agent-x86_64-unknown-linux-gnu'
  },
  darwin: {
    pkg: 'node18-macos-x64',
    binary: 'capture-agent-x86_64-apple-darwin'
  }
};

const target = targets[process.platform];
if (!target) {
  console.error(`unsupported sidecar build platform: ${process.platform}`);
  process.exit(1);
}

const result = spawnSync('npx', [
  'pkg',
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

process.exit(result.status == null ? 1 : result.status);
