const test = require('node:test');
const assert = require('node:assert/strict');

const discovery = require('../src/web-related-discovery.js');

test('mapOpenAlexWork maps OpenAlex work payload into internal shape', () => {
  const mapped = discovery.mapOpenAlexWork({
    id: 'https://openalex.org/W123',
    display_name: 'A Related Study',
    publication_year: 2024,
    doi: 'https://doi.org/10.2000/related.1',
    authorships: [
      { author: { display_name: 'Jane Doe' } },
      { author: { display_name: 'John Smith' } }
    ],
    primary_location: {
      landing_page_url: 'https://example.org/landing',
      source: { display_name: 'Test Journal' }
    }
  }, {
    title: 'Related',
    authors: ['Doe, Jane']
  });

  assert.equal(mapped.provider, 'openalex');
  assert.equal(mapped.title, 'A Related Study');
  assert.equal(mapped.year, '2024');
  assert.equal(mapped.doi, '10.2000/related.1');
  assert.ok(Array.isArray(mapped.reasons));
  assert.ok(mapped.reasons.length >= 1);
});

test('discoverWebRelated returns OpenAlex-first results and dedupes', async () => {
  const calls = [];
  const fetchJSON = async (url) => {
    calls.push(url);
    if(url.includes('/works/doi:')){
      return { related_works: ['https://openalex.org/W1'] };
    }
    if(url.includes('/works/W1')){
      return {
        id: 'https://openalex.org/W1',
        display_name: 'Overlap Paper',
        publication_year: 2023,
        doi: 'https://doi.org/10.3000/w1',
        authorships: [{ author: { display_name: 'Jane Doe' } }],
        primary_location: { landing_page_url: 'https://example.org/w1', source: { display_name: 'Journal A' } }
      };
    }
    if(url.includes('api.openalex.org/works?search=')){
      return {
        results: [{
          id: 'https://openalex.org/W1',
          display_name: 'Overlap Paper',
          publication_year: 2023,
          doi: 'https://doi.org/10.3000/w1',
          authorships: [{ author: { display_name: 'Jane Doe' } }],
          primary_location: { landing_page_url: 'https://example.org/w1', source: { display_name: 'Journal A' } }
        }]
      };
    }
    if(url.includes('api.crossref.org/works?')){
      return { message: { items: [] } };
    }
    return {};
  };

  const out = await discovery.discoverWebRelated({
    title: 'Seed Paper',
    doi: '10.1111/seed',
    authors: ['Doe, Jane']
  }, { fetchJSON, limit: 6 });

  assert.ok(Array.isArray(out.items));
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].doi, '10.3000/w1');
  assert.ok(calls.some((url) => url.includes('api.openalex.org')));
});
