const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('AQ Engine render centers pages inside the stage', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'engine.js'), 'utf8');
  assert.match(source, /container\.style\.display = 'flex'/);
  assert.match(source, /container\.style\.alignItems = 'center'/);
  assert.match(source, /container\.style\.minWidth = layout\.pageWidthPx \+ 'px'/);
  assert.match(source, /pageEl\.style\.margin = '0 0 ' \+ opts\.pageGapPx \+ 'px'/);
});

test('AQ Engine stage background is transparent so #escroll palette shows through', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'engine.js'), 'utf8');
  assert.match(source, /container\.style\.background = 'transparent'/);
  assert.doesNotMatch(source, /container\.style\.background = '#f6f1e7'/);
  assert.doesNotMatch(source, /container\.style\.background = 'linear-gradient/);
});

test('AQ Engine input focuses capture textarea from pointer fallbacks', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'input.js'), 'utf8');
  assert.match(source, /function scheduleFocusCapture\(\)/);
  assert.match(source, /container\.addEventListener\('pointerdown', scheduleFocusCapture, true\)/);
  assert.match(source, /container\.addEventListener\('mousedown', scheduleFocusCapture\)/);
  assert.match(source, /container\.addEventListener\('click', scheduleFocusCapture, true\)/);
});

test('AQ Engine caret renders at 12pt height instead of full line height', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'selection.js'), 'utf8');
  assert.match(source, /var CARET_HEIGHT_PX = 16/);
  assert.match(source, /caret\.style\.height = CARET_HEIGHT_PX \+ 'px'/);
  assert.match(source, /lineTop \+ Math\.max\(0, \(lineHeight - CARET_HEIGHT_PX\) \/ 2\)/);
  assert.doesNotMatch(source, /caret\.style\.height = lineEl\.style\.height/);
});

test('AQ Engine applies APA 7 five-level heading styles', () => {
  const AQEngineDocument = require(path.join(__dirname, '..', 'experiments', 'aq-engine', 'document.js'));
  const doc = AQEngineDocument.create([
    { runs:[{ text:'Level 1' }] },
    { runs:[{ text:'Level 2' }] },
    { runs:[{ text:'Level 3' }] },
    { runs:[{ text:'Level 4' }] },
    { runs:[{ text:'Level 5' }] },
    { runs:[{ text:'Level 6 request' }] }
  ]);

  doc.setBlockType(0, 'heading', { level:1 });
  doc.setBlockType(1, 'heading', { level:2 });
  doc.setBlockType(2, 'heading', { level:3 });
  doc.setBlockType(3, 'heading', { level:4 });
  doc.setBlockType(4, 'heading', { level:5 });
  doc.setBlockType(5, 'heading', { level:6 });
  const blocks = doc.get().blocks;

  assert.equal(blocks[0].runs[0].text, 'LEVEL 1');
  assert.equal(blocks[0].align, 'center');
  assert.equal(blocks[1].align, 'left');
  assert.equal(blocks[2].font.style, 'italic');
  assert.equal(blocks[3].firstLineIndentPx, 36);
  assert.equal(blocks[4].font.style, 'italic');
  assert.equal(blocks[4].runInHeading, true);
  assert.equal(blocks[5].level, 5);
  blocks.forEach((block) => {
    assert.equal(block.font.sizePt, 12);
    assert.equal(block.font.weight, '700');
    assert.equal(block.spaceAfterPx, 0);
  });
});

test('AQ Engine heading adapters clamp exported headings to APA 7 levels', () => {
  const compat = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'compat-shim.js'), 'utf8');
  const adapter = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'tiptap-adapter.js'), 'utf8');
  const legacy = fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy-runtime.js'), 'utf8');
  assert.match(compat, /function normalizeHeadingLevel\(level\)/);
  assert.match(adapter, /function applyAPA7HeadingStyle\(block, level\)/);
  assert.match(compat, /attrs\.level = normalizeHeadingLevel\(RegExp\.\$1\)/);
  assert.match(adapter, /attrs\.level = normalizeHeadingLevel\(block\.level\)/);
  assert.doesNotMatch(adapter, /HEADING_SIZES_PT/);
  assert.match(legacy, /\^h\[1-5\]\$/);
});

test('AQ Engine APA level 1 headings use Turkish uppercase text', () => {
  const AQEngineDocument = require(path.join(__dirname, '..', 'experiments', 'aq-engine', 'document.js'));
  const doc = AQEngineDocument.create([{ runs:[{ text:'Giriş ve yöntem' }] }]);
  doc.setBlockType(0, 'heading', { level:1 });
  assert.equal(doc.get().blocks[0].runs[0].text, 'GİRİŞ VE YÖNTEM');
});

test('AQ Engine typed input always clears citation marks from new text', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'input.js'), 'utf8');
  assert.match(source, /doc\.applyMark\(at, newOff, 'citation', false\)/);
  assert.match(source, /doc\.applyMark\(at, end, 'citation', false\)/);
  assert.match(source, /function clearCapture\(\)/);
  assert.match(source, /function citationRunBoundsAtOffset\(off\)/);
  assert.match(source, /at = citationBounds\.to/);
  assert.match(source, /typeof e\.data === 'string'/);
  assert.match(source, /text = text\.slice\(-1\)/);
  assert.doesNotMatch(source, /openFromSlash\(query/);
  assert.doesNotMatch(source, /window\.editorTrigRange = \{ from: newOff/);
});

