# M03-B1 — Google Drive Media Gateway Foundation: Checkpoint Report

**Milestone:** M03-B1 (backend foundation only — M03-B2 will add service-worker/browser caching; a later checkpoint adds the voice-over player and final assets)
**Date:** 2026-09-07
**Scope:** A backend-only, read-only Google Drive client/repository; an owner-session-protected `GET`/`HEAD /api/media/:assetId` endpoint with root-folder containment, MIME allowlisting, byte-range support, and sanitized errors; and network-free tests for all of it. No service worker, browser media cache, voice-over player, final asset, world scene, or M04 work was started.

---

## 0. Preflight

Read completely before editing: `CLAUDE.md`, `docs/Veoullas_World_Living_Bible.md`, `docs/Claude_Code_Master_Build_Plan.md`, `docs/reports/M03_A_CHECKPOINT.md`, M01/M02 evidence for Sheet access/owner sessions/credentials/safe API errors, and the existing credential loader, Sheet gateway, content-runtime service, asset contracts, `buildMediaRef`, and owner authorization middleware.

**Live preflight (`npm run preflight:m03b1`), 6/6 passed, no private value printed:**

```
=== 1. Google credential ===
  PASS  Real Google credential is present and loads
  PASS  Drive client can be constructed from the same credential

=== 2. drive_root_folder_id in 01_APP_CONFIG ===
  PASS  drive_root_folder_id is configured (enabled, non-placeholder)
  Root folder ID: 1JsF…wfnq (masked)

=== 3. Google Drive API reachability and root-folder access ===
  PASS  Drive API metadata call for the configured root succeeds
  PASS  The configured root folder is actually a folder (not a file)
  PASS  The configured root folder is not trashed

M03-B1 PREFLIGHT PASSED.
```

No blocker was found — the Google Drive API is enabled and reachable, `drive_root_folder_id` is configured in `01_APP_CONFIG` (unchanged since M01, `1JsFD1SIVl36pGS1yKiccGZBu7n-nwfnq`), and the service account can read the configured root folder's metadata. Work proceeded.

**No conflict found** between this prompt and the Living Bible/Master Build Plan: the Master Build Plan's M03 bundles the Drive media gateway together with byte-range support, service-worker caching, and the voice-over player into one milestone; M03-A already split M03 into sub-checkpoints, and this prompt further splits the Drive gateway itself into B1 (backend foundation, this report) and a later B2 (service-worker/browser cache invalidation, explicitly deferred per instruction 35). This is a scoping decision, not a contradiction.

## 1. Read-only audit of the historical `05_ENTRY_LOGS` controlled-list errors

The prompt asked for an audit of "153 historical `05_ENTRY_LOGS.event_type` controlled-list errors," based on the M03-A checkpoint's own description of a live schema-health error count. **That description was imprecise, and the audit below corrects it**: `event_type` is not, and apparently never was, the actual source.

