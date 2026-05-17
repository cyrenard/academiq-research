const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const fixtureDir = path.join(__dirname, 'fixtures', 'cutover');
const goldenDir = path.join(fixtureDir, 'golden');

const fixtureNames = [
  'small-doc',
  'large-doc',
  'turkish-heavy',
  'bibliography-heavy',
  'annotated-pdf'
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function flattenBlocks(fixture) {
  return (fixture.documents || []).flatMap((doc) => doc.blocks || []);
}

function semanticSnapshot(name, fixture) {
  const blocks = flattenBlocks(fixture);
  const citationCount = blocks.reduce((total, block) => total + (Array.isArray(block.citations) ? block.citations.length : 0), 0);
  const text = JSON.stringify(fixture);
  return {
    fixture: name,
    activeDocId: fixture.activeDocId,
    documentCount: Array.isArray(fixture.documents) ? fixture.documents.length : 0,
    blockTypes: blocks.map((block) => block.type),
    headingTexts: blocks.filter((block) => block.type === 'heading').map((block) => block.text),
    citationCount,
    referenceCount: Number(fixture.referenceCount || (Array.isArray(fixture.references) ? fixture.references.length : 0)),
    annotationCount: Number(fixture.annotationCount || (Array.isArray(fixture.annotations) ? fixture.annotations.length : 0)),
    turkishTextPresent: /[ğüşöçıİĞÜŞÖÇ]/.test(text)
  };
}

test('cutover fixtures match Electron golden semantic snapshots', () => {
  for (const name of fixtureNames) {
    const fixture = readJson(path.join(fixtureDir, `${name}.json`));
    const golden = readJson(path.join(goldenDir, `${name}.layout.json`));
    assert.deepEqual(semanticSnapshot(name, fixture), golden, name);
  }
});

test('golden snapshots cover all required cutover fixture classes', () => {
  for (const name of fixtureNames) {
    assert.equal(fs.existsSync(path.join(fixtureDir, `${name}.json`)), true, `${name} fixture`);
    assert.equal(fs.existsSync(path.join(goldenDir, `${name}.layout.json`)), true, `${name} golden`);
  }
});
