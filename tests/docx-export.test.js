const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const docx = require('../src/docx-export.js');
const wordIo = require('../src/tiptap-word-io.js');

function withDocument(fn) {
  const prevDocument = global.document;
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  global.document = dom.window.document;
  try {
    return fn();
  } finally {
    global.document = prevDocument;
  }
}

test('escapeXml escapes the standard XML entities', () => {
  assert.equal(docx.escapeXml('a & b < c > d " \' e'), 'a &amp; b &lt; c &gt; d &quot; &apos; e');
});

test('buildParagraph emits a plain paragraph with text run', () => {
  const xml = docx.buildParagraph({ type:'paragraph', text:'Hello' });
  assert.match(xml, /^<w:p>/);
  assert.match(xml, /<w:r><w:t xml:space="preserve">Hello<\/w:t><\/w:r>/);
});

test('buildParagraph emits heading style via pStyle', () => {
  const xml = docx.buildParagraph({ type:'heading', level:2, text:'Method' });
  assert.match(xml, /<w:pStyle w:val="Heading2"\/>/);
});

test('buildParagraph maps alignment values including justify', () => {
  const justify = docx.buildParagraph({ type:'paragraph', text:'x', align:'justify' });
  assert.match(justify, /<w:jc w:val="both"\/>/);
  const center = docx.buildParagraph({ type:'paragraph', text:'x', align:'center' });
  assert.match(center, /<w:jc w:val="center"\/>/);
});

test('buildParagraph emits run properties for bold/italic/super', () => {
  const xml = docx.buildParagraph({
    type:'paragraph',
    runs:[
      { text:'A', bold:true },
      { text:'B', italic:true, underline:true },
      { text:'2', super:true }
    ]
  });
  assert.match(xml, /<w:b\/>/);
  assert.match(xml, /<w:i\/>/);
  assert.match(xml, /<w:u w:val="single"\/>/);
  assert.match(xml, /<w:vertAlign w:val="superscript"\/>/);
});

test('buildParagraph preserves explicit line breaks and safe hyperlinks', () => {
  const xml = docx.buildParagraph({
    type: 'paragraph',
    runs: [
      { text: 'Birinci\nIkinci' },
      { text: ' OpenAI', href: 'https://openai.com/research' }
    ]
  });

  assert.match(xml, /Birinci<\/w:t><\/w:r><w:r><w:br\/><\/w:r><w:r><w:t[^>]*>Ikinci/);
  assert.match(xml, /<w:fldSimple w:instr="HYPERLINK &quot;https:\/\/openai\.com\/research&quot;">/);
});

test('buildParagraph can emit APA-like font and double spacing metadata', () => {
  const xml = docx.buildParagraph({
    type:'paragraph',
    text:'APA body',
    align:'left',
    lineSpacing:'double',
    firstLine:720,
    runs:[
      { text:'APA body', font:'Times New Roman', size:12 }
    ]
  });

  assert.match(xml, /<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"\/>/);
  assert.match(xml, /<w:sz w:val="24"\/>/);
  assert.match(xml, /<w:spacing w:before="0" w:after="0" w:line="480" w:lineRule="auto"\/>/);
  assert.match(xml, /<w:ind w:firstLine="720"\/>/);
});

test('buildParagraph can emit APA hanging indent for references', () => {
  const xml = docx.buildParagraph({
    type:'paragraph',
    text:'Reference entry',
    style:'ReferenceEntry',
    lineSpacing:'double',
    leftIndent:720,
    hanging:720
  });

  assert.match(xml, /<w:pStyle w:val="ReferenceEntry"\/>/);
  assert.match(xml, /<w:spacing w:before="0" w:after="0" w:line="480" w:lineRule="auto"\/>/);
  assert.match(xml, /<w:ind w:left="720" w:hanging="720"\/>/);
});

test('buildTable emits a real Word table instead of flattened paragraphs', () => {
  const xml = docx.buildTable({
    type: 'table',
    rows: [
      { cells: [{ runs: [{ text: 'Kod' }] }, { runs: [{ text: 'Kategori' }] }] },
      { cells: [{ runs: [{ text: 'A1' }] }, { runs: [{ text: 'Tema' }] }] }
    ]
  });

  assert.match(xml, /^<w:tbl>/);
  assert.equal((xml.match(/<w:tr>/g) || []).length, 2);
  assert.equal((xml.match(/<w:tc>/g) || []).length, 4);
  assert.match(xml, /Kod<\/w:t>/);
  assert.match(xml, /Kategori<\/w:t>/);
});

test('buildDocumentXml wraps blocks in w:document with namespace', () => {
  const xml = docx.buildDocumentXml([
    { type:'heading', level:1, text:'Title' },
    { type:'paragraph', text:'Body' }
  ]);
  assert.match(xml, /^<\?xml /);
  assert.match(xml, /xmlns:w="http:\/\/schemas\.openxmlformats\.org\/wordprocessingml\/2006\/main"/);
  assert.match(xml, /<w:body>.*<w:sectPr\/><\/w:body>/);
  assert.match(xml, /<w:pStyle w:val="Heading1"\/>/);
  assert.match(xml, /Body<\/w:t>/);
});

test('buildDocumentXml escapes text content safely', () => {
  const xml = docx.buildDocumentXml([{ type:'paragraph', text:'<evil>&stuff</evil>' }]);
  assert.equal(xml.includes('<evil>'), false);
  assert.match(xml, /&lt;evil&gt;&amp;stuff&lt;\/evil&gt;/);
});

test('buildDocumentXml preserves table blocks as w:tbl', () => {
  const xml = docx.buildDocumentXml([
    { type: 'paragraph', text: 'Before' },
    { type: 'table', rows: [{ cells: [{ runs: [{ text: 'Cell 1' }] }, { runs: [{ text: 'Cell 2' }] }] }] },
    { type: 'paragraph', text: 'After' }
  ]);

  assert.match(xml, /<w:tbl>/);
  assert.match(xml, /<w:tr><w:tc>/);
  assert.match(xml, /Cell 1<\/w:t>/);
  assert.match(xml, /Cell 2<\/w:t>/);
});

test('buildDocumentXml emits real page breaks and Word numbering properties', () => {
  const xml = docx.buildDocumentXml([
    { type: 'paragraph', text: 'Once' },
    { type: 'pageBreak' },
    { type: 'paragraph', text: 'Bir', numId: 1, listLevel: 0 },
    { type: 'paragraph', text: 'Madde', numId: 2, listLevel: 1 }
  ]);

  assert.match(xml, /<w:br w:type="page"\/>/);
  assert.match(xml, /<w:numPr><w:ilvl w:val="0"\/><w:numId w:val="1"\/><\/w:numPr>/);
  assert.match(xml, /<w:numPr><w:ilvl w:val="1"\/><w:numId w:val="2"\/><\/w:numPr>/);
});

test('htmlToBlocks keeps HTML tables as table blocks', () => {
  const blocks = withDocument(() => docx.htmlToBlocks('<p>Intro</p><table><tr><th>Kod</th><th>Kategori</th></tr><tr><td>A1</td><td>Tema</td></tr></table>'));

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].type, 'paragraph');
  assert.equal(blocks[1].type, 'table');
  assert.equal(blocks[1].rows.length, 2);
  assert.equal(blocks[1].rows[0].cells.length, 2);
  assert.equal(blocks[1].rows[0].cells[0].runs[0].text, 'Kod');
});

