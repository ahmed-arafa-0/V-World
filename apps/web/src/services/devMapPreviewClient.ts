import type { DevMapPreviewResponse } from '@veoullas-world/contracts';
import { fetchJson, type ApiFetchResult } from './apiClient';

export type DevMapPreviewResult = ApiFetchResult<DevMapPreviewResponse>;

/**
 * `GET /api/dev/map-preview-assets` — a development-only backend route
 * (see `apps/functions/src/api/development-only-middleware.ts`). Outside a
 * `local`/`emulator` backend it 404s with the same generic shape any
 * unknown route returns, which `isDevMapPreviewUnavailable()` below detects
 * so the UI can show "not available in this environment" instead of a
 * generic connection-error message.
 */
export function fetchDevMapPreviewAssets(): Promise<DevMapPreviewResult> {
  return fetchJson<DevMapPreviewResponse>('/api/dev/map-preview-assets');
}

/**
 * True when the `offline` result is this route's own development-only 404
 * (the exact message `development-only-middleware.ts` writes), as opposed
 * to a real network/backend failure. Matching on the literal message is
 * deliberate: the 404 body is intentionally indistinguishable from "unknown
 * route" at the wire level, so this is the same signal a human reading the
 * network tab would have — no special-case status code is carved out for
 * this route.
 */
export function isDevMapPreviewUnavailable(message: string): boolean {
  return message.startsWith('No route for GET /api/dev/map-preview-assets');
}
