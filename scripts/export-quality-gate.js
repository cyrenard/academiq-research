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
  mustMatch(documentJs, /aq-export-page-break-before/, 'document export css must preserve explicit page breaks');
  mustMatch(documentJs, /aq-biblio-heading/, 'document export css must protect bibliography headings');

  mustMatch(bindingsJs, /ddExpPreviewBtn/, 'export preview action must be wired');
  mustMatch(bindingsJs, /ddExpPdfBtn'.*execAndClose\('expPDF'\)/s, 'PDF action must route through expPDF');

  mustMatch(html, /id="ddExpPreviewBtn"/, 'export preview button must exist in toolbar dropdown');
  mustMatch(html, /id="exportPreviewModal"/, 'export preview modal must exist');
  mustMatch(mainJs, /filters:\s*\[\{\s*name:\s*'Word Belgesi',\s*extensions:\s*\['docx'\]\s*\}\]/s, 'DOCX export dialog must only offer .docx');
  mustMatch(mainJs, /targetPath\s*=\s*\/\\\.docx\$\/i\.test\(saveResult\.filePath\)/, 'DOCX export must force .docx extension');
  mustMatch(runtimeJs, /function getCompositeExportBodyHTML\(/, 'runtime must build a composite export document');
  mustMatch(runtimeJs, /aq-export-cover/, 'composite export must include cover section support');
  mustMatch(runtimeJs, /aq-export-toc/, 'composite export must include table of contents section support');
  mustMatch(runtimeJs, /aq-export-main/, 'composite export must include main document section support');
  mustMatch(runtimeJs, /aq-export-bib/, 'composite export must include bibliography section support');
  mustMatch(runtimeJs, /refreshExportAuxSections\(\)/, 'export must refresh auxiliary sections before rendering');
  mustMatch(runtimeJs, /updateRefSection\(false\)/, 'export refresh must update bibliography before export');
  mustMatch(runtimeJs, /applyLineSpacingForExportHTML/, 'export must normalize line spacing in generated sections');

  mustNotMatch(runtimeJs, /window\.print\(\);/, 'legacy runtime must not fall back to live window.print');
  mustNotMatch(bindingsJs, /root\.print\(\)/, 'toolbar export must not use root.print');
  mustNotMatch(runtimeJs, /makale\.doc['"]/, 'DOC export fallback must not emit legacy .doc files');
  mustNotMatch(html, /makale\.doc['"]/, 'inline export fallback must not emit legacy .doc files');
  mustNotMatch(runtimeJs, /application\/msword/, 'DOC export fallback must not create fake Word HTML blobs');
  mustNotMatch(html, /application\/msword/, 'inline export fallback must not create fake Word HTML blobs');

  console.log('[export-gate] PASS');
}

try {
  main();
} catch (error) {
  console.error('[export-gate] FAIL:', error && error.message ? error.message : error);
  process.exit(1);
}
