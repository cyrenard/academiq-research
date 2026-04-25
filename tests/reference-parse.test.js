const test = require('node:test');
const assert = require('node:assert/strict');

const parser = require('../src/reference-parse.js');

test('normalizeDoi canonicalizes DOI variants', () => {
  assert.equal(parser.normalizeDoi('https://doi.org/10.3389/FPSYG.2019.01267/BIBTEX'), '10.3389/fpsyg.2019.01267');
  assert.equal(parser.normalizeDoi('doi:10.1501/sporm_0000000377'), '10.1501/sporm_0000000377');
  assert.equal(parser.normalizeDoi('not-a-doi'), '');
});

test('parseBibTeX parses core fields and normalizes doi/year', () => {
  const text = [
    '@article{sample,',
    '  title={A Study on Testing},',
    '  author={Doe, Jane and Smith, John},',
    '  year={2019/03/10},',
    '  journal={Test Journal},',
    '  volume={12},',
    '  number={2},',
    '  pages={10--19},',
    '  doi={https://doi.org/10.3389/FPSYG.2019.01267/BIBTEX},',
    '  url={https://example.org/paper}',
    '}'
  ].join('\n');
  const list = parser.parseBibTeX(text, { createId: () => 'ref1', workspaceId: 'ws1' });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'ref1');
  assert.equal(list[0].wsId, 'ws1');
  assert.deepEqual(list[0].authors, ['Doe, Jane', 'Smith, John']);
  assert.equal(list[0].year, '2019');
  assert.equal(list[0].fp, '10');
  assert.equal(list[0].lp, '19');
  assert.equal(list[0].doi, '10.3389/fpsyg.2019.01267');
});

test('parseRIS parses core fields and normalizes doi/year', () => {
  const text = [
    'TY  - JOUR',
    'TI  - RIS Entry',
    'AU  - Doe, Jane',
    'AU  - Smith, John',
    'PY  - 2020/05/11',
    'JO  - Journal Name',
    'VL  - 4',
    'IS  - 1',
    'SP  - 1',
    'EP  - 12',
    'DO  - doi:10.1234/ABC.2020.001',
    'UR  - https://example.org/ris',
    'ER  -'
  ].join('\n');
  const list = parser.parseRIS(text, { createId: () => 'ref2', workspaceId: 'ws2' });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'ref2');
  assert.equal(list[0].wsId, 'ws2');
  assert.deepEqual(list[0].authors, ['Doe, Jane', 'Smith, John']);
  assert.equal(list[0].year, '2020');
  assert.equal(list[0].doi, '10.1234/abc.2020.001');
});

test('parseCSLJSON parses zotero-like csl json and preserves metadata', () => {
  const text = JSON.stringify([
    {
      id: 'item-1',
      type: 'article-journal',
      title: 'CSL Paper',
      author: [
        { family: 'Doe', given: 'Jane' },
        { family: 'Smith', given: 'John' }
      ],
      issued: { 'date-parts': [[2024, 5, 12]] },
      'container-title': 'Journal of CSL',
      volume: '10',
      issue: '2',
      page: '20-29',
      DOI: 'https://doi.org/10.5000/CSL.1',
      URL: 'https://example.org/csl',
      abstract: 'Abstract text',
      note: 'Note text',
      tags: [{ tag: 'method' }, { tag: 'review' }],
      attachments: [{ title: 'PDF', path: '/tmp/paper.pdf' }]
    }
  ]);
  const list = parser.parseCSLJSON(text, { createId: () => 'ref3', workspaceId: 'ws3' });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'ref3');
  assert.equal(list[0].wsId, 'ws3');
  assert.deepEqual(list[0].authors, ['Doe, Jane', 'Smith, John']);
  assert.equal(list[0].year, '2024');
  assert.equal(list[0].journal, 'Journal of CSL');
  assert.equal(list[0].doi, '10.5000/csl.1');
  assert.deepEqual(list[0].labels, ['method', 'review']);
  assert.equal(list[0].abstract, 'Abstract text');
  assert.equal(list[0].pdfPath, '/tmp/paper.pdf');
});

