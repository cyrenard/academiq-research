/**
 * Behavioral characterization for aq-engine table create/insert/delete
 * (experiments/aq-engine/document.js → makeEmptyTable + doc-model insertTable /
 * removeTableAt). The editor's insertTable/deleteTable commands were empty stubs
 * (`function(){}`), so tables could not be created or removed at all; these
 * doc-model primitives back the now-implemented compat-shim commands.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AQEngineDocument = require('../../../../experiments/aq-engine/document.js') as {
  create: (blocks?: any[]) => any;
  makeEmptyTable: (rows: unknown, cols: unknown) => any;
};

describe('aq-engine makeEmptyTable', () => {
  it('builds a rows×cols table with empty single-run cells', () => {
    const t = AQEngineDocument.makeEmptyTable(2, 3);
    expect(t.type).toBe('table');
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0].cells).toHaveLength(3);
    expect(t.rows[1].cells[2].runs).toEqual([{ text: '' }]);
  });

  it('defaults to 3×3 (undefined/0 → default) and clamps negatives to 1', () => {
    expect(AQEngineDocument.makeEmptyTable(undefined, undefined).rows).toHaveLength(3);
    expect(AQEngineDocument.makeEmptyTable(undefined, undefined).rows[0].cells).toHaveLength(3);
    // 0 is falsy → default 3; negatives clamp up to 1
    expect(AQEngineDocument.makeEmptyTable(0, 0).rows).toHaveLength(3);
    const tiny = AQEngineDocument.makeEmptyTable(-1, -2);
    expect(tiny.rows).toHaveLength(1);
    expect(tiny.rows[0].cells).toHaveLength(1);
  });

  it('coerces string dimensions', () => {
    const t = AQEngineDocument.makeEmptyTable('4', '2');
    expect(t.rows).toHaveLength(4);
    expect(t.rows[0].cells).toHaveLength(2);
  });
});

describe('aq-engine doc-model insertTable / removeTableAt', () => {
  it('insertTable inserts a table block at the offset', () => {
    const doc = AQEngineDocument.create([{ type: 'paragraph', runs: [{ text: 'AB' }] }]);
    doc.insertTable(0, 3, 2);
    const blocks = doc.get().blocks;
    const table = blocks.find((b: any) => b.type === 'table');
    expect(table).toBeTruthy();
    expect(table.rows).toHaveLength(3);
    expect(table.rows[0].cells).toHaveLength(2);
  });

  it('removeTableAt removes the table containing the offset and returns true', () => {
    const doc = AQEngineDocument.create([
      { type: 'table', rows: [{ cells: [{ runs: [{ text: 'C' }] }] }] },
      { type: 'paragraph', runs: [{ text: 'P' }] }
    ]);
    expect(doc.get().blocks.some((b: any) => b.type === 'table')).toBe(true);
    expect(doc.removeTableAt(0)).toBe(true);
    expect(doc.get().blocks.some((b: any) => b.type === 'table')).toBe(false);
  });

  it('removeTableAt is a no-op (false) when the block at the offset is not a table', () => {
    const doc = AQEngineDocument.create([{ type: 'paragraph', runs: [{ text: 'hello' }] }]);
    expect(doc.removeTableAt(1)).toBe(false);
    expect(doc.get().blocks).toHaveLength(1);
  });

  it('insert then remove is undoable (commit-based)', () => {
    const doc = AQEngineDocument.create([{ type: 'paragraph', runs: [{ text: 'X' }] }]);
    doc.insertTable(0, 2, 2);
    expect(doc.get().blocks.some((b: any) => b.type === 'table')).toBe(true);
    expect(doc.undo()).toBe(true);
    expect(doc.get().blocks.some((b: any) => b.type === 'table')).toBe(false);
  });
});
