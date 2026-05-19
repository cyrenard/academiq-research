const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');

test('Tauri shell keeps the app clickable while restoring a narrow drag zone', () => {
  const css = fs.readFileSync(path.join(root, 'src/renderer/styles/app.css'), 'utf8');
  const shell = fs.readFileSync(path.join(root, 'src/renderer/components/shell/AppShell.tsx'), 'utf8');
  assert.match(css, /\.aq-soft-shell,\s*\n\.aq-soft-shell \*\s*\{[\s\S]*?-webkit-app-region: no-drag;/);
  assert.doesNotMatch(css, /\.aq-titlebar\s*\{[^}]*-webkit-app-region:\s*drag/);
  assert.match(css, /\.aq-titlebar-drag-zone\s*\{[\s\S]*?-webkit-app-region:\s*drag;/);
  assert.match(css, /\.aq-titlebar button,[\s\S]*?\.aq-window-control\s*\{[\s\S]*?-webkit-app-region:\s*no-drag;/);
  assert.match(shell, /aq-titlebar-drag-zone/);
});
