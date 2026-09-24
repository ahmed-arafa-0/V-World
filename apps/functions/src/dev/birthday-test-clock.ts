/** A per-app, per-player birthday clock. Only the explicitly configured local review server
 * enables the admin controls. No shared module state, production override, or ordinary-time effect.
 * The offset keeps time flowing naturally through the final countdown. */
export function createBirthdayTestClock(reviewUserId?: string) {
  if (reviewUserId && !/^manual_review_bday_[a-z0-9_]+$/.test(reviewUserId)) {
    throw new Error('Birthday clock requires a designated synthetic review player.');
  }
  let offsetMs: number | null = null;
  return {
    configured: Boolean(reviewUserId),
    getOffset: () => offsetMs,
    setOffset(value: number | null) {
      if (!reviewUserId) throw new Error('Birthday review is not configured.');
      offsetMs = value;
    },
    resolve(realNow: Date, userId: string, isDevelopment: boolean): Date {
      if (!isDevelopment || userId !== reviewUserId || offsetMs === null) return realNow;
      return new Date(realNow.getTime() + offsetMs);
    },
  };
}

export type BirthdayTestClock = ReturnType<typeof createBirthdayTestClock>;
