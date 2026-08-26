import { describe, expect, it } from 'vitest';
import type { AcademiqAppState } from './app-state';
import {
  addManagedReferenceLabel,
  countReferencesWithLabel,
  deleteManagedReferenceLabel,
  referenceHasManagedLabel,
  updateManagedReferenceLabel
} from './reference-label-state';

function state(): AcademiqAppState {
  return {
    wss: [
      { id: 'ws1', name: 'One', lib: [{ id: 'r1', labels: ['Important'] }] },
      { id: 'ws2', name: 'Two', lib: [{ id: 'r2', labels: [{ name: 'important', color: '#111111' }] }] }
    ],
    cur: 'ws1',
    docs: [{ id: 'd1', content: '<p></p>' }],
    curDoc: 'd1',
    doc: '<p></p>',
    notes: [],
    customLabels: [{ name: 'Important', color: '#111111' }]
  };
}

describe('reference label state', () => {
  it('adds unique managed labels case-insensitively', () => {
    const initial = state();
    expect(addManagedReferenceLabel(initial, { name: ' important ', color: '#ffffff' })).toBe(initial);
    const next = addManagedReferenceLabel(initial, { name: 'Method', color: '#123456' });
    expect(next.customLabels).toEqual([
      { name: 'Important', color: '#111111' },
      { name: 'Method', color: '#123456' }
    ]);
  });

  it('renames and recolors assignments across every workspace', () => {
    const next = updateManagedReferenceLabel(state(), 'Important', { name: 'Critical', color: '#abcdef' });
    expect(next.customLabels).toEqual([{ name: 'Critical', color: '#abcdef' }]);
    expect(next.wss[0]?.lib[0]?.labels).toEqual([{ name: 'Critical', color: '#abcdef' }]);
    expect(next.wss[1]?.lib[0]?.labels).toEqual([{ name: 'Critical', color: '#abcdef' }]);
    expect(countReferencesWithLabel(next.wss.flatMap((workspace) => workspace.lib), 'critical')).toBe(2);
  });

  it('rejects a rename collision without mutating state', () => {
    const initial = addManagedReferenceLabel(state(), { name: 'Method', color: '#123456' });
    expect(referenceHasManagedLabel(initial, 'METHOD')).toBe(true);
    expect(updateManagedReferenceLabel(initial, 'Important', { name: 'method', color: '#ffffff' })).toBe(initial);
  });

  it('deletes labels and assignments across every workspace', () => {
    const next = deleteManagedReferenceLabel(state(), 'IMPORTANT');
    expect(next.customLabels).toEqual([]);
    expect(next.wss[0]?.lib[0]?.labels).toEqual([]);
    expect(next.wss[1]?.lib[0]?.labels).toEqual([]);
  });
});
