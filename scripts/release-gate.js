const { spawnSync } = require('child_process');
const path = require('path');

function runStep(label, command, args, options) {
  options = options || {};
  const pretty = [command].concat(args || []).join(' ');
  console.log(`[gate] ${label}: ${pretty}`);
  const result = spawnSync(command, args || [], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    shell: !!options.shell,
    env: process.env
  });
  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message || String(result.error)}`);
  }
  if (result.status !== 0) {
    const code = typeof result.status === 'number' ? result.status : 1;
    throw new Error(`${label} failed (exit ${code})`);
  }
}

function main() {
  const node = process.execPath;
  runStep('syntax', node, ['--check', 'main.js']);
  runStep('syntax', node, ['--check', 'preload.js']);
  runStep('syntax', node, ['--check', 'scripts/editor-stability-gate.js']);
  runStep('syntax', node, ['--check', 'scripts/export-quality-gate.js']);
  runStep('export quality', node, ['scripts/export-quality-gate.js']);
  runStep('editor stability', node, ['scripts/editor-stability-gate.js']);
  runStep('tests', node, ['--test', '--test-concurrency=1', '--test-isolation=none', 'tests/*.test.js']);
  console.log('[gate] PASS');
}

try {
  main();
} catch (error) {
  console.error('[gate] FAIL:', error && error.message ? error.message : error);
  process.exit(1);
}
