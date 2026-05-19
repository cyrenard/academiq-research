const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');

test('Tauri PDF bridge renders exported HTML to PDF bytes before native save', () => {
  const bridge = fs.readFileSync(path.join(root, 'src/tauri-api.ts'), 'utf8');
  assert.match(bridge, /async function buildPdfBase64FromHtml/);
  assert.match(bridge, /window\.html2pdf/);
  assert.match(bridge, /\.outputPdf\('blob'\)/);
  assert.match(bridge, /pdfBase64/);
  assert.match(bridge, /stage: 'browser_pdf_render'/);
  assert.match(bridge, /adaptiveScale/);
  assert.match(bridge, /letterRendering: false/);
});

test('Tauri PDF export command writes pdfBase64 through save dialog', () => {
  const command = fs.readFileSync(path.join(root, 'src-tauri/src/commands/export.rs'), 'utf8');
  assert.match(command, /pub async fn export_pdf\(\s*app: AppHandle,\s*layout_json: Option<String>,\s*options: Value,\s*\) -> Result<Value, String>/);
  assert.match(command, /options\.get\("pdfBase64"\)/);
  assert.match(command, /"PDF Document"/);
  assert.match(command, /&\["pdf"\]/);
  assert.match(command, /save_base64_file/);
});

test('PDF export surfaces native or render errors instead of unknown error', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  const legacy = fs.readFileSync(path.join(root, 'src/legacy-runtime.js'), 'utf8');
  assert.match(app, /PDF dışa aktarılamadı: \$\{message\}/);
  assert.match(legacy, /result\.error\|\|result\.message\|\|JSON\.stringify\(result\)/);
});
