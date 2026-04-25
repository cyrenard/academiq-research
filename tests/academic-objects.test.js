const test = require('node:test');
const assert = require('node:assert/strict');

const academicObjects = require('../src/academic-objects.js');

test('academic objects exports key helpers', () => {
  assert.equal(typeof academicObjects.slugify, 'function');
  assert.equal(typeof academicObjects.buildCrossRefText, 'function');
  assert.equal(typeof academicObjects.parseFigureTitle, 'function');
  assert.equal(typeof academicObjects.collectTargets, 'function');
  assert.equal(typeof academicObjects.getCaptionManagerEntries, 'function');
  assert.equal(typeof academicObjects.updateCaption, 'function');
  assert.equal(typeof academicObjects.syncCrossRefLabels, 'function');
  assert.equal(typeof academicObjects.normalizeDocument, 'function');
  assert.equal(typeof academicObjects.getNextNumber, 'function');
});

test('academic object helpers normalize labels conservatively', () => {
  assert.equal(academicObjects.slugify('Tablo 1: Örnek Başlık'), 'tablo-1-örnek-başlık');
  assert.equal(academicObjects.buildCrossRefText('Tablo 4'), 'bkz. Tablo 4');
  assert.equal(academicObjects.buildCrossRefText({ label: 'Tablo 4' }, { mode: 'label' }), 'Tablo 4');
  assert.equal(academicObjects.buildCrossRefText({ label: 'Tablo 4' }, { mode: 'number' }), '4');
  assert.equal(
    academicObjects.parseFigureTitle('Şekil 3 - Katılımcı akışı'),
    'Katılımcı akışı'
  );
  assert.equal(
    academicObjects.parseFigureTitle('Figure 2: Sample Model'),
    'Sample Model'
  );
});

test('academic object helpers fail safely without a document root', () => {
  assert.deepEqual(academicObjects.collectTargets({ root: null }), []);
  assert.deepEqual(academicObjects.getCaptionManagerEntries({ root: null }), []);
  assert.equal(academicObjects.updateCaption({ root: null, id: 'x', type: 'table', title: 'Deneme' }), false);
  assert.deepEqual(academicObjects.normalizeDocument({ root: null }), {
    tables: 0,
    figures: 0,
    refsUpdated: 0
  });
  assert.equal(academicObjects.getNextNumber('table', { root: null }), 1);
});
