const test = require('node:test');
const assert = require('node:assert/strict');
const textRepair = require('../src/text-repair.js');

test('repairText fixes common Turkish mojibake', () => {
  assert.equal(textRepair.repairText('BaÅŸlÄ±k'), 'Başlık');
  assert.equal(textRepair.repairText('KÃ¼tÃ¼phane'), 'Kütüphane');
  assert.equal(textRepair.repairText('KaynakÃ§a BÃ¶lÃ¼mÃ¼'), 'Kaynakça Bölümü');
});

test('repairText fixes common symbol mojibake', () => {
  assert.equal(textRepair.repairText('â†“ TÃ¼m OA PDF\'leri Ä°ndir'), '↓ Tüm OA PDF\'leri İndir');
  assert.equal(textRepair.repairText('âœ• Ã‡Ä±k'), '✕ Çık');
  assert.equal(textRepair.repairText('Ã—'), '×');
});

test('repairText preserves already-correct strings', () => {
  assert.equal(textRepair.repairText('Not yazın...'), 'Not yazın...');
  assert.equal(textRepair.repairText('Başlık'), 'Başlık');
});
