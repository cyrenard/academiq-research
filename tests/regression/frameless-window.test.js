const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..', '..');

test('Tauri window uses the React titlebar instead of the native Windows toolbar', () => {
  const config = JSON.parse(fs.readFileSync(path.join(rootDir, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const shell = fs.readFileSync(path.join(rootDir, 'src', 'renderer', 'components', 'shell', 'AppShell.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(rootDir, 'src', 'renderer', 'styles', 'app.css'), 'utf8');

  assert.equal(config.app.windows[0].decorations, false);
  assert.equal(config.app.windows[0].resizable, true);
  assert.match(shell, /aq-titlebar/);
  assert.match(shell, /minimizeWindow/);
  assert.match(shell, /toggleMaximizeWindow/);
  assert.match(shell, /closeWindow/);
  assert.match(css, /\.aq-titlebar\s*\{[\s\S]*-webkit-app-region:\s*drag/);
  assert.match(css, /\.aq-titlebar button,[\s\S]*-webkit-app-region:\s*no-drag/);
});
