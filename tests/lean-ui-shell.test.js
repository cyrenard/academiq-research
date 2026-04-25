const test = require('node:test');
const assert = require('node:assert/strict');

const shell = require('../src/lean-ui-shell.js');

test('normalizeText handles Turkish casing and accents for command search', () => {
  assert.equal(shell.normalizeText('İçindekiler Güncelle'), 'icindekiler guncelle');
  assert.equal(shell.normalizeText('  Başlık   Haritası  '), 'baslık haritası');
});

test('scoreCommand prioritizes exact and prefix matches', () => {
  const command = {
    title: 'Kaynakçayı Güncelle',
    section: 'Kaynakça',
    keywords: ['apa', 'references']
  };

  assert.equal(shell.scoreCommand(command, 'kaynakçayı güncelle'), 100);
  assert.ok(shell.scoreCommand(command, 'kaynak') > shell.scoreCommand(command, 'apa'));
  assert.equal(shell.scoreCommand(command, 'pdf annotation'), 0);
});

test('filterCommands returns matching commands by score', () => {
  const commands = [
    { id: 'pdf', title: 'Annotationlı PDF dışa aktar', section: 'PDF' },
    { id: 'bib', title: 'Kaynakçayı güncelle', section: 'Kaynakça' },
    { id: 'outline', title: 'Başlık haritasını aç', section: 'Belge', keywords: ['outline'] }
  ];

  assert.deepEqual(
    shell.filterCommands(commands, 'kaynakça').map((command) => command.id),
    ['bib']
  );
  assert.deepEqual(
    shell.filterCommands(commands, 'outline').map((command) => command.id),
    ['outline']
  );
});

test('filterCommands promotes recent commands only for empty palette queries', () => {
  const commands = [
    { id: 'outline', title: 'Baslik haritasini ac', section: 'Belge' },
    { id: 'linter', title: 'APA kontrol panelini ac', section: 'Kalite' },
    { id: 'history', title: 'Gecmis ve recovery panelini ac', section: 'Yazim' }
  ];

  assert.deepEqual(
    shell.filterCommands(commands, '', 3, ['history']).map((command) => command.id),
    ['history', 'linter', 'outline']
  );
  assert.deepEqual(
    shell.filterCommands(commands, 'apa', 3, ['history']).map((command) => command.id),
    ['linter']
  );
});

test('recent command helpers dedupe, cap, and filter stale ids', () => {
  assert.deepEqual(
    shell.normalizeRecentCommandIds(['a', 'b', 'a', 'stale'], ['a', 'b'], 5),
    ['a', 'b']
  );
  assert.deepEqual(
    shell.recordRecentCommandId(['a', 'b', 'c'], 'b', 3),
    ['b', 'a', 'c']
  );
});

test('buildCommandPaletteItemModel keeps shortcut and description hints optional', () => {
  assert.deepEqual(
    shell.buildCommandPaletteItemModel({
      id: 'find',
      title: 'Belgede bul',
      section: 'Yazim',
      icon: 'F',
      shortcut: 'Ctrl+F',
      description: 'Bul alanina odaklan.'
    }),
    {
      id: 'find',
      title: 'Belgede bul',
      section: 'Yazim',
      icon: 'F',
      shortcut: 'Ctrl+F',
      description: 'Bul alanina odaklan.'
    }
  );

  assert.deepEqual(
    shell.buildCommandPaletteItemModel({ id: 'plain' }),
    {
      id: 'plain',
      title: 'plain',
      section: '',
      icon: 'K',
      shortcut: '',
      description: ''
    }
  );
});

test('citation style helpers normalize aliases and resolve labels safely', () => {
  assert.equal(shell.normalizeCitationStyleId('APA 7'), 'apa7');
  assert.equal(shell.normalizeCitationStyleId('chicago'), 'chicago-author-date');
  assert.equal(shell.normalizeCitationStyleId('IEEE'), 'ieee');

  const catalog = shell.normalizeCitationStyleCatalog([
    { id: 'APA', label: 'APA 7' },
    { id: 'ieee', label: 'IEEE' },
    { id: 'apa7', label: 'APA duplicate' },
    null
  ]);
  assert.deepEqual(
    catalog.map((item) => item.id),
    ['apa7', 'ieee']
  );
  assert.equal(shell.resolveCitationStyleLabel('ieee', catalog), 'IEEE');
  assert.equal(shell.resolveCitationStyleLabel('missing-style', catalog), 'APA 7');
});

