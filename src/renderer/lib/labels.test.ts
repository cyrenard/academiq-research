import { describe, it, expect } from 'vitest';
import { L, fmt } from './labels';

describe('fmt', () => {
  it('interpolates {name} placeholders', () => {
    expect(fmt('Belge {n} silinsin mi?', { n: 3 })).toBe('Belge 3 silinsin mi?');
  });

  it('replaces multiple placeholders', () => {
    expect(fmt('{a} ve {b}', { a: 'X', b: 'Y' })).toBe('X ve Y');
  });

  it('leaves unknown placeholders intact', () => {
    expect(fmt('Hello {missing}', { other: 'x' })).toBe('Hello {missing}');
  });

  it('coerces numeric values to strings', () => {
    expect(fmt('{n}', { n: 42 })).toBe('42');
  });

  it('returns the template unchanged when no placeholders match', () => {
    expect(fmt('plain text', { foo: 'bar' })).toBe('plain text');
  });
});

describe('L (label dictionary)', () => {
  it('exposes the top-level namespaces', () => {
    expect(L).toHaveProperty('app');
    expect(L).toHaveProperty('refs');
    expect(L).toHaveProperty('notes');
    expect(L).toHaveProperty('editor');
    expect(L).toHaveProperty('pdf');
    expect(L).toHaveProperty('modals');
    expect(L).toHaveProperty('errors');
  });

  it('all label values are non-empty strings', () => {
    Object.entries(L).forEach(([ns, values]) => {
      Object.entries(values).forEach(([key, value]) => {
        expect(typeof value).toBe('string');
        expect(String(value).length, `${ns}.${key} is empty`).toBeGreaterThan(0);
      });
    });
  });

  it('label values do not contain mojibake (Ã, Â, â€)', () => {
    Object.entries(L).forEach(([ns, values]) => {
      Object.entries(values).forEach(([key, value]) => {
        const s = String(value);
        const mojibake = /[ÃÅÄÂâ�]/;
        expect(mojibake.test(s), `${ns}.${key} contains mojibake: "${s}"`).toBe(false);
      });
    });
  });

  it('confirmDeleteWorkspace template renders correctly', () => {
    expect(fmt(L.app.confirmDeleteWorkspace, { name: 'Tez' })).toBe('"Tez" silinsin mi?');
  });
});
