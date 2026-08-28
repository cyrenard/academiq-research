import { describe, expect, it, vi } from 'vitest';
import { SaveBeforeHydrationError, SaveCoordinator } from './save-coordinator';

describe('SaveCoordinator', () => {
  it('blocks writes until persisted state has hydrated', async () => {
    const writer = vi.fn(async () => ({ ok: true }));
    const coordinator = new SaveCoordinator(writer);

    await expect(coordinator.save('{"blank":true}', 'startup')).rejects.toBeInstanceOf(SaveBeforeHydrationError);
    expect(writer).not.toHaveBeenCalled();

    coordinator.markHydrated();
    await expect(coordinator.save('{"ready":true}', 'persistState')).resolves.toMatchObject({ sequence: 1 });
    expect(writer).toHaveBeenCalledOnce();
  });

  it('commits concurrent requests in enqueue order', async () => {
    const releases: Array<() => void> = [];
    const writes: string[] = [];
    const writer = vi.fn((payload: string) => new Promise<{ ok: true }>((resolve) => {
      writes.push(payload);
      releases.push(() => resolve({ ok: true }));
    }));
    const coordinator = new SaveCoordinator(writer);
    coordinator.markHydrated();

    const first = coordinator.save('first', 'editor-autosave');
    const second = coordinator.save('second', 'persistState');
    await vi.waitFor(() => expect(writes).toEqual(['first']));
    releases.shift()?.();
    await first;
    await vi.waitFor(() => expect(writes).toEqual(['first', 'second']));
    releases.shift()?.();

    await expect(second).resolves.toMatchObject({ sequence: 2 });
    expect(coordinator.getCommittedSequence()).toBe(2);
  });

  it('continues with the next request after a failed write', async () => {
    const writer = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'disk_full' })
      .mockResolvedValueOnce({ ok: true });
    const coordinator = new SaveCoordinator(writer);
    coordinator.markHydrated();

    await expect(coordinator.save('first', 'autosave')).rejects.toThrow('disk_full');
    await expect(coordinator.save('second', 'persistState')).resolves.toMatchObject({ sequence: 2 });
    await coordinator.flush();
    expect(writer).toHaveBeenCalledTimes(2);
  });

  it('does not reload past an unhandled pending save failure', async () => {
    const coordinator = new SaveCoordinator(async () => ({ ok: false, error: 'disk_full' }));
    coordinator.markHydrated();

    await expect(coordinator.save('state', 'autosave')).rejects.toThrow('disk_full');
    await expect(coordinator.flush()).rejects.toThrow('disk_full');
  });
});
