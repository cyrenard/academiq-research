const test = require('node:test');
const assert = require('node:assert/strict');

const utils = require('../browser-capture-extension/common/browser-capture-utils.js');

test('findDoiInText extracts DOI from free text', () => {
  assert.equal(
    utils.findDoiInText('See doi:10.1177/1234567890123456 for details'),
    '10.1177/1234567890123456'
  );
});

test('meta DOI extraction beats weak body DOI candidates', () => {
  const details = utils.extractDoiCandidates({
    metaEntries: [{ name: 'citation_doi', content: '10.1000/xyz' }],
    bodyText: 'References also mention 10.2000/other and 10.3000/another',
    pageUrl: 'https://example.org/article'
  });
  assert.equal(details.value, '10.1000/xyz');
  assert.equal(details.source, 'citation_meta');
  assert.equal(details.confidence, 'strong');
});

test('jsonld DOI extraction works for scholarly article nodes', () => {
  const details = utils.extractDoiCandidates({
    metaEntries: [],
    jsonLdTexts: [
      JSON.stringify({
        '@type': 'ScholarlyArticle',
        doi: '10.5555/jsonld.123',
        name: 'JSON-LD article'
      })
    ],
    bodyText: '',
    pageUrl: 'https://example.org/article'
  });
  assert.equal(details.value, '10.5555/jsonld.123');
  assert.equal(details.source, 'jsonld');
  assert.equal(details.confidence, 'strong');
});

test('body DOI candidates are conservative near references context', () => {
  const list = utils.collectBodyDoiCandidates('References 10.1000/ref-1 and 10.1000/ref-2. This article DOI 10.2000/main-1');
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 1);
  assert.ok(list[0].score >= 70);
});

test('detectPdfUrl prefers explicit citation_pdf_url metadata', () => {
  const details = utils.extractPdfCandidates({
    metaEntries: [{ name: 'citation_pdf_url', content: 'https://example.org/paper.pdf' }],
    anchorEntries: [{ href: 'https://example.org/other.pdf', text: 'Other PDF' }],
    pageUrl: 'https://example.org/article'
  });
  assert.equal(details.value, 'https://example.org/paper.pdf');
  assert.equal(details.source, 'citation_meta');
  assert.equal(details.confidence, 'strong');
});

test('PDF detection recognizes button-like anchors and direct pdf pages', () => {
  const fromAnchor = utils.extractPdfCandidates({
    metaEntries: [],
    anchorEntries: [{ href: 'https://example.org/download?id=5', text: 'Download PDF', aria: '', title: '' }],
    pageUrl: 'https://example.org/article'
  });
  assert.equal(fromAnchor.source, 'button_link');
  assert.equal(fromAnchor.confidence, 'medium');

  const fromPdfPage = utils.extractPdfCandidates({
    metaEntries: [],
    anchorEntries: [],
    pageUrl: 'https://example.org/file.pdf'
  });
  assert.equal(fromPdfPage.source, 'pdf_page');
  assert.equal(fromPdfPage.confidence, 'strong');
});

test('inferPdfUrlFromPageUrl supports Taylor and Francis full article pages', () => {
  const url = utils.inferPdfUrlFromPageUrl(
    'https://www.tandfonline.com/doi/full/10.1080/10474412.2014.929950',
    '10.1080/10474412.2014.929950'
  );
  assert.equal(url, 'https://www.tandfonline.com/doi/pdf/10.1080/10474412.2014.929950?needAccess=true');
});

test('title, authors and journal prefer structured metadata before document title', () => {
  const jsonLd = JSON.stringify({
    '@type': 'ScholarlyArticle',
    name: 'A Great Paper',
    author: [{ name: 'Ada Lovelace' }, { name: 'Grace Hopper' }],
    isPartOf: { name: 'Journal of Great Papers' }
  });
  const title = utils.extractTitleDetection({
    metaEntries: [],
    jsonLdTexts: [jsonLd],
    docTitle: 'Fallback Title'
  });
  const authors = utils.extractAuthors({
    metaEntries: [],
    jsonLdTexts: [jsonLd]
  });
  const journal = utils.extractJournalDetection({
    metaEntries: [],
    jsonLdTexts: [jsonLd]
  });
  assert.equal(title.value, 'A Great Paper');
  assert.equal(title.source, 'jsonld');
  assert.equal(authors.value, 'Ada Lovelace; Grace Hopper');
  assert.equal(journal.value, 'Journal of Great Papers');
});

test('author extraction supports broader scholarly meta fields and semicolon lists', () => {
  const authors = utils.extractAuthors({
    metaEntries: [
      { name: 'citation_authors', content: 'Ada Lovelace; Grace Hopper' },
      { name: 'dc.contributor', content: 'Katherine Johnson' }
    ],
    jsonLdTexts: []
  });
  assert.equal(authors.source, 'scholarly_meta');
  assert.equal(authors.confidence, 'strong');
  assert.equal(authors.value, 'Ada Lovelace; Grace Hopper; Katherine Johnson');
});

test('author extraction falls back to DOM author blocks when meta/jsonld are missing', () => {
  const authors = utils.extractAuthors({
    metaEntries: [],
    jsonLdTexts: [],
    domAuthors: ['By Ada Lovelace', 'Grace Hopper'],
    bodyText: ''
  });
  assert.equal(authors.source, 'dom');
  assert.equal(authors.confidence, 'medium');
  assert.equal(authors.value, 'Ada Lovelace; Grace Hopper');
});

test('publisher-specific author hints are used with strong confidence', () => {
  const authors = utils.extractAuthors({
    metaEntries: [],
    jsonLdTexts: [],
    publisherFamily: 'springer',
    publisherAuthors: ['Ada Lovelace', 'Grace Hopper'],
    domAuthors: [],
    bodyText: ''
  });
  assert.equal(authors.source, 'dom');
  assert.equal(authors.sourceField, 'publisher:springer');
  assert.equal(authors.confidence, 'strong');
  assert.equal(authors.value, 'Ada Lovelace; Grace Hopper');
});

test('detectPageMetadata resolves layered candidates conservatively', () => {
  const result = utils.detectPageMetadata({
    metaEntries: [{ name: 'citation_title', content: 'Layered Capture Paper' }],
    jsonLdTexts: [JSON.stringify({ '@type': 'ScholarlyArticle', doi: '10.9999/layered.1', description: 'Abstract text' })],
    anchorEntries: [{ href: 'https://example.org/full.pdf', text: 'View PDF', aria: '', title: '' }],
    pageUrl: 'https://example.org/article',
    canonicalUrl: 'https://doi.org/10.9999/layered.1',
    bodyText: 'This study DOI is 10.9999/layered.1',
    domTitle: 'Layered Capture Paper',
    domAbstract: 'DOM abstract',
    docTitle: 'Fallback'
  });
  assert.equal(result.title.value, 'Layered Capture Paper');
  assert.equal(result.doi.value, '10.9999/layered.1');
  assert.equal(result.pdfUrl.value, 'https://example.org/full.pdf');
  assert.equal(result.abstract.value, 'Abstract text');
});

test('describeDetection exposes confidence and evidence details', () => {
  assert.equal(
    utils.describeDetection({
      value: '10.1000/test',
      source: 'citation_meta',
      sourceField: 'citation_doi',
      confidence: 'strong',
      found: true
    }),
    'Guclu - citation meta (citation_doi)'
  );
  assert.equal(utils.describeDetection({ value: '', source: 'none', confidence: 'none', found: false }, 'Bulunamadi'), 'Bulunamadi');
});
