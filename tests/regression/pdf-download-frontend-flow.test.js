const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..', '..');

test('OA PDF frontend flow invokes pdf:download and records last attempt', () => {
  const app = fs.readFileSync(path.join(rootDir, 'src', 'renderer', 'App.tsx'), 'utf8');
  assert.match(app, /localStorage\.setItem\('aq\.lastPdfDownloadAttempt'/);
  assert.match(app, /downloadPDFfromURL\?\.\(String\(ref\.pdfUrl\), referenceId/);
  assert.match(app, /for \(const candidateUrl of urls\)/);
  assert.match(app, /downloadPDFfromURL\?\.\(candidateUrl, referenceId/);
  assert.match(app, /for \(const url of urls\)/);
  assert.match(app, /downloadPDFfromURL\?\.\(url, reference\.id/);
  assert.match(app, /resolveOpenAccessPdfUrls/);
  assert.match(app, /pdfAttached: true/);
  assert.match(app, /source: 'batch-oa'/);
  assert.match(app, /source: 'reference-action'/);
  assert.match(app, /source: 'reference-import'/);
  assert.doesNotMatch(app, /win\.batchDownloadOA/);
});
