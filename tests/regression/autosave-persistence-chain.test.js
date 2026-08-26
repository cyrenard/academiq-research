const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..', '..');

test('React editor changes promote draft updates into full saveData autosave', () => {
  const source = fs.readFileSync(path.join(rootDir, 'src', 'renderer', 'App.tsx'), 'utf8');
  const coordinator = fs.readFileSync(path.join(rootDir, 'src', 'renderer', 'lib', 'save-coordinator.ts'), 'utf8');
  assert.match(source, /const saveDataChecked = useCallback\(async/);
  assert.match(source, /queueAppStateSave\(nextState, source\)/);
  assert.match(coordinator, /save_before_hydration/);
  assert.match(coordinator, /this\.tail\.then/);
  assert.match(coordinator, /result\.ok !== true/);
  assert.match(coordinator, /recordSaveResult\('aq\.lastSaveError'/);
  assert.match(source, /const scheduleFullAutosave = useCallback/);
  assert.match(source, /saveDataChecked\(appStateRef\.current, source\)/);
  assert.match(source, /scheduleFullAutosave\(nextState\)/);
  assert.match(source, /__aqReactPersistLegacyState/);
  assert.match(source, /scheduleFullAutosave\(appStateRef\.current, 0, 'legacy-autosave'\)/);
  assert.match(source, /markAppStateHydrated\(\)/);
  assert.match(source, /if \(!result \|\| result\.ok !== true\)/);
});

test('React shell is the only owner of startup editor hydration', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const legacy = fs.readFileSync(path.join(rootDir, 'src', 'legacy-runtime.js'), 'utf8');
  const adapter = fs.readFileSync(path.join(rootDir, 'src', 'renderer', 'lib', 'editor-adapter.ts'), 'utf8');
  assert.ok(html.indexOf('window.__aqReactShellActive = true') < html.indexOf('/src/legacy-runtime.js'));
  assert.match(legacy, /if\(!window\.__aqReactShellActive\)\{\s*applyCurrentEditorHTML/);
  assert.match(legacy, /if\(!window\.__aqReactShellActive&&window\.AQEditorLifecycle/);
  assert.match(legacy, /if\(window\.__aqReactShellActive\)\{\s*try\{/);
  assert.match(legacy, /__aqReactPersistLegacyState\(S\|\|\{\}\)/);
  assert.match(adapter, /activeHydrating = true/);
  assert.ok(adapter.indexOf('hydrateInitialDocument(win, options.docId, options.initialState)') < adapter.indexOf('attachEditorUpdateBridge(activeEditor)'));
  assert.match(adapter, /legacySave && !\(win as any\)\.__aqReactShellActive/);
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

test('startup recovery runs before automatic backup rotation', () => {
  const source = fs.readFileSync(path.join(rootDir, 'src-tauri', 'src', 'lib.rs'), 'utf8');
  const recovery = source.indexOf('db::migrate::load_state(&dir)');
  const backup = source.indexOf('commands::backup::backup_create_auto(handle)');
  assert.ok(recovery >= 0, 'startup recovery call is missing');
  assert.ok(backup > recovery, 'automatic backup runs before recovery');
});