test('buildQualityReport flags missing bibliography and incomplete references', () => {
  const report = shell.buildQualityReport({
    refs: [{ title: '', authors: [], year: '' }],
    citationIds: ['r1'],
    citationCount: 1,
    bibliographyText: ''
  });

  assert.equal(report.errors, 2);
  assert.equal(report.warnings, 1);
  assert.ok(report.issues.some((issue) => issue.code === 'incomplete_references'));
  assert.ok(report.issues.some((issue) => issue.code === 'missing_bibliography_page'));
  assert.ok(report.issues.some((issue) => issue.code === 'citation_missing_reference'));
});

test('summarizeReferenceHealth applies type-aware metadata checks', () => {
  const summary = shell.summarizeReferenceHealth([
    { referenceType: 'book', title: 'Book', authors: ['Doe, J.'], year: '2020' },
    { referenceType: 'website', title: 'Page', authors: ['Org'], year: '2024', websiteName: 'Site' },
    { referenceType: 'article', title: 'Article', authors: ['Doe, J.'], year: '2022', journal: 'Journal', fp: '12' }
  ]);

  assert.equal(summary.complete, 0);
  assert.equal(summary.incomplete, 2);
  assert.equal(summary.suspicious, 1);
  assert.equal(summary.issueCounts.missing_publisher, 1);
  assert.equal(summary.issueCounts.missing_url, 1);
  assert.equal(summary.issueCounts.missing_doi, 1);
});

test('buildQualityReport flags missing DOI as a dedicated warning', () => {
  const report = shell.buildQualityReport({
    refs: [{ referenceType: 'article', title: 'Article', authors: ['Doe, J.'], year: '2024', journal: 'Journal', url: 'https://example.com' }],
    citationIds: [],
    citationCount: 0,
    bibliographyText: 'x'
  });

  assert.ok(report.issues.some((issue) => issue.code === 'missing_doi'));
  assert.deepEqual(shell.getIssueAction({ code: 'missing_doi' }), { action: 'metadataHealth', label: 'Metadata Kontrol' });
});

test('buildQualityReport ignores grammar signal after removing in-app grammar service', () => {
  const report = shell.buildQualityReport({
    refs: [],
    citationIds: [],
    citationCount: 0,
    bibliographyText: '',
    grammar: {
      status: 'issues',
      issueCount: 2,
      issues: [
        { message: 'Yazim onerisi', replacements: ['ornek'] },
        { message: 'Dil bilgisi onerisi', replacements: ['ornek2'] }
      ]
    }
  });

  assert.ok(!report.issues.some((issue) => issue.code === 'grammar_issues'));
  assert.equal(report.grammar.issueCount, 2);
  assert.deepEqual(shell.getIssueAction({ code: 'grammar_issues' }), { action: 'openLinter', label: 'Detay' });
});

test('computeReadabilityReport stays quiet for short text and warns on long sentences', () => {
  const short = shell.computeReadabilityReport('Bu kisa bir deneme. Henuz yeterli metin yok.');
  assert.equal(short.tone, 'neutral');

  const longSentence = 'Bu calisma akademik yazma surecinde kullanicilarin dusunme bicimlerini, kaynaklarla kurduklari iliskiyi, metin icinde karar verme davranislarini, dijital araclarla gelistirdikleri uretim stratejilerini, okuma sirasinda olusan metabilissel farkindaliklarini ve kaynak yonetimiyle akademik arguman kurma arasindaki iliskiyi ayni anda inceleyen oldukca uzun bir cumledir.';
  const report = shell.computeReadabilityReport([longSentence, longSentence, longSentence].join(' '));
  assert.equal(report.tone, 'warning');
  assert.ok(report.avgWordsPerSentence > 35);
  assert.equal(report.longSentences, 3);
});

