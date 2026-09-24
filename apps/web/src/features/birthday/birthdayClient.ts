import type { BirthdayStateResponse } from '@veoullas-world/contracts';
import { worldApi, type WorldResult } from '../world/worldClient';

/**
 * birthday_2026 (M16 narrow scope). Every write here is idempotent server-side
 * (see `apps/functions/src/world/birthday.ts`), so `postIdempotent` — the same
 * safe-retry helper every other one-time world action uses — is used
 * throughout: a reload or a background/foreground cycle can always resend
 * the last write without risk of a duplicate effect or reward.
 */
export const birthdayApi = {
  get: (locale: string): Promise<WorldResult<BirthdayStateResponse>> =>
    worldApi.get('/birthday', locale),
  dismiss: (locale: string) =>
    worldApi.postIdempotent<BirthdayStateResponse>('/birthday/dismiss', {}, locale),
  accept: (locale: string) =>
    worldApi.postIdempotent<BirthdayStateResponse>('/birthday/accept', {}, locale),
  saveWish: (locale: string, text: string) =>
    worldApi.postIdempotent<BirthdayStateResponse>('/birthday/wish', { text }, locale),
  skipWish: (locale: string) =>
    worldApi.postIdempotent<BirthdayStateResponse>('/birthday/wish', { skip: true }, locale),
  extinguishCandle: (locale: string) =>
    worldApi.postIdempotent<BirthdayStateResponse>('/birthday/candle', {}, locale),
  claimGifts: (locale: string) =>
    worldApi.postIdempotent<BirthdayStateResponse>('/birthday/gifts/claim', {}, locale),
  /**
   * `replayOperationId` is only ever set by an explicit "replay the celebration" action (a fresh id
   * per click) — the ordinary first-run completion always omits it, so any retry/reload of that
   * first completion is a safe no-op rather than a counted replay.
   */
  complete: (locale: string, replayOperationId?: string) =>
    worldApi.postIdempotent<BirthdayStateResponse>(
      '/birthday/complete',
      replayOperationId ? { replayOperationId } : {},
      locale,
    ),
};