test('parseApaReferenceText parses journal article with DOI url', () => {
  const text = 'Ciudad-Fernández, V., von Hammerstein, C., & Billieux, J. (2025). People are not becoming "AIholic": Questioning the "ChatGPT addiction" construct. Addictive Behaviors, 166, 108325. https://doi.org/10.1016/J.ADDBEH.2025.108325';
  const list = parser.parseApaReferenceText(text, { createId: () => 'r1', workspaceId: 'ws' });
  assert.equal(list.length, 1);
  const r = list[0];
  assert.deepEqual(r.authors, ['Ciudad-Fernández, V.', 'von Hammerstein, C.', 'Billieux, J.']);
  assert.equal(r.year, '2025');
  assert.match(r.title, /People are not becoming "AIholic"/);
  assert.match(r.title, /"ChatGPT addiction" construct/);
  assert.equal(r.journal, 'Addictive Behaviors');
  assert.equal(r.volume, '166');
  assert.equal(r.fp, '108325');
  assert.equal(r.doi, '10.1016/j.addbeh.2025.108325');
  assert.equal(r.wsId, 'ws');
  assert.equal(r.id, 'r1');
});

test('parseApaReferenceText handles single author with volume(issue), pages', () => {
  const text = 'Smith, J. A. (2020). A study of things. Journal of Things, 12(3), 45-67. https://doi.org/10.1234/jot.2020.003';
  const list = parser.parseApaReferenceText(text);
  assert.equal(list.length, 1);
  const r = list[0];
  assert.deepEqual(r.authors, ['Smith, J. A.']);
  assert.equal(r.year, '2020');
  assert.equal(r.title, 'A study of things');
  assert.equal(r.journal, 'Journal of Things');
  assert.equal(r.volume, '12');
  assert.equal(r.issue, '3');
  assert.equal(r.fp, '45');
  assert.equal(r.lp, '67');
  assert.equal(r.doi, '10.1234/jot.2020.003');
});

test('parseApaReferenceText splits multiple entries across blank lines and line wraps', () => {
  const text = [
    'Chong, L. (2021). Something interesting. Journal A, 5(1), 1-10.',
    '',
    'Ciudad-Fernández, V., von Hammerstein, C., & Billieux, J. (2025).',
    '  People are not becoming "AIholic". Addictive Behaviors, 166, 108325.',
    '',
    'Fernandes, D. (2019). Another study. Journal B, 2, 100-110.'
  ].join('\n');
  const list = parser.parseApaReferenceText(text);
  assert.equal(list.length, 3);
  assert.deepEqual(list.map(r => r.authors[0]), ['Chong, L.', 'Ciudad-Fernández, V.', 'Fernandes, D.']);
  assert.equal(list[1].journal, 'Addictive Behaviors');
  assert.equal(list[1].volume, '166');
});

test('parseApaReferenceText splits entries without blank line when author-start follows year', () => {
  const text = 'Chong, L. (2021). Something. Journal A, 5(1), 1-10. Fernandes, D. (2019). Another. Journal B, 2, 100-110.';
  const list = parser.parseApaReferenceText(text);
  assert.equal(list.length, 2);
  assert.equal(list[0].authors[0], 'Chong, L.');
  assert.equal(list[1].authors[0], 'Fernandes, D.');
});

test('parseApaReferenceText handles year variants (2020a), (n.d.)', () => {
  const text = [
    'Doe, J. (2020a). First work. Journal X, 1, 1-5.',
    'Doe, J. (n.d.). Undated work. Journal Y, 2, 10-15.'
  ].join('\n\n');
  const list = parser.parseApaReferenceText(text);
  assert.equal(list.length, 2);
  assert.equal(list[0].year, '2020');
  assert.equal(list[1].year, '');
});

