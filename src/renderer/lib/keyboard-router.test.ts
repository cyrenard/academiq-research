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

  it('does not match shortcuts with unrequested modifiers', () => {
    const handler = vi.fn(() => true);
    const unsub = keyboardRouter.register({
      id: 'exact-modifiers',
      combo: { key: 'k', ctrlKey: true },
      handler
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, shiftKey: true }));
    expect(handler).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    expect(handler).toHaveBeenCalledOnce();
    unsub();
  });

  it('stops a claimed shortcut before legacy bubble listeners run', () => {
    const legacy = vi.fn();
    const unsub = keyboardRouter.register({
      id: 'single-owner',
      combo: { key: 'F2' },
      handler: () => true,
      priority: 100
    });
    document.addEventListener('keydown', legacy);

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));

    expect(legacy).not.toHaveBeenCalled();
    document.removeEventListener('keydown', legacy);
    unsub();
  });

  it('ignores IME composition key events', () => {
    const handler = vi.fn(() => true);
    const unsub = keyboardRouter.register({ id: 'ime-safe', combo: { key: 'a' }, handler });
    const event = new KeyboardEvent('keydown', { key: 'a' });
    Object.defineProperty(event, 'isComposing', { value: true });
    window.dispatchEvent(event);
    expect(handler).not.toHaveBeenCalled();
    unsub();
  });
});