test('sanitizeReadabilityText removes citation and DOI noise from prose metrics', () => {
  const text = 'Bu paragraf oldukca sade bir aciklama icerir (Bandura, 1989; Brown, 1987). DOI: 10.1016/j.test.2024.12345 ve https://example.com baglantisi metrikleri sisirmemeli.';
  const sanitized = shell.sanitizeReadabilityText(text);

  assert.ok(!sanitized.includes('Bandura, 1989'));
  assert.ok(!sanitized.includes('10.1016/j.test.2024.12345'));
  assert.ok(!sanitized.includes('https://example.com'));
});

test('buildCitationCoverageSummary flags only meaningful long uncited paragraphs', () => {
  const coverage = shell.buildCitationCoverageSummary([
    { wordCount: 12, sentenceCount: 1, hasCitation: false },
    { wordCount: 92, sentenceCount: 3, hasCitation: false },
    { wordCount: 88, sentenceCount: 3, hasCitation: true }
  ]);

  assert.equal(coverage.totalParagraphs, 2);
  assert.equal(coverage.longParagraphs, 2);
  assert.equal(coverage.uncoveredLongParagraphs, 1);
});

test('buildQualityReport includes readability warning when prose is heavy', () => {
  const readability = {
    tone: 'warning',
    avgWordsPerSentence: 42,
    longSentences: 2,
    veryLongSentences: 0
  };
  const report = shell.buildQualityReport({
    refs: [],
    citationIds: [],
    citationCount: 0,
    bibliographyText: '',
    readability
  });

  assert.equal(report.readability, readability);
  assert.ok(report.issues.some((issue) => issue.code === 'readability_long_sentences'));
});

test('buildQualityReport flags long documents without heading structure', () => {
  const report = shell.buildQualityReport({
    refs: [],
    citationIds: [],
    citationCount: 0,
    bibliographyText: '',
    wordCount: 900,
    outlineSummary: { headings: 0, tables: 0, figures: 0 }
  });

  assert.equal(report.outlineSummary.headings, 0);
  assert.ok(report.issues.some((issue) => issue.code === 'missing_heading_structure'));
  const action = shell.getIssueAction({ code: 'missing_heading_structure' });
  assert.deepEqual(action, { action: 'openOutline', label: 'Anahati Ac' });
});

test('applyIgnoredIssues hides selected linter issue codes and recomputes counts', () => {
  const report = shell.applyIgnoredIssues({
    errors: 2,
    warnings: 1,
    issues: [
      { severity: 'error', code: 'citation_missing_reference', message: 'Atif kopuk' },
      { severity: 'error', code: 'incomplete_references', message: 'Kunye eksik' },
      { severity: 'warning', code: 'line_spacing', message: 'Aralik dusuk' }
    ]
  }, ['citation_missing_reference', 'citation_missing_reference', '']);

  assert.equal(report.errors, 1);
  assert.equal(report.warnings, 1);
  assert.equal(report.ignoredCount, 1);
  assert.deepEqual(report.issues.map((issue) => issue.code), ['incomplete_references', 'line_spacing']);
  assert.deepEqual(shell.normalizeIgnoredIssueCodes(['a', 'a', '', 'b']), ['a', 'b']);
});

test('applyIgnoredIssues supports doc-scoped ignore tokens without global leakage', () => {
  const token = shell.buildIgnoredIssueToken('missing_doi', 'doc-1');
  const report = shell.applyIgnoredIssues({
    issues: [
      { severity: 'warning', code: 'missing_doi', ignoreCode: token, message: 'doc-1 eksik doi' },
      { severity: 'warning', code: 'missing_doi', ignoreCode: shell.buildIgnoredIssueToken('missing_doi', 'doc-2'), message: 'doc-2 eksik doi' }
    ]
  }, [token], { docId: 'doc-1' });

  assert.equal(report.ignoredCount, 1);
  assert.deepEqual(report.issues.map((issue) => issue.message), ['doc-2 eksik doi']);
});

test('removeIgnoredIssueTokensForDoc only clears matching doc-scoped tokens', () => {
  const list = shell.removeIgnoredIssueTokensForDoc([
    shell.buildIgnoredIssueToken('missing_doi', 'doc-a'),
    shell.buildIgnoredIssueToken('missing_doi', 'doc-b'),
    'line_spacing'
  ], 'doc-a');

  assert.deepEqual(list, [shell.buildIgnoredIssueToken('missing_doi', 'doc-b'), 'line_spacing']);
});