test('htmlToBlocks preserves inline spacing, APA sections, lists, block quotes and page breaks', () => {
  const blocks = withDocument(() => docx.htmlToBlocks(
    '<p><strong>Kalın</strong> <em>metin</em></p>'
    + '<p class="aq-page-break"><br></p>'
    + '<ol><li>Bir</li><li>İki</li></ol>'
    + '<blockquote>Uzun alıntı</blockquote>'
    + '<h1 class="bib-title aq-export-page-break-before">Kaynakça</h1>'
    + '<p class="refe">Yazar, A. (2026). Başlık.</p>'
  ));

  assert.equal(blocks[0].runs.map((run) => run.text).join(''), 'Kalın metin');
  assert.equal(blocks[1].type, 'pageBreak');
  assert.equal(blocks[2].numId, 1);
  assert.equal(blocks[3].numId, 1);
  assert.equal(blocks[4].style, 'BlockQuote');
  assert.equal(blocks[5].pageBreakBefore, true);
  assert.equal(blocks[6].style, 'ReferenceEntry');
  assert.equal(blocks[6].hanging, 720);
});

test('buildDocxBytesFromBlocks creates a valid OOXML zip package', () => {
  const bytes = docx.buildDocxBytesFromBlocks([{ type:'paragraph', text:'Merhaba DOCX' }]);
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  const text = Buffer.from(bytes).toString('latin1');
  assert.match(text, /\[Content_Types\]\.xml/);
  assert.match(text, /word\/document\.xml/);
  assert.match(text, /word\/numbering\.xml/);
  assert.match(text, /ReferenceEntry/);
  assert.match(text, /w:line="480"/);
});

test('buildDocxBytesFromHTML stores table markup as OOXML table XML', () => {
  const bytes = withDocument(() => docx.buildDocxBytesFromHTML('<table><tr><td>Kod</td><td>Tema</td></tr></table>'));
  const text = Buffer.from(bytes).toString('latin1');

  assert.match(text, /word\/document\.xml/);
  assert.match(text, /<w:tbl>/);
  assert.match(text, /<w:tc>/);
  assert.match(text, /Kod<\/w:t>/);
  assert.match(text, /Tema<\/w:t>/);
});

test('Word-import smoke fixture survives the HTML to DOCX semantic pipeline', () => {
  const input = fs.readFileSync(
    path.join(__dirname, 'fixtures', 'word-import', 'mixed-word-smoke.html'),
    'utf8'
  );
  const normalized = wordIo.normalizeWordHtml(input);
  const bytes = withDocument(() => docx.buildDocxBytesFromHTML(normalized));
  const packageText = Buffer.from(bytes).toString('utf8');

  assert.match(packageText, /Giris/);
  assert.match(packageText, /Birinci oge/);
  assert.match(packageText, /<w:numPr>/);
  assert.match(packageText, /<w:br w:type="page"\/>/);
  assert.match(packageText, /<w:tbl>/);
  assert.match(packageText, /ReferenceEntry/);
  assert.match(packageText, /Doe, J\./);
});
