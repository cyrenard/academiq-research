const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');

test('AQ Engine editor update events are bridged into React autosave', () => {
  const adapter = fs.readFileSync(path.join(root, 'src/renderer/lib/editor-adapter.ts'), 'utf8');
  assert.match(adapter, /function attachEditorUpdateBridge/);
  assert.match(adapter, /editor\.on\('update', handler\)/);
  assert.match(adapter, /activeNotify\?\.\(\)/);
  assert.match(adapter, /attachEditorUpdateBridge\(activeEditor\)/);
  assert.match(adapter, /activeDetachUpdate\?\.\(\)/);
});

test('React editor host keeps lightweight DOM dirty fallback for AQ Engine input', () => {
  const host = fs.readFileSync(path.join(root, 'src/renderer/components/editor/AQEngineEditor.tsx'), 'utf8');
  assert.match(host, /beforeinput/);
  assert.match(host, /compositionend/);
  assert.doesNotMatch(host, /new MutationObserver/);
  assert.match(host, /editorRef\.current\?\.getHTML/);
  assert.match(host, /onEditorChangeRef\.current/);
  assert.doesNotMatch(host, /scheduleCitationAudit\(\);\s*\n\s*notifyFromEditor/);
});