test('buildQualityReport does not flag missing bibliography when citations are absent', () => {
  const report = shell.buildQualityReport({
    refs: [{ id: 'r1', title: 'Kaynak', authors: ['Doe, J.'], year: '2024', referenceType: 'book', publisher: 'X' }],
    citationIds: [],
    citationCount: 0,
    bibliographyText: ''
  });

  assert.ok(!report.issues.some((issue) => issue.code === 'missing_bibliography_page'));
});

test('buildQualityReport flags long paragraphs without citation coverage', () => {
  const report = shell.buildQualityReport({
    refs: [],
    citationIds: [],
    citationCount: 0,
    bibliographyText: '',
    citationCoverage: {
      totalParagraphs: 4,
      longParagraphs: 2,
      uncoveredLongParagraphs: 1
    }
  });

  assert.ok(report.issues.some((issue) => issue.code === 'long_paragraph_without_citation'));
  assert.deepEqual(shell.getIssueAction({ code: 'long_paragraph_without_citation' }), { action: 'openCitationGraph', label: 'Atif Grafigi' });
});

test('summarizeReferenceHealth can delegate to metadata health api', () => {
  const summary = shell.summarizeReferenceHealth([{ title: 'x' }], {
    summarizeHealth(refs) {
      return { total: refs.length, complete: 1, incomplete: 0, suspicious: 0, issueCounts: {} };
    }
  });

  assert.equal(summary.total, 1);
  assert.equal(summary.complete, 1);
});

test('buildLinterIssueViewModel maps issues to targeted actions', () => {
  const view = shell.buildLinterIssueViewModel({
    issues: [
      { severity: 'warning', code: 'missing_bibliography_page', message: 'Kaynakca eksik' },
      { severity: 'error', code: 'citation_missing_reference', message: 'Atif kopuk' },
      { severity: 'error', code: 'incomplete_references', message: 'Kunye eksik' },
      { severity: 'warning', code: 'manual_bibliography', message: 'Manuel kaynakca' }
    ]
  });

  assert.deepEqual(
    view.map((issue) => issue.action),
    ['refreshBibliography', 'openCitationGraph', 'metadataHealth', 'resetBibliography']
  );
  assert.equal(view[1].title, 'Hata');
  assert.equal(view[0].title, 'Uyari');
});

test('buildLinterIssueViewModel returns a clean card when no issues exist', () => {
  const view = shell.buildLinterIssueViewModel({ issues: [] });

  assert.equal(view.length, 1);
  assert.equal(view[0].severity, 'ok');
  assert.equal(view[0].action, '');
});

test('classifySaveStatus normalizes autosave tone labels', () => {
  assert.equal(shell.classifySaveStatus('Kaydedildi').tone, 'ok');
  assert.equal(shell.classifySaveStatus('Kaydediliyor...').tone, 'saving');
  assert.equal(shell.classifySaveStatus('Kaydedilemedi: disk hatası').tone, 'error');
  assert.equal(shell.classifySaveStatus('Recovery draft bulundu').tone, 'warning');
});

test('buildStatusViewModel summarizes APA, warning and save state', () => {
  const risky = shell.buildStatusViewModel({
    stats: { pages: 3, currentPage: 2, totalPages: 3, words: 1247 },
    report: { errors: 1, warnings: 2 },
    saveStatus: 'Kaydediliyor...'
  });

  assert.equal(risky.pagesLabel, 'sf 2/3');
  assert.equal(risky.wordsLabel, '1247 kelime');
  assert.equal(risky.apaLabel, 'APA riskli');
  assert.equal(risky.apaTone, 'error');
  assert.equal(risky.warningsLabel, '3 sorun');
  assert.equal(risky.saveTone, 'saving');

  const clean = shell.buildStatusViewModel({
    stats: { pages: 1, words: 0 },
    report: { errors: 0, warnings: 0 },
    saveStatus: 'Kaydedildi'
  });
  assert.equal(clean.pagesLabel, 'sf 1/1');
  assert.equal(clean.apaLabel, 'APA ok');
  assert.equal(clean.warningsLabel, '0 uyari');
  assert.equal(clean.saveTone, 'ok');

  const ieee = shell.buildStatusViewModel({
    stats: { pages: 2, words: 100 },
    report: { errors: 0, warnings: 1 },
    saveStatus: 'Kaydedildi',
    styleLabel: 'IEEE'
  });
  assert.equal(ieee.apaLabel, 'IEEE kontrol');
});

