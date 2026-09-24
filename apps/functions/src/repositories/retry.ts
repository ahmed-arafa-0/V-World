import { AppError } from '../errors/app-error.js';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

/** First wait after a 429; doubles per attempt (about 1 s then 2 s with the default 3 attempts). */
export const RATE_LIMIT_BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retries only AppErrors explicitly marked retryable, with bounded exponential backoff. */
export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 50;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable = err instanceof AppError && err.retryable;
      if (!retryable || attempt === maxAttempts) {
        throw err;
      }
      // A rate limit needs real breathing room (a 50 ms retry only spends more quota); other
      // retryable errors keep the short delay. Jittered and bounded by maxAttempts.
      const base =
        err instanceof AppError && err.code === 'SHEET_RATE_LIMITED'
          ? Math.max(baseDelayMs, RATE_LIMIT_BASE_DELAY_MS)
          : baseDelayMs;
      await sleep(base * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5));
    }
  }
  throw lastError;
}
