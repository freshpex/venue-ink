import { afterEach, describe, expect, it, vi } from 'vitest';
import { request, waitForServer } from '../src/lib/api';
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('Render connection readiness', () => {
  it('supports browsers without AbortSignal.any or AbortSignal.timeout', async () => {
    vi.spyOn(AbortSignal, 'any').mockImplementation(() => {
      throw new Error('Unsupported');
    });
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      throw new Error('Unsupported');
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ready: true }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await expect(waitForServer(() => {}, new AbortController().signal)).resolves.toBeUndefined();
  });
  it('aborts an in-flight request when its caller cancels', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, options) => {
        signal = options.signal;
        return new Promise((_resolve, reject) =>
          signal?.addEventListener('abort', () => reject(signal?.reason), { once: true }),
        );
      }),
    );
    const parent = new AbortController();
    const result = request('/auth/me', {}, parent.signal);
    const assertion = expect(result).rejects.toThrow();
    parent.abort();
    await assertion;
    expect(signal?.aborted).toBe(true);
  });
  it('waits through a sleeping response, then continues once ready', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('<html>Starting</html>', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ready: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetch);
    const states: string[] = [];
    const result = waitForServer((s) => states.push(s), new AbortController().signal, {
      timeoutMs: 1000,
      pollMs: 20,
    });
    await vi.advanceTimersByTimeAsync(30);
    await result;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(states).toContain('Server is waking up. Connecting…');
    expect(states.at(-1)).toBe('Signing you in…');
  });
  it('retains a clear retry error when readiness times out', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = waitForServer(() => {}, new AbortController().signal, {
      timeoutMs: 50,
      pollMs: 20,
    });
    const assertion = expect(result).rejects.toThrow('taking longer than expected');
    await vi.advanceTimersByTimeAsync(80);
    await assertion;
  });
  it('allows the visitor to cancel a waking server connection', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const controller = new AbortController();
    const result = waitForServer(() => {}, controller.signal, {
      timeoutMs: 1000,
      pollMs: 100,
    });
    const assertion = expect(result).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await assertion;
  });
});
