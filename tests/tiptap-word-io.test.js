const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const io = require('../src/tiptap-word-io.js');

test('tiptap word io exports import and export helpers', () => {
  assert.equal(typeof io.looksLikeHTML, 'function');
  assert.equal(typeof io.normalizeWordHtml, 'function');
  assert.equal(typeof io.normalizeImportHTML, 'function');
  assert.equal(typeof io.applyImportedHTML, 'function');
  assert.equal(typeof io.buildPrintablePageClone, 'function');
  assert.equal(typeof io.buildPDFExportOptions, 'function');
});

test('normalizeImportHTML distinguishes html and plain text', () => {
  assert.equal(io.looksLikeHTML('<p>x</p>'), true);
  assert.equal(io.looksLikeHTML('duz metin'), false);
  assert.match(io.normalizeImportHTML('duz metin', text => '<p>' + text + '</p>'), /<p>duz metin<\/p>/);
  assert.match(io.normalizeImportHTML('<h1>X</h1>'), /<h1>X<\/h1>/);
});

test('normalizeImportHTML strips plain-text Word style artifacts before APA formatter', () => {
  const artifactText = [
    'span.MsoHyperlink { color:#467886; text-decoration:underline; }',
    'mso-style-name:"Baslik 1 Char"; font-family:"Aptos Display";',
    'Gercek akademik paragraf kalmali.'
  ].join('\n');
  const html = io.normalizeImportHTML(artifactText, (text) => '<p>' + text + '</p>');
  assert.match(html, /Gercek akademik paragraf kalmali/);
  assert.equal(/MsoHyperlink|mso-style-name|Aptos Display/i.test(html), false);
});

test('normalizeImportHTML returns empty paragraph when plain-text input is only Word artifact noise', () => {
  const artifactText = 'mso-style-name:"Baslik 1 Char"; font-family:"Aptos Display";';
  const html = io.normalizeImportHTML(artifactText, (text) => '<p>' + text + '</p>');
  assert.match(html, /<p><br><\/p>/i);
});

test('normalizeImportHTML strips line-level artifact lines while preserving prose lines', () => {
  const input = [
    'Giris paragrafi korunmali.',
    'font-family:Aptos Display; color:#0F4761; line-height:200%;',
    'Ikinci paragraf da kalmali.'
  ].join('\n');
  const html = io.normalizeImportHTML(input, (text) => '<p>' + text.replace(/\n/g, '</p><p>') + '</p>');
  assert.match(html, /Giris paragrafi korunmali/);
  assert.match(html, /Ikinci paragraf da kalmali/);
  assert.equal(/Aptos Display|line-height:200/i.test(html), false);
});

test('normalizeImportHTML strips dangerous tags from html input', () => {
  const cleaned = io.normalizeImportHTML('<p>A</p><script>alert(1)</script><iframe src="x"></iframe>');
  assert.equal(cleaned.includes('<script'), false);
  assert.equal(cleaned.includes('<iframe'), false);
  assert.match(cleaned, /<p>A<\/p>/);
});

test('normalizeWordHtml upgrades common Word heading classes', () => {
  const html = io.normalizeWordHtml('<p class="MsoTitle">Ana Baslik</p><p class="MsoHeading2">Alt Baslik</p>');
  assert.match(html, /<h1>Ana Baslik<\/h1>/);
  assert.match(html, /<h2>Alt Baslik<\/h2>/);
});

test('normalizeWordHtml strips office markup and list markers', () => {
  const html = io.normalizeWordHtml('<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><o:p></o:p>1. Bir oge</p>');
  assert.equal(/o:p/i.test(html), false);
  assert.equal(/mso-list/i.test(html), false);
  assert.match(html, /<(ol|ul)>/);
  assert.match(html, /<li>Bir oge<\/li>/);
});

test('normalizeWordHtml preserves ordered list style for lower-alpha markers in Word lists', () => {
  const html = io.normalizeWordHtml(
    '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">a. Ilk oge</p>'
    + '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">b. Ikinci oge</p>'
  );
  assert.match(html, /<ol[^>]*(data-list-style="lower-alpha"|type="a")[^>]*>/i);
  assert.match(html, /<li>Ilk oge<\/li>/);
  assert.match(html, /<li>Ikinci oge<\/li>/);
});

test('normalizeWordHtml preserves ordered list style for lower-roman markers in Word lists', () => {
  const html = io.normalizeWordHtml(
    '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">iv. Dorduncu oge</p>'
    + '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">v. Besinci oge</p>'
  );
  assert.match(html, /<ol[^>]*(data-list-style="lower-roman"|type="i")[^>]*>/i);
  assert.match(html, /<li>Dorduncu oge<\/li>/);
  assert.match(html, /<li>Besinci oge<\/li>/);
});

