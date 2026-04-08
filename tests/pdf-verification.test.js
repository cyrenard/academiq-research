const test = require('node:test');
const assert = require('node:assert/strict');

const pdfVerification = require('../src/pdf-verification.js');

test('buildVerificationReport marks DOI and title matched PDFs as verified', () => {
  const report = pdfVerification.buildVerificationReport({
    expectedDoi: '10.1000/abc.123',
    expectedTitle: 'The effects of structured note taking on academic writing',
    doiInBody: true,
    doiInUrl: true,
    titleTokenHits: 4,
    titleTokenTotal: 5,
    authorTokenHits: 1,
    authorTokenTotal: 2,
    yearMatch: true
  });

  assert.equal(report.status, 'verified');
  assert.equal(report.confidence, 'high');
  assert.ok(report.score >= 70);
});

test('buildVerificationReport marks weak title-only matches as suspicious', () => {
  const report = pdfVerification.buildVerificationReport({
    expectedTitle: 'A qualitative study of student wellbeing in hybrid classrooms',
    titleTokenHits: 1,
    titleTokenTotal: 5,
    authorTokenHits: 0,
    authorTokenTotal: 2,
    yearMatch: false
  });

  assert.equal(report.status, 'suspicious');
  assert.equal(report.confidence, 'low');
});

test('getIssueForMetadataHealth surfaces likely and suspicious PDF matches', () => {
  const likely = pdfVerification.getIssueForMetadataHealth({
    status: 'likely',
    summary: 'PDF makul güvenle eşleşti'
  });
  const suspicious = pdfVerification.getIssueForMetadataHealth({
    status: 'suspicious',
    summary: 'PDF eşleşmesi şüpheli'
  });

  assert.equal(likely.code, 'review_pdf_match');
  assert.equal(suspicious.code, 'suspicious_pdf_match');
});

test('buildVerificationReport accepts strong title-author-year match without DOI body evidence as likely', () => {
  const report = pdfVerification.buildVerificationReport({
    expectedDoi: '10.1080/10474412.2018.1541413',
    expectedTitle: 'Systematic Review of Early Childhood Mental Health Consultation: Implications for Improving Preschool Discipline Disproportionality',
    doiInBody: false,
    doiInUrl: false,
    titleTokenHits: 7,
    titleTokenTotal: 8,
    authorTokenHits: 2,
    authorTokenTotal: 3,
    yearMatch: true
  });

  assert.equal(report.status, 'likely');
  assert.equal(report.confidence, 'medium');
});
