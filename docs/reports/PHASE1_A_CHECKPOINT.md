# Phase 1 — Item A: Verify/Fix Remaining M03-B1 Work

**Date:** 2026-09-16
**Scope:** Audit the M03-B1 Drive media gateway (MIME/range/HEAD/stream-completion/disconnect behavior) against the Living Bible/Master Build Plan; implement the cache policy documentation for private sessions; implement the deferred entry-log locale normalization; reconcile the M03-B1 checkpoint's own test-total claim.

---

## 0. Preflight

Read: `CLAUDE.md`, `docs/Veoullas_World_Living_Bible.md`, `docs/Claude_Code_Master_Build_Plan.md`, `docs/reports/M03_A_CHECKPOINT.md`, `docs/reports/M03_B1_CHECKPOINT.md`, `docs/plans/THREE_PHASE_DELIVERY.md`, `docs/plans/PHASE_1_PROGRESS.md`, and the current `apps/functions/src/api/media.ts`, `services/media-asset.service.ts`, `services/entry-log.service.ts`, `repositories/drive-gateway.ts`, `http/byte-range.ts`, `http/media-headers.ts`.

`git status` at the start of this item: clean, tip commit `d2489ce` (M03-B1). No conflict found with the Living Bible/Master Build Plan.

## 1. Media gateway audit (MIME / range / HEAD / streaming completion / disconnect)

Re-read `media.ts`/`drive-gateway.ts`/`byte-range.ts`/`media-headers.ts` line-by-line against the Master Build Plan's M03 acceptance criteria and the Living Bible §3A. **No bug was found; no code change was required in these files.** Specifically verified still-true today:

