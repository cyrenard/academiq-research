const test = require('node:test');
const assert = require('node:assert/strict');

const zotero = require('../src/zotero-integration.js');

test('normalizeFormat resolves supported Zotero export formats', () => {
  assert.equal(zotero.normalizeFormat('library.bib'), 'bibtex');
  assert.equal(zotero.normalizeFormat('library.ris'), 'ris');
  assert.equal(zotero.normalizeFormat('library.enw'), 'ris');
  assert.equal(zotero.normalizeFormat('library.csljson'), 'csljson');
  assert.equal(zotero.normalizeFormat('library.json'), 'csljson');
});

test('parseExport delegates to parser by format', () => {
  const calls = [];
  const deps = {
    parseBibTeX(text){ calls.push(['bib', text]); return [{ id: 'b1' }]; },
    parseRIS(text){ calls.push(['ris', text]); return [{ id: 'r1' }]; },
    parseCSLJSON(text){ calls.push(['json', text]); return [{ id: 'j1' }]; }
  };

  assert.deepEqual(zotero.parseExport('refs.bib', 'a', deps), [{ id: 'b1' }]);
  assert.deepEqual(zotero.parseExport('refs.ris', 'b', deps), [{ id: 'r1' }]);
  assert.deepEqual(zotero.parseExport('refs.json', 'c', deps), [{ id: 'j1' }]);
  assert.deepEqual(calls, [['bib', 'a'], ['ris', 'b'], ['json', 'c']]);
});

test('createDirectSyncAdapter exposes guarded pullLibrary extension point', async () => {
  const disabled = zotero.createDirectSyncAdapter(null);
  assert.equal(disabled.isAvailable(), false);
  await assert.rejects(() => disabled.pullLibrary(), /not configured/i);

  const enabled = zotero.createDirectSyncAdapter({
    pullLibrary(context){
      return [{ id: 'z1', scope: context && context.scope }];
    }
  });
  assert.equal(enabled.isAvailable(), true);
  const out = await enabled.pullLibrary({ scope: 'all' });
  assert.deepEqual(out, [{ id: 'z1', scope: 'all' }]);
});