test('normalizeWordHtml preserves safe Word paragraph and run styles', () => {
  const html = io.normalizeWordHtml(
    '<p class="MsoNormal" style="text-align:center;margin-left:36pt;text-indent:-18pt;mso-style-name:Normal">Baslik</p>' +
    '<p><span style="font-family:Aptos Display;font-size:16pt;color:#0F4761;background-color:#FFFF00;font-weight:bold">Vurgulu</span></p>'
  );
  assert.match(html, /text-align:center/);
  assert.match(html, /margin-left:36pt/);
  assert.match(html, /text-indent:-18pt/);
  assert.match(html, /font-family:Aptos Display/);
  assert.match(html, /font-size:16pt/);
  assert.match(html, /color:#0F4761/i);
  assert.match(html, /background-color:#FFFF00/i);
  assert.match(html, /font-weight:bold/);
  assert.equal(/mso-style-name|MsoNormal/i.test(html), false);
});

test('normalizeWordHtml drops Word VML shape artifacts without leaking textbox text', () => {
  const input = '<p>Normal metin</p>'
    + '<v:shape id="Shape1"><v:textbox><div><p>Rastgele sekil yazisi</p></div></v:textbox></v:shape>'
    + '<p>Devam</p>';
  const html = io.normalizeWordHtml(input);
  assert.match(html, /Normal metin/);
  assert.match(html, /Devam/);
  assert.equal(/Rastgele sekil yazisi/i.test(html), false);
  assert.equal(/v:shape/i.test(html), false);
});

test('applyImportedHTML normalizes mammoth/native Word html before setting editor content', () => {
  let received = '';
  const editor = {
    commands: {
      setContent(html) {
        received = html;
      }
    }
  };
  const ok = io.applyImportedHTML({
    editor,
    html: '<p>Ana metin</p><v:shape><v:textbox><p>Sekil kalintisi</p></v:textbox></v:shape>',
    cleanPastedHTML: html => html
  });
  assert.equal(ok, true);
  assert.match(received, /Ana metin/);
  assert.equal(/Sekil kalintisi/i.test(received), false);
});

test('normalizeWordHtml removes Word CSS when it leaked as visible text', () => {
  const input = '<p>Roman&quot;,serif; font-weight:bold;} a:link, span.MsoHyperlink { color:#467886; text-decoration:underline;}</p>'
    + '<p>Gercek akademik paragraf.</p>'
    + '<p>span.Balk1Char {mso-style-name:&quot;Baslik 1 Char&quot;; font-family:Aptos Display; color:#0F4761;}</p>';
  const html = io.normalizeWordHtml(input);
  assert.match(html, /Gercek akademik paragraf/);
  assert.equal(/MsoHyperlink|mso-style-name|font-family:Aptos/i.test(html), false);
});

test('normalizeWordHtml removes escaped raw tag fragments from Word import text', () => {
  const input = '<p>&lt;span style=&quot;height:200%;color:black&quot;&gt;Sekil/tag artigi&lt;/span&gt;</p>'
    + '<p>Temiz metin kalmali.</p>';
  const html = io.normalizeWordHtml(input);
  assert.match(html, /Temiz metin kalmali/);
  assert.equal(/Sekil\/tag artigi|&lt;span|height:200/i.test(html), false);
});

test('normalizeWordHtml strips broken inline span/style fragments while keeping prose', () => {
  const input = '<p>span style="height:200%;color:black" /span Yapay zeka konusunda kalmasi gereken metin span data-x="1" /span</p>'
    + '<p>span.MsoHyperlink { color:#467886; text-decoration:underline; }</p>';
  const html = io.normalizeWordHtml(input);
  assert.match(html, /Yapay zeka konusunda kalmasi gereken metin/);
  assert.equal(/span style|span data|MsoHyperlink|text-decoration|height:200/i.test(html), false);
});

test('normalizeWordHtml marks imported bibliography paragraphs as reference entries', () => {
  const input = '<p>Giris paragrafi.</p>'
    + '<p>Kaynakca</p>'
    + '<p>Brown, A. L. (1987). Metacognition. Publisher.</p>'
    + '<p class="existing">Selwyn, N. (2016). Is technology good for education? Polity Press.</p>'
    + '<h1>Yeni Bolum</h1><p>Devam metni.</p>';
  const html = io.normalizeWordHtml(input);

  assert.match(html, /<h1>Kaynakca<\/h1>/i);
  assert.match(html, /<p class="refe">Brown, A\. L\./);
  assert.match(html, /class="existing refe"/);
  assert.equal(/<p class="refe">Devam metni/.test(html), false);
});

test('normalizeWordHtml converts Word page breaks to editor page-break paragraphs', () => {
  const input = '<p style="page-break-before:always">Section Break (Next Page)</p><p>Yeni sayfa metni.</p>';
  const html = io.normalizeWordHtml(input);

  assert.match(html, /class="aq-page-break"/);
  assert.match(html, /data-indent-mode="none"/);
  assert.match(html, /Yeni sayfa metni/);
});

test('normalizeWordHtml converts Word br page-break markers into editor page-break paragraphs', () => {
  const input = '<p>Ilk satir.</p><br style="mso-special-character:line-break;page-break-before:always" /><p>Ikinci sayfa metni.</p>';
  const html = io.normalizeWordHtml(input);

  assert.match(html, /class="aq-page-break"/);
  assert.match(html, /Ikinci sayfa metni/);
});

test('normalizeWordHtml catches single-quoted br page-break markers', () => {
  const input = "<p>Sayfa A.</p><br style='mso-break-type:page' /><p>Sayfa B.</p>";
  const html = io.normalizeWordHtml(input);

  assert.match(html, /class="aq-page-break"/);
  assert.match(html, /Sayfa B\./);
});

test('normalizeWordHtml converts Word footnote anchor references into stable superscripts', () => {
  const input = '<p>Metin<a href="#_ftn1" name="_ftnref1">'
    + '<span class="MsoFootnoteReference"><span style="mso-special-character:footnote"></span>1</span>'
    + '</a> devam.</p>';
  const html = io.normalizeWordHtml(input);

  assert.match(html, /<sup class="aq-word-note-ref" data-note-kind="footnote">1<\/sup>/);
  assert.match(html, /Metin/);
  assert.match(html, /devam\./);
});

test('normalizeWordHtml converts Word endnote reference spans into stable superscripts', () => {
  const input = '<p>Paragraf <span class="MsoEndnoteReference"><span style="mso-special-character:endnote"></span>2</span> sonu.</p>';
  const html = io.normalizeWordHtml(input);

  assert.match(html, /<sup class="aq-word-note-ref" data-note-kind="endnote">2<\/sup>/);
  assert.match(html, /Paragraf/);
  assert.match(html, /sonu\./);
});

test('normalizeWordHtml recognizes additional section-break variants in text nodes', () => {
  const input = '<p>Section Break (Odd Page)</p><p>Metin A.</p><p>Bolum Sonu (Sonraki Sayfa)</p><p>Metin B.</p>';
  const html = io.normalizeWordHtml(input);

  const matches = html.match(/class="aq-page-break"/g) || [];
  assert.ok(matches.length >= 2);
  assert.match(html, /Metin A\./);
  assert.match(html, /Metin B\./);
});

test('normalizeWordHtml drops hidden Word comment artifacts but keeps visible prose', () => {
  const input = '<p>Gorunen metin.</p>'
    + '<div class="MsoCommentText" style="display:none">Gizli yorum kalintisi</div>'
    + '<p>Devam metni.</p>';
  const html = io.normalizeWordHtml(input);

  assert.match(html, /Gorunen metin\./);
  assert.match(html, /Devam metni\./);
  assert.equal(/Gizli yorum kalintisi/i.test(html), false);
});

test('normalizeWordHtml handles fixture smoke for br page-break and hidden comments', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'word-import', 'pagebreak-comment-smoke.html');
  const input = fs.readFileSync(fixturePath, 'utf8');
  const html = io.normalizeWordHtml(input);

  const breaks = html.match(/class="aq-page-break"/g) || [];
  assert.ok(breaks.length >= 2);
  assert.match(html, /Ilk satir\./);
  assert.match(html, /Ikinci sayfa metni\./);
  assert.match(html, /Ucuncu sayfa metni\./);
  assert.equal(/Gizli yorum kalintisi/i.test(html), false);
  assert.match(html, /<h1>References<\/h1>/i);
  assert.match(html, /class="refe">Brown, A\. L\./);
});

