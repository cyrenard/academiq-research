import { describe, expect, it, vi } from 'vitest';
import { EditorCommandRouter } from './editor-command-router';

describe('EditorCommandRouter', () => {
  it('routes a semantic editor command to its owner', () => {
    const router = new EditorCommandRouter();
    const handler = vi.fn(() => true);
    router.register('citation.refresh', handler);

    expect(router.dispatch('citation.refresh', { source: 'aq-engine' })).toBe(true);
    expect(handler).toHaveBeenCalledWith({ source: 'aq-engine' });
  });

  it('uses priority and falls through only when an owner declines', () => {
    const router = new EditorCommandRouter();
    const calls: string[] = [];
    router.register('files.drop', () => { calls.push('fallback'); return true; }, 1);
    router.register('files.drop', () => { calls.push('primary'); return false; }, 10);

    expect(router.dispatch('files.drop')).toBe(true);
    expect(calls).toEqual(['primary', 'fallback']);
  });

  it('removes handlers without affecting other command owners', () => {
    const router = new EditorCommandRouter();
    const remove = router.register('citation.open', () => true);
    expect(router.has('citation.open')).toBe(true);
    remove();
    expect(router.dispatch('citation.open')).toBe(false);
  });
});