test('AQ Engine suppresses captured autocomplete payloads immediately after citation insert', () => {
  const inputSource = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'input.js'), 'utf8');
  const citationSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'citation-runtime.js'), 'utf8');
  assert.match(inputSource, /shouldSuppressPostCitationInput\(text\)/);
  assert.match(inputSource, /isCitationTransactionBlocked\(\)/);
  assert.match(inputSource, /__aqSuppressNextInputUntil/);
  assert.match(inputSource, /__aqCitationInputBlockedUntil/);
  assert.match(inputSource, /__aqSuppressNextInputTexts/);
  assert.match(citationSource, /suppressPostCitationCapture\(refs, citationText\)/);
  assert.match(citationSource, /beginCitationTransaction\(refs/);
  assert.match(citationSource, /finishCitationTransaction/);
  assert.match(inputSource, /__aqLastCitationText/);
  assert.match(inputSource, /__aqLastCitationSuppressTexts/);
  assert.match(inputSource, /shouldSuppressPostCitationInput\(text\)/);
  assert.match(inputSource, /text = text\.slice\(-1\)/);
  assert.match(citationSource, /window\.__aqLastCitationText = citationText/);
  assert.match(citationSource, /window\.__aqLastCitationSuppressTexts = buildPostCitationSuppressionTexts/);
  assert.match(citationSource, /author \+ ' \(' \+ year \+ '\)'/);
});

test('AQ Engine post-citation suppression never swallows single typed characters', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'input.js'), 'utf8');
  assert.match(source, /normalized\.length > 1 && lastCitation/);
  assert.match(source, /item && normalized\.length > 1/);
  assert.match(source, /isCitationTransactionBlocked\(\) && String\(text\)\.length > 1/);
  assert.match(source, /function isSinglePrintableKey/);
  assert.match(source, /function shouldBlockInputEvent/);
  assert.match(source, /if\(shouldBlockInputEvent\(e\)\)/);
  assert.match(source, /isCitationTransactionBlocked\(\) && !isSinglePrintableKey\(e\)/);
});

test('AQ Engine leaves slash trigger ownership to citation runtime refresh', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'tiptap-word-editor.js'), 'utf8');
  assert.match(source, /AQCitationRuntime\.refreshFromEditor/);
  assert.doesNotMatch(source, /window\.editorTrigRange = \{ from:start, to:end \}/);
  assert.doesNotMatch(source, /openFromSlash\(query/);
  assert.doesNotMatch(source, /openTrig\(query/);
});

test('AQ Engine adapters use canonical APA formatter for citation text', () => {
  const runtime = fs.readFileSync(path.join(__dirname, '..', 'src', 'citation-runtime.js'), 'utf8');
  const adapter = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'tiptap-adapter.js'), 'utf8');
  const bibliography = fs.readFileSync(path.join(__dirname, '..', 'src', 'bibliography-state.js'), 'utf8');
  const fnStart = runtime.indexOf('function getAQEngineCitationText');
  const styleIndex = runtime.indexOf('if(window.AQCitationStyles)', fnStart);
  const visibleIndex = runtime.indexOf('visibleCitationText', styleIndex);
  const labelIndex = runtime.indexOf("var label = ''", fnStart);
  assert.ok(
    styleIndex > fnStart && visibleIndex > styleIndex && visibleIndex < labelIndex,
    'AQ Engine inline insert should prefer the canonical citation style formatter before legacy globals'
  );
  assert.match(adapter, /function canonicalCitationText/);
  assert.match(adapter, /run\.text = canonicalCitationText\(attrs, run\.text\)/);
  assert.match(bibliography, /function canonicalAQEngineCitationText/);
  assert.match(bibliography, /styles\.visibleCitationText\(refs, \{ style: style \}\)/);
  assert.match(bibliography, /canonicalAQEngineCitationText\(refs, options\)/);
});

test('AQ Engine citation insertion writes semantic citation marks', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'citation-runtime.js'), 'utf8');
  assert.match(source, /function insertAQEngineCitation/);
  assert.match(source, /docModel\.insertText\(insertStart, text\)/);
  assert.match(source, /docModel\.applyMark\(insertStart, citationEnd, 'citation'/);
  assert.match(source, /docModel\.applyMark\(citationEnd, insertEnd, 'citation', false\)/);
  assert.match(source, /window\.__aqLastCitationCaret = insertEnd/);
  assert.match(source, /_clearInputCapture/);
  assert.match(source, /setTimeout\(function\(\)\{/);
  assert.match(source, /bookmark = null/);
  assert.match(source, /ref: refIds\.join\(','\)/);
  assert.match(source, /var savedTrigRange = window\.editorTrigRange/);
  assert.match(source, /runtime\.close\(true, \{ preserveSelection:false \}\)/);
  assert.match(source, /suppressTriggerUntil = now \+ 1800/);
  assert.match(source, /blockCitationInsertUntil = now \+ 1800/);
  assert.match(source, /if\(Date\.now\(\) < \(runtime\.state\.blockCitationInsertUntil \|\| 0\)\)/);
  assert.match(source, /triggerMatch = beforeInsert\.match/);
  assert.match(source, /function recentTextAlreadyEndsWithCitation/);
  assert.match(source, /normalizedBefore\.endsWith\(normalizedCitation\)/);
  assert.match(source, /addEventListener\('pointerdown'/);
  assert.match(source, /stopImmediatePropagation/);
  assert.match(source, /runtime\.insertSelection\(refId\)/);
  assert.doesNotMatch(source, /addEventListener\('click'[\s\S]{0,220}runtime\.insertSelection\(refId\)/);
  assert.match(source, /function stopCitationPopupPointerEvent/);
  assert.match(source, /window\.addEventListener\(type, stopCitationPopupPointerEvent, true\)/);
  assert.match(source, /document\.addEventListener\(type, stopCitationPopupPointerEvent, true\)/);
  assert.doesNotMatch(source, /if\(!\\\/\\s\$\/\.test\(text\)\) text \+= ' '/);
  assert.match(source, /trigRangeIsLive = \/\^\\\/\[rt\]/);
  assert.match(source, /const trigRange = trigRangeIsLive \? savedTrigRange : null/);
});

test('AQ Engine textual slash citations prefer narrative author-year text', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'citation-runtime.js'), 'utf8');
  const fnStart = source.indexOf('function getAQEngineCitationText');
  const textualIndex = source.indexOf("if(mode === 'textual')", fnStart);
  const styleIndex = source.indexOf('if(window.AQCitationStyles)', fnStart);
  assert.ok(textualIndex >= 0, 'textual citation branch should exist');
  assert.ok(styleIndex >= 0, 'style citation branch should exist');
  assert.ok(textualIndex < styleIndex, 'textual /t citations must use narrative text before parenthetical style formatting');
  assert.match(source, /window\.getNarrativeCitationText/);
});

