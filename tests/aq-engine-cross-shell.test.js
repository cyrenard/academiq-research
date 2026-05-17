const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(rootDir, ...parts), 'utf8');
}

test('AQ Engine integration coverage remains broad enough for both shells', () => {
  const source = read('tests', 'aq-engine-integration.test.js');
  const caseCount = (source.match(/\btest\(/g) || []).length;
  assert.ok(caseCount >= 54, `expected at least 54 AQ Engine integration cases, got ${caseCount}`);
});

test('React shell mounts AQ Engine without using the legacy app shell as entry', () => {
  const app = read('src', 'renderer', 'App.tsx');
  const editorHost = read('src', 'renderer', 'components', 'editor', 'EditorHost.tsx');
  const component = read('src', 'renderer', 'components', 'editor', 'AQEngineEditor.tsx');
  const editorAdapter = read('src', 'renderer', 'lib', 'editor-adapter.ts');
  const rendererMain = read('src', 'renderer', 'main.tsx');
  const rootIndex = read('index.html');

  assert.match(app, /EditorHost/);
  assert.match(editorHost, /AQEngineEditor/);
  assert.match(component, /createEditor/);
  assert.match(editorAdapter, /AQTipTapWordInit/);
  assert.match(rendererMain, /ReactDOM\.createRoot/);
  assert.match(rendererMain, /from '\.\/App'/);
  assert.match(rootIndex, /type="module" src="\/src\/renderer\/main\.tsx"/);
});

test('legacy shell keeps AQ Engine script order for Electron fallback', () => {
  const legacyIndex = read('index.html');
  const expectedOrder = [
    'experiments/aq-engine/document.js',
    'experiments/aq-engine/engine.js',
    'experiments/aq-engine/selection.js',
    'experiments/aq-engine/input.js',
    'experiments/aq-engine/tiptap-adapter.js',
    'experiments/aq-engine/compat-shim.js'
  ];
  const positions = expectedOrder.map((entry) => legacyIndex.indexOf(entry));
  positions.forEach((position, index) => assert.ok(position >= 0, expectedOrder[index]));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.match(legacyIndex, /src\/app-shell\.js|src\/lean-ui-shell\.js|src\/tiptap-shell\.js/);
});
