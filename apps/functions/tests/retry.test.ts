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
