const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..');
const artifactDir = path.join(__dirname, 'artifacts');

test('expanded PDF export diff gate is backed by Rust PDF export fixtures', () => {
  const source = fs.readFileSync(path.join(rootDir, 'src-tauri', 'src', 'pdf', 'export.rs'), 'utf8');
  assert.match(source, /phase5_pdf_export_writes_pages_and_embeds_font/);
  assert.match(source, /phase5_pdf_export_handles_apa_page_counts/);
  assert.ok(
    /Türkçe ğ ş ı ö ü ç/.test(source) || /TÃ¼rkÃ§e/.test(source),
    'expected Turkish text coverage in Rust PDF export fixtures'
  );
  assert.match(source, /font_substituted/);
});

test('Tauri PDF export still produces parseable multi-page artifacts', () => {
  const result = spawnSync('cargo', ['test', 'phase5_pdf_export_', '--', '--nocapture'], {
    cwd: path.join(rootDir, 'src-tauri'),
    env: { ...process.env, AQ_EXPORT_ARTIFACT_DIR: artifactDir },
    encoding: 'utf8',
    timeout: 240000
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(fs.existsSync(path.join(artifactDir, 'phase5-50-page-apa.pdf')));
});