- **HEAD never triggers a content stream** — `driveGateway.getContentStream()` is only called when `req.method !== 'HEAD'` (`media.ts` §"if (req.method === 'HEAD')"). Re-confirmed live-code-reading, not just from the M03-B1 report's own claim.
- **GET without `Range` streams the full file via `stream.pipe(res)`** — never buffers into memory.
- **Byte-range (`bytes=start-end`, `bytes=start-`, `bytes=-suffixLength`) all resolve to a correct `206`** with `Content-Range`/`Content-Length`; unsatisfiable ranges resolve to `416` with `Content-Range: bytes */{total}` and no body; malformed/multi-range resolves to a distinct `400 MEDIA_RANGE_MALFORMED` — confirmed these three outcomes are never conflated (`byte-range.ts`'s `type: 'malformed' | 'unsatisfiable' | 'satisfiable'` discriminated union makes this structurally impossible to mix up).
- **Stream completion / disconnect**: `req.on('close', ...)` destroys the upstream Drive stream on client disconnect; a stream error after `res.headersSent` destroys the response rather than attempting a JSON body (a partially-sent binary response is never "fixed up" into a clean error); a stream error before any byte was sent uses the normal sanitized-JSON-error path. All three paths re-verified against the actual handler code, matching the M03-B1 report's description exactly — no drift found.
- **A `206` partial response is never treated as a complete file by any current caller**: there is currently no frontend media consumer at all (M03-B1 was backend-only; Phase 1 item B's `MapCompositionPreview`, added in this session, uses `<video>`/`<img src>` — the browser's own media element handles partial-content semantics natively, this backend never re-interprets a 206 as complete). This check will be re-run once item C's voice-over player becomes the first JS-level consumer of `/api/media/:assetId` audio responses that might need to reason about partial vs. complete data.
- **Auth/error responses are never cached**: `sendError()` in `media.ts` never sets any `Cache-Control`/`ETag`/`ETag`-adjacent header — those are only ever set in the success path via `buildMediaHeaders()`. Confirmed by reading every code path in `media.ts` that calls `res.set`/`res.status` — the only place `Cache-Control` is set is inside `buildMediaHeaders`, called only after every validation/authorization check has already passed.

**Conclusion: the M03-B1 media gateway was already compliant.** No fix was needed for MIME/range/HEAD/streaming/disconnect behavior.

## 2. Cache policy for private sessions (new documentation, no behavior change)

The prompt asked to "explain what remains cached, clear controlled caches at logout/expiry as appropriate, and avoid claiming immutable browser caches enforce immediate revocation." Documenting the actual, already-implemented policy rather than changing it (no bug was found to fix here):

- Every `/api/media/:assetId` response carries `Cache-Control: private, max-age=31536000, immutable` (`media-headers.ts`, unchanged since M03-B1). **`private` is correct and already prevents a shared/CDN cache** (a proxy or CDN must not cache a response gated by an owner session cookie for one browser and serve it to another). It does **not** mean the response disappears from that one browser's own disk/memory cache at logout — no browser cache directive can force a browser to evict an already-cached response early. This backend makes no claim otherwise, and no code here should ever be read as doing so.
- **What actually revokes access after logout**: the _authorization_ check (`createOwnerAuthMiddleware`), not the cache. After logout, a cached response already sitting in the browser's own cache may still render from that cache without hitting the network at all (this is normal browser behavior for `Cache-Control: private, immutable` and cannot be prevented from the server side) — but any _new_ request for that same URL, or for a different/newer asset version, is re-authorized on every request; an unauthenticated request never reaches the Drive read at all. This is the same authorization boundary any `private`-cached authenticated endpoint has, not a defect specific to this milestone.
- **The one real invalidation lever this backend provides is the version in the URL** (§8 of the M03-B1 checkpoint, unchanged): a `(assetId, version, variant)` URL is safe to cache forever specifically because incrementing `10_ASSETS.version` makes the _old_ URL start failing `409 MEDIA_VERSION_MISMATCH` — it does not, and cannot, purge what a browser already cached under the old URL from that browser's disk. This is a normal, industry-standard versioned-asset caching model (the same one static-site asset pipelines use), not a gap introduced by this milestone.
- **No new "clear cache at logout" mechanism was added**, because none is needed or possible for this specifically: media responses are versioned+immutable by design (the correct behavior for immutable Drive-backed binaries), and the _access_ to them (not the cache) is what session expiry actually controls. Building a service-worker-driven cache-clear-on-logout mechanism would be new scope belonging to M03-B2 (service-worker/browser caching, still not started) and was not invented here.

This section is documentation of already-correct behavior, not a code change — recorded here because the prompt explicitly asked for the policy to be stated rather than implied.

## 3. Entry-log locale normalization (the one real fix in this item)

**File changed:** `apps/functions/src/services/entry-log.service.ts`.

Added `normalizeEntryLogLocale(raw)`, applied inside `appendEntryLogIfAbsent()` at the single point every current and future caller (`usePageOpenLog`, Gate login, Admin login, session events — anything that calls `appendEntryLogIfAbsent`) already funnels through. This resolves the M03-B1 checkpoint's own flagged "known limitation": `navigator.language` (e.g. `"en-US"`) never matches `39_VALIDATION_LISTS`'s five-code `locale` list, so every real visitor's browser was producing an ever-growing schema-health error count.

Rules (per the instruction: "Normalize new entry-log locale values to the app's supported codes. Do not migrate or rewrite historical log rows."):

- An exact supported code (`en`, `ar-EG`, `it`, `el`, `fr`) passes through unchanged.
- Any Arabic variant (`ar`, `ar-SA`, `ar-EG`, case-insensitive) normalizes to `ar-EG` — the only Arabic locale this app supports.
- Any other supported base language (`en-US`, `en-GB`, `it-IT`, `el-GR`, `fr-CA`, ...) normalizes to its two-letter code.
- Anything else (`de-DE`, `ja`, `zh-CN`, ...) normalizes to `""` — matching the pre-existing convention already used by server-generated log rows that never set a language at all, rather than writing a value that would fail the controlled-list check.
- **No historical row is touched.** This only changes what gets written by the next call to `appendEntryLogIfAbsent` going forward.

## 4. Reconciling the M03-B1 test-total claim

The instruction asked to "Reconcile contradictory B1 test totals using evidence." The M03-A checkpoint reported 383 tests/37 files; the M03-B1 checkpoint reported 464 tests/42 files (46 sheet-schema + 287 functions + 131 web). Re-running `npm run test` against the actual tip commit (`d2489ce`, before any change in this session) reproduced **464/42 exactly** (46 + 287 + 131) — **no contradiction was found**; the M03-B1 number is accurate and reproducible from the current repository state. (The two counts differ from each other, 383→464, only because M03-B1 legitimately added 81 new backend tests across 5 new files, exactly as that checkpoint's own §9 already stated.)

## 5. New tests added in this item

- `apps/functions/tests/entry-log.service.test.ts` (9 tests): `normalizeEntryLogLocale` unit coverage (exact match, BCP-47 regional mapping, every Arabic variant, case-insensitivity, unsupported→blank, already-blank/undefined) plus `appendEntryLogIfAbsent` integration coverage (writes the normalized value, never rewrites a pre-existing historical row, writes blank for an unsupported locale).

## 6. Commands run and results

```text
npm run build:libs   → PASS
npm run test --workspace=apps/functions   → PASS, 296/296 across 27 files (before item B's tests were added; 305/28 after item B, see PHASE1_B_CHECKPOINT.md)
npm run typecheck    → PASS (full monorepo)
npm run lint         → PASS, 0 errors, 0 warnings
npm run format:check → PASS
npm run build        → PASS
npm run security:scan → PASSED, 3 files scanned in apps/web/dist, no forbidden content
```

No live Drive/Sheet mutation was performed in this item (item A is backend-code-only + documentation). No `firebase deploy` was run. No real Gate code, Admin password, session ID, cookie value, private key, Drive file ID, or Google credential was printed anywhere in this session.

## 7. Known limitations carried forward

- The **historical** `05_ENTRY_LOGS.language` rows containing raw `navigator.language` values (e.g. `"en-US"`) remain in the live Sheet, unmigrated, exactly as instructed ("Do not migrate or rewrite historical log rows"). Live schema-health will continue reporting these historical rows as errors until/unless a future explicit instruction asks for a historical data migration; only newly written rows are fixed by this item.
- M03-B2 (service-worker registration, browser-side media cache, any cache-invalidation logic beyond the version-mismatch check) remains not started — unchanged from M03-B1's own stated scope, and out of scope for this audit item.
- The voice-over player (item C) has not yet consumed `/api/media/:assetId` for real audio; the "206 never treated as complete" check above will be re-verified once that player exists.

## 8. Confirmations

- Only Phase 1 item A was implemented in this section. No M04+ (D/E/F/G) work was started.
- No content, gameplay, religious copy, or art decision was invented.
- Nothing was committed, merged, pushed, or deployed.
