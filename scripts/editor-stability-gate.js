const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HIGH_RISK_TESTS = [
  'tests/tiptap-word-citation.test.js',
  'tests/tiptap-word-commands.test.js',
  'tests/tiptap-word-layout.test.js',
  'tests/tiptap-word-find.test.js',
  'tests/tiptap-word-shortcuts.test.js',
  'tests/tiptap-word-toolbar.test.js',
  'tests/ui-event-bindings.test.js',
  'tests/editor-runtime.test.js',
  'tests/editor-performance-smoke.test.js'
];

function parseCycles(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) return Math.min(parsed, 20);
  return 3;
}

function runEditorGateCycle(cycle, total) {
  const node = process.execPath;
  const args = ['--test', '--test-concurrency=1', '--test-isolation=none'].concat(HIGH_RISK_TESTS);
  console.log(`[editor-gate] cycle ${cycle}/${total}: ${node} ${args.join(' ')}`);
  const result = spawnSync(node, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });
  if (result.status !== 0) {
    const code = typeof result.status === 'number' ? result.status : 1;
    throw new Error(`editor stability cycle ${cycle} failed (exit ${code})`);
  }
}

function main() {
  const cycles = parseCycles(process.env.AQ_EDITOR_GATE_CYCLES);
  for (let i = 1; i <= cycles; i += 1) {
    runEditorGateCycle(i, cycles);
  }
  console.log('[editor-gate] PASS');
}

try {
  main();
} catch (error) {
  console.error('[editor-gate] FAIL:', error && error.message ? error.message : error);
  process.exit(1);
}
