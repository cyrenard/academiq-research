const test = require('node:test');
const assert = require('node:assert/strict');

const docx = require('../src/docx-export.js');

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
