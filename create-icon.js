// Generate AcademiQ icon as PNG (256x256) — pure Node.js, no dependencies
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const W = 256, H = 256;
const pixels = Buffer.alloc(W * H * 4); // RGBA

function setPixel(x, y, r, g, b, a) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = a;
}

function blendPixel(x, y, r, g, b, a) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  const alpha = a / 255;
  const invA = 1 - alpha;
  pixels[i]   = Math.round(r * alpha + pixels[i]   * invA);
  pixels[i+1] = Math.round(g * alpha + pixels[i+1] * invA);
  pixels[i+2] = Math.round(b * alpha + pixels[i+2] * invA);
  pixels[i+3] = Math.min(255, pixels[i+3] + a);
}

function fillCircle(cx, cy, radius, r, g, b, a) {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx*dx + dy*dy <= r2) {
        setPixel(cx+dx, cy+dy, r, g, b, a);
      }
    }
  }
}

function fillRoundedRect(x1, y1, x2, y2, radius, r, g, b, a) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      let inside = false;
      // Check corners
      if (x < x1 + radius && y < y1 + radius) {
        inside = (x - x1 - radius) * (x - x1 - radius) + (y - y1 - radius) * (y - y1 - radius) <= radius * radius;
      } else if (x > x2 - radius && y < y1 + radius) {
        inside = (x - x2 + radius) * (x - x2 + radius) + (y - y1 - radius) * (y - y1 - radius) <= radius * radius;
      } else if (x < x1 + radius && y > y2 - radius) {
        inside = (x - x1 - radius) * (x - x1 - radius) + (y - y2 + radius) * (y - y2 + radius) <= radius * radius;
      } else if (x > x2 - radius && y > y2 - radius) {
        inside = (x - x2 + radius) * (x - x2 + radius) + (y - y2 + radius) * (y - y2 + radius) <= radius * radius;
      } else {
        inside = true;
      }
      if (inside) setPixel(x, y, r, g, b, a);
    }
  }
}

function fillTriangle(x1,y1, x2,y2, x3,y3, r,g,b,a) {
  const minX = Math.max(0, Math.min(x1,x2,x3));
  const maxX = Math.min(W-1, Math.max(x1,x2,x3));
  const minY = Math.max(0, Math.min(y1,y2,y3));
  const maxY = Math.min(H-1, Math.max(y1,y2,y3));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d1 = (x-x2)*(y1-y2)-(x1-x2)*(y-y2);
      const d2 = (x-x3)*(y2-y3)-(x2-x3)*(y-y3);
      const d3 = (x-x1)*(y3-y1)-(x3-x1)*(y-y1);
      const neg = (d1<0)||(d2<0)||(d3<0);
      const pos = (d1>0)||(d2>0)||(d3>0);
      if (!(neg && pos)) setPixel(x, y, r, g, b, a);
    }
  }
}

function fillRect(x1, y1, x2, y2, r, g, b, a) {
  for (let y = Math.max(0,y1); y <= Math.min(H-1,y2); y++) {
    for (let x = Math.max(0,x1); x <= Math.min(W-1,x2); x++) {
      setPixel(x, y, r, g, b, a);
    }
  }
}

function drawAACircleOutline(cx, cy, radius, thickness, r, g, b) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dist = Math.sqrt((x-cx)*(x-cx) + (y-cy)*(y-cy));
      const d = Math.abs(dist - radius);
      if (d < thickness/2 + 1) {
        const alpha = Math.max(0, Math.min(255, Math.round(255 * (1 - Math.max(0, d - thickness/2)))));
        if (alpha > 0) blendPixel(x, y, r, g, b, alpha);
      }
    }
  }
}

// === DRAW THE ICON ===

// Background: rounded rectangle with gradient-like effect (deep blue to teal)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = y / H;
    const t2 = x / W;
    // Gradient: top-left deep blue to bottom-right teal
    const rr = Math.round(13 + t * 10 + t2 * 5);   // 13-28
    const gg = Math.round(71 + t * 50 + t2 * 20);   // 71-141
    const bb = Math.round(161 + t * 30 - t2 * 20);  // 161-171
    setPixel(x, y, rr, gg, bb, 255);
  }
}

// Round the corners
const cornerR = 40;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let outside = false;
    if (x < cornerR && y < cornerR) {
      outside = (x-cornerR)*(x-cornerR) + (y-cornerR)*(y-cornerR) > cornerR*cornerR;
    } else if (x > W-1-cornerR && y < cornerR) {
      outside = (x-(W-1-cornerR))*(x-(W-1-cornerR)) + (y-cornerR)*(y-cornerR) > cornerR*cornerR;
    } else if (x < cornerR && y > H-1-cornerR) {
      outside = (x-cornerR)*(x-cornerR) + (y-(H-1-cornerR))*(y-(H-1-cornerR)) > cornerR*cornerR;
    } else if (x > W-1-cornerR && y > H-1-cornerR) {
      outside = (x-(W-1-cornerR))*(x-(W-1-cornerR)) + (y-(H-1-cornerR))*(y-(H-1-cornerR)) > cornerR*cornerR;
    }
    if (outside) setPixel(x, y, 0, 0, 0, 0);
  }
}

// Draw a stylized "A" letter — white, thick, centered
// The "A" consists of two diagonal legs and a crossbar
const cx = 118, topY = 42, botY = 214;
const legW = 22; // half-width of each leg
const spread = 62; // how far apart the legs are at the bottom

