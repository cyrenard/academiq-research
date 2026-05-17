const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..');
const artifactDir = path.join(__dirname, 'artifacts');

test('Rust PDF export covers 5, 25, and 50 page APA layout fixtures', () => {
  const result = spawnSync('cargo', ['test', 'phase5_pdf_export_', '--', '--nocapture'], {
    cwd: path.join(rootDir, 'src-tauri'),
    env: { ...process.env, AQ_EXPORT_ARTIFACT_DIR: artifactDir },
    encoding: 'utf8',
    timeout: 240000
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const output = result.stdout + result.stderr;
  assert.match(output, /phase5_pdf_export_writes_pages_and_embeds_font \.\.\. ok/);
  assert.match(output, /phase5_pdf_export_handles_apa_page_counts \.\.\. ok/);
  assert.ok(fs.existsSync(path.join(artifactDir, 'phase5-50-page-apa.pdf')));
});