test('computePageStats detects active page from scroll center and falls back safely', () => {
  const stats = shell.computePageStats({
    scrollTop: 980,
    viewportHeight: 400,
    pageRects: [
      { top: 0, bottom: 900 },
      { top: 920, bottom: 1820 },
      { top: 1840, bottom: 2740 }
    ],
    fallbackPageCount: 3
  });

  assert.equal(stats.currentPage, 2);
  assert.equal(stats.totalPages, 3);

  const fallback = shell.computePageStats({
    scrollTop: 0,
    viewportHeight: 0,
    pageRects: [],
    fallbackPageCount: 5
  });
  assert.equal(fallback.currentPage, 1);
  assert.equal(fallback.totalPages, 5);
});

test('clampPageNumber constrains page jump targets to valid range', () => {
  assert.equal(shell.clampPageNumber(0, 8), 1);
  assert.equal(shell.clampPageNumber(4, 8), 4);
  assert.equal(shell.clampPageNumber(99, 8), 8);
  assert.equal(shell.clampPageNumber('x', 8), 1);
});

test('buildShortcutHelpModel exposes core non-toolbar workflows', () => {
  const shortcuts = shell.buildShortcutHelpModel();
  const keys = shortcuts.map((item) => item.keys);

  assert.ok(keys.includes('Ctrl+K'));
  assert.ok(keys.includes('Ctrl+G'));
  assert.ok(keys.includes('F9'));
  assert.ok(keys.includes('Ctrl+Shift+E'));
  assert.ok(keys.includes('/r'));
  assert.ok(keys.includes('/t'));
  assert.ok(keys.includes('?'));
});

test('shouldOpenShortcutHelp ignores editable targets', () => {
  assert.equal(shell.shouldOpenShortcutHelp({ key: '?', target: { tagName: 'DIV' } }), true);
  assert.equal(shell.shouldOpenShortcutHelp({ key: '?', target: { tagName: 'INPUT' } }), false);
  assert.equal(shell.shouldOpenShortcutHelp({ key: '?', target: { isContentEditable: true } }), false);
  assert.equal(shell.shouldOpenShortcutHelp({ key: '?', ctrlKey: true, target: { tagName: 'DIV' } }), false);
  assert.equal(shell.shouldOpenShortcutHelp({ key: '/', target: { tagName: 'DIV' } }), false);
});

test('buildCitationConsistencyReport flags unresolved citations and manual bibliography risk', () => {
  const report = shell.buildCitationConsistencyReport({
    refs: [
      { id: 'r1', title: 'Known' },
      { id: 'unused-1', title: 'Unused 1' },
      { id: 'unused-2', title: 'Unused 2' }
    ],
    citationIds: ['r1', 'missing'],
    bibliographyEntryCount: 1,
    bibliographyManual: true
  });

  assert.deepEqual(report.missingRefIds, ['missing']);
  assert.deepEqual(report.uncitedRefIds, ['unused-1', 'unused-2']);
  assert.equal(report.shouldWarnUncited, true);
  assert.ok(report.issues.some((issue) => issue.code === 'citation_missing_reference'));
  assert.ok(report.issues.some((issue) => issue.code === 'uncited_references'));
  assert.ok(report.issues.some((issue) => issue.code === 'bibliography_entry_count_low'));
  assert.ok(report.issues.some((issue) => issue.code === 'manual_bibliography'));
});

test('buildCitationConsistencyReport suppresses uncited warning for a single leftover source', () => {
  const report = shell.buildCitationConsistencyReport({
    refs: [{ id: 'r1', title: 'Known' }, { id: 'unused', title: 'Unused' }],
    citationIds: ['r1'],
    bibliographyEntryCount: 1,
    bibliographyManual: false
  });

  assert.deepEqual(report.uncitedRefIds, ['unused']);
  assert.equal(report.shouldWarnUncited, false);
  assert.ok(!report.issues.some((issue) => issue.code === 'uncited_references'));
});

