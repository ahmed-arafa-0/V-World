import { describe, expect, it } from 'vitest';
import { createBirthdayTestClock } from '../src/dev/birthday-test-clock.js';
const user = 'manual_review_bday_test';
const real = new Date('2026-09-24T10:00:00.000Z');
describe('birthday review clock isolation', () => {
  it('requires an explicit synthetic player and defaults to real time', () => {
    expect(createBirthdayTestClock().resolve(real, user, true)).toBe(real);
    expect(() => createBirthdayTestClock('veoulla')).toThrow();
    expect(() => createBirthdayTestClock().setOffset(100)).toThrow();
  });
  it('advances naturally only for its player, in development, and clears', () => {
    const clock = createBirthdayTestClock(user);
    clock.setOffset(86400_000);
    expect(clock.resolve(real, user, true).toISOString()).toBe('2026-09-25T10:00:00.000Z');
    expect(clock.resolve(new Date(real.getTime() + 1000), user, true).getTime()).toBe(
      real.getTime() + 86401_000,
    );
    for (const other of ['veoulla', 'manual_review_123', 'manual_review_bday_other'])
      expect(clock.resolve(real, other, true)).toBe(real);
    expect(clock.resolve(real, user, false)).toBe(real);
    expect(createBirthdayTestClock(user).resolve(real, user, true)).toBe(real);
    clock.setOffset(null);
    expect(clock.getOffset()).toBeNull();
    expect(clock.resolve(real, user, true)).toBe(real);
  });
});
