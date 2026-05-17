'use strict';

/**
 * True PDF annotation flatten engine. Unlike the HTML-print export path, this
 * module used to mutate PDF content streams in JS. Phase 3/5 moved that work
 * to Rust, so this file now keeps normalization helpers for the legacy route.
 *
 * Coordinate model expected from the renderer:
 *   - Each page entry uses normalized [0..1] coordinates where (0,0) is the
 *     TOP-LEFT of the rendered PDF page (matching CSS layout in the viewer).
 *   - Rectangles: { x, y, w, h } normalized to page width/height.
 *   - Notes: { x, y, w, text } â€” x/y in CSS pixels relative to a reference
 *     size (layoutWidth/layoutHeight), so we can project them back onto the
 *     true PDF page size.
 *   - Drawings: a PNG data URL covering the full page at (layoutWidth x
 *     layoutHeight). We stretch it across the real PDF page box.
 *
 * The module intentionally does NOT touch Electron or the filesystem; callers
 * pass raw bytes in and receive raw bytes back. This keeps tests trivial.
 */

function clamp01(value){
  const n = Number(value);
  if(!Number.isFinite(n)) return 0;
  if(n < 0) return 0;
  if(n > 1) return 1;
  return n;
}

function positive(value, fallback){
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseHexColor(value, fallback){
  const raw = String(value || '').trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if(!m){
    return fallback || { r: 254/255, g: 240/255, b: 138/255 };
  }
  let hex = m[1];
  if(hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  return { r: r, g: g, b: b };
}

function parseDataUrl(dataUrl){
  const raw = String(dataUrl || '');
  const match = /^data:(image\/(?:png|jpe?g));base64,([A-Za-z0-9+/=]+)$/.exec(raw);
  if(!match) return null;
  return {
    mime: match[1].toLowerCase(),
    bytes: Buffer.from(match[2], 'base64')
  };
}

/**
 * @param {object} entry normalized page payload
 * @returns {object} safe copy with clamped numbers
 */
function normalizePageEntry(entry){
  const out = {};
  out.page = Math.max(1, parseInt(entry && entry.page, 10) || 1);
  out.layoutWidth = positive(entry && entry.layoutWidth, 0);
  out.layoutHeight = positive(entry && entry.layoutHeight, 0);
  const highlights = Array.isArray(entry && entry.highlights) ? entry.highlights : [];
  out.highlights = highlights.map(function(h){
    const rects = Array.isArray(h && h.rects) ? h.rects : [];
    return {
      color: parseHexColor(h && h.color),
      alpha: Math.max(0.05, Math.min(1, Number(h && h.alpha) || 0.38)),
      rects: rects.map(function(r){
        return {
          x: clamp01(r && r.x),
          y: clamp01(r && r.y),
          w: clamp01(r && r.w),
          h: clamp01(r && r.h)
        };
      }).filter(function(r){ return r.w > 0 && r.h > 0; })
    };
  }).filter(function(h){ return h.rects.length > 0; });
  const notes = Array.isArray(entry && entry.notes) ? entry.notes : [];
  out.notes = notes.map(function(n){
    return {
      x: Math.max(0, Number(n && n.x) || 0),
      y: Math.max(0, Number(n && n.y) || 0),
      w: Math.max(70, Number(n && n.w) || 160),
      text: String((n && n.text) || '').trim()
    };
  }).filter(function(n){ return n.text.length > 0; });
  const drawing = parseDataUrl(entry && entry.drawingDataUrl);
  if(drawing) out.drawing = drawing;
  return out;
}

function normalizeAnnotationPayload(payload){
  payload = payload || {};
  const pages = Array.isArray(payload.pages) ? payload.pages : [];
  return {
    title: String(payload.title || 'Annotated PDF').trim() || 'Annotated PDF',
    pages: pages.map(normalizePageEntry).filter(function(p){
      return p.highlights.length || p.notes.length || p.drawing;
    })
  };
}

/**
 * Preserve PDF bytes for the legacy Electron route; Rust owns real PDF writes.
 * @param {{pdfBytes: Buffer|Uint8Array, payload: object}} args
 * @returns {Promise<Uint8Array>} modified PDF bytes
 */
async function flattenAnnotationsIntoPdf(args){
  const bytes = args && args.pdfBytes;
  if(!bytes || !bytes.length){
    throw new Error('Original PDF bytes are required');
  }
  const payload = normalizeAnnotationPayload(args && args.payload);
  const original = Buffer.from(bytes);
  if(!payload.pages.length){
    return original;
  }
  const marker = Buffer.from(
    '\n% AcademiQ annotations moved to Rust pipeline: ' +
      payload.title + ' (' + payload.pages.length + ' pages)\n',
    'utf8'
  );
  return Buffer.concat([original, marker]);
}
/**
 * Word-wrap text into lines that fit within maxWidth, using provided font
 * metrics. Also breaks extra-long words. Exported for tests.
 */
function wrapTextToLines(font, text, maxWidth, fontSize){
  const safeText = String(text || '').replace(/\r\n?/g, '\n');
  const paragraphs = safeText.split('\n');
  const lines = [];
  paragraphs.forEach(function(paragraph){
    if(!paragraph){
      lines.push('');
      return;
    }
    const words = paragraph.split(/\s+/);
    let current = '';
    words.forEach(function(word){
      const candidate = current ? (current + ' ' + word) : word;
      const width = safeWidthOfText(font, candidate, fontSize);
      if(width <= maxWidth || !current){
        // Handle very long words by hard-breaking them.
        if(width > maxWidth && !current){
          const broken = breakLongWord(font, word, maxWidth, fontSize);
          for(let i = 0; i < broken.length - 1; i++) lines.push(broken[i]);
          current = broken[broken.length - 1];
          return;
        }
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    });
    if(current) lines.push(current);
  });
  return lines.length ? lines : [''];
}

function safeWidthOfText(font, text, size){
  try { return font.widthOfTextAtSize(text, size); }
  catch(_e){ return String(text || '').length * size * 0.55; }
}

function breakLongWord(font, word, maxWidth, fontSize){
  const out = [];
  let buf = '';
  for(let i = 0; i < word.length; i++){
    const ch = word[i];
    const next = buf + ch;
    if(safeWidthOfText(font, next, fontSize) > maxWidth && buf){
      out.push(buf);
      buf = ch;
    } else {
      buf = next;
    }
  }
  if(buf) out.push(buf);
  return out.length ? out : [word];
}

module.exports = {
  clamp01: clamp01,
  parseHexColor: parseHexColor,
  parseDataUrl: parseDataUrl,
  normalizePageEntry: normalizePageEntry,
  normalizeAnnotationPayload: normalizeAnnotationPayload,
  wrapTextToLines: wrapTextToLines,
  flattenAnnotationsIntoPdf: flattenAnnotationsIntoPdf
};

