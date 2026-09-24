import type { RuntimeAssetStatus } from './content-runtime.js';

/**
 * Response shape for `GET /api/dev/map-preview-assets` — a Phase 1
 * item B developer-only endpoint. This route only ever responds outside a
 * generic `404` when the backend reports a `local`/`emulator`
 * `BackendEnvironment` (see `resolveEnvironment()` in
 * `apps/functions/src/api/health.ts`); in `staging`/`production` it 404s
 * before even checking owner authentication, so the capability does not
 * exist at the API layer for a real player regardless of frontend routing.
 */
export interface DevMapPreviewResponse {
  ok: true;
  /** Only the subset of `10_ASSETS` rows this dev preview needs — never the full asset registry. */
  assets: RuntimeAssetStatus[];
}