test('AQ Engine citation insert bypasses legacy repeated reference sync loop', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'citation-runtime.js'), 'utf8');
  assert.match(source, /function finishAQEngineCitationInsert/);
  assert.match(source, /if\(activeEditorAfterInsert && activeEditorAfterInsert\._aqEngine\)\{[\s\S]{0,120}finishAQEngineCitationInsert\(caretPos, refs, citationHTML\);[\s\S]{0,40}return;/);
  assert.match(source, /window\.updateRefSection\(true\)/);
  assert.match(source, /aqEngineCitation\.finish\.done/);
  assert.ok(
    source.indexOf('finishAQEngineCitationInsert(caretPos, refs, citationHTML);') <
    source.indexOf('const syncToken = runtime.beginSyncCycle();', source.indexOf('finishAQEngineCitationInsert(caretPos, refs, citationHTML);')),
    'AQ Engine insert should return before the legacy multi-pass sync loop'
  );
});

test('AQ Engine renders citations as plain editable text', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'engine.js'), 'utf8');
  assert.match(source, /if\(it\.citation\)\{[\s\S]{0,140}span\.style\.cursor = 'text'/);
  assert.match(source, /if\(it\.citation\)\{[\s\S]{0,170}span\.style\.pointerEvents = 'none'/);
  assert.match(source, /span\.className = 'aq-cit'/);
  assert.match(source, /span\.dataset\.aqRef/);
  assert.doesNotMatch(source, /span\.className = 'cit aq-cit'/);
  assert.doesNotMatch(source, /if\(it\.citation\)\{[\s\S]{0,140}span\.style\.cursor = 'pointer'/);
});

test('AQ Engine render keeps visual citation DOM away from legacy citation handlers', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'engine.js'), 'utf8');
  const citationBlock = source.match(/if\(it\.citation\)\{[\s\S]*?\n          \}/);
  assert.ok(citationBlock, 'citation render block should exist');
  assert.doesNotMatch(citationBlock[0], /\bclassName = 'cit/);
  assert.doesNotMatch(citationBlock[0], /\.dataset\.ref\b/);
  assert.doesNotMatch(citationBlock[0], /\.dataset\.mode\b/);
});

test('AQ Engine owns line wrapping in the renderer', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'engine.js'), 'utf8');
  assert.match(source, /lineEl\.style\.whiteSpace = 'pre'/);
  assert.match(source, /lineEl\.style\.overflow = 'visible'/);
  assert.match(source, /span\.style\.display = 'inline-block'/);
  assert.match(source, /span\.style\.whiteSpace = 'pre'/);
});

test('AQ Engine renders imported soft line breaks as spaces', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'engine.js'), 'utf8');
  assert.match(source, /text: isSpace \? ' ' : seg/);
  assert.match(source, /tokens\.push\(\{ text: \/\^\\s\/\.test\(m\[0\]\) \? ' ' : m\[0\]/);
});

test('AQ Engine HTML export preserves bibliography paragraph attrs', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'compat-shim.js'), 'utf8');
  assert.match(source, /attrs\.class = className/);
  assert.ok(source.includes('data-ref-id="\' + escHTML(attrs.refId)'));
  assert.ok(source.includes('class="\' + escHTML(attrs.class)'));
  assert.match(source, /classList\.contains\('aq-mn-store'\)/);
  assert.match(source, /data-editor-only/);
});

test('AQ Engine compatibility layer ignores duplicate citation HTML inserts', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'compat-shim.js'), 'utf8');
  assert.match(source, /function shouldIgnoreDuplicateCitationHTML/);
  assert.match(source, /htmlLooksLikeCitationInsert/);
  assert.match(source, /__aqCitationTransactionActive/);
  assert.match(source, /shouldIgnoreDuplicateCitationHTML\(html, at\)/);
});

test('AQ Engine HTML roundtrip preserves bibliography and appendix section semantics', () => {
  const compat = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'compat-shim.js'), 'utf8');
  const adapter = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'tiptap-adapter.js'), 'utf8');
  const legacy = fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy-runtime.js'), 'utf8');
  assert.match(compat, /attrs\.appendixId = appendixId/);
  assert.ok(compat.includes('data-appendix-id="\' + escHTML(attrs.appendixId)'));
  assert.match(adapter, /block\._isBibHeading = true/);
  assert.match(adapter, /block\.runs = \[\{ text: 'KAYNAK\\u00c7A', bold: true \}\]/);
  assert.match(adapter, /block\._isAppendixHeading = true/);
  assert.match(adapter, /addClass\(attrs, 'appendix-title aq-export-page-break-before'\)/);
  assert.match(legacy, /if\(appendicesHTML\)\{\s*updateAQEngineAppendices/);
});