test('export preflight helpers summarize risk for confirmation UI', () => {
  const clean = { errors: 0, warnings: 0, issues: [] };
  const risky = {
    errors: 1,
    warnings: 1,
    issues: [
      { severity: 'error', message: 'Kaynak eksik' },
      { severity: 'warning', message: 'Kaynakca manuel' }
    ]
  };

  assert.equal(shell.getExportRiskLevel(clean), 'clean');
  assert.equal(shell.getExportRiskLevel(risky), 'blocker');
  assert.match(shell.formatPreflightMessage(risky, 'pdf'), /PDF oncesi kalite kontrolu/);
  assert.match(shell.formatPreflightMessage(risky, 'pdf'), /Yine de disa aktarmaya devam edilsin mi\?/);
});

test('side panel width helpers clamp to viewport-safe bounds', () => {
  assert.equal(shell.clampNumber(100, 280, 560), 280);
  assert.equal(shell.clampNumber(900, 280, 560), 560);
  assert.equal(shell.normalizePanelWidth(700, 1200), 560);
  assert.equal(shell.normalizePanelWidth(180, 1200), 280);
  assert.equal(shell.normalizePanelWidth(560, 420), 384);
});

test('computeGrammarErrorCooldownMs grows with consecutive failures and caps safely', () => {
  assert.equal(shell.computeGrammarErrorCooldownMs(0), 0);
  assert.equal(shell.computeGrammarErrorCooldownMs(1), 8000);
  assert.equal(shell.computeGrammarErrorCooldownMs(2), 16000);
  assert.equal(shell.computeGrammarErrorCooldownMs(3), 32000);
  assert.equal(shell.computeGrammarErrorCooldownMs(4), 60000);
  assert.equal(shell.computeGrammarErrorCooldownMs(8), 60000);
});

test('normalizePanelTab keeps supported side panel tabs and falls back safely', () => {
  const tabs = [
    { id: 'outline' },
    { id: 'linter' },
    { id: 'history' }
  ];

  assert.equal(shell.normalizePanelTab('history', tabs), 'history');
  assert.equal(shell.normalizePanelTab('missing', tabs), 'outline');
  assert.equal(shell.normalizePanelTab('', tabs), 'outline');
});

test('buildCitationGraphModel separates cited, uncited, and missing references', () => {
  const graph = shell.buildCitationGraphModel({
    refs: [
      { id: 'r1', authors: ['Bandura, A.'], year: '1989', title: 'Known' },
      { id: 'r2', authors: ['Brown, A.'], year: '1987', title: 'Unused' }
    ],
    citationIds: ['r1', 'missing', 'r1']
  });

  assert.equal(graph.citedCount, 1);
  assert.equal(graph.uncitedCount, 1);
  assert.deepEqual(graph.missingRefIds, ['missing']);
  assert.equal(shell.getReferenceLabel(graph.citedRefs[0]), 'Bandura, A. (1989)');
});

test('buildCitationGraphSvgModel creates capped radial nodes and hidden counters', () => {
  const graph = shell.buildCitationGraphModel({
    refs: [
      { id: 'r1', authors: ['Bandura, A.'], year: '1989', title: 'Known 1' },
      { id: 'r2', authors: ['Brown, A.'], year: '1987', title: 'Known 2' },
      { id: 'r3', authors: ['Flavell, J.'], year: '1979', title: 'Unused 1' },
      { id: 'r4', authors: ['Nelson, T.'], year: '1990', title: 'Unused 2' },
      { id: 'r5', authors: ['Selwyn, N.'], year: '2016', title: 'Unused 3' }
    ],
    citationIds: ['r1', 'r2', 'missing-a', 'missing-b']
  });

  const svgModel = shell.buildCitationGraphSvgModel({
    graph,
    centerLabel: 'Belge',
    maxCited: 1,
    maxMissing: 1,
    maxUncited: 1,
    width: 240,
    height: 180
  });

  assert.equal(svgModel.nodes.length, 3);
  assert.equal(svgModel.hidden.cited, 1);
  assert.equal(svgModel.hidden.missing, 1);
  assert.equal(svgModel.hidden.uncited, 2);
  assert.equal(svgModel.nodes[0].tone, 'ok');
  assert.equal(svgModel.nodes[1].tone, 'error');
  assert.equal(svgModel.nodes[2].tone, 'warn');
});

