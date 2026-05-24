import { describe, expect, it } from 'vitest';
import { checkLanguageRules } from './language-rules';

const tr = (value: string) => value.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));

describe('checkLanguageRules', () => {
  it('suggests safe Turkish common replacements', () => {
    const matches = checkLanguageRules(tr('Her\\u015fey yada bir\\u015fey de\\u011fildir.'));
    expect(matches.map((m) => [m.text, m.replacements[0]?.value, m.ruleId])).toEqual([
      [tr('Her\\u015fey'), tr('Her \\u015fey'), 'AQ_TR_HER_SEY'],
      ['yada', 'ya da', 'AQ_TR_YA_DA'],
      [tr('bir\\u015fey'), tr('bir \\u015fey'), 'AQ_TR_BIR_SEY']
    ]);
  });

  it('suggests common adverbial expression fixes', () => {
    const matches = checkLanguageRules(tr('\\u015euan yan\\u0131s\\u0131ra aras\\u0131ra yanyana tabiki kullan\\u0131l\\u0131r.'));
    expect(matches.map((m) => [m.text, m.replacements[0]?.value])).toEqual([
      [tr('\\u015euan'), tr('\\u015eu an')],
      [tr('yan\\u0131s\\u0131ra'), tr('yan\\u0131 s\\u0131ra')],
      [tr('aras\\u0131ra'), tr('ara s\\u0131ra')],
      ['yanyana', 'yan yana'],
      ['tabiki', 'tabii ki']
    ]);
  });

  it('suggests safe academic wording fixes', () => {
    const matches = checkLanguageRules(tr('\\u00d6n g\\u00f6r\\u00fclen var say\\u0131m git gide farketti.'));
    expect(matches.map((m) => [m.text, m.replacements[0]?.value, m.ruleId])).toEqual([
      [tr('\\u00d6n g\\u00f6r\\u00fclen'), tr('\\u00d6ng\\u00f6r\\u00fclen'), 'AQ_TR_ONGORULEN'],
      [tr('var say\\u0131m'), tr('varsay\\u0131m'), 'AQ_TR_VARSAYIM'],
      ['git gide', 'gitgide', 'AQ_TR_GITGIDE'],
      ['farketti', 'fark etti', 'AQ_TR_FARK_ETTI']
    ]);
  });

  it('flags repeated words and punctuation spacing', () => {
    const matches = checkLanguageRules(tr('Bu b\\u00f6l\\u00fcm b\\u00f6l\\u00fcm tekrar , ediyor.  Test'));
    expect(matches.map((m) => [m.ruleId, m.text, m.replacements[0]?.value])).toEqual([
      ['AQ_TR_REPEATED_WORD', tr('b\\u00f6l\\u00fcm b\\u00f6l\\u00fcm'), tr('b\\u00f6l\\u00fcm')],
      ['AQ_TR_SPACE_BEFORE_PUNCTUATION', ' ,', ','],
      ['AQ_TR_MULTIPLE_SPACES', '  ', ' ']
    ]);
  });

  it('adds periods to common academic abbreviations', () => {
    const matches = checkLanguageRules(tr('Bandura vd taraf\\u0131ndan a\\u00e7\\u0131klanm\\u0131\\u015ft\\u0131r; bkz Ek A ve \\u00f6rn notlar.'));
    expect(matches.map((m) => [m.text, m.replacements[0]?.value, m.ruleId])).toEqual([
      ['vd', 'vd.', 'AQ_TR_ABBR_VD_DOT'],
      ['bkz', 'bkz.', 'AQ_TR_ABBR_BKZ_DOT'],
      [tr('\\u00f6rn'), tr('\\u00f6rn.'), 'AQ_TR_ABBR_ORN_DOT']
    ]);
  });

  it('suggests conservative academic style replacements', () => {
    const matches = checkLanguageRules(tr('Mesela bu y\\u00fczden bence vs kullan\\u0131lmamal\\u0131d\\u0131r.'));
    expect(matches.map((m) => [m.text, m.replacements[0]?.value, m.ruleId])).toEqual([
      ['Mesela', tr('\\u00d6rne\\u011fin'), 'AQ_TR_STYLE_MESELA'],
      [tr('bu y\\u00fczden'), 'bu nedenle', 'AQ_TR_STYLE_BU_YUZDEN'],
      ['bence', tr('bu \\u00e7al\\u0131\\u015fmada'), 'AQ_TR_STYLE_BENCE'],
      ['vs', 'vb.', 'AQ_TR_STYLE_VS']
    ]);
  });

  it('formats academic objects, statistics and citations', () => {
    const matches = checkLanguageRules(tr('Tablo1 i\\u00e7inde n=30 ve p<0.05 verilmi\\u015ftir (Y\\u0131lmaz,2020).'));
    expect(matches.map((m) => [m.text, m.replacements[0]?.value, m.ruleId])).toEqual([
      ['Tablo1', 'Tablo 1', 'AQ_TR_ACADEMIC_OBJECT_SPACE'],
      ['n=30', 'n = 30', 'AQ_TR_STATISTIC_SPACING'],
      ['p<0.05', 'p < 0.05', 'AQ_TR_STATISTIC_SPACING'],
      [tr('(Y\\u0131lmaz,2020)'), tr('(Y\\u0131lmaz, 2020)'), 'AQ_TR_CITATION_COMMA_SPACE']
    ]);
  });

  it('does not guess difficult de-da cases', () => {
    const matches = checkLanguageRules(tr('Bu konuda da farkl\\u0131 sonu\\u00e7lar vard\\u0131r.'));
    expect(matches.map((m) => m.ruleId).filter((id) => /_DA|_DE/.test(id))).toEqual([]);
  });
});