test('AQ Engine export marks bibliography and appendix page breaks without legacy duplicates', () => {
  const adapter = require(path.join(__dirname, '..', 'experiments', 'aq-engine', 'tiptap-adapter.js'));
  const legacy = fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy-runtime.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'academiq-research.html'), 'utf8');
  const exported = adapter.exportToTipTap([
    { type:'paragraph', runs:[{ text:'Ana metin' }] },
    { type:'heading', level:1, _isBibHeading:true, runs:[{ text:'KAYNAKÇA' }] },
    { type:'paragraph', _isBibEntry:true, attrs:{ refId:'r1' }, runs:[{ text:'Yazar, A. (2026).' }] },
    { type:'heading', level:1, _isAppendixHeading:true, _appendixId:'app-1', runs:[{ text:'EK-1' }] }
  ]);
  assert.equal(exported.content[1].attrs.class, 'bib-title aq-export-page-break-before');
  assert.equal(exported.content[2].attrs.class, 'refe aq-ref-entry');
  assert.equal(exported.content[3].attrs.class, 'appendix-title aq-export-page-break-before');
  assert.match(legacy, /var isAQEngine=!!\(activeEditor&&activeEditor\._aqEngine\)/);
  assert.match(legacy, /var appendicesHTML=isAQEngine\?''/);
  assert.match(legacy, /var bibSource=isAQEngine\?''/);
  assert.match(html, /var isAQEngine=!!\(activeEditor&&activeEditor\._aqEngine\)/);
  assert.match(html, /var appendicesHTML=isAQEngine\?''/);
  assert.match(html, /var bibSource=isAQEngine\?''/);
});

test('AQ Engine TOC uses engine layout page numbers', () => {
  const toc = fs.readFileSync(path.join(__dirname, '..', 'src', 'tiptap-word-toc.js'), 'utf8');
  const compat = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'compat-shim.js'), 'utf8');
  const legacy = fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy-runtime.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'academiq-research.html'), 'utf8');
  assert.match(toc, /function collectAQEngineHeadings\(editor, deps\)/);
  assert.match(toc, /pageByBlock\[index\] \|\| 1/);
  assert.match(toc, /function buildAQEngineTOCHTML\(editor, deps\)/);
  assert.match(compat, /editorObj\._aqLayout = layout/);
  assert.match(legacy, /buildAQEngineTOCHTML\(activeEditor/);
  assert.match(html, /buildAQEngineTOCHTML\(activeEditor/);
});

test('DOCX import targets the active AQ Engine editor', () => {
  const io = fs.readFileSync(path.join(__dirname, '..', 'src', 'tiptap-word-io.js'), 'utf8');
  const legacy = fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy-runtime.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'academiq-research.html'), 'utf8');
  assert.match(io, /function applyAQEngineImportedHTML\(editor, html, options\)/);
  assert.match(io, /AQEngineCompat[\s\S]{0,80}htmlToBlocks/);
  assert.match(io, /editor\._docModel\.replace\(blocks\)/);
  assert.match(legacy, /var activeEditor=typeof getActiveEditorInstance==='function'\?getActiveEditorInstance\(\):\(window\.editor\|\|editor\|\|null\)/);
  assert.match(legacy, /editor:activeEditor\|\|null/);
  assert.match(html, /var activeEditor=typeof getActiveEditorInstance==='function'\?getActiveEditorInstance\(\):\(window\.editor\|\|editor\|\|null\)/);
  assert.match(html, /editor:activeEditor\|\|null/);
});

test('AQ Engine adapter repairs joined Turkish Word import prose', () => {
  const adapter = require(path.join(__dirname, '..', 'experiments', 'aq-engine', 'tiptap-adapter.js'));
  const blocks = adapter.convertDoc({
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'Teknolojinin gelişimiylebirlikte dijitalleşme halinegelmiştir ve teknolojilerinyalnızca şekildekullanılmaya başlamıştır. Bu durum insanbilişinin daetkileşim içinde olduğunu gösterir.'
      }]
    }]
  });
  const text = blocks[0].runs.map(run => run.text).join('');
  assert.match(text, /gelişimiyle birlikte/);
  assert.match(text, /haline gelmiştir/);
  assert.match(text, /teknolojilerin yalnızca/);
  assert.match(text, /şekilde kullanılmaya/);
  assert.match(text, /insan bilişinin/);
  assert.match(text, /da etkileşim/);
});

test('AQ Engine document model repairs joined Turkish Word import prose on replace', () => {
  const AQEngineDocument = require(path.join(__dirname, '..', 'experiments', 'aq-engine', 'document.js'));
  const doc = AQEngineDocument.create([{
    runs: [{
      text: 'Teknolojinin gelişimiylebirlikte dijitalleşme halinegelmiştir. Dijital teknolojilerinyalnızca şekildekullanılmaya başlamıştır. Bu durum insanbilişinin daetkileşim içinde olduğunu gösterir.'
    }]
  }]);
  let text = doc.getPlainText();
  assert.match(text, /gelişimiyle birlikte/);
  assert.match(text, /haline gelmiştir/);
  assert.match(text, /teknolojilerin yalnızca/);
  assert.match(text, /şekilde kullanılmaya/);
  assert.match(text, /insan bilişinin/);
  assert.match(text, /da etkileşim/);

  doc.replace([{ runs: [{ text: 'Dijitalleşmehayatımızın her alanına giren birkavram olarak görülmektedir.' }] }]);
  text = doc.getPlainText();
  assert.match(text, /Dijitalleşme hayatımızın/);
  assert.match(text, /bir kavram/);
});

