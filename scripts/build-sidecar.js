const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sidecar = path.join(root, 'src-sidecar', 'capture-agent');
const result = spawnSync('npx', [
  'pkg',
  'index.js',
  '--targets',
  'node18-win-x64',
  '--output',
  path.join(root, 'src-tauri', 'binaries', 'capture-agent-x86_64-pc-windows-msvc.exe')
], {
  cwd: sidecar,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

process.exit(result.status == null ? 1 : result.status);
