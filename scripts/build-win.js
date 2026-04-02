/**
 * Runs build pipeline with guaranteed restore of academiq-research.html.
 * This prevents leaving inlined sources behind when electron-builder fails.
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
let inlined = false;
let buildError = null;

try {
  runNodeScript('inline-src.js');
  inlined = true;
  runBuilder(dirMode);
} catch (error) {
  buildError = error;
} finally {
  if (inlined) {
    try {
      runNodeScript('restore-src.js');
    } catch (restoreError) {
      if (!buildError) throw restoreError;
      console.error('[build-win] restore failed:', restoreError && restoreError.message ? restoreError.message : restoreError);
    }
  }
}

if (buildError) {
  console.error('[build-win] build failed:', buildError && buildError.message ? buildError.message : buildError);
  process.exit(1);
}