test('normalizeWordHtml preserves mixed Word structures in one import pass', () => {
  const input = ''
    + '<p class="MsoTitle">Baslik</p>'
    + '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">1. Ilk oge</p>'
    + '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">2. Ikinci oge</p>'
    + '<p style="page-break-before:always">Page Break</p>'
    + '<table style="mso-table-lspace:0pt;"><tr><td style="font-weight:bold;">Hucre</td></tr></table>'
    + '<p>Kaynakca</p>'
    + '<p>Bandura, A. (1989). Social cognitive theory.</p>';
  const html = io.normalizeWordHtml(input);

  assert.match(html, /<h1>Baslik<\/h1>/);
  assert.match(html, /<(ol|ul)>[\s\S]*<li>Ilk oge<\/li>[\s\S]*<li>Ikinci oge<\/li>[\s\S]*<\/(ol|ul)>/);
  assert.match(html, /class="aq-page-break"/);
  assert.match(html, /<table[\s\S]*Hucre[\s\S]*<\/table>/);
  assert.match(html, /class="refe"/);
});

test('normalizeWordHtml treats punctuated references headings as bibliography sections', () => {
  const input = '<p>References:</p>'
    + '<p>Brown, A. L. (1987). Metacognition.</p>'
    + '<p>Selwyn, N. (2016). Is technology good for education?</p>'
    + '<h2>Appendix</h2>'
    + '<p>Appendix body.</p>';
  const html = io.normalizeWordHtml(input);

  assert.match(html, /<h1>References<\/h1>/i);
  assert.match(html, /<p class="refe">Brown, A\. L\./);
  assert.match(html, /<p class="refe">Selwyn, N\./);
  assert.equal(/<p class="refe">Appendix body\./.test(html), false);
});

