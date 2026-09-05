import { describe, expect, it } from 'vitest';
import {
  computeRateLimitDecision,
  type RateLimitEntry,
} from '../src/services/rate-limit.service.js';

const BASE_MS = Date.parse('2026-01-01T00:00:00.000Z');

function failure(offsetMs: number): RateLimitEntry {
  return { eventType: 'gate_failure', timestampMs: BASE_MS + offsetMs };
}
function success(offsetMs: number): RateLimitEntry {
  return { eventType: 'gate_success', timestampMs: BASE_MS + offsetMs };
}
function rateLimited(offsetMs: number): RateLimitEntry {
  return { eventType: 'gate_rate_limited', timestampMs: BASE_MS + offsetMs };
}

describe('computeRateLimitDecision — Gate boundary (maxAttempts=5, cooldownSeconds=10)', () => {
  it('is not blocked with zero prior failures', () => {
    const decision = computeRateLimitDecision([], 5, 10, BASE_MS);
    expect(decision.blocked).toBe(false);
    expect(decision.remainingAttempts).toBe(5);
  });

  it('is not blocked with exactly 4 prior consecutive failures (one below the threshold)', () => {
    const entries = [failure(0), failure(1000), failure(2000), failure(3000)];
    const decision = computeRateLimitDecision(entries, 5, 10, BASE_MS + 4000);
    expect(decision.blocked).toBe(false);
    expect(decision.remainingAttempts).toBe(1);
  });

  it('is blocked once 5 consecutive failures already exist (the request AFTER the 5th failure)', () => {
    const entries = [failure(0), failure(1000), failure(2000), failure(3000), failure(4000)];
    const decision = computeRateLimitDecision(entries, 5, 10, BASE_MS + 4500);
    expect(decision.blocked).toBe(true);
    expect(decision.remainingAttempts).toBe(0);
    expect(decision.retryAfterSeconds).toBe(10);
  });

  it('reports the cooldown pinned to the FIRST rate_limited marker, not extended by later ones', () => {
    const firstBlockAt = 5000;
    const entries = [
      failure(0),
      failure(1000),
      failure(2000),
      failure(3000),
      failure(4000),
      rateLimited(firstBlockAt),
      // A second blocked attempt 3s later still logs its own marker, but must not push the end time out.
      rateLimited(firstBlockAt + 3000),
    ];
    const nowMs = BASE_MS + firstBlockAt + 8000; // 8s after the first block, cooldown is 10s -> still blocked
    const decision = computeRateLimitDecision(entries, 5, 10, nowMs);
    expect(decision.blocked).toBe(true);
    // Cooldown ends 10s after the FIRST rate_limited marker (at firstBlockAt), i.e. 2s remaining, not 5s.
    expect(decision.retryAfterSeconds).toBe(2);
  });

  it('unblocks the instant the cooldown window (from the first marker) elapses', () => {
    const entries = [
      failure(0),
      failure(1000),
      failure(2000),
      failure(3000),
      failure(4000),
      rateLimited(5000),
    ];
    const cooldownEndsAtMs = BASE_MS + 5000 + 10_000;
    const decision = computeRateLimitDecision(entries, 5, 10, cooldownEndsAtMs);
    expect(decision.blocked).toBe(false);
    expect(decision.remainingAttempts).toBe(5);
  });

  it('resets the whole chain once the cooldown expires — old failures do not carry over', () => {
    const entries = [
      failure(0),
      failure(1000),
      failure(2000),
      failure(3000),
      failure(4000),
      rateLimited(5000),
      // One new failure well after the cooldown expired (5000 + 10000 = 15000).
      failure(20_000),
    ];
    const decision = computeRateLimitDecision(entries, 5, 10, BASE_MS + 20_500);
    expect(decision.blocked).toBe(false);
    expect(decision.remainingAttempts).toBe(4); // only the one post-reset failure counts
  });

  it('a success resets the consecutive-failure chain to zero', () => {
    const entries = [failure(0), failure(1000), failure(2000), failure(3000), success(4000)];
    const decision = computeRateLimitDecision(entries, 5, 10, BASE_MS + 4500);
    expect(decision.blocked).toBe(false);
    expect(decision.remainingAttempts).toBe(5);
  });

  it('failures after a success do not inherit the pre-success count', () => {
    const entries = [
      failure(0),
      failure(1000),
      failure(2000),
      failure(3000),
      failure(4000),
      success(5000),
      failure(6000),
      failure(7000),
    ];
    const decision = computeRateLimitDecision(entries, 5, 10, BASE_MS + 7500);
    expect(decision.blocked).toBe(false);
    expect(decision.remainingAttempts).toBe(3);
  });
});

describe('computeRateLimitDecision — Admin boundary (maxAttempts=3, cooldownSeconds=30)', () => {
  it('is not blocked with 2 prior consecutive failures', () => {
    const entries = [failure(0), failure(1000)];
    const decision = computeRateLimitDecision(entries, 3, 30, BASE_MS + 1500);
    expect(decision.blocked).toBe(false);
    expect(decision.remainingAttempts).toBe(1);
  });

  it('is blocked once 3 consecutive failures already exist', () => {
    const entries = [failure(0), failure(1000), failure(2000)];
    const decision = computeRateLimitDecision(entries, 3, 30, BASE_MS + 2500);
    expect(decision.blocked).toBe(true);
    expect(decision.retryAfterSeconds).toBe(30);
  });
});

describe('computeRateLimitDecision — flow/scope independence is a caller responsibility', () => {
  it('treats a purely admin-flow entry list independently of a gate-flow one (documented via separate event-type prefixes)', () => {
    const adminEntries: RateLimitEntry[] = [
      { eventType: 'admin_failure', timestampMs: BASE_MS },
      { eventType: 'admin_failure', timestampMs: BASE_MS + 1000 },
      { eventType: 'admin_failure', timestampMs: BASE_MS + 2000 },
    ];
    const decision = computeRateLimitDecision(adminEntries, 3, 30, BASE_MS + 2500);
    expect(decision.blocked).toBe(true);
  });
});
