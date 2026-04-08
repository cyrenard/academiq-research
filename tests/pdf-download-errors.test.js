const test = require('node:test');
const assert = require('node:assert/strict');

const pdfDownloadErrors = require('../src/pdf-download-errors.js');

test('classifyPdfDownloadFailure marks 403 as protected access', () => {
  const out = pdfDownloadErrors.classifyPdfDownloadFailure('HTTP 403');
  assert.equal(out.type, 'protected_access');
  assert.equal(out.statusCode, 403);
  assert.equal(out.isProtectedAccess, true);
});

test('classifyPdfDownloadFailure marks mismatch errors as verification failures', () => {
  const out = pdfDownloadErrors.classifyPdfDownloadFailure('PDF DOI kanıtı yok');
  assert.equal(out.type, 'verification_failed');
  assert.equal(out.isProtectedAccess, false);
});
