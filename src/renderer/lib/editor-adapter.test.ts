import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createAcademiqEditor } from './editor-adapter';

describe('editor-adapter reference delegation', () => {
  let mount: HTMLDivElement;

  beforeEach(() => {
    mount = document.createElement('div');
    document.body.appendChild(mount);
  });

  afterEach(() => {
    mount.remove();
    // Clean up window properties
    const win = window as any;
    delete win.AQReferenceManager;
    delete win.S;
    delete win.cLib;
    delete win.findRef;
  });

  it('sets up AQReferenceManager with working delegated functions', () => {
    const editor = createAcademiqEditor({
      mount,
      docId: 'doc-1',
      initialState: {
        cur: 'ws-1',
        wss: [
          {
            id: 'ws-1',
            lib: [
              { id: 'ref-1', title: 'Test Reference', doi: '10.1000/xyz' }
            ]
          }
        ]
      }
    });

    const manager = (window as any).AQReferenceManager;
    expect(manager).toBeDefined();

    // Test referenceKey delegation (normalizing DOI prefix/casing via reference-format)
    expect(manager.referenceKey({ doi: 'https://doi.org/10.1000/XYZ' })).toBe('doi:10.1000/xyz');

    // Test dedupeReferences delegation (deduplicating by DOI)
    const dups = [
      { id: '1', doi: '10.1000/xyz' },
      { id: '2', doi: 'https://doi.org/10.1000/XYZ' }
    ];
    const deduped = manager.dedupeReferences(dups);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe('1');

    // Test filterReferences delegation
    const searchResults = manager.filterReferences('test');
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0].id).toBe('ref-1');

    editor.destroy();
  });
});
