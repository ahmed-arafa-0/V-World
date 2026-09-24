import { describe, expect, it, vi } from 'vitest';
import { withRetry } from '../src/repositories/retry.js';
import { AppError } from '../src/errors/app-error.js';

describe('withRetry', () => {
  it('returns the result immediately on success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a retryable AppError up to maxAttempts, then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(
        new AppError('SHEET_RATE_LIMITED', 'rate limited', { retryable: true }),
      )
      .mockResolvedValueOnce('ok-after-retry');

    const result = await withRetry(fn, { baseDelayMs: 1, maxAttempts: 3 });
    expect(result).toBe('ok-after-retry');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable AppError', async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new AppError('SHEET_ACCESS_DENIED', 'denied', { retryable: false }));

    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow('denied');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxAttempts and throws the last error', async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new AppError('SHEET_UNAVAILABLE', 'still down', { retryable: true }));

    await expect(withRetry(fn, { baseDelayMs: 1, maxAttempts: 2 })).rejects.toThrow('still down');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('withRetry rate limits', () => {
  it('waits for a 429 (a 50 ms retry only spends more quota) but stays bounded, then surfaces the failure', async () => {
    vi.useFakeTimers();
    try {
      const fn = vi
        .fn()
        .mockRejectedValue(new AppError('SHEET_RATE_LIMITED', 'limited', { retryable: true }));
      const outcome = withRetry(fn, { maxAttempts: 3 }).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(400);
      expect(fn).toHaveBeenCalledTimes(1); // still backing off, not hammering
      await vi.advanceTimersByTimeAsync(4000); // well beyond 1 s + 2 s (+ jitter)
      expect(fn).toHaveBeenCalledTimes(3);
      expect(await outcome).toMatchObject({ code: 'SHEET_RATE_LIMITED' });
    } finally {
      vi.useRealTimers();
    }
  });
});
