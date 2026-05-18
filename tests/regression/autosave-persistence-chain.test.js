const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..', '..');

test('React editor changes promote draft updates into full saveData autosave', () => {
  const source = fs.readFileSync(path.join(rootDir, 'src', 'renderer', 'App.tsx'), 'utf8');
  assert.match(source, /const saveDataChecked = useCallback\(async/);
  assert.match(source, /result\.ok !== true/);
  assert.match(source, /localStorage\.setItem\('aq\.lastSaveError'/);
  assert.match(source, /const scheduleFullAutosave = useCallback/);
  assert.match(source, /saveDataChecked\(appStateRef\.current, 'editor-autosave'\)/);
  assert.match(source, /scheduleFullAutosave\(nextState\)/);
});

test('React shell flushes current editor html on app close lifecycle events', () => {
  const source = fs.readFileSync(path.join(rootDir, 'src', 'renderer', 'App.tsx'), 'utf8');
  assert.match(source, /const flushNow = \(source: string\)/);
  assert.match(source, /updateActiveDocumentHTML\(appStateRef\.current, String\(currentHTML\)\)/);
  assert.match(source, /saveDataChecked\(appStateRef\.current, source\)/);
  assert.match(source, /window\.addEventListener\('beforeunload', onBeforeUnload\)/);
  assert.match(source, /window\.addEventListener\('pagehide', onPageHide\)/);
  assert.match(source, /document\.addEventListener\('visibilitychange', onVisibilityChange\)/);
});

test('SQLite projection update avoids deleting documents during every save', () => {
  const source = fs.readFileSync(path.join(rootDir, 'src-tauri', 'src', 'db', 'migrate.rs'), 'utf8');
  assert.match(source, /delete_removed_document_projection/);
  assert.doesNotMatch(source, /"documents",\s*\]\s*\{\s*tx\.execute\(&format!\("DELETE FROM \{table\}"/s);
  assert.match(source, /ON CONFLICT\(id\) DO UPDATE SET/);
});