test('parseApaReferenceText handles book chapter with pp. pages', () => {
  const text = 'Roe, B. (2018). Chapter title. In A. Editor (Ed.), Book title (pp. 10-25). Publisher.';
  const list = parser.parseApaReferenceText(text);
  assert.equal(list.length, 1);
  assert.equal(list[0].fp, '10');
  assert.equal(list[0].lp, '25');
  assert.equal(list[0].year, '2018');
});

test('parseApaReferenceText maps APA books to book metadata fields', () => {
  const text = 'Russell, S., & Norvig, P. (2021). Artificial intelligence: A modern approach (4th ed.). Pearson.';
  const list = parser.parseApaReferenceText(text);

  assert.equal(list.length, 1);
  assert.equal(list[0].referenceType, 'book');
  assert.equal(list[0].title, 'Artificial intelligence: A modern approach');
  assert.equal(list[0].edition, '4th ed');
  assert.equal(list[0].publisher, 'Pearson');
});

test('parseApaReferenceText maps APA web pages to website metadata fields', () => {
  const text = 'American Psychological Association. (2024, October 5). Guidelines for student papers. APA Style. https://apastyle.apa.org/style-grammar-guidelines/paper-format/student-annotated.pdf';
  const list = parser.parseApaReferenceText(text);

  assert.equal(list.length, 1);
  assert.equal(list[0].referenceType, 'website');
  assert.equal(list[0].title, 'Guidelines for student papers');
  assert.equal(list[0].websiteName, 'APA Style');
  assert.equal(list[0].journal, '');
  assert.equal(list[0].url, 'https://apastyle.apa.org/style-grammar-guidelines/paper-format/student-annotated.pdf');
});

test('parseApaReferenceText extracts bare DOI and strips Retrieved from URL', () => {
  const text = 'Doe, J. (2022). Title here. Journal Z, 3, 1-8. Retrieved from https://example.org/paper';
  const list = parser.parseApaReferenceText(text);
  assert.equal(list.length, 1);
  assert.equal(list[0].url, 'https://example.org/paper');
  assert.equal(list[0].journal, 'Journal Z');
});

