const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..', '..');

function read(file) {
  return fs.readFileSync(path.join(rootDir, file), 'utf8');
}

test('React shell installs a global file drop router', () => {
  const host = read('src/renderer/components/shell/LegacyCompatibilityHost.tsx');
  assert.match(host, /handleDroppedFiles/);
  assert.match(host, /window\.addEventListener\('dragenter'/);
  assert.match(host, /window\.addEventListener\('dragover'/);
  assert.match(host, /window\.addEventListener\('drop'/);
  assert.match(host, /dataTransfer\?\.files/);
  assert.match(host, /Dosyaları içe aktar/);
});

test('drop router maps file types to the same import engines as legacy inputs', () => {
  const router = read('src/renderer/lib/drop-router.ts');
  assert.match(router, /importPdfFiles/);
  assert.match(router, /win\.hPDFs/);
  assert.match(router, /importWordFileObject/);
  assert.match(router, /importBibliographyFileObject/);
  assert.match(router, /importZoteroFileObject/);
  assert.match(router, /insertImageFileObject/);
  assert.match(router, /docx\?/);
  assert.match(router, /bib\|ris\|enw\|apa/);
  assert.match(router, /json\|rdf/);
  assert.match(router, /type\.startsWith\('image\/'\)/);
});

test('direct file-object wrappers preserve existing input import implementations', () => {
  const source = read('src/renderer/lib/file-import.ts');
  assert.match(source, /function fileInputEvent/);
  assert.match(source, /export async function importWordFileObject/);
  assert.match(source, /importWordFileDirect\(fileInputEvent\(file\), onStatus\)/);
  assert.match(source, /export async function importBibliographyFileObject/);
  assert.match(source, /importBibliographyFile\(fileInputEvent\(file\), onStatus\)/);
  assert.match(source, /export function importZoteroFileObject/);
});
