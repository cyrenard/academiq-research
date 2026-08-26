const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('AQ Engine slash refresh keeps the stable citation runtime path with a router fallback', () => {
  const input = read('experiments', 'aq-engine', 'input.js');
  const runtime = read('src', 'citation-runtime.js');
  const app = read('src', 'renderer', 'App.tsx');

  assert.ok(input.indexOf('AQCitationRuntime.refreshFromEditor') < input.indexOf("__aqDispatchEditorCommand('citation.refresh'"));
  assert.ok(runtime.indexOf('AQCitationRuntime.refreshFromEditor') < runtime.indexOf("source:'citation-keyup-fallback'"));
  assert.match(runtime, /source:'citation-input-fallback'/);
  assert.match(app, /editorCommandRouter\.register\('citation\.refresh'/);
  assert.match(app, /editorCommandRouter\.register\('citation\.open'/);
});

test('drop and pasted-image events dispatch semantic file commands', () => {
  const host = read('src', 'renderer', 'components', 'shell', 'LegacyCompatibilityHost.tsx');
  assert.match(host, /register\('files\.drop\.paths'/);
  assert.match(host, /register\('files\.drop'/);
  assert.match(host, /register\('files\.paste\.images'/);
  assert.match(host, /dispatch\('files\.drop'/);
  assert.match(host, /dispatch\('files\.paste\.images'/);
});

test('central keyboard router claims handled shortcuts before legacy listeners', () => {
  const router = read('src', 'renderer', 'lib', 'keyboard-router.ts');
  assert.match(router, /event\.isComposing/);
  assert.match(router, /event\.stopImmediatePropagation\(\)/);
  assert.match(router, /allowExtraModifiers/);
});
