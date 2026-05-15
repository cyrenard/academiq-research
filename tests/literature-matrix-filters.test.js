const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.AQLiteratureGapMap = require('../src/literature-gap-map.js');
const filters = require('../src/literature-matrix-filters.js');

function cell(text, status, source) {
  return {
    text: text || '',
    noteIds: [],
    status: status || (text ? 'user_edited' : 'empty'),
    source: source || { page: '', snippet: '', section: '', extractionType: '', confidence: 0, updatedAt: 0 },
    sources: source ? [source] : [],
    candidates: []
  };
}

function row(referenceId, cells) {
  return {
    id: `row-${referenceId}`,
    referenceId,
    cells: {
      purpose: cell(cells.purpose),
      method: cell(cells.method, cells.methodStatus),
      sample: cell(cells.sample, cells.sampleStatus, cells.sampleSource),
      findings: cell(cells.findings, cells.findingsStatus),
      limitations: cell(cells.limitations, cells.limitationsStatus),
      myNotes: cell(cells.myNotes)
    },
    updatedAt: cells.updatedAt || 1
  };
}

const refs = [
  { id: 'r1', title: 'Yapay zeka ve metabilişsel farkındalık', authors: ['Kılıç'], year: 2024, doi: '10.1/a', pdfData: 'abc', journal: 'Egitim Dergisi' },
  { id: 'r2', title: 'Teacher anxiety study', authors: ['Smith'], year: 2019, journal: 'Psychology' },
  { id: 'r3', title: 'Teacher anxiety study', authors: ['Smith'], year: 2019, journal: 'Psychology' }
];

const rows = [
  row('r1', {
    purpose: 'Bu çalışmanın amacı yapay zeka kullanımını incelemektir.',
    method: 'Araştırma ilişkisel tarama modelinde yürütülmüştür.',
    sample: 'The sample consisted of 412 undergraduate students.',
    sampleStatus: 'user_confirmed',
    sampleSource: { page: '5', snippet: '412 üniversite öğrencisi', extractionType: 'pdf-selection-context-menu', confidence: 1, updatedAt: 10 },
    findings: 'Sonuçlar anlamlı bir ilişki bulunduğunu göstermektedir.',
    limitations: 'Kesitsel desen ve öz bildirim sınırlılık oluşturmaktadır.',
    updatedAt: 20
  }),
  row('r2', {
    purpose: 'The study examines teacher anxiety.',
    method: 'A qualitative case study was used.',
    sample: 'Teachers participated in the research.',
    findings: '',
    findingsStatus: 'needs_review',
    limitations: '',
    updatedAt: 5
  }),
  row('r3', {
    purpose: '',
    method: '',
    sample: '',
    findings: '',
    limitations: '',
    updatedAt: 3
  })
];

test('normalizes filter state with safe defaults', () => {
  const state = filters.normalizeMatrixFilterState({ metadata: { hasDoi: 'true' }, sort: { direction: 'asc' } });
  assert.equal(state.metadata.hasDoi, true);
  assert.equal(state.sort.key, 'year');
  assert.equal(state.sort.direction, 'asc');
});

test('filters by Turkish-insensitive full text search', () => {
  const result = filters.applyMatrixFilters(rows, refs, { search: 'metabilissel' });
  assert.equal(result.filtered, 1);
  assert.equal(result.rows[0].referenceId, 'r1');
});

test('filters metadata DOI, PDF, year and health together', () => {
  const result = filters.applyMatrixFilters(rows, refs, {
    yearRange: { from: '2020', to: '2026' },
    metadata: { hasDoi: true, hasPdf: true, metadataHealth: ['good'] }
  });
  assert.equal(result.filtered, 1);
  assert.equal(result.rows[0].referenceId, 'r1');
});

test('filters cell statuses, source types and confidence', () => {
  const result = filters.applyMatrixFilters(rows, refs, {
    cellStatus: ['user_confirmed'],
    sourceTypes: ['pdf_selection', 'page_number'],
    confidence: { min: 0.8 }
  });
  assert.equal(result.filtered, 1);
  assert.equal(result.rows[0].referenceId, 'r1');
});

test('filters method, sample, analysis and limitation tags from gap-map rules', () => {
  const result = filters.applyMatrixFilters(rows, refs, {
    methodTypes: ['quantitative'],
    designs: ['cross-sectional'],
    sampleGroups: ['undergraduate students'],
    limitationTags: ['cross-sectional', 'self-report']
  });
  assert.equal(result.filtered, 1);
  assert.equal(result.rows[0].referenceId, 'r1');
});

test('detects duplicate suspicion from repeated title/year', () => {
  const result = filters.applyMatrixFilters(rows, refs, {
    metadata: { duplicateSuspicion: true }
  });
  assert.equal(result.filtered, 2);
  assert.deepEqual(result.rows.map((item) => item.referenceId).sort(), ['r2', 'r3']);
});

test('sorts by missing fields and builds presets', () => {
  const preset = filters.buildPresetFilter('incomplete-matrix');
  const result = filters.applyMatrixFilters(rows, refs, preset);
  assert.equal(result.rows[0].referenceId, 'r3');
  assert.ok(result.activeFilters.some((chip) => chip.id === 'preset'));
});

test('builds filter from gap candidate', () => {
  const state = filters.buildFilterForGapCandidate({ type: 'methodological_gap', label: 'Boylamsal çalışma eksikliği' });
  assert.deepEqual(state.designs, ['cross-sectional']);
});
