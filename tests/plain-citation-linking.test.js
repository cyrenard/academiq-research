const test = require('node:test');
const assert = require('node:assert/strict');

const linking = require('../src/plain-citation-linking.js');

const refs = [
  { id: 'selwyn-2016', authors: ['Selwyn, Neil'], year: '2016', title: 'Education and technology' },
  { id: 'castaneda-2018', authors: ['Castañeda, Linda', 'Selwyn, Neil'], year: '2018', title: 'More than tools?' },
  { id: 'barros-2024', authors: ['Barros, Ana'], year: '2024' },
  { id: 'litan-2025', authors: ['Lițan, Maria'], year: '2025' },
  { id: 'ostermann-2021', authors: ['Ostermann, Thomas'], year: '2021' }
];

test('detectPlainCitations finds parenthetical APA citations', () => {
  const found = linking.detectPlainCitations('Metin (Selwyn, 2016) devam.');
  assert.equal(found.length, 1);
  assert.equal(found[0].mode, 'inline');
  assert.equal(found[0].entries[0].surname, 'Selwyn');
  assert.equal(found[0].entries[0].year, '2016');
});

test('detectPlainCitations finds multi-reference parenthetical citations', () => {
  const found = linking.detectPlainCitations('Metin (Barros, 2024; Lițan, 2025) devam.');
  assert.equal(found.length, 1);
  assert.deepEqual(found[0].entries.map((entry) => entry.normalizedSurname), ['barros', 'litan']);
});

test('detectPlainCitations finds Turkish vd narrative citations', () => {
  const found = linking.detectPlainCitations('Ostermann vd. (2021) bunu tartışır.');
  assert.equal(found.length, 1);
  assert.equal(found[0].mode, 'textual');
  assert.equal(found[0].entries[0].normalizedSurname, 'ostermann');
});

test('matchOccurrence links all entries only when each match is unique', () => {
  const occurrence = linking.detectPlainCitations('Metin (Castañeda & Selwyn, 2018; Barros, 2024).')[0];
  const matched = linking.matchOccurrence(occurrence, refs);
  assert.equal(matched.complete, true);
  assert.deepEqual(matched.refIds, ['castaneda-2018', 'barros-2024']);
});

test('scanAQEngine skips existing semantic citations and bibliography blocks', () => {
  const editor = {
    _aqEngine: true,
    _docModel: {
      get: () => ({
        blocks: [
          { runs: [{ text: 'Metin (Selwyn, 2016)' }] },
          { runs: [{ text: '(Barros, 2024)', citation: { ref: 'barros-2024' } }] },
          { _isBibEntry: true, runs: [{ text: 'Ostermann (2021)' }] }
        ]
      }),
      blockTextLength: (index) => [20, 14, 16][index] || 0
    }
  };
  const matches = linking.scanAQEngine(editor, refs);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].refIds[0], 'selwyn-2016');
});

test('linkHighConfidence applies citation marks without changing text', () => {
  const marks = [];
  const editor = {
    _aqEngine: true,
    _docModel: {
      get: () => ({ blocks: [{ runs: [{ text: 'Metin (Selwyn, 2016)' }] }] }),
      blockTextLength: () => 20,
      applyMark: (from, to, mark, value) => marks.push({ from, to, mark, value })
    },
    _reflow: () => {}
  };
  const result = linking.linkHighConfidence(editor, refs, { root: {} });
  assert.equal(result.linked, 1);
  assert.equal(marks[0].mark, 'citation');
  assert.equal(marks[0].value.ref, 'selwyn-2016');
  assert.equal(marks[0].value.mode, 'inline');
});

test('linkRange can explicitly bind an imported plain citation', () => {
  const occurrence = linking.detectPlainCitations('Metin Selwyn (2016) devam.')[0];
  const marks = [];
  const editor = {
    _aqEngine: true,
    _docModel: {
      applyMark: (from, to, mark, value) => marks.push({ from, to, mark, value })
    },
    _reflow: () => {}
  };
  assert.equal(linking.linkRange(editor, occurrence, ['selwyn-2016'], 'textual'), true);
  assert.equal(marks[0].mark, 'citation');
  assert.equal(marks[0].value.ref, 'selwyn-2016');
  assert.equal(marks[0].value.mode, 'textual');
});

