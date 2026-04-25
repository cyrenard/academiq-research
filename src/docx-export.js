// Minimal DOCX (OOXML) export baseline. Converts a flat list of block
// descriptors into a valid `word/document.xml` payload. Packaging into a
// .docx zip is deliberately out of scope here — the main process pairs this
// with either Word COM (preferred on Windows) or a zip library.
//
// Block descriptor shape:
//   { type: 'paragraph'|'heading', level?: 1..5, style?: string,
//     text: string, align?: 'left'|'center'|'right'|'justify',
//     runs?: [ { text, bold?, italic?, underline?, super?, sub? } ] }
(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQDocxExport = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  var DOCUMENT_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

  function escapeXml(text){
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function buildRunProps(run){
    var parts = [];
    if(run.font) parts.push('<w:rFonts w:ascii="' + escapeXml(run.font) + '" w:hAnsi="' + escapeXml(run.font) + '"/>');
    if(run.size) {
      var halfPoints = Math.max(1, Math.round(Number(run.size) * 2));
      parts.push('<w:sz w:val="' + halfPoints + '"/>');
      parts.push('<w:szCs w:val="' + halfPoints + '"/>');
    }
    if(run.bold) parts.push('<w:b/>');
    if(run.italic) parts.push('<w:i/>');
    if(run.underline) parts.push('<w:u w:val="single"/>');
    if(run['super']) parts.push('<w:vertAlign w:val="superscript"/>');
    if(run.sub) parts.push('<w:vertAlign w:val="subscript"/>');
    if(!parts.length) return '';
    return '<w:rPr>' + parts.join('') + '</w:rPr>';
  }

  function buildRun(run){
    if(!run || !run.text) return '';
    var rPr = buildRunProps(run);
    var text = '<w:t xml:space="preserve">' + escapeXml(run.text) + '</w:t>';
    return '<w:r>' + rPr + text + '</w:r>';
  }

  function normalizeRuns(block){
    if(Array.isArray(block.runs) && block.runs.length){
      return block.runs.filter(function(r){ return r && r.text != null; });
    }
    if(block.text == null) return [];
    return [{ text: String(block.text) }];
  }

  function buildParagraphProps(block){
    var parts = [];
    if(block.type === 'heading'){
      var level = Number(block.level) || 1;
      if(level < 1) level = 1;
      if(level > 5) level = 5;
      parts.push('<w:pStyle w:val="Heading' + level + '"/>');
    } else if(block.style){
      parts.push('<w:pStyle w:val="' + escapeXml(block.style) + '"/>');
    }
    if(block.align){
      var a = String(block.align).toLowerCase();
      if(['left','center','right','both','justify'].indexOf(a) >= 0){
        var mapped = a === 'justify' ? 'both' : a;
        parts.push('<w:jc w:val="' + mapped + '"/>');
      }
    }
    if(block.spacing || block.lineSpacing || block.beforeSpacing || block.afterSpacing){
      var before = Math.max(0, Math.round(Number(block.beforeSpacing != null ? block.beforeSpacing : 0) || 0));
      var after = Math.max(0, Math.round(Number(block.afterSpacing != null ? block.afterSpacing : 0) || 0));
      var line = String(block.lineSpacing || (block.spacing && block.spacing.line) || 'double').toLowerCase();
      var lineValue = line === 'single' ? 240 : line === 'onehalf' || line === '1.5' ? 360 : 480;
      parts.push('<w:spacing w:before="' + before + '" w:after="' + after + '" w:line="' + lineValue + '" w:lineRule="auto"/>');
    }
    if(block.indent || block.firstLine || block.hanging){
      var indent = block.indent || {};
      var firstLine = block.firstLine != null ? block.firstLine : indent.firstLine;
      var hanging = block.hanging != null ? block.hanging : indent.hanging;
      var left = block.leftIndent != null ? block.leftIndent : indent.left;
      var attrs = [];
      if(left != null) attrs.push('w:left="' + Math.max(0, Math.round(Number(left) || 0)) + '"');
      if(firstLine != null) attrs.push('w:firstLine="' + Math.max(0, Math.round(Number(firstLine) || 0)) + '"');
      if(hanging != null) attrs.push('w:hanging="' + Math.max(0, Math.round(Number(hanging) || 0)) + '"');
      if(attrs.length) parts.push('<w:ind ' + attrs.join(' ') + '/>');
    }
    if(!parts.length) return '';
    return '<w:pPr>' + parts.join('') + '</w:pPr>';
  }

  function buildParagraph(block){
    var pPr = buildParagraphProps(block);
    var runs = normalizeRuns(block).map(buildRun).join('');
    return '<w:p>' + pPr + runs + '</w:p>';
  }

  function buildDocumentXml(blocks){
    var body = (blocks || []).map(function(b){
      if(!b || typeof b !== 'object') return '';
      return buildParagraph(b);
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:document ' + DOCUMENT_NS + '>'
      + '<w:body>' + body + '<w:sectPr/></w:body>'
      + '</w:document>';
  }

  return {
    escapeXml: escapeXml,
    buildRun: buildRun,
    buildParagraph: buildParagraph,
    buildDocumentXml: buildDocumentXml
  };
});
