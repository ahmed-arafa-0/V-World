import type { Request, Response } from 'express';
import type { ApiError } from '@veoullas-world/contracts';
import type { BirthdayTestClock } from '../dev/birthday-test-clock.js';

export interface DevBirthdayTestClockResponse {
  ok: true;
  offsetMs: number | null;
}

/**
 * `GET /api/dev/birthday-test-clock` — gated by `createDevelopmentOnlyMiddleware` then
 * `requireAdmin` (registered before this handler in `app.ts`), exactly like
 * `/api/dev/map-preview-assets`'s dev+auth chain. Read-only: reports the current offset.
 */
export function createDevBirthdayTestClockGetHandler(clock: BirthdayTestClock) {
  return (_req: Request, res: Response): void => {
    const response: DevBirthdayTestClockResponse = {
      ok: true,
      offsetMs: clock.getOffset(),
    };
    res.status(200).json(response);
  };
}

/**
 * `POST /api/dev/birthday-test-clock` — body `{ offsetMs: number | null }`. `null` clears the
 * override (the birthday routes fall straight back to the real clock). This never writes to any
 * Sheet and never touches the real owner's state — it only changes what `now` the six `/api/world/
 * birthday/*` routes see for the lifetime of this server process.
 */
export function createDevBirthdayTestClockSetHandler(clock: BirthdayTestClock) {
  return (req: Request, res: Response): void => {
    const body = req.body as { offsetMs?: unknown } | undefined;
    const offsetMs = body?.offsetMs;
    if (
      offsetMs !== null &&
      (typeof offsetMs !== 'number' ||
        !Number.isFinite(offsetMs) ||
        Math.abs(offsetMs) > 366 * 86400_000)
    ) {
      const error: ApiError = {
        ok: false,
        code: 'invalid_request',
        message: 'offsetMs must be a finite number of milliseconds, or null to clear it.',
      };
      res.status(400).json(error);
      return;
    }
    clock.setOffset(offsetMs);
    const response: DevBirthdayTestClockResponse = { ok: true, offsetMs };
    res.status(200).json(response);
  };
}
