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
  if (result.status !== 0) {
    const code = typeof result.status === 'number' ? result.status : 1;
    throw new Error(`${label} failed (exit ${code})`);
  }
}

function main() {
  const node = process.execPath;
  const npm = process.platform === 'win32'
    ? path.join(path.dirname(node), 'npm.cmd')
    : 'npm';
  runStep('syntax', node, ['--check', 'main.js']);
  runStep('syntax', node, ['--check', 'preload.js']);
  runStep('export quality', node, ['scripts/export-quality-gate.js']);
  if(process.platform === 'win32'){
    runStep('tests', 'cmd.exe', ['/d', '/s', '/c', `${npm} test -- --runInBand`]);
  }else{
    runStep('tests', npm, ['test', '--', '--runInBand']);
  }
  console.log('[gate] PASS');
}

try {
  main();
} catch (error) {
  console.error('[gate] FAIL:', error && error.message ? error.message : error);
  process.exit(1);
}
