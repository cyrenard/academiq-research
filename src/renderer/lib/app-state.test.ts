/**
 * Smoke tests for the app-state module.
 *
 * `app-state.ts` is the single source of truth for the React renderer's
 * domain model — workspaces, documents, references, notes — so a
 * regression here corrupts every persisted user file. The functions are
 * pure and immutable (each returns a new state), which makes them
 * straightforward to test.
 *
 * Coverage focus: the contracts most likely to silently break.
 *   - shape stability of `createBlankState()` and `hydrateAppState()`
 *   - immutability (no input mutation; output identity changes)
 *   - active-workspace/document switching invariants
 *   - reference/note CRUD round-trips
 */
import { describe, it, expect } from 'vitest';
import {
  addDocument,
  addManualNote,
  addReferenceToActiveWorkspace,
  addWorkspace,
  createBlankState,
  deleteDocument,
  deleteNote,
  deleteWorkspace,
  getActiveDocument,
  getActiveWorkspace,
  hydrateAppState,
  removeReferenceFromActiveWorkspace,
  renameDocument,
  renameWorkspace,
  switchDocument,
  switchWorkspace,
  updateActiveDocumentHTML,
  updateReferenceInActiveWorkspace,
  type AcademiqAppState
} from './app-state';

describe('createBlankState', () => {
  it('returns a usable state with one workspace and one document', () => {
    const s = createBlankState();
    expect(Array.isArray(s.wss)).toBe(true);
    expect(s.wss.length).toBeGreaterThan(0);
    expect(s.cur).toBe(s.wss[0]!.id);
    expect(Array.isArray(s.docs)).toBe(true);
    expect(s.docs.length).toBeGreaterThan(0);
    expect(s.curDoc).toBe(s.docs[0]!.id);
  });

  it('two calls yield independent state objects', () => {
    const a = createBlankState();
    const b = createBlankState();
    expect(a).not.toBe(b);
    expect(a.wss).not.toBe(b.wss);
  });
});

describe('hydrateAppState', () => {
  it('falls back to blank state for nullish/garbage input', () => {
    const blank = hydrateAppState(null);
    expect(blank.wss.length).toBeGreaterThan(0);
    const blank2 = hydrateAppState({ junk: true });
    expect(blank2.wss.length).toBeGreaterThan(0);
    const blank3 = hydrateAppState('not an object' as any);
    expect(blank3.wss.length).toBeGreaterThan(0);
  });

  it('round-trips a state produced by createBlankState()', () => {
    const original = createBlankState();
    const hydrated = hydrateAppState(JSON.parse(JSON.stringify(original)));
    expect(hydrated.cur).toBe(original.cur);
    expect(hydrated.curDoc).toBe(original.curDoc);
    expect(hydrated.wss[0]!.id).toBe(original.wss[0]!.id);
  });
});

describe('workspace CRUD', () => {
  it('addWorkspace appends and switches active', () => {
    const s = createBlankState();
    const next = addWorkspace(s, 'İkinci');
    expect(next.wss.length).toBe(s.wss.length + 1);
    expect(next.cur).toBe(next.wss[next.wss.length - 1]!.id);
  });

  it('switchWorkspace moves cur to a known id, no-op for unknown', () => {
    const s1 = addWorkspace(createBlankState(), 'B');
    const ids = s1.wss.map((w) => w.id);
    const switched = switchWorkspace(s1, ids[0]!);
    expect(switched.cur).toBe(ids[0]!);
    const noop = switchWorkspace(s1, 'does-not-exist');
    expect(noop.cur).toBe(s1.cur);
  });

  it('renameWorkspace updates only the named workspace', () => {
    const s = addWorkspace(createBlankState(), 'B');
    const id = s.wss[1]!.id;
    const renamed = renameWorkspace(s, id, 'Yeni Ad');
    const target = renamed.wss.find((w) => w.id === id)!;
    expect(target.name).toBe('Yeni Ad');
    // other workspace untouched
    expect(renamed.wss[0]!.name).toBe(s.wss[0]!.name);
  });

  it('deleteWorkspace removes it and reassigns cur if needed', () => {
    const s = addWorkspace(createBlankState(), 'B');
    const idToDelete = s.cur; // cur === second workspace
    const after = deleteWorkspace(s, idToDelete);
    expect(after.wss.find((w) => w.id === idToDelete)).toBeUndefined();
    expect(after.wss.length).toBe(1);
    expect(after.cur).toBe(after.wss[0]!.id);
  });

  it('deleteWorkspace is a no-op when only one workspace remains', () => {
    const s = createBlankState();
    const after = deleteWorkspace(s, s.cur);
    expect(after.wss.length).toBe(1);
  });
});

