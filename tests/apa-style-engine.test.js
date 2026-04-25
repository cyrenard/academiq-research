const assert = require('node:assert/strict');
const test = require('node:test');

const apaStyles = require('../src/apa-style-engine.js');

test('APA style engine exposes heading attrs for APA 7 levels', () => {
  assert.deepEqual(apaStyles.getHeadingAttrs(1), {
    textAlign: 'center',
    style: 'text-align:center !important;text-indent:0'
  });
  assert.deepEqual(apaStyles.getHeadingAttrs(4), {
    textAlign: 'left',
    style: 'text-align:left !important;text-indent:.5in'
  });
  assert.equal(apaStyles.getHeadingStyle(3).fontStyle, 'italic');
  assert.equal(apaStyles.getHeadingStyle(5).fontStyle, 'italic');
});

test('APA style engine builds editor and export heading CSS from one contract', () => {
  const editorCss = apaStyles.buildEditorHeadingCSS('#root');
  const exportCss = apaStyles.buildExportHeadingCSS('.doc');

  assert.match(editorCss, /#root h1\{[^}]*text-align:center !important/);
  assert.match(editorCss, /#root h4\{[^}]*text-indent:\.5in !important/);
  assert.match(exportCss, /\.doc h3\{[^}]*font-style:italic/);
  assert.match(exportCss, /\.doc h5\{[^}]*page-break-after:avoid/);
});

test('APA style engine builds editor block CSS from one contract', () => {
  const css = apaStyles.buildEditorBlockCSS('#root');

  assert.match(css, /#root p\{[^}]*text-indent:\.5in!important/);
  assert.match(css, /#root p\.ni,#root p\[data-indent-mode="none"\]/);
  assert.match(css, /#root \.refe,#root \.aq-ref-entry\{[^}]*text-indent:-\.5in!important/);
  assert.match(css, /#root \.aq-table-title,#root \.aq-figure-caption\{[^}]*font-style:italic!important/);
});

test('APA style engine builds export block CSS for body and references', () => {
  const css = apaStyles.buildExportBlockCSS('.doc');

  assert.match(css, /\.doc p\{[^}]*text-indent:\.5in/);
  assert.match(css, /\.doc \.refe,\.doc \.aq-ref-entry\{[^}]*text-indent:-\.5in/);
  assert.match(css, /\.doc \.aq-table-title,\.doc \.aq-figure-caption\{[^}]*font-style:italic/);
});

test('APA style engine exposes abstract and keywords block contracts', () => {
  const abs = apaStyles.getBlockStyle('abstract');
  const kw = apaStyles.getBlockStyle('keywords');
  assert.equal(abs.className, 'aq-abstract');
  assert.equal(abs.textIndent, '0');
  assert.equal(kw.className, 'aq-keywords');
  assert.equal(kw.fontStyle, 'italic');
});

test('APA style engine returns null for unknown block style ids', () => {
  assert.equal(apaStyles.getBlockStyle(''), null);
  assert.equal(apaStyles.getBlockStyle('nope'), null);
  assert.equal(apaStyles.getBlockAttrs('nope'), null);
});

test('APA style engine builds block attrs with className and style string', () => {
  const attrs = apaStyles.getBlockAttrs('abstract');
  assert.equal(attrs.className, 'aq-abstract');
  assert.equal(attrs.textAlign, 'left');
  assert.match(attrs.style, /text-align:left !important/);
  assert.match(attrs.style, /text-indent:0/);

  const refAttrs = apaStyles.getBlockAttrs('referenceEntry');
  assert.match(refAttrs.style, /text-indent:-\.5in/);
  assert.match(refAttrs.style, /padding-left:\.5in/);
});

test('APA editor and export CSS include abstract/keywords declarations', () => {
  const editor = apaStyles.buildEditorBlockCSS('#root');
  const exp = apaStyles.buildExportBlockCSS('.doc');
  assert.match(editor, /#root p\.aq-abstract\{[^}]*text-indent:0!important/);
  assert.match(editor, /#root p\.aq-keywords\{[^}]*font-style:italic!important/);
  assert.match(exp, /\.doc p\.aq-abstract\{[^}]*text-align:left/);
  assert.match(exp, /\.doc p\.aq-keywords\{[^}]*font-style:italic/);
});

// ---------------------------------------------------------------------------
// Phase 4: APA style engine — defensive contracts and APA 7 keep-with-next.
// ---------------------------------------------------------------------------

test('normalizeLevel clamps out-of-range and invalid heading levels to a safe default', () => {
  // APA headings only go 1..5. Anything else must land on Heading 2 so content
  // is never lost to an unknown level.
  assert.equal(apaStyles.normalizeLevel(0), 2);
  assert.equal(apaStyles.normalizeLevel(6), 2);
  assert.equal(apaStyles.normalizeLevel(-1), 2);
  assert.equal(apaStyles.normalizeLevel('three'), 2);
  assert.equal(apaStyles.normalizeLevel(null), 2);
  assert.equal(apaStyles.normalizeLevel(undefined), 2);
  // Valid inputs still pass through unchanged.
  assert.equal(apaStyles.normalizeLevel(1), 1);
  assert.equal(apaStyles.normalizeLevel('5'), 5);
});

test('getHeadingStyle returns a fresh copy so callers cannot mutate the table', () => {
  const h1 = apaStyles.getHeadingStyle(1);
  h1.textAlign = 'right';
  const again = apaStyles.getHeadingStyle(1);
  assert.equal(again.textAlign, 'center', 'heading table must not leak mutation');
});

test('getBlockStyle returns a fresh copy so callers cannot mutate the table', () => {
  const abs = apaStyles.getBlockStyle('abstract');
  abs.textIndent = '.75in';
  const again = apaStyles.getBlockStyle('abstract');
  assert.equal(again.textIndent, '0', 'block table must not leak mutation');
});

test('export heading CSS enforces APA keep-with-next for every level', () => {
  const css = apaStyles.buildExportHeadingCSS('.doc');
  [1,2,3,4,5].forEach((level) => {
    const re = new RegExp('\\.doc h' + level + '\\{[^}]*page-break-after:avoid');
    assert.match(css, re, 'h' + level + ' must carry page-break-after:avoid for APA keep-with-next');
    const reMs = new RegExp('\\.doc h' + level + '\\{[^}]*break-after:avoid-page');
    assert.match(css, reMs, 'h' + level + ' must carry break-after:avoid-page for modern engines');
  });
});

test('getBlockAttrs emits className, text-align, and indent tokens for every declared block', () => {
  // Every block id declared in the engine must produce attrs the editor can
  // stamp. This protects against new blocks accidentally losing their style
  // surface area during refactors.
  const ids = Object.keys(apaStyles.blockStyles);
  ids.forEach((id) => {
    const attrs = apaStyles.getBlockAttrs(id);
    assert.ok(attrs, 'block ' + id + ' must produce attrs');
    assert.equal(typeof attrs.style, 'string', 'attrs.style must be a string');
    assert.match(attrs.style, /text-align:/);
    assert.match(attrs.style, /text-indent:/);
    // className is optional (only abstract/keywords set one) but must be null
    // rather than undefined when absent, so equality checks stay predictable.
    assert.ok(attrs.className === null || typeof attrs.className === 'string');
  });
});

test('heading and reference block styles agree with APA 7 indentation rules', () => {
  assert.equal(apaStyles.getHeadingStyle(1).textAlign, 'center');
  assert.equal(apaStyles.getHeadingStyle(1).textIndent, '0');
  assert.equal(apaStyles.getHeadingStyle(2).textIndent, '0');
  assert.equal(apaStyles.getHeadingStyle(3).textIndent, '0');
  assert.equal(apaStyles.getHeadingStyle(4).textIndent, '.5in');
  assert.equal(apaStyles.getHeadingStyle(5).textIndent, '.5in');
  assert.equal(apaStyles.getBlockStyle('referenceEntry').textIndent, '-.5in');
  assert.equal(apaStyles.getBlockStyle('referenceEntry').paddingLeft, '.5in');
});
