const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');

test('PDF reader load keeps maintenance work off the open path', () => {
  const source = fs.readFileSync(path.join(root, 'src-tauri/src/commands/pdf.rs'), 'utf8');
  const loadStart = source.indexOf('pub async fn pdf_load');
  const loadEnd = source.indexOf('#[tauri::command]', loadStart + 1);
  const loadBody = source.slice(loadStart, loadEnd);
  assert.doesNotMatch(loadBody, /cleanup_legacy_pdf_copies/);

  const resolveStart = source.indexOf('async fn resolve_existing_pdf_path');
  const resolveEnd = source.indexOf('async fn cleanup_legacy_pdf_copies', resolveStart);
  const resolveBody = source.slice(resolveStart, resolveEnd);
  assert.ok(resolveBody.indexOf('direct_names') < resolveBody.indexOf('resolve_ref_title_from_state'));
  assert.ok(resolveBody.indexOf('direct_names') < resolveBody.indexOf('find_pdf_by_hash'));
});
