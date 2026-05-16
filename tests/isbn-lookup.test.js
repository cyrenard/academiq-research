const test = require('node:test');
const assert = require('node:assert/strict');

const parse = require('../src/reference-parse.js');
const styles = require('../src/citation-styles.js');

test('normalizeIsbn accepts ISBN-10 and ISBN-13 variants', () => {
  assert.equal(parse.normalizeIsbn('ISBN 0-306-40615-2'), '0306406152');
  assert.equal(parse.normalizeIsbn('978-0-13-461099-3'), '9780134610993');
  assert.equal(parse.normalizeIsbn('https://openlibrary.org/isbn/9780134610993'), '9780134610993');
});

test('normalizeIsbn rejects invalid checksums', () => {
  assert.equal(parse.normalizeIsbn('978-0-13-461099-0'), '');
  assert.equal(parse.normalizeIsbn('12345'), '');
});

test('mapOpenLibraryBookToReference builds APA 7 book-compatible records', () => {
  const ref = parse.mapOpenLibraryBookToReference({
    'ISBN:9780134610993': {
      title: 'Artificial Intelligence',
      subtitle: 'A Modern Approach',
      authors: [{ name: 'Stuart Russell' }, { name: 'Peter Norvig' }],
      publish_date: '2021',
      publishers: [{ name: 'Pearson' }],
      url: 'https://openlibrary.org/isbn/9780134610993',
      identifiers: { isbn_13: ['9780134610993'] }
    }
  }, {
    isbn: '978-0-13-461099-3',
    createId: () => 'book_1',
    workspaceId: 'ws_1'
  });

  assert.equal(ref.id, 'book_1');
  assert.equal(ref.referenceType, 'book');
  assert.equal(ref.isbn, '9780134610993');
  assert.equal(ref.wsId, 'ws_1');
  assert.deepEqual(ref.authors, ['Russell, Stuart', 'Norvig, Peter']);
  assert.equal(ref.title, 'Artificial Intelligence: A Modern Approach');
  assert.equal(ref.year, '2021');
  assert.equal(ref.publisher, 'Pearson');

  const apa = styles.formatReference(ref, { style: 'apa7' });
  assert.match(apa, /Russell, S\., & Norvig, P\./);
  assert.match(apa, /<i>Artificial intelligence: A modern approach<\/i>\./);
  assert.match(apa, /Pearson\./);
});

test('mapOpenLibraryEditionToReference builds records from direct ISBN endpoint', () => {
  const ref = parse.mapOpenLibraryEditionToReference({
    key: '/books/OL34068492M',
    title: 'Artificial Intelligence',
    subtitle: 'A Modern Approach',
    publish_date: '2021',
    publishers: ['Pearson'],
    isbn_13: ['9780134610993'],
    authors: [{ key: '/authors/OL440500A' }, { key: '/authors/OL772166A' }]
  }, {
    isbn: '978-0-13-461099-3',
    authorNames: ['Stuart Russell', 'Peter Norvig'],
    createId: () => 'book_direct',
    workspaceId: 'ws_direct'
  });

  assert.equal(ref.id, 'book_direct');
  assert.equal(ref.referenceType, 'book');
  assert.equal(ref.isbn, '9780134610993');
  assert.equal(ref.url, 'https://openlibrary.org/books/OL34068492M');
  assert.deepEqual(ref.authors, ['Russell, Stuart', 'Norvig, Peter']);
  assert.equal(ref.title, 'Artificial Intelligence: A Modern Approach');
  assert.equal(ref.year, '2021');
  assert.equal(ref.publisher, 'Pearson');
});

test('mapGoogleBooksVolumeToReference builds fallback book records', () => {
  const ref = parse.mapGoogleBooksVolumeToReference({
    items: [{
      volumeInfo: {
        title: 'Is Technology Good for Education?',
        authors: ['Neil Selwyn'],
        publisher: 'Polity Press',
        publishedDate: '2016',
        industryIdentifiers: [
          { type: 'ISBN_13', identifier: '9780745696478' }
        ],
        canonicalVolumeLink: 'https://books.google.com/books?id=sample'
      }
    }]
  }, {
    isbn: '978-0-7456-9647-8',
    createId: () => 'book_2',
    workspaceId: 'ws_2'
  });

  assert.equal(ref.referenceType, 'book');
  assert.equal(ref.isbn, '9780745696478');
  assert.equal(ref.year, '2016');
  assert.deepEqual(ref.authors, ['Selwyn, Neil']);
  assert.equal(ref.publisher, 'Polity Press');

  const apa = styles.formatReference(ref, { style: 'apa7' });
  assert.match(apa, /Selwyn, N\./);
  assert.match(apa, /<i>Is technology good for education\?<\/i>\./);
});

test('mapCrossrefIsbnWorkToReference builds fallback book records', () => {
  const ref = parse.mapCrossrefIsbnWorkToReference({
    message: {
      items: [{
        title: ['Emotional disorders and metacognition'],
        author: [{ family: 'Wells', given: 'Adrian' }],
        publisher: 'John Wiley & Sons',
        ISBN: ['9780471964766'],
        issued: { 'date-parts': [[2000]] },
        DOI: '10.1000/book'
      }]
    }
  }, {
    isbn: '978-0-471-96476-6',
    createId: () => 'book_3',
    workspaceId: 'ws_3'
  });

  assert.equal(ref.referenceType, 'book');
  assert.equal(ref.isbn, '9780471964766');
  assert.equal(ref.doi, '10.1000/book');
  assert.deepEqual(ref.authors, ['Wells, Adrian']);
  assert.equal(ref.year, '2000');
  assert.equal(ref.publisher, 'John Wiley & Sons');
});
