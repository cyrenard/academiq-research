const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(rootDir, ...parts), 'utf8');
}

test('destructive editor deletes rely on viewport reflow instead of global repaint hacks', () => {
  const layout = read('src', 'tiptap-word-layout.js');
  const compat = read('experiments', 'aq-engine', 'compat-shim.js');
  assert.match(layout, /function scheduleDestructiveMutationRepaint\(reason\)/);
  assert.match(layout, /isLikelyLinux\(\)/);
  assert.match(layout, /key === 'Backspace' \|\| key === 'Delete'/);
  assert.match(layout, /document\.addEventListener\('cut'/);
  assert.doesNotMatch(layout, /scheduleDestructiveMutationRepaint\('key:'/);
  assert.doesNotMatch(layout, /scheduleDestructiveMutationRepaint\(inputType \|\| 'input-delete'\)/);
  assert.doesNotMatch(layout, /scheduleDestructiveMutationRepaint\('cut'\)/);
  assert.match(compat, /renderLayout\(layout, visiblePageRange\(layout\)\)/);
});

test('find inputs own focus so editor focus restoration cannot steal Ctrl+F typing', () => {
  const focus = read('src', 'tiptap-word-focus.js');
  const core = read('src', 'editor-core.js');
  const integration = read('src', 'editor-integration.js');
  const citation = read('src', 'citation-runtime.js');
  const toolbar = read('src', 'renderer', 'components', 'shell', 'TopToolbar.tsx');
  assert.match(focus, /function isFindFocusActive\(doc\)/);
  assert.match(focus, /#toolbarFindInp,#toolbarReplaceFindInp,#toolbarReplaceInp,#findbar,#findReplaceQuickMenuModal/);
  assert.match(core, /isFindFocusActive\(document\)/);
  assert.match(integration, /isFindFocusActive\(document\)/);
  assert.match(citation, /isFindFocusActive\(document\)/);
  assert.match(toolbar, /__aqFindFocusOwnerUntil = Date\.now\(\) \+ 30000/);
  assert.match(toolbar, /event\.stopPropagation\(\)/);
});

test('bibliography dialog skips native Linux filters and keeps post-selection validation', () => {
  const dialog = read('src-tauri', 'src', 'commands', 'dialog.rs');
  assert.match(dialog, /#\[cfg\(not\(target_os = "linux"\)\)\]/);
  assert.match(dialog, /add_filter\("BibTeX \/ RIS", &\["bib", "ris", "enw"\]\)/);
  assert.match(dialog, /matches!\(ext\.as_str\(\), "bib" \| "ris" \| "enw" \| "txt" \| "apa"\)/);
});

test('browser capture popup renders a controlled error instead of blanking when extension APIs are unavailable', () => {
  for (const base of ['browser-capture-extension', path.join('src-tauri', 'resources', 'browser-capture-extension')]) {
    const popup = read(base, 'common', 'popup.js');
    assert.match(popup, /typeof chrome !== 'undefined'/);
    assert.match(popup, /function hasExtensionApi\(\)/);
    assert.match(popup, /extension_runtime_api_unavailable/);
    assert.match(popup, /Tarayici eklenti API erisimi yok/);
    for (const browser of ['chromium', 'firefox']) {
      const html = read(base, browser, 'popup.html');
      const bundledPopup = read(base, browser, 'popup.js');
      assert.match(html, /Popup yukleniyor\.\.\./);
      assert.equal(bundledPopup, popup);
    }
  }
});
