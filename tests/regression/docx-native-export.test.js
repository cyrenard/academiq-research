const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');

test('React DOCX export sends generated DOCX bytes to native Tauri save command', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  assert.match(app, /buildDocxBytesFromHTML/);
  assert.match(app, /window\.electronAPI\?\.exportDOCX\?\.\(\{/);
  assert.match(app, /base64: window\.btoa\(binary\)/);
  assert.doesNotMatch(app, /exportHTMLToDocx\(html, 'academiq-document\.docx'\)/);
});

test('Tauri DOCX export command writes base64 DOCX payload through save dialog', () => {
  const command = fs.readFileSync(path.join(root, 'src-tauri/src/commands/export.rs'), 'utf8');
  assert.match(command, /pub async fn export_docx\(app: AppHandle, options: Value\)/);
  assert.match(command, /"Word Document"/);
  assert.match(command, /&\["docx"\]/);
  assert.match(command, /add_filter\(filter_name, extensions\)/);
  assert.match(command, /general_purpose::STANDARD/);
  assert.match(command, /fs::write\(&path, &bytes\)/);
  assert.doesNotMatch(command, /stub\("export:docx"\)/);
});
