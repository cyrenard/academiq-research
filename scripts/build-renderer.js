/**
 * Runs the renderer build without shell chaining.
 * This avoids Node DEP0190 warnings from shell-based script execution.
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false
  });
  if (result.error) throw result.error;
  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(label + ' failed with exit code ' + result.status);
  }
}

function resolveViteCli() {
  const cli = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
  if (fs.existsSync(cli)) return cli;
  throw new Error('vite CLI not found. Run npm install first.');
}

run(process.execPath, [resolveViteCli(), 'build'], 'vite build');
run(process.execPath, [path.join(__dirname, 'patch-renderer-index.js')], 'patch-renderer-index');