test('AQ Engine document model repairs chained Turkish Word import joins', () => {
  const AQEngineDocument = require(path.join(__dirname, '..', 'experiments', 'aq-engine', 'document.js'));
  const doc = AQEngineDocument.create([{
    runs: [{
      text: 'Dijitalleşmenin dikkat bellek ve problem çözme üzerindeçeşitliilişkileribulunabilmektedir.'
    }]
  }]);
  const text = doc.getPlainText();
  assert.match(text, /üzerinde çeşitli ilişkileri bulunabilmektedir/);
});

test('AQ Engine document model repairs zero-width damaged Turkish Word joins', () => {
  const AQEngineDocument = require(path.join(__dirname, '..', 'experiments', 'aq-engine', 'document.js'));
  const doc = AQEngineDocument.create([{
    runs: [{
      text: 'Dijitalleşmenin dikkat, bellek ve problem çözme üzerinde çeşitli \u200b leri bulunabilmektedir.'
    }]
  }]);
  const text = doc.getPlainText();
  assert.match(text, /üzerinde çeşitli ilişkileri bulunabilmektedir/);
  assert.equal(/\u200b/.test(text), false);
});

test('React editor hydrate repairs persisted Word import HTML before mounting AQ Engine', () => {
  const adapter = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'lib', 'editor-adapter.ts'), 'utf8');
  const appState = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'lib', 'app-state.ts'), 'utf8');

  assert.match(adapter, /repairPersistedWordHTML/);
  assert.match(adapter, /AQTipTapWordIO[\s\S]{0,120}repairWordImportHTML/);
  assert.match(adapter, /docs = sourceDocs\.map/);
  assert.match(appState, /function repairImportedWordHTML/);
  assert.match(appState, /repairWordImportText/);
});

test('AQ Engine footnotes use the engine document model', () => {
  const footnotes = fs.readFileSync(path.join(__dirname, '..', 'src', 'tiptap-word-footnotes.js'), 'utf8');
  const adapter = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'tiptap-adapter.js'), 'utf8');
  const compat = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'compat-shim.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'academiq-research.html'), 'utf8');
  assert.match(footnotes, /function insertAQEngineFootnote\(editor, type\)/);
  assert.match(footnotes, /docModel\.applyMark\(from, from \+ 1, 'footnote'/);
  assert.match(footnotes, /syncAQEngineFootnoteNumbers\(editor\)/);
  assert.match(footnotes, /sup\.fn-ref,\.aq-fn-ref/);
  assert.match(footnotes, /function bindToolbarEvents\(\)/);
  assert.match(footnotes, /#btnFootnote,#btnEndnote,#btnCrossRef/);
  assert.match(footnotes, /function renderAQEngineFootnotePanels\(editor\)/);
  assert.match(footnotes, /\.aq-page-fn-panel/);
  assert.match(footnotes, /pageEl\.appendChild\(panel\)/);
  assert.match(adapter, /n\.type === 'footnoteRef'[\s\S]{0,320}text: '1'/);
  assert.match(compat, /classList\.contains\('aq-fn-ref'\)/);
  assert.match(compat, /data-fn-type/);
  assert.ok(html.includes('<script src="./src/tiptap-word-footnotes.js">'), 'footnotes module must be loaded as src/ script');
});

test('AQ Engine cross references use the engine document model', () => {
  const footnotes = fs.readFileSync(path.join(__dirname, '..', 'src', 'tiptap-word-footnotes.js'), 'utf8');
  const adapter = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'tiptap-adapter.js'), 'utf8');
  const compat = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'compat-shim.js'), 'utf8');
  const engine = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'engine.js'), 'utf8');
  const documentSource = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'document.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'academiq-research.html'), 'utf8');
  assert.match(footnotes, /function collectAQEngineCrossRefTargets\(editor\)/);
  assert.match(footnotes, /function ensureAQEngineCrossRefIds\(editor\)/);
  assert.match(footnotes, /docModel\.applyMark\(from, from \+ text\.length, 'crossRef'/);
  assert.match(adapter, /t === 'crossRef'/);
  assert.match(adapter, /marks\.push\(\{ type: 'crossRef'/);
  assert.match(compat, /classList\.contains\('cross-ref'\)/);
  assert.match(compat, /m\.type === 'crossRef'/);
  assert.match(engine, /it\.crossRef/);
  assert.match(documentSource, /crossRef: r\.crossRef/);
  assert.ok(html.includes('<script src="./src/tiptap-word-footnotes.js">'), 'footnotes module must be loaded as src/ script');
});

test('AQ Engine imports and renders inserted images as image blocks', () => {
  const compat = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'compat-shim.js'), 'utf8');
  const adapter = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'tiptap-adapter.js'), 'utf8');
  const engine = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'engine.js'), 'utf8');
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tiptap-word-content.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'academiq-research.html'), 'utf8');
  assert.match(compat, /table\|image/);
  assert.match(compat, /tag === 'figure'/);
  assert.match(compat, /tag === 'figcaption'/);
  assert.match(adapter, /if\(type === 'image'\)/);
  assert.match(adapter, /parseImageWidth/);
  assert.match(engine, /function resolveBlockWidth\(value, fallback\)/);
  assert.match(engine, /resolveBlockWidth\(block\.width, contentWidthPx\)/);
  assert.match(content, /if\(editor && editor\._aqEngine\)/);
  assert.ok(html.includes('<script src="./src/tiptap-word-content.js">'), 'content module must be loaded as src/ script');
});

