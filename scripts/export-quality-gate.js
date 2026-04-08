const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

function read(relPath) {
  return fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8');
}

function mustMatch(source, pattern, message) {
  assert.match(source, pattern, message);
}

function mustNotMatch(source, pattern, message) {
  assert.doesNotMatch(source, pattern, message);
}

function main() {
  const mainJs = read('main.js');
  const runtimeJs = read('src/legacy-runtime.js');
  const bindingsJs = read('src/ui-event-bindings.js');
  const documentJs = read('src/tiptap-word-document.js');
  const html = read('academiq-research.html');

  mustMatch(mainJs, /buildExportHTML\(options\)/, 'main export path must build clean export html');
  mustMatch(mainJs, /new BrowserWindow\(/, 'main export path must print from hidden export window');
  mustMatch(mainJs, /exportWindow\.webContents\.printToPDF\(/, 'main export path must print clean export window');

  mustMatch(documentJs, /function buildExportPDFHTML\(/, 'document builder must expose PDF export HTML');
  mustMatch(documentJs, /function buildExportPreviewHTML\(/, 'document builder must expose preview HTML');
  mustMatch(documentJs, /function decorateExportLayout\(/, 'document builder must decorate export layout');

  mustMatch(bindingsJs, /ddExpPreviewBtn/, 'export preview action must be wired');
  mustMatch(bindingsJs, /ddExpPdfBtn'.*execAndClose\('expPDF'\)/s, 'PDF action must route through expPDF');

  mustMatch(html, /id="ddExpPreviewBtn"/, 'export preview button must exist in toolbar dropdown');
  mustMatch(html, /id="exportPreviewModal"/, 'export preview modal must exist');

  mustNotMatch(runtimeJs, /window\.print\(\);/, 'legacy runtime must not fall back to live window.print');
  mustNotMatch(bindingsJs, /root\.print\(\)/, 'toolbar export must not use root.print');

  console.log('[export-gate] PASS');
}

try {
  main();
} catch (error) {
  console.error('[export-gate] FAIL:', error && error.message ? error.message : error);
  process.exit(1);
}
