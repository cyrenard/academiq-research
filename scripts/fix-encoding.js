/**
 * Fix double-encoded UTF-8 (mojibake) in HTML and JS source files.
 * Chars were originally UTF-8, misread as CP1252, then saved as UTF-8 again.
 *
 * Pass 1: greedily fix sequences where continuation bytes fall in U+0080-U+00BF
 *         (standard ISO-8859-1 range — handled by charCode directly).
 * Pass 2: targeted replacements for CP1252 special continuation bytes
 *         (0x80-0x9F map to Unicode codepoints > U+00FF, so Pass 1 misses them).
 *
 * NOTE: Do NOT apply to text-repair.js — it intentionally contains garbled patterns.
 */
const fs = require('fs');
const path = require('path');

/* CP1252 byte → Unicode codepoint (only for the 0x80-0x9F range) */
const cp1252 = {
  0x80:0x20AC, 0x82:0x201A, 0x83:0x0192, 0x84:0x201E,
  0x85:0x2026, 0x86:0x2020, 0x87:0x2021, 0x88:0x02C6,
  0x89:0x2030, 0x8A:0x0160, 0x8B:0x2039, 0x8C:0x0152,
  0x8E:0x017D, 0x91:0x2018, 0x92:0x2019, 0x93:0x201C,
  0x94:0x201D, 0x95:0x2022, 0x96:0x2013, 0x97:0x2014,
  0x98:0x02DC, 0x99:0x2122, 0x9A:0x0161, 0x9B:0x203A,
  0x9C:0x0153, 0x9E:0x017E, 0x9F:0x0178
};

/* Reverse: Unicode codepoint → CP1252 byte */
const unicodeToCP1252 = {};
Object.entries(cp1252).forEach(function(kv) { unicodeToCP1252[kv[1]] = parseInt(kv[0]); });

function charToCP1252Byte(c) {
  var code = c.charCodeAt(0);
  if (code <= 0xFF) return code; // ISO-8859-1: byte == codepoint
  var b = unicodeToCP1252[code];
  return b !== undefined ? b : -1;
}

/* Pass 1: fix sequences where every char maps to a Latin-1 byte (0x00-0xFF) */
function fixPass1(str) {
  var result = '';
  var i = 0;
  while (i < str.length) {
    var code = str.charCodeAt(i);
    if (code >= 0xC0 && code <= 0xFF) {
      var n = code >= 0xF0 ? 4 : code >= 0xE0 ? 3 : 2;
      var valid = (i + n <= str.length);
      if (valid) {
        for (var j = 1; j < n; j++) {
          var c = str.charCodeAt(i + j);
          if (c < 0x80 || c > 0xBF) { valid = false; break; }
        }
      }
      if (valid) {
        try {
          var seq = str.slice(i, i + n);
          var decoded = Buffer.from(seq, 'latin1').toString('utf8');
          result += decoded;
          i += n;
          continue;
        } catch (e) {}
      }
    }
    result += str[i];
    i++;
  }
  return result;
}

/* Pass 2: fix sequences where continuation bytes are CP1252 special chars */
function fixPass2(str) {
  var result = '';
  var i = 0;
  while (i < str.length) {
    var byte0 = charToCP1252Byte(str[i]);
    if (byte0 >= 0xC0 && byte0 <= 0xFF) {
      var n = byte0 >= 0xF0 ? 4 : byte0 >= 0xE0 ? 3 : 2;
      var valid = (i + n <= str.length);
      if (valid) {
        var bytes = [byte0];
        for (var j = 1; j < n; j++) {
          var b = charToCP1252Byte(str[i + j]);
          if (b < 0x80 || b > 0xBF) { valid = false; break; }
          bytes.push(b);
        }
        if (valid) {
          try {
            var decoded = Buffer.from(bytes).toString('utf8');
            /* Only accept if result is a single char (exactly 1 Unicode codepoint) */
            if ([...decoded].length === 1) {
              result += decoded;
              i += n;
              continue;
            }
          } catch (e) {}
        }
      }
    }
    result += str[i];
    i++;
  }
  return result;
}

function fixMojibake(str) {
  /* Pass 1 fixes chars whose bytes are all in ISO-8859-1 range.
     Pass 2 then fixes chars whose continuation bytes are CP1252 specials. */
  return fixPass2(fixPass1(str));
}

var root = path.join(__dirname, '..');

var filesToFix = [
  path.join(root, 'academiq-research.html'),
  path.join(root, 'src', 'tiptap-word-content.js'),
  path.join(root, 'src', 'bibliography-state.js'),
];

filesToFix.forEach(function(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log('[fix-encoding] Not found:', filePath);
    return;
  }
  var original = fs.readFileSync(filePath, 'utf8');
  var fixed = fixMojibake(original);
  if (fixed === original) {
    console.log('[fix-encoding] No changes:', path.basename(filePath));
    return;
  }
  var diff = 0;
  for (var i = 0; i < Math.max(original.length, fixed.length); i++) {
    if (original[i] !== fixed[i]) diff++;
  }
  fs.writeFileSync(filePath, fixed, 'utf8');
  console.log('[fix-encoding] Fixed ' + diff + ' chars in:', path.basename(filePath));
});