describe('document CRUD', () => {
  it('addDocument appends and activates', () => {
    const s = createBlankState();
    const next = addDocument(s, 'Bölüm 2');
    expect(next.docs.length).toBe(s.docs.length + 1);
    expect(next.curDoc).toBe(next.docs[next.docs.length - 1]!.id);
  });

  it('switchDocument moves curDoc to a known id', () => {
    const s = addDocument(createBlankState());
    const target = s.docs[0]!.id;
    expect(switchDocument(s, target).curDoc).toBe(target);
  });

  it('renameDocument updates the target document only', () => {
    const s = addDocument(createBlankState(), 'A');
    const id = s.curDoc;
    const renamed = renameDocument(s, id, 'B');
    expect(renamed.docs.find((d) => d.id === id)!.name).toBe('B');
  });

  it('deleteDocument removes and re-activates remaining doc', () => {
    const s = addDocument(createBlankState());
    const removed = s.curDoc;
    const after = deleteDocument(s, removed);
    expect(after.docs.find((d) => d.id === removed)).toBeUndefined();
    expect(after.curDoc).not.toBe(removed);
  });

  it('updateActiveDocumentHTML mutates the active doc only', () => {
    const s = addDocument(createBlankState());
    const next = updateActiveDocumentHTML(s, '<p>hello</p>');
    const active = getActiveDocument(next);
    // app-state stores body in `content`, also mirrored to state.doc
    expect((active as any).content).toBe('<p>hello</p>');
    expect((next as any).doc).toBe('<p>hello</p>');
  });
});

describe('reference CRUD on active workspace', () => {
  const sampleRef = { id: 'r1', title: 'A test paper', authors: ['Doe, J.'], year: '2024' } as any;

  it('adds, updates, and removes a reference', () => {
    const s = createBlankState();
    const added = addReferenceToActiveWorkspace(s, sampleRef);
    expect(getActiveWorkspace(added).lib.find((r) => r.id === 'r1')?.title).toBe('A test paper');

    const updated = updateReferenceInActiveWorkspace(added, 'r1', { title: 'Updated title' });
    expect(getActiveWorkspace(updated).lib.find((r) => r.id === 'r1')?.title).toBe('Updated title');

    const removed = removeReferenceFromActiveWorkspace(updated, 'r1');
    expect(getActiveWorkspace(removed).lib.find((r) => r.id === 'r1')).toBeUndefined();
  });

  it('updateReferenceInActiveWorkspace is a no-op for unknown id', () => {
    const s = addReferenceToActiveWorkspace(createBlankState(), sampleRef);
    const before = JSON.stringify(getActiveWorkspace(s).lib);
    const after = updateReferenceInActiveWorkspace(s, 'does-not-exist', { title: 'X' });
    expect(JSON.stringify(getActiveWorkspace(after).lib)).toBe(before);
  });
});

describe('notes', () => {
  it('addManualNote appends a note with the provided text', () => {
    const s = createBlankState();
    const next = addManualNote(s, { text: 'A new manual note' });
    expect(next.notes.length).toBe(s.notes.length + 1);
    const note = next.notes[next.notes.length - 1]!;
    expect(String((note as any).txt || (note as any).comment || '')).toContain('A new manual note');
  });

  it('deleteNote removes by id', () => {
    const s1 = addManualNote(createBlankState(), { text: 'one' });
    const targetId = s1.notes[s1.notes.length - 1]!.id;
    const after = deleteNote(s1, targetId);
    expect(after.notes.find((n) => n.id === targetId)).toBeUndefined();
  });
});

describe('immutability', () => {
  it('addWorkspace does not mutate the input state', () => {
    const s = createBlankState();
    const snapshot = JSON.stringify(s);
    addWorkspace(s, 'B');
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('addReferenceToActiveWorkspace does not mutate the input', () => {
    const s = createBlankState();
    const snapshot = JSON.stringify(s);
    addReferenceToActiveWorkspace(s, { id: 'x', title: 'X' } as any);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('active selectors', () => {
  it('getActiveWorkspace returns the workspace whose id matches state.cur', () => {
    const s: AcademiqAppState = createBlankState();
    expect(getActiveWorkspace(s).id).toBe(s.cur);
  });
  it('getActiveDocument returns the document whose id matches state.curDoc', () => {
    const s: AcademiqAppState = createBlankState();
    expect(getActiveDocument(s).id).toBe(s.curDoc);
  });
});
