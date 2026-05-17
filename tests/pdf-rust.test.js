const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const rootDir = path.join(__dirname, '..');

async function writeFixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'academiq-phase3-pdf-'));

  const sample = await PDFDocument.create();
  sample.setTitle('AcademiQ Phase 3 Fixture');
  sample.setAuthor('AcademiQ');
  const font = await sample.embedFont(StandardFonts.Helvetica);
  const page = sample.addPage([612, 792]);
  page.drawText('AcademiQ Phase 3 Text', { x: 72, y: 700, size: 18, font, color: rgb(0, 0, 0) });
  fs.writeFileSync(path.join(dir, 'sample.pdf'), await sample.save());

  const large = await PDFDocument.create();
  large.setTitle('AcademiQ Phase 3 Large Fixture');
  const largeFont = await large.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 100; i += 1) {
    const p = large.addPage([612, 792]);
    p.drawText(`AcademiQ large page ${i}`, { x: 72, y: 700, size: 12, font: largeFont });
  }
  fs.writeFileSync(path.join(dir, 'large.pdf'), await large.save());

  const scanned = await PDFDocument.create();
  scanned.setTitle('AcademiQ Phase 3 Scanned Fixture');
  scanned.addPage([612, 792]);
  fs.writeFileSync(path.join(dir, 'scanned.pdf'), await scanned.save());

  return dir;
}

function cargoPdfTests(fixtureDir) {
  const result = spawnSync('cargo', ['test', 'phase3_pdf_', '--', '--nocapture'], {
    cwd: path.join(rootDir, 'src-tauri'),
    env: { ...process.env, AQ_PDF_FIXTURE_DIR: fixtureDir },
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout + result.stderr;
}

test('Rust PDF pipeline covers metadata, annotations, render, text, ingest and perf', async () => {
  const fixtureDir = await writeFixtures();
  const output = cargoPdfTests(fixtureDir);
  for (const name of [
    'phase3_pdf_metadata_extracts_basic_fields',
    'phase3_pdf_annotation_roundtrip_and_db_sync',
    'phase3_pdf_render_page_returns_png',
    'phase3_pdf_text_extraction_finds_known_string',
    'phase3_pdf_ingest_updates_library_items_projection',
    'phase3_pdf_perf_budget_large_annotation_and_render'
  ]) {
    assert.match(output, new RegExp(`${name} \\.\\.\\. ok`), name);
  }
});
