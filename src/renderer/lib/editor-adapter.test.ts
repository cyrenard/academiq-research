import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    delete win.save;
    delete win.AQTipTapWordInit;
    delete win.__aqReactShellActive;
    vi.useRealTimers();
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
    expect(manager.getWorkspaceId()).toBe('ws-1');
    expect(manager.getLibrary()).toEqual([
      { id: 'ref-1', title: 'Test Reference', doi: '10.1000/xyz' }
    ]);
    expect(manager.findReference('ref-1')).toEqual({ id: 'ref-1', title: 'Test Reference', doi: '10.1000/xyz' });

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

  it('suppresses startup save events until persisted content is hydrated', () => {
    vi.useFakeTimers();
    const listeners = new Map<string, () => void>();
    let html = '<p></p>';
    const fakeEditor = {
      _aqEngine: true,
      commands: {
        setContent(next: string) { html = next; },
        focus() {}
      },
      getHTML() { return html; },
      on(name: string, listener: () => void) { listeners.set(name, listener); },
      off(name: string) { listeners.delete(name); },
      destroy() {}
    };
    const legacySave = vi.fn();
    const onChange = vi.fn();
    const win = window as any;
    win.__aqReactShellActive = true;
    win.save = legacySave;
    win.AQTipTapWordInit = {
      init() {
        // AQ Engine initialization can emit an eager legacy save before the
        // persisted document has been installed.
        win.save();
        return fakeEditor;
      }
    };

    const editor = createAcademiqEditor({
      mount,
      docId: 'doc-1',
      initialState: {
        cur: 'ws-1',
        curDoc: 'doc-1',
        doc: '<p>persisted body</p>',
        docs: [{ id: 'doc-1', content: '<p>persisted body</p>' }],
        wss: [{ id: 'ws-1', docId: 'doc-1', lib: [{ id: 'ref-1' }] }],
        notes: []
      },
      onChange
    });

    vi.advanceTimersByTime(2200);
    expect(html).toBe('<p>persisted body</p>');
    expect(legacySave).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();

    html = '<p>persisted body changed</p>';
    listeners.get('update')?.();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]?.html).toBe('<p>persisted body changed</p>');
    expect(legacySave).not.toHaveBeenCalled();

    editor.destroy();
  });
});
