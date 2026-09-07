import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDebounced } from './debounced';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createDebounced', () => {
  it('runs the function once after the wait elapses', async () => {
    const fn = vi.fn(async (_s: AbortSignal, n: number) => n * 2);
    const d = createDebounced(fn, 300);

    const p = d.call(21);
    expect(fn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    await expect(p).resolves.toEqual({ superseded: false, value: 42 });
  });

  it('supersedes an earlier call made inside the window', async () => {
    const fn = vi.fn(async (_s: AbortSignal, n: number) => n);
    const d = createDebounced(fn, 300);

    const first = d.call(1);
    await vi.advanceTimersByTimeAsync(100);
    const second = d.call(2);
    await vi.advanceTimersByTimeAsync(300);

    await expect(first).resolves.toEqual({ superseded: true });
    await expect(second).resolves.toEqual({ superseded: false, value: 2 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('aborts the in-flight call when a newer one starts', async () => {
    const seen: AbortSignal[] = [];
    const fn = vi.fn(async (signal: AbortSignal, n: number) => {
      seen.push(signal);
      await new Promise((r) => setTimeout(r, 1000));
      return n;
    });
    const d = createDebounced(fn, 300);

    const first = d.call(1);
    await vi.advanceTimersByTimeAsync(300);
    const second = d.call(2);
    await vi.advanceTimersByTimeAsync(300);

    expect(seen[0].aborted).toBe(true);
    expect(seen[1].aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    await expect(first).resolves.toEqual({ superseded: true });
    await expect(second).resolves.toEqual({ superseded: false, value: 2 });
  });

  it('reports a genuine rejection rather than swallowing it', async () => {
    const d = createDebounced(async () => {
      throw new Error('locator exploded');
    }, 300);

    // Attach the rejection handler before the timer fires, or Node sees an
    // unhandled rejection in the window between the two.
    const assertion = expect(d.call()).rejects.toThrow('locator exploded');
    await vi.advanceTimersByTimeAsync(300);
    await assertion;
  });

  it('cancel() supersedes a pending call without running it', async () => {
    const fn = vi.fn(async (_s: AbortSignal) => 'ran');
    const d = createDebounced(fn, 300);

    const p = d.call();
    d.cancel();
    await vi.advanceTimersByTimeAsync(300);

    await expect(p).resolves.toEqual({ superseded: true });
    expect(fn).not.toHaveBeenCalled();
  });
});