test('AQ Engine caption manager reads and updates model objects', () => {
  const academic = fs.readFileSync(path.join(__dirname, '..', 'src', 'academic-objects.js'), 'utf8');
  const legacy = fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy-runtime.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'academiq-research.html'), 'utf8');
  assert.match(academic, /function collectAQCaptionManagerEntries\(options\)/);
  assert.match(academic, /function updateAQCaption\(options\)/);
  assert.match(academic, /function ensureAQObjectIds\(editor\)/);
  assert.match(academic, /commitAQBlocks\(editor, blocks\)/);
  assert.match(legacy, /getNextNumber\(type,\{root:document\.getElementById\('apaed'\),editor:getActiveEditorInstance\(\)\}\)/);
  assert.match(legacy, /getCaptionManagerEntries\(\{root:rootEl,editor:activeEditor\|\|null\}\)/);
  assert.match(legacy, /editor:activeEditor\|\|null/);
  assert.ok(html.includes('<script src="./src/academic-objects.js">'), 'academic-objects module must be loaded as src/ script');
});

test('AQ Engine document outline reads model entries and page layout', () => {
  const outline = fs.readFileSync(path.join(__dirname, '..', 'src', 'document-outline.js'), 'utf8');
  const legacy = fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy-runtime.js'), 'utf8');
  const engine = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'engine.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'academiq-research.html'), 'utf8');
  assert.match(outline, /function collectAQEngineEntries\(editor\)/);
  assert.match(outline, /function ensureAQOutlineIds\(editor\)/);
  assert.match(outline, /editor\._aqLayout/);
  assert.match(outline, /pageByBlock\[index\] \|\| 1/);
  assert.match(outline, /\[data-ref-id="/);
  assert.match(legacy, /collectEntries\(\{\s*root:rootEl,\s*editor:activeEditor\|\|null,/);
  assert.match(legacy, /scrollToEntry\(\{\s*root:rootEl,\s*editor:activeEditor\|\|null,/);
  assert.match(engine, /refId: \(block\.attrs && block\.attrs\.refId\) \|\| block\._refId \|\| null/);
  assert.match(engine, /imgEl\.dataset\.refId = line\.refId/);
  assert.match(engine, /rowEl\.dataset\.refId = line\.refId/);
  assert.ok(html.includes('<script src="./src/document-outline.js">'), 'document-outline module must be loaded as src/ script');
});

test('AQ Engine find and replace use native document model offsets', () => {
  const findSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'tiptap-word-find.js'), 'utf8');
  const legacy = fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy-runtime.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'academiq-research.html'), 'utf8');
  assert.match(findSource, /function buildAQEngineSearchBuffer\(editor\)/);
  assert.match(findSource, /function buildAQEngineSearchRanges\(editor, query, useRegex, caseSensitive\)/);
  assert.match(findSource, /isAQEngineEditor\(editor\)/);
  assert.match(findSource, /editor\._docModel\.deleteRange\(aqRange\.from, aqRange\.to\)/);
  assert.match(findSource, /editor\._docModel\.insertText\(aqRange\.from, replacement\)/);
  assert.match(legacy, /var activeEditor=typeof getActiveEditorInstance==='function'\?getActiveEditorInstance\(\):\(editor\|\|null\);/);
  assert.match(legacy, /editor:activeEditor\|\|null/);
  assert.ok(html.includes('<script src="./src/tiptap-word-find.js">'), 'find module must be loaded as src/ script');
});

test('AQ Engine track changes use run marks and model decisions', () => {
  const commands = fs.readFileSync(path.join(__dirname, '..', 'src', 'tiptap-word-commands.js'), 'utf8');
  const input = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'input.js'), 'utf8');
  const engine = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'engine.js'), 'utf8');
  const documentSource = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'document.js'), 'utf8');
  const adapter = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'tiptap-adapter.js'), 'utf8');
  const compat = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'compat-shim.js'), 'utf8');
  const legacy = fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy-runtime.js'), 'utf8');
  assert.match(commands, /function collectAQTrackRanges\(editor, markName\)/);
  assert.match(commands, /isAQEngineEditor\(editor\)/);
  assert.match(commands, /editor\._docModel\.deleteRange\(range\.from, range\.to\)/);
  assert.match(input, /function markTrackedDeletion\(from, to\)/);
  assert.match(input, /doc\.applyMark\(at, newOff, 'trackInsert', true\)/);
  assert.match(engine, /it\.trackInsert/);
  assert.match(engine, /aq-track-delete/);
  assert.match(documentSource, /trackInsert','trackDelete/);
  assert.match(adapter, /t === 'trackInsert'/);
  assert.match(compat, /data-track-change="insert"/);
  assert.match(legacy, /getActiveEditorInstance\(\):\(\(typeof window/);
});

test('AQ Engine bibliography titles render as KAYNAKCA uppercase heading', () => {
  const bibliography = fs.readFileSync(path.join(__dirname, '..', 'src', 'bibliography-state.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'academiq-research.html'), 'utf8');
  assert.match(bibliography, /text: 'KAYNAK\\u00c7A'/);
  assert.match(bibliography, /<h1>KAYNAKÇA<\/h1>/);
  assert.ok(html.includes('<script src="./src/bibliography-state.js">'), 'bibliography-state module must be loaded as src/ script');
});

test('AQ Engine bibliography entries keep APA 7 hanging indent and double spacing', () => {
  const bibliography = fs.readFileSync(path.join(__dirname, '..', 'src', 'bibliography-state.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'academiq-research.html'), 'utf8');
  const adapter = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'tiptap-adapter.js'), 'utf8');
  const compat = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'compat-shim.js'), 'utf8');
  [bibliography, adapter, compat].forEach((source) => {
    assert.match(source, /leftIndentPx = 48|leftIndentPx: 48/);
    assert.match(source, /firstLineIndentPx = -48|firstLineIndentPx: -48/);
    assert.match(source, /lineHeightFactor = 2\.0|lineHeightFactor: 2\.0/);
    assert.match(source, /spaceAfterPx = 0|spaceAfterPx: 0/);
  });
  assert.match(compat, /applyAPA7BibliographyEntryStyle\(b\)/);
  assert.match(adapter, /applyAPA7BibliographyEntryStyle\(block\)/);
  assert.ok(html.includes('<script src="./src/bibliography-state.js">'), 'bibliography-state module must be loaded as src/ script');
});

