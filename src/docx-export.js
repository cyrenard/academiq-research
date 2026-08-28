// Native DOCX (OOXML) export. Converts the shared editor HTML/block contract
// into a self-contained .docx package without requiring Word or platform-
// specific automation.
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
  var REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
  var OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

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
    var pieces = String(run.text).split(/\r?\n/);
    var body = pieces.map(function(piece, index){
      var text = piece ? '<w:t xml:space="preserve">' + escapeXml(piece) + '</w:t>' : '';
      var value = text ? '<w:r>' + rPr + text + '</w:r>' : '';
      if(index < pieces.length - 1) value += '<w:r><w:br/></w:r>';
      return value;
    }).join('');
    if(run.href && /^(https?:|mailto:)/i.test(String(run.href))){
      return '<w:fldSimple w:instr="' + escapeXml('HYPERLINK "' + String(run.href) + '"') + '">' + body + '</w:fldSimple>';
    }
    return body;
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
    if(block.pageBreakBefore) parts.push('<w:pageBreakBefore/>');
    if(block.keepNext) parts.push('<w:keepNext/>');
    if(block.numId){
      var level = Math.max(0, Math.min(8, Math.round(Number(block.listLevel) || 0)));
      parts.push('<w:numPr><w:ilvl w:val="' + level + '"/><w:numId w:val="' + Math.max(1, Math.round(Number(block.numId) || 1)) + '"/></w:numPr>');
    }
    if(block.spacing || block.lineSpacing || block.beforeSpacing || block.afterSpacing){
      var before = Math.max(0, Math.round(Number(block.beforeSpacing != null ? block.beforeSpacing : 0) || 0));
      var after = Math.max(0, Math.round(Number(block.afterSpacing != null ? block.afterSpacing : 0) || 0));
      var line = String(block.lineSpacing || (block.spacing && block.spacing.line) || 'double').toLowerCase();
      var lineValue = line === 'single' ? 240 : line === 'onehalf' || line === '1.5' ? 360 : 480;
      parts.push('<w:spacing w:before="' + before + '" w:after="' + after + '" w:line="' + lineValue + '" w:lineRule="auto"/>');
    }
    if(block.indent || block.firstLine != null || block.hanging != null || block.leftIndent != null){
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

  function normalizeCellParagraphs(cell){
    if(!cell) return [{ type: 'paragraph', text: '' }];
    if(Array.isArray(cell.blocks) && cell.blocks.length) return cell.blocks;
    if(Array.isArray(cell.runs) && cell.runs.length) return [{ type: 'paragraph', runs: cell.runs }];
    if(cell.text != null) return [{ type: 'paragraph', text: String(cell.text) }];
    return [{ type: 'paragraph', text: '' }];
  }

  function buildTableCell(cell){
    var body = normalizeCellParagraphs(cell).map(function(block){
      return buildParagraph(Object.assign({ style: 'TableText' }, block || { type: 'paragraph', text: '' }));
    }).join('');
    return '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>' + (body || buildParagraph({ type: 'paragraph', text: '' })) + '</w:tc>';
  }

  function buildTable(block){
    var rows = Array.isArray(block && block.rows) ? block.rows : [];
    var body = rows.map(function(row){
      var cells = Array.isArray(row && row.cells) ? row.cells : [];
      return '<w:tr>' + cells.map(buildTableCell).join('') + '</w:tr>';
    }).join('');
    if(!body) body = '<w:tr>' + buildTableCell({ text: '' }) + '</w:tr>';
    return '<w:tbl>'
      + '<w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>'
      + '<w:top w:val="single" w:sz="8" w:space="0" w:color="000000"/>'
      + '<w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/>'
      + '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
      + '</w:tblBorders></w:tblPr>'
      + body
      + '</w:tbl>';
  }

  function buildDocumentXml(blocks){
    var body = (blocks || []).map(function(b){
      if(!b || typeof b !== 'object') return '';
      if(b.type === 'table') return buildTable(b);
      if(b.type === 'pageBreak') return '<w:p><w:pPr><w:ind w:firstLine="0"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>';
      return buildParagraph(b);
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:document ' + DOCUMENT_NS + '>'
      + '<w:body>' + body + '<w:sectPr/></w:body>'
      + '</w:document>';
  }

  function textEncoder(){
    if(typeof TextEncoder !== 'undefined') return new TextEncoder();
    if(typeof Buffer !== 'undefined') {
      return { encode: function(value){ return new Uint8Array(Buffer.from(String(value), 'utf8')); } };
    }
    throw new Error('TextEncoder unavailable');
  }

  var CRC_TABLE = null;
  function crcTable(){
    if(CRC_TABLE) return CRC_TABLE;
    CRC_TABLE = new Uint32Array(256);
    for(var n = 0; n < 256; n++){
      var c = n;
      for(var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c >>> 0;
    }
    return CRC_TABLE;
  }

  function crc32(bytes){
    var table = crcTable();
    var crc = 0xffffffff;
    for(var i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function writeU16(out, value){
    out.push(value & 0xff, (value >>> 8) & 0xff);
  }

  function writeU32(out, value){
    out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
  }

  function dosTime(date){
    var d = date || new Date();
    var time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    var day = (d.getFullYear() - 1980) << 9 | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time: time, date: day };
  }

  function concatUint8(parts){
    var total = parts.reduce(function(sum, item){ return sum + item.length; }, 0);
    var out = new Uint8Array(total);
    var offset = 0;
    parts.forEach(function(item){ out.set(item, offset); offset += item.length; });
    return out;
  }

  function zipStore(files){
    var enc = textEncoder();
    var localParts = [];
    var central = [];
    var offset = 0;
    var stamp = dosTime(new Date());

    files.forEach(function(file){
      var nameBytes = enc.encode(file.name);
      var data = typeof file.data === 'string' ? enc.encode(file.data) : file.data;
      var crc = crc32(data);
      var local = [];
      writeU32(local, 0x04034b50);
      writeU16(local, 20);
      writeU16(local, 0x0800);
      writeU16(local, 0);
      writeU16(local, stamp.time);
      writeU16(local, stamp.date);
      writeU32(local, crc);
      writeU32(local, data.length);
      writeU32(local, data.length);
      writeU16(local, nameBytes.length);
      writeU16(local, 0);
      var localBytes = concatUint8([new Uint8Array(local), nameBytes, data]);
      localParts.push(localBytes);

      var c = [];
      writeU32(c, 0x02014b50);
      writeU16(c, 20);
      writeU16(c, 20);
      writeU16(c, 0x0800);
      writeU16(c, 0);
      writeU16(c, stamp.time);
      writeU16(c, stamp.date);
      writeU32(c, crc);
      writeU32(c, data.length);
      writeU32(c, data.length);
      writeU16(c, nameBytes.length);
      writeU16(c, 0);
      writeU16(c, 0);
      writeU16(c, 0);
      writeU16(c, 0);
      writeU32(c, 0);
      writeU32(c, offset);
      central.push(concatUint8([new Uint8Array(c), nameBytes]));
      offset += localBytes.length;
    });

    var centralBytes = concatUint8(central);
    var end = [];
    writeU32(end, 0x06054b50);
    writeU16(end, 0);
    writeU16(end, 0);
    writeU16(end, files.length);
    writeU16(end, files.length);
    writeU32(end, centralBytes.length);
    writeU32(end, offset);
    writeU16(end, 0);
    return concatUint8(localParts.concat([centralBytes, new Uint8Array(end)]));
  }

  function htmlToBlocks(html){
    var doc = document.implementation.createHTMLDocument('docx-export');
    doc.body.innerHTML = String(html || '<p></p>');
    var blocks = [];

    function runFromText(text, marks){
      if(text == null || String(text) === '') return null;
      return Object.assign({ text: String(text).replace(/\s+/g, ' ') }, marks || {});
    }

    function collectRuns(node, marks, out){
      if(!node) return;
      if(node.nodeType === 3){
        var run = runFromText(node.nodeValue || '', marks);
        if(run) out.push(run);
        return;
      }
      if(node.nodeType !== 1) return;
      var el = node;
      var tag = String(el.tagName || '').toLowerCase();
      var next = Object.assign({}, marks || {});
      if(tag === 'strong' || tag === 'b') next.bold = true;
      if(tag === 'em' || tag === 'i') next.italic = true;
      if(tag === 'u') next.underline = true;
      if(tag === 'sup') next.super = true;
      if(tag === 'sub') next.sub = true;
      if(tag === 'a'){
        var href = el.getAttribute('href') || '';
        if(/^(https?:|mailto:)/i.test(href)) next.href = href;
      }
      if(tag === 'br') {
        out.push({ text: '\n' });
        return;
      }
      Array.prototype.forEach.call(el.childNodes || [], function(child){ collectRuns(child, next, out); });
    }

    function cellToModel(cellEl){
      var runs = [];
      collectRuns(cellEl, {}, runs);
      return { runs: runs.length ? runs : [{ text: '' }] };
    }

    function tableToBlock(tableEl){
      var rows = [];
      Array.prototype.forEach.call(tableEl.querySelectorAll('tr'), function(rowEl){
        var cells = [];
        Array.prototype.forEach.call(rowEl.querySelectorAll('td,th'), function(cellEl){
          cells.push(cellToModel(cellEl));
        });
        if(cells.length) rows.push({ cells: cells });
      });
      return rows.length ? { type: 'table', rows: rows } : null;
    }

    function addBlock(el){
      var tag = String(el.tagName || '').toLowerCase();
      if(tag !== 'table' && el.closest && el.closest('table')) return;
      if(tag !== 'li' && el.closest && el.closest('li')) return;
      if(tag === 'table'){
        var table = tableToBlock(el);
        if(table) blocks.push(table);
        return;
      }
      var className = String(el.getAttribute && el.getAttribute('class') || '');
      if(/(?:^|\s)aq-page-break(?:\s|$)/.test(className)){
        blocks.push({ type: 'pageBreak' });
        return;
      }
      var runs = [];
      collectRuns(el, {}, runs);
      if(!runs.length) return;
      var text = runs.map(function(r){ return r.text || ''; }).join('').trim();
      if(!text) return;
      var heading = /^h([1-5])$/.exec(tag);
      var block = {
        type: heading ? 'heading' : 'paragraph',
        level: heading ? Number(heading[1]) : undefined,
        align: (el.style && el.style.textAlign) || undefined,
        runs: runs
      };
      if(/(?:^|\s)(?:refe|aq-ref-entry)(?:\s|$)/.test(className)){
        block.style = 'ReferenceEntry';
        block.lineSpacing = 'double';
        block.leftIndent = 720;
        block.hanging = 720;
      }
      if(/(?:^|\s)(?:aq-export-page-break-before|bib-title|appendix-title)(?:\s|$)/.test(className)){
        block.pageBreakBefore = true;
      }
      if(tag === 'blockquote'){
        block.style = 'BlockQuote';
        block.lineSpacing = 'double';
        block.leftIndent = 720;
        block.firstLine = 0;
      }
      if(tag === 'li'){
        var list = el.parentElement;
        var listTag = String(list && list.tagName || '').toLowerCase();
        block.numId = listTag === 'ol' ? 1 : 2;
        var listLevel = 0;
        var ancestor = list && list.parentElement;
        while(ancestor){
          if(/^(ol|ul)$/i.test(String(ancestor.tagName || ''))) listLevel++;
          ancestor = ancestor.parentElement;
        }
        block.listLevel = listLevel;
      }
      blocks.push(block);
    }

    var selectors = 'h1,h2,h3,h4,h5,p,li,blockquote,table';
    var nodes = doc.body.querySelectorAll(selectors);
    if(nodes.length) {
      Array.prototype.forEach.call(nodes, addBlock);
    } else {
      var text = doc.body.textContent || '';
      if(text.trim()) blocks.push({ type: 'paragraph', runs: [{ text: text.trim() }] });
    }
    return blocks.length ? blocks : [{ type: 'paragraph', text: '' }];
  }

  function contentTypesXml(){
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
      + '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
      + '</Types>';
  }

  function rootRelsXml(){
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="' + REL_NS + '">'
      + '<Relationship Id="rId1" Type="' + OFFICE_REL + '/officeDocument" Target="word/document.xml"/>'
      + '<Relationship Id="rId2" Type="' + REL_NS + '/metadata/core-properties" Target="docProps/core.xml"/>'
      + '<Relationship Id="rId3" Type="' + OFFICE_REL + '/extended-properties" Target="docProps/app.xml"/>'
      + '</Relationships>';
  }

  function docRelsXml(){
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="' + REL_NS + '">'
      + '<Relationship Id="rId1" Type="' + OFFICE_REL + '/styles" Target="styles.xml"/>'
      + '<Relationship Id="rId2" Type="' + OFFICE_REL + '/numbering" Target="numbering.xml"/>'
      + '</Relationships>';
  }

  function stylesXml(){
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="0" w:line="480" w:lineRule="auto"/><w:ind w:firstLine="720"/></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>'
      + [1,2,3,4,5].map(function(level){
        var centered = level === 1 ? '<w:jc w:val="center"/>' : '';
        var indented = level >= 4 ? '<w:ind w:left="720" w:firstLine="0"/>' : '<w:ind w:firstLine="0"/>';
        var italic = level === 3 || level === 5 ? '<w:i/>' : '';
        return '<w:style w:type="paragraph" w:styleId="Heading' + level + '"><w:name w:val="heading ' + level + '"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="0" w:line="480" w:lineRule="auto"/>' + centered + indented + '</w:pPr><w:rPr><w:b/>' + italic + '<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>';
      }).join('')
      + '<w:style w:type="paragraph" w:styleId="ReferenceEntry"><w:name w:val="Reference Entry"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="0" w:line="480" w:lineRule="auto"/><w:ind w:left="720" w:hanging="720" w:firstLine="0"/></w:pPr></w:style>'
      + '<w:style w:type="paragraph" w:styleId="BlockQuote"><w:name w:val="Block Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="0" w:line="480" w:lineRule="auto"/><w:ind w:left="720" w:firstLine="0"/></w:pPr></w:style>'
      + '<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:firstLine="0"/></w:pPr></w:style>'
      + '</w:styles>';
  }

  function numberingXml(){
    function levels(format, text){
      return Array.from({ length: 9 }, function(_, level){
        var levelText = format === 'decimal' ? '%' + (level + 1) + '.' : text;
        return '<w:lvl w:ilvl="' + level + '"><w:start w:val="1"/><w:numFmt w:val="' + format + '"/><w:lvlText w:val="' + levelText + '"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="' + (720 + level * 360) + '"/></w:tabs><w:ind w:left="' + (720 + level * 360) + '" w:hanging="360"/></w:pPr></w:lvl>';
      }).join('');
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="multilevel"/>' + levels('decimal', '') + '</w:abstractNum>'
      + '<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="multilevel"/>' + levels('bullet', '•') + '</w:abstractNum>'
      + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'
      + '<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>'
      + '</w:numbering>';
  }

  function coreXml(){
    var now = new Date().toISOString();
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + '<dc:title>AcademiQ Export</dc:title><dc:creator>AcademiQ Research</dc:creator>'
      + '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created>'
      + '<dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified>'
      + '</cp:coreProperties>';
  }

  function appXml(){
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
      + '<Application>AcademiQ Research</Application></Properties>';
  }

  function buildDocxBytesFromBlocks(blocks){
    return zipStore([
      { name: '[Content_Types].xml', data: contentTypesXml() },
      { name: '_rels/.rels', data: rootRelsXml() },
      { name: 'docProps/core.xml', data: coreXml() },
      { name: 'docProps/app.xml', data: appXml() },
      { name: 'word/_rels/document.xml.rels', data: docRelsXml() },
      { name: 'word/styles.xml', data: stylesXml() },
      { name: 'word/numbering.xml', data: numberingXml() },
      { name: 'word/document.xml', data: buildDocumentXml(blocks) }
    ]);
  }

  function buildDocxBytesFromHTML(html){
    return buildDocxBytesFromBlocks(htmlToBlocks(html));
  }

  function exportHTMLToDocx(html, filename){
    var bytes = buildDocxBytesFromHTML(html);
    var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    var name = filename || 'academiq-document.docx';
    if(typeof saveAs === 'function') {
      saveAs(blob, name);
      return Promise.resolve({ ok: true, size: bytes.length, fileName: name, method: 'browser-docx' });
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    return Promise.resolve({ ok: true, size: bytes.length, fileName: name, method: 'browser-docx' });
  }

  return {
    escapeXml: escapeXml,
    buildRun: buildRun,
    buildParagraph: buildParagraph,
    buildTable: buildTable,
    buildDocumentXml: buildDocumentXml,
    htmlToBlocks: htmlToBlocks,
    buildDocxBytesFromBlocks: buildDocxBytesFromBlocks,
    buildDocxBytesFromHTML: buildDocxBytesFromHTML,
    exportHTMLToDocx: exportHTMLToDocx
  };
});