test('renderCitationGraphSvg returns a safe inline svg graph payload', () => {
  const svg = shell.renderCitationGraphSvg(shell.buildCitationGraphSvgModel({
    graph: {
      citedRefs: [{ id: 'r1', authors: ['Bandura, A.'], year: '1989', title: 'Known' }],
      uncitedRefs: [],
      missingRefIds: ['missing']
    },
    centerLabel: 'Belge'
  }));

  assert.match(svg, /<svg class="aq-cite-svg"/);
  assert.match(svg, /aq-cite-edge/);
  assert.match(svg, /aq-cite-center-label/);
  assert.match(svg, /Eksik: missing/);
});

test('buildSuggestionModel proposes actions from quality and graph risks', () => {
  const suggestions = shell.buildSuggestionModel({
    report: {
      issues: [
        { code: 'missing_bibliography_page' },
        { code: 'manual_bibliography' },
        { code: 'readability_long_sentences' },
        { code: 'long_paragraph_without_citation' }
      ],
      health: { incomplete: 2 }
    },
    graph: { missingCount: 1, uncitedCount: 12 },
    outlineSummary: { headings: 0 },
    wordCount: 900,
    pdfDigest: { count: 3 }
  });

  const ids = suggestions.map((item) => item.id);
  assert.ok(ids.includes('refresh-bibliography'));
  assert.ok(ids.includes('reset-manual-bibliography'));
  assert.ok(ids.includes('missing-citation-links'));
  assert.ok(ids.includes('repair-metadata'));
  assert.ok(ids.includes('review-readability'));
  assert.ok(ids.includes('strengthen-citation-coverage'));
  assert.ok(ids.includes('review-unused-sources'));
  assert.ok(ids.includes('add-outline'));
  assert.ok(ids.includes('prepare-pdf-digest'));
});

test('buildSuggestionModel skips grammar review when grammar issues are no longer exposed', () => {
  const suggestions = shell.buildSuggestionModel({
    report: { issues: [], health: { incomplete: 0 }, grammar: { issueCount: 3 } },
    graph: { missingCount: 0, uncitedCount: 0 },
    outlineSummary: { headings: 2 },
    wordCount: 200
  });

  assert.ok(!suggestions.some((item) => item.id === 'review-grammar'));
});

test('buildSuggestionModel includes track-changes review action when pending suggestions exist', () => {
  const suggestions = shell.buildSuggestionModel({
    report: { issues: [], health: { incomplete: 0 }, grammar: { issueCount: 0 } },
    graph: { missingCount: 0, uncitedCount: 0 },
    outlineSummary: { headings: 3 },
    wordCount: 350,
    track: { enabled: true, total: 4, insertCount: 2, deleteCount: 2 }
  });

  assert.ok(suggestions.some((item) => item.id === 'review-track-changes' && item.action === 'openTrackReview'));
});

test('buildSuggestionModel returns a clean state when there is no immediate action', () => {
  const suggestions = shell.buildSuggestionModel({
    report: { issues: [], health: { incomplete: 0 } },
    graph: { missingCount: 0, uncitedCount: 0 },
    outlineSummary: { headings: 2 },
    wordCount: 200
  });

  assert.deepEqual(suggestions.map((item) => item.id), ['clean']);
});

test('buildTrackChangesPanelModel normalizes summary fields and fallback totals', () => {
  const model = shell.buildTrackChangesPanelModel({
    enabled: true,
    summary: { insertCount: 3, deleteCount: 1, insertChars: 18, deleteChars: 5 }
  });

  assert.equal(model.enabled, true);
  assert.equal(model.total, 4);
  assert.equal(model.hasChanges, true);
  assert.equal(model.statusLabel, 'Inceleme modu acik');
  assert.equal(model.pendingLabel, '4 oneri bekliyor');
  assert.equal(model.insertChars, 18);
  assert.equal(model.deleteChars, 5);
});