test('unlinkCitationAtOffset and deleteCitationAtOffset target the semantic citation run', () => {
  const marks = [];
  const deletes = [];
  const editor = {
    _aqEngine: true,
    _docModel: {
      get: () => ({ blocks: [{ runs: [
        { text: 'Metin ' },
        { text: '(Selwyn, 2016)', citation: { ref: 'selwyn-2016', mode: 'inline' } },
        { text: ' devam' }
      ] }] }),
      blockTextLength: () => 27,
      applyMark: (from, to, mark, value) => marks.push({ from, to, mark, value }),
      deleteRange: (from, to) => deletes.push({ from, to })
    },
    _reflow: () => {}
  };
  assert.equal(linking.unlinkCitationAtOffset(editor, 8), true);
  assert.deepEqual(marks[0], { from: 6, to: 20, mark: 'citation', value: false });
  assert.equal(linking.deleteCitationAtOffset(editor, 8), true);
  assert.deepEqual(deletes[0], { from: 6, to: 20 });
});

test('findPlainMatchAtOffset finds only the citation under the cursor', () => {
  const editor = {
    _aqEngine: true,
    _docModel: {
      get: () => ({ blocks: [{ runs: [{ text: 'Metin (Selwyn, 2016) ve Ostermann (2021).' }] }] }),
      blockTextLength: () => 43
    }
  };
  const match = linking.findPlainMatchAtOffset(editor, refs, 10);
  assert.equal(match.refIds[0], 'selwyn-2016');
});

test('summarizeMatches counts safe and unresolved imported citations', () => {
  const safe = linking.matchOccurrence(
    linking.detectPlainCitations('Metin (Selwyn, 2016).')[0],
    refs
  );
  const missing = linking.matchOccurrence(
    linking.detectPlainCitations('Metin (Unknown, 2026).')[0],
    refs
  );
  const summary = linking.summarizeMatches([safe, missing]);
  assert.equal(summary.scanned, 2);
  assert.equal(summary.linkable, 1);
  assert.equal(summary.unresolved, 1);
});

test('analyzeImportedDocument summarizes citations, bibliography lines and heading candidates', () => {
  const editor = {
    _aqEngine: true,
    _docModel: {
      get: () => ({ blocks: [
        { runs: [{ text: 'GİRİŞ' }] },
        { runs: [{ text: 'Metin (Selwyn, 2016).' }] },
        { runs: [{ text: 'Kaynakça' }] },
        { runs: [{ text: 'Selwyn, N. (2016). Education and technology. Bloomsbury.' }] }
      ] }),
      blockTextLength: (index) => [5, 22, 8, 56][index] || 0
    }
  };
  const analysis = linking.analyzeImportedDocument(editor, refs);
  assert.equal(analysis.plainCitationSummary.scanned, 1);
  assert.equal(analysis.plainCitationSummary.linkable, 1);
  assert.equal(analysis.bibliographyLines.length, 1);
  assert.ok(analysis.headingCandidateCount >= 2);
});

test('runtime listens for the Tauri word import committed event', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'plain-citation-linking.js'), 'utf8');
  assert.match(source, /aq:word-import-committed/);
  assert.match(source, /window\.openPlainCitationLinking/);
  assert.match(source, /window\.linkHighConfidencePlainCitations/);
});

test('context menu can resolve AQ Engine offsets from point hit-testing', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'plain-citation-linking.js'), 'utf8');
  assert.match(source, /AQEngineSelection/);
  assert.match(source, /pointToOffset\(stage,\s*event\.clientX/);
  assert.match(source, /textarea:not\(\.aq-input-capture\)/);
});

test('plain citation linking also opens from normal text click and toolbar', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'plain-citation-linking.js'), 'utf8');
  const toolbar = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'components', 'shell', 'TopToolbar.tsx'), 'utf8');
  assert.match(source, /function showEditorClickSuggestion/);
  assert.match(source, /document\.addEventListener\('click', showEditorClickSuggestion, true\)/);
  assert.match(source, /findPlainMatchAtOffset\(editor, currentWorkspaceReferences\(\), offset\)/);
  assert.match(toolbar, /openPlainCitationLinking/);
  assert.match(toolbar, /callLegacy\('openPlainCitationLinking'\)/);
});