Run via `npm run audit:entry-log-events` (`scripts/audit-entry-log-event-types.mjs`, read-only, checks both of `05_ENTRY_LOGS`'s controlled-list columns against `39_VALIDATION_LISTS` and never writes anything):

- **363 total rows scanned.**
- **`event_type` column: 0 invalid values.** Every single row's `event_type` is one of the 11 accepted values (`page_open`, `gate_failure`, `gate_success`, `gate_rate_limited`, `admin_failure`, `admin_success`, `admin_rate_limited`, `session_resume`, `session_end`, `session_expired`, `session_terminated`) — this column is fully clean.
- **`language` column: 205 invalid values — this is the column actually producing the live schema-health error count** (confirmed live: the error count has grown from 153 at M03-A's writing to 205 now, tracking new test-session traffic, not a fixed historical number):

  | Invalid value | Occurrences | Earliest timestamp       | Latest timestamp         | Likely category                                                                                                                                                                                                                                                                                                                                                                                                                                         |
  | ------------- | ----------- | ------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `"en-US"`     | 205         | 2026-09-05T06:27:03.856Z | 2026-09-07T01:36:41.652Z | **Legitimate browser locale value** — `05_ENTRY_LOGS.language` is populated from `navigator.language` in the browser (see `GatePage.tsx`/`usePageOpenLog.ts`), which returns a BCP-47 tag like `"en-US"`, while `39_VALIDATION_LISTS`'s `locale` list only contains the app's own five internal locale codes (`en`, `ar-EG`, `it`, `el`, `fr`). `"en-US"`'s base language (`en`) _is_ an accepted locale — this is a format mismatch, not invalid data. |

  No other invalid `language` value was observed; the remaining 158 rows have a blank `language` (server-generated log rows from live-verification scripts, which never set this field, e.g. `test-m01-live.mjs`/`test-m02-live-auth.mjs`).

**Conclusion:** this is not corrupted or stale historical data — it is a small, real, and **ongoing** validation-list/data mismatch: every future real visitor's browser will keep logging a BCP-47 `navigator.language` value into a column checked against a controlled list of app-internal locale codes, so this count will keep growing under normal use, not just under test traffic. Fixing it (e.g. mapping `navigator.language` to its nearest supported app locale before logging, or widening the `locale` validation list to accept common BCP-47 variants) is a small, targeted change to M02-era logging code — **out of scope for M03-B1** (a backend Drive-media milestone) and not made here. Per instruction A.6, **no row in `05_ENTRY_LOGS` or `39_VALIDATION_LISTS` was updated or deleted** — this section is a report only.

## 2. Files changed / created

**New (backend, `apps/functions`):**

- `src/google/drive-types.ts` — `GoogleDriveClient` interface, `DriveFileMetadata`, `DriveByteRange`, `DriveContentStreamResult`, `DRIVE_SHORTCUT_MIME_TYPE`.
- `src/google/real-drive-client.ts` — `RealGoogleDriveClient`, using the same service-account credential shape as Sheets with Drive read-only scope (`drive.readonly`).
- `src/google/drive-error-mapper.ts` — `mapDriveError()`, mirroring `mapGoogleError()` but mapping to `MediaErrorCode`s; 401/403/404 all collapse to the same `MEDIA_FILE_INACCESSIBLE`.
- `src/google/drive-client-factory.ts` — `createGoogleDriveClientOrNull()` / `requireGoogleDriveClient()`.
- `src/repositories/drive-context.ts` — `getProductionDriveClientOrNull()` production singleton, mirroring `gateway-context.ts`.
- `src/repositories/drive-gateway.ts` — `DriveGateway`: retried metadata/content-stream reads and `isUnderRoot()`, the root-folder containment check (§4).
- `src/services/media-asset.service.ts` — `resolveMediaAsset()` (Sheet-side asset/variant/version resolution) and `getDriveRootFolderId()`.
- `src/http/byte-range.ts` — `parseRangeHeader()`.
- `src/http/media-headers.ts` — `buildMediaHeaders()`.
- `src/api/media.ts` — `createMediaHandler()`, the `GET`/`HEAD` handler.

**Modified (backend):**

- `src/app.ts` — adds `getDriveClient` to `CreateAppOptions` (defaulting to the new production singleton) and registers `GET`/`HEAD /api/media/:assetId` behind the existing `createOwnerAuthMiddleware`. No other route's wiring or behavior changed.
- `src/errors/app-error.ts` — `httpStatusForCode()` gains the twelve new `MediaErrorCode` mappings (§5).

**New (shared contracts):**

- `packages/contracts/src/media.ts` — `MEDIA_VARIANTS`, `MediaVariant`, `isMediaVariant()`.

**Modified (shared contracts):**

- `packages/contracts/src/api-error.ts` — adds `MediaErrorCode` (12 new codes, listed in §5) to the `ApiErrorCode` union.
- `packages/contracts/src/index.ts` — new exports only, additive.

**New (backend tests, all network-free):**

- `tests/helpers/fake-drive-client.ts` — `FakeGoogleDriveClient`, `fakeMetadata()`; every simulated failure is routed through the real `mapDriveError()` so the fake honors the same "always throws an already-mapped `AppError`" contract the real client does.
- `tests/byte-range.test.ts` (14 tests), `tests/drive-error-mapper.test.ts` (7), `tests/drive-gateway.test.ts` (10), `tests/media-asset.service.test.ts` (19), `tests/media-api.test.ts` (31).

**New (scripts, live/manual only, excluded from `npm run test`):**

- `scripts/test-m03b1-preflight.mjs` (`npm run preflight:m03b1`) — §0.
- `scripts/audit-entry-log-event-types.mjs` (`npm run audit:entry-log-events`) — §1.

**Modified:**

- `package.json` — adds the two scripts above.

**Not committed.**

## 3. Endpoint and request matrix

| Method | Route                                                               | Protection                                                                                                                                                                     |
| ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/media/:assetId?v={version}&variant={default\|mobile\|poster}` | Owner session required (`createOwnerAuthMiddleware`, the same M03-A middleware — an Admin session in the owner cookie is rejected `403 SESSION_FORBIDDEN`, per instruction 16) |
| HEAD   | `/api/media/:assetId?v={version}&variant={default\|mobile\|poster}` | Same as GET                                                                                                                                                                    |

The browser supplies only `assetId` (path), `v` (the exact enabled Sheet version), and an optional `variant` — never a Drive file ID (instruction 9/10). Resolution order, exactly as specified:

1. `resolveMediaAsset()` — Sheet-only: validates `assetId` shape, looks up the enabled `10_ASSETS` row, checks `enabled`, checks the exact version match, and picks the Drive file ID for the requested variant (with the mobile→default fallback and poster missing-variant behavior in §3a). **A disabled, missing, or version-mismatched asset never reaches Drive at all** (proven in `media-api.test.ts`, e.g. "rejects a disabled asset without ever calling Drive").
2. Only once step 1 succeeds: `getDriveRootFolderId()` (Sheet) + one Drive metadata call, then trashed/shortcut/MIME/containment checks (§4), then the Range parse and response.

### 3a. Variant selection (instruction 17)

| Variant   | Behavior                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default` | Uses `drive_file_id`. Blank/placeholder → `MEDIA_VARIANT_NOT_FOUND`.                                                                                             |
| `mobile`  | Uses `mobile_drive_file_id` when configured; otherwise **safely falls back to the default file** (`drive_file_id`). Both blank → `MEDIA_VARIANT_NOT_FOUND`.      |
| `poster`  | Uses `poster_drive_file_id`. None configured → `MEDIA_VARIANT_NOT_FOUND` ("a safe missing-variant result," not an error that implies the whole asset is broken). |

An un-replaced `<...>` placeholder value (the same convention `packages/sheet-schema` already treats as a placeholder) in any of these three columns is treated as "not configured," not as a literal (and certainly-invalid) file ID.

**A poster is always validated as an image**, regardless of the asset's own `asset_type` (e.g. a `video` asset's poster thumbnail is a JPEG/PNG, not a video) — `resolveMediaAsset()` returns both `assetFamily` (the asset's own family, for logging/introspection) and `expectedMimeFamily` (`'image'` for `variant==='poster'`, else `assetFamily`), and only the latter is used for MIME validation (§5a). This was found and fixed during this milestone — see `media-asset.service.test.ts`'s "expects an 'image' MIME family for a poster variant even on a video asset."

## 4. Root-folder containment design (instructions 12–14)

`DriveGateway.isUnderRoot(fileMetadata, rootFolderId)`:

1. **Direct-parent fast path**: if `rootFolderId` is already in the resolved file's own `parents` (the common one-hop case — root → asset), returns `true` with **zero additional Drive calls**, reusing the metadata already fetched for the MIME/trashed checks.
2. **Bounded ancestry walk**: otherwise walks up the parent-folder graph breadth-first, fetching each unvisited ancestor's metadata (each call retried for transient 429/5xx, per `withRetry`), checking whether _it_ has `rootFolderId` as a parent, and continuing with its parents. Multiple-parent files are fully supported (any one path to the root is sufficient). Bounded to 12 hops (`MAX_ANCESTRY_DEPTH`) so a malformed or unexpectedly deep structure can never cause runaway API calls — the real asset root is only ever a few folders deep in practice.
3. **Fails closed**: an ancestor whose metadata can't be read (deleted, a permission inconsistency, or any other error surviving retry) is treated as a dead end for that branch, not a crash — an unprovable path must never be treated as containment, and this security check failing open would be worse than it safely resolving to "not contained." A file with no parents at all (e.g. sitting directly in "My Drive") resolves to `false` by construction.
4. A file failing containment → `403 MEDIA_FILE_OUTSIDE_ROOT` (instruction 13).

**Shortcuts (instruction 14):** every Drive shortcut (`mimeType === 'application/vnd.google-apps.shortcut'`) is rejected outright with `403 MEDIA_SHORTCUT_REJECTED`, checked _before_ the MIME/containment checks even run. The prompt allows resolving a shortcut's target only if it "can be proven inside the configured root without leaking its ID," but explicitly says to "prefer a safe rejection with a documented error" — B1 takes exactly that safer option rather than adding shortcut-target-ancestry resolution, which is real additional complexity/attack surface for a foundation checkpoint. This is a deliberate, documented scope choice, not an oversight (§9, known limitations).

## 5. Sanitized error codes and examples

Twelve new `MediaErrorCode`s (`packages/contracts/src/api-error.ts`), each mapped to an HTTP status in `httpStatusForCode()`:

| Code                          | HTTP | Meaning                                                                                                             |
| ----------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------- |
| `MEDIA_ASSET_INVALID`         | 400  | Malformed `assetId`, missing/non-numeric `v`, or an unrecognized `variant`                                          |
| `MEDIA_ASSET_NOT_FOUND`       | 404  | No `10_ASSETS` row with that ID                                                                                     |
| `MEDIA_ASSET_DISABLED`        | 404  | Row exists but `enabled=FALSE`                                                                                      |
| `MEDIA_VERSION_MISMATCH`      | 409  | `v` doesn't equal the current enabled version                                                                       |
| `MEDIA_VARIANT_NOT_FOUND`     | 404  | The requested variant has no configured (and no fallback) file                                                      |
| `MEDIA_FILE_INACCESSIBLE`     | 502  | Drive reports the file missing/access-denied/trashed, or its size is unknown                                        |
| `MEDIA_FILE_OUTSIDE_ROOT`     | 403  | Containment check failed (§4)                                                                                       |
| `MEDIA_SHORTCUT_REJECTED`     | 403  | The resolved file is a Drive shortcut (§4)                                                                          |
| `MEDIA_UNSUPPORTED_MIME`      | 415  | Drive's MIME type isn't allowed for the expected family (§5a), or the Sheet's own `asset_type` isn't a known family |
| `MEDIA_RANGE_MALFORMED`       | 400  | Multi-range or otherwise unparsable `Range` header                                                                  |
| `MEDIA_RANGE_NOT_SATISFIABLE` | 416  | Syntactically valid but out-of-bounds `Range`                                                                       |
| `MEDIA_UPSTREAM_UNAVAILABLE`  | 503  | A Drive 429/5xx that survived retry, or a stream-level failure                                                      |

**Example sanitized responses** (from `media-api.test.ts`, exact shapes the API returns):

```json
{ "ok": false, "code": "MEDIA_FILE_OUTSIDE_ROOT", "message": "The referenced media file is outside the approved asset root." }
{ "ok": false, "code": "MEDIA_SHORTCUT_REJECTED", "message": "Drive shortcuts are not supported for media assets." }
{ "ok": false, "code": "MEDIA_VERSION_MISMATCH", "message": "The requested asset version does not match the current version." }
{ "ok": false, "code": "MEDIA_UNSUPPORTED_MIME", "message": "The referenced file type is not a supported media format." }
```

No response body, header, or log line in this backend ever contains a Drive file ID, an `Authorization` header value, an access token, service-account data, or a raw Google error — `mapDriveError()` collapses 401/403/404 into one code specifically so a caller can never distinguish "doesn't exist" from "access denied" for a private Drive file, and `media-api.test.ts`'s "no leakage" test asserts this by pattern-scanning every error and success response.

## 6. MIME matrix (instructions 20–24)

`resolveMediaAsset()`'s `expectedMimeFamily` (§3a) is checked against Drive's own reported `mimeType` via a fixed allowlist (`media-asset.service.ts`):

| Family (`10_ASSETS.asset_type`, or forced `image` for a poster) | Allowed MIME types                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------------- |
| `image`                                                         | `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/svg+xml` |
| `audio`                                                         | `audio/mpeg`, `audio/mp4`, `audio/ogg`, `audio/wav`, `audio/webm`     |
| `video`                                                         | `video/mp4`, `video/webm`, `video/ogg`                                |
| `pdf`                                                           | `application/pdf`                                                     |

Any `asset_type` value outside these four families is rejected as `MEDIA_UNSUPPORTED_MIME` before any Drive call (default-deny) — PDF is included specifically because this allowlist (sourced from that Sheet column) explicitly names it, satisfying instruction 21's "PDF only if the current asset registry explicitly allows it." HTML, JavaScript, executable, and any other unlisted MIME type are rejected the same way regardless of family (`media-asset.service.test.ts`'s "rejects HTML, JavaScript, and executable-shaped MIME types for every family").

**Response headers** (`buildMediaHeaders()`): `Content-Type` (Drive's validated MIME), `X-Content-Type-Options: nosniff`, a synthetic `Content-Disposition: inline; filename="{assetId}-{variant}.{ext}"` (built only from the client-already-knows-this `assetId`/`variant` plus a MIME-derived extension — **never** Drive's own file name), `Cache-Control: private, max-age=31536000, immutable`, `Accept-Ranges: bytes`, and an `ETag` built from `"{assetId}-{version}-{variant}"` (never Drive's own ETag, which could otherwise indirectly correlate with the file's identity).

**SVG-specific hardening** (instruction 24): every `image/svg+xml` response additionally gets `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` — the same mitigation GitHub/GitLab use for serving untrusted SVG same-origin, forbidding script execution and sandboxing the response, on top of `nosniff` already blocking any MIME-confusion attempt to treat it as HTML.

## 7. Byte-range behavior (instructions 25–31)

- **HEAD**: resolves the asset and fetches Drive metadata only — `driveGateway.getContentStream()` (and therefore any Drive content call) is never invoked for a HEAD request, proven by asserting `driveClient.contentCallCount` is unchanged after a HEAD call. Returns the identical headers a GET would, no body.
- **GET, no `Range`**: `200`, `Content-Length` = the file's full known size, and the Drive stream is piped directly to the response (`stream.pipe(res)`) — never buffered into memory first. Proven directly (not just asserted) in `media-api.test.ts`'s "does not buffer the full file before responding" test: the handler call itself resolves in well under the time a deliberately slow, multi-chunk fake stream takes to finish draining, which is only possible if the handler wires up the pipe and returns rather than awaiting full completion.
- **`bytes=start-end`, `bytes=start-`, `bytes=-suffixLength`**: all three parsed by `parseRangeHeader()` (`http/byte-range.ts`, 14 dedicated unit tests) and served as `206` with a correct `Content-Range: bytes {start}-{end}/{total}` and matching `Content-Length`.
- **Unsatisfiable range** (`start >= total`, or against a zero-length resource): `416` with `Content-Range: bytes */{total}` and no body — never silently served as if valid.
- **Malformed or multi-range**: a distinct `400 MEDIA_RANGE_MALFORMED` (not conflated with the syntactically-valid-but-out-of-bounds 416 case).
- **Only the validated, server-computed range is ever forwarded to Drive** — proven in `media-api.test.ts`'s "forwards only the validated range to Drive": a client-sent `bytes=10-2000000` (wildly out of bounds) reaches the fake Drive client as the clamped `{start:10, end:999}`, never the raw client string.
- **Retry**: only the initial Drive request _setup_ (metadata call, or the content-stream call before any bytes have reached the client) is retried, and only for a `429`/`5xx` (`DriveGateway`, backed by the existing bounded-exponential-backoff `withRetry`). A permanent failure (e.g. a missing file) is never retried (`media-api.test.ts`: exactly 1 metadata call, `502 MEDIA_FILE_INACCESSIBLE`). A transient failure succeeds after exactly one retry (exactly 2 calls, `200`). Once bytes may have started flowing, a later stream-level error is never retried — it surfaces as a client-visible connection abort instead (§7a), since retrying mid-transfer could interleave two responses.
- **Client disconnect**: `req.on('close', () => stream.destroy?.())` aborts the upstream Drive stream. Proven directly against the real handler function (not through a real socket, for determinism) in `media-api.test.ts`'s "aborts the upstream Drive stream when the client disconnects."

### 7a. Stream-error handling

If the Drive content stream errors after `res.headersSent` is already `true` (i.e. at least one chunk was already flushed to the client), the handler destroys the response instead of attempting a JSON error body — a partially-sent binary response can never be silently "fixed up" into a clean error payload. If it errors before any byte was sent, the ordinary sanitized-JSON-error path is used. Proven in `media-api.test.ts`'s "destroys the response (never a JSON body) when the Drive stream errors mid-transfer."

## 8. Cache/version rules (instructions 32–35)

- A `(assetId, version, variant)` URL is immutable **only** because the version is required and checked exactly (§3, `MEDIA_VERSION_MISMATCH`) — `Cache-Control: private, max-age=31536000, immutable` is safe specifically because a stale cached response can never silently reflect new content: incrementing `10_ASSETS.version` for a changed Drive file makes every old URL start failing with `409 MEDIA_VERSION_MISMATCH` instead of serving stale bytes, and the frontend (via `buildMediaRef`, unchanged from M03-A) will request the new version's URL instead.
- `private` (never a shared/CDN cache) is correct here since access is owner-session-gated — a shared cache serving one browser's authorized response to another's unauthenticated request would be a real leak.
- **Documented**: changing a Drive file without incrementing the corresponding `10_ASSETS.version` row is an authoring mistake that will make the _old_ cached URL keep serving the _old_ file indefinitely (by design — the cache doesn't know anything changed) rather than silently updating; the Sheet version is the only cache-invalidation signal this backend provides.
- **M03-B2, not built here**: service-worker registration, a browser-side media cache, or any cache-invalidation logic beyond the version-mismatch check above.

## 9. Test totals

**464 unit/integration tests, 42 files, all passing** (`npm run test`):

- `packages/sheet-schema`: 46 tests / 4 files — **unchanged** (no schema changes; all six M03-relevant tabs were already typed as of M01).
- `apps/functions`: **287 tests / 26 files** — up from M03-A's 206/21 (**+81 tests, +5 files**): `byte-range.test.ts` (14), `drive-error-mapper.test.ts` (7), `drive-gateway.test.ts` (10), `media-asset.service.test.ts` (19), `media-api.test.ts` (31).
- `apps/web`: 131 tests / 12 files — **unchanged** (M03-B1 is backend-only; no frontend file was touched).

**Every item in the prompt's required test list (instruction 37) is covered**: GET full response; HEAD without body/download; all three range formats; 416; malformed/multi-range rejection; default/mobile/poster selection; mobile fallback; missing poster; disabled/missing asset; version mismatch; file outside root; shortcut handling; MIME mismatch; forbidden MIME; transient retry and permanent-error no-retry; client disconnect; owner authorization; Admin/owner isolation; no Drive ID/token/credential leakage; no complete audio/video buffering.

**Playwright regression** (`npm run test:e2e`), final clean run: **15 passed, 1 flaky (passed on the suite's existing `retries: 1`), 2 skipped** (credential-gated, `E2E_ADMIN_PASSWORD` not set in this session), 0 hard failures. The one flaky test (`admin-auth.spec.ts`'s first test) is the same pre-existing "cold-start Playwright flake" class already documented and accepted in the M01/M02/M03-A evidence reports (the very first live network call of a run occasionally exceeds the timeout against the real Sheet). Two earlier full-suite runs in this same session additionally hit a transient `response.ok()` failure on the live-Sheet-backed `/api/bootstrap` check — confirmed environmental (no stray competing process was found, and `/api/health`/`/api/bootstrap` code was not touched by this milestone), not a regression: a subsequent clean, isolated re-run of exactly those two spec files passed outright.

## 10. Commands run and results

```text
npm run format           → PASS (auto-fixed formatting-only diffs, no logic changes)
npm run format:check     → PASS
npm run lint              → PASS, 0 errors, 0 warnings
npm run typecheck          → PASS (full monorepo)
npm run test                 → PASS, 464/464 (46 sheet-schema + 287 functions + 131 web)
npm run build                   → PASS
npm run security:scan              → PASSED, 3 files scanned in apps/web/dist, no forbidden content
npm run test:e2e                      → 39 passed, 1 flaky-then-passed, 2 skipped, 0 hard failures
                                         (final clean run; see §9 for the two earlier
                                         environmental flakes and their isolated re-confirmation)
npm run preflight:m03b1                  → PASSED, 6/6, no private value printed (§0)
npm run audit:entry-log-events              → completed, read-only, no row modified (§1)
```

No `firebase deploy` was run. No real media file was downloaded and no live media/log/validation-list mutation occurred — the only live Drive operation performed was the sanitized root-folder metadata preflight (instruction 40), and the only other live operations were read-only Sheet audits.

## 11. Known limitations

- **Drive shortcuts are always rejected (§4)**, not resolved to a proven-safe target. This is the documented, deliberate B1 policy choice the prompt explicitly permits ("prefer a safe rejection with a documented error"); a real Drive asset root should simply avoid shortcuts, or a later milestone can add target-ancestry resolution if that turns out to be needed.
- **`Last-Modified` is not sent.** `10_ASSETS` has no per-row modification timestamp to source it from safely, and Drive's own file-modified time was deliberately not used (it's metadata about the private Drive file, and using it wasn't necessary for correctness here) — `ETag` alone (built only from `assetId`/`version`/`variant`) is the cache-validation signal.
- **The "no full buffering" proof is timing-based** (`media-api.test.ts`, asserting the handler resolves in well under the time a slow fake stream takes to drain) — deterministic in practice given the tiny in-memory fake stream, but timing-sensitive in the same general sense as this codebase's other timing-based tests (e.g. the M02 rate-limit cooldown display test); not flaky in repeated local runs during this session.
- **`10_ASSETS.asset_type` is still a plain text column**, not wired to a controlled list in `packages/sheet-schema` (unchanged from M01) — `isKnownAssetFamily()`'s four-family allowlist is enforced entirely in `media-asset.service.ts`, not by schema-health. A typo'd `asset_type` value fails safely (`MEDIA_UNSUPPORTED_MIME`, default-deny) but won't show up as a schema-health diagnostic pointing at the Sheet row.
- **The corrected `05_ENTRY_LOGS` audit finding (§1)**: the real, ongoing source of the schema-health error count is `language` (`navigator.language`, e.g. `"en-US"`) not matching the app's own five-code `locale` list — not `event_type`, which is fully clean. This count will keep growing under normal real-world use, not just test traffic. Not fixed here (out of scope for a backend Drive-media milestone); flagged for a future small fix to the M02-era logging code or the validation list.
- **No real media asset was required or used** for this checkpoint (instruction: "No real media asset is required"); every test and the live preflight operate on metadata/fixtures only — end-to-end proof against a real image/audio/video file in the actual Drive root is deferred to whichever milestone first needs a real rendered asset.

## 12. Confirmations

- **Only M03-B1 was implemented.** No service-worker registration, browser media cache, cache-invalidation-on-version-change logic beyond the version-mismatch check itself, voice-over player, final production asset, world/story scene, or any M04+ feature was built.
- **No log or validation-list row was changed.** `npm run audit:entry-log-events` is read-only by construction (only `getRawTab` calls, no `updateByPrimaryKey`/`appendRow`/`appendIfAbsent` anywhere in the script or its imports); confirmed by the "No row was modified" line the script itself prints after every run.
- **All accepted M00–M03-A behavior is preserved.** `app.ts`'s only change is one additive `getDriveClient` option (defaulted, so every existing caller is unaffected) and two new route registrations; no existing route, middleware, or session/auth logic was modified. The full regression suite (§9) confirms this.
- **Nothing was committed.** `git status` at the end of this session shows only the new/modified files listed in §2 — no commit was made at any point in this session.
- **No real Gate code, Admin password, session ID, cookie value, private key, Drive file ID, or Google credential was printed, screenshotted, or otherwise exposed** anywhere in this session, including in the two live scripts (§0, §1) and their console output.
