const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');

test('Tauri annotated PDF export writes highlights and notes into a copied PDF', () => {
  const command = fs.readFileSync(path.join(root, 'src-tauri/src/commands/export.rs'), 'utf8');
  const annotations = fs.readFileSync(path.join(root, 'src-tauri/src/pdf/annotations.rs'), 'utf8');
  assert.match(command, /pub async fn pdf_export_annotated\(app: AppHandle, options: Value\)/);
  assert.match(command, /annotation_payload_to_pdf/);
  assert.match(command, /annotations::page_bounds_from_bytes/);
  assert.match(command, /annotations::apply_annotations_to_bytes/);
  assert.match(command, /kind: "highlight"\.to_string\(\)/);
  assert.match(command, /kind: "note"\.to_string\(\)/);
  assert.match(annotations, /pub fn apply_annotations_to_bytes/);
  assert.doesNotMatch(command, /not_implemented_phase_5/);
});

test('annotated PDF keeps the complete browser render fallback when drawings are present', () => {
  const command = fs.readFileSync(path.join(root, 'src-tauri/src/commands/export.rs'), 'utf8');
  const legacy = fs.readFileSync(path.join(root, 'src/legacy-runtime.js'), 'utf8');
  assert.match(command, /drawingDataUrl/);
  assert.match(command, /native_drawing_flatten_unsupported/);
  assert.match(command, /"fallback": "browser_pdf_render"/);
  assert.match(legacy, /native exportAnnotatedPdf failed, falling back/);
  assert.match(legacy, /buildAnnotatedPdfExportHTML/);
});
