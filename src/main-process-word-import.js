function decodeWithEncoding(rawBuffer, encoding) {
  const buf = Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer || '');
  const enc = String(encoding || '').toLowerCase();
  if (!enc) return '';
  try {
    if (enc === 'utf8' || enc === 'utf-8') return buf.toString('utf8');
    if (enc === 'utf16le' || enc === 'utf-16le') return buf.toString('utf16le');
    if (enc === 'latin1' || enc === 'iso-8859-1' || enc === 'binary') return buf.toString('latin1');
    if (typeof TextDecoder === 'function') return new TextDecoder(enc).decode(buf);
  } catch (_error) {}
  return '';
}

function detectMetaCharset(rawBuffer) {
  const buf = Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer || '');
  const head = buf.slice(0, Math.min(buf.length, 8192)).toString('latin1');
  const match = head.match(/charset\s*=\s*["']?\s*([a-z0-9._-]+)/i);
  if (!match || !match[1]) return '';
  const value = String(match[1]).trim().toLowerCase();
  if (!value) return '';
  if (value === 'unicode') return 'utf-16le';
  if (value === 'utf8') return 'utf-8';
  return value;
}

function detectLikelyUtf16LEWithoutBom(rawBuffer) {
  const buf = Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer || '');
  const sample = Math.min(buf.length, 4096);
  if (sample < 8) return false;
  let oddZeroCount = 0;
  let oddSlots = 0;
  for (let i = 1; i < sample; i += 2) {
    oddSlots += 1;
    if (buf[i] === 0x00) oddZeroCount += 1;
  }
  return oddSlots > 0 && (oddZeroCount / oddSlots) >= 0.55;
}

function scoreDecodedWordHtml(text) {
  const value = String(text || '');
  if (!value) return -1000;
  const lower = value.toLowerCase();
  let score = 0;

  if (/<html\b|<body\b|<head\b/.test(lower)) score += 28;
  if (/<meta\b[^>]*charset/.test(lower)) score += 10;
  if (/<style\b|<\/style>/.test(lower)) score += 8;
  if (/<p\b|<div\b|<span\b|<table\b|<tr\b|<td\b|<h[1-6]\b/.test(lower)) score += 14;
  if (/\bmso-|\bmso[a-z0-9_-]+\b|\bclass\s*=\s*["'][^"']*mso/i.test(value)) score += 8;

  const tagCount = (value.match(/<\/?[a-z][^>]{0,120}>/gi) || []).length;
  score += Math.min(18, tagCount / 8);

  const replacementCount = (value.match(/\uFFFD/g) || []).length;
  score -= Math.min(30, replacementCount * 0.8);

  const nulCount = (value.match(/\u0000/g) || []).length;
  score -= Math.min(22, nulCount * 0.5);

  // If decoded text looks like actual prose+markup, reward printable density.
  const sample = value.slice(0, 4096);
  const printable = (sample.match(/[\t\n\r -~\u00A0-\u024F]/g) || []).length;
  if (sample.length) score += (printable / sample.length) * 6;

  return score;
}

function hasHtmlLikeSignals(text) {
  const value = String(text || '');
  if (!value) return false;
  return /<\/?[a-z][^>]{0,120}>/i.test(value)
    && /<(html|head|body|p|div|span|table|h[1-6])\b/i.test(value);
}

function decodeWordImportBuffer(rawBuffer) {
  const buf = Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer || '');
  if (!buf.length) return { html: '', encoding: 'utf-8', score: -1000 };

  const attempts = [];
  const seen = {};
  function pushAttempt(encoding) {
    const enc = String(encoding || '').trim().toLowerCase();
    if (!enc || seen[enc]) return;
    seen[enc] = true;
    const decoded = decodeWithEncoding(buf, enc);
    if (!decoded) return;
    attempts.push({
      encoding: enc,
      html: decoded,
      score: scoreDecodedWordHtml(decoded)
    });
  }

  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) pushAttempt('utf-16le');
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) pushAttempt('utf-16be');

  const metaCharset = detectMetaCharset(buf);
  if (metaCharset) pushAttempt(metaCharset);

  pushAttempt('utf-8');
  if (detectLikelyUtf16LEWithoutBom(buf)) pushAttempt('utf-16le');
  pushAttempt('windows-1254');
  pushAttempt('windows-1252');
  pushAttempt('iso-8859-9');
  pushAttempt('latin1');

  if (!attempts.length) {
    return {
      html: buf.toString('utf8'),
      encoding: 'utf-8',
      score: scoreDecodedWordHtml(buf.toString('utf8'))
    };
  }
  attempts.sort((a, b) => b.score - a.score);
  const best = attempts[0];
  if (hasHtmlLikeSignals(best.html)) return best;
  const bestHtml = attempts.find((entry) => hasHtmlLikeSignals(entry.html));
  return bestHtml || best;
}

module.exports = {
  decodeWordImportBuffer,
  scoreDecodedWordHtml,
  detectMetaCharset,
  detectLikelyUtf16LEWithoutBom,
  hasHtmlLikeSignals
};