test('React AQ Engine adapter binds slash citations to bibliography sync', () => {
  const adapter = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'lib', 'editor-adapter.ts'), 'utf8');
  const host = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'components', 'shell', 'LegacyCompatibilityHost.tsx'), 'utf8');
  const reactHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(adapter, /function installReferenceBridge/);
  assert.match(adapter, /win\.updateRefSection = \(forceAuto\?: boolean\) =>/);
  assert.match(adapter, /AQBibliographyState\.syncReferenceViewsForState/);
  assert.match(adapter, /AQCitationRuntime\.insertSelection/);
  assert.match(adapter, /AQCitationRuntime\.openFromSlash\('', 'inline'\)/);
  assert.match(adapter, /win\.AQReferenceManager = \{/);
  assert.match(adapter, /filterReferences: \(query: string/);
  assert.match(adapter, /win\.filterRefsForQuery =/);
  assert.match(adapter, /win\.buildCitationHTML =/);
  assert.match(adapter, /AQCitationState\.buildCitationHTML/);
  assert.match(host, /id="trig"/);
  assert.match(host, /id="tgs"/);
  assert.match(host, /id="tgl"/);
  assert.ok(reactHtml.includes('<script src="/src/citation-runtime.js"></script>'), 'React shell must load the legacy citation runtime');
  assert.ok(reactHtml.includes('<script src="/src/literature-matrix-view.js"></script>'), 'React shell must load the literature matrix view runtime');
  assert.ok(reactHtml.includes('<script src="/src/legacy-runtime.js"></script>'), 'React shell must load legacy runtime for callLegacy bridges');
});

test('React shell keeps PDF region capture controls behind a guarded legacy bridge', () => {
  const reactHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const host = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'components', 'shell', 'LegacyCompatibilityHost.tsx'), 'utf8');
  const adapter = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'lib', 'legacy-feature-adapter.ts'), 'utf8');
  const shell = fs.readFileSync(path.join(__dirname, '..', 'src', 'lean-ui-shell.js'), 'utf8');

  assert.ok(reactHtml.includes('<script src="/src/legacy-runtime.js"></script>'));
  assert.match(host, /pdfRegionBtn/);
  assert.match(host, /togglePdfRegionCaptureMode/);
  assert.match(host, /PDF bölge yakalama henüz aktif değil/);
  assert.match(adapter, /pdf-region/);
  assert.match(shell, /capture-pdf-region/);
});

test('AQ Engine typing after a citation does not extend the citation mark', () => {
  const AQEngineDocument = require(path.join(__dirname, '..', 'experiments', 'aq-engine', 'document.js'));
  const doc = AQEngineDocument.create([{
    runs: [
      { text: '(Hwang vd., 2012)', citation: { ref: 'ref1', mode: 'inline' } },
      { text: ' ' }
    ]
  }]);
  const citationEnd = '(Hwang vd., 2012)'.length;
  doc.insertText(citationEnd, ' ');
  const runs = doc.get().blocks[0].runs;
  assert.equal(runs[0].text, '(Hwang vd., 2012)');
  assert.deepEqual(runs[0].citation, { ref: 'ref1', mode: 'inline' });
  assert.equal(runs.slice(1).map(run => run.text).join(''), '  ');
  assert.equal(runs.slice(1).some(run => run.citation), false);
});

test('AQ Engine document model rejects duplicate citation text inserts', () => {
  const AQEngineDocument = require(path.join(__dirname, '..', 'experiments', 'aq-engine', 'document.js'));
  const citation = '(Hwang vd., 2012)';
  const doc = AQEngineDocument.create([{
    runs: [
      { text: citation, citation: { ref: 'ref1', mode: 'inline' } },
      { text: ' ' }
    ]
  }]);
  doc.insertText(citation.length, citation);
  assert.equal(doc.getPlainText(), citation + ' ');
  doc.insertText(citation.length + 1, citation);
  assert.equal(doc.getPlainText(), citation + ' ');
});

test('AQ Engine document commits collapse duplicated citation runs', () => {
  const AQEngineDocument = require(path.join(__dirname, '..', 'experiments', 'aq-engine', 'document.js'));
  const citation = '(Hwang vd., 2012)';
  const doc = AQEngineDocument.create([{
    runs: [
      { text: citation + ' ' + citation + ' ' + citation, citation: { ref: 'ref1', mode: 'inline' } }
    ]
  }]);
  doc.applyMark(0, citation.length, 'citation', { ref: 'ref1', mode: 'inline' });
  assert.equal(doc.getPlainText(), citation);
});

test('AQ Engine document commits collapse adjacent duplicated citation text', () => {
  const AQEngineDocument = require(path.join(__dirname, '..', 'experiments', 'aq-engine', 'document.js'));
  const citation = '(Krossbakken vd., 2018)';
  const doc = AQEngineDocument.create([{
    runs: [
      { text: citation + citation + citation + citation, citation: { ref: 'ref1', mode: 'inline' } }
    ]
  }]);
  doc.applyMark(0, citation.length, 'citation', { ref: 'ref1', mode: 'inline' });
  assert.equal(doc.getPlainText(), citation);
});

test('AQ Engine document creation collapses saved duplicated citation text', () => {
  const AQEngineDocument = require(path.join(__dirname, '..', 'experiments', 'aq-engine', 'document.js'));
  const citation = '(Krossbakken vd., 2018)';
  const doc = AQEngineDocument.create([{
    runs: [
      { text: citation + citation + citation, citation: { ref: 'ref1', mode: 'inline' } }
    ]
  }]);
  assert.equal(doc.getPlainText(), citation);
});

