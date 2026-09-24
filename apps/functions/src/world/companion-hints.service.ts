import type { CompanionHintResponse } from '@veoullas-world/contracts';
import { directionFor, pickLocaleRow, usable, type WorldCtx } from './common.js';
import { assertLocationAccess, getJourneyState } from './journey.js';

/**
 * The scripted (non-AI, no API key) companion helper: one authored line for
 * the player's current location and journey state, from `43_COMPANION_HINTS`.
 * Guidance is derived from the *real* server-computed journey state
 * (`getJourneyState`, the same source `assertLocationAccess` and every
 * location view already use), so it can never reference a beat that isn't
 * actually the next eligible action, and never promises a reward — it only
 * ever names a place/action, the reward itself stays server-decided
 * elsewhere. Excluded from the Church location server-side (never just by
 * client cooperation), mirroring the companion sprite's own Church exclusion
 * in `ChurchView.tsx` — the single `/companion/hint` route takes whatever
 * `locationId` the client sends, so this is enforced here, not by trusting
 * the frontend to never ask.
 */
export async function resolveCompanionHint(
  ctx: WorldCtx,
  locationId: string,
  locale: string,
): Promise<CompanionHintResponse> {
  if (locationId === 'church') return { ok: true, hint: null };
  // A hint is a nice-to-have, never a required panel: an inaccessible/unknown location id (a
  // not-yet-reached place, or a location-less transitional view like the Junction) just means
  // silence, not an error surfaced to the player.
  try {
    await assertLocationAccess(ctx, locationId);
  } catch {
    return { ok: true, hint: null };
  }
  const [table, journey] = await Promise.all([
    ctx.gateway.readTab('43_COMPANION_HINTS'),
    getJourneyState(ctx),
  ]);
  const currentBeatId = journey.currentBeat?.beatId ?? null;
  const eligible = table.rows.filter((r) => {
    if (r.values.enabled !== true || r.raw.location_id !== locationId) return false;
    if (r.raw.condition_type === 'always') return true;
    if (r.raw.condition_type === 'story_beat_pending') {
      return usable(r.raw.condition_value) && r.raw.condition_value === currentBeatId;
    }
    return false;
  });
  const byHint = new Map<string, typeof eligible>();
  for (const row of eligible) {
    const id = row.raw.hint_id ?? '';
    const bucket = byHint.get(id);
    if (bucket) bucket.push(row);
    else byHint.set(id, [row]);
  }
  let best: { hintId: string; priority: number; row: (typeof eligible)[number] } | null = null;
  for (const [hintId, rows] of byHint) {
    const picked = pickLocaleRow(
      rows.map((r) => ({ locale: r.raw.locale ?? '', r })),
      locale,
    );
    if (!picked) continue;
    const priority = Number(picked.row.r.raw.priority) || 0;
    if (!best || priority < best.priority || (priority === best.priority && hintId < best.hintId)) {
      best = { hintId, priority, row: picked.row.r };
    }
  }
  if (!best) return { ok: true, hint: null };
  const text = best.row.raw.text ?? '';
  if (!usable(text)) return { ok: true, hint: null };
  const rowLocale = best.row.raw.locale ?? locale;
  return {
    ok: true,
    hint: { hintId: best.hintId, text, direction: directionFor(rowLocale) },
  };
}