test('parseApaReferenceText handles mixed APA bibliography pasted line-by-line', () => {
  const text = [
    'Barros, E. C. D. (2024). Understanding the influence of digital technology on human cognitive functions: A narrative review. IBRO Neuroscience Reports. https://doi.org/10.1016/j.ibneur.2024.11.006',
    'Brown, A. L. (1987). Metacognition, executive control, self-regulation, and other more mysterious mechanisms. In F. E. Weinert & R. H. Kluwe (Eds.), Metacognition, motivation, and understanding (pp. 65–116). Lawrence Erlbaum Associates.',
    'Castañeda, L., & Selwyn, N. (2018). More than tools? Making sense of the ongoing digitizations of higher education. International Journal of Educational Technology in Higher Education, 15(22). https://doi.org/10.1186/s41239-018-0109-y',
    'Chong, L., et al. (2022). Human confidence in artificial intelligence and in themselves: The evolution and impact of confidence on adoption of AI advice. Computers in Human Behavior, 127, 107018.',
    'Fernandes, D., et al. (2025). AI makes you smarter but none the wiser: The disconnect between perceived and actual cognitive performance in human–AI interaction. Computers in Human Behavior. Advance online publication.',
    'Flavell, J. H. (1979). Metacognition and cognitive monitoring: A new area of cognitive–developmental inquiry. American Psychologist, 34(10), 906–911.',
    'Hertzog, C., & Dunlosky, J. (2011). Metacognition in later adulthood: Spared monitoring can benefit older adults\' self-regulation. Current Directions in Psychological Science, 20(3), 167–173. https://doi.org/10.1177/0963721411409026',
    'Li, J., et al. (2025). Understanding the effect of AI confidence on human self-confidence. In Proceedings of the CHI Conference on Human Factors in Computing Systems.',
    'Lițan, D. (2025). Psychological “effects” of digital technology: A meta-analysis. Frontiers in Psychology. https://doi.org/10.3389/fpsyg.2025.1560516',
    'Menon, D., & Shilpa, K. (2023). “Chatting with ChatGPT”: Analyzing the factors influencing users\' intention to use OpenAI\'s ChatGPT using the UTAUT model. Heliyon, 9(e20962). https://doi.org/10.1016/j.heliyon.2023.e20962',
    'Nelson, T. O., & Narens, L. (1990). Metamemory: A theoretical framework and new findings. In G. H. Bower (Ed.), The psychology of learning and motivation: Advances in research and theory (Vol. 26, pp. 125–173). Academic Press. https://doi.org/10.1016/S0079-7421(08)60053-5',
    'Ostermann, T., Röer, J. P., & Tomasik, M. J. (2021). Digitalization in psychology: A bit of challenge and a byte of success. Patterns, 2(10), 100334. https://doi.org/10.1016/j.patter.2021.100334',
    'Qin, F., Li, K., & Yan, J. (2020). Understanding user trust in artificial intelligence-based educational systems: Evidence from China. British Journal of Educational Technology, 51(5), 1693–1710. https://doi.org/10.1111/bjet.12994',
    'Raman, R., Mandal, S., Das, P., Kaur, T., Sanjanasri, J. P., & Nedungadi, P. (2024). Exploring university students’ adoption of ChatGPT using the diffusion of innovation theory and sentiment analysis with gender dimension. Human Behavior and Emerging Technologies, 2024, 3085910. https://doi.org/10.1155/2024/3085910',
    'Russell, S., & Norvig, P. (2021). Artificial intelligence: A modern approach (4th ed.). Pearson.',
    'Sage, K., Sherrie-Anne, K., & Oscar, O. (2023). What factors contribute to the acceptance of artificial intelligence? A systematic review. Telematics and Informatics. https://doi.org/10.1016/j.tele.2022.101925',
    'Schraw, G., & Dennison, R. S. (1994). Assessing metacognitive awareness. Contemporary Educational Psychology, 19(4), 460–475. https://doi.org/10.1006/ceps.1994.1033',
    'Selwyn, N. (2016). Is technology good for education? Polity Press.',
    'Song, Y., Qiu, X., & Liu, J. (2025). The impact of artificial intelligence adoption on organizational decision-making: An empirical study based on the technology acceptance model in business management. Systems, 13(8), 683. https://doi.org/10.3390/systems13080683',
    'Wells, A. (2000). Emotional disorders and metacognition: Innovative cognitive therapy. John Wiley & Sons.',
    'Xiao, Y., Liu, X., & Yao, Y. (2025). Students’ development of AI metacognitive awareness: A qualitative study. System, 133, 103790. https://doi.org/10.1016/j.system.2025.103790',
    'Zhou, T., & Zhang, C. (2024). Examining generative AI user addiction from a C-A-C perspective. Technology in Society.'
  ].join('\n');
  const list = parser.parseApaReferenceText(text);
  assert.equal(list.length, 22);
  assert.equal(list[0].title, 'Understanding the influence of digital technology on human cognitive functions: A narrative review');
  assert.equal(list[0].journal, 'IBRO Neuroscience Reports');
  assert.equal(list[1].title, 'Metacognition, executive control, self-regulation, and other more mysterious mechanisms');
  assert.equal(list[1].fp, '65');
  assert.equal(list[1].lp, '116');
  assert.equal(list[4].journal, 'Computers in Human Behavior');
  assert.equal(list[8].authors[0], 'Lițan, D.');
  assert.equal(list[16].fp, '460');
  assert.equal(list[16].lp, '475');
  assert.equal(list[21].title, 'Examining generative AI user addiction from a C-A-C perspective');
  assert.equal(list[21].journal, 'Technology in Society');
  assert.equal(list[21].referenceType, 'article');
});