test('AQ Engine document commits collapse duplicated citation runs separated by spaces', () => {
  const AQEngineDocument = require(path.join(__dirname, '..', 'experiments', 'aq-engine', 'document.js'));
  const citation = '(Hwang vd., 2012)';
  const doc = AQEngineDocument.create([{
    runs: [
      { text: citation, citation: { ref: 'ref1', mode: 'inline' } },
      { text: ' ' },
      { text: citation, citation: { ref: 'ref1', mode: 'inline' } },
      { text: ' ' },
      { text: citation }
    ]
  }]);
  doc.applyMark(0, citation.length, 'citation', { ref: 'ref1', mode: 'inline' });
  assert.equal(doc.getPlainText(), citation);
});

test('AQ Engine appendix integration writes appendix blocks into the model', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy-runtime.js'), 'utf8');
  assert.match(source, /function insAppendix\(\)/);
  assert.match(source, /function updateAQEngineAppendices/);
  assert.match(source, /block\.pageBreak=true/);
  assert.match(source, /block\._isAppendixHeading=true/);
  assert.match(source, /getAppendixTitleText\(appendixIndex\)/);
  assert.match(source, /appendAppendixHTML/);
  assert.match(source, /docModel\.replace\(blocks\.concat\(appendixBlocks\)\)/);
});

test('AQ Engine appendix headings expose hover delete controls', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'engine.js'), 'utf8');
  assert.match(source, /aq-appendix-delete-btn/);
  assert.match(source, /aq-delete-appendix/);
  assert.match(source, /line\.isAppendixHeading && line\.isFirstLineOfBlock/);
  assert.match(source, /pointerEvents = 'none'/);
});

test('AQ Engine heading lines expose heading metadata without becoming cross-ref popups', () => {
  const engine = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'engine.js'), 'utf8');
  assert.match(engine, /blockType: block\.type \|\| 'paragraph'/);
  assert.match(engine, /headingLevel: block\.type === 'heading'/);
  assert.match(engine, /lineEl\.dataset\.refType = 'heading'/);
  assert.match(engine, /lineEl\.dataset\.headingLevel = String\(line\.headingLevel\)/);
});

test('React Word import persists imported document through legacy storage', () => {
  // Word-import flow was extracted from LegacyCompatibilityHost.tsx to
  // src/renderer/lib/file-import.ts in the audit-followthrough refactor.
  const fileImport = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'lib', 'file-import.ts'), 'utf8');
  const host = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'components', 'shell', 'LegacyCompatibilityHost.tsx'), 'utf8');
  assert.match(fileImport, /function persistImportedWordDocument/);
  assert.match(fileImport, /__aqBuildPersistedStateJSON/);
  assert.match(fileImport, /electronAPI\?\.saveEditorDraft/);
  assert.match(fileImport, /electronAPI\?\.saveData/);
  assert.match(fileImport, /scheduleImportedWordPersist\(onStatus\)/);
  assert.match(fileImport, /const source = normalized \|\| html/);
  // Verify the host imports the public Word-import API
  assert.match(host, /importWordFileDirect/);
});

test('React shell scopes notes by workspace and hydrates auxiliary document pages', () => {
  const appState = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'lib', 'app-state.ts'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'App.tsx'), 'utf8');
  const adapter = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'lib', 'editor-adapter.ts'), 'utf8');

  assert.match(appState, /wsId\?: string/);
  assert.match(appState, /inferNoteWorkspaceId/);
  assert.match(appState, /wsId: state\.cur/);
  assert.match(app, /activeWorkspaceNotes/);
  assert.match(app, /notes=\{activeWorkspaceNotes\}/);
  assert.match(adapter, /function hydrateAuxiliaryPages/);
  assert.match(adapter, /setAuxiliaryPage\('tocpage', 'tocbody', doc\.tocHTML\)/);
  assert.match(adapter, /setAuxiliaryPage\('appendixpage', 'appendixbody', doc\.appendicesHTML\)/);
});

test('React shell deletes workspace PDF folders when a workspace is removed', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'App.tsx'), 'utf8');
  assert.match(app, /const workspacePdfContext = \{/);
  assert.match(app, /id: current\.id/);
  assert.match(app, /name: current\.name/);
  assert.match(app, /referenceIds: current\.lib\.map/);
  assert.match(app, /electronAPI\.deleteWorkspacePdfFolder\(workspacePdfContext\)/);
});

test('Legacy Word import persists imported document through saveData', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy-runtime.js'), 'utf8');
  assert.match(source, /function importWordFile\(e\)/);
  assert.match(source, /function persistImportedWord\(\)/);
  assert.match(source, /flushCurrentDocFromEditor\(\)/);
  assert.match(source, /saveEditorDraftNow\(\)/);
  assert.match(source, /syncSave\(\)/);
  assert.match(source, /electronAPI\.saveData\(__aqBuildPersistedStateJSON\(\)\)/);
  assert.match(source, /scheduleImportedWordPersist\(\)/);
});

test('AQ Engine compat HTML import repairs joined Word prose before model insertion', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'experiments', 'aq-engine', 'compat-shim.js'), 'utf8');
  assert.match(source, /function repairJoinedWordImportText/);
  assert.match(source, /repairBlockRuns\(window\.AQEngineTipTapAdapter\.convertDoc\(tiptapDoc\)\)/);
  assert.match(source, /repairJoinedWordImportText\(node\.textContent\)/);
  assert.match(source, /repairJoinedWordImportText\(ch\.textContent\)/);
});