test('normalizeWordHtml recognizes Turkish kaynakca heading with colon', () => {
  const input = '<p>Kaynak\u00e7a:</p>'
    + '<p>Bandura, A. (1989). Social cognitive theory.</p>'
    + '<h2>Ekler</h2><p>Metin.</p>';
  const html = io.normalizeWordHtml(input);

  assert.match(html, /<h1>Kaynak(?:ca|ça)<\/h1>/i);
  assert.match(html, /class="refe">Bandura, A\./);
  assert.equal(/class="refe">Metin\./.test(html), false);
});

test('normalizeWordHtml handles fixture-based Word smoke sample safely', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'word-import', 'mixed-word-smoke.html');
  const input = fs.readFileSync(fixturePath, 'utf8');
  const html = io.normalizeWordHtml(input);

  assert.match(html, /<h1>Giris<\/h1>/);
  assert.match(html, /<(ol|ul)>[\s\S]*<li>Birinci oge<\/li>[\s\S]*<li>Ikinci oge<\/li>[\s\S]*<\/(ol|ul)>/);
  assert.match(html, /class="aq-page-break"/);
  assert.match(html, /<table[\s\S]*Hucre 1[\s\S]*Hucre 2[\s\S]*<\/table>/);
  assert.match(html, /<h1>Kaynakca<\/h1>/i);
  assert.match(html, /class="refe"/);
});

test('normalizeWordHtml handles real-docx smoke fixture set safely', () => {
  const fixtureDir = path.join(__dirname, 'fixtures', 'word-import');
  const fixtures = [
    'real-docx-thesis-chapter.html',
    'real-docx-endnote-table.html',
    'real-docx-artifact-cleanup.html'
  ];

  fixtures.forEach((fileName) => {
    const input = fs.readFileSync(path.join(fixtureDir, fileName), 'utf8');
    const html = io.normalizeWordHtml(input);

    assert.equal(/mso-style-name|mso-list:|MsoCommentText|MsoListParagraph/i.test(html), false, fileName + ' leaked Word artifacts');
    if(fileName === 'real-docx-thesis-chapter.html'){
      assert.match(html, /<h1>BOLUM 1<\/h1>/i);
      assert.match(html, /aq-word-note-ref" data-note-kind="footnote">1<\/sup>/);
      assert.match(html, /<ol>[\s\S]*Birinci madde[\s\S]*Ikinci madde[\s\S]*<\/ol>/);
      assert.match(html, /class="aq-page-break"/);
      assert.match(html, /<h1>References<\/h1>/i);
      assert.match(html, /class="refe">Brown, A\. L\./);
    }
    if(fileName === 'real-docx-endnote-table.html'){
      assert.match(html, /<h1>Yontem<\/h1>/i);
      assert.match(html, /aq-word-note-ref" data-note-kind="endnote">2<\/sup>/);
      assert.match(html, /<table[\s\S]*Hucre A[\s\S]*Hucre B[\s\S]*<\/table>/);
      assert.match(html, /<h1>Kaynakca<\/h1>/i);
      assert.match(html, /class="refe">Bandura, A\./);
    }
    if(fileName === 'real-docx-artifact-cleanup.html'){
      assert.match(html, /Temiz paragraf kalmali\./);
      assert.equal(/MsoHyperlink|Gizli yorum artigi|font-weight:bold\}\s*a:link/i.test(html), false);
      assert.match(html, /<h1>References<\/h1>/i);
      assert.match(html, /class="refe">Ostermann, T\./);
    }
  });
});
