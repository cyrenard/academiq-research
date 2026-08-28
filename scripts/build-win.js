/**
 * Builds the current React renderer before invoking electron-builder.
 * The archived legacy single-file renderer is not part of current packages.
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

function runNodeScript(scriptName) {
  run(process.execPath, [path.join(__dirname, scriptName)], 'node ' + scriptName);
}

function runBuilder(dirMode) {
  const args = ['--win', '--x64'];
  if (dirMode) args.push('--dir');
  const cliPath = path.join(rootDir, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
  if (fs.existsSync(cliPath)) {
    run(process.execPath, [cliPath].concat(args), 'electron-builder');
    return;
  }
  const bin = process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder';
  run(bin, args, 'electron-builder');
}

const dirMode = process.argv.includes('--dir');

try {
  runNodeScript('build-renderer.js');
  runBuilder(dirMode);
} catch (error) {
  console.error('[build-win] build failed:', error && error.message ? error.message : error);
  process.exit(1);
}