// Left leg of A
fillTriangle(
  cx, topY,
  cx - spread - legW, botY,
  cx - spread + legW, botY,
  255, 255, 255, 255
);

// Right leg of A
fillTriangle(
  cx, topY,
  cx + spread - legW, botY,
  cx + spread + legW, botY,
  255, 255, 255, 255
);

// Fill the area between legs (the inner part of the A above the crossbar)
fillTriangle(
  cx, topY + 8,
  cx - spread + legW + 6, botY,
  cx + spread - legW - 6, botY,
  255, 255, 255, 255
);

// Cut out the inner triangle (the hole in the A) — use background color
const holeTop = 110;
const holeSpread = 28;
for (let y = holeTop; y <= botY; y++) {
  const t = (y - holeTop) / (botY - holeTop);
  const halfW = t * holeSpread;
  for (let x = Math.round(cx - halfW); x <= Math.round(cx + halfW); x++) {
    // Restore gradient background
    const tt = y / H;
    const t2 = x / W;
    const rr = Math.round(13 + tt * 10 + t2 * 5);
    const gg = Math.round(71 + tt * 50 + t2 * 20);
    const bb = Math.round(161 + tt * 30 - t2 * 20);
    setPixel(x, y, rr, gg, bb, 255);
  }
}

// Crossbar of A
fillRect(cx - spread + 8, 148, cx + spread - 8, 166, 255, 255, 255, 255);
// Re-cut the hole below crossbar
for (let y = 167; y <= botY; y++) {
  const t = (y - holeTop) / (botY - holeTop);
  const halfW = t * holeSpread;
  for (let x = Math.round(cx - halfW); x <= Math.round(cx + halfW); x++) {
    const tt = y / H;
    const t2 = x / W;
    const rr = Math.round(13 + tt * 10 + t2 * 5);
    const gg = Math.round(71 + tt * 50 + t2 * 20);
    const bb = Math.round(161 + tt * 30 - t2 * 20);
    setPixel(x, y, rr, gg, bb, 255);
  }
}

// Draw "Q" subscript — small circle with tail, positioned at bottom-right
const qCx = 192, qCy = 178, qR = 30;

// Q circle (white outline, thick)
drawAACircleOutline(qCx, qCy, qR, 10, 255, 255, 255);

// Q inner (cut out — restore background)
for (let y = qCy - qR + 6; y <= qCy + qR - 6; y++) {
  for (let x = qCx - qR + 6; x <= qCx + qR - 6; x++) {
    const dist = Math.sqrt((x-qCx)*(x-qCx) + (y-qCy)*(y-qCy));
    if (dist < qR - 4) {
      const tt = y / H;
      const t2 = x / W;
      const rr = Math.round(13 + tt * 10 + t2 * 5);
      const gg = Math.round(71 + tt * 50 + t2 * 20);
      const bb = Math.round(161 + tt * 30 - t2 * 20);
      setPixel(x, y, rr, gg, bb, 255);
    }
  }
}

// Q tail — diagonal line from lower-right of circle
fillTriangle(
  qCx + 12, qCy + 14,
  qCx + 38, qCy + 40,
  qCx + 28, qCy + 44,
  255, 255, 255, 255
);
fillTriangle(
  qCx + 12, qCy + 14,
  qCx + 18, qCy + 10,
  qCx + 38, qCy + 40,
  255, 255, 255, 255
);

// === ENCODE AS PNG ===
// Build raw image data with filter bytes
const rawData = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  rawData[y * (1 + W * 4)] = 0; // filter: None
  for (let x = 0; x < W; x++) {
    const si = (y * W + x) * 4;
    const di = y * (1 + W * 4) + 1 + x * 4;
    rawData[di]   = pixels[si];
    rawData[di+1] = pixels[si+1];
    rawData[di+2] = pixels[si+2];
    rawData[di+3] = pixels[si+3];
  }
}

const compressed = zlib.deflateSync(rawData, { level: 9 });

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = c ^ buf[i];
    for (let j = 0; j < 8; j++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeData = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData));
  return Buffer.concat([len, typeData, crc]);
}

// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const png = Buffer.concat([
  signature,
  makeChunk('IHDR', ihdr),
  makeChunk('IDAT', compressed),
  makeChunk('IEND', Buffer.alloc(0))
]);

const outPath = path.join(__dirname, 'icon.png');
fs.writeFileSync(outPath, png);
console.log('Icon created:', outPath, '(' + png.length + ' bytes)');

// Also create ICO file (simple ICO with embedded PNG)
function createICO(pngBuf) {
  // ICO header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count: 1 image

  // Directory entry: 16 bytes
  const entry = Buffer.alloc(16);
  entry[0] = 0;   // width (0 = 256)
  entry[1] = 0;   // height (0 = 256)
  entry[2] = 0;   // color palette
  entry[3] = 0;   // reserved
  entry.writeUInt16LE(1, 4);  // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuf.length, 8); // size of image data
  entry.writeUInt32LE(22, 12); // offset to image data (6 + 16 = 22)

  return Buffer.concat([header, entry, pngBuf]);
}

const ico = createICO(png);
const icoPath = path.join(__dirname, 'icon.ico');
fs.writeFileSync(icoPath, ico);
console.log('ICO created:', icoPath, '(' + ico.length + ' bytes)');