test('buildPdfAnnotationDigestViewModel delegates to annotation digest api', () => {
  const model = shell.buildPdfAnnotationDigestViewModel([
    { kind: 'highlight', page: 1, text: 'quote' },
    { kind: 'note', page: 2, text: 'note' }
  ], {
    buildAnnotationDigest(items, options) {
      assert.equal(items.length, 2);
      assert.equal(options.title, 'PDF Ozeti');
      return {
        title: options.title,
        citation: options.citation,
        count: 2,
        highlightCount: 1,
        noteCount: 1,
        items,
        markdown: '# PDF Ozeti',
        html: '<section></section>'
      };
    }
  }, {
    title: 'PDF Ozeti',
    citation: 'Bandura (1989)'
  });

  assert.equal(model.hasItems, true);
  assert.equal(model.count, 2);
  assert.equal(model.highlightCount, 1);
  assert.equal(model.noteCount, 1);
  assert.equal(model.markdown, '# PDF Ozeti');
});

test('buildPdfAnnotationDigestViewModel has a safe fallback without annotation api', () => {
  const model = shell.buildPdfAnnotationDigestViewModel([
    { kind: 'note', page: 3, text: '  a note  ' },
    { kind: 'highlight', page: 4, text: '' }
  ], null, { title: 'Fallback' });

  assert.equal(model.title, 'Fallback');
  assert.equal(model.count, 1);
  assert.equal(model.noteCount, 1);
  assert.match(model.markdown, /s\. 3: a note/);
});

test('buildPdfAnnotationSearchModel filters annotation text and kind', () => {
  const model = shell.buildPdfAnnotationSearchModel([
    { kind: 'highlight', page: 1, text: 'AI confidence improves perceived performance' },
    { kind: 'note', page: 2, text: 'Check metacognition connection' },
    { kind: 'highlight', page: 3, text: '  ' }
  ], null, { query: 'meta', filter: 'note' });

  assert.equal(model.total, 2);
  assert.equal(model.count, 1);
  assert.equal(model.noteCount, 1);
  assert.equal(model.highlightCount, 0);
  assert.equal(model.items[0].page, 2);
});

test('buildPdfAnnotationSearchModel delegates to annotation api when available', () => {
  const calls = [];
  const model = shell.buildPdfAnnotationSearchModel([
    { kind: 'highlight', page: 1, text: 'quote' }
  ], {
    buildAnnotationSummary(item) {
      calls.push(['summary', item.text]);
      return { id: 'a1', page: 1, text: item.text, preview: 'quote', empty: false };
    },
    filterAnnotationSummaries(items, options) {
      calls.push(['filter', options.query, options.filter]);
      return items;
    }
  }, { query: 'quote', filter: 'highlight' });

  assert.equal(model.count, 1);
  assert.deepEqual(calls, [['summary', 'quote'], ['filter', 'quote', 'highlight']]);
});

test('buildHistoryPanelModel surfaces recoverable draft and snapshots', () => {
  const model = shell.buildHistoryPanelModel({
    now: 100000,
    saveStatus: 'kaydediliyor',
    appInfo: {
      session: { previousCleanExit: false },
      editorDraft: {
        exists: true,
        valid: true,
        isNewerThanLastSave: true,
        recoverableAfterUncleanShutdown: true
      },
      documentHistory: { totalSnapshots: 2 }
    },
    history: {
      docId: 'doc1',
      docName: 'Odev',
      snapshots: [
        { id: 's1', createdAt: 70000, wordCount: 120, excerpt: 'Birinci snapshot' }
      ]
    }
  });

  assert.equal(model.saveStatus, 'kaydediliyor');
  assert.equal(model.docName, 'Odev');
  assert.equal(model.snapshots.length, 1);
  assert.ok(model.cards.some((card) => card.title.includes('Kurtarilabilir')));
  assert.ok(model.cards.some((card) => card.title.includes('temiz kapanmamis')));
  assert.ok(model.cards.some((card) => card.title.includes('snapshotlari')));
});

test('buildHistoryPanelModel stays calm when no recovery signal exists', () => {
  const model = shell.buildHistoryPanelModel({
    appInfo: {
      session: { previousCleanExit: true },
      editorDraft: { exists: false, valid: false }
    },
    history: { docName: 'Belge', snapshots: [] }
  });

  assert.ok(model.cards.some((card) => card.severity === 'ok' && card.title.includes('sakin')));
  assert.ok(model.cards.some((card) => card.title.includes('temiz kapanmis')));
  assert.ok(model.cards.some((card) => card.title.includes('snapshot bekleniyor')));
});
