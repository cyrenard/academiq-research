import { describe, it, expect, vi } from 'vitest';
import { keyboardRouter } from './keyboard-router';

describe('KeyboardRouter', () => {
  it('registers and triggers handlers on keydown', () => {
    const handler = vi.fn().mockReturnValue(true);
    const unsub = keyboardRouter.register({
      id: 'test-shortcut',
      combo: { key: 'k', ctrlKey: true },
      handler
    });

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true
    });
    window.dispatchEvent(event);

    expect(handler).toHaveBeenCalled();
    unsub();
  });

  it('respects priority sorting', () => {
    const log: number[] = [];
    const unsub1 = keyboardRouter.register({
      id: 'low',
      combo: { key: 'a' },
      handler: () => { log.push(1); return false; },
      priority: 1
    });
    const unsub2 = keyboardRouter.register({
      id: 'high',
      combo: { key: 'a' },
      handler: () => { log.push(2); return false; },
      priority: 10
    });

    const event = new KeyboardEvent('keydown', { key: 'a' });
    window.dispatchEvent(event);

    expect(log).toEqual([2, 1]);
    unsub1();
    unsub2();
  });
});
