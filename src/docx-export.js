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
      if(!text || !String(text).trim()) return null;
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
      if(tag === 'br') {
        out.push({ text: '\n' });
        return;
      }
      Array.prototype.forEach.call(el.childNodes || [], function(child){ collectRuns(child, next, out); });
    }

    function addBlock(el){
      var tag = String(el.tagName || '').toLowerCase();
      var runs = [];
      collectRuns(el, {}, runs);
      if(!runs.length) return;
      var text = runs.map(function(r){ return r.text || ''; }).join('').trim();
      if(!text) return;
      var heading = /^h([1-5])$/.exec(tag);
      blocks.push({
        type: heading ? 'heading' : 'paragraph',
        level: heading ? Number(heading[1]) : undefined,
        align: (el.style && el.style.textAlign) || undefined,
        runs: runs
      });
    }

    var selectors = 'h1,h2,h3,h4,h5,p,li,blockquote,td,th';
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
      + '</Relationships>';
  }

  function stylesXml(){
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:style>'
      + [1,2,3,4,5].map(function(level){
        return '<w:style w:type="paragraph" w:styleId="Heading' + level + '"><w:name w:val="heading ' + level + '"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>';
      }).join('')
      + '</w:styles>';
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
    buildDocumentXml: buildDocumentXml,
    htmlToBlocks: htmlToBlocks,
    buildDocxBytesFromBlocks: buildDocxBytesFromBlocks,
    buildDocxBytesFromHTML: buildDocxBytesFromHTML,
    exportHTMLToDocx: exportHTMLToDocx
  };
});
