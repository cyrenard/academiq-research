const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..');

function pdfEscape(text) {
  return String(text || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function writePdf(filePath, { title, author = '', pages }) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = add('<< /Type /Catalog /Pages 2 0 R >>');
  assert.equal(catalogId, 1);
  objects.push(null); // pages tree placeholder, object 2
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = [];
  for (const page of pages) {
    const content = `BT /F1 ${page.size || 18} Tf 72 700 Td (${pdfEscape(page.text || '')}) Tj ET`;
    const contentId = add(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const infoId = add(`<< /Title (${pdfEscape(title)}) /Author (${pdfEscape(author)}) >>`);

  let out = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, idx) => {
    offsets[idx + 1] = Buffer.byteLength(out, 'latin1');
    out += `${idx + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.writeFileSync(filePath, Buffer.from(out, 'latin1'));
}

function writeFixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'academiq-phase3-pdf-'));
  writePdf(path.join(dir, 'sample.pdf'), {
    title: 'AcademiQ Phase 3 Fixture',
    author: 'AcademiQ',
    pages: [{ text: 'AcademiQ Phase 3 Text', size: 18 }]
  });
  writePdf(path.join(dir, 'large.pdf'), {
    title: 'AcademiQ Phase 3 Large Fixture',
    author: 'AcademiQ',
    pages: Array.from({ length: 100 }, (_, index) => ({
      text: `AcademiQ large page ${index + 1}`,
      size: 12
    }))
  });
  writePdf(path.join(dir, 'scanned.pdf'), {
    title: 'AcademiQ Phase 3 Scanned Fixture',
    author: 'AcademiQ',
    pages: [{ text: '', size: 12 }]
  });
  return dir;
}

function cargoPdfTests(fixtureDir) {
  const result = spawnSync('cargo', ['test', 'phase3_pdf_', '--', '--nocapture'], {
    cwd: path.join(rootDir, 'src-tauri'),
    env: { ...process.env, AQ_PDF_FIXTURE_DIR: fixtureDir },
    encoding: 'utf8',
    timeout: 240000
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout + result.stderr;
}

test('Rust PDF pipeline covers metadata, annotations, render, text, ingest and perf', () => {
  const fixtureDir = writeFixtures();
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
